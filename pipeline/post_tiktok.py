"""
Post FlypBook stories to TikTok automatically, through TikTok's official Content Posting API.

Each run: pick the oldest published story that hasn't been posted yet, render it (make_videos.py), and post it
with TikTok's "AI-generated" label on. Runs on a schedule in GitHub Actions (.github/workflows/tiktok.yml).

One-time setup (see TIKTOK_SETUP.md): a TikTok developer app, its keys in GitHub Secrets
(TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET), supabase/007_tiktok.sql, and one login:
  python post_tiktok.py login          (prints TikTok's permission link)
  python post_tiktok.py code THE-CODE  (finishes it with the code the FlypBook page shows)

Until TikTok approves (audits) the app, it can only post private videos (TIKTOK_PRIVACY=SELF_ONLY, the default).
After approval, set the GitHub variable TIKTOK_PRIVACY to PUBLIC_TO_EVERYONE.
"""

import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import generate_story as g
from make_videos import render
from run_batch import supabase

API = "https://open.tiktokapis.com/v2"
REDIRECT_URI = "https://flypbook.github.io/tiktok.html"   # must match the app's Redirect URI in TikTok's portal
SCOPES = "user.info.basic,video.publish"
POSTS_PER_RUN = int(os.environ.get("TIKTOK_POSTS_PER_RUN", "1"))
PRIVACY = os.environ.get("TIKTOK_PRIVACY") or "SELF_ONLY"
CUTOFF = "2026-10-28T12:00:00Z"   # only stories from the current writer
HASHTAGS = "#storytime #aita #storytelling #fyp"


def call(method, url, token=None, body=None, form=None, headers=None):
    data, hdrs = None, dict(headers or {})
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        hdrs["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json; charset=UTF-8"
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"TikTok {e.code}: {e.read().decode('utf-8', 'replace')[:500]}") from None


def keys():
    return g.load_setting("TIKTOK_CLIENT_KEY"), g.load_setting("TIKTOK_CLIENT_SECRET")


def save_state(key, value):
    supabase("DELETE", "tiktok_state", f"key=eq.{key}")
    supabase("POST", "tiktok_state", body={"key": key, "value": value, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})


def load_state(key):
    rows = supabase("GET", "tiktok_state", f"select=value&key=eq.{key}") or []
    return rows[0]["value"] if rows else None


def access_token():
    """Swap the saved refresh token for a fresh access token (and save the new refresh token TikTok returns)."""
    client_key, client_secret = keys()
    refresh = load_state("refresh_token")
    if not refresh:
        sys.exit("No TikTok login saved yet. Run  python post_tiktok.py login  (see TIKTOK_SETUP.md).")
    data = call("POST", f"{API}/oauth/token/", form={"client_key": client_key, "client_secret": client_secret,
                                                     "grant_type": "refresh_token", "refresh_token": refresh})
    if "access_token" not in data:
        sys.exit(f"TikTok refused the saved login ({data}). Log in again:  python post_tiktok.py login")
    save_state("refresh_token", data["refresh_token"])
    days = int(data.get("refresh_expires_in", 0)) // 86400
    if days and days < 14:
        print(f"WARNING: the TikTok login expires in {days} days. Run  python post_tiktok.py login  to renew it.")
    return data["access_token"]


def login():
    """Step 1 of the one-time login (about once a year): print TikTok's permission link."""
    client_key, _ = keys()
    url = "https://www.tiktok.com/v2/auth/authorize/?" + urllib.parse.urlencode({
        "client_key": client_key, "scope": SCOPES, "response_type": "code", "redirect_uri": REDIRECT_URI,
        "state": secrets.token_urlsafe(12)})
    print("1. Open this link, log in to the TikTok account the videos should go to, and press Authorize:\n")
    print(url + "\n")
    print("2. The FlypBook page you land on shows a code. Then run:  python post_tiktok.py code THE-CODE")


