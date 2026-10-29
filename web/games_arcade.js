// FlypBook 3D scenes: arcade & sports. Original designs.
import { Scene3D, gradientTexture } from "./game3d.js";
import { THREE, V, lerp, clamp, std, mesh, groundTexture, Particles, pixelTexture, noisy, rgb, css, makePine } from "./games_kit.js";

const glossy = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
function woodFloor(rand, base = "#c8935a", repeat = 6) {
  const t = pixelTexture((g, s) => {
    const plank = s / 4;
    for (let p = 0; p < 4; p++) {
      const k = 0.88 + rand() * 0.16;
      for (let y = 0; y < s; y++) for (let x = p * plank; x < (p + 1) * plank; x++) {
        g.fillStyle = css(rgb(base), k * (1 + Math.sin(y * 0.3 + p) * 0.03 + (rand() - 0.5) * 0.04)); g.fillRect(x, y, 1, 1);
      }
      g.fillStyle = "rgba(60,30,10,0.5)"; g.fillRect(p * plank, 0, 1, s);
    }
  }, 64);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
  return t;
}

// ---------- Brick Smash: a glowing ball shattering a wall of bricks ----------
class BrickSmash extends Scene3D {
  build() {
    this.scene.background = gradientTexture("#070616", "#1c1440");
    this.scene.add(new THREE.HemisphereLight(0x9a8cff, 0x110a22, 0.9));
    this.light = this.sunLight(0xffffff, 1.8, 9); this.light.position.set(2, 14, 6);
    this.W = 8; this.D = 12;
    mesh(new THREE.BoxGeometry(this.W + 1, 0.2, this.D + 1), std(0x15112a, { roughness: 0.4, metalness: 0.4 }), 0, -0.1, 0, this.scene);
    const wall = new THREE.MeshStandardMaterial({ color: 0x3df2ff, emissive: 0x3df2ff, emissiveIntensity: 1.2 });
    for (const x of [-this.W / 2 - 0.2, this.W / 2 + 0.2]) mesh(new THREE.BoxGeometry(0.2, 0.4, this.D), wall, x, 0.2, 0, this.scene);
    mesh(new THREE.BoxGeometry(this.W + 0.6, 0.4, 0.2), wall, 0, 0.2, -this.D / 2 - 0.2, this.scene);
    this.cols = 8; this.rows = 6;
    this.bricks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.4, 0.45), new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1 }), this.cols * this.rows);
    this.bricks.castShadow = true; this.scene.add(this.bricks);
    this.ball = mesh(new THREE.SphereGeometry(0.18, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2a8, emissiveIntensity: 2 }), 0, 0.2, 3, this.scene);
    this.ballLight = new THREE.PointLight(0xfff2a8, 6, 4); this.scene.add(this.ballLight);
    this.paddle = mesh(new THREE.BoxGeometry(1.8, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: 0xff3df0, emissive: 0xff3df0, emissiveIntensity: 1 }), 0, 0.15, this.D / 2 - 0.6, this.scene);
    this.shards = new Particles(this.scene, 500, 0xffffff, 0.12);
    this.vel = V(0.07, 0, -0.1);
    this.reset();
  }
  reset() {
    this.alive = [];
    const m = new THREE.Matrix4();
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = r * this.cols + c;
      this.alive[i] = true;
      this.bricks.setMatrixAt(i, m.makeTranslation(-this.W / 2 + 0.5 + c, 0.2, -this.D / 2 + 0.8 + r * 0.6));
      this.bricks.setColorAt(i, new THREE.Color().setHSL((r / this.rows) * 0.8, 0.9, 0.55));
    }
    this.bricks.instanceMatrix.needsUpdate = true; this.bricks.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const b = this.ball.position, v = this.vel;
    for (let s = 0; s < 3; s++) {
      b.x += v.x * dt / 3; b.z += v.z * dt / 3;
      if (Math.abs(b.x) > this.W / 2 - 0.2) { v.x = -v.x; b.x = Math.sign(b.x) * (this.W / 2 - 0.2); }
      if (b.z < -this.D / 2 + 0.2) { v.z = Math.abs(v.z); }
      const pz = this.paddle.position.z;
      if (b.z > pz - 0.25 && v.z > 0) { v.z = -Math.abs(v.z); v.x += (b.x - this.paddle.position.x) * 0.05; v.x = clamp(v.x, -0.14, 0.14); }
      const c = Math.round(b.x + this.W / 2 - 0.5), r = Math.round((b.z + this.D / 2 - 0.8) / 0.6);
      if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
        const i = r * this.cols + c;
        if (this.alive[i]) {
          this.alive[i] = false; v.z = -v.z;
          this.bricks.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this.bricks.instanceMatrix.needsUpdate = true;
          const col = new THREE.Color(); this.bricks.getColorAt(i, col);
          this.shards.points.material.color.copy(col);
          for (let k = 0; k < 24; k++) this.shards.emit(b.x, 0.3, b.z, (this.rand() - 0.5) * 0.15, 0.05 + this.rand() * 0.12, (this.rand() - 0.5) * 0.15);
        }
      }
    }
    if (!this.alive.some(Boolean)) this.reset();
    this.paddle.position.x = lerp(this.paddle.position.x, clamp(b.x, -this.W / 2 + 0.9, this.W / 2 - 0.9), Math.min(1, 0.15 * dt));
    this.ballLight.position.copy(b);
    this.shards.update(dt, 0.006);
    this.camera.position.set(Math.sin(this.t * 0.2) * 2, 9.5, this.D / 2 + 5);
    this.camera.lookAt(0, 0, -0.5);
  }
}

