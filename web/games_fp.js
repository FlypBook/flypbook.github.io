// FlypBook 3D scenes: first-person rides. Original designs.
import { Scene3D, gradientTexture } from "./game3d.js";
import { THREE, V, lerp, std, mesh, groundTexture, windowTexture, makePine, pixelTexture, noisy, css, rgb } from "./games_kit.js";

const dummy = new THREE.Object3D();

// ---------- Canyon Drone: an FPV drone threading glowing gates through a red-rock canyon ----------
class DroneCanyon extends Scene3D {
  build() {
    const r = this.rand;
    this.sky({ elevation: 13, azimuth: 200, turbidity: 6 });
    this.scene.fog = new THREE.Fog(0xf2c9a0, 25, 120);
    this.scene.add(new THREE.HemisphereLight(0xffe2c4, 0x7a3a1c, 1.2));
    this.sun = this.sunLight(0xffd8a8, 2.4, 25);
    this.floorTex = groundTexture(r, "#c4713d", 0.2, 30);
    const floor = mesh(new THREE.PlaneGeometry(60, 300), std(0xffffff, { map: this.floorTex, roughness: 1 }), 0, 0, -130, this.scene);
    floor.rotation.x = -Math.PI / 2;
    this.river = groundTexture(r, "#2c8fb8", 0.15, 1); this.river.repeat.set(1, 40);
    const river = mesh(new THREE.PlaneGeometry(4, 300), std(0xffffff, { map: this.river, roughness: 0.15, metalness: 0.3 }), 0, 0.02, -130, this.scene);
    river.rotation.x = -Math.PI / 2;
    // canyon walls: stacks of faceted rocks, with per-rock colors
    this.rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), std(0xffffff, { flatShading: true, roughness: 0.95 }), 160);
    this.rockData = [];
    const tones = [0xb5532c, 0xc8693a, 0x9c4426, 0xd98a4e];
    for (let i = 0; i < 160; i++) {
      const side = i % 2 ? 1 : -1;
      this.rockData.push({ x: side * (8 + r() * 6), y: r() * 18, z: -Math.floor(i / 2) * 3.5, s: 3 + r() * 4, rot: r() * 6 });
      this.rocks.setColorAt(i, new THREE.Color(tones[Math.floor(r() * tones.length)]));
    }
    this.rocks.castShadow = this.rocks.receiveShadow = true; this.rocks.frustumCulled = false;
    this.scene.add(this.rocks);
    this.gates = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.14, 8, 32), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff7a1a, emissiveIntensity: 1.8 }));
      g.position.set((r() - 0.5) * 7, 3 + r() * 8, -20 - i * 25);
      this.scene.add(g); this.gates.push(g);
    }
    this.pos = V(0, 5, 0);
  }
  update(dt) {
    const move = 0.62 * dt;
    this.floorTex.offset.y += move / 10; this.river.offset.y += move / 7.5;
    this.rockData.forEach((d, i) => {
      d.z += move; if (d.z > 10) d.z -= 280;
      dummy.position.set(d.x, d.y, d.z); dummy.rotation.set(d.rot, d.rot * 0.7, 0); dummy.scale.set(d.s, d.s * 1.6, d.s);
      dummy.updateMatrix(); this.rocks.setMatrixAt(i, dummy.matrix);
    });
    this.rocks.instanceMatrix.needsUpdate = true;
    for (const g of this.gates) {
      g.position.z += move;
      if (g.position.z > 6) { g.position.z -= 150; g.position.x = (this.rand() - 0.5) * 7; g.position.y = 3 + this.rand() * 8; }
    }
    const next = this.gates.filter(g => g.position.z < -1).sort((a, b) => b.position.z - a.position.z)[0];
    const vx = (next.position.x - this.pos.x), vy = (next.position.y - this.pos.y);
    this.pos.x += vx * Math.min(1, 0.03 * dt); this.pos.y += vy * Math.min(1, 0.03 * dt);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.pos.x + vx * 0.3, this.pos.y + vy * 0.3, -10);
    this.camera.rotation.z = -vx * 0.06;                                  // bank into turns
    this.camera.fov = 82; this.camera.updateProjectionMatrix();
    this.sun.position.set(this.pos.x - 10, 30, this.pos.z + 5); this.sun.target.position.set(this.pos.x, 0, -15);
  }
}

