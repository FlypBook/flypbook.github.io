# FlypBook: Scroll Like Shakespeare

Requirements that every phase must follow. The full original phase plan lives in the chat it came from; this file records the decisions made since.

## Branding
- Full name everywhere it's shown: **FlypBook: Scroll Like Shakespeare** (spelled "FlypBook", tagline capitalized "Scroll Like Shakespeare").
- Use it on the loading screen, sign-up page, home-screen install name, and link previews when a story is shared.
- Where space is tight (the name under the home-screen icon), use "FlypBook".

## Phones are the main device
- **Installing must be one step.** The user opens the link and taps "Install" / "Add to Home Screen". There's nothing else to download: no app store, no extra apps, no voice packs, no plugins, no files.
- Narration uses the voices already built into the phone. If a phone has no voices, the app falls back to highlighted captions alone and never asks the user to download anything.
- Background animations are drawn in code (canvas/CSS), so there are no video files to download.
- Keep the app small: no large libraries, images, or fonts. The app caches itself after the first visit so it opens fast.
- Design for phone first: portrait layout, thumb-reachable buttons, swipe gestures. Desktop is a bonus.
- In-app install button: on Android/Chrome, show a one-tap "Install FlypBook" button. On iPhone (Safari doesn't allow that button), show a short "Tap Share, then Add to Home Screen" hint once.

## Stack ($0 to run)
- Story generation: Groq free tier, model gpt-oss-120b (it writes and checks). It was the only free Groq model that worked reliably in testing on 2026-10-27; gpt-oss-20b returned broken output, and qwen3.8-27b wrote best but its free plan caps output at 1,000 tokens a minute. Each story is planned first, then gets a safety + logic check. Story quality is good enough for now, to be tuned later (mysteries fail the checks most often).
- Runs every 6 hours on GitHub Actions (public repo, free). Each run handles up to 5 queued requests first, then adds 2 regular stories. Keys are kept in GitHub Secrets and never committed.
- Database/auth: Supabase free tier. Hosting: free static host.

## Phase 2 decisions
- Only an "is 13+" flag is stored on profiles, never a birthdate. Sign-up is rejected by the database if the flag is missing.
- Quiz answers are kept in a hidden table (`story_answers`) so the app can't leak them. Answers will be scored by a database function (Phase 5).
- Points, streaks, like counts and story status can't be edited by users. Only database triggers/functions change them.
- Story requests: 3 per user per day by default (`app_settings.daily_request_limit`).
- Reports: you must be logged in to report, and one report hides the story until it's reviewed in the Table Editor.
- Deleting an account deletes all personal rows. Stories the user requested stay public but lose the "requested by" credit.
- To do in Phase 6: make the generator favor the most-liked and most-finished tags (it currently picks genres at random).
