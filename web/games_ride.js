// FlypBook 3D scenes: driving & riding (third-person chase cams). Original designs.
import { Scene3D, gradientTexture } from "./game3d.js";
import { THREE, V, lerp, clamp, std, mesh, groundTexture, makeCharacter, runCycle, makeCar, Particles, makePine, windowTexture, pixelTexture, noisy } from "./games_kit.js";

// The player stays near z = 0 facing -z; the world streams toward +z. Recycle things that pass the camera.
const recycle = (obj, span, limit = 12) => { if (obj.position.z > limit) obj.position.z -= span; };

// ---------- Desert Highway: weaving through traffic at sunset ----------
class DesertDrive extends Scene3D {
  build() {
    const r = this.rand;
    this.scene.background = gradientTexture("#2b2a6b", "#ff9a5a");
    this.scene.fog = new THREE.Fog(0xf7a46b, 30, 140);
    this.scene.add(new THREE.HemisphereLight(0xffd2a8, 0x6b4a2a, 1.1));
    this.sun = this.sunLight(0xffc48a, 2.4, 12);
    this.road = groundTexture(r, "#3a3a40", 0.12, 1, (g, s) => {
      g.fillStyle = "#f2c94c"; for (let y = 0; y < s; y += 8) g.fillRect(s / 2 - 1, y, 2, 4);
      g.fillStyle = "#e8e8e8"; g.fillRect(1, 0, 1, s); g.fillRect(s - 2, 0, 1, s);
    });
    this.road.repeat.set(1, 40);
    this.sand = groundTexture(r, "#d9a35f", 0.25, 60);
    const roadM = mesh(new THREE.PlaneGeometry(9, 300), std(0xffffff, { map: this.road, roughness: 0.9 }), 0, 0.01, -140, this.scene);
    roadM.rotation.x = -Math.PI / 2;
    const sandM = mesh(new THREE.PlaneGeometry(400, 400), std(0xffffff, { map: this.sand, roughness: 1 }), 0, 0, -150, this.scene);
    sandM.rotation.x = -Math.PI / 2;
    // cacti and mesas
    this.props = [];
    const cactusM = std(0x3f8f4a, { flatShading: true });
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      mesh(new THREE.CapsuleGeometry(0.3, 2.2, 4, 8), cactusM, 0, 1.4, 0, g);
      for (const s of [-1, 1]) if (r() < 0.8) {
        const arm = mesh(new THREE.CapsuleGeometry(0.2, 0.8, 4, 8), cactusM, s * 0.55, 1.6 + r() * 0.6, 0, g);
        arm.rotation.z = s * 0.2;
      }
      g.position.set((r() < 0.5 ? -1 : 1) * (7 + r() * 25), 0, -r() * 220);
      this.scene.add(g); this.props.push(g);
    }
    const mesaColors = [0xb5532c, 0xc8693a, 0x9c4426];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group(), w = 12 + r() * 20, h = 8 + r() * 14;
      for (let k = 0; k < 3; k++) mesh(new THREE.BoxGeometry(w - k * 2, h / 3, w * 0.6 - k), std(mesaColors[k], { flatShading: true }), 0, h / 6 + (k * h) / 3, 0, g);
      g.position.set((r() < 0.5 ? -1 : 1) * (45 + r() * 40), 0, -r() * 220);
      this.scene.add(g); this.props.push(g);
    }
    // player + traffic
    this.car = makeCar(new THREE.Color().setHSL(r(), 0.8, 0.5));
    this.scene.add(this.car.group);
    this.traffic = [];
    for (let i = 0; i < 5; i++) {
      const c = makeCar(new THREE.Color().setHSL(r(), 0.6, 0.45));
      c.lane = r() < 0.5 ? -1 : 1;
      c.group.position.set(c.lane * 2.2, 0, -25 - i * 35);
      this.scene.add(c.group); this.traffic.push(c);
    }
    this.lane = 1; this.x = 2.2; this.speed = 0.75;
    this.dust = new Particles(this.scene, 300, 0xe0b080, 0.18, 0.35);
  }
  update(dt) {
    const move = this.speed * dt;
    this.road.offset.y += move / 7.5; this.sand.offset.y += move / 6.6;
    for (const p of this.props) { p.position.z += move; recycle(p, 240, 20); }
    for (const c of this.traffic) {
      c.group.position.z += move * 0.45;
      c.wheels.forEach(w => (w.rotation.x -= 0.3 * dt));
      if (c.group.position.z > 15) { c.group.position.z -= 175; c.lane = this.rand() < 0.5 ? -1 : 1; c.group.position.x = c.lane * 2.2; }
    }
    // overtake: switch lanes when a car ahead is close
    const ahead = this.traffic.find(c => c.lane === this.lane && c.group.position.z < 0 && c.group.position.z > -18);
    if (ahead) this.lane = -this.lane;
    const prev = this.x;
    this.x = lerp(this.x, this.lane * 2.2, Math.min(1, 0.06 * dt));
    this.car.group.position.set(this.x, Math.sin(this.t * 30) * 0.01, 0);
    this.car.group.rotation.y = (prev - this.x) * 1.5;
    this.car.wheels.forEach(w => (w.rotation.x -= 0.6 * dt));
    for (const s of [-0.8, 0.8]) this.dust.emit(this.x + s, 0.2, 2.1, (this.rand() - 0.5) * 0.05, 0.03, 0.15);
    this.dust.update(dt, 0.001);
    this.camera.position.set(this.x * 0.7, 2.5, 7.2);
    this.camera.lookAt(this.x * 0.9, 0.9, -8);
    this.sun.position.set(-10, 14, -20); this.sun.target.position.set(this.x, 0, -2);
  }
}