// ---------- Coaster: a first-person roller coaster over hills and trees ----------
class Coaster extends Scene3D {
  build() {
    const r = this.rand;
    this.sky({ elevation: 40, azimuth: 160 });
    this.scene.fog = new THREE.Fog(0xd6ecff, 40, 150);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b2a, 1.2));
    this.sun = this.sunLight(0xfff2dd, 2.4, 20);
    this.grass = groundTexture(r, "#5aa84a", 0.2, 80);
    const g = mesh(new THREE.PlaneGeometry(500, 500), std(0xffffff, { map: this.grass, roughness: 1 }), 0, 0, 0, this.scene);
    g.rotation.x = -Math.PI / 2; this.ground = g;
    this.trees = [];
    for (let i = 0; i < 40; i++) { const t = makePine(1 + r() * 1.5); t.position.set((r() - 0.5) * 80, 0, -r() * 200); this.scene.add(t); this.trees.push(t); }
    this.N = 150;
    this.ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.1, 0.25), std(0x7a4b2a), this.N);
    const railMat = std(0xe63946, { metalness: 0.6, roughness: 0.3 });
    this.rails = [0, 1].map(() => new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 1), railMat, this.N));
    this.posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8), std(0xf1faee, { metalness: 0.3 }), 40);
    for (const m of [this.ties, ...this.rails, this.posts]) { m.castShadow = true; m.frustumCulled = false; this.scene.add(m); }
    // the front of our car, fixed to the camera
    const car = mesh(new THREE.BoxGeometry(1.4, 0.35, 0.6), std(0xffd43b, { metalness: 0.3, roughness: 0.4 }), 0, -0.85, -1.1);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), std(0x333333), 0, 0.3, 0.1, car).rotation.z = Math.PI / 2;
    this.camera.add(car);
    this.s = 0; this.v = 0.35;
  }
  P(s) {
    return V(Math.sin(s * 0.045) * 10 + Math.sin(s * 0.013) * 6, 7 + Math.sin(s * 0.06) * 4.5 + Math.sin(s * 0.021) * 3, -s);
  }
  update(dt) {
    const slope = this.P(this.s + 1).y - this.P(this.s).y;
    this.v = Math.min(0.9, Math.max(0.25, this.v - slope * 0.02 * dt));   // faster downhill
    this.s += this.v * dt;
    const up = V(0, 1, 0);
    let k = 0, step = 0.9, start = Math.floor(this.s / step) * step - 4;
    for (let i = 0; i < this.N; i++) {
      const s = start + i * step, a = this.P(s), b = this.P(s + step);
      dummy.position.copy(a); dummy.lookAt(b); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      this.ties.setMatrixAt(i, dummy.matrix);
      const right = new THREE.Vector3().subVectors(b, a).cross(up).normalize();
      for (const [ri, side] of [[0, -0.75], [1, 0.75]]) {
        const pa = a.clone().addScaledVector(right, side), pb = b.clone().addScaledVector(right, side);
        dummy.position.copy(pa).add(pb).multiplyScalar(0.5); dummy.position.y += 0.1;
        dummy.lookAt(pb.x, pb.y + 0.1, pb.z); dummy.scale.set(1, 1, pa.distanceTo(pb) + 0.02); dummy.updateMatrix();
        this.rails[ri].setMatrixAt(i, dummy.matrix);
      }
      if (i % 4 === 0 && k < 40) {
        dummy.position.set(a.x, a.y / 2, a.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, a.y, 1); dummy.updateMatrix();
        this.posts.setMatrixAt(k++, dummy.matrix);
      }
    }
    this.posts.count = k;
    for (const m of [this.ties, ...this.rails, this.posts]) m.instanceMatrix.needsUpdate = true;
    const here = this.P(this.s), ahead = this.P(this.s + 7);
    this.camera.position.set(here.x, here.y + 1.3, here.z);
    this.camera.lookAt(ahead.x, ahead.y + 1, ahead.z);
    this.camera.fov = 70 + this.v * 18; this.camera.updateProjectionMatrix();
    for (const t of this.trees) if (t.position.z > here.z + 15) { t.position.z -= 200; t.position.x = here.x + (this.rand() - 0.5) * 80; }
    this.ground.position.set(here.x, 0, here.z - 150);
    this.grass.offset.set(here.x / 6.25, -here.z / 6.25);
    this.sun.position.set(here.x + 10, 30, here.z + 10); this.sun.target.position.set(here.x, 0, here.z - 15);
  }
}

