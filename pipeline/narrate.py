"""
FlypBook narration: records a story with Kokoro (a free, open-source AI voice) and works out
when each word is spoken, so the app can highlight words in sync.

Returns MP3 bytes plus one start time (in milliseconds) per word, where "words" are exactly
story_text.split(), the same way the app splits them.

Usage (test):  python narrate.py "Some text to read." --voice am_michael --out sample.mp3
Needs:  pip install kokoro lameenc   (Python 3.10-3.12)
"""

import argparse
import re

import numpy as np

SAMPLE_RATE = 24000
DEFAULT_VOICE = "am_michael"   # see VOICES below
SPEED = 1.1                    # story videos are read a little faster than normal speech
PARAGRAPH_PAUSE = 0.35         # seconds of silence between paragraphs
MP3_KBPS = 48

# A few of Kokoro's English voices that suit story narration.
VOICES = {
    "am_michael": "American male, warm and clear",
    "am_puck": "American male, upbeat",
    "af_heart": "American female, expressive (highest rated)",
    "af_bella": "American female, bright",
    "bm_george": "British male, storyteller",
}

_pipeline = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        from kokoro import KPipeline  # imported here so the rest of the pipeline works without it
        _pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    return _pipeline


def norm(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def align(words, token_times):
    """Match the app's words to Kokoro's tokens. token_times: list of (text, start_seconds or None).
    Returns a start time (seconds or None) per word."""
    starts = [None] * len(words)
    ti = 0
    for wi, word in enumerate(words):
        target = norm(word)
        if not target:          # a word that's only punctuation, like "—"
            continue
        got = ""
        first_start = None
        while ti < len(token_times) and len(got) < len(target):
            text, start = token_times[ti]
            piece = norm(text)
            ti += 1
            if not piece:
                continue
            if first_start is None and start is not None:
                first_start = start
            got += piece
            if not target.startswith(got) and not got.startswith(target):
                break  # tokens drifted (e.g. numbers read differently); interpolate this word later
        starts[wi] = first_start
    return starts


def fill_gaps(starts, total_seconds):
    """Interpolate missing word times so every word gets a sensible, increasing start time."""
    n = len(starts)
    known = [(i, t) for i, t in enumerate(starts) if t is not None]
    if not known:
        return [total_seconds * i / max(n, 1) for i in range(n)]
    out = list(starts)
    anchors = [(-1, 0.0)] + known + [(n, total_seconds)]
    for (i0, t0), (i1, t1) in zip(anchors, anchors[1:]):
        for i in range(i0 + 1, i1):
            out[i] = t0 + (t1 - t0) * (i - i0) / (i1 - i0)
    for i in range(1, n):  # keep times increasing
        out[i] = max(out[i], out[i - 1])
    return out


def synthesize(story_text, voice=DEFAULT_VOICE, speed=SPEED):
    """Returns (mp3_bytes, word_start_ms list, duration_seconds)."""
    pipeline = get_pipeline()
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n|\n", story_text) if p.strip()]
    chunks = []
    token_times = []
    offset = 0.0
    for para in paragraphs:
        for result in pipeline(para, voice=voice, speed=speed, split_pattern=None):
            audio = result.audio.numpy() if hasattr(result.audio, "numpy") else np.asarray(result.audio)
            for tok in result.tokens or []:
                start = getattr(tok, "start_ts", None)
                token_times.append((tok.text, None if start is None else offset + start))
            chunks.append(audio)
            offset += len(audio) / SAMPLE_RATE
        pause = np.zeros(int(PARAGRAPH_PAUSE * SAMPLE_RATE), dtype=np.float32)
        chunks.append(pause)
        offset += PARAGRAPH_PAUSE

    samples = np.concatenate(chunks)
    words = story_text.split()
    starts = fill_gaps(align(words, token_times), offset)
    return encode_mp3(samples), [round(t * 1000) for t in starts], offset


def encode_mp3(samples):
    import lameenc
    pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(MP3_KBPS)
    enc.set_in_sample_rate(SAMPLE_RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(pcm) + enc.flush()


def main():
    parser = argparse.ArgumentParser(description="Record text with a Kokoro voice.")
    parser.add_argument("text")
    parser.add_argument("--voice", default=DEFAULT_VOICE, choices=list(VOICES))
    parser.add_argument("--out", default="sample.mp3")
    args = parser.parse_args()
    mp3, times, seconds = synthesize(args.text, args.voice)
    with open(args.out, "wb") as f:
        f.write(mp3)
    print(f"Saved {args.out}: {seconds:.1f}s, {len(mp3) // 1024} KB")
    for word, ms in list(zip(args.text.split(), times))[:12]:
        print(f"  {ms:>6} ms  {word}")


if __name__ == "__main__":
    main()
