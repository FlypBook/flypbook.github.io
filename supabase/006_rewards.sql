-- FlypBook: Scroll Like Shakespeare
-- Rewards: XP (stored in profiles.points), a daily goal with a streak, streak freezes, and quiz combos.
-- Paste into Supabase > SQL Editor and Run (once).
--
-- How XP is earned (each at most once per story, so it can't be farmed):
--   finish a story +20 · right answer +15 (x2 on a 3-in-a-row combo) · daily goal reached +30
--   like +2 · comment +5 (likes and comments capped at 60 XP a day each)
-- The streak now counts days you reach your daily goal (finished stories). Every 7 days in a row
-- earns a streak freeze (max 2), which saves the streak if you miss exactly one day.

alter table public.profiles
  add column if not exists daily_goal int not null default 3 check (daily_goal between 1 and 20),
  add column if not exists streak_freezes int not null default 0 check (streak_freezes between 0 and 2);
grant update (daily_goal) on public.profiles to authenticated;

create table if not exists public.xp_events (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  kind text not null check (kind in ('finish', 'like', 'comment', 'correct')),
  xp int not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, story_id, kind)
);
create index if not exists xp_events_day_idx on public.xp_events (user_id, day, kind);
alter table public.xp_events enable row level security;
create policy "read own xp" on public.xp_events for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.xp_events from anon, authenticated;

-- "Today" in the reader's own time zone (so the streak really ends at their midnight).
create or replace function public.local_day(p_tz text) returns date
language sql stable set search_path = '' as $$
  select (now() at time zone coalesce((select name from pg_catalog.pg_timezone_names where name = p_tz limit 1), 'UTC'))::date;
$$;

-- Everything the progress ring and page need.
create or replace function public.progress_json(p_user uuid, p_day date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'xp', p.points, 'goal', p.daily_goal, 'freezes', p.streak_freezes, 'best', p.longest_streak,
    'today', (select count(*) from public.xp_events e where e.user_id = p.id and e.day = p_day and e.kind = 'finish'),
    'goal_done', p.last_streak_date = p_day,
    -- a streak still counts if the goal was met today or yesterday (or the day before, with a freeze to spend)
    'streak', case when p.last_streak_date >= p_day - 1 then p.current_streak
                   when p.last_streak_date = p_day - 2 and p.streak_freezes > 0 then p.current_streak
                   else 0 end)
  from public.profiles p where p.id = p_user;
$$;
revoke execute on function public.progress_json(uuid, date) from public, anon, authenticated;

