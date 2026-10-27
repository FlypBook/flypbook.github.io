// FlypBook 3D scenes: oddly satisfying physics & making-things. Original designs.
import { Scene3D, gradientTexture } from "./game3d.js";
import { THREE, V, lerp, clamp, std, mesh, groundTexture, Particles, pixelTexture, noisy, rgb, css } from "./games_kit.js";

const studio = (scene, top = "#1d1a2b", bottom = "#4b4466") => { scene.background = gradientTexture(top, bottom); };
const glossy = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });

// ---------- Marble Run: glossy marbles zig-zagging down an endless tower of ramps ----------
class MarbleRun extends Scene3D {
  build() {
    const r = this.rand;
    studio(this.scene, "#141428", "#3b3570");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x302a50, 1.1));
    this.light = this.sunLight(0xffffff, 2.4, 10);
    this.rampH = 1.3; this.rampW = 6;
    this.ramps = [];
    const rampMat = std(0xf1f0ff, { roughness: 0.35 }), railMat = std(0x8b5cf6, { roughness: 0.3, metalness: 0.4 });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      mesh(new THREE.BoxGeometry(this.rampW, 0.12, 0.9), rampMat, 0, 0, 0, g);
      for (const s of [-0.45, 0.45]) mesh(new THREE.BoxGeometry(this.rampW, 0.2, 0.06), railMat, 0, 0.1, s, g);
      this.scene.add(g); this.ramps.push(g);
    }
    this.marbles = [];
    for (let i = 0; i < 7; i++) {
      const m = mesh(new THREE.SphereGeometry(0.28, 24, 16), glossy(new THREE.Color().setHSL(r(), 0.85, 0.55)));
      this.scene.add(m); this.marbles.push({ m, u: -i * 0.55 });
    }
    this.camY = 0;
  }
  rampPose(i) {   // ramp i tilts down toward its exit; direction alternates each level
    const dir = i % 2 ? -1 : 1;
    return { y: -i * this.rampH, dir, tilt: dir * 0.12 };
  }
  marblePos(u) {    // u: ramps traveled (fractional part = progress along a ramp, then a drop)
    const i = Math.floor(u), f = u - i, p = this.rampPose(i), half = this.rampW / 2 - 0.4;
    if (f < 0.8) {
      const x = p.dir * lerp(-half, half, f / 0.8);
      return V(x, p.y + 0.34 - Math.tan(p.tilt) * x, 0);
    }
    // drop off the end, arcing out a little, and land on the start of the next ramp below
    const t = (f - 0.8) / 0.2, n = this.rampPose(i + 1);
    const x = p.dir * (half + Math.sin(t * Math.PI) * 0.35);
    const from = p.y + 0.34 - Math.tan(p.tilt) * p.dir * half, to = n.y + 0.34 - Math.tan(n.tilt) * p.dir * half;
    return V(x, lerp(from, to, t * t), 0);
  }
  update(dt) {
    for (const mb of this.marbles) {
      mb.u += 0.006 * dt;
      const p = this.marblePos(Math.max(0, mb.u));
      mb.m.position.copy(p);
      mb.m.rotation.z -= 0.15 * dt * this.rampPose(Math.floor(Math.max(0, mb.u))).dir;
    }
    const lead = Math.floor(this.marbles[0].u);
    this.ramps.forEach((g, k) => {
      const i = lead - 4 + k, p = this.rampPose(i);
      g.position.set(0, p.y, 0); g.rotation.z = -p.tilt;
    });
    this.camY = lerp(this.camY, this.marbles[2].m.position.y, Math.min(1, 0.05 * dt));
    const a = Math.sin(this.t * 0.3) * 0.5;
    this.camera.position.set(Math.sin(a) * 9, this.camY + 2.5, Math.cos(a) * 9);
    this.camera.lookAt(0, this.camY - 0.5, 0);
    this.light.position.set(4, this.camY + 10, 6); this.light.target.position.set(0, this.camY - 2, 0);
  }
}

