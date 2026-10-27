"""
FlypBook: Scroll Like Shakespeare. Reviews stories that readers post in the app.

Each run (every 30 minutes on GitHub Actions, or locally with:  python review_posts.py):
  1. Takes the oldest posts waiting for review.
  2. The AI checks each one for safety, privacy, and copying, and writes a quiz question for it.
  3. Approved posts are published credited to their writer, who gets a notification
     (and so do followers who want to hear about new posts). Rejected ones get a short reason.
The 4-hourly story job records the AI narration for published posts later; until then the app
reads them with the phone's own voice.
"""

import json
import sys

import generate_story as g
from run_batch import now, notify, supabase

POSTS_PER_RUN = 10
MIN_POST_WORDS = 120
FOLLOWER_NOTIFY_CAP = 500  # most followers told about one new post

POST_REVIEW_SYSTEM = f"""You review short stories that readers post on FlypBook, a reading app for teens (13+).
You do NOT rewrite the story. Decide whether it can be published, then write its tags and a quiz question.

Reject it ("approved": false) if ANY of these are true:
- It contains or asks for {g.BANNED_TOPICS}. Mild arguments, pettiness, pranks, and non-graphic
  spooky moments are fine.
- It shares private details about real people: full names together with a school, workplace,
  address, phone number, or social media handle; or it mocks or targets a real, identifiable person.
- It looks copied: you recognize it as a published story, a famous Reddit post, song lyrics, or another
  writer's work, or it says it is reposted or copied from somewhere.
- It isn't really a story (spam, ads, a list of words, a message to someone, gibberish, mostly
  repeated text), or it's too confusing to follow.
Swearing alone is not a reason to reject unless it's hateful; say so in "notes" instead.

If approved, also write ONE comprehension question that needs inference, uses only facts stated in
the story, and has exactly one defensible answer among four short choices.

Return ONLY a JSON object:
{{"approved": true or false,
 "reason": "one short, kind sentence the writer will see (why it was rejected, or a compliment if approved)",
 "notes": "anything the moderator should know, or empty",
 "genre": "one of: {", ".join(g.GENRES)}",
 "tone": "one of: {", ".join(g.TONES)}",
 "reading_level": "one of: {", ".join(g.READING_LEVELS)}",
 "question": {{"prompt": "...", "choices": ["four short choices"], "answer_index": 0,
              "explanation": "one sentence citing the story"}}}}"""


def review(api_key, post):
    text = f"Title: {post['title']}\n\n{post['body']}"
    if g.REQUEST_BLOCKLIST.search(text):
        return {"approved": False, "reason": "Your story has words or topics FlypBook can't show. Please edit it and post again."}
    words = len(post["body"].split())
    if words < MIN_POST_WORDS:
        return {"approved": False, "reason": f"Stories need at least {MIN_POST_WORDS} words. Add a bit more and post again."}
    result = g.call_llm(api_key, POST_REVIEW_SYSTEM, f"Review this reader's story:\n\n{text}",
                        temperature=0, reasoning_effort="medium")
    if not result.get("approved"):
        return {"approved": False, "reason": result.get("reason") or "Your story couldn't be published."}
    q = result.get("question") or {}
    if not (isinstance(q.get("choices"), list) and len(q["choices"]) == 4
            and isinstance(q.get("answer_index"), int) and 0 <= q["answer_index"] < 4 and q.get("prompt")):
        q = None  # still publish; the story just ends without a quiz
    pick = lambda value, options, fallback: value if value in options else fallback
    return {
        "approved": True,
        "reason": result.get("reason", ""),
        "genre": pick(post.get("genre"), g.GENRES, pick(result.get("genre"), g.GENRES, "wholesome twist")),
        "tone": pick(post.get("tone"), g.TONES, pick(result.get("tone"), g.TONES, "dramatic")),
        "reading_level": pick(result.get("reading_level"), g.READING_LEVELS, "medium"),
        "question": q,
        "notes": result.get("notes", ""),
    }


