// FlypBook narrator: reads a story aloud and reports which word is being spoken, for
// karaoke-style highlighting.
//
// - Best: a pre-recorded AI voice (Kokoro) with exact word timings, made by the story job.
// - Fallback: the device's built-in voice (Web Speech API), one short chunk (about a sentence)
//   at a time, using "boundary" events for the current word, or a timer if there are none.
// - If there's no voice at all (or narration is off), the timer runs on its own as a read-along.

/** Split a story into words, speech chunks, and caption pages. */
function prepareStory(body) {
  const words = [];   // { text, chunk, start, end, paraEnd }
  const chunks = [];  // { text, firstWord, lastWord }
  const pages = [];   // { firstWord, lastWord }

  const paragraphs = body.split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    const tokens = para.split(/\s+/).filter(Boolean);
    let current = [];
    const flush = () => {
      if (!current.length) return;
      const ci = chunks.length;
      let text = "";
      const first = words.length;
      for (const t of current) {
        if (text) text += " ";
        words.push({ text: t, chunk: ci, start: text.length, end: text.length + t.length, paraEnd: false });
        text += t;
      }
      chunks.push({ text, firstWord: first, lastWord: words.length - 1 });
      current = [];
    };
    for (const t of tokens) {
      current.push(t);
      const n = current.length;
      const sentenceEnd = /[.!?]["'”’)\]]*$/.test(t);
      const softBreak = /[,;:—–]["'”’)\]]*$/.test(t);
      if ((sentenceEnd && n >= 4) || (softBreak && n >= 18) || n >= 28) flush();
    }
    flush();
    words[words.length - 1].paraEnd = true;
  }

  // Caption pages: short, punchy phrases (like story-video captions), breaking at natural pauses.
  let first = 0;
  for (let i = 0; i < words.length; i++) {
    const n = i - first + 1;
    const t = words[i].text;
    const sentenceEnd = /[.!?]["'”’)\]]*$/.test(t);
    const softBreak = /[,;:—–]["'”’)\]]*$/.test(t);
    if (words[i].paraEnd || (sentenceEnd && n >= 3) || (softBreak && n >= 6) || n >= 10) {
      pages.push({ firstWord: first, lastWord: i });
      first = i + 1;
    }
  }
  if (first < words.length) pages.push({ firstWord: first, lastWord: words.length - 1 });
  words.forEach((w, i) => { w.page = pages.findIndex(p => i >= p.firstWord && i <= p.lastWord); });
  return { words, chunks, pages };
}

class Narrator {
  constructor({ onWord, onEnd, onBlocked }) {
    this.onWord = onWord;
    this.onEnd = onEnd;
    this.onBlocked = onBlocked;  // the browser refused sound before the first tap
    this.muted = false;
    this.token = 0;          // bumps on every stop, so stale callbacks are ignored
    this.timer = null;
    this.voice = null;
    this.supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    if (this.supported) {
      this.pickVoice();
      speechSynthesis.addEventListener?.("voiceschanged", () => this.pickVoice());
    }
    // One shared audio element: once a tap has "unlocked" it, phones let it keep playing
    // new stories after a swipe.
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.setAttribute("playsinline", "");
  }

  pickVoice() {
    const voices = speechSynthesis.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
    if (!voices.length) return;
    const score = v =>
      (/natural|neural|premium|enhanced/i.test(v.name) ? 8 : 0) +
      (/en[-_]US/i.test(v.lang) ? 4 : 0) +
      (/samantha|aria|jenny|guy|google us english/i.test(v.name) ? 3 : 0) +
      (v.localService ? 1 : 0) + (v.default ? 1 : 0);
    // Keep the best few English voices; each story picks one (story.voiceSeed), so the
    // phone's own voice changes from story to story too.
    this.voices = voices.sort((a, b) => score(b) - score(a)).slice(0, 4);
    this.voice = this.voices[0];
  }

  get hasVoice() {
    return this.supported && speechSynthesis.getVoices().length > 0;
  }

  /** Start reading `story` (from prepareStory) at word index `from`. */
  play(story, from, { rate = 1, narration = true, muted = false } = {}) {
    this.stop();
    this.story = story;
    this.rate = rate;
    this.current = from;
    this.muted = muted;
    const token = this.token;
    if (narration && story.audioUrl && story.times?.length === story.words.length) {
      this.playAudio(from, token);            // muted audio still drives the word timing
    } else if (narration && !muted && this.supported) {
      this.speakChunk(story.words[from].chunk, from, token);
    } else {
      this.runTimer(from, story.words.length - 1, token, true);
    }
  }

  /** Turn sound on/off without restarting (same audio element keeps playing in sync). */
  setMuted(muted) {
    this.muted = muted;
    this.audio.muted = muted;
  }

  stop() {
    this.token++;
    clearTimeout(this.timer);
    this.timer = null;
    this.audio.pause();
    if (this.supported) speechSynthesis.cancel();
  }

  /** Play the pre-recorded narration, highlighting words from its timing data. */
  playAudio(from, token) {
    const { audioUrl, times, words } = this.story;
    const a = this.audio;
    const startAt = times[from] / 1000;
    if (!a.src.endsWith(audioUrl)) a.src = audioUrl;
    a.playbackRate = this.rate;
    a.preservesPitch = true;
    const seek = () => { if (Math.abs(a.currentTime - startAt) > 0.25) a.currentTime = startAt; };
    if (a.readyState >= 1) seek(); else a.addEventListener("loadedmetadata", seek, { once: true });
    a.muted = this.muted;
    // play() runs right away (inside the tap) so phones allow the sound.
    a.play().catch(err => {
      if (token !== this.token) return;
      // Sound isn't allowed until the first tap: let the app restart muted (allowed) instead.
      if (err?.name === "NotAllowedError" && !this.muted && this.onBlocked) { this.onBlocked(); return; }
      // Audio failed to load or was blocked: fall back to the device voice.
      this.story = { ...this.story, audioUrl: null };
      this.play(this.story, this.current, { rate: this.rate, narration: true });
    });
    a.onended = () => this.finish(token);
    this.onWord(from);
    const sync = () => {
      if (token !== this.token || a.paused) return;
      const ms = a.currentTime * 1000;
      let lo = 0, hi = words.length - 1;
      while (lo < hi) {  // last word whose start time has passed
        const mid = (lo + hi + 1) >> 1;
        if (times[mid] <= ms + 40) lo = mid; else hi = mid - 1;
      }
      this.emit(lo, token);
    };
    // Smooth updates every frame, plus the audio's own time events as a backup.
    a.ontimeupdate = sync;
    const tick = () => {
      if (token !== this.token) return;
      sync();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  emit(i, token) {
    if (token !== this.token || i === this.current) return;
    this.current = i;
    this.onWord(i);
  }

  speakChunk(ci, from, token) {
    const { words, chunks } = this.story;
    const chunk = chunks[ci];
    const offset = words[from].start;
    const u = new SpeechSynthesisUtterance(chunk.text.slice(offset));
    const voice = this.voices?.length ? this.voices[(this.story.voiceSeed || 0) % this.voices.length] : this.voice;
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-US"; }
    u.rate = this.rate;

    let gotBoundary = false;
    let started = false;
    this.current = from;
    this.onWord(from);

    u.onstart = () => {
      started = true;
      // No word events soon after starting? Estimate timing with a timer instead.
      this.timer = setTimeout(() => {
        if (!gotBoundary && token === this.token) this.runTimer(this.current, chunk.lastWord, token, false);
      }, 500);
    };
    u.onboundary = e => {
      if (token !== this.token || (e.name && e.name !== "word")) return;
      gotBoundary = true;
      clearTimeout(this.timer);
      const pos = offset + e.charIndex;
      let i = from;
      while (i < chunk.lastWord && words[i + 1].start <= pos) i++;
      this.emit(i, token);
    };
    u.onend = () => {
      if (token !== this.token) return;
      clearTimeout(this.timer);
      if (ci + 1 < chunks.length) this.speakChunk(ci + 1, chunks[ci + 1].firstWord, token);
      else this.finish(token);
    };
    u.onerror = e => {
      if (token !== this.token || e.error === "interrupted" || e.error === "canceled") return;
      // The voice failed: keep going as a silent read-along.
      this.runTimer(this.current, words.length - 1, token, true);
    };
    speechSynthesis.speak(u);

    // Some browsers never start speaking (no voices, blocked audio). Fall back after 2.5s.
    setTimeout(() => {
      if (!started && token === this.token) {
        speechSynthesis.cancel();
        this.token++;
        const t = this.token;
        this.runTimer(this.current, words.length - 1, t, true);
      }
    }, 2500);
  }

  /** Advance words on a timer from `from` to `to`. Ends the story if `finishAtEnd`. */
  runTimer(from, to, token, finishAtEnd) {
    const { words } = this.story;
    const wpm = (finishAtEnd ? 190 : 170) * this.rate;  // read-along is a bit quicker than speech
    const base = 60000 / wpm;
    const step = i => {
      if (token !== this.token) return;
      this.emit(i, token);
      const t = words[i].text;
      let ms = base * (0.55 + 0.45 * Math.min(t.length, 12) / 5);
      if (/[.!?]["'”’)\]]*$/.test(t)) ms += base * 0.9;
      else if (/[,;:—–]["'”’)\]]*$/.test(t)) ms += base * 0.4;
      if (i >= to) {
        if (finishAtEnd) this.timer = setTimeout(() => this.finish(token), ms);
        return;  // when speaking, the utterance's end event moves to the next chunk
      }
      this.timer = setTimeout(() => step(i + 1), ms);
    };
    step(from);
  }

  finish(token) {
    if (token !== this.token) return;
    this.token++;
    this.onEnd();
  }
}