// ---------- Hydraulic Press: squishing colorful objects one after another ----------
class HydraulicPress extends Scene3D {
  build() {
    studio(this.scene, "#16181d", "#3a3f4a");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1));
    this.light = this.sunLight(0xffffff, 2.6, 6);
    this.light.position.set(3, 9, 5);
    const steel = std(0x9aa3ad, { metalness: 0.85, roughness: 0.3 });
    mesh(new THREE.BoxGeometry(5, 0.5, 3.4), std(0x2d3138, { metalness: 0.6, roughness: 0.5 }), 0, -0.25, 0, this.scene);
    for (const x of [-2.2, 2.2]) mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 16), steel, x, 3, -1.2, this.scene);
    mesh(new THREE.BoxGeometry(5, 0.6, 1), std(0xf2b705, { metalness: 0.3, roughness: 0.5 }), 0, 6.6, -1.2, this.scene);
    this.head = mesh(new THREE.BoxGeometry(2.6, 0.7, 2.6), steel, 0, 5, 0, this.scene);
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 16), steel, 0, 1.5, 0, this.head);
    // hazard stripes on the head
    const stripes = pixelTexture((g, s) => { for (let x = 0; x < s; x++) for (let y = 0; y < s; y++) { g.fillStyle = Math.floor((x + y) / 4) % 2 ? "#111" : "#f2b705"; g.fillRect(x, y, 1, 1); } });
    mesh(new THREE.BoxGeometry(2.62, 0.25, 2.62), std(0xffffff, { map: stripes }), 0, 0, 0, this.head);
    this.belt = groundTexture(this.rand, "#2a2a2a", 0.2, 1, (g, s) => { g.fillStyle = "#444"; for (let x = 0; x < s; x += 4) g.fillRect(x, 0, 1, s); });
    this.belt.repeat.set(6, 1);
    const belt = mesh(new THREE.BoxGeometry(14, 0.1, 2), std(0xffffff, { map: this.belt }), 0, 0.05, 0, this.scene);
    this.debris = new Particles(this.scene, 300, 0xffffff, 0.12);
    this.newItem();
    this.phase = "in"; this.timer = 0;
  }
  newItem() {
    const r = this.rand, kinds = [
      () => new THREE.BoxGeometry(1.4, 1.4, 1.4), () => new THREE.SphereGeometry(0.85, 32, 20),
      () => new THREE.CylinderGeometry(0.7, 0.7, 1.6, 28), () => new THREE.TorusGeometry(0.6, 0.3, 16, 32),
      () => new THREE.CapsuleGeometry(0.55, 0.6, 8, 20), () => new THREE.DodecahedronGeometry(0.9, 0),
    ];
    if (this.item) { this.scene.remove(this.item); this.item.geometry.dispose(); }
    this.color = new THREE.Color().setHSL(r(), 0.85, 0.55);
    this.item = mesh(kinds[Math.floor(r() * kinds.length)](), glossy(this.color));
    this.item.geometry.computeBoundingBox();
    this.baseY = -this.item.geometry.boundingBox.min.y;
    this.item.position.set(-6, this.baseY + 0.1, 0);
    this.scene.add(this.item);
    this.debris.points.material.color.copy(this.color);
  }
  update(dt) {
    this.timer += dt;
    const it = this.item;
    if (this.phase === "in") {
      it.position.x = lerp(it.position.x, 0, Math.min(1, 0.06 * dt)); this.belt.offset.x -= 0.01 * dt;
      if (Math.abs(it.position.x) < 0.03) { this.phase = "down"; this.timer = 0; }
    } else if (this.phase === "down") {
      const contact = this.baseY * 2 + 0.1 + 0.35;
      this.head.position.y = Math.max(0.7 * 0.5 + 0.12, this.head.position.y - 0.09 * dt);
      const squash = clamp((contact - this.head.position.y) / (contact - 0.47), 0, 1);
      it.scale.set(1 + squash * 0.9, 1 - squash * 0.85, 1 + squash * 0.9);
      it.position.y = (this.baseY + 0.1) * it.scale.y;
      if (squash > 0.05 && squash < 0.98) for (let i = 0; i < 3; i++) {
        const a = this.rand() * Math.PI * 2;
        this.debris.emit(Math.cos(a) * 1.2, 0.3, Math.sin(a) * 1.2, Math.cos(a) * 0.12, 0.08 + this.rand() * 0.1, Math.sin(a) * 0.12);
      }
      if (squash >= 1) { this.phase = "hold"; this.timer = 0; }
    } else if (this.phase === "hold") {
      if (this.timer > 25) this.phase = "up";
    } else if (this.phase === "up") {
      this.head.position.y = Math.min(5, this.head.position.y + 0.06 * dt);
      if (this.head.position.y >= 5) this.phase = "out";
    } else if (this.phase === "out") {
      it.position.x += 0.12 * dt; this.belt.offset.x -= 0.01 * dt;
      if (it.position.x > 7) { this.newItem(); this.phase = "in"; }
    }
    this.debris.update(dt, 0.008);
    const a = Math.sin(this.t * 0.25) * 0.35;
    this.camera.position.set(Math.sin(a) * 10, 3.6, Math.cos(a) * 10);
    this.camera.lookAt(0, 2.6, 0);
  }
}

