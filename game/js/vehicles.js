// vehicles.js — the cars of NEON HARBOR: nine original models (the Kestrel GT is
// the signature one), a pool of "live" cars that can be parked, driven by
// traffic AI, or stolen by the player, and the shared arcade driving physics
// the player and the police both use.

import * as THREE from 'three';
import { WORLD, G, rand, randi, pick, clamp, lerp } from './state.js';
import { collideCircle, groundY } from './world.js';

export const CAR_MODELS = [
  { id: 'kestrel', name: 'Kestrel GT', len: 4.5, wid: 1.9, hgt: 0.52, cabin: 0.42, top: 46, accel: 17, grip: 5.2, colors: [0xd8232f, 0x1c6dd8, 0xf2f2f2, 0x15151c] },
  { id: 'voltaic', name: 'Voltaic S', len: 4.7, wid: 1.85, hgt: 0.62, cabin: 0.5, top: 38, accel: 13, grip: 6, colors: [0xb9c2cc, 0x2b3a4a, 0x5a1f24, 0x223528] },
  { id: 'bison', name: 'Bison Pickup', len: 5.1, wid: 2.0, hgt: 0.8, cabin: 0.55, top: 33, accel: 11, grip: 5.4, colors: [0x74552e, 0x37474f, 0x6e2b20, 0x9aa3ab] },
  { id: 'taxi', name: 'Harbor Cab', len: 4.6, wid: 1.85, hgt: 0.66, cabin: 0.52, top: 36, accel: 12, grip: 6, colors: [0xf7b731] },
  { id: 'mole', name: 'Mole Van', len: 4.9, wid: 2.0, hgt: 1.15, cabin: 0.4, top: 30, accel: 10, grip: 5.6, colors: [0xcfd4d8, 0x44546a, 0x71563a] },
  { id: 'ronin', name: 'Ronin Coupe', len: 4.4, wid: 1.85, hgt: 0.5, cabin: 0.44, top: 43, accel: 15, grip: 5.4, colors: [0x101418, 0x5e17eb, 0xb3122e, 0xd8d8d8] },
  { id: 'duchess', name: 'Duchess Classic', len: 5.3, wid: 1.95, hgt: 0.6, cabin: 0.5, top: 34, accel: 10, grip: 5.8, colors: [0x2e4038, 0x402e2e, 0x1d2733, 0x77694f] },
  { id: 'moth', name: 'Micro Moth', len: 3.4, wid: 1.6, hgt: 0.72, cabin: 0.5, top: 29, accel: 11, grip: 6.4, colors: [0xe86a92, 0x67c6e3, 0xf2e14c, 0x9be15d] },
  { id: 'hauler', name: 'Hauler Truck', len: 7.6, wid: 2.3, hgt: 0.9, cabin: 0.8, top: 27, accel: 8, grip: 5, colors: [0x8c99a3, 0x37505f] },
  { id: 'patrol', name: 'Patrol Interceptor', len: 4.8, wid: 1.9, hgt: 0.6, cabin: 0.5, top: 44, accel: 16, grip: 6.2, colors: [0x18222e] },
];
export const modelById = (id) => CAR_MODELS.find(m => m.id === id);

const paintMats = new Map();
function paintMat(color) {
  if (!paintMats.has(color)) paintMats.set(color, new THREE.MeshPhongMaterial({ color, specular: 0x88a6c8, shininess: 60, emissive: color, emissiveIntensity: 0.34 }));
  return paintMats.get(color);
}
const glassMat = new THREE.MeshPhongMaterial({ color: 0x0d1622, specular: 0xbfe0ff, shininess: 120 });
const trimMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
const tireMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0c });
const lightMatF = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
const lightMatR = new THREE.MeshBasicMaterial({ color: 0xff2e3e });
const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10);

