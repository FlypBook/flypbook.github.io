# Automatic TikTok posting: your setup steps

Everything after these steps runs by itself on GitHub (your PC can be off): six times a day it turns the
next new story into a video and posts it to your TikTok account, labeled as AI-generated.

TikTok's website changes now and then, so button names below may be slightly different. If something doesn't
match, tell Claude what you see.

## 1. Make the TikTok account (5 min)
1. Create a new TikTok account for the videos (for example "flypbook.stories"). Use your phone or tiktok.com.
2. Turn off "Private account" in its settings (videos need to be able to go public later).

## 2. Make a TikTok developer app (15 min)
1. Go to **developers.tiktok.com** and log in (your TikTok account works).
2. Open **Manage apps** and create a new app. Fill in:
   - App name: **FlypBook**
   - Icon: the FlypBook logo (`web/icons/icon-512.png`)
   - Category: Entertainment
   - Description: *FlypBook posts its original AI-written short stories, narrated with captions, to its own TikTok account.*
   - Terms of Service URL: **https://flypbook.github.io/terms.html**
   - Privacy Policy URL: **https://flypbook.github.io/privacy.html**
   - Platform: **Web**, website **https://flypbook.github.io**
3. Add the product **Login Kit**. Set its **Redirect URI** to exactly: **https://flypbook.github.io/tiktok.html**
4. Add the product **Content Posting API** and turn on **Direct Post**.
5. Make sure the scopes **user.info.basic** and **video.publish** are added.
6. If the portal has a **Sandbox** or **Target users** section, add your new TikTok account there so you can test.
7. Copy the app's **Client key** and **Client secret** (keep the secret private; never post it anywhere).

## 3. Give the keys to the auto-poster (5 min)
1. On GitHub: your repo, then **Settings** > **Secrets and variables** > **Actions** > **New repository secret**. Add two:
   - `TIKTOK_CLIENT_KEY` = the Client key
   - `TIKTOK_CLIENT_SECRET` = the Client secret
2. Also add the same two lines to `pipeline/.env` on your PC:
   ```
   TIKTOK_CLIENT_KEY=...
   TIKTOK_CLIENT_SECRET=...
   ```

## 4. Add the database tables (2 min)
In Supabase: **SQL Editor** > New query > paste everything from `supabase/007_tiktok.sql` > **Run**.

## 5. Connect the account (2 min, about once a year)
Tell Claude "run the TikTok login". Claude runs `python post_tiktok.py login` and gives you a link.
Open it, log in to the video account, press **Authorize**, and send Claude the code the FlypBook page shows.

## 6. Test it
GitHub repo > **Actions** > **Post to TikTok** > **Run workflow**. A few minutes later a video should appear on
your TikTok profile. Until TikTok approves your app, it will be **private** (only you can see it). That's normal.

## 7. Get approved to post publicly
In the developer portal, **submit the app for review** (sometimes called an audit) for the Content Posting API.
They usually want a short screen recording showing how it works: you can record the test post and the FlypBook site.
When it's approved: GitHub repo > **Settings** > **Secrets and variables** > **Actions** > **Variables** tab >
**New repository variable**: `TIKTOK_PRIVACY` = `PUBLIC_TO_EVERYONE`.

From then on it posts publicly six times a day by itself (long stories as Part 1 and Part 2).

## Good to know
- **Once a year** the TikTok login expires. The poster warns about two weeks before (in the GitHub Actions log); just repeat step 5.
- **Change how often it posts:** ask Claude (it's the schedule in `.github/workflows/tiktok.yml`).
- **Every post gets TikTok's own "AI-generated" label**, switched on automatically. Keep it that way: TikTok requires it.
- **Account risk:** TikTok can limit accounts that post a lot of automated content. Six a day is the most that stays safe for a new account.