def publish_post(post, verdict):
    body = g.clean_story({"story": post["body"]})["story"]
    words = len(body.split())
    q = verdict["question"]
    story = supabase("POST", "stories", body={
        "title": post["title"],
        "body": body,
        "genre": verdict["genre"],
        "tone": verdict["tone"],
        "length": "short" if words < 400 else "medium" if words < 700 else "long",
        "reading_level": verdict["reading_level"],
        "word_count": words,
        "est_read_seconds": round(words / g.WORDS_PER_MINUTE * 60),
        "grade_level": g.grade_level(body),
        "question_prompt": q["prompt"] if q else None,
        "question_choices": q["choices"] if q else None,
        "author_id": post["user_id"],
        "source": "user",
        "ai_generated": False,
        "model": None,
    })[0]
    if q:
        supabase("POST", "story_answers", body={
            "story_id": story["id"], "answer_index": q["answer_index"], "explanation": q.get("explanation", ""),
        })
    return story["id"]


def tell_followers(post, story_id):
    """Let followers know about a new post (unless they turned that off in Settings)."""
    rows = supabase("GET", "follows", f"select=follower&followee=eq.{post['user_id']}&limit={FOLLOWER_NOTIFY_CAP}") or []
    if not rows:
        return
    ids = ",".join(r["follower"] for r in rows)
    people = supabase("GET", "profiles", f"select=id,settings&id=in.({ids})") or []
    author = supabase("GET", "profiles", f"select=username&id=eq.{post['user_id']}")[0]["username"]
    batch = [{"user_id": p["id"], "actor_id": post["user_id"], "type": "friend_posted", "story_id": story_id,
              "message": f"@{author} posted a new story: \"{post['title']}\""}
             for p in people if (p.get("settings") or {}).get("notify_posts", True) is not False]
    if batch:
        supabase("POST", "notifications", body=batch)


def main():
    queue = supabase("GET", "story_submissions",
                     f"select=*&status=in.(pending,processing)&order=created_at.asc&limit={POSTS_PER_RUN}") or []
    print(f"{len(queue)} post(s) waiting for review.")
    if not queue:
        return
    api_key = g.load_api_key()
    for post in queue:
        print(f"\n--- Post {post['id']}: {post['title']!r}")
        supabase("PATCH", "story_submissions", f"id=eq.{post['id']}", {"status": "processing"})
        while True:
            try:
                verdict = review(api_key, post)
                break
            except g.DailyLimitReached as error:
                print(f"  {error}.")
                if not g.next_model():
                    supabase("PATCH", "story_submissions", f"id=eq.{post['id']}", {"status": "pending"})
                    print("Every free model is used up for today. The rest wait for the next run.")
                    return
            except Exception as error:  # never leave a post stuck because of one bad run
                verdict = {"approved": None, "reason": str(error)}
                break
        if verdict["approved"]:
            story_id = publish_post(post, verdict)
            supabase("PATCH", "story_submissions", f"id=eq.{post['id']}",
                     {"status": "approved", "story_id": story_id, "processed_at": now(), "reason": verdict["notes"][:500] or None})
            notify(post["user_id"], "post_approved", f"Your story \"{post['title']}\" is live! {verdict['reason']}"[:300], story_id)
            tell_followers(post, story_id)
            print(f"  Published as {story_id}.")
        elif verdict["approved"] is False:
            supabase("PATCH", "story_submissions", f"id=eq.{post['id']}",
                     {"status": "rejected", "reason": verdict["reason"][:500], "processed_at": now()})
            notify(post["user_id"], "post_rejected", f"\"{post['title']}\" wasn't published: {verdict['reason']}"[:300])
            print(f"  Rejected: {verdict['reason']}")
        else:
            supabase("PATCH", "story_submissions", f"id=eq.{post['id']}",
                     {"status": "pending", "reason": verdict["reason"][:500]})
            print(f"  Error, will retry next run: {verdict['reason']}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        if "relation" in str(error) and "story_submissions" in str(error):
            sys.exit("The story_submissions table doesn't exist yet. Run supabase/005_social.sql first.")
        raise