// ---------- Snowboard Carve: shredding down between pines ----------
class Snowboard extends Scene3D {
  build() {
    const r = this.rand;
    this.scene.background = gradientTexture("#4f86d6", "#dfeeff");
    this.scene.fog = new THREE.Fog(0xe8f2ff, 20, 90);
    this.scene.add(new THREE.HemisphereLight(0xdfeeff, 0x8aa0c0, 1.3));
    this.sun = this.sunLight(0xffffff, 2.2, 10);
    this.snow = groundTexture(r, "#f2f6ff", 0.06, 40);
    const ground = mesh(new THREE.PlaneGeometry(200, 300), std(0xffffff, { map: this.snow, roughness: 0.95 }), 0, 0, -130, this.scene);
    ground.rotation.x = -Math.PI / 2;
    this.trees = [];
    for (let i = 0; i < 60; i++) {
      const t = makePine(0.9 + r() * 1.2, r() < 0.3 ? 0x24563a : 0x2f6b3a);
      const side = r() < 0.5 ? -1 : 1;
      t.position.set(side * (4 + r() * 30), 0, -r() * 200);
      this.scene.add(t); this.trees.push(t);
    }
    this.rider = makeCharacter(r, { top: new THREE.Color().setHSL(r(), 0.9, 0.5) });
    const board = mesh(new THREE.BoxGeometry(0.4, 0.06, 1.7), std(new THREE.Color().setHSL(r(), 0.8, 0.5), { roughness: 0.3 }), 0, 0.05, 0);
    this.holder = new THREE.Group();
    this.holder.add(this.rider.group, board);
    this.rider.group.rotation.y = Math.PI / 2;          // sideways stance
    this.rider.legs[0].rotation.x = 0.35; this.rider.legs[1].rotation.x = -0.35;
    this.rider.arms[0].rotation.z = 0.9; this.rider.arms[1].rotation.z = -0.9;
    this.rider.group.position.y = 0.12;
    this.scene.add(this.holder);
    this.spray = new Particles(this.scene, 400, 0xffffff, 0.22);
  }
  update(dt) {
    const move = 0.55 * dt;
    this.snow.offset.y += move / 7.5;
    for (const t of this.trees) { t.position.z += move; recycle(t, 210, 15); }
    const x = Math.sin(this.t * 1.4) * 2.6, vx = Math.cos(this.t * 1.4);
    this.holder.position.set(x, 0, 0);
    this.holder.rotation.y = -vx * 0.45;
    this.holder.rotation.z = vx * 0.35;           // lean into the carve
    for (let i = 0; i < 3; i++) this.spray.emit(x - vx * 0.4, 0.15, 0.5, -vx * 0.08 + (this.rand() - 0.5) * 0.05, 0.06 + this.rand() * 0.05, 0.12);
    this.spray.update(dt, 0.004);
    this.camera.position.set(x * 0.6, 3, 6.5);
    this.camera.lookAt(x * 0.8, 0.8, -6);
    this.sun.position.set(x + 6, 14, 8); this.sun.target.position.set(x, 0, 0);
  }
}