// ---------- Strike Lane: bowling balls curving into pins that scatter ----------
class StrikeLane extends Scene3D {
  build() {
    this.scene.background = gradientTexture("#120d1e", "#3a2550");
    this.scene.add(new THREE.HemisphereLight(0xfff1e0, 0x1a1020, 1));
    this.light = this.sunLight(0xffffff, 2.2, 8); this.light.position.set(2, 12, -14);
    const lane = mesh(new THREE.BoxGeometry(2.6, 0.2, 30), std(0xffffff, { map: woodFloor(this.rand, "#d6a46a", 1), roughness: 0.4, metalness: 0.05 }), 0, -0.1, -12, this.scene);
    lane.material.map.repeat.set(1, 10);
    for (const x of [-1.6, 1.6]) mesh(new THREE.BoxGeometry(0.6, 0.15, 30), std(0x2b2b33, { metalness: 0.5 }), x, -0.12, -12, this.scene);
    const arrows = new THREE.MeshBasicMaterial({ color: 0x8b5cf6 });
    for (let i = -2; i <= 2; i++) { const a = mesh(new THREE.ConeGeometry(0.08, 0.3, 3), arrows, i * 0.4, 0.01, -6 - Math.abs(i) * 0.4, this.scene); a.rotation.x = -Math.PI / 2; }
    // a pin: lathe profile, white with red stripes
    const prof = [[0, 0], [0.11, 0], [0.16, 0.12], [0.17, 0.3], [0.12, 0.5], [0.07, 0.62], [0.08, 0.72], [0.1, 0.82], [0.07, 0.95], [0, 0.98]].map(([x, y]) => new THREE.Vector2(x, y));
    const stripe = pixelTexture((g, s) => { g.fillStyle = "#fafafa"; g.fillRect(0, 0, s, s); g.fillStyle = "#d62828"; g.fillRect(0, Math.floor(s * 0.28), s, 2); g.fillRect(0, Math.floor(s * 0.36), s, 2); }, 32);
    this.pinGeo = new THREE.LatheGeometry(prof, 20); this.pinMat = new THREE.MeshPhysicalMaterial({ map: stripe, clearcoat: 1, roughness: 0.25 });
    this.pins = [];
    for (let i = 0; i < 10; i++) { const p = mesh(this.pinGeo, this.pinMat); this.scene.add(p); this.pins.push({ m: p }); }
    this.ball = mesh(new THREE.SphereGeometry(0.22, 32, 20), glossy(0xffffff), 0, 0.22, 0, this.scene);
    this.reset();
  }
  reset() {
    const spots = []; for (let row = 0; row < 4; row++) for (let k = 0; k <= row; k++) spots.push([(k - row / 2) * 0.32, -24 - row * 0.3]);
    this.pins.forEach((p, i) => { p.m.position.set(spots[i][0], 0, spots[i][1]); p.m.rotation.set(0, 0, 0); p.v = null; });
    this.ball.material.color.setHSL(this.rand(), 0.8, 0.45);
    this.hook = (this.rand() < 0.5 ? -1 : 1) * (0.6 + this.rand() * 0.4);
    this.bz = 0; this.phase = "roll"; this.timer = 0;
  }
  update(dt) {
    if (this.phase === "roll") {
      this.bz -= 0.32 * dt;
      const u = this.bz / -24;
      this.ball.position.set(this.hook * Math.sin(u * Math.PI) * 0.9 * (1 - u * 0.6) + (1 - u) * -this.hook * 0.2, 0.22, this.bz);
      this.ball.rotation.x -= 0.4 * dt;
      if (this.bz < -23.6) {
        this.phase = "hit";
        for (const p of this.pins) {
          const dx = p.m.position.x - this.ball.position.x, dz = p.m.position.z - this.ball.position.z, d = Math.hypot(dx, dz) + 0.2;
          const f = 0.35 / d;
          p.v = V(dx / d * f + (this.rand() - 0.5) * 0.06, 0.05 + this.rand() * 0.08, -0.15 - this.rand() * 0.12 + dz * 0.02);
          p.spin = V((this.rand() - 0.5) * 0.4, (this.rand() - 0.5) * 0.4, (this.rand() - 0.5) * 0.4);
        }
      }
    } else {
      this.timer += dt;
      this.ball.position.z -= 0.2 * dt;
      for (const p of this.pins) if (p.v) {
        p.v.y -= 0.008 * dt;
        p.m.position.addScaledVector(p.v, dt);
        if (p.m.position.y < 0) { p.m.position.y = 0; p.v.y *= -0.3; p.v.x *= 0.8; p.v.z *= 0.8; p.spin.multiplyScalar(0.8); }
        p.m.rotation.x = Math.min(p.m.rotation.x + Math.abs(p.spin.x) * dt, Math.PI / 2);
        p.m.rotation.y += p.spin.y * dt; p.m.rotation.z += p.spin.z * dt * 0.3;
      }
      if (this.timer > 140) this.reset();
    }
    const focus = Math.max(this.ball.position.z, -22);
    this.camera.position.set(0.9, 1.3, focus + 3.4);
    this.camera.lookAt(0, 0.2, focus - 3);
  }
}

