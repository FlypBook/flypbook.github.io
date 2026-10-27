// FlypBook background animations, drawn entirely in code (no video files, nothing to download).
// Each story card gets its own canvas, so the animation swipes away with its story.
// Only the card on screen animates; the cards next to it show a still frame.
// 2D scenes draw with draw(ctx, w, h, dt). 3D scenes (game3d.js, marked `static webgl = true`)
// own a WebGL renderer: mount(canvas), resize(w, h), draw(dt), dispose().

// The 3D scenes load as a separate module; the app waits for this (briefly) before picking scenes.
window.gamesReady = new Promise(resolve => { window.resolveGames = resolve; });

class SceneRenderer {
  constructor(canvas, seed) {
    this.canvas = canvas;
    const Scene = pickScene(seed);
    this.scene = new Scene(mulberry32(seed));
    this.gl = !!Scene.webgl;
    if (this.gl) this.scene.mount(canvas);
    else this.ctx = canvas.getContext("2d");
    this.running = false;
    this.ready = false;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.w = r.width;
    this.h = r.height;
    if (this.gl) {
      this.scene.resize(this.w, this.h);
      this.ready = true;
      this.scene.draw(1);  // a first frame so a still card doesn't look empty
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scene.init(this.w, this.h);
    this.ready = true;
    // Warm up a few frames so a still card doesn't look empty.
    for (let i = 0; i < 30; i++) this.scene.draw(this.ctx, this.w, this.h, 1);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = t => {
      if (!this.running) return;
      if (this.ready && !document.hidden) {
        const dt = Math.min((t - this.last) / 16.67, 3);  // 1 = one 60fps frame
        if (this.gl) this.scene.draw(dt); else this.scene.draw(this.ctx, this.w, this.h, dt);
      }
      this.last = t;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop() { this.running = false; }

  /** Free the GPU (phones only allow a few WebGL canvases at once). */
  dispose() {
    this.running = false;
    this.observer.disconnect();
    if (this.gl) this.scene.dispose();
  }
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Scene 1: glowing orbs bouncing and leaving trails ----------
class OrbsScene {
  constructor(rand) { this.rand = rand; this.hue = rand() * 360; }
  init(w, h) {
    const r = this.rand;
    this.orbs = Array.from({ length: 14 }, () => ({
      x: r() * w, y: r() * h, vx: (r() - 0.5) * 4, vy: (r() - 0.5) * 4,
      size: 8 + r() * 18, hue: r() * 120,
    }));
  }
  draw(ctx, w, h, dt) {
    ctx.fillStyle = "rgba(14, 11, 22, 0.28)";
    ctx.fillRect(0, 0, w, h);
    this.hue = (this.hue + 0.3 * dt) % 360;
    ctx.globalCompositeOperation = "lighter";
    for (const o of this.orbs) {
      o.vy += 0.12 * dt;
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < o.size) { o.x = o.size; o.vx = Math.abs(o.vx); }
      if (o.x > w - o.size) { o.x = w - o.size; o.vx = -Math.abs(o.vx); }
      if (o.y > h - o.size) { o.y = h - o.size; o.vy = -Math.abs(o.vy) * 0.98 - 0.4; }
      if (o.y < o.size) { o.y = o.size; o.vy = Math.abs(o.vy); }
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.size * 2.2);
      const hue = (this.hue + o.hue) % 360;
      g.addColorStop(0, `hsla(${hue}, 95%, 65%, 0.5)`);
      g.addColorStop(1, `hsla(${hue}, 95%, 50%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.size * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
}

// ---------- Scene 2: layered flowing waves ----------
class WavesScene {
  constructor(rand) { this.rand = rand; this.t = rand() * 1000; this.hue = 180 + rand() * 120; }
  init() {}
  draw(ctx, w, h, dt) {
    this.t += 0.02 * dt;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, `hsl(${this.hue + 40}, 45%, 12%)`);
    sky.addColorStop(1, `hsl(${this.hue}, 55%, 20%)`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let layer = 0; layer < 5; layer++) {
      const base = h * (0.35 + layer * 0.14);
      const amp = 10 + layer * 6;
      const speed = 0.6 + layer * 0.35;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 8; x += 8) {
        const y = base
          + Math.sin(x * 0.012 + this.t * speed + layer) * amp
          + Math.sin(x * 0.031 - this.t * speed * 0.7) * amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = `hsla(${this.hue + layer * 14}, 80%, ${35 + layer * 8}%, ${0.35 + layer * 0.12})`;
      ctx.fill();
    }
  }
}

// ---------- Scene 3: a little block runner hopping across endless platforms ----------
class RunnerScene {
  constructor(rand) { this.rand = rand; this.hue = rand() * 360; }
  init(w, h) {
    this.ground = h * 0.72;
    this.speed = 3.2;
    this.platforms = [];
    let x = -20;
    while (x < w * 2) x = this.addPlatform(x);
    this.runner = { x: w * 0.28, y: this.ground - 26, vy: 0, size: 22, onGround: true, step: 0 };
    this.stars = Array.from({ length: 40 }, () => ({ x: this.rand() * w, y: this.rand() * h * 0.6, z: 0.2 + this.rand() * 0.8 }));
    this.offset = 0;
  }
  addPlatform(x) {
    const r = this.rand;
    const width = 90 + r() * 160;
    const lift = (r() - 0.5) * 40;
    this.platforms.push({ x, w: width, y: this.ground + lift });
    return x + width + 40 + r() * 50;  // gap
  }
  platformAt(x) { return this.platforms.find(p => x >= p.x && x <= p.x + p.w); }
  draw(ctx, w, h, dt) {
    const move = this.speed * dt;
    this.offset += move;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, `hsl(${this.hue}, 50%, 10%)`);
    sky.addColorStop(1, `hsl(${this.hue + 30}, 55%, 22%)`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (const s of this.stars) {
      s.x -= move * s.z * 0.15;
      if (s.x < 0) s.x += w;
      ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2);
    }
    // distant hills
    ctx.fillStyle = `hsla(${this.hue + 30}, 40%, 18%, 0.9)`;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 10; x += 10) {
      ctx.lineTo(x, h * 0.55 + Math.sin((x + this.offset * 0.3) * 0.01) * 22 + Math.sin((x + this.offset * 0.3) * 0.023) * 10);
    }
    ctx.lineTo(w, h); ctx.fill();

    for (const p of this.platforms) p.x -= move;
    while (this.platforms.length && this.platforms[0].x + this.platforms[0].w < -50) this.platforms.shift();
    let tail = this.platforms[this.platforms.length - 1];
    while (tail.x + tail.w < w * 2) { this.addPlatform(tail.x + tail.w + 40 + this.rand() * 50); tail = this.platforms[this.platforms.length - 1]; }
    for (const p of this.platforms) {
      ctx.fillStyle = `hsl(${this.hue + 180}, 60%, 55%)`;
      ctx.fillRect(p.x, p.y, p.w, 6);
      ctx.fillStyle = `hsl(${this.hue + 200}, 35%, 25%)`;
      ctx.fillRect(p.x, p.y + 6, p.w, h - p.y);
    }

    const r = this.runner;
    const feet = r.y + r.size;
    const under = this.platformAt(r.x + r.size / 2);
    // Jump when the platform ends just ahead, or the next one is higher.
    const ahead = this.platformAt(r.x + r.size + 28);
    if (r.onGround && (!ahead || (under && ahead !== under && ahead.y < under.y - 4))) {
      r.vy = -9.5; r.onGround = false;
    }
    r.vy += 0.5 * dt;
    r.y += r.vy * dt;
    const land = this.platformAt(r.x + r.size / 2);
    if (land && r.vy >= 0 && feet <= land.y + 12 && r.y + r.size >= land.y) {
      r.y = land.y - r.size; r.vy = 0; r.onGround = true;
    }
    if (r.y > h) { r.y = this.ground - 120; r.vy = 0; }  // fell: drop back in from above
    r.step += dt * (r.onGround ? 0.35 : 0);

    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(r.x, r.y, r.size, r.size * 0.8);
    ctx.fillStyle = "#1b1400";
    ctx.fillRect(r.x + r.size * 0.62, r.y + r.size * 0.22, 4, 4);
    ctx.fillStyle = "#ffd23f";
    const leg = Math.sin(r.step) * 5;
    ctx.fillRect(r.x + 3 + leg, r.y + r.size * 0.8, 5, r.size * 0.2);
    ctx.fillRect(r.x + r.size - 8 - leg, r.y + r.size * 0.8, 5, r.size * 0.2);
  }
}

// ---------- Scene 4: pendulum wave (each ball swings a little faster than the last) ----------
class PendulumScene {
  constructor(rand) { this.rand = rand; this.t = 0; this.hue = rand() * 360; }
  init(w, h) { this.n = 15; }
  draw(ctx, w, h, dt) {
    this.t += 0.016 * dt;
    ctx.fillStyle = "rgba(11, 8, 18, 0.35)";
    ctx.fillRect(0, 0, w, h);
    const top = h * 0.12;
    for (let i = 0; i < this.n; i++) {
      const len = h * 0.3 + i * (h * 0.5 / this.n);
      const freq = (51 + i) / 60;                       // classic pendulum-wave timing
      const angle = Math.sin(this.t * freq * Math.PI * 2 * 0.25) * 0.6;
      const x = w / 2 + Math.sin(angle) * len;
      const y = top + Math.cos(angle) * len;
      const hue = (this.hue + i * 18) % 360;
      ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.18)`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(w / 2, top); ctx.lineTo(x, y); ctx.stroke();
      const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
      g.addColorStop(0, `hsla(${hue}, 95%, 72%, 1)`);
      g.addColorStop(1, `hsla(${hue}, 95%, 55%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// Each scene has a weight: higher = shows up more often. gameplay.js adds more.
const SCENES = [
  { cls: OrbsScene, weight: 0.5 },
  { cls: WavesScene, weight: 0.3 },
  { cls: RunnerScene, weight: 0.5 },
  { cls: PendulumScene, weight: 0.5 },
];

/** Same seed always gets the same scene. Add ?scene=ParkourScene to the URL to test one. */
function pickScene(seed) {
  const forced = new URLSearchParams(location.search).get("scene");
  const match = SCENES.find(s => s.cls.name === forced);
  if (match) return match.cls;
  // When the 3D scenes are available, they replace their flat 2D stand-ins.
  const has3d = SCENES.some(s => s.cls.webgl);
  let pool = SCENES.filter(s => !(has3d && s.fallback));
  // app.js sets window.FlypScenes: which scenes the reader's settings allow, and how much their
  // taste model says they enjoy each one (scenes they watch longer show up more).
  const prefs = window.FlypScenes;
  if (prefs) { const allowed = pool.filter(s => prefs.allow(s.cls.name)); if (allowed.length) pool = allowed; }
  const weight = s => s.weight * (prefs ? prefs.weight(s.cls.name) : 1);
  const total = pool.reduce((n, s) => n + weight(s), 0);
  let roll = (mulberry32(seed)() * total);
  for (const s of pool) { roll -= weight(s); if (roll <= 0) return s.cls; }
  return pool[0].cls;
}