def finish_login(code):
    """Step 2: trade the code from the FlypBook page for a lasting login, saved in Supabase."""
    client_key, client_secret = keys()
    data = call("POST", f"{API}/oauth/token/", form={"client_key": client_key, "client_secret": client_secret,
                                                     "code": code.strip(), "grant_type": "authorization_code", "redirect_uri": REDIRECT_URI})
    if "refresh_token" not in data:
        sys.exit(f"That didn't work: {data}")
    save_state("refresh_token", data["refresh_token"])
    save_state("open_id", data.get("open_id", ""))
    print(f"Saved. Scopes: {data.get('scope')}. The poster can post now (and keeps the login fresh by itself).")


def next_stories(n):
    posted = {r["story_id"] for r in supabase("GET", "tiktok_posts", "select=story_id") or []}
    rows = supabase("GET", "stories", "select=id,title,body,audio_url,word_times&status=eq.published&source=eq.ai"
                    f"&audio_url=not.is.null&word_times=not.is.null&created_at=gte.{CUTOFF}&order=created_at.asc") or []
    return [r for r in rows if r["id"] not in posted][:n]


def post(token, story, video):
    size = video.stat().st_size
    chunk = size if size <= 64 * 1024 * 1024 else 10 * 1024 * 1024
    count = max(1, size // chunk)
    caption = f"{story['title']} {HASHTAGS}"[:2100]
    init = call("POST", f"{API}/post/publish/video/init/", token, body={
        "post_info": {"title": caption, "privacy_level": PRIVACY, "disable_duet": False, "disable_stitch": False,
                      "disable_comment": False, "video_cover_timestamp_ms": 1500, "is_aigc": True},
        "source_info": {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": chunk, "total_chunk_count": count}})
    data = init.get("data") or {}
    if not data.get("upload_url"):
        raise RuntimeError(f"TikTok didn't accept the post: {init}")
    with open(video, "rb") as f:
        for i in range(count):
            start = i * chunk
            end = size - 1 if i == count - 1 else start + chunk - 1
            f.seek(start)
            part = f.read(end - start + 1)
            req = urllib.request.Request(data["upload_url"], data=part, method="PUT", headers={
                "Content-Type": "video/mp4", "Content-Length": str(len(part)), "Content-Range": f"bytes {start}-{end}/{size}"})
            urllib.request.urlopen(req, timeout=300).read()
    publish_id = data["publish_id"]
    status = "PROCESSING"
    for _ in range(30):  # TikTok processes the upload for a little while
        time.sleep(10)
        res = call("POST", f"{API}/post/publish/status/fetch/", token, body={"publish_id": publish_id})
        status = (res.get("data") or {}).get("status", status)
        if status in ("PUBLISH_COMPLETE", "FAILED", "SEND_TO_USER_INBOX"):
            break
    return publish_id, status


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "login":
        return login()
    if len(sys.argv) > 2 and sys.argv[1] == "code":
        return finish_login(sys.argv[2])
    if not (g.has_setting("TIKTOK_CLIENT_KEY") and g.has_setting("TIKTOK_CLIENT_SECRET")):
        print("TikTok posting isn't set up yet (no TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET). Skipping.")
        return
    stories = next_stories(POSTS_PER_RUN)
    if not stories:
        print("Nothing new to post.")
        return
    token = access_token()
    info = call("POST", f"{API}/post/publish/creator_info/query/", token, body={})
    allowed = ((info.get("data") or {}).get("privacy_level_options")) or []
    if allowed and PRIVACY not in allowed:
        sys.exit(f"TikTok doesn't allow privacy {PRIVACY} for this account/app yet (allowed: {allowed}).")
    for story in stories:
        video = Path(f"/tmp/{story['id']}.mp4") if os.name != "nt" else Path(os.environ.get("TEMP", ".")) / f"{story['id']}.mp4"
        print(f"Rendering: {story['title'][:70]}")
        render(story, video)
        print(f"Posting ({video.stat().st_size // 1024} KB, privacy {PRIVACY})...")
        publish_id, status = post(token, story, video)
        supabase("POST", "tiktok_posts", body={"story_id": story["id"], "publish_id": publish_id, "status": status})
        print(f"  {status} (publish id {publish_id})")
        video.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