// ---------- Hyper Tunnel: a ship racing through neon rings in space ----------
class SpaceTunnel extends Scene3D {
  build() {
    const r = this.rand;
    this.scene.background = gradientTexture("#020010", "#16052e");
    this.scene.fog = new THREE.Fog(0x0a0320, 30, 110);
    this.scene.add(new THREE.HemisphereLight(0x8899ff, 0x220033, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(3, 5, 4); this.scene.add(key);
    const starPos = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) { starPos[i * 3] = (r() - 0.5) * 120; starPos[i * 3 + 1] = (r() - 0.5) * 120; starPos[i * 3 + 2] = -r() * 160; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 }));
    this.scene.add(this.stars);
    this.rings = [];
    this.hue = r();
    for (let i = 0; i < 22; i++) {
      const c = new THREE.Color().setHSL((this.hue + i * 0.04) % 1, 1, 0.55);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.18, 8, 48), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2 }));
      ring.position.z = -i * 7;
      this.scene.add(ring); this.rings.push(ring);
    }
    this.rocks = [];
    for (let i = 0; i < 14; i++) {
      const a = mesh(new THREE.DodecahedronGeometry(0.6 + r() * 1.4, 0), std(0x6b6070, { flatShading: true, roughness: 0.9 }));
      a.position.set((r() - 0.5) * 30, (r() - 0.5) * 24, -r() * 150);
      if (Math.hypot(a.position.x, a.position.y) < 7) a.position.x += 9;
      this.scene.add(a); this.rocks.push(a);
    }
    // ship
    this.ship = new THREE.Group();
    const hull = new THREE.MeshPhysicalMaterial({ color: 0xdfe6f0, metalness: 0.7, roughness: 0.25, clearcoat: 1 });
    const nose = mesh(new THREE.ConeGeometry(0.35, 1.8, 12), hull, 0, 0, -0.6, this.ship); nose.rotation.x = -Math.PI / 2;
    mesh(new THREE.BoxGeometry(2.4, 0.08, 0.7), hull, 0, 0, 0.2, this.ship);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), std(0xff3d8b, { emissive: 0xff3d8b, emissiveIntensity: 1 }), s * 1.2, 0.2, 0.3, this.ship);
    mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0x3df2ff, metalness: 0, roughness: 0, transmission: 0, emissive: 0x135066 }), 0, 0.18, -0.2, this.ship);
    this.flame = mesh(new THREE.ConeGeometry(0.22, 1, 10), new THREE.MeshBasicMaterial({ color: 0x7af7ff }), 0, 0, 0.9, this.ship);
    this.flame.rotation.x = Math.PI / 2;
    this.scene.add(this.ship);
    this.trail = new Particles(this.scene, 300, 0x7af7ff, 0.18);
  }
  update(dt) {
    const move = 0.9 * dt;
    const center = z => V(Math.sin((z - this.t * 60) * 0.02) * 2.5, Math.cos((z - this.t * 60) * 0.017) * 2, z);
    for (const ring of this.rings) {
      ring.position.z += move;
      if (ring.position.z > 8) ring.position.z -= 154;
      const c = center(ring.position.z); ring.position.x = c.x; ring.position.y = c.y;
      ring.rotation.z += 0.01 * dt;
    }
    for (const a of this.rocks) { a.position.z += move * 1.1; a.rotation.x += 0.01 * dt; a.rotation.y += 0.013 * dt; recycle(a, 150, 10); }
    const sp = this.stars.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) { let z = sp.getZ(i) + move * 1.6; if (z > 10) z -= 160; sp.setZ(i, z); }
    sp.needsUpdate = true;
    const target = center(-3), next = center(-10);
    this.ship.position.lerp(V(target.x + Math.sin(this.t * 2.1) * 0.8, target.y + Math.cos(this.t * 1.7) * 0.6, 0), Math.min(1, 0.08 * dt));
    this.ship.rotation.z = (next.x - target.x) * -0.25 + Math.sin(this.t * 2.1) * -0.3;
    this.ship.rotation.x = (next.y - target.y) * 0.1;
    this.flame.scale.y = 0.8 + Math.random() * 0.5;
    this.trail.emit(this.ship.position.x, this.ship.position.y, 1.3, 0, 0, 0.3);
    this.trail.update(dt, 0, 0.99);
    this.camera.position.set(this.ship.position.x * 0.8, this.ship.position.y * 0.8 + 1.1, 5);
    this.camera.lookAt(this.ship.position.x, this.ship.position.y, -6);
    this.camera.rotation.z += this.ship.rotation.z * 0.3;
  }
}

