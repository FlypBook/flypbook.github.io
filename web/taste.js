// FlypBook taste model: learns what each reader likes, right on their phone (free, no server).
// It's a small online "pattern recognition" model (logistic regression). Every story is described by
// features: its kind, tone, kind+tone pair, length, reading level, narrator voice, who wrote it, and
// the background it played over. After each story the model nudges those features' weights toward
// how much the reader engaged (read to the end, liked, saved, shared, commented... or swiped away fast).
// The For You feed then ranks stories by predicted enjoyment, plus a little curiosity for things the
// model hasn't tried yet. Guests keep it on this device; signed-in readers get it synced to their account.

const TASTE_KEY = "flypbook-taste";
const MAX_FEATURES = 400;
const VOICES = ["af_heart", "af_heart,af_sky", "am_liam"];   // same rotation as pipeline/run_batch.py

class TasteModel {
  constructor(saved = {}) {
    this.w = saved.w || {};       // weight per feature: above 0 = likes it, below 0 = doesn't
    this.n = saved.n || {};       // how many stories with that feature it has learned from
    this.b = saved.b || 0;        // overall bias
    this.seen = saved.seen || 0;  // stories learned from
    this.seeded = !!saved.seeded; // already learned from the account's past likes/finishes
  }

  /** Features describing a story (and, optionally, what played behind it). */
  static features(d, bg) {
    const f = [`g:${d.genre}`, `t:${d.tone}`, `gt:${d.genre}|${d.tone}`, `lv:${d.reading_level}`,
               `len:${(d.est_read_seconds || 0) < 180 ? "short" : "long"}`, `src:${d.source || "ai"}`];
    if (d.author) f.push(`a:${d.author}`);
    const voice = TasteModel.voiceOf(d);
    if (voice) f.push(`v:${voice}`);
    if (bg) f.push(`bg:${bg}`);
    return f;
  }
  /** Which recorded voice a story uses (the pipeline picks it from the story id). */
  static voiceOf(d) {
    if (!d.audio_url || !d.id) return null;
    try { return VOICES[Number(BigInt("0x" + d.id.replace(/-/g, "")) % BigInt(VOICES.length))]; } catch { return null; }
  }

  raw(f) { return this.b + f.reduce((s, k) => s + (this.w[k] || 0), 0); }
  /** Predicted chance (0-1) the reader enjoys a story with these features. */
  predict(f) { return 1 / (1 + Math.exp(-this.raw(f))); }
  /** 0-1: how new these features are to the model (used for exploring). */
  novelty(f) { return f.reduce((s, k) => s + 1 / Math.sqrt(1 + (this.n[k] || 0)), 0) / f.length; }

  /** Learn from one story. label: 0 = didn't enjoy, 1 = loved it. weight: how strong the signal is. */
  learn(f, label, weight = 1) {
    const err = label - this.predict(f);
    for (const k of f) {
      const step = 0.3 * weight / Math.sqrt(1 + (this.n[k] || 0) * 0.15);   // big steps at first, steadier later
      this.w[k] = (this.w[k] || 0) * 0.998 + step * err;                    // slight decay so tastes can change
      this.n[k] = (this.n[k] || 0) + 1;
    }
    this.b += 0.03 * err;
    this.seen++;
    this.save();
  }

  /** What the model has learned, in plain words, for the profile page. */
  explain() {
    // Skip pairs and "who wrote it" (nearly every story is AI-written, so that one says little).
    const known = Object.keys(this.w).filter(k => (this.n[k] || 0) >= 2 && !k.startsWith("gt:") && !k.startsWith("src:"));
    const sorted = known.sort((a, b) => this.w[b] - this.w[a]);
    return {
      likes: sorted.filter(k => this.w[k] > 0.15).slice(0, 6).map(TasteModel.label),
      dislikes: sorted.filter(k => this.w[k] < -0.15).reverse().slice(0, 4).map(TasteModel.label),
    };
  }
  static label(k) {
    const [type, value] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)];
    const scene = v => v.replace(/(3D|Scene)$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    return ({
      g: () => `${value} stories`, t: () => `${value} stories`, lv: () => `${value} reads`,
      len: () => (value === "short" ? "quick reads" : "longer reads"),
      src: () => (value === "user" ? "stories by readers" : "AI stories"),
      a: () => `stories by @${value}`,
      v: () => ({ "af_heart": "the Heart voice", "af_heart,af_sky": "the Sky voice", "am_liam": "the Liam voice" }[value] || "this voice"),
      bg: () => `${scene(value)} backgrounds`,
    }[type] || (() => value))();
  }

  /** How much a background scene should show up for this reader (1 = normal). */
  sceneWeight(name) { return Math.exp(Math.max(-1.5, Math.min(1.5, (this.w[`bg:${name}`] || 0) * 1.5))); }

  toJSON() {
    // Keep only the most useful features so the saved model stays small.
    let keys = Object.keys(this.w);
    if (keys.length > MAX_FEATURES) {
      keys = keys.sort((a, b) => Math.abs(this.w[b]) * Math.log1p(this.n[b] || 0) - Math.abs(this.w[a]) * Math.log1p(this.n[a] || 0))
        .slice(0, MAX_FEATURES);
    }
    const w = {}, n = {};
    for (const k of keys) { w[k] = Math.round(this.w[k] * 1000) / 1000; n[k] = this.n[k] || 0; }
    return { w, n, b: Math.round(this.b * 1000) / 1000, seen: this.seen, seeded: this.seeded };
  }
  save() {
    try { localStorage.setItem(TASTE_KEY, JSON.stringify(this)); } catch {}
    this.onChange?.(this);
  }
  static load() {
    try { return new TasteModel(JSON.parse(localStorage.getItem(TASTE_KEY) || "{}")); } catch { return new TasteModel(); }
  }
}

window.taste = TasteModel.load();
