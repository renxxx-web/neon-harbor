// main.js — NEON HARBOR's bootstrap and frame loop: renderer, cameras (on-foot
// orbit + chase cam with speed FOV), input, entering and stealing cars, the
// busted/wasted flow, and the ?shot= staging the screenshots are taken with.

import * as THREE from 'three';
import { G, clamp, lerp, angleLerp, setWanted, addHeat, fmtMoney } from './state.js';
import { buildWorld, updateWorld, refreshBillboards, groundY } from './world.js';
import { createCar, spawnTraffic, spawnParked, updateTraffic, liveCars, nearestStealable, stepCar, resolveCarCollisions } from './vehicles.js';
import { createPlayer, spawnPeds, updatePeds, player, scarePeds, stepPlayer } from './people.js';
import { initPolice, updatePolice, clearPolice } from './police.js';
import { initCombat, tryPunch, tryShoot, updateCombat } from './combat.js';
import { initMissions, updateMissions, beginStory, currentTarget, tryActivityInteract, GARAGE } from './missions.js';
import { initHud, showHud, updateHud, drawMinimap, setPrompt, setRadio, toast, setObjective } from './hud.js';
import { initAudio, setMuted, engineStart, engineStop, engineUpdate, radioUpdate, radioCycle, radioStationName, sfx } from './audio.js';
import { saveExists, writeSave, readSave, wipeSave } from './save.js';
import { cops, busted } from './police.js';

const params = new URLSearchParams(location.search);
G.shot = params.get('shot');
G.playerPos = player;

let renderer, scene, camera, clock;
let camYaw = Math.PI, camPitch = 0.32, camHeading = Math.PI, shakeT = 0;
let keys = {}, pointerLocked = false;
let headlightRig = null, headTargets = [], playerLight = null;
let lastBountyShown = -1, hitCooldown = 0;

function init() {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1600);
  clock = new THREE.Clock();

  buildWorld(scene);
  createPlayer(scene);
  spawnTraffic(scene, 14);
  spawnParked(scene, 30);
  spawnPeds(scene, 16);
  initPolice(scene);
  initCombat(scene);
  initMissions(scene);
  initHud();
  buildHeadlights();
  wireInput();
  wireScreens();

  if (G.shot) stageShot(G.shot);
  else {
    document.getElementById('btn-continue').style.display = saveExists() ? '' : 'none';
    G.mode = 'title';
  }
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  // small debug/testing handle (also handy for players poking the console)
  window.__NH = { G, player, liveCars, cops, busted, addHeat, setWanted, refreshBillboards };
  renderer.setAnimationLoop(tick);
}

function buildHeadlights() {
  headlightRig = new THREE.Group();
  for (const s of [-0.6, 0.6]) {
    const spot = new THREE.SpotLight(0xcfe6ff, 220, 60, 0.46, 0.5, 1.4);
    spot.position.set(s, 0.8, -1);
    const tgt = new THREE.Object3D(); tgt.position.set(s * 1.6, 0, -30);
    headlightRig.add(tgt); spot.target = tgt;
    headlightRig.add(spot); headTargets.push(spot);
  }
  headlightRig.visible = false;
  scene.add(headlightRig);
  playerLight = new THREE.PointLight(0x7fa8d8, 30, 32, 1.6);
  scene.add(playerLight);
}

// --- input ---------------------------------------------------------------------
function wireInput() {
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyM') { G.muted = !G.muted; setMuted(G.muted); toast(G.muted ? 'SOUND OFF' : 'SOUND ON'); }
    if ((e.code === 'KeyP' || e.code === 'Escape') && G.mode === 'pause') { resumeGame(); return; }
    if (G.mode !== 'play') return;
    if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
    if (e.code === 'KeyE') onInteract();
    if (e.code === 'KeyF' && !G.driving) tryPunch(0);
    if (e.code === 'KeyR' && G.driving) { const n = radioCycle(); toast('RADIO', n); setRadio('♪ ' + n); }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  const canvas = renderer.domElement;
  canvas.addEventListener('click', () => {
    initAudio();
    if (G.mode === 'play' && !pointerLocked) canvas.requestPointerLock();
    else if (G.mode === 'play' && pointerLocked && !G.driving) tryShoot(scene, camera);
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });
  addEventListener('mousemove', (e) => {
    if (!pointerLocked || G.mode !== 'play') return;
    camYaw -= e.movementX * 0.0026;
    camPitch = clamp(camPitch + e.movementY * 0.0022, -0.15, 1.1);
  });
}

