// missions.js — Ren Kade's story for Mama Ivo: an intro and eight jobs, from
// stealing back his Kestrel GT to the five-star harbour score, plus the
// repeatable street races and courier runs that keep the rain money coming.
// Missions are small stage machines over shared helpers (beacon, phone, timers).

import * as THREE from 'three';
import { G, setWanted, fmtMoney, clamp } from './state.js';
import { phone, toast, setObjective } from './hud.js';
import { createCar, liveCars } from './vehicles.js';
import { sfx } from './audio.js';
import { refreshBillboards } from './world.js';

export const GARAGE = { x: -196, z: 210 };
export const DINER = { x: 56, z: 234 };
let sceneRef = null, beacon = null, beaconRing = null;
let M = null;              // active mission runtime
let betweenT = -1;         // delay before the next story mission phones in
let racePost = null, courierPost = null;

const SAY = {
  intro: [
    { who: 'MAMA IVO', text: 'Ren Kade. Three years, and you still owe me a car, a favour, and an apology.' },
    { who: 'REN', text: 'I brought two of the three. The car is complicated.' },
    { who: 'MAMA IVO', text: 'Then un-complicate it. Come to the noodle bar on the quay. We talk, you drive, you eat free. Maybe.' },
  ],
};

export function initMissions(scene) {
  sceneRef = scene;
  const geo = new THREE.CylinderGeometry(2.3, 2.3, 34, 18, 1, true);
  beacon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0xffd94d, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false,
  }));
  beacon.visible = false; scene.add(beacon);
  beaconRing = new THREE.Mesh(new THREE.RingGeometry(2.5, 3.1, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  beaconRing.rotation.x = -Math.PI / 2; beaconRing.visible = false; scene.add(beaconRing);
  // side-activity posts: glowing pillars
  const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 3.4, 10);
  racePost = new THREE.Mesh(postGeo, new THREE.MeshBasicMaterial({ color: 0x37e0ff }));
  racePost.position.set(62, 1.7, 62); scene.add(racePost);
  courierPost = new THREE.Mesh(postGeo, new THREE.MeshBasicMaterial({ color: 0x7dff9a }));
  courierPost.position.set(50, 1.7, 234); scene.add(courierPost);
}

function setBeacon(x, z, color = 0xffd94d, y = 0) {
  beacon.visible = beaconRing.visible = true;
  beacon.position.set(x, y + 17, z);
  beaconRing.position.set(x, y + 0.25, z);
  beacon.material.color.setHex(color);
  beaconRing.material.color.setHex(color);
}
function hideBeacon() { beacon.visible = beaconRing.visible = false; }

function playerPos() {
  if (G.driving && G.playerCar) return G.playerCar;
  return G.playerPos;
}
function distTo(x, z) {
  const p = playerPos();
  return Math.hypot(p.x - x, p.z - z);
}
function reward(amount, label) {
  G.cash += amount;
  sfx.cash();
  toast('JOB DONE  +' + fmtMoney(amount), label || '');
  writeSaveSoon();
}
let saveHook = null;
export function onSaveRequest(fn) { saveHook = fn; }
function writeSaveSoon() { if (saveHook) saveHook(); }

function failMission(reason) {
  sfx.fail();
  toast('JOB FAILED', reason);
  phone([{ who: 'MAMA IVO', text: 'Sloppy, Ren. Shake it off and come see me when you are ready to work.' }]);
  if (M && M.cleanup) M.cleanup();
  M = null;
  G.wantedFloor = 0;
  betweenT = 6;
}

// ---------------------------------------------------------------------------
// The story. Each mission: start() sets its first stage; update(dt) advances.
// A stage is {text, update(dt) -> 'next'|'fail'|null}.
// ---------------------------------------------------------------------------
function missionShell(title, rewardAmt, stages, onDone) {
  return { title, rewardAmt, stages, i: 0, onDone, t: 0 };
}

