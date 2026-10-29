-- FlypBook: automatic TikTok posting (pipeline/post_tiktok.py).
-- Run once in Supabase > SQL Editor. Only the server key (GitHub Actions) can read or write these:
-- row level security is on and there are no policies, so the app and the public can't see them.

-- The TikTok login (refresh token) the poster keeps up to date. TikTok gives a new one every time it's used.
create table if not exists tiktok_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table tiktok_state enable row level security;

-- Which stories were posted, so nothing is posted twice.
create table if not exists tiktok_posts (
  story_id uuid primary key references stories(id) on delete cascade,
  publish_id text,
  status text not null default 'sent',
  posted_at timestamptz not null default now()
);
alter table tiktok_posts enable row level security;
