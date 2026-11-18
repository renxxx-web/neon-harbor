// police.js — the Harbor Patrol: pursuit AI that rams and boxes the player in,
// roadblocks at four stars and up, the BUSTED meter, and the wanted-level decay
// when the player breaks line of sight (or hides in the safehouse garage).

import * as THREE from 'three';
import { G, WORLD, clamp, rand, pick } from './state.js';
import { createCar, stepCar, liveCars, resolveCarCollisions } from './vehicles.js';
import { groundY } from './world.js';
import { sfx, sirensUpdate } from './audio.js';

export const cops = [];
let sceneRef = null, spawnT = 0, roadblockT = 8, roadblock = null;
export const busted = { meter: 0 };

export function initPolice(scene) { sceneRef = scene; }

function playerTarget() {
  if (G.driving && G.playerCar) return { x: G.playerCar.x, z: G.playerCar.z, speed: Math.abs(G.playerCar.speed) };
  return { x: G.playerPos.x, z: G.playerPos.z, speed: G.playerPos.speedNow || 0 };
}

// Spawn anchors: real road points across ALL three districts — the island
// grid, the quay road, the bridge deck and the far-shore streets — so the
// patrol can always reach the player on a road, wherever the chase goes.
const SPAWN_ANCHORS = [];
for (const x of WORLD.roadLines) for (const z of WORLD.roadLines) SPAWN_ANCHORS.push([x, z]);
for (const x of WORLD.roadLines) SPAWN_ANCHORS.push([x, 238]);
for (let x = 280; x <= 840; x += 56) SPAWN_ANCHORS.push([x, 6]);
for (const x of [638, 712, 786]) for (const z of [-74, 0, 74]) SPAWN_ANCHORS.push([x, z]);

function spawnCop(px, pz) {
  // appear on a road 55–135 m away, never right on top of the player
  const near = SPAWN_ANCHORS.filter(([ax, az]) => {
    const d = Math.hypot(ax - px, az - pz); return d >= 55 && d <= 135;
  });
  let pool = near;
  if (!pool.length) {
    pool = SPAWN_ANCHORS.map(([ax, az]) => [Math.hypot(ax - px, az - pz), ax, az])
      .sort((a, b) => a[0] - b[0]).slice(0, 4).map(([, ax, az]) => [ax, az]);
  }
  const [x, z] = pick(pool);
  const cop = createCar(sceneRef, 'patrol', 0x18222e, x, z, rand(0, 6.28));
  cop.state = 'police';
  cop.cruise = 99;
  cops.push(cop); liveCars.push(cop);
  return cop;
}

function despawnCop(cop) {
  sceneRef.remove(cop.group);
  let i = cops.indexOf(cop); if (i >= 0) cops.splice(i, 1);
  i = liveCars.indexOf(cop); if (i >= 0) liveCars.splice(i, 1);
}

const barrierMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
const barrierStripe = new THREE.MeshBasicMaterial({ color: 0xff5d2e });
function spawnRoadblock(px, pz, heading) {
  // snap the block to the road the player is about to use, ~60 m ahead
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  let bx = px + fx * 62, bz = pz + fz * 62;
  const alongX = Math.abs(fx) > Math.abs(fz);
  if (alongX) {
    // east of the island the road is the bridge centre line; south, the quay
    if (bx > 230) bz = 6;
    else if (pz > 230) bz = 238;
    else bz = Math.round(bz / 56) * 56;
  } else if (px > 560) {
    // far-shore vertical streets
    let best = 638, bd = 1e9;
    for (const gx of [638, 712, 786]) { const d = Math.abs(gx - bx); if (d < bd) { bd = d; best = gx; } }
    bx = best;
  } else bx = Math.round(bx / 56) * 56;
  bx = clamp(bx, -230, 870); bz = clamp(bz, -230, 250);
  const cars = [];
  const perp = alongX ? 0 : Math.PI / 2;
  for (const off of [-3.4, 3.4]) {
    const cx = alongX ? bx : bx + off, cz = alongX ? bz + off : bz;
    const cop = createCar(sceneRef, 'patrol', 0x18222e, cx, cz, perp + 0.5);
    cop.state = 'roadblock';
    cars.push(cop); liveCars.push(cop);
  }
  const grp = new THREE.Group();
  for (let i = -1; i <= 1; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.4), barrierMat);
    b.position.set(alongX ? bx + 0 : bx + i * 2.3, 0.45, alongX ? bz + i * 2.3 : bz);
    if (!alongX) b.rotation.y = Math.PI / 2;
    grp.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.44), barrierStripe);
    s.position.copy(b.position); s.position.y = 0.6; s.rotation.copy(b.rotation); grp.add(s);
  }
  grp.position.y = groundY(bx, bz);
  sceneRef.add(grp);
  roadblock = { cars, grp, x: bx, z: bz, t: 30 };
}

function clearRoadblock() {
  if (!roadblock) return;
  for (const c of roadblock.cars) {
    sceneRef.remove(c.group);
    const i = liveCars.indexOf(c); if (i >= 0) liveCars.splice(i, 1);
  }
  sceneRef.remove(roadblock.grp);
  roadblock = null;
}