// ---------- Mine Cart: rattling through a blocky cave full of ore ----------
class MineCart extends Scene3D {
  build() {
    const r = this.rand;
    this.scene.background = new THREE.Color(0x050403);
    this.scene.fog = new THREE.Fog(0x050403, 4, 30);
    this.scene.add(new THREE.HemisphereLight(0x443322, 0x000000, 0.4));
    this.lantern = new THREE.PointLight(0xffb366, 30, 22, 1.6);
    this.lantern.position.set(0, 0.3, -0.5);
    this.camera.add(this.lantern);
    const stone = pixelTexture((g, s) => { noisy(r, "#6d6d6d", 0.35)(g, s); g.fillStyle = "#4a4a4a"; for (let i = 0; i < 6; i++) g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 2, 1); });
    this.blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, { map: stone, roughness: 0.95 }), 2600);
    this.blocks.frustumCulled = false; this.blocks.receiveShadow = true;
    this.scene.add(this.blocks);
    this.torches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.45, 0.15), new THREE.MeshStandardMaterial({ color: 0xffc04d, emissive: 0xff9a1a, emissiveIntensity: 3 }), 60);
    this.torches.frustumCulled = false; this.scene.add(this.torches);
    this.ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.12, 0.3), std(0x6b4423), 80);
    this.ties.frustumCulled = false; this.scene.add(this.ties);
    this.ores = [0xffd43b, 0x4de1ff, 0xff4d6d, 0x8cff66];
    // the cart rim in front of the camera
    const rim = std(0x5a3d22, { roughness: 0.8 });
    const cart = new THREE.Group();
    mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), rim, 0, -0.55, -0.9, cart);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), rim, s * 0.6, -0.55, -0.45, cart);
    this.camera.add(cart);
    this.d = 0; this.built = -1;
  }
  C(z) { return V(Math.sin(z * 0.06) * 5 + Math.sin(z * 0.017) * 4, Math.sin(z * 0.04) * 2, -z); }
  rebuild(z0) {
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0, t = 0, ties = 0;
    for (let z = z0; z < z0 + 50 && n < 2580; z++) {
      const c = this.C(z), cx = Math.round(c.x), cy = Math.round(c.y);
      // a ring of blocks around a 5-wide, 4-tall tunnel
      const ring = [];
      for (let x = -3; x <= 3; x++) { ring.push([x, -1]); ring.push([x, 4]); }
      for (let y = 0; y < 4; y++) { ring.push([-3, y]); ring.push([3, y]); }
      for (const [x, y] of ring) {
        this.blocks.setMatrixAt(n, m.makeTranslation(cx + x, cy + y, -z));
        const hsh = Math.abs(Math.sin((cx + x) * 12.9898 + (cy + y) * 78.233 + z * 37.719) * 43758.5453) % 1;
        this.blocks.setColorAt(n, hsh < 0.06 ? col.set(this.ores[Math.floor(hsh * 66) % 4]) : col.set(0xffffff));
        n++;
      }
      if (z % 7 === 0 && t < 60) this.torches.setMatrixAt(t++, m.makeTranslation(cx + (z % 14 ? 2.4 : -2.4), cy + 2.2, -z));
      if (ties < 80) this.ties.setMatrixAt(ties++, m.makeTranslation(c.x, c.y - 0.45, -z));
    }
    this.blocks.count = n; this.torches.count = t; this.ties.count = ties;
    this.blocks.instanceMatrix.needsUpdate = this.torches.instanceMatrix.needsUpdate = this.ties.instanceMatrix.needsUpdate = true;
    if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;
  }
  update(dt) {
    this.d += 0.32 * dt;
    const z0 = Math.floor(this.d) - 3;
    if (z0 !== this.built) { this.built = z0; this.rebuild(z0); }
    const here = this.C(this.d), ahead = this.C(this.d + 5);
    const rattle = Math.sin(this.t * 40) * 0.015;
    this.camera.position.set(here.x, here.y + 0.6 + rattle, here.z);
    this.camera.lookAt(ahead.x, ahead.y + 0.5, ahead.z);
    this.lantern.intensity = 26 + Math.sin(this.t * 13) * 3;
  }
}

