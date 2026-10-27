"""
FlypBook: Scroll Like Shakespeare. Scheduled batch job (Phase 2).

Each run:
  1. Processes queued user requests first (oldest first).
  2. Generates a few regular stories.
  3. Posts every approved story to Supabase and notifies requesters.

Runs on a schedule in GitHub Actions, or locally with:  python run_batch.py
Needs GROQ_API_KEY, SUPABASE_URL and SUPABASE_SECRET_KEY (in .env locally, GitHub Secrets online).
"""

import datetime
import json
import sys
import urllib.error
import urllib.request

import generate_story as g

# ---------------------------------------------------------------------------
# Settings (easy to change)
# ---------------------------------------------------------------------------

MAX_REQUESTS_PER_RUN = 5  # user requests handled per run
STORIES_PER_RUN = 2       # regular stories added per run
BACKFILL_PER_RUN = 3      # older stories without a recording that get narrated each run
# Kokoro voices the feed rotates through (listen to voice-samples/ to choose).
# "a,b" blends two voices.
VOICES = ["af_heart", "af_heart,af_sky", "am_liam"]

# ---------------------------------------------------------------------------
# Supabase helpers (plain HTTPS calls to Supabase's REST API)
# ---------------------------------------------------------------------------

# Accept the URL with or without a trailing "/rest/v1/" (the dashboard shows both forms).
SUPABASE_URL = g.load_setting("SUPABASE_URL").rstrip("/").removesuffix("/rest/v1")
SUPABASE_KEY = g.load_setting("SUPABASE_SECRET_KEY")


def supabase(method, table, query="", body=None):
    """Call Supabase's REST API. The secret key bypasses Row Level Security, so keep it secret."""
    url = f"{SUPABASE_URL}/rest/v1/{table}{'?' + query if query else ''}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
        "User-Agent": "FlypBook-pipeline/0.1",
    }
    if not SUPABASE_KEY.startswith("sb_"):  # older JWT-style keys also go in Authorization
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Supabase error {error.code} on {method} {table}: {detail}") from None


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def update_request(request_id, **fields):
    supabase("PATCH", "story_requests", f"id=eq.{request_id}", fields)


def notify(user_id, type_, message, story_id=None):
    supabase("POST", "notifications", body={
        "user_id": user_id, "type": type_, "message": message, "story_id": story_id,
    })


def publish(record, requested_by=None):
    """Save an approved story (and its hidden quiz answer) to Supabase. Returns the new story id."""
    q = record["question"]
    story = supabase("POST", "stories", body={
        "title": record["title"],
        "body": record["story"],
        "genre": record["tags"]["genre"],
        "tone": record["tags"]["tone"],
        "length": record["tags"]["length"],
        "reading_level": record["tags"]["reading_level"],
        "word_count": record["stats"]["word_count"],
        "est_read_seconds": record["stats"]["est_read_seconds"],
        "grade_level": record["stats"]["grade_level"],
        "question_prompt": q["prompt"],
        "question_choices": q["choices"],
        "requested_by": requested_by,
        "model": record["model"],
    })[0]
    supabase("POST", "story_answers", body={
        "story_id": story["id"], "answer_index": q["answer_index"], "explanation": q["explanation"],
    })
    add_narration(story["id"], record["story"])
    return story["id"]


def add_narration(story_id, body):
    """Record the story with the AI voice and attach it. If anything fails, the story still
    works: the app falls back to the phone's built-in voice."""
    try:
        import narrate
    except ImportError:
        print("  (Narration skipped: Kokoro isn't installed here.)")
        return False
    try:
        # Same story always gets the same voice; different stories spread across the list.
        voice = VOICES[int(story_id.replace("-", ""), 16) % len(VOICES)]
        print(f"  Recording narration ({voice})...")
        mp3, times, seconds = narrate.synthesize(body, voice)
        path = f"narration/{story_id}.mp3"
        req = urllib.request.Request(
            f"{SUPABASE_URL}/storage/v1/object/{path}", data=mp3, method="POST",
            headers={"apikey": SUPABASE_KEY, "Content-Type": "audio/mpeg", "x-upsert": "true",
                     **({} if SUPABASE_KEY.startswith("sb_") else {"Authorization": f"Bearer {SUPABASE_KEY}"})})
        urllib.request.urlopen(req, timeout=120).read()
        supabase("PATCH", "stories", f"id=eq.{story_id}", {
            "audio_url": f"{SUPABASE_URL}/storage/v1/object/public/{path}",
            "word_times": times,
        })
        print(f"  Narration added ({seconds:.0f}s, {len(mp3) // 1024} KB).")
        return True
    except Exception as error:
        detail = error.read().decode("utf-8", "replace")[:300] if hasattr(error, "read") else error
        print(f"  Narration failed: {detail}")
        return False