// ---------- Arrow Cam: following arrows across a meadow into the bullseye ----------
class ArrowCam extends Scene3D {
  build() {
    const r = this.rand;
    this.sky({ elevation: 35, azimuth: 225 });
    this.scene.fog = new THREE.Fog(0xe2f1ff, 40, 140);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a7a2a, 1.2));
    this.sun = this.sunLight(0xfff2dd, 2.4, 25); this.sun.position.set(-10, 25, -10);
    const grass = mesh(new THREE.PlaneGeometry(300, 300), std(0xffffff, { map: groundTexture(r, "#5fae4c", 0.2, 80), roughness: 1 }), 0, 0, -40, this.scene);
    grass.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 40; i++) { const t = makePine(1 + r() * 1.5); t.position.set((r() < 0.5 ? -1 : 1) * (12 + r() * 40), 0, -r() * 120); this.scene.add(t); }
    // target: colored rings on a straw stand
    this.target = new THREE.Group();
    const ringColors = [0xffffff, 0x222222, 0x2a7de1, 0xe63946, 0xffd43b];
    ringColors.forEach((c, i) => mesh(new THREE.CylinderGeometry(1.5 - i * 0.3, 1.5 - i * 0.3, 0.2 + i * 0.01, 40), std(c, { roughness: 0.7 }), 0, 0, 0, this.target).rotation.x = Math.PI / 2);
    for (const x of [-0.9, 0.9]) mesh(new THREE.BoxGeometry(0.15, 3, 0.15), std(0x8b5a2b), x, -1.4, 0.4, this.target).rotation.x = 0.2;
    this.target.position.set(0, 2.5, -45);
    this.scene.add(this.target);
    this.arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8); this.arrowGeo.rotateX(Math.PI / 2);
    this.stuck = [];
    this.newShot();
  }
  makeArrow() {
    const g = new THREE.Group();
    mesh(this.arrowGeo, std(0xe9d8a6), 0, 0, 0, g);
    const tip = mesh(new THREE.ConeGeometry(0.05, 0.16, 8), std(0x9aa3ad, { metalness: 0.9, roughness: 0.2 }), 0, 0, -0.66, g); tip.rotation.x = -Math.PI / 2;
    const fl = std(new THREE.Color().setHSL(this.rand(), 0.85, 0.55), { side: THREE.DoubleSide });
    for (let k = 0; k < 3; k++) { const f = mesh(new THREE.PlaneGeometry(0.12, 0.22), fl, 0, 0, 0.5, g); f.rotation.set(0, Math.PI / 2, (k * Math.PI * 2) / 3); }
    this.scene.add(g); return g;
  }
  newShot() {
    this.arrow = this.makeArrow();
    this.from = V((this.rand() - 0.5) * 3, 1.6, 0);
    const a = this.rand() * Math.PI * 2, rr = this.rand() < 0.4 ? 0 : this.rand() * 0.9;   // often a perfect bullseye
    this.to = V(this.target.position.x + Math.cos(a) * rr, this.target.position.y + Math.sin(a) * rr, this.target.position.z + 0.12);
    this.u = 0; this.phase = "fly"; this.wobble = 0;
  }
  update(dt) {
    if (this.phase === "fly") {
      const slow = this.u > 0.85 ? 0.35 : 1;          // slow-mo right before impact
      this.u = Math.min(1, this.u + 0.008 * dt * slow);
      const p = this.from.clone().lerp(this.to, this.u); p.y += Math.sin(this.u * Math.PI) * 3;
      const q = this.from.clone().lerp(this.to, this.u + 0.01); q.y += Math.sin((this.u + 0.01) * Math.PI) * 3;
      this.arrow.position.copy(p); this.arrow.lookAt(q); this.arrow.rotateZ(this.t * 6);
      this.camera.position.set(p.x + 0.35, p.y + 0.25, p.z + 1.6);
      this.camera.lookAt(q.x, q.y, q.z - 3);
      if (this.u >= 1) { this.phase = "hit"; this.timer = 0; this.wobble = 1; this.stuck.push(this.arrow); }
    } else {
      this.timer += dt;
      this.wobble *= Math.pow(0.93, dt);
      this.arrow.rotation.x += Math.sin(this.timer * 0.9) * this.wobble * 0.02;
      this.target.rotation.x = Math.sin(this.timer * 0.5) * this.wobble * 0.03;
      const tp = this.target.position;
      this.camera.position.lerp(V(tp.x + 2.5, tp.y + 0.8, tp.z + 5), Math.min(1, 0.05 * dt));
      this.camera.lookAt(tp);
      if (this.timer > 110) {
        if (this.stuck.length > 6) this.scene.remove(this.stuck.shift());
        this.newShot();
      }
    }
  }
}