const STORY = [
  { // 0 — meet Mama Ivo at the diner
    title: 'Family Business', reward: 0,
    build() {
      phone(SAY.intro);
      return missionShell('Family Business', 0, [
        { text: 'Meet Mama Ivo at the noodle bar on the quay', update: () => distTo(DINER.x, DINER.z) < 5 && !G.driving ? 'next' : null },
      ], () => phone([
        { who: 'MAMA IVO', text: 'Your old Kestrel GT. The crew that took it parks it by the Volta Tower garage row, like they own it.' },
        { who: 'MAMA IVO', text: 'Take it back. Bring it to your garage. And Ren — try not to scratch my city.' },
      ]));
    },
  },
  { // 1 — steal the Kestrel GT and bring it home
    title: 'Repossession', reward: 400,
    build() {
      const car = createCar(sceneRef, 'kestrel', 0xd8232f, 118, -50, Math.PI / 2);
      car.state = 'parked'; car.missionCar = true; liveCars.push(car);
      const shell = missionShell('Repossession', 400, [
        { text: 'Find your Kestrel GT (marked)', update: () => distTo(car.x, car.z) < 7 ? 'next' : null },
        { text: 'Steal the Kestrel GT — press E by the door', update: () => (G.driving && G.playerCar === car) ? 'next' : null },
        { text: 'Bring the Kestrel home to Kade\u2019s Garage', update: () => (G.driving && G.playerCar === car && distTo(GARAGE.x, GARAGE.z) < 9) ? 'next' : null },
      ], () => { car.missionCar = false; });
      shell.cleanup = () => { car.missionCar = false; };
      shell.target = () => (shell.i < 2 ? { x: car.x, z: car.z } : GARAGE);
      return shell;
    },
  },
  { // 2 — ghost run: package + timed checkpoints
    title: 'Ghost Run', reward: 650,
    build() {
      phone([{ who: 'MAMA IVO', text: 'A package waits at Harbor Freight. No questions, no lights, no noise. The route is already in your phone.' }]);
      const cps = [[-160, 262], [224, 10], [640, 0], [112, 112]];
      const shell = missionShell('Ghost Run', 650, [
        { text: 'Pick up the package at Harbor Freight', update: () => G.driving && distTo(-160, 254) < 10 ? 'next' : null },
        { text: 'Run the checkpoints — quiet and quick', timer: 165, update: (dt, st) => {
            const [cx, cz] = cps[st.cp || 0];
            if (distTo(cx, cz) < 13) { st.cp = (st.cp || 0) + 1; sfx.checkpoint(); if (st.cp >= cps.length) return 'next'; }
            return null;
          } },
      ]);
      shell.target = () => shell.i === 0 ? { x: -160, z: 254 } : { x: cps[shell.stages[1].cp || 0][0], z: cps[shell.stages[1].cp || 0][1] };
      return shell;
    },
  },
  { // 3 — heat check: earn 3 stars, then lose them (pistol unlock)
    title: 'Heat Check', reward: 800,
    build() {
      G.hasPistol = true;
      phone([
        { who: 'MAMA IVO', text: 'In the glovebox of your life there is now a pistol. Do not make me regret the metaphor.' },
        { who: 'MAMA IVO', text: 'The Patrol thinks you are rusty. Show them a little heat at the Volt Tower — then disappear. That is the job.' },
      ]);
      const shell = missionShell('Heat Check', 800, [
        { text: 'Make some noise at the Volt Tower plaza', update: () => distTo(28, -6) < 16 ? 'next' : null },
        { text: 'Lose the Harbor Patrol', start: () => setWanted(3), update: () => G.wanted === 0 ? 'next' : null },
      ]);
      shell.target = () => shell.i === 0 ? { x: 28, z: -6 } : null;
      return shell;
    },
  },
  { // 4 — harbor circuit race (unlocks street races)
    title: 'Harbor Circuit', reward: 900,
    build() {
      phone([{ who: 'MAMA IVO', text: 'The dock crews bet on wheels now. Six lights around the harbor and the bridge road. Beat the clock and their money is mine. Ours.' }]);
      const cps = [[112, 0], [224, 0], [420, 0], [566, 0], [224, 0], [-56, 112]];
      const shell = missionShell('Harbor Circuit', 900, [
        { text: 'Run the circuit before the clock dies', timer: 115, update: (dt, st) => {
            const [cx, cz] = cps[st.cp || 0];
            if (G.driving && distTo(cx, cz) < 14) { st.cp = (st.cp || 0) + 1; sfx.checkpoint(); if (st.cp >= cps.length) return 'next'; }
            return null;
          } },
      ]);
      shell.target = () => ({ x: cps[shell.stages[0].cp || 0][0], z: cps[shell.stages[0].cp || 0][1] });
      shell.onDoneExtra = () => { G.racesUnlocked = true; toast('SIDE WORK UNLOCKED', 'Street races — cyan posts on the map'); };
      return shell;
    },
  },
  { // 5 — bridge toll: fetch a passenger from the far shore
    title: 'Bridge Toll', reward: 1100,
    build() {
      phone([{ who: 'MAMA IVO', text: 'A friend of the family waits at Pier 9 Storage, far shore. Bring her to the Hotel Mirage. The bridge patrol has been… attentive. Improvise.' }]);
      const shell = missionShell('Bridge Toll', 1100, [
        { text: 'Cross the bridge — collect the passenger at Pier 9 Storage', update: () => distTo(766, 14) < 10 ? 'next' : null },
        { text: 'Take her to the Hotel Mirage (north-east)', start: () => {
            phone([{ who: 'PASSENGER', text: 'You are late, and the Patrol just woke up. Drive, handsome.' }]);
            if (G.wanted < 2) setWanted(2);
          }, update: () => distTo(172, -172) < 10 ? 'next' : null },
      ]);
      shell.target = () => shell.i === 0 ? { x: 766, z: 14 } : { x: 172, z: -172 };
      return shell;
    },
  },
  { // 6 — the container job: steal the Hauler, cross the city under a floor of 2
    title: 'The Container Job', reward: 1600,
    build() {
      phone([{ who: 'MAMA IVO', text: 'One container. Wrong paperwork, right money. The Hauler is parked under the middle crane. Take it to Pier 9 Storage and do not stop for anyone.' }]);
      const truck = createCar(sceneRef, 'hauler', 0x8c99a3, 30, 306, 0);
      truck.state = 'parked'; truck.missionCar = true; liveCars.push(truck);
      const shell = missionShell('The Container Job', 1600, [
        { text: 'Steal the Hauler under the harbour cranes', update: () => (G.driving && G.playerCar === truck) ? 'next' : null },
        { text: 'Deliver the Hauler to Pier 9 Storage (far shore)', start: () => { G.wantedFloor = 2; if (G.wanted < 2) setWanted(2); },
          update: () => (G.driving && G.playerCar === truck && distTo(766, -20) < 13) ? 'next' : null },
      ], () => { truck.missionCar = false; G.wantedFloor = 0; });
      shell.cleanup = () => { truck.missionCar = false; G.wantedFloor = 0; };
      shell.target = () => shell.i === 0 ? { x: truck.x, z: truck.z } : { x: 766, z: -20 };
      return shell;
    },
  },
  { // 7 — finale: the big score and the five-star run home
    title: 'One Last Score', reward: 4000,
    build() {
      phone([
        { who: 'MAMA IVO', text: 'Tonight the armored crew counts the harbor\u2019s money on the east pier. All of it, Ren. One bag, one drive, and we are both ghosts.' },
        { who: 'REN', text: 'And if the whole city comes?' },
        { who: 'MAMA IVO', text: 'Then smile for the billboards, baby. They already have your picture.' },
      ]);
      const shell = missionShell('One Last Score', 4000, [
        { text: 'Reach the east pier before the count ends', timer: 120, update: () => distTo(96, 330) < 9 && !G.driving ? 'next' : null },
        { text: 'Grab the score — stay in the circle', hold: 8, update: (dt, st) => {
            if (distTo(96, 330) < 9 && !G.driving) { st.held = (st.held || 0) + dt; if (st.held >= 8) return 'next'; }
            else st.held = Math.max(0, (st.held || 0) - dt * 2);
            return null;
          } },
        { text: 'GET HOME. Lose them at the garage.', start: () => { setWanted(5); G.wantedFloor = 5; sfx.alarm(); },
          update: () => {
            if (distTo(GARAGE.x, GARAGE.z) < 11) { G.wantedFloor = 0; return 'next'; }
            return null;
          } },
        { text: 'Lie low in the garage until the heat dies', update: () => G.wanted === 0 ? 'next' : null },
      ], () => {
        phone([
          { who: 'MAMA IVO', text: 'It is done. The rain washes the harbor, the billboards go back to selling cola, and Ren Kade is a rumor again.' },
          { who: 'MAMA IVO', text: 'The city is yours now, baby. Drive it gentle. Or don\u2019t — I get a cut either way.' },
        ]);
        toast('STORY COMPLETE', 'Free roam — races and courier work stay on the map');
      });
      shell.target = () => shell.i < 2 ? { x: 96, z: 330 } : GARAGE;
      shell.cleanup = () => { G.wantedFloor = 0; };
      return shell;
    },
  },
];

