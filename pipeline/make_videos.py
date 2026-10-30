"""
Turn published FlypBook stories into vertical, TikTok-ready videos (720x1280 MP4).

Each video: the AI narration, a real-footage background (several clips back to back from web/videos), big
word-by-word captions that light up as they're read, and the post title in a card while the title is read.
(The AI-generated label is TikTok's own, switched on when posting.)

Long stories become Part 1 and Part 2, split right after a sentence near the middle; Part 1 ends on
"FOLLOW FOR PART 2". The last part ends on a comment or follow prompt.

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
# Long stories are posted as Part 1 / Part 2: people follow so they don't miss the ending.
SPLIT_OVER_MS = 95_000     # stories longer than this get split
END_CARD_MS = 2600         # how long the closing prompt shows


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
    s = max(ms, 0) / 1000
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def ass_escape(text):
    return text.replace("\\", "").replace("{", "(").replace("}", ")")


def build_captions(words, starts, title_words, font, card=None, end_card=None):
    """ASS subtitles for one video: lines of a few words, the word being read highlighted.
    words: the words in this video; starts: their start times (ms from the video's start) plus the end time.
    card: (text, until_ms) in the white card at the top. end_card: (text, from_ms) shown big near the bottom."""
    n = len(words)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font},66,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,5,2,5,40,40,0,1
Style: Title,{font},40,&H00151515,&H00151515,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,18,0,8,60,60,170,1
Style: End,{font},56,&H00151515,&H00151515,{HIGHLIGHT},{HIGHLIGHT},1,0,0,0,100,100,0,0,3,22,0,2,60,60,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    if card:
        events.append(f"Dialogue: 1,0:00:00.00,{seconds(card[1])},Title,,0,0,0,,{ass_escape(card[0])}")
    if end_card:
        events.append(f"Dialogue: 2,{seconds(end_card[1])},{seconds(starts[-1])},End,,0,0,0,,{ass_escape(end_card[0])}")
    # Group into short lines, breaking early after sentence-ending punctuation. The title words are in the card.
    lines, cur = [], []
    for i in range(title_words, n):
        cur.append(i)
        if len(cur) >= WORDS_PER_LINE or re.search(r"[.!?:]$", words[i]):
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)
    for line in lines:
        for i in line:
            text = " ".join((f"{{\\c{HIGHLIGHT}}}{ass_escape(words[j]).upper()}{{\\c&H00FFFFFF&}}" if j == i
                             else ass_escape(words[j]).upper()) for j in line)
            events.append(f"Dialogue: 0,{seconds(starts[i])},{seconds(starts[i + 1])},Cap,,0,0,0,,{text}")
    return header + "\n".join(events) + "\n"


def split_point(words, times, title_words, total_ms):
    """Index of the first word of Part 2: right after a sentence ends, as close to halfway as possible.
    None if the story is short enough for one video."""
    if total_ms <= SPLIT_OVER_MS:
        return None
    best = None
    for i in range(title_words + 1, min(len(words), len(times))):
        if re.search(r"[.!?][\"']?$", words[i - 1]) and 0.38 * total_ms < times[i] < 0.62 * total_ms:
            if best is None or abs(times[i] - total_ms / 2) < abs(times[best] - total_ms / 2):
                best = i
    return best


def closing_prompt(genre, part):
    if part == 1:
        return "FOLLOW FOR PART 2"
    if genre in ("aita", "family drama", "friendship drama", "roommate drama", "workplace drama"):
        return "WAS I WRONG? COMMENT"
    return "FOLLOW FOR MORE STORIES"


def media_seconds(path):
    out = subprocess.run([ffmpeg(), "-i", str(path)], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0


def pick_clips(seed, needed):
    """Real-footage clips (one mood per video) in a shuffled order, enough to cover the narration."""
    videos = json.loads((WEB / "videos.json").read_text(encoding="utf-8"))
    rand = random.Random(seed)
    mood = rand.choice(["action", "action", "satisfying", "calm"])
    pool = [v for v in videos if v.get("cat", "satisfying") == mood and (WEB / v["url"]).exists()]
    rand.shuffle(pool)
    chosen, total = [], 0.0
    while total < needed + 1 and pool:
        clip = pool[len(chosen) % len(pool)]
        chosen.append(WEB / clip["url"])
        total += clip.get("seconds") or 14
    return chosen


def title_word_count(story):
    return len(story["title"].split()) if story["body"].startswith(story["title"]) else 0


def parts_needed(story):
    """[None] for one video, or [1, 2] when the story is long enough to split."""
    words, times = story["body"].split(), story["word_times"]
    est_ms = (times[-1] if times else 0) + 1500
    n = min(len(words), len(times))
    return [1, 2] if split_point(words[:n], times[:n], title_word_count(story), est_ms) is not None else [None]


def render(story, out_path, part=None):
    """Render one story (a row with id, title, body, audio_url, word_times, genre) to out_path.
    part: None for the whole story, or 1 / 2 for its halves. Returns out_path."""
    work = Path(tempfile.mkdtemp(prefix="flyp-video-"))
    try:
        audio = work / "voice.mp3"
        urllib.request.urlretrieve(story["audio_url"], audio)
        total_ms = int(media_seconds(audio) * 1000) + 300
        font, font_file = caption_font()
        if font_file:  # a copy next to the captions, so ffmpeg needs no (hard to escape) folder path
            (work / "fonts").mkdir()
            shutil.copy(font_file, work / "fonts" / font_file.name)
        words = story["body"].split()
        n = min(len(words), len(story["word_times"]))
        words, times = words[:n], list(story["word_times"][:n])
        title_words = title_word_count(story)
        cut = split_point(words, times, title_words, total_ms) if part else None
        if cut is None:
            part = None  # one video (or too short to split after all)
        if part == 2:
            start_ms, end_ms = times[cut] - 250, total_ms
            words, times, title_words = words[cut:], [t - start_ms for t in times[cut:]], 0
            card = (f"Part 2: {story['title']}", 3500)
        else:
            start_ms = 0
            end_ms = times[cut] - 250 if part == 1 else total_ms
            if part == 1:
                words, times = words[:cut], times[:cut]
            card = (("Part 1: " if part == 1 else "") + story["title"], times[min(title_words, len(times) - 1)]) if title_words else None
        dur_ms = end_ms - start_ms + (END_CARD_MS if part == 1 else 0)  # Part 1 holds on the cliffhanger for the prompt
        end_card = (closing_prompt(story.get("genre"), part), max(0, dur_ms - END_CARD_MS))
        (work / "caps.ass").write_text(build_captions(words, times + [dur_ms], title_words, font, card, end_card), encoding="utf-8")
        clips = pick_clips(f"{story['id']}{part or ''}", dur_ms / 1000)
        (work / "clips.txt").write_text("".join(f"file '{c.as_posix()}'\n" for c in clips), encoding="utf-8")
        subs = "subtitles=caps.ass" + (":fontsdir=fonts" if font_file else "")
        # Slightly darker background so the white captions always read. The voice is padded with silence.
        vf = f"[0:v]scale={W}:{H},setsar=1,fps=30,eq=brightness=-0.07:saturation=1.05,{subs}[v];[1:a]apad[a]"
        result = subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "clips.txt",
                                 "-ss", f"{start_ms / 1000:.3f}", "-t", f"{(end_ms - start_ms) / 1000:.3f}", "-i", "voice.mp3",
                                 "-filter_complex", vf, "-map", "[v]", "-map", "[a]", "-t", f"{dur_ms / 1000:.2f}",
                                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                                 "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "out.mp4"],
                                cwd=work, capture_output=True, text=True)
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
    query = "select=id,title,body,audio_url,word_times,genre&status=eq.published&audio_url=not.is.null&word_times=not.is.null"
    query += f"&id=eq.{args.story}" if args.story else f"&order=created_at.desc&limit={args.limit}"
    for story in supabase("GET", "stories", query) or []:
        for part in parts_needed(story):
            path = render(story, OUT_DIR / f"{story['id']}{'-part' + str(part) if part else ''}.mp4", part)
            print(f"{path} ({path.stat().st_size // 1024} KB) {story['title'][:60]}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