// ---------- Trick Shots: basketballs arcing in from all over the court ----------
class TrickShots extends Scene3D {
  build() {
    this.scene.background = gradientTexture("#0f1424", "#2b3a5c");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x302010, 1));
    this.light = this.sunLight(0xffffff, 2.2, 12); this.light.position.set(3, 18, 6);
    const floor = mesh(new THREE.PlaneGeometry(30, 30), std(0xffffff, { map: woodFloor(this.rand, "#d9a066", 8), roughness: 0.25, metalness: 0.05 }), 0, 0, 0, this.scene);
    floor.rotation.x = -Math.PI / 2;
    const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const arc = new THREE.Mesh(new THREE.RingGeometry(6.6, 6.75, 64, 1, Math.PI, Math.PI), lineM); arc.rotation.x = -Math.PI / 2; arc.position.set(0, 0.01, -6); this.scene.add(arc);
    const key = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.85, 48), lineM); key.rotation.x = -Math.PI / 2; key.position.set(0, 0.01, -2.2); this.scene.add(key);
    // hoop
    this.rim = V(0, 3.05, -6.3);
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 12), std(0x444a55, { metalness: 0.7 }), 0, 2.1, -7.6, this.scene);
    const board = mesh(new THREE.BoxGeometry(1.8, 1.1, 0.06), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.6, roughness: 0.1, transparent: true, opacity: 0.6 }), 0, 3.55, -6.95, this.scene);
    mesh(new THREE.BoxGeometry(0.6, 0.45, 0.07), std(0xe63946), 0, -0.15, 0, board).material.transparent = false;
    const ring = mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 32), std(0xff6b1a, { metalness: 0.5 }), this.rim.x, this.rim.y, this.rim.z, this.scene);
    ring.rotation.x = Math.PI / 2;
    const net = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.CylinderGeometry(0.23, 0.14, 0.45, 12, 3, true)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    net.position.set(this.rim.x, this.rim.y - 0.24, this.rim.z); this.scene.add(net); this.net = net;
    const seams = pixelTexture((g, s) => { g.fillStyle = "#e0752d"; g.fillRect(0, 0, s, s); g.fillStyle = "#2a1408"; g.fillRect(s / 2, 0, 1, s); g.fillRect(0, s / 2, s, 1); g.fillRect(s / 4, 0, 1, s); }, 32);
    this.ball = mesh(new THREE.SphereGeometry(0.12, 24, 16), std(0xffffff, { map: seams, roughness: 0.6 }), 0, 0, 0, this.scene);
    this.newShot();
  }
  newShot() {
    const a = (this.rand() - 0.5) * Math.PI * 0.9, d = 3 + this.rand() * 4;
    this.from = V(Math.sin(a) * d, 1.9, this.rim.z + Math.cos(a) * d);
    this.u = 0; this.phase = "shot"; this.apex = 1.8 + this.rand() * 1.5;
  }
  update(dt) {
    const b = this.ball.position;
    if (this.phase === "shot") {
      this.u = Math.min(1, this.u + 0.011 * dt);
      b.copy(this.from).lerp(this.rim, this.u); b.y += Math.sin(this.u * Math.PI) * this.apex;
      this.ball.rotation.x -= 0.2 * dt;
      if (this.u >= 1) { this.phase = "drop"; this.vy = -0.03; this.vx = (this.from.x - this.rim.x) * -0.004; this.vz = 0.01; this.swish = 1; }
    } else {
      this.vy -= 0.006 * dt; b.y += this.vy * dt; b.x += this.vx * dt; b.z += this.vz * dt;
      if (b.y < 0.12) { b.y = 0.12; this.vy = Math.abs(this.vy) * 0.6; }
      this.swish *= Math.pow(0.9, dt);
      if (b.y < 0.2 && Math.abs(this.vy) < 0.02) { this.wait = (this.wait || 0) + dt; if (this.wait > 40) { this.wait = 0; this.newShot(); } }
    }
    this.net.scale.y = 1 + (this.swish || 0) * 0.35;      // the net snaps on a swish
    const look = V(lerp(b.x, this.rim.x, 0.5), lerp(b.y, this.rim.y, 0.5), lerp(b.z, this.rim.z, 0.5));
    this.camera.position.lerp(V(this.from.x * 0.9 + 1.2, 2.3, this.from.z + 2.6), Math.min(1, 0.04 * dt));
    this.camera.lookAt(look);
  }
}

SCENES.push(
  { cls: BrickSmash, weight: 1 },
  { cls: StrikeLane, weight: 1 },
  { cls: ArrowCam, weight: 1 },
  { cls: TrickShots, weight: 1 },
);
