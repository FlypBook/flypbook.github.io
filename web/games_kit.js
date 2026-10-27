// Shared building blocks for FlypBook's 3D gameplay scenes.
import { THREE, pixelTexture, noisy, rgb, css } from "./game3d.js";

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

/** A mesh that casts and receives shadows. */
export function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent?.add(m);
  return m;
}

/** A repeating ground texture (noise in a base color, optional painter for details). */
export function groundTexture(rand, hex, vary = 0.2, repeat = 20, paint, size = 32) {
  const t = pixelTexture((g, s) => { noisy(rand, hex, vary)(g, s); paint?.(g, s); }, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

/** Low-poly person with swinging limbs (pivots at shoulders and hips). Faces -z. */
export function makeCharacter(rand, { top, bottom = 0x23233a, skin = 0xc98a5e, shoe = 0xffffff } = {}) {
  const group = new THREE.Group();
  const shirt = std(top ?? new THREE.Color().setHSL(rand(), 0.75, 0.55));
  const pants = std(bottom), skinM = std(skin, { roughness: 0.7 }), shoeM = std(shoe, { roughness: 0.4 });
  mesh(new THREE.CapsuleGeometry(0.24, 0.45, 4, 10), shirt, 0, 1.15, 0, group);
  mesh(new THREE.SphereGeometry(0.2, 16, 12), skinM, 0, 1.68, 0, group);
  mesh(new THREE.SphereGeometry(0.205, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), std(0x2b1d14), 0, 1.72, 0.01, group);  // hair
  const limb = (x, y, len, m, foot) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); group.add(pivot);
    mesh(new THREE.CapsuleGeometry(0.09, len, 4, 8), m, 0, -len / 2 - 0.05, 0, pivot);
    if (foot) mesh(new THREE.BoxGeometry(0.16, 0.1, 0.28), shoeM, 0, -len - 0.14, -0.06, pivot);
    return pivot;
  };
  const legs = [limb(-0.13, 0.85, 0.62, pants, true), limb(0.13, 0.85, 0.62, pants, true)];
  const arms = [limb(-0.33, 1.42, 0.46, shirt), limb(0.33, 1.42, 0.46, shirt)];
  return { group, legs, arms };
}
export function runCycle(ch, phase, amp = 0.9) {
  const s = Math.sin(phase) * amp;
  ch.legs[0].rotation.x = s; ch.legs[1].rotation.x = -s;
  ch.arms[0].rotation.x = -s * 0.8; ch.arms[1].rotation.x = s * 0.8;
}

/** Simple car: body, glass cabin, spinning wheels, lights. Faces -z. */
export function makeCar(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
  mesh(new THREE.BoxGeometry(1.8, 0.5, 4), paint, 0, 0.62, 0, group);
  mesh(new THREE.BoxGeometry(1.5, 0.48, 2), new THREE.MeshPhysicalMaterial({ color: 0x15202b, metalness: 0.6, roughness: 0.1 }), 0, 1.1, 0.25, group);
  const wheels = [];
  const wGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 18), wMat = std(0x111111, { roughness: 0.9 });
  for (const [x, z] of [[-0.95, -1.3], [0.95, -1.3], [-0.95, 1.3], [0.95, 1.3]]) {
    const w = mesh(wGeo, wMat, x, 0.38, z, group); w.rotation.z = Math.PI / 2; wheels.push(w);
  }
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff6d0, emissiveIntensity: 2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 2 });
  for (const x of [-0.6, 0.6]) { mesh(new THREE.BoxGeometry(0.35, 0.14, 0.05), lamp, x, 0.7, -2.01, group); mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), tail, x, 0.72, 2.01, group); }
  return { group, wheels };
}

/** A soft round dot, so particles look like droplets/sparks instead of squares. */
let dotTexture;
function softDot() {
  if (dotTexture) return dotTexture;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.45, "rgba(255,255,255,0.85)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return (dotTexture = new THREE.CanvasTexture(c));
}

/** Pooled particles (spray, sparks, dust). Call emit() and update(dt). */
export class Particles {
  constructor(scene, count, color, size, opacity = 0.9) {
    this.count = count; this.i = 0;
    this.pos = new Float32Array(count * 3).fill(-9999);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, map: softDot() }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life = 1) {
    const k = this.i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.life[this.i] = life;
    this.i = (this.i + 1) % this.count;
  }
  update(dt, gravity = 0.01, drag = 0.98, shiftZ = 0) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.vel[k + 1] -= gravity * dt;
      for (let a = 0; a < 3; a++) { this.vel[k + a] *= drag; this.pos[k + a] += this.vel[k + a] * dt; }
      this.pos[k + 2] += shiftZ;
      this.life[i] -= 0.02 * dt;
      if (this.life[i] <= 0) this.pos[k + 1] = -9999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Pine tree (trunk + stacked cones). */
export function makePine(scale = 1, color = 0x2f6b3a) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), std(0x5a3b24), 0, 0.5, 0, g);
  for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(1.1 - i * 0.28, 1.4, 8), std(color, { flatShading: true }), 0, 1.3 + i * 0.75, 0, g);
  g.scale.setScalar(scale);
  return g;
}

/** Brick/window texture for buildings. */
export function windowTexture(rand, wall = "#d8c3a5", glass = "#3d5a80", lit = 0) {
  const t = pixelTexture((g, s) => {
    noisy(rand, wall, 0.08)(g, s);
    for (let y = 2; y < s - 2; y += 6) for (let x = 2; x < s - 2; x += 5) {
      g.fillStyle = rand() < lit ? "#ffd27a" : glass; g.fillRect(x, y, 3, 4);
    }
  }, 32);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export { THREE, pixelTexture, noisy, rgb, css };
