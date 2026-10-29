// FlypBook 3D gameplay backgrounds, built with three.js (free, open-source 3D engine).
// Original scenes in the style of story-video gameplay footage: real lighting, shadows, fog,
// and pixel-art textures generated in code. Endless, nothing to download besides the engine.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Sky } from "three/addons/objects/Sky.js";

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

/** The finishing touch every 3D scene gets: a soft vignette, a little contrast, fine film grain, and a
 *  slightly darker level (white captions sit on top), so it reads like captured footage. Runs after tone mapping. */
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, grain: { value: 0.035 }, level: { value: 0.86 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, grain, level; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.13) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.18);           // gentle S-curve contrast
      c.rgb = c.rgb * level / (1.0 + 0.35 * max(c.rgb - 0.7, 0.0));            // a step darker, and bright areas
                                                                                 // (snow, sky) roll off instead of glaring
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - vignette * dot(d, d) * 2.2;            // darker corners
      c.rgb += (hash(vUv * 731.0) - 0.5) * grain;                                // film grain
      gl_FragColor = c;
    }`,
};

/** Base for all 3D scenes: owns the WebGL renderer, camera, post-processing, and cleanup.
 *  A scene can set `static bloom = { strength, threshold, radius }` (glow on bright things). */
class Scene3D {
  static webgl = true;
  static bloom = { strength: 0.28, threshold: 0.86, radius: 0.45 };
  constructor(rand) { this.rand = rand; this.t = 0; }
  mount(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.environment = studioReflections(this.renderer);
    this.scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(70, 9 / 16, 0.05, 250);
    this.scene.add(this.camera);
    this.build();
    if (this.sunDir) this.tameOutdoorLight();
    this.setupPost();
  }
  /** Outdoor scenes were first tuned for flat gradient skies. Under the real sky (which already lights
   *  everything) their extra fill light and pale fog washed the picture out, so tone both down. */
  tameOutdoorLight() {
    this.scene.traverse(o => { if (o.isHemisphereLight || o.isAmbientLight) o.intensity *= 0.6; });
    if (this.scene.fog) this.scene.fog.color.lerp(new THREE.Color(0x7f9fc4), 0.35).multiplyScalar(0.85);
  }
  setupPost() {
    const b = this.bloom || this.constructor.bloom;  // a scene can pick its glow in build() (e.g. night worlds)
    // Render into a multisampled HDR target so edges stay smooth and bright things can glow.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (b && b.strength > 0) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold);
      this.composer.addPass(this.bloomPass);
    }
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }
  resize(w, h) {
    this.viewSize = [w, h];
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloomPass?.setSize(w / 2, h / 2);  // glow at half resolution: looks the same, costs a quarter
  }
  draw(dt) {
    this.t += dt / 60;
    this.update(dt);
    if (this.skyMesh) this.skyMesh.position.copy(this.camera.position);
    if (this.sunDir && this.sun) {  // keep shadows lined up with the sun in the sky
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 40);
    }
    this.adaptQuality(dt);
    this.finish.uniforms.time.value = this.t;
    if (this.quality > 1) this.renderer.render(this.scene, this.camera);  // slowest phones: no effects
    else this.composer.render();
  }
  /** Slower phones step down until the game runs smoothly: first the glow, then the effects, then resolution.
   *  dt is in 60fps frames, so an average above ~1.7 means under ~35 frames a second. */
  adaptQuality(dt) {
    this.quality ??= 0;
    if (dt > 2.5 || this.quality > 2) return;  // ignore hiccups (tab switches) and stop once at the lowest step
    this.avgDt = this.avgDt ? this.avgDt * 0.97 + dt * 0.03 : 1;
    this.frames = (this.frames || 0) + 1;
    if (this.frames < 90 || this.avgDt < 1.7) return;
    this.quality++;
    this.frames = 0; this.avgDt = 1;
    if (this.quality === 1 && this.bloomPass) this.bloomPass.enabled = false;
    if (this.quality === 3 && this.viewSize) { this.renderer.setPixelRatio(0.75); this.renderer.setSize(...this.viewSize, false); }
  }
  /** A physically based sky (real atmosphere scattering, sun disc, glowing horizon) that also lights
   *  the scene: reflections and ambient light come from the same sky. Returns the sun direction. */
  sky({ elevation = 22, azimuth = 200, turbidity = 3, rayleigh = 2.2, mie = 0.004, mieG = 0.82 } = {}) {
    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));
    const make = () => {
      const s = new Sky();
      const u = s.material.uniforms;
      u.turbidity.value = turbidity; u.rayleigh.value = rayleigh;
      u.mieCoefficient.value = mie; u.mieDirectionalG.value = mieG;
      u.sunPosition.value.copy(dir);
      return s;
    };
    this.skyMesh = make();
    this.skyMesh.scale.setScalar(200);  // inside the camera's far plane; follows the camera every frame
    this.scene.add(this.skyMesh);
    this.scene.background = null;
    const env = new THREE.Scene(), envSky = make();
    envSky.scale.setScalar(100);
    env.add(envSky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment?.dispose();
    this.scene.environment = pmrem.fromScene(env).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();
    envSky.geometry.dispose(); envSky.material.dispose();
    // The physical sky is very bright (real-world units): expose for it, and only let truly bright
    // things (the sun, sparkles on water) glow.
    this.renderer.toneMappingExposure = 0.42;
    this.bloom ||= { strength: 0.22, threshold: 2.2, radius: 0.4 };
    this.sunDir = dir;
    return dir;
  }
  dispose() {
    this.scene.traverse(o => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.emissiveMap?.dispose(); m.normalMap?.dispose(); m.dispose(); }
    });
    this.scene.background?.dispose?.();
    this.scene.environment?.dispose();
    this.composer?.dispose();
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
// Day worlds get a real sky (sun height picks the time of day) and an ocean far below.
// Night worlds glow: a lava sea, or a neon void.
const BLOCK_WORLDS = [
  { name: "meadow", top: "#5dbb4a", dirt: "#8b5a2b", stone: "#8d8f94", leaf: "#3f9a36", sea: "ocean" },
  { name: "snow", top: "#f3f7ff", dirt: "#7d8590", stone: "#9aa3ad", leaf: "#2f6b4a", sea: "ocean", cold: true },
  { name: "desert", top: "#e9c77b", dirt: "#c99a55", stone: "#c2a074", leaf: "#6f9a3a", sea: "ocean", warm: true },
  { name: "cherry", top: "#69c25a", dirt: "#7f5233", stone: "#95919a", leaf: "#f2a6c8", sea: "ocean" },
  { name: "volcano", top: "#3b3333", dirt: "#2a2020", stone: "#2f2b2b", leaf: "#5a2a18", sea: "lava", glow: "#ff7a1a",
    sky: ["#120404", "#5a1a0e"], fog: "#3a0f08" },
  { name: "neon", top: "#1d1238", dirt: "#120a26", stone: "#1a1430", leaf: "#3df2ff", sea: "none", glow: "#3df2ff",
    sky: ["#05020f", "#2a0b52"], fog: "#1a0838" },
];

/** A tileable "water ripple" normal map painted in code (sum of soft waves), for a shimmering sea. */
function rippleNormals(size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d"), img = g.createImageData(size, size);
  const h = (x, y) => {
    let v = 0;
    for (const [fx, fy, a] of [[1, 2, 1], [3, -1, 0.6], [-2, 3, 0.5], [5, 4, 0.25], [-6, 7, 0.18]])
      v += a * Math.sin((fx * x + fy * y) * Math.PI * 2 / size);
    return v;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize(), i = (y * size + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A soft, lumpy cloud painted from overlapping puffs (used as a camera-facing sprite). */
function cloudTexture(rand) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  for (let i = 0; i < 26; i++) {
    const x = 40 + rand() * 176, y = 50 + rand() * 40, rad = 18 + rand() * 34;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.55)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Parkour3D extends Scene3D {
  build() {
    const r = this.rand, W = this.world = BLOCK_WORLDS[Math.floor(r() * BLOCK_WORLDS.length)];
    const night = !!W.glow;
    if (night) {
      this.bloom = { strength: 0.9, threshold: 0.35, radius: 0.6 };
      this.scene.background = gradientTexture(W.sky[0], W.sky[1]);
      this.scene.fog = new THREE.Fog(W.fog, 18, 70);
      this.scene.add(new THREE.HemisphereLight(W.sky[1], W.dirt, 0.7));
      this.sun = this.sunLight(0xffd6b0, 0.9, 16);
    } else {
      // Morning, midday, or golden hour; the sun is always somewhere ahead and to the side.
      const elevation = [9, 24, 48][Math.floor(r() * 3)];
      this.sky({ elevation, azimuth: 150 + r() * 60, turbidity: W.warm ? 7 : 3.5, rayleigh: W.cold ? 1 : 1.6 });
      const golden = elevation < 15;
      this.scene.fog = new THREE.Fog(golden ? 0xf3c9a0 : W.cold ? 0xe8f0fa : 0xc9e2f7, 30, 140);
      this.scene.add(new THREE.HemisphereLight(golden ? 0xffd9b0 : 0xcfe6ff, 0x6b5a45, 0.55));
      this.sun = this.sunLight(golden ? 0xffc890 : 0xfff3e2, golden ? 2.4 : 3.0, 18);
      this.sun.shadow.mapSize.set(2048, 2048);
    }

    // Pixel-art block textures, painted in code
    const px = paint => pixelTexture(paint);
    const grassTop = px((g, s) => {
      noisy(r, W.top, 0.22)(g, s);
      if (W.name === "cherry") { g.fillStyle = "#f7b6d2"; for (let i = 0; i < 6; i++) g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1, 1); }
      if (W.glow) { g.fillStyle = W.glow; for (let i = 0; i < 5; i++) g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 1 + Math.floor(r() * 3), 1); }
    });
    const grassSide = px((g, s) => {
      noisy(r, W.dirt, 0.3)(g, s);
      noisy(r, W.top, 0.22)(g, s, 0, 3);
      for (let x = 0; x < s; x++) if (r() < 0.5) { g.fillStyle = css(rgb(W.top), 0.85); g.fillRect(x, 3, 1, 1 + Math.floor(r() * 2)); }
      if (W.glow) { g.fillStyle = W.glow; for (let i = 0; i < 4; i++) g.fillRect(Math.floor(r() * s), 5 + Math.floor(r() * 10), 1, 2); }
    });
    const dirt = px((g, s) => noisy(r, W.dirt, 0.3)(g, s));
    const stone = px((g, s) => {
      noisy(r, W.stone, 0.18)(g, s);
      g.fillStyle = css(rgb(W.stone), 0.7);
      for (let i = 0; i < 7; i++) { const x = Math.floor(r() * s), y = Math.floor(r() * s); g.fillRect(x, y, 2 + Math.floor(r() * 3), 1); }
    });
    const bricks = px((g, s) => {
      noisy(r, W.stone, 0.12)(g, s);
      g.fillStyle = css(rgb(W.stone), 0.62);
      for (let y = 0; y < s; y += 4) { g.fillRect(0, y, s, 1); for (let x = (y / 4) % 2 ? 0 : 4; x < s; x += 8) g.fillRect(x, y, 1, 4); }
    });
    const planks = px((g, s) => {
      noisy(r, "#a8783f", 0.14)(g, s);
      g.fillStyle = "#6e4a22";
      for (let y = 3; y < s; y += 4) g.fillRect(0, y, s, 1);
      for (let y = 0; y < s; y += 4) g.fillRect(((y * 7) % 13) + 1, y, 1, 3);
    });
    const gold = px((g, s) => {
      noisy(r, "#f4c84a", 0.16)(g, s);
      g.fillStyle = "#fff3a8"; for (let i = 0; i < 6; i++) g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 2, 1);
      g.fillStyle = "#b8862a"; g.fillRect(0, s - 1, s, 1); g.fillRect(s - 1, 0, 1, s);
    });
    const ice = px((g, s) => {
      noisy(r, "#9fd3ff", 0.1)(g, s);
      g.fillStyle = "#e6f6ff"; for (let i = 0; i < 4; i++) g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 3, 1);
    });
    const logSide = px((g, s) => {
      noisy(r, "#6b4a2b", 0.2)(g, s);
      g.fillStyle = "#4c3219"; for (let x = 1; x < s; x += 3) g.fillRect(x, 0, 1, s);
    });
    const logTop = px((g, s) => {
      noisy(r, "#b98b52", 0.12)(g, s);
      g.strokeStyle = "#7d5a32"; for (let k = 2; k < 8; k += 2) g.strokeRect(8 - k, 8 - k, k * 2, k * 2);
    });
    const leaves = px((g, s) => {
      noisy(r, W.leaf, 0.35)(g, s);
      for (let i = 0; i < 26; i++) g.clearRect(Math.floor(r() * s), Math.floor(r() * s), 1, 1);  // see-through gaps
    });

    const mat = (map, extra = {}) => new THREE.MeshStandardMaterial({
      map, roughness: 0.92,
      ...(W.glow ? { emissive: new THREE.Color(W.glow), emissiveMap: map, emissiveIntensity: 0.35 } : {}),
      ...extra,
    });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const sideM = mat(grassSide), topM = mat(grassTop), dirtM = mat(dirt), logM = mat(logSide), logTopM = mat(logTop);
    // One instanced mesh per block type keeps hundreds of blocks to a handful of draw calls.
    const kinds = {
      grass: [sideM, sideM, topM, dirtM, sideM, sideM],
      dirt: dirtM,
      stone: mat(stone), bricks: mat(bricks), planks: mat(planks),
      gold: mat(gold, { metalness: 0.75, roughness: 0.32 }),
      ice: mat(ice, { roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.88 }),
      log: [logM, logM, logTopM, logTopM, logM, logM],
      leaves: mat(leaves, { alphaTest: 0.5, side: THREE.DoubleSide }),
    };
    this.meshes = {};
    for (const [k, m] of Object.entries(kinds)) {
      const inst = new THREE.InstancedMesh(box, m, k === "dirt" ? 1800 : 600);
      inst.castShadow = inst.receiveShadow = true;
      inst.frustumCulled = false;
      inst.count = 0;
      this.scene.add(inst);
      this.meshes[k] = inst;
    }
    this.surfaces = W.glow ? ["grass", "stone", "bricks"] : ["grass", "grass", "stone", "bricks", "planks", W.cold ? "ice" : "gold"];

    // The sea far below: shimmering water on day worlds, glowing lava in the volcano world.
    if (W.sea !== "none") {
      const normals = rippleNormals();
      normals.repeat.set(40, 40);
      this.seaNormals = normals;
      const seaMat = W.sea === "lava"
        ? new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.6, normalMap: normals })
        : new THREE.MeshStandardMaterial({ color: W.cold ? 0x2d5f86 : 0x1f6fa8, roughness: 0.06, metalness: 0.1, normalMap: normals, normalScale: new THREE.Vector2(0.35, 0.35) });
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), seaMat);
      this.sea.rotation.x = -Math.PI / 2;
      this.sea.position.y = -14;
      this.sea.receiveShadow = true;
      this.scene.add(this.sea);
    }

    // Soft clouds drifting at different heights and distances
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(r), transparent: true, depthWrite: false,
      color: night ? 0x6a4a7a : 0xffffff, opacity: night ? 0.35 : 0.9 });
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Sprite(cloudMat);
      const s = 26 + r() * 40;
      c.scale.set(s, s / 2, 1);
      c.position.set((r() - 0.5) * 160, 18 + r() * 26, -r() * 170);
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);

    // First-person arm (a sleeve and a hand), swinging while running
    this.arm = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.42),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(r(), 0.55, 0.45), roughness: 0.85 }));
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.2), new THREE.MeshStandardMaterial({ color: 0xd9a27a, roughness: 0.75 }));
    sleeve.position.z = 0.1; hand.position.z = -0.21;
    this.arm.add(sleeve, hand);
    this.arm.position.set(0.3, -0.3, -0.5);
    this.arm.rotation.set(-0.25, -0.18, 0.12);
    this.camera.add(this.arm);
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();

    this.platforms = [{ x: 0, z: 2, len: 5, top: 1, wide: 1, depth: 3, kind: "grass" }];
    this.islands = [];
    this.pos = new THREE.Vector3(0.5, 2.6, 0);
    this.look = new THREE.Vector3(0.5, 2.4, -11);
    this.camX = 0.5; this.camY = 2.62;
    this.camera.fov = 68;
    this.dist = 0;
    this.extend(true);
  }
  // The run goes toward -z. Each platform covers z in [z - len, z].
  extend(force) {
    const r = this.rand;
    let last = this.platforms[this.platforms.length - 1], added = force;
    while (last.z - last.len > -this.dist - 60) {
      const gap = 1 + Math.floor(r() * 2);
      last = {
        x: Math.max(-2, Math.min(2, last.x + (r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0))),
        z: last.z - last.len - gap,
        len: 2 + Math.floor(r() * 3),
        top: Math.max(0, Math.min(5, last.top + (r() < 0.35 ? (gap >= 3 ? -1 : r() < 0.5 ? -1 : 1) : 0))),
        wide: r() < 0.3 ? 2 : 1,
        depth: 2 + Math.floor(r() * 3),
        kind: this.surfaces[Math.floor(r() * this.surfaces.length)],
      };
      this.platforms.push(last);
      if (r() < 0.6) {
        const side = r() < 0.5 ? -1 : 1;
        this.islands.push({ x: side * (6 + Math.floor(r() * 10)), z: last.z - Math.floor(r() * 4), top: Math.floor(r() * 9) - 3,
          size: 2 + Math.floor(r() * 3), depth: 3 + Math.floor(r() * 4), tree: r() < 0.55 });
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
    const m = new THREE.Matrix4(), n = {};
    for (const k in this.meshes) n[k] = 0;
    const put = (kind, x, y, z) => {
      const mesh = this.meshes[kind];
      if (n[kind] < mesh.instanceMatrix.count) mesh.setMatrixAt(n[kind]++, m.makeTranslation(x + 0.5, y - 0.5, z - 0.5));
    };
    const column = (kind, x, z, top, depth) => {
      put(kind, x, top, z);
      for (let d = 1; d < depth; d++) put(kind === "grass" ? "dirt" : kind === "gold" || kind === "ice" ? "stone" : kind, x, top - d, z);
    };
    for (const p of this.platforms) for (let k = 0; k < p.len; k++) for (let wx = 0; wx < p.wide; wx++)
      column(p.kind, p.x + wx, p.z - k, p.top, p.depth - (k % 2));
    for (const is of this.islands) {
      for (let a = 0; a < is.size; a++) for (let b = 0; b < is.size; b++)
        column("grass", is.x + a, is.z - b, is.top, is.depth - Math.abs(a - is.size / 2) - Math.abs(b - is.size / 2) + 1);
      if (is.tree) {  // a little tree: a log trunk with a blob of leaves
        const tx = is.x + Math.floor(is.size / 2), tz = is.z - Math.floor(is.size / 2), h = 3 + (is.size % 2);
        for (let y = 1; y <= h; y++) put("log", tx, is.top + y, tz);
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = 0; c < 3; c++)
          if (Math.abs(a) + Math.abs(b) + c < 4 && !(a === 0 && b === 0 && c === 0)) put("leaves", tx + a, is.top + h + c, tz + b);
      }
    }
    for (const k in this.meshes) { this.meshes[k].count = n[k]; this.meshes[k].instanceMatrix.needsUpdate = true; }
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
    this.dist += 0.08 * dt;  // run speed in blocks per frame
    this.extend(false);
    const p = this.path(this.dist);
    // A calm camera (it sits behind story text): it eases into jumps and turns, looks far ahead at the
    // average height of the next few blocks, and barely bobs.
    let ax = 0, ay = 0;
    for (const k of [5, 8, 11]) { const q = this.path(this.dist + k); ax += q.x / 3; ay += q.y / 3; }
    this.camX += (p.x - this.camX) * Math.min(1, 0.05 * dt);
    this.camY += (p.y + 1.62 - this.camY) * Math.min(1, 0.1 * dt);
    const bob = p.ground ? Math.sin(this.t * 10) * 0.012 : 0;
    this.pos.set(this.camX, this.camY + bob, -this.dist);
    this.camera.position.copy(this.pos);
    this.look.lerp(new THREE.Vector3(this.camX * 0.5 + ax * 0.5, ay + 1.35, -this.dist - 11), Math.min(1, 0.025 * dt));
    this.camera.lookAt(this.look);
    this.arm.rotation.x = -0.25 + Math.sin(this.t * 10) * (p.ground ? 0.07 : 0.02);
    this.arm.position.y = -0.3 + (p.ground ? Math.abs(Math.sin(this.t * 10)) * 0.01 : 0.015);
    this.sun.target.position.set(this.pos.x, this.pos.y - 2, this.pos.z - 8);
    if (!this.sunDir) this.sun.position.set(this.pos.x + 8, this.pos.y + 18, this.pos.z + 6);
    if (this.sea) {
      this.sea.position.x = this.pos.x; this.sea.position.z = this.pos.z - 120;
      this.seaNormals.offset.set(this.pos.x / 12.5 + this.t * 0.01, -this.pos.z / 12.5 + this.t * 0.02);
    }
    this.clouds.children.forEach(c => { c.position.x += 0.012 * dt; if (c.position.z > this.pos.z + 30) c.position.z -= 200; });
  }
}

// =====================================================================
// 2. Neon Run 3D: a runner on a glowing 3-lane highway dodging and grabbing coins
// =====================================================================
class NeonRun3D extends Scene3D {
  static bloom = { strength: 0.85, threshold: 0.3, radius: 0.55 };
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