function wireScreens() {
  const $ = (id) => document.getElementById(id);
  $('btn-new').onclick = () => { initAudio(); sfx.ui(); wipeSave(); resetRun(); startPlay(); };
  $('btn-continue').onclick = () => {
    initAudio(); sfx.ui();
    const pos = readSave();
    if (pos) { player.x = pos.x; player.z = pos.z; }
    if (G.missionIndex > 4) G.racesUnlocked = true;
    startPlay();
  };
  $('btn-resume').onclick = () => { sfx.ui(); resumeGame(); };
  $('btn-quit-title').onclick = () => { sfx.ui(); location.reload(); };
  $('btn-busted-ok').onclick = () => { sfx.ui(); afterBusted(); };
  $('btn-wasted-ok').onclick = () => { sfx.ui(); afterWasted(); };
}

function resetRun() {
  G.cash = 250; G.bounty = 0; G.heat = 0; G.wanted = 0; G.health = 100;
  G.missionIndex = 0; G.hasPistol = false; G.activity = null;
  G.stats = { stolen: 0, racesWon: 0, deliveries: 0, bustedCount: 0, wastedCount: 0 };
  G.bestRaceMs = 0; G.racesUnlocked = false;
  player.x = GARAGE.x; player.z = GARAGE.z + 6;
}

function startPlay() {
  document.getElementById('screen-title').classList.add('hidden');
  showHud(true);
  G.mode = 'play';
  beginStory();
  renderer.domElement.requestPointerLock?.();
}

function pauseGame() {
  if (G.mode !== 'play') return;
  G.mode = 'pause';
  document.getElementById('pause-stats').innerHTML =
    'Cash ' + fmtMoney(G.cash) + ' · Bounty ' + fmtMoney(G.bounty) + '<br>' +
    'Cars stolen ' + G.stats.stolen + ' · Races won ' + G.stats.racesWon + ' · Deliveries ' + G.stats.deliveries +
    (G.bestRaceMs ? '<br>Best race ' + (G.bestRaceMs / 1000).toFixed(1) + 's' : '');
  document.getElementById('screen-pause').classList.remove('hidden');
  document.exitPointerLock?.();
}
function resumeGame() {
  document.getElementById('screen-pause').classList.add('hidden');
  G.mode = 'play';
}

// --- entering / leaving cars -----------------------------------------------------
function onInteract() {
  if (G.driving) { exitCar(); return; }
  if (tryActivityInteract()) return;
  const car = nearestStealable(player.x, player.z);
  if (car) enterCar(car);
}

function enterCar(car) {
  G.driving = true;
  G.playerCar = car;
  car.state = 'player'; car.isPlayer = true;
  player.group.visible = false;
  engineStart();
  G.stats.stolen += car.wasPlayerCar ? 0 : 1;
  if (!car.wasPlayerCar) {
    addHeat(0, 150); // the bounty grows with every theft, seen or not
    if (car.alarmT === -1 || Math.random() < 0.3) {
      sfx.alarm();
      addHeat(1.2, 0);
      toast('CAR ALARM', 'Somebody is already dialling the Patrol');
    } else if (Math.random() < 0.4) {
      addHeat(0.8, 0); // a pedestrian saw it
      scarePeds(car.x, car.z, 10);
    }
  }
  camHeading = car.heading;
  setRadio('♪ ' + radioStationName());
}

function exitCar() {
  const car = G.playerCar;
  if (!car) return;
  car.state = 'parked'; car.isPlayer = false; car.wasPlayerCar = true;
  car.speed = 0;
  G.driving = false; G.playerCar = null;
  engineStop();
  setRadio('');
  const side = 1;
  player.x = car.x + Math.cos(car.heading) * (car.model.wid / 2 + 0.8) * side;
  player.z = car.z - Math.sin(car.heading) * (car.model.wid / 2 + 0.8) * side;
  player.y = groundY(player.x, player.z);
  player.group.visible = true;
  writeSave({ x: player.x, z: player.z });
}