let carSeq = 0;
export function createCar(scene, modelId, color, x, z, heading = 0) {
  const m = modelById(modelId);
  const grp = new THREE.Group();
  const paint = paintMat(color);
  const body = new THREE.Mesh(new THREE.BoxGeometry(m.wid, m.hgt, m.len), paint);
  body.position.y = 0.32 + m.hgt / 2; grp.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(m.wid * 0.86, m.cabin, m.len * 0.48), glassMat);
  cabin.position.set(0, 0.32 + m.hgt + m.cabin / 2 - 0.04, -m.len * 0.04); grp.add(cabin);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(m.wid * 1.01, 0.3, m.len * 1.01), trimMat);
  skirt.position.y = 0.3; grp.add(skirt);
  if (modelId === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    sign.position.set(0, 0.32 + m.hgt + m.cabin + 0.08, -m.len * 0.04); grp.add(sign);
  }
  if (modelId === 'hauler') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 4.6), new THREE.MeshLambertMaterial({ color: 0xb3402e }));
    box.position.set(0, 1.75, 1.2); grp.add(box);
  }
  if (modelId === 'patrol') {
    const bar = new THREE.Group();
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2244 }));
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2277ff }));
    bl.position.x = -0.3; br.position.x = 0.3; bar.add(bl); bar.add(br);
    bar.position.set(0, 0.32 + m.hgt + m.cabin + 0.06, -m.len * 0.04); grp.add(bar);
    grp.userData.lightbar = bar;
    const livery = new THREE.Mesh(new THREE.BoxGeometry(m.wid * 1.02, 0.22, m.len * 0.7),
      new THREE.MeshLambertMaterial({ color: 0x9db4cc }));
    livery.position.y = 0.62; grp.add(livery);
  }
  const wheels = [];
  const wy = 0.34, wx = m.wid / 2 - 0.05, wz = m.len / 2 - 0.85;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = new THREE.Mesh(wheelGeo, tireMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * wx, wy, sz * wz);
    grp.add(w); wheels.push(w);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(m.wid * 0.7, 0.12, 0.06), lightMatF);
  hl.position.set(0, 0.62, -m.len / 2 - 0.02); grp.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(m.wid * 0.7, 0.12, 0.06), lightMatR);
  tl.position.set(0, 0.66, m.len / 2 + 0.02); grp.add(tl);
  grp.position.set(x, groundY(x, z), z);
  grp.rotation.y = heading;
  scene.add(grp);
  const car = {
    id: carSeq++, model: m, group: grp, wheels, color,
    x, z, heading, speed: 0, slide: 0, steerVis: 0,
    state: 'parked', health: 100, alarmT: 0, node: null, targetNode: null,
    cruise: rand(8, 13), smokeT: 0, dead: false, isPlayer: false, missionCar: false,
  };
  grp.userData.car = car;
  return car;
}