// ---------- Soap Cutting: thin slices peeling off a pastel soap bar ----------
class SoapCut extends Scene3D {
  build() {
    studio(this.scene, "#f7e8ef", "#e4d4f4");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c7e6, 1.2));
    this.light = this.sunLight(0xffffff, 2.2, 6); this.light.position.set(-3, 8, 5);
    const board = groundTexture(this.rand, "#d8b28a", 0.12, 1, (g, s) => { g.fillStyle = "rgba(120,80,40,0.25)"; for (let y = 0; y < s; y += 3) g.fillRect(0, y, s, 1); });
    mesh(new THREE.BoxGeometry(8, 0.3, 4), std(0xffffff, { map: board }), 0, -0.15, 0, this.scene);
    this.knife = new THREE.Group();
    mesh(new THREE.BoxGeometry(0.03, 1.5, 2.3), std(0xf4f7fb, { metalness: 0.75, roughness: 0.3 }), 0, 0, 0, this.knife);
    mesh(new THREE.BoxGeometry(0.16, 0.3, 1.2), std(0x8a5a3b, { roughness: 0.5 }), 0, 0.9, 0.1, this.knife);
    this.scene.add(this.knife);
    this.slices = [];
    this.flakes = new Particles(this.scene, 200, 0xffffff, 0.06);
    this.newBar();
  }
  newBar() {
    const pastels = [0xff8fab, 0xffb703, 0x8ecae6, 0xb5e48c, 0xcdb4db, 0xffafcc, 0x90e0ef, 0xf4a261];
    this.color = new THREE.Color(pastels[Math.floor(this.rand() * pastels.length)]);
    if (this.bar) this.scene.remove(this.bar);
    for (const s of this.slices) this.scene.remove(s.m);
    this.slices = [];
    this.mat = new THREE.MeshPhysicalMaterial({ color: this.color, roughness: 0.4, clearcoat: 0.4 });
    this.len = 3.2; this.left = -1.6;
    this.bar = mesh(new THREE.BoxGeometry(1, 1.3, 1.9), this.mat);
    this.scene.add(this.bar);
    this.flakes.points.material.color.copy(this.color).offsetHSL(0, 0, 0.08);
    this.layout(); this.k = 0; this.phase = "down";
  }
  layout() { this.bar.scale.x = this.len; this.bar.position.set(this.left + this.len / 2, 0.65, 0); }
  update(dt) {
    const sliceW = 0.22, cutX = this.left + this.len - sliceW;
    this.knife.position.x = cutX;
    if (this.phase === "down") {
      this.k = Math.min(1, this.k + 0.022 * dt);
      if (this.k > 0.3) this.flakes.emit(cutX + 0.1, 1.3 - this.k * 1.3, (this.rand() - 0.5) * 1.8, 0.01, 0.02, 0);
      if (this.k >= 1) {
        const s = mesh(new THREE.BoxGeometry(sliceW, 1.3, 1.9), this.mat);
        const pivot = new THREE.Group(); pivot.position.set(cutX + sliceW, 0, 0); s.position.set(-sliceW / 2, 0.65, 0); pivot.add(s);
        this.scene.add(pivot); this.slices.push({ m: pivot, a: 0 });
        this.len -= sliceW; this.layout(); this.phase = "up";
      }
    } else {
      this.k = Math.max(0, this.k - 0.05 * dt);
      if (this.k <= 0) { this.phase = "down"; if (this.len < 0.6) this.newBar(); }
    }
    this.knife.position.y = 2.4 - this.k * 1.75;
    for (const s of this.slices) { s.a = Math.min(Math.PI / 2 - 0.08, s.a + 0.06 * dt); s.m.rotation.z = -s.a; }
    // fallen slices fan out to the right
    this.slices.forEach((s, i) => { s.m.position.x = lerp(s.m.position.x, 1.9 + i * 0.12, 0.02 * dt); });
    this.flakes.update(dt, 0.004);
    this.camera.position.set(1.2 + Math.sin(this.t * 0.3) * 0.6, 2.6, 4.6);
    this.camera.lookAt(0.6, 0.6, 0);
  }
}

