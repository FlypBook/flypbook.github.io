"""
Satisfying background videos from Pixabay (free to use), hosted with the app.

Pixabay doesn't allow scripts to download its video files, so it's two steps:

  1. python fetch_videos.py picklist
       Searches Pixabay (via its free API) and builds picklist.html: thumbnails that link to each
       clip's Pixabay page. Open it, click the ones you like, and press Download on each
       (any size, 1920x1080 is best). Put the downloaded .mp4 files in the incoming-videos/ folder.

  2. python fetch_videos.py convert
       Turns every file in incoming-videos/ into a small, silent, phone-shaped 14s loop in
       web/videos/, looks up the creator for the credit line, and updates web/videos.json.

Needs PIXABAY_API_KEY in pipeline/.env (free: sign in, then see https://pixabay.com/api/docs/).
Also needs:  pip install imageio-ffmpeg   (a ready-made video converter)
"""

import html
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import generate_story as g

CLIP_SECONDS = 14           # length of each loop
MIN_SECONDS = 8
OUT_W, OUT_H = 540, 960     # portrait output size
QUALITY = 31                # higher = smaller file, lower quality (H.264 CRF)
PER_QUERY = 6               # suggestions per search in the pick list

# Real-life "making something" footage: hands creating things, start to finish.
QUERIES = [
    "smoothie", "making smoothie", "blender fruit", "pottery", "clay", "pottery wheel",
    "sculpting clay", "handmade", "crafting", "woodworking", "wood carving", "knitting",
    "sewing", "embroidery", "soap making", "candle making", "cake decorating", "icing cake",
    "latte art", "barista", "chocolate", "baking bread", "kneading dough", "pizza dough",
    "cooking", "chopping vegetables", "sushi", "painting canvas", "watercolor", "calligraphy",
    "resin art", "glass blowing", "blacksmith", "leather craft", "jewelry making", "origami",
    "paper craft", "kinetic sand", "slime", "paint mixing",
]

ROOT = Path(__file__).resolve().parent.parent
INCOMING = ROOT / "incoming-videos"
VIDEO_DIR = ROOT / "web" / "videos"
LIST = ROOT / "web" / "videos.json"
PICKLIST = ROOT / "picklist.html"


def api(key, **params):
    url = "https://pixabay.com/api/videos/?" + urllib.parse.urlencode({"key": key, "safesearch": "true", **params})
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "FlypBook/0.1"}), timeout=30) as r:
        return json.loads(r.read())["hits"]


def make_picklist():
    key = g.load_setting("PIXABAY_API_KEY")
    sections, seen = [], set()
    for query in QUERIES:
        try:
            hits = api(key, q=query, per_page=20, order="popular")
        except Exception as error:
            print(f"  {query}: search failed ({error})")
            continue
        cards = []
        for hit in hits:
            if hit["id"] in seen or hit.get("duration", 0) < MIN_SECONDS:
                continue
            seen.add(hit["id"])
            thumb = (hit["videos"].get("small") or {}).get("thumbnail", "")
            cards.append(
                f'<a href="{html.escape(hit["pageURL"])}" target="_blank" rel="noopener">'
                f'<img src="{html.escape(thumb)}" loading="lazy"><span>{hit["duration"]}s · '
                f'{html.escape(hit.get("tags", ""))}</span></a>')
            if len(cards) >= PER_QUERY:
                break
        sections.append(f"<h2>{html.escape(query)}</h2><div class=grid>{''.join(cards)}</div>")
        print(f"  {query}: {len(cards)} suggestions")
        time.sleep(0.4)
    PICKLIST.write_text(f"""<!doctype html><meta charset=utf-8><title>FlypBook video pick list</title>
<style>body{{font:14px system-ui;background:#111;color:#eee;padding:16px;max-width:1100px;margin:auto}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}}
a{{color:#ccc;text-decoration:none;font-size:12px}}img{{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;display:block}}
h2{{margin:22px 0 8px;color:#ffd43b}}</style>
<h1>Pick satisfying videos</h1><p>Click a clip, press <b>Download</b> on Pixabay, and save the .mp4 into
<code>{html.escape(str(INCOMING))}</code>. The center of each clip becomes the phone-shaped background,
so clips with the action in the middle work best.</p>{''.join(sections)}""", encoding="utf-8")
    INCOMING.mkdir(exist_ok=True)
    print(f"Pick list ready: {PICKLIST}")


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def convert_file(src, dest_mp4, dest_jpg):
    # Crop the center to 9:16, scale to phone size, drop the sound, make it start fast on the web.
    vf = f"crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale={OUT_W}:{OUT_H},fps=30"
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(src), "-t", str(CLIP_SECONDS),
                    "-vf", vf, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", str(QUALITY),
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dest_mp4)], check=True)
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-ss", "1", "-i", str(dest_mp4),
                    "-frames:v", "1", "-q:v", "6", str(dest_jpg)], check=True)


def convert_all():
    key = g.load_setting("PIXABAY_API_KEY")
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    listed = {v["id"]: v for v in json.loads(LIST.read_text(encoding="utf-8") or "[]")} if LIST.exists() else {}
    files = sorted(p for p in INCOMING.glob("*") if p.suffix.lower() in (".mp4", ".mov", ".webm"))
    print(f"{len(files)} file(s) in {INCOMING}")
    for src in files:
        # Pixabay downloads are named like "123456-789012345_large.mp4"; the first number is the video id.
        match = re.match(r"(\d+)", src.name)
        vid = f"px{match.group(1)}" if match else "local-" + re.sub(r"[^a-z0-9]+", "-", src.stem.lower())
        if vid in listed and (VIDEO_DIR / f"{vid}.mp4").exists():
            continue
        try:
            convert_file(src, VIDEO_DIR / f"{vid}.mp4", VIDEO_DIR / f"{vid}.jpg")
        except subprocess.CalledProcessError as error:
            print(f"  {src.name}: conversion failed ({error})")
            continue
        entry = {"id": vid, "url": f"videos/{vid}.mp4", "poster": f"videos/{vid}.jpg",
                 "by": "Pixabay creator", "link": "https://pixabay.com/videos/", "source": "Pixabay"}
        if match:
            try:
                hit = api(key, id=match.group(1))[0]
                entry.update(by=hit.get("user", entry["by"]), link=hit["pageURL"], tags=hit.get("tags", ""))
            except Exception:
                pass
        listed[vid] = entry
        size_kb = (VIDEO_DIR / f"{vid}.mp4").stat().st_size // 1024
        print(f"  {src.name} -> {vid}.mp4 ({size_kb} KB), credit: {entry['by']}")
        LIST.write_text(json.dumps(list(listed.values()), indent=1), encoding="utf-8")
    total_mb = sum(p.stat().st_size for p in VIDEO_DIR.glob("*.mp4")) / 1e6
    print(f"{len(listed)} videos ready ({total_mb:.0f} MB) in {VIDEO_DIR}")


if __name__ == "__main__":
    {"picklist": make_picklist, "convert": convert_all}.get(
        sys.argv[1] if len(sys.argv) > 1 else "", lambda: print(__doc__))()