// --- busted / wasted ---------------------------------------------------------------
function doBusted() {
  G.mode = 'busted';
  G.stats.bustedCount++;
  const fine = Math.min(G.cash, Math.round(150 + G.bounty * 0.1 + G.wanted * 100));
  G.cash -= fine; G.bounty = Math.round(G.bounty * 0.5);
  document.getElementById('busted-text').textContent =
    'The Harbor Patrol got you. Fine paid: ' + fmtMoney(fine) + '. The billboards keep the bounty — half of it, anyway.';
  document.getElementById('screen-busted').classList.remove('hidden');
  document.exitPointerLock?.();
  if (G.driving) exitCar();
  clearPolice(); setWanted(0); G.heat = 0;
  writeSave({ x: 196, z: -168 });
}
function afterBusted() {
  document.getElementById('screen-busted').classList.add('hidden');
  player.x = 196; player.z = -168; player.y = 0;
  G.mode = 'play';
}
function doWasted() {
  G.mode = 'wasted';
  G.stats.wastedCount++;
  const fee = Math.min(G.cash, Math.round(G.cash * 0.1));
  G.cash -= fee;
  document.getElementById('wasted-text').textContent =
    'You wake up at Saint-9 General. Bill: ' + fmtMoney(fee) + '. The rain kept your seat warm.';
  document.getElementById('screen-wasted').classList.remove('hidden');
  document.exitPointerLock?.();
  if (G.driving) exitCar();
  clearPolice(); setWanted(0); G.heat = 0; G.bounty = Math.round(G.bounty * 0.7);
}
function afterWasted() {
  document.getElementById('screen-wasted').classList.add('hidden');
  player.x = -196; player.z = -168; player.y = 0; G.health = 100;
  G.mode = 'play';
  writeSave({ x: player.x, z: player.z });
}

// --- frame loop ---------------------------------------------------------------------
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  const focus = G.driving && G.playerCar ? G.playerCar : player;
  updateWorld(dt, focus);

  if (G.mode === 'title') { titleCamera(); renderer.render(scene, camera); return; }
  if (G.shot) { shotCamera(dt); updateShotLightbars(); renderer.render(scene, camera); drawShotHud(); return; }
  if (G.mode !== 'play') { renderer.render(scene, camera); return; }

  hitCooldown = Math.max(0, hitCooldown - dt);
  if (G.driving && G.playerCar) driveFrame(dt);
  else walkFrame(dt);

  updateTraffic(dt, focus);
  updatePeds(dt, liveCars);
  updatePolice(dt);
  updateMissions(dt);
  updateCombat(dt);
  if (G.bustedEvent) { G.bustedEvent = false; doBusted(); }
  if (G.health <= 0 && G.mode === 'play') doWasted();
  if (G.health < 100 && G.wanted === 0) G.health = Math.min(100, G.health + dt * 2.5);
  if (G.lastHitPed) { toast('YOU HIT ' + G.lastHitPed.toUpperCase(), 'The city remembers'); G.lastHitPed = null; }

  // prompt hints
  if (!G.driving) {
    const car = nearestStealable(player.x, player.z);
    if (car) setPrompt('<b>E</b> — steal the ' + car.model.name);
    else setPrompt('');
  } else setPrompt('');

  // billboards follow the bounty live
  if (G.bounty !== lastBountyShown) { lastBountyShown = G.bounty; refreshBillboards(); }

  engineUpdate(G.playerCar ? G.playerCar.speed / G.playerCar.model.top : 0, G.driving);
  radioUpdate(dt, G.driving);
  headlightRig.visible = G.driving;
  if (G.driving && G.playerCar) {
    const c = G.playerCar;
    headlightRig.position.set(c.x, groundY(c.x, c.z) + 0.25, c.z);
    headlightRig.rotation.y = c.heading;
  }
  playerLight.position.set(focus.x, (focus.y || groundY(focus.x, focus.z)) + 3.4, focus.z);

  updateHud(dt, G.driving ? G.playerCar : null);
  const markers = [];
  const tgt = currentTarget();
  if (tgt) markers.push({ x: tgt.x, z: tgt.z, kind: 'mission' });
  if (G.racesUnlocked && !G.activity) markers.push({ x: 62, z: 62, kind: 'race' });
  if (!G.activity) markers.push({ x: 50, z: 234, kind: 'courier' });
  markers.push({ x: GARAGE.x, z: GARAGE.z, kind: 'safehouse' });
  drawMinimap(focus, G.driving && G.playerCar ? G.playerCar.heading : camYaw + Math.PI, cops, markers);
  renderer.render(scene, camera);
}