export function startStoryMission(i) {
  if (i >= STORY.length) { M = null; return; }
  const def = STORY[i];
  M = def.build();
  M.defTitle = def.title;
  if (M.stages[0].start) M.stages[0].start();
  toast('NEW JOB — ' + def.title.toUpperCase(), i === 0 ? 'Follow the gold diamond' : '');
  sfx.phone();
}

export function missionActive() { return !!M; }
export function currentTarget() {
  if (M && M.target) return M.target();
  if (M) {
    const st = M.stages[M.i];
    if (st && st.x !== undefined) return { x: st.x, z: st.z };
  }
  if (G.activity && G.activity.target) return G.activity.target;
  return null;
}

// ---------------------------------------------------------------------------
// Side activities
// ---------------------------------------------------------------------------
const RACE_CPS = [[112, 0], [224, 0], [420, 0], [566, 0], [420, 0], [112, 112], [56, 62]];
const COURIER_SPOTS = [[-168, -168], [168, 168], [-56, -196], [196, 56], [712, -74], [638, 74], [-112, 252], [89, 300], [28, -120]];
export function tryActivityInteract() {
  const p = G.playerPos;
  if (G.driving) return false;
  if (Math.hypot(p.x - 62, p.z - 62) < 3.4 && G.racesUnlocked && !G.activity) {
    G.activity = { kind: 'race', cp: 0, t: 0, target: { x: RACE_CPS[0][0], z: RACE_CPS[0][1] } };
    toast('STREET RACE', 'Beat 1:40 for the purse — follow the cyan checkpoints');
    sfx.checkpoint();
    return true;
  }
  if (Math.hypot(p.x - 50, p.z - 234) < 3.4 && !G.activity) {
    const [x, z] = COURIER_SPOTS[Math.floor(Math.random() * COURIER_SPOTS.length)];
    const d = Math.hypot(x - p.x, z - p.z);
    G.activity = { kind: 'courier', t: 0, limit: Math.round(d / 9) + 25, target: { x, z }, pay: 250 + Math.round(d / 3) };
    toast('COURIER RUN', 'Deliver before the clock dies — ' + fmtMoney(G.activity.pay));
    sfx.checkpoint();
    return true;
  }
  return false;
}

