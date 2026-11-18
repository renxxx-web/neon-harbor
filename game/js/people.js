// people.js — Ren Kade on foot (an articulated little figure with a walk cycle)
// and the named pedestrians of NEON HARBOR, who stroll the sidewalks, panic at
// gunfire and fast cars, and remember being run into.

import * as THREE from 'three';
import { G, rand, pick, clamp } from './state.js';
import { collideCircle, groundY, landAt } from './world.js';
import { addHeat } from './state.js';

export const PED_NAMES = ['Wren Okafor', 'Silas Marek', 'June Castellan', 'Yuki Amamiya', 'Petra Lindqvist',
  'Marco Reyes', 'Ines Duarte', 'Kofi Mensah', 'Alba Ferreira', 'Tomasz Kral', 'Nadia Rahal', 'Elias Brandt',
  'Rosa Jimenez', 'Henrik Voss', 'Mina Seok', 'Omar Haddad', 'Lena Fischer', 'Yara Nasser', 'Dario Fontana',
  'Sana Iqbal', 'Victor Petran', 'Aiko Tanabe', 'Marta Kowal', 'Felix Andersen'];
const COATS = [0xd84a6b, 0x3e7cb1, 0xf2c14e, 0x51cf66, 0x9775fa, 0xff8787, 0x63e6be, 0xffa94d, 0xe8e8e8, 0x748ffc];

function figure(coat, skin = 0xc9a189) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: coat });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2026 });
  const skinM = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), mat); torso.position.y = 1.06; grp.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinM); head.position.y = 1.56; grp.add(head);
  const parts = {};
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.13), mat);
    arm.geometry.translate(0, -0.24, 0); arm.position.set(s * 0.31, 1.32, 0); grp.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.16), dark);
    leg.geometry.translate(0, -0.34, 0); leg.position.set(s * 0.12, 0.74, 0); grp.add(leg);
    parts[s < 0 ? 'armL' : 'armR'] = arm; parts[s < 0 ? 'legL' : 'legR'] = leg;
  }
  return { grp, parts };
}

export const player = {
  x: -196, z: 208, y: 0, vy: 0, heading: Math.PI, speedNow: 0, group: null, parts: null, walkPh: 0,
};
export function createPlayer(scene) {
  const f = figure(0x20242e);
  // Ren's signature: a teal scarf stripe on the torso
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.28), new THREE.MeshBasicMaterial({ color: 0x37e0ff }));
  stripe.position.y = 1.24; f.grp.add(stripe);
  player.group = f.grp; player.parts = f.parts;
  player.group.position.set(player.x, 0, player.z);
  scene.add(f.grp);
  return player;
}

// on-foot movement: dirX/dirZ is the desired WORLD-space direction (already
// camera-relative, computed by main.js), magnitude 0..1
export function stepPlayer(dt, dirX, dirZ, sprint, jump) {
  const mag = Math.hypot(dirX, dirZ);
  const speed = (sprint ? 8.2 : 4.6);
  let vx = 0, vz = 0;
  if (mag > 0.01) {
    vx = dirX * speed; vz = dirZ * speed;
    player.heading = Math.atan2(-vx, -vz) + Math.PI;
    player.walkPh += dt * (sprint ? 11 : 8);
  }
  player.speedNow = Math.hypot(vx, vz);
  let nx = player.x + vx * dt, nz = player.z + vz * dt;
  if (!landAt(nx, nz) && groundY(nx, nz) === 0) { nx = player.x; nz = player.z; }
  [nx, nz] = collideCircle(nx, nz, 0.5);
  player.x = nx; player.z = nz;
  const gy = groundY(player.x, player.z);
  if (jump && player.y <= gy + 0.01) player.vy = 5.4;
  player.vy -= 15 * dt;
  player.y += player.vy * dt;
  if (player.y < gy) { player.y = gy; player.vy = 0; }
  player.group.position.set(player.x, player.y, player.z);
  player.group.rotation.y = player.heading;
  const sw = Math.sin(player.walkPh) * (player.speedNow > 0.1 ? 0.55 : 0);
  player.parts.legL.rotation.x = sw; player.parts.legR.rotation.x = -sw;
  player.parts.armL.rotation.x = -sw * 0.8; player.parts.armR.rotation.x = sw * 0.8;
  if (player.speedNow <= 0.1) {
    player.parts.legL.rotation.x *= 0.8; player.parts.legR.rotation.x *= 0.8;
    player.parts.armL.rotation.x *= 0.8; player.parts.armR.rotation.x *= 0.8;
  }
}