// ---------- Ball Pour: hundreds of candy-colored balls pouring into a glass jar ----------
class BallPour extends Scene3D {
  build() {
    studio(this.scene, "#20123a", "#5a3c8a");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2a5a, 1.2));
    this.light = this.sunLight(0xffffff, 2.2, 6); this.light.position.set(3, 10, 4);
    mesh(new THREE.CylinderGeometry(4, 4, 0.3, 40), std(0x2b2140, { roughness: 0.6 }), 0, -0.15, 0, this.scene);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, roughness: 0.05, thickness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    this.R = 2; this.H = 4.4;
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(this.R + 0.05, this.R + 0.05, this.H, 40, 1, true), glass);
    jar.position.y = this.H / 2; this.scene.add(jar);
    this.N = 320; this.rad = 0.17;
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(this.rad, 14, 10), glossy(0xffffff), this.N);
    this.balls.castShadow = true; this.balls.frustumCulled = false;
    const hues = [0.0, 0.08, 0.15, 0.33, 0.55, 0.75, 0.9];
    for (let i = 0; i < this.N; i++) this.balls.setColorAt(i, new THREE.Color().setHSL(hues[i % hues.length], 0.85, 0.55));
    this.scene.add(this.balls);
    this.reset();
  }
  reset() {
    this.p = []; this.spawned = 0; this.full = 0;
    this.balls.count = 0;
  }
  update(dt) {
    const r = this.rand, rad = this.rad, maxR = this.R - rad;
    this.acc = (this.acc || 0) + dt;
    while (this.acc >= 1.4 && this.spawned < this.N) {   // a steady stream: about 43 balls a second
      this.acc -= 1.4;
      this.p.push({ x: (r() - 0.5) * 0.3, y: this.H + 2.5, z: (r() - 0.5) * 0.3, vx: (r() - 0.5) * 0.02, vy: 0, vz: (r() - 0.5) * 0.02 });
      this.spawned++;
    }
    const steps = 2, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const b of this.p) {
        b.vy -= 0.012 * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
        if (b.y < rad) { b.y = rad; b.vy *= -0.3; b.vx *= 0.9; b.vz *= 0.9; }
        const d = Math.hypot(b.x, b.z);
        if (d > maxR && b.y < this.H) { const k = maxR / d; b.x *= k; b.z *= k; b.vx *= -0.3; b.vz *= -0.3; }
      }
      // ball-ball collisions using a coarse grid
      const grid = new Map(), cell = rad * 2, key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
      this.p.forEach((b, i) => { const k = key(b.x, b.y, b.z); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
      for (let i = 0; i < this.p.length; i++) {
        const a = this.p[i], cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell), cz = Math.floor(a.z / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
            if (j <= i) continue;
            const b = this.p[j], ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, dd = Math.hypot(ex, ey, ez);
            if (dd > 0 && dd < rad * 2) {
              const push = (rad * 2 - dd) / 2, nx = ex / dd, ny = ey / dd, nz = ez / dd;
              a.x -= nx * push; a.y -= ny * push; a.z -= nz * push; b.x += nx * push; b.y += ny * push; b.z += nz * push;
              const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
              if (rv < 0) { const imp = -rv * 0.6; a.vx -= nx * imp; a.vy -= ny * imp; a.vz -= nz * imp; b.vx += nx * imp; b.vy += ny * imp; b.vz += nz * imp; }
            }
          }
        }
      }
    }
    const m = new THREE.Matrix4();
    this.p.forEach((b, i) => this.balls.setMatrixAt(i, m.makeTranslation(b.x, b.y, b.z)));
    this.balls.count = this.p.length; this.balls.instanceMatrix.needsUpdate = true;
    if (this.spawned >= this.N) { this.full += dt; if (this.full > 240) this.reset(); }
    const a = this.t * 0.2;
    this.camera.position.set(Math.sin(a) * 7, 5.2, Math.cos(a) * 7);
    this.camera.lookAt(0, 1.8, 0);
  }
}