// ---------- Street Skate: pushing, ollies, and kickflips over ramps ----------
function wedge(w, h, d, mat) {
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(d, 0), new THREE.Vector2(d, h)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); geo.translate(-w / 2, 0, d / 2);   // ramp rises toward -z
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
  return m;
}
class StreetSkate extends Scene3D {
  build() {
    const r = this.rand;
    this.scene.background = gradientTexture("#5aa9ff", "#e6f3ff");
    this.scene.fog = new THREE.Fog(0xdcecff, 30, 110);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7a6a5a, 1.2));
    this.sun = this.sunLight(0xfff2dd, 2.5, 10);
    this.asphalt = groundTexture(r, "#4a4d55", 0.15, 1, (g, s) => { g.fillStyle = "#ffffff"; for (let y = 0; y < s; y += 10) g.fillRect(s / 2 - 1, y, 2, 5); });
    this.asphalt.repeat.set(1, 30);
    const road = mesh(new THREE.PlaneGeometry(10, 240), std(0xffffff, { map: this.asphalt, roughness: 0.95 }), 0, 0, -110, this.scene);
    road.rotation.x = -Math.PI / 2;
    this.walk = groundTexture(r, "#c9c3b8", 0.1, 1, (g, s) => { g.fillStyle = "#9e978b"; for (let y = 0; y < s; y += 8) g.fillRect(0, y, s, 1); });
    this.walk.repeat.set(1, 60);
    for (const s of [-1, 1]) { const w = mesh(new THREE.BoxGeometry(4, 0.25, 240), std(0xffffff, { map: this.walk }), s * 7, 0.12, -110, this.scene); this.walkMesh = w; }
    this.buildings = [];
    const palette = ["#e8a87c", "#d8c3a5", "#a8d0db", "#f6d6ad", "#c3b1e1", "#f4a7b9"];
    for (let i = 0; i < 24; i++) {
      const tex = windowTexture(r, palette[Math.floor(r() * palette.length)]);
      const h = 8 + r() * 16, w = 6 + r() * 4;
      tex.repeat.set(w / 6, h / 6);
      const b = mesh(new THREE.BoxGeometry(w, h, 9), std(0xffffff, { map: tex }), (i % 2 ? 1 : -1) * (9 + w / 2), h / 2, -Math.floor(i / 2) * 10);
      this.scene.add(b); this.buildings.push(b);
    }
    this.ramps = [];
    const rampMat = std(0xff6b35, { roughness: 0.5 });
    for (let i = 0; i < 4; i++) { const rp = wedge(2.2, 0.7, 1.8, rampMat); rp.position.set(0, 0, -20 - i * 22); this.scene.add(rp); this.ramps.push(rp); }
    this.sk = makeCharacter(r, { top: 0x2ec4b6 });
    this.board = new THREE.Group();
    mesh(new THREE.BoxGeometry(0.32, 0.05, 1.2), std(0x222222, { roughness: 0.4 }), 0, 0, 0, this.board);
    for (const [x, z] of [[-0.12, -0.38], [0.12, -0.38], [-0.12, 0.38], [0.12, 0.38]]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), std(0xfff3b0), x, -0.07, z, this.board).rotation.z = Math.PI / 2;
    this.skater = new THREE.Group();
    this.skater.add(this.sk.group, this.board);
    this.sk.group.position.y = 0.12; this.board.position.y = 0.12;
    this.sk.group.rotation.y = Math.PI / 2;
    this.scene.add(this.skater);
    this.air = -1;
  }
  update(dt) {
    const move = 0.42 * dt;
    this.asphalt.offset.y += move / 8; this.walk.offset.y += move / 4;
    for (const b of this.buildings) { b.position.z += move; recycle(b, 120, 14); }
    for (const rp of this.ramps) {
      rp.position.z += move;
      if (rp.position.z > 10) rp.position.z -= 88;
      if (this.air < 0 && rp.position.z > -0.2 && rp.position.z < 0.6) this.air = 0;  // hit the ramp: launch
    }
    let y = 0;
    if (this.air >= 0) {
      this.air += 0.022 * dt;
      y = Math.sin(Math.min(this.air, 1) * Math.PI) * 1.8 + 0.7 * (1 - Math.min(this.air * 3, 1));
      this.board.rotation.z = Math.min(this.air * 1.25, 1) * Math.PI * 2;   // kickflip
      this.sk.legs[0].rotation.x = -0.6; this.sk.legs[1].rotation.x = 0.6;
      if (this.air >= 1) { this.air = -1; this.board.rotation.z = 0; }
    } else {
      // push with the back foot every so often
      const push = Math.max(0, Math.sin(this.t * 3)) * 0.8;
      this.sk.legs[1].rotation.x = -push; this.sk.legs[0].rotation.x = 0.1;
      this.sk.arms[0].rotation.z = 0.5; this.sk.arms[1].rotation.z = -0.5;
    }
    this.skater.position.set(Math.sin(this.t * 0.7) * 0.6, y, 0);
    this.camera.position.set(3.2, 2.4 + y * 0.4, 5.5);
    this.camera.lookAt(this.skater.position.x * 0.5, 1 + y * 0.6, -3);
    this.sun.position.set(8, 16, 6); this.sun.target.position.set(0, 0, -2);
  }
}