// --- pedestrians ---------------------------------------------------------------
export const peds = [];
function pedMesh(coat) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: coat });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2026 });
  const skinM = new THREE.MeshLambertMaterial({ color: pick([0xc9a189, 0x8a5a3b, 0x6e4530, 0xe0bfa8]) });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.72, 0.2), dark); legs.position.y = 0.36; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), mat); torso.position.y = 1.06; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), skinM); head.position.y = 1.56; g.add(head);
  return g;
}

export function spawnPeds(scene, count = 16) {
  for (let i = 0; i < count; i++) {
    const coat = pick(COATS);
    const grp = pedMesh(coat);
    const x = rand(-215, 215), z = rand(-215, 235);
    grp.position.set(x, 0, z); scene.add(grp);
    peds.push({
      name: PED_NAMES[i % PED_NAMES.length], group: grp, x, z,
      tx: x, tz: z, speed: rand(1.1, 1.7), fleeT: 0, down: false, downT: 0, ph: rand(0, 6),
    });
  }
}

export function scarePeds(x, z, radius = 16) {
  for (const p of peds) {
    if (p.down) continue;
    if (Math.hypot(p.x - x, p.z - z) < radius) p.fleeT = rand(2.5, 4.5);
  }
}

export function updatePeds(dt, cars) {
  for (const p of peds) {
    if (p.down) {
      p.downT -= dt;
      if (p.downT <= 0) { p.group.rotation.x = 0; p.down = false; p.group.position.y = 0; }
      continue;
    }
    // run-over check against moving cars
    for (const c of cars) {
      if (c.dead) continue;
      if (Math.abs(c.speed) > 3.5 && Math.hypot(c.x - p.x, c.z - p.z) < c.model.len * 0.36 + 0.5) {
        p.down = true; p.downT = 6;
        p.group.rotation.x = Math.PI / 2; p.group.position.y = 0.25;
        if (c.isPlayer) {
          addHeat(2.5, 500);
          G.lastHitPed = p.name;
        }
        break;
      }
    }
    if (p.down) continue;
    let speed = p.speed, tx = p.tx, tz = p.tz;
    if (p.fleeT > 0) {
      p.fleeT -= dt; speed = 5.6;
      tx = p.x + (p.x - player.x) * 2; tz = p.z + (p.z - player.z) * 2;
      if (G.driving) { tx = p.x * 2 - (G.playerCar ? G.playerCar.x : p.x); tz = p.z * 2 - (G.playerCar ? G.playerCar.z : p.z); }
    } else if (Math.hypot(p.tx - p.x, p.tz - p.z) < 1.5) {
      // pick a new sidewalk-ish target: along a block edge
      const bx = pick([-224, -168, -112, -56, 0, 56, 112, 168, 224]) + rand(-4, 4);
      const bz = rand(-220, 240);
      if (Math.random() < 0.5) { p.tx = bx; p.tz = bz; } else { p.tx = bz; p.tz = bx; }
      tx = p.tx; tz = p.tz;
    }
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
    let nx = p.x + (dx / d) * speed * dt, nz = p.z + (dz / d) * speed * dt;
    if (!landAt(nx, nz)) { p.tx = p.x + rand(-30, 30); p.tz = p.z + rand(-30, 30); nx = p.x; nz = p.z; }
    [nx, nz] = collideCircle(nx, nz, 0.4);
    p.x = nx; p.z = nz;
    p.ph += dt * speed * 3.4;
    p.group.position.set(p.x, groundY(p.x, p.z) + Math.abs(Math.sin(p.ph)) * 0.05, p.z);
    p.group.rotation.y = Math.atan2(-(dx / d), -(dz / d)) + Math.PI;
    p.group.rotation.z = Math.sin(p.ph) * 0.04;
  }
}