// arcade physics shared by player + police: input = {throttle, steer, brake, hand}
export function stepCar(car, input, dt) {
  const m = car.model;
  const fwdX = -Math.sin(car.heading), fwdZ = -Math.cos(car.heading);
  if (input.throttle > 0) car.speed += m.accel * input.throttle * dt * (car.speed < 0 ? 2.2 : 1);
  if (input.brake) {
    if (car.speed > 0.6) car.speed -= 26 * dt;
    else car.speed = Math.max(car.speed - m.accel * 0.62 * dt, -m.top * 0.38);
  }
  const drag = input.hand ? 0.55 : 0.25;
  car.speed -= car.speed * drag * dt;
  if (!input.throttle && !input.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 3.2 * dt);
  car.speed = clamp(car.speed, -m.top * 0.4, m.top * (car.health < 25 ? 0.55 : 1));
  const steerAuthority = clamp(Math.abs(car.speed) / 7, 0, 1) * Math.sign(car.speed || 1);
  car.heading -= input.steer * 1.55 * steerAuthority * dt * (input.hand ? 1.35 : 1);
  car.steerVis = lerp(car.steerVis, input.steer, 1 - Math.pow(0.0001, dt));
  // lateral slide (drift): velocity = forward speed + decaying sideways slide
  const grip = input.hand ? 1.4 : m.grip;
  car.slide -= car.slide * Math.min(1, grip * dt);
  const rightX = -fwdZ, rightZ = fwdX;
  let vx = fwdX * car.speed + rightX * car.slide;
  let vz = fwdZ * car.speed + rightZ * car.slide;
  let nx = car.x + vx * dt, nz = car.z + vz * dt;
  const r = m.len * 0.32;
  const before = Math.abs(car.speed);
  [nx, nz] = collideCircle(nx, nz, r);
  const moved = Math.hypot(nx - car.x, nz - car.z);
  if (moved < Math.abs(car.speed) * dt * 0.35 && Math.abs(car.speed) > 6) {
    // hit something solid
    car.speed *= -0.25; car.slide = 0;
    car.health -= (before - 6) * 1.1;
    car.lastCrash = before;
  } else car.lastCrash = 0;
  car.x = nx; car.z = nz;
  // wheels + body lean
  const wy = groundY(car.x, car.z);
  car.group.position.set(car.x, wy, car.z);
  car.group.rotation.y = car.heading;
  car.group.rotation.z = clamp(-car.slide * 0.012, -0.05, 0.05);
  car.group.rotation.x = clamp(car.speed * 0.0012 * (input.throttle ? 1 : -1), -0.02, 0.02);
  const spin = car.speed * dt / 0.34;
  car.wheels.forEach((w, i) => {
    w.rotation.x += spin;
    if (i < 2) w.rotation.y = -car.steerVis * 0.42;
  });
  return car.lastCrash;
}

// --- traffic: a small node graph over the road grid ---------------------------
const nodes = [];
const nodeMap = new Map();
function nodeAt(x, z) {
  const k = x + ',' + z;
  if (!nodeMap.has(k)) { const n = { x, z, next: [] }; nodeMap.set(k, n); nodes.push(n); }
  return nodeMap.get(k);
}
for (const x of WORLD.roadLines) for (const z of WORLD.roadLines) nodeAt(x, z);
nodeAt(224, 0); nodeAt(WORLD.shoreX0, 0);
for (const x of [638, 712, 786]) for (const z of [-74, 0, 74]) nodeAt(x, z);
for (const n of nodes) {
  for (const o of nodes) {
    if (n === o) continue;
    const sameX = n.x === o.x, sameZ = n.z === o.z;
    if (sameX === sameZ) continue;
    const d = Math.hypot(n.x - o.x, n.z - o.z);
    const bridgeEdge = (n.x === 224 && o.x === WORLD.shoreX0) || (o.x === 224 && n.x === WORLD.shoreX0);
    if (d <= 76 || bridgeEdge) n.next.push(o);
  }
}
function nearestNode(x, z) {
  let best = null, bd = 1e9;
  for (const n of nodes) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
  return best;
}

export const liveCars = [];
export function spawnTraffic(scene, count) {
  for (let i = 0; i < count; i++) {
    const n = pick(nodes);
    const car = createCar(scene, pick(['voltaic', 'bison', 'taxi', 'mole', 'ronin', 'duchess', 'moth', 'kestrel']),
      0, n.x, n.z, 0);
    car.color = pick(car.model.colors);
    car.group.children[0].material = paintMat(car.color);
    car.state = 'traffic';
    car.node = n; car.targetNode = pick(n.next);
    car.heading = Math.atan2(-(car.targetNode.x - n.x), -(car.targetNode.z - n.z));
    liveCars.push(car);
  }
}