// ---------- Pottery Wheel: a spinning lump of clay rising into a vase ----------
class PotteryWheel extends Scene3D {
  build() {
    studio(this.scene, "#2a1e16", "#6b4a33");
    this.scene.add(new THREE.HemisphereLight(0xfff0dd, 0x3a2614, 1.1));
    this.light = this.sunLight(0xfff0dd, 2.2, 5); this.light.position.set(-3, 7, 4);
    mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.5, 40), std(0x3c3f45, { metalness: 0.4, roughness: 0.5 }), 0, -0.6, 0, this.scene);
    this.wheel = mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.12, 40), std(0x8a8f99, { metalness: 0.7, roughness: 0.35 }), 0, -0.3, 0, this.scene);
    // clay texture: wet throwing rings
    this.clayTex = pixelTexture((g, s) => { for (let y = 0; y < s; y++) { g.fillStyle = css(rgb("#a4623c"), 0.9 + (y % 4 === 0 ? -0.12 : 0) + (this.rand() - 0.5) * 0.06); g.fillRect(0, y, s, 1); } }, 64);
    this.clayTex.wrapS = this.clayTex.wrapT = THREE.RepeatWrapping; this.clayTex.repeat.set(4, 6);
    this.clayMat = new THREE.MeshPhysicalMaterial({ map: this.clayTex, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
    this.start();
  }
  start() {
    const r = this.rand;
    // target vase profile: radius at 9 heights (bottom to rim), always hollow at the top
    const belly = 0.9 + r() * 0.5, neck = 0.35 + r() * 0.25, lip = neck + 0.1 + r() * 0.25, height = 2.2 + r() * 1.2;
    this.target = [0.6, belly * 0.85, belly, belly * 0.95, belly * 0.75, neck * 1.2, neck, neck * 1.05, lip].map((rad, i) => [rad, (i / 8) * height]);
    this.lump = this.target.map((_, i) => [1.1 - (i / 8) * 0.3, (i / 8) * 1.2]);
    this.k = 0;
  }
  update(dt) {
    this.k = Math.min(1, this.k + 0.0025 * dt);
    const e = this.k * this.k * (3 - 2 * this.k);
    const pts = [new THREE.Vector2(0, 0)];
    this.target.forEach(([tr, ty], i) => pts.push(new THREE.Vector2(lerp(this.lump[i][0], tr, e), lerp(this.lump[i][1], ty, e))));
    // inner wall back down (hollow vase), only once it has opened up
    const wall = 0.12;
    for (let i = this.target.length - 1; i >= 1; i--) { const p = pts[i + 1]; pts.push(new THREE.Vector2(Math.max(0.02, p.x - wall * e), p.y - (i === this.target.length - 1 ? 0.02 : 0))); }
    if (this.clay) { this.clay.geometry.dispose(); this.clay.geometry = new THREE.LatheGeometry(pts, 48); }
    else { this.clay = mesh(new THREE.LatheGeometry(pts, 48), this.clayMat, 0, -0.24, 0, this.scene); }
    this.clay.rotation.y += 0.25 * dt; this.wheel.rotation.y += 0.25 * dt;
    if (this.k >= 1) { this.hold = (this.hold || 0) + dt; if (this.hold > 150) { this.hold = 0; this.start(); } }
    this.camera.position.set(Math.sin(this.t * 0.15) * 1.5, 2.3, 4.6);
    this.camera.lookAt(0, 1, 0);
  }
}