function driveFrame(dt) {
  const car = G.playerCar;
  const input = {
    throttle: (keys.KeyW || keys.ArrowUp) ? 1 : 0,
    brake: !!(keys.KeyS || keys.ArrowDown),
    steer: ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) + ((keys.KeyD || keys.ArrowRight) ? -1 : 0),
    hand: !!keys.Space,
  };
  const crash = stepCar(car, input, dt);
  const impact = resolveCarCollisions(car, liveCars);
  const hard = Math.max(crash || 0, impact);
  if (hard > 9) {
    G.health -= (hard - 9) * 1.5;
    shakeT = 0.35; sfx.crash(1);
    if (impact > 7 && hitCooldown <= 0) {
      hitCooldown = 2;
      const hitCop = cops.some(c => Math.hypot(c.x - car.x, c.z - car.z) < 6);
      addHeat(hitCop ? 2 : 0.8, hitCop ? 300 : 200);
    }
  }
  // chase camera: sits behind the car (offset direction = the car's heading
  // vector flipped), swings wide in drifts, FOV stretches with speed
  camHeading = angleLerp(camHeading, car.heading, 1 - Math.pow(0.02, dt));
  const back = 9.6, up = 3.6;
  const px = car.x + Math.sin(camHeading) * back, pz = car.z + Math.cos(camHeading) * back;
  camera.position.set(px, groundY(car.x, car.z) + up + Math.sin(G.time * 0.8) * 0.05, pz);
  camera.lookAt(car.x - Math.sin(car.heading) * 6, groundY(car.x, car.z) + 1.6, car.z - Math.cos(car.heading) * 6);
  const targetFov = 62 + clamp(Math.abs(car.speed) / car.model.top, 0, 1) * 11;
  if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov = lerp(camera.fov, targetFov, 0.12); camera.updateProjectionMatrix(); }
  if (shakeT > 0) { shakeT -= dt; camera.position.x += (Math.random() - 0.5) * shakeT; camera.position.y += (Math.random() - 0.5) * shakeT; }
}

function walkFrame(dt) {
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = -fz, rz = fx;
  let dx = fx * iz + rx * ix, dz = fz * iz + rz * ix;
  const l = Math.hypot(dx, dz);
  if (l > 0) { dx /= l; dz /= l; }
  stepPlayer(dt, dx, dz, !!(keys.ShiftLeft || keys.ShiftRight), !!keys.Space);
  // third-person orbit camera: behind the player, opposite the look direction
  const dist = 5.4;
  const px = player.x - fx * dist * Math.cos(camPitch), pz = player.z - fz * dist * Math.cos(camPitch);
  const py = player.y + 1.8 + Math.sin(camPitch) * dist;
  camera.position.set(px, Math.max(py, groundY(px, pz) + 0.5), pz);
  camera.lookAt(player.x, player.y + 1.6, player.z);
  if (Math.abs(camera.fov - 62) > 0.1) { camera.fov = lerp(camera.fov, 62, 0.15); camera.updateProjectionMatrix(); }
}

// --- title + screenshot staging -------------------------------------------------------
function titleCamera() {
  const t = G.time * 0.045;
  const x = Math.sin(t) * 210, z = 300 + Math.cos(t * 0.7) * 60;
  camera.position.set(x, 42 + Math.sin(G.time * 0.11) * 6, z);
  camera.lookAt(0, 8, 40);
  if (Math.abs(camera.fov - 55) > 0.1) { camera.fov = 55; camera.updateProjectionMatrix(); }
}

