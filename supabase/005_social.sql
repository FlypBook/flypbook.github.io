-- FlypBook: Scroll Like Shakespeare
-- Friends and following, posting your own stories, profile pictures, profile customization,
-- synced settings, and the For You "taste" model. Paste into Supabase > SQL Editor and Run (once).

-- ---------------------------------------------------------------------------
-- Profiles: customization, privacy, synced settings and taste
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name text check (char_length(display_name) <= 30),
  add column if not exists bio text check (char_length(bio) <= 160),
  add column if not exists pronouns text check (char_length(pronouns) <= 20),
  add column if not exists avatar_url text,
  add column if not exists avatar_hidden boolean not null default false,
  add column if not exists profile_color text not null default '#8b5cf6' check (profile_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists who_can_follow text not null default 'everyone' check (who_can_follow in ('everyone', 'nobody')),
  add column if not exists activity_visibility text not null default 'friends' check (activity_visibility in ('everyone', 'friends', 'nobody')),
  add column if not exists settings jsonb not null default '{}',
  add column if not exists taste jsonb not null default '{}';
grant update (display_name, bio, pronouns, avatar_url, profile_color, who_can_follow, activity_visibility, settings, taste)
  on public.profiles to authenticated;

-- Checks on every profile change: clean words, no links, pictures only from FlypBook's own storage.
create or replace function public.check_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.display_name := nullif(btrim(new.display_name), '');
  new.bio := nullif(btrim(new.bio), '');
  new.pronouns := nullif(btrim(new.pronouns), '');
  if new.avatar_url is not null and new.avatar_url !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
      || new.id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Profile pictures must be uploaded in the app.';
  end if;
  if (new.display_name, new.bio, new.pronouns) is distinct from (old.display_name, old.bio, old.pronouns)
     and exists (select 1 from public.blocked_words w
                 where position(w.word in lower(concat_ws(' ', new.display_name, new.bio, new.pronouns))) > 0) then
    raise exception 'Please keep your profile kind and clean.';
  end if;
  if concat_ws(' ', new.display_name, new.bio) ~* '(https?://|www\.)' then
    raise exception 'Links aren''t allowed on profiles.';
  end if;
  if new.avatar_url is distinct from old.avatar_url then new.avatar_hidden := false; end if;  -- a new picture gets a fresh start
  if octet_length(new.taste::text) > 60000 or octet_length(new.settings::text) > 8000 then
    raise exception 'Too much saved data.';
  end if;
  return new;
end $$;
drop trigger if exists before_profile_update on public.profiles;
create trigger before_profile_update before update on public.profiles
  for each row execute function public.check_profile_update();

-- ---------------------------------------------------------------------------
-- Profile pictures: a public storage bucket. Each person can only write inside their own folder.
-- Pictures are shrunk to 256x256 in the app before uploading, so the 300 KB cap is plenty.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 300000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "read own avatar files" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Reporting a picture hides it right away (set avatar_hidden = false in the Table Editor to restore).
create table public.avatar_reports (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles (id) on delete set null,
  avatar_url text,
  created_at timestamptz not null default now(),
  unique (profile_id, user_id, avatar_url)
);
alter table public.avatar_reports enable row level security;
create policy "report pictures as yourself" on public.avatar_reports for insert to authenticated with check (user_id = auth.uid());

create function public.hide_reported_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set avatar_hidden = true where id = new.profile_id;
  return null;
end $$;
create function public.stamp_avatar_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select avatar_url into new.avatar_url from public.profiles where id = new.profile_id;
  new.created_at := now();
  return new;
end $$;
create trigger before_avatar_report before insert on public.avatar_reports
  for each row execute function public.stamp_avatar_report();
create trigger on_avatar_report after insert on public.avatar_reports
  for each row execute function public.hide_reported_avatar();

-- ---------------------------------------------------------------------------
-- Notifications: more kinds, plus who caused them
-- ---------------------------------------------------------------------------
alter table public.notifications add column if not exists actor_id uuid references public.profiles (id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'story_ready', 'request_rejected', 'request_failed', 'new_follower', 'new_friend', 'story_sent',
  'post_approved', 'post_rejected', 'friend_posted'));

-- Does this person want this kind of notification? (Settings > Notifications; on by default.)
create function public.wants(p_user uuid, p_key text) returns boolean
language sql security definer set search_path = '' stable as $$
  select coalesce((select (settings ->> p_key)::boolean from public.profiles where id = p_user), true);