// ---------- Laser Engraver: a glowing laser burning intricate patterns into wood ----------
class LaserEngrave extends Scene3D {
  build() {
    studio(this.scene, "#0e0f14", "#2a2d38");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.9));
    this.light = this.sunLight(0xffffff, 1.6, 5); this.light.position.set(2, 8, 4);
    // wood board with a live "burn" canvas on top
    this.cv = document.createElement("canvas"); this.cv.width = this.cv.height = 512;
    this.g = this.cv.getContext("2d");
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    mesh(new THREE.BoxGeometry(4.2, 0.2, 4.2), std(0xffffff, { map: this.tex, roughness: 0.8 }), 0, -0.1, 0, this.scene);
    const rail = std(0x8a8f99, { metalness: 0.8, roughness: 0.3 });
    for (const z of [-2.3, 2.3]) mesh(new THREE.BoxGeometry(5, 0.15, 0.15), rail, 0, 1.4, z, this.scene);
    this.gantry = mesh(new THREE.BoxGeometry(0.2, 0.2, 4.8), rail, 0, 1.5, 0, this.scene);
    this.head = mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), std(0x222831, { metalness: 0.5 }), 0, 1.2, 0, this.scene);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    this.scene.add(this.beam);
    this.dot = new THREE.PointLight(0xff3a1a, 4, 2.5); this.scene.add(this.dot);
    this.smoke = new Particles(this.scene, 300, 0xbbbbbb, 0.08, 0.5);
    this.start();
  }
  start() {
    const r = this.rand, g = this.g;
    // fresh plank
    for (let y = 0; y < 512; y++) { g.fillStyle = css(rgb("#d9a86c"), 0.92 + Math.sin(y * 0.09 + Math.sin(y * 0.013) * 4) * 0.05); g.fillRect(0, y, 512, 1); }
    this.tex.needsUpdate = true;
    // a spirograph pattern for the laser to trace
    const R = 170, k = 0.3 + r() * 0.5, l = 0.5 + r() * 0.4, turns = 6 + Math.floor(r() * 6);
    this.path = [];
    for (let i = 0; i <= 1500; i++) {
      const t = (i / 1500) * Math.PI * 2 * turns;
      this.path.push([256 + R * ((1 - k) * Math.cos(t) + l * k * Math.cos(((1 - k) / k) * t)), 256 + R * ((1 - k) * Math.sin(t) - l * k * Math.sin(((1 - k) / k) * t))]);
    }
    this.i = 0;
  }
  update(dt) {
    const g = this.g, n = Math.ceil(3 * dt);
    g.strokeStyle = "rgba(40, 18, 6, 0.9)"; g.lineWidth = 2.2; g.lineCap = "round";
    for (let k = 0; k < n && this.i < this.path.length - 1; k++, this.i++) {
      const [x0, y0] = this.path[this.i], [x1, y1] = this.path[this.i + 1];
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    this.tex.needsUpdate = true;
    const [px, py] = this.path[Math.min(this.i, this.path.length - 1)];
    const x = (px / 512 - 0.5) * 4.2, z = (py / 512 - 0.5) * 4.2;
    this.gantry.position.x = x; this.head.position.set(x, 1.2, z);
    const on = this.i < this.path.length - 1;
    this.beam.visible = on; this.beam.position.set(x, 0.5, z); this.beam.scale.y = 0.95;
    this.dot.position.set(x, 0.15, z); this.dot.intensity = on ? 3 + Math.random() * 2 : 0;
    if (on) this.smoke.emit(x, 0.05, z, (this.rand() - 0.5) * 0.004, 0.012, (this.rand() - 0.5) * 0.004, 1.5);
    this.smoke.update(dt, -0.0002, 0.995);
    if (!on) { this.hold = (this.hold || 0) + dt; if (this.hold > 120) { this.hold = 0; this.start(); } }
    this.camera.position.set(Math.sin(this.t * 0.2) * 2, 4.4, 3.4);
    this.camera.lookAt(0, 0, 0.2);
  }
}