let shotCamPos = null, shotCamLook = null, shotCopCars = [];
function stageShot(name) {
  G.mode = 'play';
  if (name === 'start') {
    G.mode = 'title';
    return;
  }
  document.getElementById('screen-title').classList.add('hidden');
  showHud(true);
  G.god = true;
  if (name === 'chase') {
    const hero = liveCars.find(c => c.model.id === 'kestrel') || liveCars[0];
    hero.state = 'parked'; hero.x = 58; hero.z = 122; hero.heading = Math.PI; hero.speed = 31;
    hero.group.position.set(hero.x, 0, hero.z); hero.group.rotation.y = Math.PI;
    G.driving = true; G.playerCar = hero; hero.isPlayer = true;
    player.group.visible = false;
    setWanted(3); G.bounty = 2650; refreshBillboards(true);
    for (const [ox, oz] of [[46, 110], [70, 113]]) {
      const cop = createCar(scene, 'patrol', 0x18222e, ox, oz, Math.PI);
      cop.state = 'roadblock'; shotCopCars.push(cop);
    }
    setObjective('ONE LAST SCORE', 'GET HOME. Lose them at the garage.', '412 m');
    shotCamPos = new THREE.Vector3(38, 3.4, 96);
    shotCamLook = new THREE.Vector3(58, 4.2, 138);
  }
  if (name === 'harbor') {
    const truck = createCar(scene, 'hauler', 0x8c99a3, -36, 301, 2.5);
    truck.state = 'parked';
    player.x = -44; player.z = 294; player.heading = -2.2;
    player.group.position.set(-44, 0, 294); player.group.rotation.y = -2.2 + Math.PI;
    setWanted(2); G.bounty = 1400; refreshBillboards(true);
    setObjective('THE CONTAINER JOB', 'Steal the Hauler under the harbour cranes', '12 m');
    shotCamPos = new THREE.Vector3(-68, 2.6, 276);
    shotCamLook = new THREE.Vector3(-28, 3.6, 310);
  }
  if (name === 'street') {
    player.x = 2.5; player.z = 66; player.heading = 0.3;
    player.group.position.set(2.5, 0, 66); player.group.rotation.y = 0.3 + Math.PI;
    setObjective('GHOST RUN', 'Run the checkpoints — quiet and quick', '128 m');
    shotCamPos = new THREE.Vector3(-3.5, 2.0, 82);
    shotCamLook = new THREE.Vector3(4, 2.8, 28);
  }
}
function shotCamera(dt) {
  if (G.mode === 'title') { titleCamera(); return; }
  if (shotCamPos) {
    camera.position.copy(shotCamPos);
    camera.position.y += Math.sin(G.time * 0.5) * 0.15;
    camera.lookAt(shotCamLook);
    if (Math.abs(camera.fov - 58) > 0.1) { camera.fov = 58; camera.updateProjectionMatrix(); }
  }
  const focus = G.driving && G.playerCar ? G.playerCar : player;
  playerLight.position.set(focus.x, 4, focus.z);
  headlightRig.visible = G.driving;
  if (G.driving && G.playerCar) {
    headlightRig.position.set(G.playerCar.x, 0.25, G.playerCar.z);
    headlightRig.rotation.y = G.playerCar.heading;
  }
}
function updateShotLightbars() {
  for (const cop of shotCopCars) {
    const bar = cop.group.userData.lightbar;
    if (!bar) continue;
    const ph = Math.floor(G.time * 6 + cop.id) % 2;
    bar.children[0].visible = ph === 0;
    bar.children[1].visible = ph === 1;
  }
}
function drawShotHud() {
  updateHud(0, G.driving ? G.playerCar : null);
  const markers = [{ x: GARAGE.x, z: GARAGE.z, kind: 'safehouse' }];
  if (G.shot === 'chase') markers.push({ x: 96, z: 330, kind: 'mission' });
  if (G.shot === 'harbor') markers.push({ x: 766, z: -20, kind: 'mission' });
  const focus = G.driving && G.playerCar ? G.playerCar : player;
  const fakeCops = shotCopCars.map(c => ({ x: c.x, z: c.z }));
  drawMinimap(focus, focus.heading || 0, fakeCops, markers);
}

init();
