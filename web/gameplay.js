// FlypBook gameplay-style backgrounds: original, code-drawn scenes with nonstop motion,
// in the spirit of the footage behind story videos. All endless, nothing to download.

// ---------- Shared 3D helpers ----------
function mixColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function shade(hex, f) {
  const p = parseInt(hex.slice(1), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(((p >> s) & 255) * f)));
  return "#" + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, "0")).join("");
}

// ---------- Sky Parkour: first-person run and jumps across floating blocks ----------
const PARKOUR_WORLDS = [
  { sky: ["#3d9bff", "#bfe6ff"], top: "#4cd964", side: "#9b6236", fog: "#bfe6ff", sun: "#fff6c9" },  // grassy day
  { sky: ["#090418", "#3b0f63"], top: "#ff3df0", side: "#3a1c6e", fog: "#3b0f63", sun: "#7af7ff" },  // neon night
  { sky: ["#ff9ec7", "#ffe3f0"], top: "#5ef2d6", side: "#ff6fae", fog: "#ffe3f0", sun: "#ffffff" },  // candy
  { sky: ["#1a0b0b", "#5a1a0e"], top: "#ff8a1f", side: "#3b2a2a", fog: "#5a1a0e", sun: "#ffcf5a" },  // lava night
];
const MAX_FOG = 0.6;

