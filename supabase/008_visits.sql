-- FlypBook visitor stats (privacy-friendly): one row per device per day.
-- No cookies, no IP addresses, no fingerprinting. A device gets a random id saved in its browser;
-- if the reader is signed in, the row is also linked to their account (unlinked when the account is deleted).
-- Browsers that send "Global Privacy Control" or "Do Not Track" are not counted at all.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.visits (
  visitor_id uuid not null,
  day date not null default (now() at time zone 'utc')::date,
  user_id uuid references public.profiles (id) on delete set null,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  seconds int not null default 0,           -- time with the app open on screen
  stories_viewed int not null default 0,    -- stories scrolled to
  stories_finished int not null default 0,  -- stories read to the end
  device text,                              -- phone / tablet / computer
  source text,                              -- where they came from (tiktok, google, direct, ...)
  installed boolean not null default false, -- opened from the home-screen app
  primary key (visitor_id, day)
);
create index if not exists visits_day_idx on public.visits (day);
create index if not exists visits_user_idx on public.visits (user_id);

-- Nobody can read or change this table from the app (only the owner's stats script, with the secret key).
alter table public.visits enable row level security;

-- The app adds to today's row through this function only. Amounts are capped so a broken
-- or tampered page can't inflate the numbers much.
create or replace function public.record_visit(
  p_visitor uuid, p_seconds int, p_viewed int, p_finished int,
  p_device text, p_source text, p_installed boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := (select id from public.profiles where id = auth.uid());
begin
  insert into public.visits as v (visitor_id, user_id, seconds, stories_viewed, stories_finished, device, source, installed)
  values (p_visitor, uid, least(greatest(p_seconds, 0), 900), least(greatest(p_viewed, 0), 300),
          least(greatest(p_finished, 0), 300), left(p_device, 20), left(p_source, 40), coalesce(p_installed, false))
  on conflict (visitor_id, day) do update set
    user_id = coalesce(excluded.user_id, v.user_id),
    last_at = now(),
    seconds = v.seconds + excluded.seconds,
    stories_viewed = v.stories_viewed + excluded.stories_viewed,
    stories_finished = v.stories_finished + excluded.stories_finished,
    installed = v.installed or excluded.installed;
end $$;

revoke all on function public.record_visit from public;
grant execute on function public.record_visit to anon, authenticated;
