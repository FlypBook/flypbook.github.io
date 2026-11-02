"""
FlypBook's visitor stats: how many people open the app, how long they stay, how much they scroll,
where they come from, and what each signed-in reader has been doing.

  python stats.py            last 14 days
  python stats.py --days 60  a longer stretch

Reads the private "visits" table (supabase/008_visits.sql) with the secret key in pipeline/.env.
Visitors are counted per device (a random id, no cookies or IP addresses), so one person on a phone
and a computer counts twice. Browsers with Do Not Track / Global Privacy Control on aren't counted.
"""

import argparse
import json
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from run_batch import SUPABASE_KEY, SUPABASE_URL, supabase


def minutes(seconds):
    return f"{seconds / 60:.0f} min" if seconds >= 60 else f"{seconds:.0f} s"


def all_rows(table, query):
    rows, start = [], 0
    while True:
        page = supabase("GET", table, f"{query}&limit=1000&offset={start}") or []
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def sign_ins():
    """Each account's last sign-in time, from Supabase Auth."""
    req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/admin/users?per_page=1000", headers={
        "apikey": SUPABASE_KEY, **({} if SUPABASE_KEY.startswith("sb_") else {"Authorization": f"Bearer {SUPABASE_KEY}"})})
    try:
        users = json.loads(urllib.request.urlopen(req, timeout=60).read()).get("users", [])
    except Exception:
        return {}
    return {u["id"]: u.get("last_sign_in_at") for u in users}


def when(stamp):
    if not stamp:
        return "-"
    t = datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone()
    return t.strftime("%b %d, %I:%M %p").replace(" 0", " ")


def main():
    parser = argparse.ArgumentParser(description="Show FlypBook's visitor stats.")
    parser.add_argument("--days", type=int, default=14)
    args = parser.parse_args()
    today = datetime.now(timezone.utc).date()
    since = today - timedelta(days=args.days - 1)

    try:
        visits = all_rows("visits", "select=*&order=day")
    except RuntimeError as error:
        if "PGRST205" not in str(error):
            raise
        sys.exit("The visits table isn't set up yet: run supabase/008_visits.sql in Supabase's SQL Editor.")
    profiles = {p["id"]: p for p in all_rows("profiles", "select=id,username,created_at")}
    last_sign_in = sign_ins()
    if not visits:
        print("No visits recorded yet. (Has supabase/008_visits.sql been run, and has anyone opened the app since?)")

    recent = [v for v in visits if date.fromisoformat(v["day"]) >= since]
    week = {v["visitor_id"] for v in visits if date.fromisoformat(v["day"]) > today - timedelta(days=7)}
    print("FLYPBOOK STATS".center(72, "="))
    print(f"Visitors today: {len({v['visitor_id'] for v in visits if v['day'] == today.isoformat()})}   "
          f"last 7 days: {len(week)}   all time: {len({v['visitor_id'] for v in visits})}")
    print(f"Accounts: {len(profiles)}   new in the last 7 days: "
          f"{sum(1 for p in profiles.values() if p['created_at'][:10] > (today - timedelta(days=7)).isoformat())}")

    # Visitors who came back on a later day.
    days_per_visitor = Counter(v["visitor_id"] for v in visits)
    if days_per_visitor:
        back = sum(1 for n in days_per_visitor.values() if n > 1)
        print(f"Came back on another day: {back} of {len(days_per_visitor)} ({back * 100 // len(days_per_visitor)}%)")

    print(f"\nDay by day (last {args.days} days, UTC)")
    print(f"  {'day':<11}{'visitors':>9}{'signed in':>11}{'stories seen':>14}{'finished':>10}{'avg time':>10}")
    by_day = defaultdict(list)
    for v in recent:
        by_day[v["day"]].append(v)
    for i in range(args.days):
        d = (since + timedelta(days=i)).isoformat()
        rows = by_day.get(d, [])
        if not rows:
            continue
        secs = sum(r["seconds"] for r in rows)
        print(f"  {d:<11}{len(rows):>9}{sum(1 for r in rows if r['user_id']):>11}"
              f"{sum(r['stories_viewed'] for r in rows):>14}{sum(r['stories_finished'] for r in rows):>10}"
              f"{minutes(secs / len(rows)):>10}")

    if recent:
        for label, key in (("Where they came from", "source"), ("Devices", "device")):
            counts = Counter(r[key] or "unknown" for r in recent)
            print(f"\n{label}: " + ", ".join(f"{k} {n}" for k, n in counts.most_common()))
        print(f"Opened from the home-screen app: {sum(1 for r in recent if r['installed'])} of {len(recent)} visits")

    print("\nAccounts")
    print(f"  {'username':<20}{'joined':<10}{'last sign-in':<18}{'days active':>12}{'seen':>7}{'finished':>10}{'time':>10}")
    per_user = defaultdict(list)
    for v in visits:
        if v["user_id"]:
            per_user[v["user_id"]].append(v)
    for uid, p in sorted(profiles.items(), key=lambda kv: kv[1]["created_at"], reverse=True):
        rows = per_user.get(uid, [])
        print(f"  {p['username']:<20}{when(p['created_at'])[:6]:<10}{when(last_sign_in.get(uid)):<18}{len(rows):>12}"
              f"{sum(r['stories_viewed'] for r in rows):>7}{sum(r['stories_finished'] for r in rows):>10}"
              f"{minutes(sum(r['seconds'] for r in rows)):>10}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