function updateActivity(dt) {
  const a = G.activity;
  if (!a) return;
  a.t += dt;
  if (a.kind === 'race') {
    const [cx, cz] = RACE_CPS[a.cp];
    setBeacon(cx, cz, 0x37e0ff);
    setObjective('STREET RACE', 'Checkpoint ' + (a.cp + 1) + ' of ' + RACE_CPS.length, 'Time ' + a.t.toFixed(1) + 's · purse under 1:40');
    if (G.driving && distTo(cx, cz) < 14) {
      a.cp++; sfx.checkpoint();
      if (a.cp >= RACE_CPS.length) {
        const ms = Math.round(a.t * 1000);
        if (!G.bestRaceMs || ms < G.bestRaceMs) G.bestRaceMs = ms;
        if (a.t < 100) { G.cash += 500; G.stats.racesWon++; toast('RACE WON  +$500', 'Time ' + a.t.toFixed(1) + 's — the dock crews pay up'); sfx.cash(); }
        else toast('RACE FINISHED', 'Time ' + a.t.toFixed(1) + 's — too slow for the purse');
        G.activity = null; writeSaveSoon();
        return;
      }
      a.target = { x: RACE_CPS[a.cp][0], z: RACE_CPS[a.cp][1] };
    }
  } else if (a.kind === 'courier') {
    setBeacon(a.target.x, a.target.z, 0x7dff9a);
    const left = a.limit - a.t;
    setObjective('COURIER RUN', 'Deliver the package', left > 0 ? Math.ceil(left) + 's left · ' + Math.round(distTo(a.target.x, a.target.z)) + ' m' : 'LATE');
    if (left <= 0) { toast('DELIVERY FAILED', 'Too slow — the client walked'); sfx.fail(); G.activity = null; return; }
    if (distTo(a.target.x, a.target.z) < 8) {
      G.cash += a.pay; G.stats.deliveries++;
      toast('DELIVERED  +' + fmtMoney(a.pay), 'The rain keeps no receipts');
      sfx.cash(); G.activity = null; writeSaveSoon();
    }
  }
}