// ---------- Jet Ski Slalom: carving around buoys over rolling waves ----------
class JetSki extends Scene3D {
  build() {
    const r = this.rand;
    this.scene.background = gradientTexture("#3e8ede", "#bfe3ff");
    this.scene.fog = new THREE.Fog(0xbfe3ff, 30, 110);
    this.scene.add(new THREE.HemisphereLight(0xdff2ff, 0x1f5f8b, 1.2));
    this.sun = this.sunLight(0xfff4d6, 2.6, 10);
    this.waterGeo = new THREE.PlaneGeometry(90, 140, 45, 70);
    this.waterGeo.rotateX(-Math.PI / 2);
    this.waterGeo.translate(0, 0, -55);
    this.water = new THREE.Mesh(this.waterGeo, new THREE.MeshStandardMaterial({ color: 0x1a7fb5, roughness: 0.15, metalness: 0.2, flatShading: true }));
    this.water.receiveShadow = true;
    this.scene.add(this.water);
    this.buoys = [];
    for (let i = 0; i < 8; i++) {
      const b = mesh(new THREE.SphereGeometry(0.45, 16, 12), std(i % 2 ? 0xff4d4d : 0xffd43b, { roughness: 0.35 }));
      b.position.set((i % 2 ? 1 : -1) * 2.2, 0, -12 - i * 9);
      this.scene.add(b); this.buoys.push(b);
    }
    this.ski = new THREE.Group();
    const hullM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setHSL(r(), 0.85, 0.5), clearcoat: 1, roughness: 0.25 });
    mesh(new THREE.BoxGeometry(0.9, 0.35, 2.4), hullM, 0, 0.2, 0, this.ski);
    const bow = mesh(new THREE.ConeGeometry(0.45, 0.8, 4), hullM, 0, 0.2, -1.5, this.ski); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4;
    mesh(new THREE.BoxGeometry(0.5, 0.2, 0.9), std(0x222222), 0, 0.45, 0.3, this.ski);
    const rider = makeCharacter(r, { top: 0xffffff });
    rider.group.scale.setScalar(0.85); rider.group.position.set(0, 0.2, 0.3);
    rider.legs.forEach(l => (l.rotation.x = -1.2)); rider.arms.forEach(a => (a.rotation.x = -1.1));
    this.ski.add(rider.group);
    this.scene.add(this.ski);
    this.spray = new Particles(this.scene, 400, 0xffffff, 0.12, 0.75);
  }
  height(x, z) {
    const t = this.t, zz = z - t * 30;
    return Math.sin(x * 0.25 + t * 1.2) * 0.25 + Math.sin(zz * 0.18) * 0.45 + Math.sin(zz * 0.43 + x * 0.3) * 0.15;
  }
  update(dt) {
    const move = 0.5 * dt;
    const p = this.waterGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.height(p.getX(i), p.getZ(i)));
    p.needsUpdate = true; this.waterGeo.computeVertexNormals();
    for (const b of this.buoys) { b.position.z += move; if (b.position.z > 10) b.position.z -= 72; b.position.y = this.height(b.position.x, b.position.z) + 0.15; }
    // slalom: weave to the opposite side of the next buoy
    const next = this.buoys.filter(b => b.position.z < -1).sort((a, b) => b.position.z - a.position.z)[0];
    const tx = next ? -Math.sign(next.position.x) * 1.4 : 0;
    const prev = this.ski.position.x;
    this.ski.position.x = lerp(prev, tx, Math.min(1, 0.035 * dt));
    const y = this.height(this.ski.position.x, 0);
    this.ski.position.y = y;
    this.ski.rotation.z = (prev - this.ski.position.x) * 3;
    this.ski.rotation.x = (this.height(this.ski.position.x, -1.2) - this.height(this.ski.position.x, 1.2)) * 0.35;
    for (let i = 0; i < 2; i++) this.spray.emit(this.ski.position.x + (this.rand() - 0.5) * 0.8, y + 0.2, 1.4, (this.rand() - 0.5) * 0.12, 0.08 + this.rand() * 0.06, 0.1);
    this.spray.update(dt, 0.006);
    this.camera.position.set(this.ski.position.x * 0.5, 2.6 + y * 0.5, 6.2);
    this.camera.lookAt(this.ski.position.x * 0.7, 0.6, -6);
    this.sun.position.set(6, 15, 8); this.sun.target.position.copy(this.ski.position);
  }
}

