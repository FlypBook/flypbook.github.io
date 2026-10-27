"""Record the same short passage in several voices so you can pick. Saves to voice-samples/.

Usage:  python make_voice_samples.py                 (the voices in narrate.VOICES)
        python make_voice_samples.py af_sky af_nova  (specific voices; "a,b" blends two voices)
"""
import sys
import time
from pathlib import Path

import narrate

TEXT = """AITA for refusing to give my little brother my old phone?

So my parents told me, two hours before his birthday party, that my "present" to him was going to be my phone. The one I paid for. With my own job money.

"You're getting a new one anyway," my mom said. Which, okay, technically true. But that's not the point."""

voices = sys.argv[1:] or list(narrate.VOICES)
out = Path(__file__).resolve().parent.parent / "voice-samples"
out.mkdir(exist_ok=True)
for voice in voices:
    start = time.time()
    mp3, times, seconds = narrate.synthesize(TEXT, voice)
    name = voice.replace(",", "+")
    (out / f"{name}.mp3").write_bytes(mp3)
    print(f"{name:22} {seconds:5.1f}s audio, made in {time.time() - start:4.1f}s")