// ---------------------------------------------------------------------------
export function updateMissions(dt) {
  // safehouse drain flag (the garage mouth)
  G.hideoutDrain = Math.hypot(playerPos().x - GARAGE.x, playerPos().z - GARAGE.z) < 12;
  if (G.activity) { updateActivity(dt); return; }
  if (!M) {
    hideBeacon();
    if (G.missionIndex >= STORY.length) setObjective('FREE ROAM', 'The harbor is yours — races and courier work glow on the map', '');
    else setObjective('', '', '');
    if (betweenT > 0) {
      betweenT -= dt;
      if (betweenT <= 0 && G.missionIndex < STORY.length) startStoryMission(G.missionIndex);
    }
    return;
  }
  const st = M.stages[M.i];
  const tgt = currentTarget();
  if (tgt) setBeacon(tgt.x, tgt.z, 0xffd94d); else hideBeacon();
  let distText = tgt ? Math.round(distTo(tgt.x, tgt.z)) + ' m' : '';
  if (st.timer !== undefined) {
    st.left = (st.left === undefined ? st.timer : st.left) - dt;
    distText += (distText ? ' · ' : '') + Math.max(0, Math.ceil(st.left)) + 's';
    if (st.left <= 0) { failMission('Out of time.'); return; }
  }
  if (st.hold) distText = 'Holding… ' + Math.floor(((st.held || 0) / st.hold) * 100) + '%';
  setObjective(M.defTitle.toUpperCase(), st.text, distText);
  const r = st.update ? st.update(dt, st) : null;
  if (r === 'fail') { failMission('It went sideways.'); return; }
  if (r === 'next') {
    M.i++;
    if (M.i >= M.stages.length) {
      const amt = M.rewardAmt;
      const done = M.onDone, extra = M.onDoneExtra;
      M = null;
      G.missionIndex++;
      if (amt > 0) reward(amt, 'From Mama Ivo, with love');
      if (done) done();
      if (extra) extra();
      refreshBillboards(true);
      writeSaveSoon();
      if (G.missionIndex < STORY.length) betweenT = 5;
    } else if (M.stages[M.i].start) M.stages[M.i].start();
  }
}

export function beginStory() {
  if (G.missionIndex < STORY.length && !M) startStoryMission(G.missionIndex);
}
