// combat.js — Ren's fists and, once Mama Ivo trusts him, a pistol: hitscan with
// a tracer and muzzle flash. Violence is never free: witnesses call it in.

import * as THREE from 'three';
import { G, addHeat } from './state.js';
import { peds, player, scarePeds } from './people.js';
import { sfx } from './audio.js';

let punchCd = 0, shootCd = 0, flash = null, flashT = 0, tracer = null, tracerT = 0;

export function initCombat(scene) {
  flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
  scene.add(flash);
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
  scene.add(tracer);
}

export function tryPunch(dt) {
  punchCd -= dt;
  if (punchCd > 0) return false;
  // nearest ped within 1.6 m and roughly in front
  const fx = -Math.sin(player.heading - Math.PI), fz = -Math.cos(player.heading - Math.PI);
  for (const p of peds) {
    if (p.down) continue;
    const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
    if (d < 1.7 && (dx * fx + dz * fz) / (d || 1) > 0.2) {
      punchCd = 0.45;
      p.down = true; p.downT = 5; p.group.rotation.x = Math.PI / 2; p.group.position.y = 0.25;
      sfx.punch();
      scarePeds(player.x, player.z, 13);
      addHeat(1.6, 250);
      G.lastHitPed = p.name;
      return true;
    }
  }
  punchCd = 0.25;
  sfx.punch();
  return false;
}

export function tryShoot(scene, camera) {
  if (!G.hasPistol || shootCd > 0) return;
  shootCd = 0.28;
  sfx.shot();
  scarePeds(player.x, player.z, 20);
  addHeat(2.2, 300);
  // hitscan from the camera through the crosshair
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let bestT = 60, hitPed = null;
  for (const p of peds) {
    if (p.down) continue;
    const c = new THREE.Vector3(p.x, 1.1, p.z);
    const t = c.clone().sub(origin).dot(dir);
    if (t < 0 || t > bestT) continue;
    const closest = origin.clone().add(dir.clone().multiplyScalar(t));
    if (closest.distanceTo(c) < 0.55) { bestT = t; hitPed = p; }
  }
  const end = origin.clone().add(dir.clone().multiplyScalar(bestT));
  if (hitPed) {
    hitPed.down = true; hitPed.downT = 8;
    hitPed.group.rotation.x = Math.PI / 2; hitPed.group.position.y = 0.25;
    G.lastHitPed = hitPed.name;
    addHeat(1.5, 500);
  }
  // tracer + flash at the muzzle (just under the camera)
  const muzzle = origin.clone().add(dir.clone().multiplyScalar(0.7)); muzzle.y -= 0.15;
  const pos = tracer.geometry.attributes.position;
  pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  tracer.material.opacity = 0.9; tracerT = 0.06;
  flash.position.copy(muzzle);
  flash.material.opacity = 0.95; flashT = 0.05;
}

export function updateCombat(dt) {
  if (punchCd > 0) punchCd -= dt;
  if (shootCd > 0) shootCd -= dt;
  if (flashT > 0) { flashT -= dt; if (flashT <= 0 && flash) flash.material.opacity = 0; }
  if (tracerT > 0) { tracerT -= dt; if (tracerT <= 0 && tracer) tracer.material.opacity = 0; }
}
