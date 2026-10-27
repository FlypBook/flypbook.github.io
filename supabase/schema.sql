-- FlypBook: Scroll Like Shakespeare
-- Database setup. Paste this whole file into Supabase > SQL Editor and click Run.
-- Safe to run only once on a fresh project.
--
-- Security model (Row Level Security):
--   * Anyone (even logged out) can read published stories and usernames.
--   * Logged-in users can only read/change their OWN private data.
--   * Points, streaks, like counts, and story status can't be edited by users directly;
--     they change only through the triggers/functions below.
--   * The story generator (GitHub Actions) uses the secret key, which bypasses these rules.

-- ---------------------------------------------------------------------------
-- Settings (change numbers here any time: Table Editor > app_settings)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),  -- only one row allowed
  daily_request_limit int not null default 3
);
insert into public.app_settings default values;
alter table public.app_settings enable row level security;  -- no policies: users can't read or change it

-- ---------------------------------------------------------------------------
-- Profiles (one per account). Only a "13 or older" flag is stored, never a birthdate.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  is_13_plus boolean not null default true check (is_13_plus),
  favorite_genres text[] not null default '{}',
  points int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_streak_date date,
  reading_level real not null default 1.0,  -- 1 = easy, 2 = medium, 3 = challenging (adjusts over time)
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Users may only change these two columns themselves (not points/streaks/reading level).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, favorite_genres) on public.profiles to authenticated;

-- Public usernames only (for "requested by @username").
create view public.public_usernames as select id, username from public.profiles;
grant select on public.public_usernames to anon, authenticated;

-- Create the profile automatically when someone signs up. The app sends username,
-- favorite genres, and is_13_plus as sign-up metadata. Sign-up fails without is_13_plus.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((new.raw_user_meta_data ->> 'is_13_plus')::boolean, false) is not true then
    raise exception 'Account cannot be created';
  end if;
  insert into public.profiles (id, username, favorite_genres)
  values (
    new.id,
    lower(new.raw_user_meta_data ->> 'username'),
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'favorite_genres')), '{}')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Stories (shared by everyone). Quiz answers are kept in a separate hidden table.
-- ---------------------------------------------------------------------------
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  genre text not null,
  tone text not null,
  length text not null,
  reading_level text not null,
  word_count int not null,
  est_read_seconds int not null,
  grade_level real,
  question_prompt text,
  question_choices text[],
  requested_by uuid references public.profiles (id) on delete set null,
  ai_generated boolean not null default true check (ai_generated),
  model text,
  status text not null default 'published' check (status in ('published', 'hidden', 'removed')),
  like_count int not null default 0,
  report_count int not null default 0,
  created_at timestamptz not null default now()
);
create index stories_feed_idx on public.stories (created_at desc) where status = 'published';
alter table public.stories enable row level security;
create policy "anyone reads published stories" on public.stories for select to anon, authenticated
  using (status = 'published');
revoke insert, update, delete on public.stories from anon, authenticated;

create table public.story_answers (
  story_id uuid primary key references public.stories (id) on delete cascade,
  answer_index int not null check (answer_index between 0 and 3),
  explanation text
);
alter table public.story_answers enable row level security;  -- hidden; checked by a function in Phase 5

-- ---------------------------------------------------------------------------
-- Story requests (the queue)
-- ---------------------------------------------------------------------------
create table public.story_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  prompt text not null check (char_length(prompt) between 5 and 200),
  genre text,
  tone text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'done', 'rejected', 'failed')),
  story_id uuid references public.stories (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index story_requests_queue_idx on public.story_requests (status, created_at);
alter table public.story_requests enable row level security;
create policy "read own requests" on public.story_requests for select to authenticated
  using (user_id = auth.uid());
create policy "create own requests" on public.story_requests for insert to authenticated
  with check (user_id = auth.uid());
revoke update, delete on public.story_requests from anon, authenticated;

-- Enforce the daily limit and make sure new requests always start as "queued".
create function public.check_request_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  daily_limit int;
  used int;
begin
  select daily_request_limit into daily_limit from public.app_settings;
  select count(*) into used from public.story_requests
    where user_id = new.user_id and created_at > now() - interval '1 day';
  if used >= daily_limit then
    raise exception 'Daily request limit reached (% per day)', daily_limit;
  end if;
  new.status := 'queued';
  new.story_id := null;
  new.reason := null;
  new.processed_at := null;
  new.created_at := now();
  return new;
end $$;
create trigger before_request_insert before insert on public.story_requests
  for each row execute function public.check_request_limit();

-- ---------------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------------
create table public.likes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
create index likes_story_idx on public.likes (story_id);
alter table public.likes enable row level security;
create policy "read own likes" on public.likes for select to authenticated using (user_id = auth.uid());
create policy "add own likes" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "remove own likes" on public.likes for delete to authenticated using (user_id = auth.uid());

create function public.update_like_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.stories set like_count = like_count + 1 where id = new.story_id;
  else
    update public.stories set like_count = greatest(like_count - 1, 0) where id = old.story_id;
  end if;
  return null;
end $$;
create trigger on_like_change after insert or delete on public.likes
  for each row execute function public.update_like_count();

-- ---------------------------------------------------------------------------
-- Reading signals for the For You feed (views, finishes, skips, shares)
-- ---------------------------------------------------------------------------
create table public.story_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  event text not null check (event in ('view', 'finish', 'skip', 'share')),
  progress real check (progress between 0 and 1),
  created_at timestamptz not null default now()
);
create index story_events_user_idx on public.story_events (user_id, story_id);
create index story_events_story_idx on public.story_events (story_id, event);
alter table public.story_events enable row level security;
create policy "read own events" on public.story_events for select to authenticated using (user_id = auth.uid());
create policy "add own events" on public.story_events for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Quiz answers (written only by a scoring function added in Phase 5)
-- ---------------------------------------------------------------------------
create table public.answers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  choice int not null,
  correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
alter table public.answers enable row level security;
create policy "read own answers" on public.answers for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.answers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports: any report hides the story until you review it in the Table Editor
-- (set status back to 'published' to restore it, or 'removed' to keep it hidden).
-- ---------------------------------------------------------------------------
create table public.reports (
  id bigint generated always as identity primary key,
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles (id) on delete set null,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (story_id, user_id)
);
alter table public.reports enable row level security;
create policy "report as yourself" on public.reports for insert to authenticated with check (user_id = auth.uid());

create function public.hide_reported_story() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.stories
    set report_count = report_count + 1,
        status = case when status = 'published' then 'hidden' else status end
    where id = new.story_id;
  return null;
end $$;
create trigger on_report after insert on public.reports
  for each row execute function public.hide_reported_story();

-- ---------------------------------------------------------------------------
-- Notifications ("your story is ready")
-- ---------------------------------------------------------------------------
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('story_ready', 'request_rejected', 'request_failed')),
  story_id uuid references public.stories (id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read);
alter table public.notifications enable row level security;
create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Delete my account: removes the login and, through "on delete cascade", every row
-- of personal data. Stories they requested stay public but lose the username credit.
-- ---------------------------------------------------------------------------
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
