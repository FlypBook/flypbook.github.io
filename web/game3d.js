// FlypBook 3D gameplay backgrounds, built with three.js (free, open-source 3D engine).
// Original scenes in the style of story-video gameplay footage: real lighting, shadows, fog,
// and pixel-art textures generated in code. Endless, nothing to download besides the engine.

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";

// ---------- Shared helpers ----------
const rgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const css = ([r, g, b], f = 1) => `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;

/** A tiny pixel-art texture painted in code (crisp, game-like when magnified). */
function pixelTexture(paint, size = 16) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noisy(rand, hex, vary) {
  const base = rgb(hex);
  return (g, s, y0 = 0, y1 = s) => {
    for (let y = y0; y < y1; y++) for (let x = 0; x < s; x++) {
      g.fillStyle = css(base, 1 + (rand() - 0.5) * vary);
      g.fillRect(x, y, 1, 1);
    }
  };
}
function gradientTexture(top, bottom) {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top); grad.addColorStop(1, bottom);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft "photo studio" for shiny things to reflect (without it, metal renders black). */
function studioReflections(renderer) {
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: gradientTexture("#f4f1ff", "#2a2633"), side: THREE.BackSide }));
  env.add(dome);
  const panel = (x, y, z, w, h, c) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(0, 8, 0, 8, 8, 0xffffff);      // big softbox overhead
  panel(-8, 2, 3, 3, 6, 0xfff1dd);     // warm side light
  panel(7, 3, -4, 3, 5, 0xdde8ff);     // cool rim light
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  env.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
  return tex;
}

/** Base for all 3D scenes: owns the WebGL renderer, camera, and cleanup. */
class Scene3D {
  static webgl = true;
  constructor(rand) { this.rand = rand; this.t = 0; }
  mount(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.environment = studioReflections(this.renderer);
    this.scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(70, 9 / 16, 0.05, 250);
    this.scene.add(this.camera);
    this.build();
  }
  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  draw(dt) {
    this.t += dt / 60;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.scene.traverse(o => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
    });
    this.scene.background?.dispose?.();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
  sunLight(color, intensity, size = 14) {
    const sun = new THREE.DirectionalLight(color, intensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 1, far: 80 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);
    return sun;
  }
}

// =====================================================================
// 1. Sky Parkour 3D: first-person sprint-jumping across floating blocks
// =====================================================================
const BLOCK_WORLDS = [
  { name: "meadow", sky: ["#3d8fe0", "#cfeaff"], fog: "#cfeaff", top: "#5dbb4a", dirt: "#8b5a2b", sun: 2.6 },
  { name: "snow", sky: ["#7fa6d6", "#eef5ff"], fog: "#eef5ff", top: "#f6f9ff", dirt: "#7d8590", sun: 2.2 },
  { name: "desert", sky: ["#f08a4b", "#ffe1b0"], fog: "#ffd9a6", top: "#e9c77b", dirt: "#c99a55", sun: 2.8 },
  { name: "volcano", sky: ["#120404", "#5a1a0e"], fog: "#3a0f08", top: "#3b3333", dirt: "#2a2020", sun: 0.9, glow: "#ff7a1a" },
  { name: "neon", sky: ["#05020f", "#2a0b52"], fog: "#1a0838", top: "#1d1238", dirt: "#120a26", sun: 0.6, glow: "#3df2ff" },
];

class Parkour3D extends Scene3D {
  build() {
    const r = this.rand, W = this.world = BLOCK_WORLDS[Math.floor(r() * BLOCK_WORLDS.length)];
    this.scene.background = gradientTexture(W.sky[0], W.sky[1]);
    this.scene.fog = new THREE.Fog(W.fog, 16, 58);
    this.scene.add(new THREE.HemisphereLight(W.sky[1], W.dirt, W.glow ? 0.7 : 1.1));
    this.sun = this.sunLight(0xfff2dd, W.sun);

    // Pixel-art block textures, painted in code
    const top = pixelTexture((g, s) => {
      noisy(r, W.top, 0.25)(g, s);
      if (W.glow) { g.fillStyle = W.glow; for (let i = 0; i < 5; i++) g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1 + Math.floor(r() * 3), 1); }
    });
    const side = pixelTexture((g, s) => {
      noisy(r, W.dirt, 0.3)(g, s);
      noisy(r, W.top, 0.25)(g, s, 0, 3);
      for (let x = 0; x < s; x++) if (r() < 0.5) { g.fillStyle = css(rgb(W.top), 0.85); g.fillRect(x, 3, 1, 1 + Math.floor(r() * 2)); }
      if (W.glow) { g.fillStyle = W.glow; for (let i = 0; i < 4; i++) g.fillRect(Math.floor(r() * s), 5 + Math.floor(r() * 10), 1, 2); }
    });
    const dirt = pixelTexture((g, s) => {
      noisy(r, W.dirt, 0.3)(g, s);
      if (W.glow) { g.fillStyle = W.glow; for (let i = 0; i < 3; i++) g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 2, 1); }
    });
    const mat = map => new THREE.MeshStandardMaterial({
      map, roughness: 0.95,
      ...(W.glow ? { emissive: new THREE.Color(W.glow), emissiveMap: map, emissiveIntensity: 0.35 } : {}),
    });
    const sideMat = mat(side), topMat = mat(top), dirtMat = mat(dirt);
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.tops = new THREE.InstancedMesh(box, [sideMat, sideMat, topMat, dirtMat, sideMat, sideMat], 500);
    this.fill = new THREE.InstancedMesh(box, dirtMat, 1500);
    for (const m of [this.tops, this.fill]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; this.scene.add(m); }

    // Blocky clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: W.glow ? 0x3b2a5a : 0xffffff, roughness: 1, transparent: true, opacity: 0.9 });
    this.clouds = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(4 + r() * 6, 1, 3 + r() * 4), cloudMat);
      c.position.set((r() - 0.5) * 60, 14 + r() * 6, -r() * 70);
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);

    // First-person arm, swinging while running
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xe0ac7f, roughness: 0.8 }));
    this.arm.position.set(0.38, -0.36, -0.55);
    this.camera.add(this.arm);

    this.platforms = [{ x: 0, z: 2, len: 5, top: 1, wide: 1, depth: 3 }];
    this.islands = [];
    this.pos = new THREE.Vector3(0.5, 2.6, 0);  // feet + eye height handled below
    this.look = new THREE.Vector3(0.5, 2, -6);
    this.dist = 0;
    this.extend(true);
  }
  // The run goes toward -z. Each platform covers z in [z - len, z].
  extend(force) {
    const r = this.rand;
    let last = this.platforms[this.platforms.length - 1], added = force;
    while (last.z - last.len > -this.dist - 45) {
      const gap = 1 + Math.floor(r() * 3);
      last = {
        x: Math.max(-3, Math.min(3, last.x + Math.floor(r() * 3) - 1)),
        z: last.z - last.len - gap,
        len: 1 + Math.floor(r() * 3),
        top: Math.max(-1, Math.min(5, last.top + (gap >= 3 ? Math.floor(r() * 2) - 1 : Math.floor(r() * 3) - 1))),
        wide: r() < 0.3 ? 2 : 1,
        depth: 2 + Math.floor(r() * 3),
      };
      this.platforms.push(last);
      if (r() < 0.55) {
        const side = r() < 0.5 ? -1 : 1;
        this.islands.push({ x: side * (6 + Math.floor(r() * 8)), z: last.z - Math.floor(r() * 4), top: Math.floor(r() * 7) - 2, size: 2 + Math.floor(r() * 2), depth: 2 + Math.floor(r() * 3) });
      }
      added = true;
    }
    const behind = -this.dist + 4;
    while (this.platforms.length > 2 && this.platforms[1].z - this.platforms[1].len > behind) { this.platforms.shift(); added = true; }
    const before = this.islands.length;
    this.islands = this.islands.filter(i => i.z - i.size < behind);
    if (added || before !== this.islands.length) this.rebuild();
  }
  rebuild() {
    const m = new THREE.Matrix4();
    let nt = 0, nf = 0;
    const column = (x, z, top, depth) => {
      if (nt < 500) this.tops.setMatrixAt(nt++, m.makeTranslation(x + 0.5, top - 0.5, z - 0.5));
      for (let d = 1; d < depth && nf < 1500; d++) this.fill.setMatrixAt(nf++, m.makeTranslation(x + 0.5, top - 0.5 - d, z - 0.5));
    };
    for (const p of this.platforms) for (let k = 0; k < p.len; k++) for (let wx = 0; wx < p.wide; wx++) column(p.x + wx, p.z - k, p.top, p.depth - (k % 2));
    for (const is of this.islands) for (let a = 0; a < is.size; a++) for (let b = 0; b < is.size; b++) {
      column(is.x + a, is.z - b, is.top, is.depth - Math.abs(a - is.size / 2) - Math.abs(b - is.size / 2) + 1);
    }
    this.tops.count = nt; this.fill.count = nf;
    this.tops.instanceMatrix.needsUpdate = this.fill.instanceMatrix.needsUpdate = true;
  }
  /** Where the runner's feet are at distance d along the run (arcs over gaps). */
  path(d) {
    const z = -d, ps = this.platforms;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i], next = ps[i + 1];
      const start = p.z + 0.2, takeoff = p.z - p.len + 0.3;
      const cx = p.x + p.wide / 2;
      if (z <= start && z >= takeoff) return { x: cx, y: p.top, ground: true };
      if (next && z < takeoff && z > next.z - 0.25) {
        const t = (takeoff - z) / (takeoff - (next.z - 0.25));
        const lift = 1.05 + (takeoff - next.z) * 0.22;
        return { x: cx + (next.x + next.wide / 2 - cx) * t, y: p.top + (next.top - p.top) * t + lift * 4 * t * (1 - t), ground: false };
      }
    }
    return { x: 0.5, y: 1, ground: true };
  }
  update(dt) {
    this.dist += 0.095 * dt;  // sprint speed in blocks per frame
    this.extend(false);
    const p = this.path(this.dist), ahead = this.path(this.dist + 3.5);
    const bob = p.ground ? Math.sin(this.t * 15) * 0.045 : 0;
    this.pos.set(this.pos.x + (p.x - this.pos.x) * Math.min(1, 0.15 * dt), p.y + 1.62 + bob, -this.dist);
    this.camera.position.copy(this.pos);
    this.look.lerp(new THREE.Vector3(ahead.x, ahead.y + 1.25, -this.dist - 3.5), Math.min(1, 0.1 * dt));
    this.camera.lookAt(this.look);
    const fov = p.ground ? 72 : 80;  // speed "kick" while airborne
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, 0.08 * dt);
    this.camera.updateProjectionMatrix();
    this.arm.rotation.x = -0.25 + Math.sin(this.t * 15) * (p.ground ? 0.22 : 0.05);
    this.arm.position.y = -0.36 + (p.ground ? Math.abs(Math.sin(this.t * 15)) * 0.03 : 0.04);
    this.sun.position.set(this.pos.x + 8, this.pos.y + 18, this.pos.z + 6);
    this.sun.target.position.set(this.pos.x, this.pos.y - 2, this.pos.z - 6);
    this.clouds.children.forEach(c => { c.position.x += 0.01 * dt; if (c.position.z > this.pos.z + 20) c.position.z -= 90; });
  }
}

// =====================================================================
// 2. Neon Run 3D: a runner on a glowing 3-lane highway dodging and grabbing coins
// =====================================================================
class NeonRun3D extends Scene3D {
  build() {
    const r = this.rand;
    this.hue = 0.72 + r() * 0.12;
    const skyTop = new THREE.Color().setHSL(this.hue, 0.7, 0.04), skyBot = new THREE.Color().setHSL(this.hue - 0.08, 0.85, 0.28);
    this.scene.background = gradientTexture("#" + skyTop.getHexString(), "#" + skyBot.getHexString());
    this.scene.fog = new THREE.Fog(skyBot, 20, 95);
    this.scene.add(new THREE.HemisphereLight(0x8a7dff, 0x1a0b2e, 0.9));
    this.key = this.sunLight(0xffffff, 1.6, 6);

    // Road with a scrolling neon grid
    this.gridTex = pixelTexture((g, s) => {
      g.fillStyle = "#120a22"; g.fillRect(0, 0, s, s);
      g.fillStyle = "#ff3df0"; g.fillRect(0, 0, s, 1); g.fillRect(0, 0, 1, s);
    }, 32);
    this.gridTex.wrapS = this.gridTex.wrapT = THREE.RepeatWrapping;
    this.gridTex.repeat.set(4, 80);
    this.gridTex.magFilter = THREE.LinearFilter;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 220),
      new THREE.MeshStandardMaterial({ map: this.gridTex, emissive: 0xff3df0, emissiveMap: this.gridTex, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3 }));
    road.rotation.x = -Math.PI / 2; road.position.z = -100; road.receiveShadow = true;
    this.scene.add(road);
    for (const x of [-4.5, 4.5]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 220), new THREE.MeshBasicMaterial({ color: 0x3df2ff }));
      rail.position.set(x, 0.08, -100); this.scene.add(rail);
    }

    // Retro sun
    const sunTex = pixelTexture((g, s) => {
      const grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, "#ffe25a"); grad.addColorStop(1, "#ff3d8b");
      g.fillStyle = grad; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 7; i++) g.fillRect(0, s * 0.55 + i * i * 1.3, s, 1 + i * 0.5);
    }, 128);
    sunTex.magFilter = THREE.LinearFilter;
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false }));
    sun.position.set(0, 14, -180); this.scene.add(sun);

    // Buildings with lit windows
    const winTex = pixelTexture((g, s) => {
      g.fillStyle = "#0b0716"; g.fillRect(0, 0, s, s);
      for (let y = 1; y < s; y += 3) for (let x = 1; x < s; x += 3) if (r() < 0.45) {
        g.fillStyle = r() < 0.5 ? "#ffd43b" : "#7af7ff"; g.fillRect(x, y, 2, 2);
      }
    }, 32);
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
    const bMat = new THREE.MeshStandardMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.1, roughness: 0.8 });
    this.buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bMat, 70);
    this.bData = [];
    for (let i = 0; i < 70; i++) this.bData.push({ side: i % 2 ? 1 : -1, z: -Math.floor(i / 2) * 6.5 - r() * 2, w: 3 + r() * 4, h: 6 + r() * 22, d: 4 + r() * 2, off: r() * 3 });
    this.scene.add(this.buildings);

    // Obstacle & coin pools
    const stripe = pixelTexture((g, s) => { for (let x = 0; x < s; x++) { g.fillStyle = Math.floor(x / 4) % 2 ? "#ff3d8b" : "#ffffff"; g.fillRect(x, 0, 1, s); } });
    this.barrierMat = new THREE.MeshStandardMaterial({ map: stripe, emissive: 0xff3d8b, emissiveMap: stripe, emissiveIntensity: 0.5, roughness: 0.5 });
    this.hurdleMat = new THREE.MeshStandardMaterial({ color: 0x3df2ff, emissive: 0x3df2ff, emissiveIntensity: 0.8 });
    this.coinMat = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 1, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.4 });
    this.coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20);
    this.objects = [];
    for (let z = -14; z > -95; z -= 7) this.spawn(z);

    // The runner: a simple low-poly character with swinging limbs
    this.runner = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98a5e, roughness: 0.7 });
    const hoodie = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(r(), 0.8, 0.55), roughness: 0.6 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x23233a, roughness: 0.8 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const part = (geo, m, x, y, z, parent = this.runner) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    part(new THREE.CapsuleGeometry(0.24, 0.45, 4, 10), hoodie, 0, 1.15, 0);
    part(new THREE.SphereGeometry(0.2, 16, 12), skin, 0, 1.68, 0);
    part(new THREE.BoxGeometry(0.3, 0.32, 0.12), new THREE.MeshStandardMaterial({ color: 0x8b5cf6 }), 0, 1.2, 0.24);  // backpack
    const limb = (x, y, len, m, foot) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0); this.runner.add(pivot);
      part(new THREE.CapsuleGeometry(0.09, len, 4, 8), m, 0, -len / 2 - 0.05, 0, pivot);
      if (foot) part(new THREE.BoxGeometry(0.16, 0.1, 0.28), shoe, 0, -len - 0.14, -0.06, pivot);
      return pivot;
    };
    this.legs = [limb(-0.13, 0.85, 0.62, pants, true), limb(0.13, 0.85, 0.62, pants, true)];
    this.arms = [limb(-0.33, 1.42, 0.46, hoodie), limb(0.33, 1.42, 0.46, hoodie)];
    this.scene.add(this.runner);

    this.speed = 0.3; this.lane = 0; this.laneX = 0; this.jumpT = -1; this.phase = 0;
  }
  spawn(z) {
    const r = this.rand, lane = Math.floor(r() * 3) - 1;
    const kind = r() < 0.45 ? "barrier" : r() < 0.55 ? "hurdle" : "coins";
    const group = new THREE.Group();
    if (kind === "barrier") { const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 0.4), this.barrierMat); m.position.y = 0.8; m.castShadow = true; group.add(m); }
    else if (kind === "hurdle") { const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 0.25), this.hurdleMat); m.position.y = 0.55; group.add(m); }
    else for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(this.coinGeo, this.coinMat); c.rotation.x = Math.PI / 2; c.position.set(0, 0.8, -k * 1.4); group.add(c); }
    group.position.set(lane * 2.6, 0, z);
    this.scene.add(group);
    this.objects.push({ lane, kind, group });
  }
  update(dt) {
    const move = this.speed * dt;
    this.speed = Math.min(0.48, this.speed + 0.00004 * dt);
    this.gridTex.offset.y += move / (220 / 80);

    // world moves toward the runner (who stays near z = 0)
    for (const o of this.objects) {
      o.group.position.z += move;
      if (o.kind === "coins") o.group.children.forEach((c, k) => {
        c.rotation.z += 0.08 * dt;
        if (!c.visible) return;
        if (o.lane === this.lane && Math.abs(o.group.position.z + c.position.z) < 0.6 && this.jumpT < 0.6) c.visible = false;
      });
    }
    this.objects = this.objects.filter(o => {
      if (o.group.position.z < 8) return true;
      this.scene.remove(o.group); return false;
    });
    while (this.objects.length < 12) this.spawn(Math.min(-60, this.objects.at(-1).group.position.z - 6 - this.rand() * 4));

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.bData.forEach((b, i) => {
      b.z += move * 0.98;
      if (b.z > 10) b.z -= 230;
      p.set(b.side * (4.8 + b.off + b.w / 2), b.h / 2, b.z); s.set(b.w, b.h, b.d);
      this.buildings.setMatrixAt(i, m.compose(p, q, s));
    });
    this.buildings.instanceMatrix.needsUpdate = true;

    // runner AI: dodge barriers, jump hurdles, steer toward coins
    const near = this.objects.filter(o => o.group.position.z < 0 && o.group.position.z > -7);
    const danger = near.find(o => o.lane === this.lane && o.kind !== "coins");
    if (danger) {
      if (danger.kind === "hurdle" && this.jumpT < 0 && danger.group.position.z > -3.2) this.jumpT = 0;
      else if (danger.kind === "barrier") {
        const blocked = l => this.objects.some(o => o.lane === l && o.kind === "barrier" && Math.abs(o.group.position.z - danger.group.position.z) < 4);
        const free = [-1, 0, 1].filter(l => !blocked(l)).sort((a, b) => Math.abs(a - this.lane) - Math.abs(b - this.lane));
        if (free.length) this.lane = free[0];
      }
    } else {
      const coin = this.objects.find(o => o.kind === "coins" && o.group.position.z < -2 && o.group.position.z > -10);
      if (coin && !this.objects.some(o => o.lane === coin.lane && o.kind === "barrier" && o.group.position.z < 0 && o.group.position.z > coin.group.position.z - 2)) this.lane = coin.lane;
    }
    const prevX = this.laneX;
    this.laneX += (this.lane - this.laneX) * Math.min(1, 0.16 * dt);
    let y = 0;
    if (this.jumpT >= 0) { this.jumpT += 0.04 * dt; y = Math.sin(Math.min(this.jumpT, 1) * Math.PI) * 1.4; if (this.jumpT >= 1) this.jumpT = -1; }

    // run cycle
    this.phase += move * 2.2;
    const swing = Math.sin(this.phase) * (this.jumpT >= 0 ? 0.3 : 0.95);
    this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8; this.arms[1].rotation.x = swing * 0.8;
    this.runner.position.set(this.laneX * 2.6, y + Math.abs(Math.sin(this.phase)) * 0.06, 0);
    this.runner.rotation.z = (prevX - this.laneX) * 2.5;
    this.runner.rotation.y = Math.PI;

    this.camera.position.set(this.laneX * 1.6, 3.1 + y * 0.25, 5.2);
    this.camera.lookAt(this.laneX * 2, 1.1, -7);
    this.key.position.set(this.runner.position.x + 3, 8, 4);
    this.key.target.position.copy(this.runner.position);
  }
}

// =====================================================================
// 3. Stack Tower: sliding slabs get trimmed and stacked into a colorful tower
// =====================================================================
class Stack3D extends Scene3D {
  build() {
    const r = this.rand;
    this.baseHue = r();
    this.scene.background = gradientTexture("#14102a", "#3a2a6a");
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x302050, 1.1));
    this.light = this.sunLight(0xffffff, 2.2, 10);
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.reset();
  }
  reset() {
    for (const o of this.stack || []) this.scene.remove(o.mesh);
    for (const o of this.falling || []) this.scene.remove(o.mesh);
    this.stack = []; this.falling = [];
    this.size = { x: 3, z: 3 }; this.center = { x: 0, z: 0 };
    this.layerH = 0.45;
    for (let i = 0; i < 6; i++) this.place(this.center.x, this.center.z, this.size.x, this.size.z, i, true);
    this.camY = this.stack.length * this.layerH;
    this.newMover();
  }
  color(i) { return new THREE.Color().setHSL((this.baseHue + i * 0.025) % 1, 0.65, 0.58); }
  place(x, z, sx, sz, i, base) {
    const mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: this.color(i), roughness: 0.55 }));
    mesh.scale.set(sx, this.layerH, sz);
    mesh.position.set(x, i * this.layerH - (base ? 0 : 0), z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.stack.push({ mesh, x, z, sx, sz });
  }
  newMover() {
    const i = this.stack.length;
    this.axis = i % 2 ? "x" : "z";
    this.dir = 1;
    this.moverPos = -4.5;
    this.mover = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: this.color(i), roughness: 0.55 }));
    this.mover.scale.set(this.size.x, this.layerH, this.size.z);
    this.mover.castShadow = true;
    // Stop roughly on target, sometimes perfectly (that's what makes it satisfying)
    this.stopAt = this.rand() < 0.35 ? 0 : (this.rand() - 0.5) * 0.6;
    this.scene.add(this.mover);
  }
  update(dt) {
    const i = this.stack.length;
    this.moverPos += 0.09 * dt * this.dir;
    const ax = this.axis, c = this.center[ax];
    const target = c + this.stopAt;
    this.mover.position.set(ax === "x" ? this.moverPos : this.center.x, i * this.layerH, ax === "z" ? this.moverPos : this.center.z);
    if (this.moverPos >= target) {
      // trim the overhang, drop the cut piece
      const size = ax === "x" ? this.size.x : this.size.z;
      const offset = this.moverPos - c, keep = size - Math.abs(offset);
      if (keep <= 0.15) { this.scene.remove(this.mover); this.reset(); return; }
      const newC = c + offset / 2;
      const cut = Math.abs(offset);
      if (cut > 0.01) {
        const piece = new THREE.Mesh(this.geo, this.mover.material.clone());
        piece.scale.set(ax === "x" ? cut : this.size.x, this.layerH, ax === "z" ? cut : this.size.z);
        piece.position.set(ax === "x" ? newC + Math.sign(offset) * (keep / 2 + cut / 2) : this.center.x, i * this.layerH, ax === "z" ? newC + Math.sign(offset) * (keep / 2 + cut / 2) : this.center.z);
        piece.castShadow = true;
        this.scene.add(piece);
        this.falling.push({ mesh: piece, vy: 0, spin: (this.rand() - 0.5) * 0.08 });
      } else {
        this.flash = 1;  // perfect drop
      }
      this.scene.remove(this.mover);
      if (ax === "x") { this.size.x = keep; this.center.x = newC; } else { this.size.z = keep; this.center.z = newC; }
      this.place(this.center.x, this.center.z, this.size.x, this.size.z, i);
      if (this.stack.length > 60) this.reset(); else this.newMover();
    }
    for (const f of this.falling) {
      f.vy -= 0.012 * dt; f.mesh.position.y += f.vy * dt;
      f.mesh.rotation.x += f.spin * dt; f.mesh.rotation.z += f.spin * dt;
    }
    this.falling = this.falling.filter(f => { if (f.mesh.position.y > this.camY - 25) return true; this.scene.remove(f.mesh); return false; });
    if (this.flash) {
      const top = this.stack.at(-1).mesh;
      top.material.emissive = new THREE.Color(0xffffff);
      top.material.emissiveIntensity = this.flash;
      this.flash = Math.max(0, this.flash - 0.05 * dt);
    }
    this.camY += (this.stack.length * this.layerH - this.camY) * Math.min(1, 0.05 * dt);
    const a = this.t * 0.25;
    this.camera.position.set(Math.cos(a) * 6.2, this.camY + 4, Math.sin(a) * 6.2);
    this.camera.lookAt(0, this.camY - 0.8, 0);
    this.light.position.set(5, this.camY + 12, 6);
    this.light.target.position.set(0, this.camY - 3, 0);
  }
}

// =====================================================================
// 4. Domino Run: a long, curvy chain of dominoes toppling on a wooden table
// =====================================================================
class Domino3D extends Scene3D {
  build() {
    const r = this.rand;
    this.scene.background = gradientTexture("#1b1426", "#4a3a5c");
    this.scene.fog = new THREE.Fog(0x2a2036, 14, 40);
    this.scene.add(new THREE.HemisphereLight(0xfff1e0, 0x2a1a10, 0.9));
    this.light = this.sunLight(0xfff0dd, 2.4, 12);
    // Wooden planks: 4 boards per tile, each with its own tone, grain lines, and dark seams
    const wood = pixelTexture((g, s) => {
      const plank = s / 4;
      for (let p = 0; p < 4; p++) {
        const k = 0.85 + r() * 0.18;
        const tone = rgb("#9a6438").map(v => v * k);
        const phase = r() * 10;
        for (let y = 0; y < s; y++) for (let x = p * plank; x < (p + 1) * plank; x++) {
          const grain = Math.sin((x - p * plank) * 0.9 + Math.sin(y * 0.05 + phase) * 2.5) * 0.08 + (r() - 0.5) * 0.05;
          g.fillStyle = css(tone, 1 + grain); g.fillRect(x, y, 1, 1);
        }
        g.fillStyle = "rgba(40,20,8,0.7)"; g.fillRect(p * plank, 0, 1, s);
        g.fillRect(p * plank, Math.floor(r() * s), plank, 1);  // board end
      }
    }, 128);
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(40, 40);
    wood.magFilter = THREE.LinearFilter; wood.minFilter = THREE.LinearMipmapLinearFilter;
    wood.anisotropy = 8;
    const table = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.7 }));
    table.rotation.x = -Math.PI / 2; table.receiveShadow = true;
    this.scene.add(table);
    this.geo = new THREE.BoxGeometry(0.42, 0.85, 0.11);
    this.camPos = new THREE.Vector3(0, 5, 6); this.camLook = new THREE.Vector3();
    this.newChain();
  }
  newChain() {
    for (const d of this.dominoes || []) this.scene.remove(d.pivot);
    const r = this.rand;
    this.dominoes = [];
    const hue0 = r();
    let x = 0, z = 0, ang = 0, turn = 0;
    for (let i = 0; i < 260; i++) {
      if (i % 25 === 0) turn = (r() - 0.5) * 0.12;
      ang += turn;
      x += Math.sin(ang) * 0.32; z -= Math.cos(ang) * 0.32;
      const pivot = new THREE.Group();
      pivot.position.set(x, 0, z); pivot.rotation.y = -ang;
      const m = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((hue0 + i / 140) % 1, 0.75, 0.55), roughness: 0.35 }));
      m.position.set(0, 0.425, -0.055);  // hinge on the front-bottom edge, so it tips forward
      m.castShadow = m.receiveShadow = true;
      pivot.add(m);
      this.scene.add(pivot);
      this.dominoes.push({ pivot, a: 0, v: 0 });
    }
    this.dominoes[0].v = 0.02;
    this.front = 0;
  }
  update(dt) {
    const ds = this.dominoes;
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i];
      if (d.v === 0) continue;
      if (d.a < 1.25) { d.v += 0.006 * dt; d.a = Math.min(1.25, d.a + d.v * dt); d.pivot.rotation.x = -d.a; }
      if (d.a > 0.32 && ds[i + 1] && ds[i + 1].v === 0) { ds[i + 1].v = 0.02; this.front = i + 1; }
    }
    if (ds.at(-1).a >= 1.25) { this.wait = (this.wait || 0) + dt; if (this.wait > 90) { this.wait = 0; this.newChain(); } }
    const f = ds[this.front].pivot.position;
    this.camLook.lerp(f, Math.min(1, 0.06 * dt));
    this.camPos.lerp(new THREE.Vector3(f.x + 1.6, 1.9, f.z + 2.6), Math.min(1, 0.04 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.light.position.set(f.x + 4, 10, f.z + 3);
    this.light.target.position.copy(f);
  }
}

// Register: 3D games are the stars of the feed. (game3d_more.js adds more and signals "ready".)
SCENES.push(
  { cls: Parkour3D, weight: 2 },
  { cls: NeonRun3D, weight: 1.5 },
  { cls: Stack3D, weight: 1 },
  { cls: Domino3D, weight: 1 },
);

export { THREE, Scene3D, pixelTexture, gradientTexture, noisy, rgb, css };