// ---------- Rooftop Run: first-person sprint and leaps across city rooftops ----------
class RooftopRun extends Scene3D {
  build() {
    const r = this.rand;
    this.sky({ elevation: 3, azimuth: 190, turbidity: 8, rayleigh: 2.6 });
    this.scene.fog = new THREE.Fog(0xe2876a, 30, 140);
    this.scene.add(new THREE.HemisphereLight(0xffc9a8, 0x2a2a50, 1.1));
    this.sun = this.sunLight(0xffb27a, 2.3, 16);
    this.roofTex = groundTexture(r, "#a39fae", 0.12, 2, (g, s) => { g.fillStyle = "rgba(0,0,0,0.15)"; for (let i = 0; i < s; i += 8) { g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); } });
    this.wallTexs = ["#c4a484", "#8d99ae", "#d6b3a0", "#a5a58d"].map(c => windowTexture(r, c, "#2b3a55", 0.25));
    this.buildings = [];
    // far skyline
    for (let i = 0; i < 30; i++) {
      const h = 20 + r() * 40, w = 8 + r() * 8;
      const tex = this.wallTexs[i % 4].clone(); tex.needsUpdate = true; tex.repeat.set(w / 8, h / 8);
      const b = mesh(new THREE.BoxGeometry(w, h, w), std(0xffffff, { map: tex }), (i % 2 ? 1 : -1) * (25 + r() * 40), h / 2 - 10, -r() * 240);
      b.userData.sky = true; this.scene.add(b); this.buildings.push(b);
    }
    this.roofs = [{ x: 0, z: 2, len: 14, top: 12, w: 6 }];
    this.meshes = [];
    this.d = 0; this.pos = V(0, 14, 0); this.look = V(0, 13, -8);
    this.extend();
  }
  addMesh(p) {
    const r = this.rand, g = new THREE.Group();
    const tex = this.wallTexs[Math.floor(r() * 4)].clone(); tex.needsUpdate = true; tex.repeat.set(p.w / 8, (p.top + 20) / 8);
    mesh(new THREE.BoxGeometry(p.w, p.top + 20, p.len), [std(0xffffff, { map: tex }), std(0xffffff, { map: tex }), std(0xffffff, { map: this.roofTex }), std(0x555555), std(0xffffff, { map: tex }), std(0xffffff, { map: tex })], 0, (p.top - 20) / 2, 0, g);
    for (let k = 0; k < 2; k++) mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), std(0xb8bcc6, { metalness: 0.5 }), (r() < 0.5 ? -1 : 1) * (p.w / 2 - 1), p.top + 0.45, (r() - 0.5) * (p.len - 3), g);
    if (r() < 0.4) {
      const tower = mesh(new THREE.CylinderGeometry(1, 1, 2, 12), std(0x8b5a3c), -p.w / 2 + 1.3, p.top + 3, -p.len / 2 + 1.5, g);
      mesh(new THREE.ConeGeometry(1.1, 0.8, 12), std(0x5a3b24), 0, 1.4, 0, tower);
    }
    g.position.set(p.x, 0, p.z - p.len / 2);
    this.scene.add(g); p.mesh = g;
  }
  extend() {
    const r = this.rand;
    let last = this.roofs.at(-1);
    if (!last.mesh) this.addMesh(last);
    while (last.z - last.len > -this.d - 90) {
      const gap = 2.5 + r() * 3;
      last = { x: Math.max(-4, Math.min(4, last.x + (r() - 0.5) * 4)), z: last.z - last.len - gap, len: 8 + r() * 10, top: Math.max(6, Math.min(18, last.top + (r() - 0.5) * 4)), w: 6 + r() * 4 };
      this.addMesh(last); this.roofs.push(last);
    }
    while (this.roofs.length > 2 && this.roofs[1].z - this.roofs[1].len > -this.d + 10) {
      const old = this.roofs.shift().mesh;
      this.scene.remove(old);
      old.traverse(o => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { if (m.map !== this.roofTex) m.map?.dispose(); m.dispose(); } });
    }
  }
  path(d) {
    const z = -d;
    for (let i = 0; i < this.roofs.length; i++) {
      const p = this.roofs[i], n = this.roofs[i + 1];
      const take = p.z - p.len + 0.5;
      if (z <= p.z && z >= take) return { x: p.x, y: p.top, ground: true };
      if (n && z < take && z > n.z - 1) {
        const t = (take - z) / (take - (n.z - 1));
        return { x: lerp(p.x, n.x, t), y: lerp(p.top, n.top, t) + 2.2 * 4 * t * (1 - t), ground: false };
      }
    }
    return { x: 0, y: 12, ground: true };
  }
  update(dt) {
    this.d += 0.2 * dt;
    this.extend();
    for (const b of this.buildings) if (b.userData.sky && b.position.z > -this.d + 30) b.position.z -= 260;
    const p = this.path(this.d), a = this.path(this.d + 6);
    const bob = p.ground ? Math.sin(this.t * 13) * 0.07 : 0;
    this.pos.set(lerp(this.pos.x, p.x, Math.min(1, 0.1 * dt)), p.y + 1.7 + bob, -this.d);
    this.camera.position.copy(this.pos);
    this.look.lerp(V(a.x, a.y + 1.2, -this.d - 6), Math.min(1, 0.1 * dt));
    this.camera.lookAt(this.look);
    this.camera.fov = lerp(this.camera.fov, p.ground ? 74 : 84, 0.08 * dt); this.camera.updateProjectionMatrix();
    this.sun.position.set(this.pos.x - 12, this.pos.y + 18, this.pos.z + 18); this.sun.target.position.set(this.pos.x, this.pos.y - 5, this.pos.z - 10);
  }
}

SCENES.push(
  { cls: DroneCanyon, weight: 1 },
  { cls: Coaster, weight: 1 },
  { cls: MineCart, weight: 1 },
  { cls: RooftopRun, weight: 1 },
);