export function spawnParked(scene, count) {
  const spots = [];
  for (const x of WORLD.roadLines) for (let z = -210; z <= 210; z += 28) {
    if (Math.random() < 0.6) spots.push([x + 5.2, z + rand(-4, 4), Math.PI / 2]);
    if (Math.random() < 0.6) spots.push([x - 5.2, z + rand(-4, 4), -Math.PI / 2]);
  }
  for (let z = -200; z <= 200; z += 28) for (const x of WORLD.roadLines) {
    if (Math.random() < 0.35) spots.push([z + rand(-4, 4), x + 5.2, 0]);
  }
  spots.sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(count, spots.length); i++) {
    const [x, z, h] = spots[i];
    const car = createCar(scene, pick(['voltaic', 'bison', 'mole', 'ronin', 'duchess', 'moth', 'kestrel', 'taxi']),
      0, x, z, h + rand(-0.05, 0.05));
    car.color = pick(car.model.colors);
    car.group.children[0].material = paintMat(car.color);
    car.state = 'parked';
    if (Math.random() < 0.35) car.alarmT = -1; // alarmed: chirps when stolen
    liveCars.push(car);
  }
  // harbour + shore parking
  for (const [x, z, h] of [[-60, 246, 0.2], [80, 246, -0.2], [180, 246, 0], [700, 60, Math.PI / 2], [724, -60, -Math.PI / 2]]) {
    const car = createCar(scene, pick(['bison', 'mole', 'hauler', 'voltaic']), 0, x, z, h);
    car.color = pick(car.model.colors);
    car.group.children[0].material = paintMat(car.color);
    car.state = 'parked';
    liveCars.push(car);
  }
}

export function updateTraffic(dt, playerPos) {
  for (const car of liveCars) {
    if (car.state !== 'traffic' || car.dead) continue;
    const t = car.targetNode;
    const dx = t.x - car.x, dz = t.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) {
      const prev = car.node;
      car.node = t;
      const opts = t.next.filter(n => n !== prev);
      car.targetNode = pick(opts.length ? opts : t.next);
      continue;
    }
    // lane offset: keep right of the direction of travel
    const dirX = dx / dist, dirZ = dz / dist;
    const tx = t.x + (-dirZ) * 3.1, tz = t.z + (dirX) * 3.1;
    const want = Math.atan2(-(tx - car.x), -(tz - car.z));
    let dh = want - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    let slow = 1;
    for (const o of liveCars) {
      if (o === car || o.dead) continue;
      const ox = o.x - car.x, oz = o.z - car.z;
      const ahead = ox * -Math.sin(car.heading) + oz * -Math.cos(car.heading);
      const side = Math.abs(ox * -Math.cos(car.heading) - oz * -Math.sin(car.heading));
      if (ahead > 0 && ahead < 9 && side < 2.2) { slow = 0; break; }
    }
    const input = { throttle: slow ? 0.55 : 0, brake: !slow, steer: clamp(-dh * 1.4, -1, 1), hand: false };
    if (Math.abs(car.speed) > car.cruise) input.throttle = 0;
    stepCar(car, input, dt);
    if (car.health < 20) { car.dead = true; car.state = 'parked'; }
  }
}

export function nearestStealable(x, z, maxD = 3.4) {
  let best = null, bd = maxD;
  for (const car of liveCars) {
    if (car.dead || car.state === 'player') continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function removeCar(scene, car) {
  scene.remove(car.group);
  const i = liveCars.indexOf(car);
  if (i >= 0) liveCars.splice(i, 1);
}

// circle-vs-circle shoving between cars; returns impact speed if `car` hit hard
export function resolveCarCollisions(car, others) {
  let impact = 0;
  for (const o of others) {
    if (o === car || o.dead) continue;
    const dx = car.x - o.x, dz = car.z - o.z;
    const minD = (car.model.len + o.model.len) * 0.30;
    const d2 = dx * dx + dz * dz;
    if (d2 < minD * minD && d2 > 0.001) {
      const d = Math.sqrt(d2), push = (minD - d) / 2;
      const px = (dx / d) * push, pz = (dz / d) * push;
      car.x += px; car.z += pz;
      if (o.state !== 'roadblock') { o.x -= px; o.z -= pz; o.group.position.x = o.x; o.group.position.z = o.z; }
      const rel = Math.abs(car.speed - o.speed);
      if (rel > impact) impact = rel;
      if (Math.abs(car.speed) > 4) {
        o.health -= rel * 1.4; car.health -= rel * 0.8;
        car.speed *= 0.55; o.speed = car.speed * 0.7;
      }
    }
  }
  return impact;
}
