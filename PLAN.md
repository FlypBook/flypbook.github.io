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

## Upgrade decisions (2026-10-27)
- **Voice:** TikTok's own TTS voices can't be used (TikTok owns them; unofficial access breaks its terms). Instead, each story is recorded once by the GitHub job with **Kokoro** (open-source, Apache 2.0), with exact per-word timings for the highlighting. MP3s live in a public Supabase Storage bucket (`narration`). Free limits: 1 GB storage (~1,000 stories) and ~5 GB/month of downloads (~6,000 plays). We'll need a cleanup plan or another free host before then. The phone's own voice is still the fallback. The feed rotates 3 voices you picked: af_heart, an af_heart + af_sky blend, and am_liam (each story always keeps the same voice).
- **Backgrounds (updated):** the goal is nonstop, attention-grabbing motion like story-video gameplay footage. Real Minecraft/Subway Surfers footage is copyrighted (and the plan bans copyrighted gameplay), so FlypBook uses **original code-drawn gameplay scenes** in `web/gameplay.js`: Sky Parkour (first-person block jumping, 4 worlds), Neon Rush (3-lane runner), Sand Slice, and Drop Zone. These are weighted to appear most, plus the calmer scenes. They're endless, so they last as long as any story. Optional real "making something" clips from Pixabay are ~30% when present.
- **3D gameplay (2026-10-27):** `web/game3d.js` uses **three.js** (free, MIT license, ~170 KB, loaded from the jsDelivr CDN) for real lighting, shadows, fog and pixel-art textures painted in code: **Parkour3D** (first-person block parkour; meadow/snow/desert/volcano/neon worlds), **NeonRun3D** (third-person lane runner), **Stack3D** (stacking tower) and **Domino3D** (domino chain on wooden planks). At most 3 3D canvases run at once (the visible card and its neighbors), and the rest are freed. If 3D can't load within 4s, the flat 2D versions are used.
- **25 3D scenes total (2026-10-27):** 21 more original scenes were added in `games_ride.js` (desert highway, snowboard, space tunnel, street skate, jet ski, paper plane), `games_fp.js` (canyon drone, roller coaster, mine cart, rooftop run), `games_satisfy.js` (marble run, hydraulic press, soap cutting, ball pour, pottery wheel, laser engraver, jelly hop) and `games_arcade.js` (brick smash, bowling, arrow cam, basketball). They share `games_kit.js` (character, car, particles, trees, textures). `game3d_more.js` loads them all, and one broken file can't stop the others. Every scene gets studio reflections so metal and gloss look real. Review all of them at `web/_test/gallery.html`.
- **Real-life clips:** "making something" footage (smoothies, clay, pottery, woodworking, cake decorating, and more) from Pixabay, downloaded by hand from `picklist.html` and converted with `python fetch_videos.py convert`. About 30% of stories when clips are present.
- **Backgrounds (original note):** each card has its own background, so it swipes with the story. Real satisfying clips come from **Pixabay** (free license, credited in the app), mixed with code-drawn scenes (orbs, waves, runner, pendulum wave). Pexels was the first choice, but it paused new API keys (2026-10-27). Pixabay doesn't allow hotlinking, so `pipeline/fetch_videos.py` downloads each clip, crops it to a 9:16 portrait frame, and makes a ~14s silent 540×960 loop. These are saved in `web/videos/` and hosted with the app (free static hosting in Phase 7).
- **Stories:** training on Reddit posts isn't allowed (Reddit's terms + authors' copyright), and no free service offers training. Instead: `pipeline/craft_guide.md` (viral-story craft rules), random premise ingredients, plan → draft → editor rewrite → review with engagement scores (hook ≥ 7, overall ≥ 7, ≤ 2 clichés).
- **UI:** full-screen cards, a warm off-white title card as the intro, big outlined captions (white, with the spoken word in karaoke yellow, the complement of brand violet), a Stories-style progress bar, a glass settings sheet, and the end card.