// ---------- Paper Plane: gliding over a tropical sea of little islands ----------
class PaperPlane extends Scene3D {
  build() {
    const r = this.rand;
    this.scene.background = gradientTexture("#5bb2ff", "#fff1d6");
    this.scene.fog = new THREE.Fog(0xfff1d6, 40, 160);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a7aa8, 1.3));
    this.sun = this.sunLight(0xfff4e0, 2.2, 18);
    this.sea = groundTexture(r, "#2a9fd0", 0.08, 50, (g, s) => { g.fillStyle = "#7fd3f2"; for (let i = 0; i < 6; i++) g.fillRect(Math.floor(r() * s), Math.floor(r() * s), 3, 1); });
    const sea = mesh(new THREE.PlaneGeometry(400, 400), std(0xffffff, { map: this.sea, roughness: 0.3, metalness: 0.1 }), 0, 0, -150, this.scene);
    sea.rotation.x = -Math.PI / 2;
    this.islands = [];
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group(), s = 2 + r() * 5;
      mesh(new THREE.CylinderGeometry(s * 1.25, s * 1.35, 0.4, 14), std(0xf2d49b, { flatShading: true }), 0, 0.1, 0, g);
      mesh(new THREE.ConeGeometry(s, s * (0.8 + r()), 9), std(0x4caf50, { flatShading: true }), 0, s * 0.45, 0, g);
      for (let k = 0; k < 3; k++) { const palm = makePine(0.35, 0x3c9a4c); palm.position.set((r() - 0.5) * s * 1.6, 0.2, (r() - 0.5) * s * 1.6); g.add(palm); }
      g.position.set((r() - 0.5) * 120, 0, -r() * 260);
      this.scene.add(g); this.islands.push(g);
    }
    this.clouds = [];
    const cloudM = std(0xffffff, { flatShading: true, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) mesh(new THREE.IcosahedronGeometry(1.5 + r() * 1.5, 0), cloudM, k * 1.6, r() * 0.8, r(), g);
      g.position.set((r() - 0.5) * 90, 12 + r() * 10, -r() * 240);
      this.scene.add(g); this.clouds.push(g);
    }
    // folded paper plane: two wing triangles + a keel
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 0, -1.4, -1.1, 0.12, 0.9, 0, 0, 0.9,     // left wing
      0, 0, -1.4, 0, 0, 0.9, 1.1, 0.12, 0.9,      // right wing
      0, 0, -1.4, 0, -0.35, 0.9, 0, 0, 0.9,       // keel
    ], 3));
    geo.computeVertexNormals();
    this.plane = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xfdfdf8, side: THREE.DoubleSide, roughness: 0.8 }));
    this.plane.castShadow = true;
    this.scene.add(this.plane);
    this.alt = 8;
  }
  update(dt) {
    const move = 0.45 * dt;
    this.sea.offset.y += move / 8;
    for (const g of this.islands) { g.position.z += move; recycle(g, 270, 20); }
    for (const c of this.clouds) { c.position.z += move * 1.05; recycle(c, 250, 20); }
    const roll = (this.t % 9) < 1.4 ? ((this.t % 9) / 1.4) * Math.PI * 2 : 0;   // a barrel roll every 9s
    const x = Math.sin(this.t * 0.6) * 4, y = this.alt + Math.sin(this.t * 0.9) * 1.5;
    this.plane.position.set(x, y, 0);
    this.plane.rotation.set(Math.cos(this.t * 0.9) * 0.15, 0, -Math.cos(this.t * 0.6) * 0.5 + roll);
    this.camera.position.set(x * 0.7, y + 1.4, 4.8);
    this.camera.lookAt(x, y - 0.3, -6);
    this.sun.position.set(x + 10, y + 20, 10); this.sun.target.position.set(x, 0, -5);
  }
}

SCENES.push(
  { cls: DesertDrive, weight: 1 },
  { cls: Snowboard, weight: 1 },
  { cls: SpaceTunnel, weight: 1 },
  { cls: StreetSkate, weight: 1 },
  { cls: JetSki, weight: 1 },
  { cls: PaperPlane, weight: 1 },
);