$$;
revoke execute on function public.wants(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Blocking: hides people from each other and removes follows both ways
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create policy "read own blocks" on public.blocks for select to authenticated using (blocker = auth.uid());
create policy "block as yourself" on public.blocks for insert to authenticated with check (blocker = auth.uid());
create policy "unblock as yourself" on public.blocks for delete to authenticated using (blocker = auth.uid());

-- ---------------------------------------------------------------------------
-- Following. Following each other = friends.
-- ---------------------------------------------------------------------------
create table public.follows (
  follower uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index follows_followee_idx on public.follows (followee);
alter table public.follows enable row level security;
create policy "read follows" on public.follows for select to authenticated
  using (follower = auth.uid() or followee = auth.uid());
create policy "follow as yourself" on public.follows for insert to authenticated with check (follower = auth.uid());
-- Unfollow someone, or remove one of your followers.
create policy "unfollow or remove follower" on public.follows for delete to authenticated
  using (follower = auth.uid() or followee = auth.uid());

create function public.check_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  open_to text;
  recent int;
begin
  select who_can_follow into open_to from public.profiles where id = new.followee;
  if not found then raise exception 'That account doesn''t exist.'; end if;
  if exists (select 1 from public.blocks where (blocker = new.followee and blocked = new.follower)
                                            or (blocker = new.follower and blocked = new.followee)) then
    raise exception 'You can''t follow this person.';
  end if;
  -- "Nobody" still lets people you follow follow you back (so you can still make friends).
  if open_to = 'nobody' and not exists (select 1 from public.follows where follower = new.followee and followee = new.follower) then
    raise exception 'This person isn''t accepting new followers.';
  end if;
  select count(*) into recent from public.follows where follower = new.follower and created_at > now() - interval '1 day';
  if recent >= 200 then raise exception 'You''ve followed a lot of people today. Try again tomorrow.'; end if;
  new.created_at := now();
  return new;
end $$;
create trigger before_follow before insert on public.follows
  for each row execute function public.check_follow();

create function public.notify_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who text;
  mutual boolean;
begin
  select username into who from public.profiles where id = new.follower;
  mutual := exists (select 1 from public.follows where follower = new.followee and followee = new.follower);
  -- One notification per person per day, so unfollow/refollow can't spam anyone.
  if public.wants(new.followee, 'notify_follows') and not exists (
      select 1 from public.notifications where user_id = new.followee and actor_id = new.follower
        and type in ('new_follower', 'new_friend') and created_at > now() - interval '1 day') then
    insert into public.notifications (user_id, actor_id, type, message) values (new.followee, new.follower,
      case when mutual then 'new_friend' else 'new_follower' end,
      case when mutual then '@' || who || ' followed you back. You''re friends now!'
           else '@' || who || ' followed you. Follow back to be friends.' end);
  end if;
  return null;
end $$;
create trigger on_follow after insert on public.follows
  for each row execute function public.notify_follow();

create function public.unfollow_on_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows where (follower = new.blocker and followee = new.blocked)
                                or (follower = new.blocked and followee = new.blocker);
  return null;
end $$;
create trigger on_block after insert on public.blocks
  for each row execute function public.unfollow_on_block();

-- ---------------------------------------------------------------------------
-- Posting your own stories. Posts wait in a queue; the AI checks them for safety (every 30 minutes),
-- adds a quiz question, and publishes them credited to you.
-- ---------------------------------------------------------------------------
alter table public.app_settings add column if not exists daily_post_limit int not null default 3;

alter table public.stories drop constraint if exists stories_ai_generated_check;
alter table public.stories
  add column if not exists author_id uuid references public.profiles (id) on delete cascade,
  add column if not exists source text not null default 'ai' check (source in ('ai', 'user'));
create index if not exists stories_author_idx on public.stories (author_id, created_at desc) where status = 'published';

create table public.story_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  body text not null check (char_length(btrim(body)) between 600 and 16000),
  genre text,
  tone text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'approved', 'rejected', 'failed')),
  reason text,
  story_id uuid references public.stories (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index story_submissions_queue_idx on public.story_submissions (status, created_at);
alter table public.story_submissions enable row level security;
create policy "read own posts" on public.story_submissions for select to authenticated using (user_id = auth.uid());
create policy "post as yourself" on public.story_submissions for insert to authenticated with check (user_id = auth.uid());
create policy "delete own posts" on public.story_submissions for delete to authenticated using (user_id = auth.uid());
revoke update on public.story_submissions from anon, authenticated;

create function public.check_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  daily_limit int;
  used int;
begin
  select daily_post_limit into daily_limit from public.app_settings;
  select count(*) into used from public.story_submissions where user_id = new.user_id and created_at > now() - interval '1 day';
  if used >= daily_limit then raise exception 'You can post % stories a day. Try again tomorrow!', daily_limit; end if;
  new.title := btrim(new.title);
  new.body := btrim(new.body);
  if new.body ~* '(https?://|www\.)' then raise exception 'Links aren''t allowed in stories.'; end if;
  new.status := 'pending';
  new.reason := null;
  new.story_id := null;
  new.processed_at := null;
  new.created_at := now();
  return new;
end $$;
create trigger before_submission_insert before insert on public.story_submissions
  for each row execute function public.check_submission();

-- Take down one of your own published stories.
create function public.delete_my_story(p_story uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.stories set status = 'removed' where id = p_story and author_id = auth.uid();
  if not found then raise exception 'You can only delete your own stories.'; end if;
end $$;
revoke execute on function public.delete_my_story(uuid) from public, anon;
grant execute on function public.delete_my_story(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sending a story to a friend
-- ---------------------------------------------------------------------------
create table public.story_shares (
  id bigint generated always as identity primary key,
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.story_shares enable row level security;
create policy "read own sends" on public.story_shares for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
create policy "send as yourself" on public.story_shares for insert to authenticated with check (from_user = auth.uid());

create function public.check_story_share() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recent int;
  who text;
  what text;
begin
  if not (exists (select 1 from public.follows where follower = new.from_user and followee = new.to_user)
      and exists (select 1 from public.follows where follower = new.to_user and followee = new.from_user)) then
    raise exception 'You can only send stories to friends.';
  end if;
  select count(*) into recent from public.story_shares where from_user = new.from_user and created_at > now() - interval '1 day';
  if recent >= 50 then raise exception 'You''ve sent a lot of stories today. Try again tomorrow.'; end if;
  new.created_at := now();
  if public.wants(new.to_user, 'notify_sends') then
    select username into who from public.profiles where id = new.from_user;
    select title into what from public.stories where id = new.story_id;
    insert into public.notifications (user_id, actor_id, type, story_id, message)
    values (new.to_user, new.from_user, 'story_sent', new.story_id, '@' || who || ' sent you "' || what || '"');
  end if;
  return new;
end $$;
create trigger before_story_share before insert on public.story_shares
  for each row execute function public.check_story_share();

-- ---------------------------------------------------------------------------
-- Reading other people's profiles (only public fields; blocked people see nothing)
-- ---------------------------------------------------------------------------
-- Public names and pictures (for story credits, comments and notifications).
create view public.public_profiles as
  select id, username, display_name, case when avatar_hidden then null else avatar_url end as avatar_url, profile_color
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

create or replace view public.comment_feed as
  select c.id, c.story_id, c.user_id, c.body, c.created_at, p.username,
    p.display_name, case when p.avatar_hidden then null else p.avatar_url end as avatar_url, p.profile_color
  from public.comments c join public.profiles p on p.id = c.user_id
  where not c.hidden;
grant select on public.comment_feed to anon, authenticated;

create function public.profile_card(p_username text) returns json
language plpgsql security definer set search_path = '' stable as $$
declare
  p record;
  me uuid := auth.uid();
  i_follow boolean;
  follows_me boolean;
begin
  select * into p from public.profiles where lower(username) = lower(p_username);
  if not found then return null; end if;
  if me is not null and exists (select 1 from public.blocks where blocker = p.id and blocked = me) then return null; end if;
  i_follow := exists (select 1 from public.follows where follower = me and followee = p.id);
  follows_me := exists (select 1 from public.follows where follower = p.id and followee = me);
  return json_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name, 'bio', p.bio, 'pronouns', p.pronouns,
    'avatar_url', case when p.avatar_hidden then null else p.avatar_url end, 'profile_color', p.profile_color,
    'points', p.points, 'current_streak', p.current_streak, 'longest_streak', p.longest_streak, 'joined', p.created_at,
    'followers', (select count(*) from public.follows where followee = p.id),
    'following', (select count(*) from public.follows where follower = p.id),
    'friends', (select count(*) from public.follows a join public.follows b on b.follower = a.followee and b.followee = a.follower
                where a.follower = p.id),
    'posts', (select count(*) from public.stories where author_id = p.id and status = 'published'),
    'is_me', p.id = me, 'i_follow', i_follow, 'follows_me', follows_me,
    'blocked', exists (select 1 from public.blocks where blocker = me and blocked = p.id),
    'can_follow', p.who_can_follow = 'everyone' or follows_me,
    'activity_visible', p.id = me or p.activity_visibility = 'everyone'
                        or (p.activity_visibility = 'friends' and i_follow and follows_me));
end $$;
grant execute on function public.profile_card(text) to anon, authenticated;

-- Followers / following / friends lists.
create function public.social_list(p_user uuid, p_kind text)
returns table (id uuid, username text, display_name text, avatar_url text, profile_color text, i_follow boolean)
language sql security definer set search_path = '' stable as $$
  with ids as (
    select followee as uid from public.follows where follower = p_user and p_kind = 'following'
    union select follower from public.follows where followee = p_user and p_kind = 'followers'
    union select a.followee from public.follows a
      join public.follows b on b.follower = a.followee and b.followee = a.follower
      where a.follower = p_user and p_kind = 'friends')
  select p.id, p.username, p.display_name, case when p.avatar_hidden then null else p.avatar_url end, p.profile_color,
    exists (select 1 from public.follows f where f.follower = auth.uid() and f.followee = p.id)
  from ids join public.profiles p on p.id = ids.uid
  where not exists (select 1 from public.blocks b where b.blocker = p.id and b.blocked = auth.uid())
  order by lower(p.username) limit 500;
$$;
revoke execute on function public.social_list(uuid, text) from public, anon;
grant execute on function public.social_list(uuid, text) to authenticated;

-- Find people by username or display name.
create function public.search_users(q text)
returns table (id uuid, username text, display_name text, avatar_url text, profile_color text, i_follow boolean)
language sql security definer set search_path = '' stable as $$
  select p.id, p.username, p.display_name, case when p.avatar_hidden then null else p.avatar_url end, p.profile_color,
    exists (select 1 from public.follows f where f.follower = auth.uid() and f.followee = p.id)
  from public.profiles p
  where char_length(btrim(q)) >= 2 and p.id <> auth.uid()
    and (strpos(lower(p.username), lower(btrim(q))) > 0 or strpos(lower(coalesce(p.display_name, '')), lower(btrim(q))) > 0)
    and not exists (select 1 from public.blocks b where b.blocker = p.id and b.blocked = auth.uid())
  order by strpos(lower(p.username), lower(btrim(q))), lower(p.username) limit 20;
$$;
revoke execute on function public.search_users(text) from public, anon;
grant execute on function public.search_users(text) to authenticated;

-- People you may know: followed by people you follow, then active readers.
create function public.suggest_users()
returns table (id uuid, username text, display_name text, avatar_url text, profile_color text, i_follow boolean)
language sql security definer set search_path = '' stable as $$
  with mine as (select followee from public.follows where follower = auth.uid()),
  fof as (select f.followee as uid, count(*) as n from public.follows f join mine on mine.followee = f.follower
          group by f.followee)
  select p.id, p.username, p.display_name, case when p.avatar_hidden then null else p.avatar_url end, p.profile_color, false
  from public.profiles p left join fof on fof.uid = p.id
  where p.id <> auth.uid() and p.who_can_follow = 'everyone'
    and p.id not in (select followee from mine)
    and not exists (select 1 from public.blocks b where (b.blocker = p.id and b.blocked = auth.uid())
                                                   or (b.blocker = auth.uid() and b.blocked = p.id))
  order by coalesce(fof.n, 0) desc, p.points desc limit 12;
$$;
revoke execute on function public.suggest_users() from public, anon;
grant execute on function public.suggest_users() to authenticated;

-- The Friends feed: stories posted by people you follow, and stories they liked
-- (only if they share their activity with you).
create function public.friend_feed(p_limit int default 60)
returns table (story_id uuid, reason text, username text, at timestamptz)
language sql security definer set search_path = '' stable as $$
  with mine as (select followee from public.follows where follower = auth.uid()),
  visible as (
    select p.id, p.username from public.profiles p join mine on mine.followee = p.id
    where p.activity_visibility = 'everyone'
       or (p.activity_visibility = 'friends'
           and exists (select 1 from public.follows f where f.follower = p.id and f.followee = auth.uid()))),
  events as (
    select s.id as story_id, 'posted' as reason, p.username, s.created_at as at
      from public.stories s join mine on mine.followee = s.author_id join public.profiles p on p.id = s.author_id
      where s.status = 'published'
    union all
    select l.story_id, 'liked', v.username, l.created_at
      from public.likes l join visible v on v.id = l.user_id
      join public.stories s on s.id = l.story_id and s.status = 'published'),
  ranked as (select *, row_number() over (partition by events.story_id order by events.at desc) as rn from events)
  select story_id, reason, username, at from ranked where rn = 1 order by at desc limit least(p_limit, 200);
$$;
revoke execute on function public.friend_feed(int) from public, anon;
grant execute on function public.friend_feed(int) to authenticated;

-- What someone liked lately (only if they share their activity with you).
create function public.user_likes(p_user uuid)
returns table (story_id uuid, title text, genre text, at timestamptz)
language sql security definer set search_path = '' stable as $$
  select s.id, s.title, s.genre, l.created_at
  from public.likes l join public.stories s on s.id = l.story_id and s.status = 'published'
  join public.profiles p on p.id = l.user_id
  where l.user_id = p_user
    and (p.id = auth.uid() or p.activity_visibility = 'everyone'
         or (p.activity_visibility = 'friends'
             and exists (select 1 from public.follows a where a.follower = auth.uid() and a.followee = p.id)
             and exists (select 1 from public.follows b where b.follower = p.id and b.followee = auth.uid())))
  order by l.created_at desc limit 20;
$$;
grant execute on function public.user_likes(uuid) to anon, authenticated;
