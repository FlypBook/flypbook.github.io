-- FlypBook: Scroll Like Shakespeare
-- Adds AI-voice narration. Paste into Supabase > SQL Editor and click Run (once).

-- Where each story's recording lives, and when each word starts (milliseconds).
alter table public.stories
  add column if not exists audio_url text,
  add column if not exists word_times int[];

-- A public storage bucket for the recordings. Anyone can listen; only the story job
-- (which uses the secret key) can upload, because there are no upload policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('narration', 'narration', true, 5242880, array['audio/mpeg'])
on conflict (id) do nothing;
