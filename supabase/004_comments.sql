-- FlypBook: Scroll Like Shakespeare
-- Comments, saved stories, and friendlier usernames. Paste into Supabase > SQL Editor and Run (once).

-- ---------------------------------------------------------------------------
-- Usernames: any letters (upper or lower case), numbers, and symbols. No spaces, 3-20 characters.
-- Still unique ignoring case, so "Sam" and "sam" can't both exist.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check check (username ~ '^[^[:space:]]{3,20}$');
create unique index if not exists profiles_username_ci on public.profiles (lower(username));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((new.raw_user_meta_data ->> 'is_13_plus')::boolean, false) is not true then
    raise exception 'Account cannot be created';
  end if;
  insert into public.profiles (id, username, favorite_genres)
  values (
    new.id,
    btrim(new.raw_user_meta_data ->> 'username'),
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'favorite_genres')), '{}')
  );
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
alter table public.stories add column if not exists comment_count int not null default 0;

create table public.comments (
  id bigint generated always as identity primary key,
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_story_idx on public.comments (story_id, created_at desc);
alter table public.comments enable row level security;
create policy "anyone reads visible comments" on public.comments for select to anon, authenticated using (not hidden);
create policy "comment as yourself" on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "delete own comments" on public.comments for delete to authenticated using (user_id = auth.uid());
revoke update on public.comments from anon, authenticated;

-- Words that block a comment from posting. Add or remove rows any time in the Table Editor.
create table public.blocked_words (word text primary key);
alter table public.blocked_words enable row level security;  -- private
insert into public.blocked_words (word) values
  ('fuck'), ('shit'), ('bitch'), ('cunt'), ('whore'), ('slut'), ('dick'), ('pussy'), ('retard'),
  ('fag'), ('nigg'), ('kys'), ('kill yourself'), ('kill urself'), ('porn'), ('nude'), ('onlyfans');

-- Checks before a comment is saved: no blocked words, no links, and at most 20 comments an hour.
create function public.check_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recent int;
begin
  new.body := btrim(new.body);
  if exists (select 1 from public.blocked_words w where position(w.word in lower(new.body)) > 0) then
    raise exception 'Please keep comments kind and clean.';
  end if;
  if new.body ~* '(https?://|www\.|\.com\b)' then
    raise exception 'Links aren''t allowed in comments.';
  end if;
  select count(*) into recent from public.comments where user_id = new.user_id and created_at > now() - interval '1 hour';
  if recent >= 20 then
    raise exception 'You''re commenting a lot! Take a short break and try again later.';
  end if;
  new.hidden := false;
  new.created_at := now();
  return new;
end $$;
create trigger before_comment_insert before insert on public.comments
  for each row execute function public.check_comment();

create function public.update_comment_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.stories set comment_count = comment_count + 1 where id = new.story_id;
  elsif tg_op = 'DELETE' and not old.hidden then
    update public.stories set comment_count = greatest(comment_count - 1, 0) where id = old.story_id;
  end if;
  return null;
end $$;
create trigger on_comment_change after insert or delete on public.comments
  for each row execute function public.update_comment_count();

-- Comments with usernames, for the app to read (hidden comments are left out).
create view public.comment_feed as
  select c.id, c.story_id, c.user_id, c.body, c.created_at, p.username
  from public.comments c join public.profiles p on p.id = c.user_id
  where not c.hidden;
grant select on public.comment_feed to anon, authenticated;

-- Reporting a comment hides it right away, until you review it (set hidden = false to restore).
create table public.comment_reports (
  id bigint generated always as identity primary key,
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles (id) on delete set null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
alter table public.comment_reports enable row level security;
create policy "report comments as yourself" on public.comment_reports for insert to authenticated with check (user_id = auth.uid());

create function public.hide_reported_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.comments set hidden = true where id = new.comment_id and not hidden;
  update public.stories s set comment_count = greatest(comment_count - 1, 0)
    from public.comments c where c.id = new.comment_id and s.id = c.story_id and found;
  return null;
end $$;
create trigger on_comment_report after insert on public.comment_reports
  for each row execute function public.hide_reported_comment();

-- ---------------------------------------------------------------------------
-- Saved stories (bookmark button)
-- ---------------------------------------------------------------------------
create table public.saves (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
alter table public.saves enable row level security;
create policy "read own saves" on public.saves for select to authenticated using (user_id = auth.uid());
create policy "add own saves" on public.saves for insert to authenticated with check (user_id = auth.uid());
create policy "remove own saves" on public.saves for delete to authenticated using (user_id = auth.uid());
