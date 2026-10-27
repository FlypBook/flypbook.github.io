-- FlypBook: Scroll Like Shakespeare
-- Quiz scoring, points, streaks, adaptive reading level, and generator stats.
-- Paste into Supabase > SQL Editor and click Run (once).

-- Answer a story's comprehension question (logged-in readers).
-- Scores once per story: +10 points for a correct answer, +5 bonus at a 3+ day streak.
-- Streak = days in a row with at least one correct answer.
-- Reading level drifts up a little with each correct answer and down a bit less with misses.
create or replace function public.submit_answer(p_story uuid, p_choice int)
returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ans record;
  prof record;
  prev record;
  is_correct boolean;
  gained int := 0;
  today date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'Not logged in'; end if;
  select answer_index, explanation into ans from public.story_answers where story_id = p_story;
  if not found then raise exception 'No question for this story'; end if;

  select * into prev from public.answers where user_id = uid and story_id = p_story;
  if found then
    select points, current_streak, reading_level into prof from public.profiles where id = uid;
    return json_build_object('correct', prev.correct, 'answer_index', ans.answer_index, 'explanation', ans.explanation,
      'already', true, 'gained', 0, 'points', prof.points, 'streak', prof.current_streak, 'level', prof.reading_level);
  end if;

  is_correct := (p_choice = ans.answer_index);
  insert into public.answers (user_id, story_id, choice, correct) values (uid, p_story, p_choice, is_correct);

  select * into prof from public.profiles where id = uid for update;
  if is_correct then
    if prof.last_streak_date = today then
      null;                                            -- already counted today
    elsif prof.last_streak_date = today - 1 then
      prof.current_streak := prof.current_streak + 1;
    else
      prof.current_streak := 1;
    end if;
    gained := 10 + case when prof.current_streak >= 3 then 5 else 0 end;
    update public.profiles set
      points = points + gained,
      current_streak = prof.current_streak,
      longest_streak = greatest(longest_streak, prof.current_streak),
      last_streak_date = today,
      reading_level = least(3, reading_level + 0.06)
    where id = uid;
  else
    update public.profiles set reading_level = greatest(1, reading_level - 0.03) where id = uid;
  end if;

  select points, current_streak, reading_level into prof from public.profiles where id = uid;
  return json_build_object('correct', is_correct, 'answer_index', ans.answer_index, 'explanation', ans.explanation,
    'already', false, 'gained', gained, 'points', prof.points, 'streak', prof.current_streak, 'level', prof.reading_level);
end $$;
revoke execute on function public.submit_answer(uuid, int) from public, anon;
grant execute on function public.submit_answer(uuid, int) to authenticated;

-- Guests can still try the question: check an answer without saving anything.
create or replace function public.check_answer(p_story uuid, p_choice int)
returns json
language sql security definer set search_path = '' stable as $$
  select json_build_object('correct', p_choice = answer_index, 'answer_index', answer_index, 'explanation', explanation)
  from public.story_answers where story_id = p_story;
$$;
grant execute on function public.check_answer(uuid, int) to anon, authenticated;

-- What readers love lately, for the story generator to make more of (secret key only).
-- Score per genre/tone: likes x3 + finishes x2 + shares x4 + correct answers x1, last 30 days,
-- divided by how many stories of that kind exist (so popular kinds aren't just common kinds).
create or replace function public.tag_popularity()
returns table (genre text, tone text, stories bigint, score numeric)
language sql security definer set search_path = '' stable as $$
  with recent as (select id, genre, tone from public.stories where status = 'published' and created_at > now() - interval '30 days'),
  signals as (
    select r.genre, r.tone,
      (select count(*) from public.likes l where l.story_id = r.id) * 3
      + (select count(*) from public.story_events e where e.story_id = r.id and e.event = 'finish') * 2
      + (select count(*) from public.story_events e where e.story_id = r.id and e.event = 'share') * 4
      + (select count(*) from public.answers a where a.story_id = r.id and a.correct) as pts
    from recent r)
  select genre, tone, count(*) as stories, round(sum(pts)::numeric / count(*), 2) as score
  from signals group by genre, tone order by score desc;
$$;
revoke execute on function public.tag_popularity() from public, anon, authenticated;

-- Let each reader see whether they've already reported a story (to show "Reported").
create policy "read own reports" on public.reports for select to authenticated using (user_id = auth.uid());