export function updatePolice(dt) {
  const t = playerTarget();
  const floor = G.wantedFloor || 0;
  // --- sight + decay ---------------------------------------------------------
  let anySight = false, nearest = 1e9;
  for (const cop of cops) {
    const d = Math.hypot(cop.x - t.x, cop.z - t.z);
    if (d < nearest) nearest = d;
    if (d < 58) anySight = true;
  }
  if (roadblock) anySight = anySight || Math.hypot(roadblock.x - t.x, roadblock.z - t.z) < 58;
  if (anySight) G.seenByPolice = 0; else G.seenByPolice += dt;
  if (G.wanted > floor && G.seenByPolice > 13) {
    G.heat = Math.max(floor === 0 ? 0 : (floor - 1) * 3 + 1, G.heat - 3);
    G.wanted = Math.max(floor, Math.min(5, G.wanted - 1));
    G.seenByPolice = 6;
    if (G.wanted === 0) G.heat = 0;
  }
  if (G.hideoutDrain && G.wanted > floor) {
    const floorHeat = floor === 0 ? 0 : (floor - 1) * 3 + 1;
    G.heat = Math.max(floorHeat, G.heat - dt * 2.2);
    G.wanted = G.heat <= 0 ? 0 : Math.max(floor, Math.min(5, 1 + Math.floor(G.heat / 3)));
    G.seenByPolice = 0;
  }
  // --- force size -------------------------------------------------------------
  const want = G.wanted === 0 ? 0 : Math.min(6, G.wanted + 1);
  spawnT -= dt;
  if (cops.length < want && spawnT <= 0) { spawnCop(t.x, t.z); spawnT = 2.5; }
  for (let i = cops.length - 1; i >= 0; i--) {
    const d = Math.hypot(cops[i].x - t.x, cops[i].z - t.z);
    if ((cops.length > want && d > 130) || d > 260 || cops[i].health < 12) despawnCop(cops[i]);
  }
  // --- pursuit ----------------------------------------------------------------
  let sirens = 0;
  for (const cop of cops) {
    if (cop.dead) continue;
    const dx = t.x - cop.x, dz = t.z - cop.z;
    const d = Math.hypot(dx, dz);
    if (d < 90) sirens++;
    // aim a little ahead of a moving target; on foot, stop short and hold
    const lead = G.driving ? clamp(d / 22, 0, 1.4) : 0;
    const px = t.x + (G.playerCar ? -Math.sin(G.playerCar.heading) * G.playerCar.speed * lead * 0.4 : 0);
    const pz = t.z + (G.playerCar ? -Math.cos(G.playerCar.heading) * G.playerCar.speed * lead * 0.4 : 0);
    const wantH = Math.atan2(-(px - cop.x), -(pz - cop.z));
    let dh = wantH - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const holdDist = G.driving ? 0 : 7;
    const input = {
      throttle: d > holdDist ? 1 : 0,
      brake: d <= holdDist && Math.abs(cop.speed) > 1,
      steer: clamp(-dh * 1.7, -1, 1),
      hand: Math.abs(dh) > 2.2,
    };
    if (d > 120) input.throttle = 1;
    stepCar(cop, input, dt);
    const impact = resolveCarCollisions(cop, liveCars);
    if (impact > 9 && G.playerCar && Math.hypot(cop.x - G.playerCar.x, cop.z - G.playerCar.z) < 6) {
      G.health -= (impact - 8) * 1.6;
      sfx.crash(1);
    }
    if (cop.group.userData.lightbar) {
      const ph = Math.floor(G.time * 6 + cop.id) % 2;
      cop.group.userData.lightbar.children[0].visible = ph === 0;
      cop.group.userData.lightbar.children[1].visible = ph === 1;
    }
  }
  sirensUpdate(Math.min(3, sirens), dt);
  // --- roadblocks at 4+ stars ---------------------------------------------------
  roadblockT -= dt;
  if (roadblock) {
    roadblock.t -= dt;
    const d = Math.hypot(roadblock.x - t.x, roadblock.z - t.z);
    if (roadblock.t <= 0 || d > 150) { clearRoadblock(); roadblockT = 16; }
  } else if (G.wanted >= 4 && G.driving && roadblockT <= 0) {
    spawnRoadblock(t.x, t.z, G.playerCar.heading);
    roadblockT = 26;
  }
  // --- busted meter ---------------------------------------------------------------
  const slow = t.speed < 2.6;
  const copNear = nearest < (G.driving ? 10.5 : 8.5);
  if (G.wanted > 0 && slow && copNear && G.mode === 'play') {
    busted.meter += dt * (G.driving ? 0.30 : 0.42);
    if (busted.meter >= 1) { busted.meter = 0; G.bustedEvent = true; }
  } else busted.meter = Math.max(0, busted.meter - dt * 0.5);
}

export function clearPolice() {
  for (let i = cops.length - 1; i >= 0; i--) despawnCop(cops[i]);
  clearRoadblock();
  busted.meter = 0;
}
