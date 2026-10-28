"""
Hide stories written before a given time (used once, on 2026-10-28, to retire the stories from the old
writer after the Reddit-voice writer replaced it). Hidden stories are NOT deleted: to bring one back,
set its status to 'published' in Supabase > Table Editor > stories.

Usage:  python retire_old_stories.py 2026-10-28T04:30:00Z [--yes]
Without --yes it only lists what would be hidden.
"""
import sys

from run_batch import supabase

cutoff = sys.argv[1]
rows = supabase("GET", "stories", f"select=id,title,created_at,source&status=eq.published&created_at=lt.{cutoff}&source=eq.ai") or []
print(f"{len(rows)} AI stories written before {cutoff}:")
for r in rows:
    print(f"  {r['created_at'][:16]}  {r['title']}")
if "--yes" in sys.argv and rows:
    ids = ",".join(r["id"] for r in rows)
    supabase("PATCH", "stories", f"id=in.({ids})", {"status": "hidden"})
    print(f"Hidden {len(rows)} stories. (Readers' own posts were left alone.)")