class ParkourScene {
  constructor(rand) {
    this.rand = rand;
    this.world = PARKOUR_WORLDS[Math.floor(rand() * PARKOUR_WORLDS.length)];
  }
  init(w, h) {
    this.cam = { x: 0.5, y: 2.6, z: 0.5 };
    this.platforms = [{ x: 0, z0: -2, len: 5, top: 1 }];
    this.islands = [];
    this.t = 0;
    this.extend();
  }
  extend() {
    const r = this.rand;
    let last = this.platforms[this.platforms.length - 1];
    while (last.z0 + last.len < this.cam.z + 40) {
      const gap = 1 + Math.floor(r() * 3);
      last = {
        x: Math.max(-2, Math.min(2, last.x + Math.floor(r() * 3) - 1)),
        z0: last.z0 + last.len + gap,
        len: 1 + Math.floor(r() * 3),
        top: Math.max(0, Math.min(4, last.top + Math.floor(r() * 3) - 1)),
      };
      this.platforms.push(last);
      if (r() < 0.6) this.islands.push({ x: (r() < 0.5 ? -1 : 1) * (5 + r() * 7), y: r() * 6 - 1, z: last.z0 + r() * 4, s: 1 + Math.floor(r() * 2) });
    }
    while (this.platforms.length > 2 && this.platforms[1].z0 + this.platforms[1].len < this.cam.z - 2) this.platforms.shift();
    this.islands = this.islands.filter(i => i.z > this.cam.z - 2);
  }
  /** Where the runner's feet should be at depth z (jump arcs over gaps). */
  path(z) {
    const ps = this.platforms;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i], next = ps[i + 1];
      const takeoff = p.z0 + p.len - 0.35;
      if (z >= p.z0 - 0.2 && z <= takeoff) return { x: p.x + 0.5, y: p.top, ground: true };
      if (next && z > takeoff && z < next.z0 + 0.25) {
        const t = (z - takeoff) / (next.z0 + 0.25 - takeoff);
        const lift = 1.1 + (next.z0 - takeoff) * 0.28;
        return { x: p.x + 0.5 + (next.x - p.x) * t, y: p.top + (next.top - p.top) * t + lift * 4 * t * (1 - t), ground: false };
      }
    }
    return { x: 0.5, y: 1, ground: true };
  }
  draw(ctx, w, h, dt) {
    const W = this.world;
    this.t += dt / 60;
    const cam = this.cam;
    cam.z += 0.085 * dt;
    const p = this.path(cam.z);
    cam.x += (p.x - cam.x) * Math.min(1, 0.12 * dt);
    const bob = p.ground ? Math.sin(this.t * 14) * 0.05 : 0;
    cam.y = p.y + 1.55 + bob;
    this.extend();

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, W.sky[0]); sky.addColorStop(1, W.sky[1]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = W.sun; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(w * 0.72, h * 0.2, Math.min(w, h) * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    const f = h * 0.85, horizon = h * 0.42;
    const sway = (p.x - cam.x) * 0.15;  // lean into turns
    const proj = (x, y, z) => {
      const dz = z - cam.z;
      return [w / 2 + ((x - cam.x) / dz) * f + sway * f / 4, horizon - ((y - cam.y) / dz) * f, dz];
    };
    const near = 0.3, far = 40;

    // Collect every block (platform columns + floating islands), draw far to near.
    const cubes = [];
    for (const pl of this.platforms) {
      for (let k = 0; k < pl.len; k++) cubes.push({ x: pl.x, z: pl.z0 + k, top: pl.top, hgt: 2 });
    }
    for (const is of this.islands) cubes.push({ x: Math.round(is.x), z: Math.round(is.z), top: Math.round(is.y), hgt: is.s });
    cubes.sort((a, b) => (b.z - cam.z) - (a.z - cam.z));

    for (const c of cubes) {
      const z0 = Math.max(c.z, cam.z + near), z1 = c.z + 1;
      if (z1 <= cam.z + near || c.z - cam.z > far) continue;
      const fog = MAX_FOG * Math.min(1, Math.max(0, (c.z - cam.z) / far)) ** 1.4;
      const x0 = c.x, x1 = c.x + 1, yT = c.top, yB = c.top - c.hgt;
      const face = (pts, color) => {
        const s = pts.map(([x, y, z]) => proj(x, y, z));
        ctx.fillStyle = mixColor(color, W.fog, fog);
        ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(0,0,0,${0.18 * (1 - fog)})`; ctx.lineWidth = 1; ctx.stroke();
      };
      if (c.z >= cam.z + near) face([[x0, yT, z0], [x1, yT, z0], [x1, yB, z0], [x0, yB, z0]], shade(W.side, 0.95));
      if (cam.x < x0) face([[x0, yT, z0], [x0, yT, z1], [x0, yB, z1], [x0, yB, z0]], shade(W.side, 0.75));
      if (cam.x > x1) face([[x1, yT, z0], [x1, yT, z1], [x1, yB, z1], [x1, yB, z0]], shade(W.side, 0.75));
      if (cam.y > yT) {
        face([[x0, yT, z0], [x1, yT, z0], [x1, yT, z1], [x0, yT, z1]], W.top);
        // a darker "grass edge" strip so tops read as blocks
        face([[x0, yT, z0], [x1, yT, z0], [x1, yT - 0.15, z0], [x0, yT - 0.15, z0]], shade(W.top, 0.8));
      }
    }

    // Speed lines while airborne
    if (!p.ground) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const a = this.rand() * Math.PI * 2, r0 = Math.min(w, h) * (0.35 + this.rand() * 0.2);
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(a) * r0, horizon + Math.sin(a) * r0);
        ctx.lineTo(w / 2 + Math.cos(a) * r0 * 1.25, horizon + Math.sin(a) * r0 * 1.25);
        ctx.stroke();
      }
    }
  }
}

// ---------- Neon Rush: three-lane runner dodging and collecting coins ----------
class NeonRushScene {
  constructor(rand) { this.rand = rand; this.hue = 280 + rand() * 60; }
  init(w, h) {
    this.dist = 0;
    this.speed = 0.32;
    this.lane = 0; this.laneX = 0;
    this.jumpT = -1;
    this.objects = [];
    this.buildings = [];
    this.sparks = [];
    for (let z = 4; z < 60; z += 6) this.spawn(z);
    for (let z = 2; z < 70; z += 3.5) this.addBuilding(z);
  }
  spawn(z) {
    const r = this.rand;
    const lane = Math.floor(r() * 3) - 1;
    const kind = r() < 0.55 ? "wall" : r() < 0.6 ? "low" : "coins";
    this.objects.push({ lane, z, kind, taken: false });
  }
  addBuilding(z) {
    const r = this.rand;
    for (const side of [-1, 1]) this.buildings.push({ side, z, hgt: 2 + r() * 5, wid: 1.5 + r() * 1.5, hue: this.hue + (r() - 0.5) * 80 });
  }
  draw(ctx, w, h, dt) {
    const move = this.speed * dt;
    this.dist += move;
    this.speed = Math.min(0.5, this.speed + 0.00005 * dt);
    const horizon = h * 0.36, f = h * 0.55, camY = 1.7, laneW = 1.3;
    const P = (x, y, z) => [w / 2 + (x / z) * f, horizon + ((camY - y) / z) * f];

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, `hsl(${this.hue}, 70%, 8%)`); sky.addColorStop(1, `hsl(${this.hue - 30}, 85%, 30%)`);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
    // big retro sun
    ctx.fillStyle = `hsl(${this.hue - 60}, 100%, 62%)`;
    ctx.beginPath(); ctx.arc(w / 2, horizon, w * 0.22, Math.PI, 0); ctx.fill();
    ctx.fillStyle = `hsl(${this.hue}, 70%, 8%)`;
    for (let i = 1; i < 6; i++) ctx.fillRect(0, horizon - i * w * 0.035, w, 2 + i * 0.6);
    ctx.fillStyle = `hsl(${this.hue}, 60%, 7%)`; ctx.fillRect(0, horizon, w, h - horizon);

    // road
    const roadL = [P(-laneW * 1.5, 0, 60), P(-laneW * 1.5, 0, 0.6)], roadR = [P(laneW * 1.5, 0, 60), P(laneW * 1.5, 0, 0.6)];
    ctx.fillStyle = `hsl(${this.hue}, 40%, 12%)`;
    ctx.beginPath(); ctx.moveTo(...roadL[0]); ctx.lineTo(...roadR[0]); ctx.lineTo(...roadR[1]); ctx.lineTo(...roadL[1]); ctx.fill();
    // moving grid lines across the road
    ctx.strokeStyle = `hsla(${this.hue + 40}, 100%, 65%, 0.55)`; ctx.lineWidth = 1.5;
    for (let z = 1 - (this.dist % 2); z < 60; z += 2) {
      if (z < 0.7) continue;
      const a = P(-laneW * 1.5, 0, z), b = P(laneW * 1.5, 0, z);
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    }
    for (const x of [-1.5, -0.5, 0.5, 1.5]) {
      const a = P(x * laneW, 0, 60), b = P(x * laneW, 0, 0.7);
      ctx.strokeStyle = `hsla(${this.hue + 40}, 100%, 70%, ${Math.abs(x) > 1 ? 0.9 : 0.4})`;
      ctx.lineWidth = Math.abs(x) > 1 ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    }

    // world moves toward the camera
    for (const o of this.objects) o.z -= move;
    for (const b of this.buildings) b.z -= move;
    this.objects = this.objects.filter(o => o.z > 0.8);
    this.buildings = this.buildings.filter(b => b.z > 0.8);
    while (this.objects.length < 12) this.spawn(Math.max(30, (this.objects.at(-1)?.z || 30) + 4 + this.rand() * 4));
    while (this.buildings.length < 40) this.addBuilding((this.buildings.at(-1)?.z || 60) + 3.5);

    // runner AI: dodge walls, jump low bars, steer toward coins
    const playerZ = 4.2;
    const danger = this.objects.find(o => o.lane === this.lane && o.z > playerZ && o.z < playerZ + 5 && o.kind !== "coins");
    if (danger) {
      if (danger.kind === "low" && this.jumpT < 0) this.jumpT = 0;
      else if (danger.kind === "wall") {
        const free = [-1, 0, 1].filter(l => !this.objects.some(o => o.lane === l && o.kind === "wall" && Math.abs(o.z - danger.z) < 3));
        if (free.length) this.lane = free.sort((a, b) => Math.abs(a - this.lane) - Math.abs(b - this.lane))[0];
      }
    } else {
      const coin = this.objects.find(o => o.kind === "coins" && !o.taken && o.z > playerZ && o.z < playerZ + 8);
      if (coin && !this.objects.some(o => o.lane === coin.lane && o.kind === "wall" && o.z > playerZ && o.z < coin.z + 1)) this.lane = coin.lane;
    }
    this.laneX += (this.lane - this.laneX) * Math.min(1, 0.22 * dt);
    let jumpY = 0;
    if (this.jumpT >= 0) { this.jumpT += 0.045 * dt; jumpY = Math.sin(Math.min(this.jumpT, 1) * Math.PI) * 1.3; if (this.jumpT >= 1) this.jumpT = -1; }

    // draw buildings + objects far to near
    const items = [
      ...this.buildings.map(b => ({ z: b.z, draw: () => {
        const x = b.side * (laneW * 1.5 + 0.6 + b.wid / 2);
        const [x0, y0] = P(x - b.wid / 2, b.hgt, b.z), [x1, y1] = P(x + b.wid / 2, 0, b.z);
        ctx.fillStyle = `hsl(${b.hue}, 45%, ${10 + 8 * (1 - Math.min(1, b.z / 60))}%)`;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.fillStyle = `hsla(${b.hue + 30}, 100%, 70%, 0.8)`;
        const cw = (x1 - x0) / 5, chh = (y1 - y0) / 9;
        if (cw > 2) for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) if ((i * 7 + j * 3 + Math.floor(b.hue)) % 3 === 0) ctx.fillRect(x0 + cw * (i + 0.6), y0 + chh * (j + 0.5), cw * 0.5, chh * 0.4);
      } })),
      ...this.objects.map(o => ({ z: o.z, draw: () => {
        const x = o.lane * laneW;
        if (o.kind === "coins") {
          if (o.taken) return;
          for (let k = 0; k < 3; k++) {
            const z = o.z + k * 0.9; if (z < 0.8) continue;
            const [cx, cy] = P(x, 0.7, z), r = (0.25 / z) * f;
            ctx.fillStyle = "#ffd43b"; ctx.beginPath();
            ctx.ellipse(cx, cy, Math.abs(Math.cos(this.dist * 2 + k)) * r + 1, r, 0, 0, Math.PI * 2); ctx.fill();
          }
          return;
        }
        const top = o.kind === "wall" ? 1.6 : 0.55;
        const [x0, y0] = P(x - laneW * 0.42, top, o.z), [x1, y1] = P(x + laneW * 0.42, 0, o.z);
        ctx.fillStyle = o.kind === "wall" ? `hsl(${this.hue + 180}, 90%, 55%)` : "#ff4d8d";
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        for (let s = 0; s < 4; s++) ctx.fillRect(x0 + (x1 - x0) * (s / 4 + 0.05), y0, (x1 - x0) * 0.1, y1 - y0);
      } })),
    ].sort((a, b) => b.z - a.z);
    for (const it of items) if (it.z > playerZ) it.draw();

    // coin pickups
    for (const o of this.objects) {
      if (o.kind === "coins" && !o.taken && o.lane === this.lane && Math.abs(o.z - playerZ) < 0.8) {
        o.taken = true;
        const [px, py] = P(this.laneX * laneW, 1, playerZ);
        for (let i = 0; i < 14; i++) this.sparks.push({ x: px, y: py, vx: (this.rand() - 0.5) * 8, vy: -this.rand() * 7, life: 1 });
      }
    }

    // the runner
    const [rx, ry] = P(this.laneX * laneW, jumpY, playerZ);
    const s = f / playerZ;
    const legs = Math.sin(this.dist * 9) * s * 0.12;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(P(this.laneX * laneW, 0, playerZ)[0], P(0, 0, playerZ)[1], s * 0.28, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd43b";
    ctx.fillRect(rx - s * 0.18, ry - s * 1.25, s * 0.36, s * 0.55);              // body
    ctx.fillRect(rx - s * 0.14, ry - s * 1.6, s * 0.28, s * 0.3);               // head
    ctx.fillRect(rx - s * 0.16 + legs, ry - s * 0.7, s * 0.12, s * 0.7);       // legs
    ctx.fillRect(rx + s * 0.04 - legs, ry - s * 0.7, s * 0.12, s * 0.7);
    ctx.fillStyle = "#8b5cf6"; ctx.fillRect(rx - s * 0.18, ry - s * 1.25, s * 0.36, s * 0.12);  // backpack strap

    for (const sp of this.sparks) {
      sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 0.4 * dt; sp.life -= 0.03 * dt;
      ctx.fillStyle = `rgba(255, 212, 59, ${Math.max(0, sp.life)})`; ctx.fillRect(sp.x, sp.y, 4, 4);
    }
    this.sparks = this.sparks.filter(sp => sp.life > 0);
  }
}

// ---------- Drop Zone: balls bouncing down through pegs into bins ----------
class DropZoneScene {
  constructor(rand) { this.rand = rand; this.hue = rand() * 360; }
  init(w, h) {
    this.pegs = [];
    const rows = 11, gap = w / 9;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < 10; c++) {
        const x = c * gap + (r % 2 ? gap / 2 : 0);
        if (x > 8 && x < w - 8) this.pegs.push({ x, y: h * 0.12 + r * (h * 0.055), glow: 0 });
      }
    }
    this.bins = new Array(9).fill(0);
    this.balls = [];
    this.binTop = h * 0.12 + rows * (h * 0.055) + 10;
    this.timer = 0;
  }
  draw(ctx, w, h, dt) {
    ctx.fillStyle = "rgba(12, 8, 22, 0.45)"; ctx.fillRect(0, 0, w, h);
    this.timer += dt;
    if (this.timer > 9) {
      this.timer = 0;
      this.balls.push({ x: w / 2 + (this.rand() - 0.5) * 30, y: 10, vx: (this.rand() - 0.5) * 1.5, vy: 0, hue: (this.hue + this.rand() * 120) % 360 });
    }
    const R = Math.max(5, w * 0.017), pr = 4;
    for (const b of this.balls) {
      b.vy += 0.22 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      for (const p of this.pegs) {
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
        if (d < R + pr && d > 0) {
          const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * 0.55 + (this.rand() - 0.5) * 0.6;
          b.vy = (b.vy - 2 * dot * ny) * 0.55;
          b.x = p.x + nx * (R + pr); b.y = p.y + ny * (R + pr);
          p.glow = 1; p.hue = b.hue;
        }
      }
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); }
      if (b.x > w - R) { b.x = w - R; b.vx = -Math.abs(b.vx); }
      if (b.y > this.binTop && !b.done) { b.done = true; this.bins[Math.min(8, Math.max(0, Math.floor(b.x / (w / 9))))]++; }
    }
    this.balls = this.balls.filter(b => b.y < h + 20);
    if (Math.max(...this.bins) > 26) this.bins = this.bins.map(() => 0);

    for (const p of this.pegs) {
      p.glow = Math.max(0, p.glow - 0.04 * dt);
      ctx.fillStyle = p.glow > 0 ? `hsla(${p.hue}, 100%, 70%, ${0.4 + p.glow * 0.6})` : "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(p.x, p.y, pr + p.glow * 3, 0, Math.PI * 2); ctx.fill();
    }
    const bw = w / 9;
    this.bins.forEach((n, i) => {
      const bh = n * (h - this.binTop - 10) / 28;
      ctx.fillStyle = `hsla(${(this.hue + i * 25) % 360}, 90%, 60%, 0.85)`;
      ctx.fillRect(i * bw + 3, h - bh, bw - 6, bh);
      ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(i * bw, this.binTop, 2, h);
    });
    for (const b of this.balls) {
      const g = ctx.createRadialGradient(b.x - R / 3, b.y - R / 3, 1, b.x, b.y, R);
      g.addColorStop(0, `hsl(${b.hue}, 100%, 85%)`); g.addColorStop(1, `hsl(${b.hue}, 90%, 50%)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ---------- Sand Slice: a striped sand block sliced over and over ----------
class SandSliceScene {
  constructor(rand) {
    this.rand = rand;
    const base = rand() * 360;
    this.colors = Array.from({ length: 6 }, (_, i) => `hsl(${(base + i * 47) % 360}, 70%, ${62 + (i % 2) * 10}%)`);
  }
  init(w, h) {
    this.w = w; this.h = h;
    this.newBlock();
    this.grains = [];
    this.slabs = [];
    this.knifeY = 0; this.phase = "down";
    this.speck = Array.from({ length: 260 }, () => [this.rand(), this.rand(), this.rand()]);
  }
  newBlock() {
    this.blockW = this.w * 0.62; this.blockH = this.h * 0.32;
    this.left = (this.w - this.blockW) / 2;
    this.cut = this.left + this.blockW;  // right edge of what's left
    this.floor = this.h * 0.78;
  }
  stripes(ctx, x, y, wid, hgt) {
    const n = this.colors.length;
    for (let i = 0; i < n; i++) { ctx.fillStyle = this.colors[i]; ctx.fillRect(x, y + (hgt / n) * i, wid, hgt / n + 1); }
  }
  draw(ctx, w, h, dt) {
    ctx.fillStyle = "#17121f"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2a2238"; ctx.fillRect(0, this.floor, w, h - this.floor);
    const top = this.floor - this.blockH, slice = this.blockW / 9;

    // remaining block
    this.stripes(ctx, this.left, top, this.cut - this.left, this.blockH);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (const [sx, sy] of this.speck) { const x = this.left + sx * (this.cut - this.left); ctx.fillRect(x, top + sy * this.blockH, 2, 2); }

    // knife
    const kx = this.cut - slice;
    if (this.phase === "down") {
      this.knifeY += 0.022 * dt;
      if (this.knifeY >= 1) { this.knifeY = 1; this.phase = "up"; this.slabs.push({ x: kx, w: slice, ang: 0, vy: 0, y: top }); this.cut = kx; }
    } else {
      this.knifeY -= 0.05 * dt;
      if (this.knifeY <= 0) { this.knifeY = 0; this.phase = "down"; if (this.cut - this.left < slice * 1.2) this.newBlock(); }
    }
    const bladeTop = top - this.blockH * 0.6 + this.knifeY * this.blockH * 0.95;
    ctx.fillStyle = "#d9dde6"; ctx.fillRect(kx - 3, bladeTop, 6, this.blockH * 0.7);
    ctx.fillStyle = "#3b3346"; ctx.fillRect(kx - 9, bladeTop - 34, 18, 36);
    if (this.phase === "down" && this.knifeY > 0.6) {
      for (let i = 0; i < 2; i++) this.grains.push({ x: kx + (this.rand() - 0.5) * 6, y: bladeTop + this.blockH * 0.7, vx: (this.rand() - 0.5) * 2, vy: 0, c: this.colors[Math.floor(this.rand() * this.colors.length)] });
    }

    // falling slabs tip over and crumble on the floor
    for (const s of this.slabs) {
      s.ang = Math.min(Math.PI / 2, s.ang + 0.05 * dt);
      ctx.save(); ctx.translate(s.x + s.w, this.floor); ctx.rotate(s.ang);
      this.stripes(ctx, -s.w, -this.blockH, s.w, this.blockH);
      ctx.restore();
      if (s.ang >= Math.PI / 2 && !s.done) {
        s.done = true;
        for (let i = 0; i < 70; i++) this.grains.push({ x: s.x + s.w + this.rand() * this.blockH, y: this.floor - this.rand() * s.w, vx: (this.rand() - 0.2) * 3, vy: -this.rand() * 2, c: this.colors[Math.floor(this.rand() * this.colors.length)] });
      }
    }
    this.slabs = this.slabs.filter(s => !s.done || (s.fade = (s.fade || 0) + dt) < 40);
    for (const g of this.grains) {
      g.vy += 0.3 * dt; g.x += g.vx * dt; g.y += g.vy * dt;
      if (g.y > this.floor) { g.y = this.floor; g.vx *= 0.6; g.vy = 0; g.rest = (g.rest || 0) + dt; }
      ctx.fillStyle = g.c; ctx.fillRect(g.x, g.y - 3, 3, 3);
    }
    this.grains = this.grains.filter(g => !(g.rest > 120) && g.x < w + 10);
  }
}

// Gameplay scenes come up most often; the calmer ones still appear for variety.
// The flat Parkour/NeonRush are "fallback": used only on phones that can't run the 3D versions.
SCENES.push(
  { cls: ParkourScene, weight: 4, fallback: true },
  { cls: NeonRushScene, weight: 4, fallback: true },
  { cls: SandSliceScene, weight: 1.5 },
  { cls: DropZoneScene, weight: 1.5 },
);