create or replace function public.my_progress(p_tz text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.progress_json(auth.uid(), public.local_day(p_tz));
$$;
revoke execute on function public.my_progress(text) from public, anon;
grant execute on function public.my_progress(text) to authenticated;

create or replace function public.award_xp(p_story uuid, p_kind text, p_tz text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  d date := public.local_day(p_tz);
  amount int;
  added int;
  bonus int := 0;
  goal_hit boolean := false;
  done_today int;
  prof record;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  amount := case p_kind when 'finish' then 20 when 'like' then 2 when 'comment' then 5 end;
  if amount is null then raise exception 'Unknown reward'; end if;
  if not exists (select 1 from public.stories where id = p_story and status = 'published') then raise exception 'Story not found'; end if;
  -- likes and comments: at most 60 XP a day each
  if p_kind <> 'finish' and (select coalesce(sum(xp), 0) from public.xp_events where user_id = uid and day = d and kind = p_kind) >= 60 then
    amount := 0;
  end if;
  insert into public.xp_events (user_id, story_id, kind, xp, day) values (uid, p_story, p_kind, amount, d) on conflict do nothing;
  get diagnostics added = row_count;
  if added = 0 then amount := 0; end if;

  select * into prof from public.profiles where id = uid for update;
  if added = 1 and p_kind = 'finish' then
    select count(*) into done_today from public.xp_events where user_id = uid and day = d and kind = 'finish';
    if done_today >= prof.daily_goal and prof.last_streak_date is distinct from d then
      goal_hit := true;
      bonus := 30;
      if prof.last_streak_date = d - 1 then
        prof.current_streak := prof.current_streak + 1;
      elsif prof.last_streak_date = d - 2 and prof.streak_freezes > 0 then
        prof.current_streak := prof.current_streak + 1;          -- a freeze covers the one missed day
        prof.streak_freezes := prof.streak_freezes - 1;
      else
        prof.current_streak := 1;
      end if;
      if prof.current_streak % 7 = 0 then prof.streak_freezes := least(2, prof.streak_freezes + 1); end if;
      update public.profiles set current_streak = prof.current_streak, longest_streak = greatest(longest_streak, prof.current_streak),
        last_streak_date = d, streak_freezes = prof.streak_freezes where id = uid;
    end if;
  end if;
  update public.profiles set points = points + amount + bonus where id = uid;
  return public.progress_json(uid, d) || jsonb_build_object('gained', amount + bonus, 'goal_hit', goal_hit);
end $$;
revoke execute on function public.award_xp(uuid, text, text) from public, anon;
grant execute on function public.award_xp(uuid, text, text) to authenticated;

-- Quiz answers: +15 XP when right, doubled on a 3-in-a-row combo. (The streak moved to the daily goal.)
create or replace function public.submit_answer(p_story uuid, p_choice int)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ans record;
  prev record;
  prof record;
  is_correct boolean;
  run int := 0;
  r record;
  gained int := 0;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  select answer_index, explanation into ans from public.story_answers where story_id = p_story;
  if not found then raise exception 'No question for this story'; end if;

  select * into prev from public.answers where user_id = uid and story_id = p_story;
  if found then
    select points, current_streak, reading_level into prof from public.profiles where id = uid;
    return json_build_object('correct', prev.correct, 'answer_index', ans.answer_index, 'explanation', ans.explanation,
      'already', true, 'gained', 0, 'combo', 0, 'points', prof.points, 'streak', prof.current_streak, 'level', prof.reading_level);
  end if;

  is_correct := (p_choice = ans.answer_index);
  if is_correct then
    -- how many right answers in a row before this one
    for r in select correct from public.answers where user_id = uid order by answered_at desc limit 10 loop
      exit when not r.correct;
      run := run + 1;
    end loop;
    run := run + 1;
    gained := 15 * case when run >= 3 then 2 else 1 end;
  end if;
  insert into public.answers (user_id, story_id, choice, correct) values (uid, p_story, p_choice, is_correct);
  if is_correct then
    insert into public.xp_events (user_id, story_id, kind, xp, day) values (uid, p_story, 'correct', gained, current_date) on conflict do nothing;
    update public.profiles set points = points + gained, reading_level = least(3, reading_level + 0.06) where id = uid;
  else
    update public.profiles set reading_level = greatest(1, reading_level - 0.03) where id = uid;
  end if;

  select points, current_streak, reading_level into prof from public.profiles where id = uid;
  return json_build_object('correct', is_correct, 'answer_index', ans.answer_index, 'explanation', ans.explanation,
    'already', false, 'gained', gained, 'combo', case when is_correct then run else 0 end,
    'points', prof.points, 'streak', prof.current_streak, 'level', prof.reading_level);
end $$;
revoke execute on function public.submit_answer(uuid, int) from public, anon;
grant execute on function public.submit_answer(uuid, int) to authenticated;

-- Show everyone's level (from XP) next to their name.
create or replace view public.public_profiles as
  select id, username, display_name, case when avatar_hidden then null else avatar_url end as avatar_url, profile_color, points
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

create or replace view public.comment_feed as
  select c.id, c.story_id, c.user_id, c.body, c.created_at, p.username,
    p.display_name, case when p.avatar_hidden then null else p.avatar_url end as avatar_url, p.profile_color, p.points
  from public.comments c join public.profiles p on p.id = c.user_id
  where not c.hidden;
grant select on public.comment_feed to anon, authenticated;