def backfill_narration():
    """Narrate a few older stories that don't have a recording yet."""
    rows = supabase("GET", "stories",
                    f"select=id,body&audio_url=is.null&status=eq.published&order=created_at.desc"
                    f"&limit={BACKFILL_PER_RUN}")
    for row in rows:
        print(f"\n--- Narrating older story {row['id']}")
        add_narration(row["id"], row["body"])


# ---------------------------------------------------------------------------
# The job
# ---------------------------------------------------------------------------


def process_requests(api_key):
    # Only one run happens at a time, so anything still "processing" is from a run that
    # crashed. Put it back in the queue.
    supabase("PATCH", "story_requests", "status=eq.processing", {"status": "queued"})

    queue = supabase("GET", "story_requests",
                     f"select=*&status=eq.queued&order=created_at.asc&limit={MAX_REQUESTS_PER_RUN}")
    print(f"{len(queue)} queued request(s).")
    done = 0
    for req in queue:
        print(f"\n--- Request {req['id']}: {req['prompt']!r}")
        update_request(req["id"], status="processing")
        users = supabase("GET", "profiles", f"select=username&id=eq.{req['user_id']}")
        username = users[0]["username"] if users else None
        genre = req["genre"] if req["genre"] in g.GENRES else None
        tone = req["tone"] if req["tone"] in g.TONES else None

        try:
            result = g.generate(api_key, request=req["prompt"], genre=genre, tone=tone, user=username)
        except g.DailyLimitReached as error:
            # Not the request's fault: put it (and the rest of the queue) back for the next run.
            print(f"  {error}. Leaving requests queued for the next run.")
            update_request(req["id"], status="queued")
            raise
        except Exception as error:  # never leave a request stuck because of one bad run
            result = {"status": "failed", "reason": str(error)}

        if result["status"] == "approved":
            story_id = publish(result["record"], requested_by=req["user_id"])
            update_request(req["id"], status="done", story_id=story_id, processed_at=now())
            notify(req["user_id"], "story_ready",
                   f"Your story \"{result['record']['title']}\" is ready!", story_id)
            done += 1
        elif result["status"] == "rejected":
            update_request(req["id"], status="rejected", reason=result["reason"], processed_at=now())
            notify(req["user_id"], "request_rejected",
                   "We couldn't write a story from that request. Try a different idea!")
        else:
            update_request(req["id"], status="failed", reason=result["reason"][:500], processed_at=now())
            notify(req["user_id"], "request_failed",
                   "Something went wrong writing your story. Please try again later.")
    return done


def generate_regular(api_key):
    done = 0
    for i in range(STORIES_PER_RUN):
        print(f"\n--- Regular story {i + 1}/{STORIES_PER_RUN}")
        try:
            result = g.generate(api_key)
        except g.DailyLimitReached:
            raise
        except Exception as error:
            print(f"  Error: {error}")
            continue
        if result["status"] == "approved":
            publish(result["record"])
            done += 1
    return done


def main():
    api_key = g.load_api_key()
    from_requests = regular = 0
    limited = False
    try:
        from_requests = process_requests(api_key)
        regular = generate_regular(api_key)
    except g.DailyLimitReached as error:
        limited = True
        print(f"\n{error}. Skipping the rest of the writing until the next run.")
    try:
        backfill_narration()
    except Exception as error:
        print(f"Backfill skipped: {error}")
    print(f"\nDone. Published {from_requests} requested + {regular} regular stories.")
    # Fail the GitHub Actions run (so you get an email) if nothing was published for a real
    # reason. Hitting the free daily limit is expected now and then, so that isn't a failure.
    if from_requests + regular == 0 and STORIES_PER_RUN > 0 and not limited:
        sys.exit(1)


if __name__ == "__main__":
    main()