// ---------- Jelly Hop: a wobbly jelly cube bouncing down an endless pastel staircase ----------
class JellyHop extends Scene3D {
  build() {
    studio(this.scene, "#ffd6e8", "#c9e7ff");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8f0, 1.3));
    this.light = this.sunLight(0xffffff, 2, 8);
    this.N = 30;
    this.steps = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.6, 1.3), std(0xffffff, { roughness: 0.4 }), this.N);
    this.steps.receiveShadow = true; this.steps.castShadow = true; this.steps.frustumCulled = false;
    const pastel = [0xffadad, 0xffd6a5, 0xfdffb6, 0xcaffbf, 0x9bf6ff, 0xa0c4ff, 0xbdb2ff, 0xffc6ff];
    for (let i = 0; i < this.N; i++) this.steps.setColorAt(i, new THREE.Color(pastel[i % pastel.length]));
    this.scene.add(this.steps);
    this.jelly = mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9, 4, 4, 4), new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(this.rand(), 0.9, 0.6), roughness: 0.1, clearcoat: 1, transmission: 0.35, thickness: 0.8, transparent: true, opacity: 0.92 }));
    this.scene.add(this.jelly);
    this.sparkle = new Particles(this.scene, 200, 0xffffff, 0.1);
    this.n = 0; this.f = 0; this.squash = 0; this.sv = 0;
  }
  stepPos(i) { return V(Math.sin(i * 0.35) * 0.6, -i * 0.6, -i * 1.3); }
  update(dt) {
    this.f += 0.028 * dt;
    if (this.f >= 1) {
      this.f -= 1; this.n++;
      this.sv = -0.18;                                     // land: squash
      const p = this.stepPos(this.n);
      for (let i = 0; i < 12; i++) this.sparkle.emit(p.x, p.y + 0.35, p.z, (this.rand() - 0.5) * 0.08, 0.05 + this.rand() * 0.05, (this.rand() - 0.5) * 0.08);
    }
    // damped spring wobble
    this.sv += (-this.squash * 0.25 - this.sv * 0.12) * dt;
    this.squash += this.sv * dt;
    const a = this.stepPos(this.n), b = this.stepPos(this.n + 1);
    const pos = a.clone().lerp(b, this.f); pos.y += Math.sin(this.f * Math.PI) * 1.1 + 0.75;
    this.jelly.position.copy(pos);
    const s = clamp(this.squash, -0.4, 0.4);
    this.jelly.scale.set(1 - s * 0.6, 1 + s, 1 - s * 0.6);
    this.jelly.rotation.y = Math.sin(this.t * 2) * 0.2;
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.N; i++) { const p = this.stepPos(this.n - 4 + i); this.steps.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)); }
    this.steps.instanceMatrix.needsUpdate = true;
    this.sparkle.update(dt, 0.004);
    this.camera.position.set(pos.x + 3.5, pos.y + 2.4, pos.z + 4.5);
    this.camera.lookAt(pos.x, pos.y - 0.8, pos.z - 1.5);
    this.light.position.set(pos.x + 4, pos.y + 10, pos.z + 6); this.light.target.position.copy(pos);
  }
}

SCENES.push(
  { cls: MarbleRun, weight: 1 },
  { cls: HydraulicPress, weight: 1 },
  { cls: SoapCut, weight: 1 },
  { cls: BallPour, weight: 1 },
  { cls: PotteryWheel, weight: 1 },
  { cls: LaserEngrave, weight: 1 },
  { cls: JellyHop, weight: 1 },
);
