"""
Turn published FlypBook stories into vertical, TikTok-ready videos (720x1280 MP4).

Each video: the AI narration, a real-footage background (several clips back to back from web/videos), big
word-by-word captions that light up as they're read, the post title in a card while the title is read, and a
small "AI story" label the whole time.

  python make_videos.py                 render the 3 newest published stories into output/videos/
  python make_videos.py --story <id>    render one story
Needs ffmpeg (pip install imageio-ffmpeg, or the system's ffmpeg on GitHub Actions).
"""

import argparse
import json
import random
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT.parent / "web"
OUT_DIR = ROOT / "output" / "videos"
W, H = 720, 1280
WORDS_PER_LINE = 3
HIGHLIGHT = "&H005CD3F5"  # caption highlight (butter yellow), in ASS colour order (blue, green, red)


def ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def caption_font():
    """A heavy font that exists on this machine: Windows (Arial Black / Arial Bold) or Linux (DejaVu Sans Bold)."""
    for folder, name, file in [("C:/Windows/Fonts", "Arial Black", "ariblk.ttf"), ("C:/Windows/Fonts", "Arial", "arialbd.ttf"),
                               ("/usr/share/fonts/truetype/dejavu", "DejaVu Sans", "DejaVuSans-Bold.ttf")]:
        if (Path(folder) / file).exists():
            return name, Path(folder) / file
    return "Sans", None


def seconds(ms):
    s = ms / 1000
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def ass_escape(text):
    return text.replace("\\", "").replace("{", "(").replace("}", ")")


def build_captions(body, times, total_ms, title_words, font):
    """ASS subtitles: lines of a few words; the word being read is highlighted. The title also shows in a card."""
    words = body.split()
    n = min(len(words), len(times))
    starts = times[:n] + [total_ms]
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font},66,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,5,2,5,40,40,0,1
Style: Title,{font},40,&H00151515,&H00151515,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,18,0,8,60,60,170,1
Style: Tag,{font},26,&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,1,0,0,0,100,100,0,0,3,8,0,7,30,30,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = [f"Dialogue: 2,0:00:00.00,{seconds(total_ms)},Tag,,0,0,0,,FlypBook · AI story"]
    if title_words:
        title = ass_escape(" ".join(words[:title_words]))
        events.append(f"Dialogue: 1,0:00:00.00,{seconds(starts[min(title_words, n)])},Title,,0,0,0,,{title}")
    # Group into short lines, breaking early after sentence-ending punctuation.
    lines, cur = [], []
    for i in range(n):
        cur.append(i)
        if len(cur) >= WORDS_PER_LINE or re.search(r"[.!?:]$", words[i]):
            lines.append(cur); cur = []
    if cur:
        lines.append(cur)
    for line in lines:
        for i in line:
            text = " ".join((f"{{\\c{HIGHLIGHT}}}{ass_escape(words[j]).upper()}{{\\c&H00FFFFFF&}}" if j == i
                             else ass_escape(words[j]).upper()) for j in line)
            events.append(f"Dialogue: 0,{seconds(starts[i])},{seconds(starts[i + 1])},Cap,,0,0,0,,{text}")
    return header + "\n".join(events) + "\n"


def media_seconds(path):
    out = subprocess.run([ffmpeg(), "-i", str(path)], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0


def pick_clips(story_id, needed):
    """Real-footage clips (one mood per video) in a shuffled order, enough to cover the narration."""
    videos = json.loads((WEB / "videos.json").read_text(encoding="utf-8"))
    rand = random.Random(story_id)
    mood = rand.choice(["action", "action", "satisfying", "calm"])
    pool = [v for v in videos if v.get("cat", "satisfying") == mood and (WEB / v["url"]).exists()]
    rand.shuffle(pool)
    chosen, total = [], 0.0
    while total < needed + 1 and pool:
        clip = pool[len(chosen) % len(pool)]
        chosen.append(WEB / clip["url"])
        total += clip.get("seconds") or 14
    return chosen


def render(story, out_path):
    """Render one story (a row with id, title, body, audio_url, word_times) to out_path. Returns out_path."""
    work = Path(tempfile.mkdtemp(prefix="flyp-video-"))
    try:
        audio = work / "voice.mp3"
        urllib.request.urlretrieve(story["audio_url"], audio)
        total_ms = int(media_seconds(audio) * 1000) + 300
        font, font_file = caption_font()
        if font_file:  # a copy next to the captions, so ffmpeg needs no (hard to escape) folder path
            (work / "fonts").mkdir()
            shutil.copy(font_file, work / "fonts" / font_file.name)
        title_words = len(story["title"].split()) if story["body"].startswith(story["title"]) else 0
        (work / "caps.ass").write_text(build_captions(story["body"], story["word_times"], total_ms, title_words, font), encoding="utf-8")
        clips = pick_clips(story["id"], total_ms / 1000)
        (work / "clips.txt").write_text("".join(f"file '{c.as_posix()}'\n" for c in clips), encoding="utf-8")
        subs = "subtitles=caps.ass" + (":fontsdir=fonts" if font_file else "")
        # Slightly darker background so the white captions always read.
        vf = f"[0:v]scale={W}:{H},setsar=1,fps=30,eq=brightness=-0.07:saturation=1.05,{subs}[v]"
        result = subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "clips.txt", "-i", "voice.mp3",
                        "-filter_complex", vf, "-map", "[v]", "-map", "1:a", "-t", f"{total_ms / 1000:.2f}",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "out.mp4"], cwd=work, capture_output=True, text=True)
        if not (work / "out.mp4").exists():
            raise RuntimeError(f"ffmpeg failed: {result.stderr[-800:]}")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(work / "out.mp4", out_path)
        return out_path
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="Render FlypBook stories as TikTok-ready videos.")
    parser.add_argument("--story", help="one story id")
    parser.add_argument("--limit", type=int, default=3)
    args = parser.parse_args()
    from run_batch import supabase
    query = "select=id,title,body,audio_url,word_times&status=eq.published&audio_url=not.is.null&word_times=not.is.null"
    query += f"&id=eq.{args.story}" if args.story else f"&order=created_at.desc&limit={args.limit}"
    for story in supabase("GET", "stories", query) or []:
        path = render(story, OUT_DIR / f"{story['id']}.mp4")
        print(f"{path} ({path.stat().st_size // 1024} KB) {story['title'][:60]}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