## Phases 4-7 (2026-10-27)
- **Hosting:** GitHub Pages (free) via `.github/workflows/deploy-site.yml`, which publishes `web/` on every push. Address: https://flypbook.github.io/. It's an installable app (PWA): `manifest.json`, icons in `web/icons/` (drawn by `pipeline/make_icons.py`), and `sw.js` caches the app so it opens instantly. Each deploy stamps a new cache version.
- **Accounts (`web/account.js`):** Supabase Auth with email and password plus email confirmation. Sign-up starts with a neutral birthday screen (blank date picker, no age mentioned). Under 13 shows "Sorry, you can't create an account right now", nothing is sent, and a device flag keeps the form blocked. The birthday is never stored or sent; only `is_13_plus` goes into the sign-up metadata. Also: profile (points, streaks, reading level, favorite genres, requests), log out, delete account (`delete_my_account`), forgot password, and `privacy.html`.
- **Engagement (`supabase/003_engagement.sql`):** `submit_answer` (+10 per correct answer, +5 bonus at a 3+ day streak; reading level +0.06 per correct, -0.03 per miss), `check_answer` for guests (nothing saved), and `tag_popularity` for the generator. Likes, share links (`?story=id`), and report (needs an account; hides the story) work from the card's side rail.
- **For You (in `web/app.js`):** signed-in feeds are ranked on the phone with no AI. Inputs: affinity to genre/tone from likes (×3), finishes (×2), shares (×3), skips (−1), favorite genres (+2), closeness to reading level, freshness, and popularity. Stories already finished are left out. Every 5th story is a random "discovery" pick from the lower half (about 20%). Guests see newest first.
- **Requests and notifications:** the + button opens the request form (the daily limit is enforced by the database). The bell shows unread notifications, and a ready story is pinned to the top of the feed with a banner.
- **Generator adapts:** `run_batch.py` reads `tag_popularity` and picks about 70% of regular stories from readers' favorite genre/tone combos, with 30% random.
- **Known limit:** Supabase's built-in email sender is very rate-limited on the free plan (a few emails per hour). Fine for testing. For a real launch, connect a free SMTP service in Supabase > Authentication > SMTP.

## Printed-book styling (2026-10-27, latest)
- **Controls look hand-made, not AI-generated:** cream paper (`--paper`) plus black ink (`--ink`), with one vermilion accent (`--accent`) for likes, badges and active marks. One custom line-icon set (24px, 1.75 stroke). Small-caps running heads, a serif (Fraunces) for headings and page numbers. Sheets open like paper pages with ruled-line fields. The dock is a paper strip with an ink quill button. The quiz is a printed slip with A–D. No glass bubbles, gradients, glows, pulsing or emoji in the interface.
- **Staying logged in:** the Supabase session is saved under `flypbook-login` and refreshed automatically, and the app asks the browser to keep its storage (`navigator.storage.persist`). Old sessions are carried over. iPhone home-screen apps have separate storage from Safari, so log in once inside the installed app.

## FlypBook's own look (2026-10-27, replaces the TikTok-style layout below)
- **Book identity:** wordmark plus a "For You / Fresh" pill switch at the top. A chapter line shows genre, length, "AI story" and who requested it. Each story opens with its **title centered like a chapter heading** for 1.7s, then the narration and captions start (no white title bubble). Actions sit in one glassy **reading bar** (like, comments, save, share, ⋯) with a **page count** ("p. 3 / 41"). Navigation is a floating rounded **dock** with a tilted quill button for requests.
- **Captions** are dead-center on the screen, and each story gets its own look, picked from its id: 4 fonts (system sans, Fraunces serif, Bricolage Grotesque, Nunito via Google Fonts), 3 treatments (outline, soft shadow, per-line plate), 7 highlight methods (ink, marker, underline, glow, box, spotlight, bounce) and 8 highlight colors.
- **Sound on open:** the app checks whether the browser allows sound without a tap. Installed Android apps and frequently visited sites usually do, and then everything plays with sound immediately. If not, the opening screen shows one "Tap to start reading" button, and after that every story plays with sound. There's no muted mode anymore.

## TikTok-style update (2026-10-27)
- **Kept from TikTok:** full-screen autoplay, a right rail (storyteller, like, comments, save, share, ⋯ report), bottom-left info (name, title, hashtags, length), a bottom nav (Home, Discover, +, Inbox, Me), Latest/For You tabs, double-tap to like with a heart burst, and the comment drawer.
- **Fixed vs TikTok:** captions stay clear of every button. The progress bar can be dragged and shows the time. Story length is always shown. Tap-to-pause stops the voice AND the background. A "take a break?" card appears after 15 stories or 25 minutes. Comments are moderated: a blocked-word list (editable in `blocked_words`), no links, 20 an hour max, and one report hides a comment.
- **Autoplay:** stories start the moment the app opens. Browsers block sound until the first tap, so it plays muted with captions and shows a "Tap for sound" pill. The first tap turns sound on (it doesn't pause).
- **Usernames:** any letters, numbers and symbols, no spaces, 3-20 characters, unique ignoring capitals (`supabase/004_comments.sql`).
- **Story writer:** if no draft clears the full engagement bar, the best safe, logical draft scoring at least 6/10 overall is published, so the feed doesn't starve.

## Phase 2 decisions
- Only an "is 13+" flag is stored on profiles, never a birthdate. Sign-up is rejected by the database if the flag is missing.
- Quiz answers are kept in a hidden table (`story_answers`) so the app can't leak them. Answers will be scored by a database function (Phase 5).
- Points, streaks, like counts and story status can't be edited by users. Only database triggers/functions change them.
- Story requests: 3 per user per day by default (`app_settings.daily_request_limit`).
- Reports: you must be logged in to report, and one report hides the story until it's reviewed in the Table Editor.
- Deleting an account deletes all personal rows. Stories the user requested stay public but lose the "requested by" credit.
- To do in Phase 6: make the generator favor the most-liked and most-finished tags (it currently picks genres at random).
