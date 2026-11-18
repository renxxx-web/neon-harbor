// world.js — builds NEON HARBOR itself: the 8x8 neon grid, the harbour district
// with its container yards, cranes, ships and lighthouse, the bridge to the far
// shore, the rain, and the electronic billboards that turn on the player.
// Also owns the collision data (AABBs + a land mask) every mover consults.

import * as THREE from 'three';
import { WORLD, G, rand, randi, pick, clamp } from './state.js';

export const colliders = [];   // {minX,maxX,minZ,maxZ}
export const billboards = [];  // {canvas, ctx, tex, adIndex, mode}
const flashers = [];           // emissive materials that pulse (precinct lights)
let rain, rainPos, splashes, splashPos, lightningT = 12, sceneRef = null;
let ambientLight = null, moonLight = null;

function addCollider(x, z, w, d) {
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}

// resolve a circle (x,z,r) against every AABB; returns corrected [x,z]
export function collideCircle(x, z, r) {
  for (const c of colliders) {
    const nx = clamp(x, c.minX, c.maxX), nz = clamp(z, c.minZ, c.maxZ);
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; z = nz + (dz / d) * r;
      } else {
        const l = x - c.minX, rt = c.maxX - x, tp = z - c.minZ, bt = c.maxZ - z;
        const m = Math.min(l, rt, tp, bt);
        if (m === l) x = c.minX - r; else if (m === rt) x = c.maxX + r;
        else if (m === tp) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  return [x, z];
}

export function landAt(x, z) {
  if (x >= -242 && x <= 242 && z >= -242 && z <= 256) return true;             // main island
  if (x >= -146 && x <= -96 && z > 256 && z <= 396) return true;               // west pier
  if (x >= 64 && x <= 114 && z > 256 && z <= 396) return true;                 // east pier
  if (x > 242 && x < WORLD.shoreX0 && Math.abs(z) <= 11) return true;          // bridge
  if (x >= WORLD.shoreX0 && x <= 858 && Math.abs(z) <= 172) return true;       // far shore
  return false;
}

export function groundY(x, z) {
  if (x > WORLD.bridgeX0 && x < WORLD.shoreX0 && Math.abs(z) <= 11) {
    const t = (x - WORLD.bridgeX0) / (WORLD.shoreX0 - WORLD.bridgeX0);
    return WORLD.bridgeDeckY * (0.5 - 0.5 * Math.cos(2 * Math.PI * t));
  }
  return 0;
}

// --- canvas texture helpers ---------------------------------------------------
function makeTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(base, litRatio, hueShift) {
  return makeTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 14, cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = Math.random() < litRatio;
      const warm = Math.random() < 0.7;
      g.fillStyle = lit ? (warm ? '#ffd9a0' : '#bfe6ff') : 'rgba(10,16,26,0.9)';
      if (hueShift && lit) g.fillStyle = hueShift;
      g.fillRect(x * cw + 2, y * ch + 3, cw - 4, ch - 6);
    }
  });
}

const BRANDS = [
  { name: 'VOLT COLA', sub: 'TASTE THE CURRENT', color: '#37e0ff', bg: '#07182b' },
  { name: 'NOODLE-9', sub: 'OPEN ALL NIGHT', color: '#ff5da2', bg: '#220a1a' },
  { name: 'HOTEL MIRAGE', sub: 'ROOMS BY THE HOUR', color: '#ffd94d', bg: '#1d1604' },
  { name: 'KAIJU RAMEN', sub: 'MONSTER FLAVOUR', color: '#7dff9a', bg: '#06230f' },
  { name: 'PULSE CLUB', sub: 'BASS · SWEAT · NEON', color: '#c792ff', bg: '#170b2e' },
  { name: 'OCTANE FUEL', sub: 'DRIVE FURTHER', color: '#ff9a3d', bg: '#241103' },
  { name: 'LUMEN PAWN', sub: 'WE BUY ANYTHING', color: '#8fd0ff', bg: '#0a1420' },
  { name: 'SAINT-9 CARE', sub: 'OPEN 24 HOURS', color: '#ff8fa3', bg: '#26060d' },
];

function drawAd(g, w, h, brand) {
  g.fillStyle = brand.bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = brand.color; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = brand.color; g.textAlign = 'center';
  g.shadowColor = brand.color; g.shadowBlur = 26;
  g.font = '900 64px Arial'; g.fillText(brand.name, w / 2, h / 2 + 4);
  g.shadowBlur = 10; g.font = '700 26px Arial';
  g.fillText(brand.sub, w / 2, h / 2 + 52);
  g.shadowBlur = 0;
}

function drawWanted(g, w, h) {
  g.fillStyle = '#16040a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ff2e4d'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
  // portrait silhouette
  g.fillStyle = '#0a0a12';
  g.beginPath(); g.arc(110, 96, 42, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(38, 226); g.quadraticCurveTo(110, 128, 182, 226); g.closePath(); g.fill();
  g.strokeStyle = '#ff2e4d'; g.lineWidth = 3;
  g.beginPath(); g.arc(110, 96, 42, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ff2e4d'; g.textAlign = 'left';
  g.shadowColor = '#ff2e4d'; g.shadowBlur = 22;
  g.font = '900 74px Arial'; g.fillText('WANTED', 176, 92);
  g.shadowBlur = 0; g.fillStyle = '#ffd9de'; g.font = '700 30px Arial';
  g.fillText('REN KADE — GETAWAY DRIVER', 178, 138);
  g.fillStyle = '#ffd94d'; g.font = '900 44px Arial';
  g.fillText('BOUNTY ' + '$' + Math.round(G.bounty).toLocaleString('en-US'), 178, 192);
  g.fillStyle = '#8fa8c8'; g.font = '600 20px Arial';
  g.fillText('HARBOR PATROL · REPORT ALL SIGHTINGS', 178, 224);
}

// billboards switch to the WANTED poster at 2+ stars, and the bounty is live
export function refreshBillboards(force = false) {
  const wantMode = G.wanted >= 2 ? 'wanted' : 'ads';
  for (const b of billboards) {
    if (!force && b.mode === wantMode && wantMode === 'ads') continue;
    if (!force && b.mode === wantMode && wantMode === 'wanted' && b.lastBounty === G.bounty) continue;
    if (wantMode === 'wanted') drawWanted(b.ctx, b.canvas.width, b.canvas.height);
    else drawAd(b.ctx, b.canvas.width, b.canvas.height, BRANDS[b.adIndex % BRANDS.length]);
    b.mode = wantMode; b.lastBounty = G.bounty;
    b.tex.needsUpdate = true;
  }
}

// --- merged-geometry helper (keeps the draw-call count low) -------------------
function mergeBoxes(list) {
  // list: {w,h,d,x,y,z,color,uvScale}
  let total = 0;
  const geos = list.map(b => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    const uv = g.attributes.uv;
    const s = b.uvScale || 1;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
    g.translate(b.x, b.y, b.z);
    total += g.attributes.position.count;
    return { g, color: new THREE.Color(b.color) };
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const uvA = new Float32Array(total * 2), col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, color } of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uvA.set(g.attributes.uv.array, o * 2);
    for (let i = 0; i < n; i++) { col[(o + i) * 3] = color.r; col[(o + i) * 3 + 1] = color.g; col[(o + i) * 3 + 2] = color.b; }
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// --- the build ------------------------------------------------------------------
export function buildWorld(scene) {
  sceneRef = scene;
  scene.fog = new THREE.FogExp2(0x070d18, 0.0028);
  ambientLight = new THREE.AmbientLight(0x4a5f8a, 1.6); scene.add(ambientLight);
  const hemi = new THREE.HemisphereLight(0x39527a, 0x0c0e14, 1.05); scene.add(hemi);
  moonLight = new THREE.DirectionalLight(0x8fb4ff, 0.8);
  moonLight.position.set(-120, 220, -80); scene.add(moonLight);

  const roadTex = makeTex(128, 128, (g, w, h) => {
    g.fillStyle = '#1d232e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1f28'; for (let i = 0; i < 260; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#c8d4e2'; g.fillRect(2, 0, 3, h); g.fillRect(w - 5, 0, 3, h);
    g.fillStyle = '#ffd94d'; g.fillRect(w / 2 - 2, 8, 4, 44); // one dash per tile
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;

  // base ground + water
  const base = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ color: 0x05070b }));
  base.rotation.x = -Math.PI / 2; base.position.y = -0.55; scene.add(base);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshPhongMaterial({ color: 0x0a1a2c, specular: 0x3a6ea8, shininess: 90 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.45; scene.add(water);

  const island = new THREE.Mesh(new THREE.BoxGeometry(484, 1, 500),
    new THREE.MeshLambertMaterial({ color: 0x151a21 }));
  island.position.set(0, -0.5, 6); scene.add(island);
  const shore = new THREE.Mesh(new THREE.BoxGeometry(292, 1, 344),
    new THREE.MeshLambertMaterial({ color: 0x141920 }));
  shore.position.set(712, -0.5, 0); scene.add(shore);

  // roads: strips along every grid line, both districts, plus the quay road
  const roadMat = new THREE.MeshPhongMaterial({ map: roadTex, specular: 0x5a7ba6, shininess: 70 });
  function roadStrip(x, z, len, horiz, rep) {
    const t = roadTex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(horiz ? rep : 1, horiz ? 1 : rep);
    if (!horiz) t.rotation = Math.PI / 2, t.center.set(0.5, 0.5);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(horiz ? len : WORLD.road, horiz ? WORLD.road : len),
      new THREE.MeshPhongMaterial({ map: t, specular: 0x5a7ba6, shininess: 70 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); scene.add(m);
  }
  for (const x of WORLD.roadLines) roadStrip(x, 6, 492, false, 30);
  for (const z of WORLD.roadLines) roadStrip(0, z, 468, true, 30);
  roadStrip(0, 238, 468, true, 30);                                  // quay road
  for (const x of [638, 712, 786]) roadStrip(x, 0, 330, false, 20);  // far shore
  for (const z of [-74, 0, 74]) roadStrip(712, z, 280, true, 18);

  // city blocks: sidewalk slab + buildings (merged, three window styles)
  const winTexA = windowTexture('#1b2432', 0.42), winTexB = windowTexture('#241d2b', 0.34);
  const winTexC = windowTexture('#14231f', 0.5);
  const slabGeo = [];
  const boxesA = [], boxesB = [], boxesC = [];
  const special = [
    { x: -196, z: 196, kind: 'garage' }, { x: 196, z: -196, kind: 'precinct' },
    { x: -196, z: -196, kind: 'hospital' }, { x: 28, z: -28, kind: 'tower' },
  ];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const cx = WORLD.gridMin + i * WORLD.pitch, cz = WORLD.gridMin + j * WORLD.pitch;
    slabGeo.push({ w: 47, h: 0.3, d: 47, x: cx, y: 0.15, z: cz, color: 0x272f3a });
    const sp = special.find(s => s.x === cx && s.z === cz);
    if (sp) continue;
    const n = randi(1, 3);
    for (let k = 0; k < n; k++) {
      const w = rand(13, 20), d = rand(13, 20), h = rand(16, 62);
      const bx = cx + rand(-11, 11), bz = cz + rand(-11, 11);
      const arr = pick([boxesA, boxesB, boxesC]);
      arr.push({ w, h, d, x: bx, y: h / 2 + 0.3, z: bz, color: 0xffffff, uvScale: Math.max(w, h) / 13 });
      addCollider(bx, bz, w + 1, d + 1);
    }
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {  // far-shore blocks
    const cx = 638 + i * 74, cz = -74 + j * 74;
    slabGeo.push({ w: 56, h: 0.3, d: 56, x: cx, y: 0.15, z: cz, color: 0x242c36 });
    if (i === 2 && j === 1) continue; // warehouse plot, built below
    const h = rand(12, 34), w = rand(20, 30), d = rand(20, 30);
    pick([boxesA, boxesB, boxesC]).push({ w, h, d, x: cx, y: h / 2 + 0.3, z: cz, color: 0xffffff, uvScale: 2 });
    addCollider(cx, cz, w + 1, d + 1);
  }
  const slabMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(mergeBoxes(slabGeo), slabMat));
  for (const [boxes, tex] of [[boxesA, winTexA], [boxesB, winTexB], [boxesC, winTexC]]) {
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.8, vertexColors: true });
    scene.add(new THREE.Mesh(mergeBoxes(boxes), mat));
  }

  buildSpecialBuildings(scene);
  buildSignsAndLights(scene);
  buildBillboards(scene);
  buildHarbor(scene);
  buildBridge(scene);
  buildRain(scene);
}

function signMesh(text, sub, color, bg, w = 256, h = 96) {
  const tex = makeTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.textAlign = 'center';
    g.shadowColor = color; g.shadowBlur = 16;
    g.font = '900 40px Arial'; g.fillText(text, w / 2, sub ? 44 : 60);
    if (sub) { g.font = '700 20px Arial'; g.fillText(sub, w / 2, 76); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.1),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  return m;
}

function buildSpecialBuildings(scene) {
  const wall = new THREE.MeshLambertMaterial({ color: 0x2b3442 });
  function block(x, z, w, h, d, mat = wall) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z); scene.add(m); addCollider(x, z, w + 1, d + 1); return m;
  }
  // Kade's Garage — the safehouse (SW). Open-front look: dark mouth + sign.
  block(-196, 190, 34, 10, 12);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(24, 7),
    new THREE.MeshBasicMaterial({ color: 0x05070c }));
  mouth.position.set(-196, 3.5, 196.2); mouth.rotation.y = Math.PI; scene.add(mouth);
  const gs = signMesh("KADE'S GARAGE", 'SAFEHOUSE · WE FIX, YOU RUN', '#37e0ff', '#07182b');
  gs.position.set(-196, 9.2, 196.4); gs.rotation.y = Math.PI; scene.add(gs);
  // Harbor Patrol HQ (NE) with flashing light bar
  block(196, -190, 34, 14, 12, new THREE.MeshLambertMaterial({ color: 0x2e3d55 }));
  const ps = signMesh('HARBOR PATROL', 'PRECINCT 9', '#8fd0ff', '#0a1420');
  ps.position.set(196, 12.4, -196.4); scene.add(ps);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xff2244 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(10, 0.7, 1.2), barMat);
  bar.position.set(196, 14.6, -190); scene.add(bar);
  flashers.push({ mat: barMat, ph: 0 });
  // Saint-9 General hospital (NW)
  block(-196, -190, 34, 16, 12, new THREE.MeshLambertMaterial({ color: 0x9fb2c4 }));
  const hs = signMesh('SAINT-9 GENERAL', 'EMERGENCY · 24H', '#ff8fa3', '#26060d');
  hs.position.set(-196, 13.5, -196.4); scene.add(hs);
  // the Volt Tower (centre) — tallest thing in the city
  const towerTexC = windowTexture('#1a2436', 0.5);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(24, 96, 24),
    new THREE.MeshLambertMaterial({ map: towerTexC, emissive: 0xffffff, emissiveMap: towerTexC, emissiveIntensity: 0.6 }));
  tower.position.set(28, 48, -28); scene.add(tower); addCollider(28, -28, 25, 25);
  const ts = signMesh('VOLT', 'TOWER', '#37e0ff', '#07182b');
  ts.position.set(28, 88, -15.8); scene.add(ts);
  // far-shore warehouse (heist + finale ground)
  block(786, 0, 44, 13, 56, new THREE.MeshLambertMaterial({ color: 0x3a3230 }));
  const ws = signMesh('PIER 9 STORAGE', 'AUTHORISED CREWS ONLY', '#ffd94d', '#1d1604');
  ws.position.set(763.8, 10.5, 0); ws.rotation.y = -Math.PI / 2; scene.add(ws);
}

function buildSignsAndLights(scene) {
  // neon shop signs on street-facing corners + wet-glow smears beneath them
  const glowTex = makeTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const spots = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    if (Math.random() < 0.45) continue;
    const cx = WORLD.gridMin + i * WORLD.pitch + 24.5, cz = WORLD.gridMin + j * WORLD.pitch + rand(-14, 14);
    spots.push([cx, cz, Math.PI / 2]);
    const cx2 = WORLD.gridMin + i * WORLD.pitch + rand(-14, 14), cz2 = WORLD.gridMin + j * WORLD.pitch + 24.5;
    spots.push([cx2, cz2, 0]);
  }
  spots.slice(0, 34).forEach(([x, z, ry], idx) => {
    const b = BRANDS[idx % BRANDS.length];
    const s = signMesh(b.name, b.sub, b.color, b.bg);
    s.position.set(x, rand(4.5, 7.5), z); s.rotation.y = ry + (idx % 2 ? 0 : Math.PI);
    if (ry === 0) s.position.z = z; scene.add(s);
    const smear = new THREE.Mesh(new THREE.PlaneGeometry(13, 7),
      new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(b.color), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    smear.rotation.x = -Math.PI / 2;
    smear.position.set(x + (ry ? 3.4 : 0), 0.06, z + (ry ? 0 : 3.4)); scene.add(smear);
  });
  // streetlights: merged poles + additive glow sprites
  const poles = [];
  for (const x of WORLD.roadLines) for (let z = -224; z <= 224; z += 56) poles.push({ w: 0.35, h: 6.4, d: 0.35, x: x + 6, y: 3.2, z: z + 20, color: 0x39424f });
  for (let x = 260; x < 560; x += 48) { poles.push({ w: 0.35, h: 7, d: 0.35, x, y: 3.5 + groundY(x, 0), z: -8.6, color: 0x39424f }); poles.push({ w: 0.35, h: 7, d: 0.35, x, y: 3.5 + groundY(x, 0), z: 8.6, color: 0x39424f }); }
  scene.add(new THREE.Mesh(mergeBoxes(poles), new THREE.MeshLambertMaterial({ vertexColors: true })));
  const sm = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc37d, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const p of poles) {
    if (Math.random() < 0.25) continue;
    const sp = new THREE.Sprite(sm); sp.scale.set(9, 9, 1);
    sp.position.set(p.x, p.y + 3.4, p.z); scene.add(sp);
  }
}

function buildBillboards(scene) {
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x232a34 });
  const spots = [
    [-84, -140, 0], [112, -56, Math.PI], [-168, 56, Math.PI / 2], [56, 140, Math.PI],
    [168, 168, Math.PI * 0.75], [-28, -224, 0], [420, -13, -Math.PI / 2], [712, -120, Math.PI],
  ];
  spots.forEach(([x, z, ry], i) => {
    const gy = groundY(x, z);
    const grp = new THREE.Group(); grp.position.set(x, gy, z); grp.rotation.y = ry;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(1.1, 15, 1.1), frameMat);
    pole.position.y = 7.5; grp.add(pole);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    drawAd(ctx, 512, 256, BRANDS[i % BRANDS.length]);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(17, 8.5),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    panel.position.y = 17; grp.add(panel);
    const back = new THREE.Mesh(new THREE.BoxGeometry(17.4, 8.9, 0.4), frameMat);
    back.position.y = 17; back.position.z = -0.25; grp.add(back);
    scene.add(grp);
    billboards.push({ canvas, ctx, tex, adIndex: i, mode: 'ads', lastBounty: -1 });
    addCollider(x, z, 1.6, 1.6);
  });
}

function buildHarbor(scene) {
  const concrete = new THREE.MeshLambertMaterial({ color: 0x272f3a });
  const quay = new THREE.Mesh(new THREE.BoxGeometry(484, 1.2, 148), concrete);
  quay.position.set(0, -0.55, 326); scene.add(quay);
  for (const [fx, fz] of [[-120, 300], [30, 302], [170, 300]]) {
    const fl = new THREE.PointLight(0xffd9a0, 1500, 100, 1.9);
    fl.position.set(fx, 21, fz); scene.add(fl);
    const lampBox = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 1), new THREE.MeshBasicMaterial({ color: 0xffe9bb }));
    lampBox.position.set(fx, 20.4, fz); scene.add(lampBox);
    const glowT = makeTex(64, 64, (g2) => {
      const gr = g2.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,233,187,0.8)'); gr.addColorStop(1, 'rgba(255,233,187,0)');
      g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
    });
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    spr.scale.set(17, 17, 1); spr.position.set(fx, 20.2, fz); scene.add(spr);
  }
  // container yards: merged stacks of shipping boxes in harbour colours
  const contCols = [0xb3402e, 0x2e6db3, 0x2ea36b, 0xc7a23a, 0x707880, 0x7a3a8c];
  const conts = [];
  const yardSpots = [[-190, 285], [-120, 300], [-40, 282], [40, 300], [130, 285], [196, 305], [-70, 330], [90, 335]];
  for (const [x, z] of yardSpots) {
    const rows = randi(2, 4);
    for (let r = 0; r < rows; r++) for (let s = 0; s < randi(1, 3); s++) {
      conts.push({ w: 12, h: 2.6, d: 2.6, x: x + rand(-4, 4), y: 1.3 + s * 2.6, z: z + r * 3.4, color: pick(contCols) });
    }
    addCollider(x, z + 3, 15, rows * 3.4 + 3);
  }
  scene.add(new THREE.Mesh(mergeBoxes(conts), new THREE.MeshLambertMaterial({ vertexColors: true })));
  // dock warehouses on the quay
  for (const [x, z] of [[-160, 262], [150, 262]]) {
    const wh = new THREE.Mesh(new THREE.BoxGeometry(52, 11, 16), new THREE.MeshLambertMaterial({ color: 0x33302c }));
    wh.position.set(x, 5.5, z); scene.add(wh); addCollider(x, z, 53, 17);
    const s = signMesh('HARBOR FREIGHT', 'PIERS 4–9 · NO IDLING', '#ffd94d', '#1d1604');
    s.position.set(x, 8.6, z - 8.3); s.rotation.y = Math.PI; scene.add(s);
  }
  // portal cranes
  const craneMat = new THREE.MeshLambertMaterial({ color: 0x8c4a1f });
  for (const x of [-120, 30, 170]) {
    const parts = [];
    for (const dx of [-9, 9]) for (const dz of [-5, 5]) parts.push({ w: 1, h: 24, d: 1, x: x + dx, y: 12, z: 292 + dz, color: 0x8c4a1f });
    parts.push({ w: 26, h: 1.4, d: 1.4, x, y: 24, z: 292, color: 0x8c4a1f });
    parts.push({ w: 1.2, h: 1.2, d: 26, x, y: 23, z: 292 + 8, color: 0xa85f27 });
    parts.push({ w: 0.3, h: 10, d: 0.3, x, y: 17, z: 300, color: 0x555f6b });
    parts.push({ w: 12, h: 2.6, d: 2.6, x, y: 11.4, z: 300, color: pick(contCols) });
    scene.add(new THREE.Mesh(mergeBoxes(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
    addCollider(x - 9, 292, 2.5, 12); addCollider(x + 9, 292, 2.5, 12);
  }
  // piers + docked ships
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x232a33 });
  for (const px of [-121, 89]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(46, 1.2, 140), pierMat);
    pier.position.set(px, -0.5, 326); scene.add(pier);
  }
  function ship(x, z, ry, name) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(17, 6, 74), new THREE.MeshLambertMaterial({ color: 0x27313d }));
    hull.position.y = 1.2; grp.add(hull);
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 6, 3, 1), new THREE.MeshLambertMaterial({ color: 0x27313d }));
    bow.position.set(0, 1.2, -43); bow.rotation.y = Math.PI; grp.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(15, 1, 66), new THREE.MeshLambertMaterial({ color: 0x39434f }));
    deck.position.y = 4.6; grp.add(deck);
    const castle = new THREE.Mesh(new THREE.BoxGeometry(13, 10, 10), new THREE.MeshLambertMaterial({ color: 0xb9c6d4 }));
    castle.position.set(0, 9.5, 26); grp.add(castle);
    const stack = [];
    for (let i = 0; i < 8; i++) stack.push({ w: 12, h: 2.6, d: 2.6, x: 0, y: 6.6 + (i > 3 ? 2.6 : 0), z: -24 + (i % 4) * 9, color: pick(contCols) });
    const cm = new THREE.Mesh(mergeBoxes(stack), new THREE.MeshLambertMaterial({ vertexColors: true }));
    grp.add(cm);
    const s = signMesh(name, 'NEON HARBOR LINES', '#aee6ff', '#0a1420', 512, 96);
    s.scale.set(2.6, 1, 1); s.position.set(8.7, 3.4, 0); s.rotation.y = Math.PI / 2; grp.add(s);
    scene.add(grp);
    addCollider(x, z, 20, 84);
  }
  ship(-160, 330, 0, 'MV KESTREL');
  ship(140, 336, 0.04, 'MV HARBORLIGHT');
  // lighthouse on the breakwater
  const lh = new THREE.Group(); lh.position.set(252, 0, 428);
  const bands = [];
  for (let i = 0; i < 5; i++) bands.push({ w: 6 - i * 0.7, h: 4.4, d: 6 - i * 0.7, x: 0, y: 2.2 + i * 4.4, z: 0, color: i % 2 ? 0xd8dee6 : 0xc23b4e });
  lh.add(new THREE.Mesh(mergeBoxes(bands), new THREE.MeshLambertMaterial({ vertexColors: true })));
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), lampMat);
  lamp.position.y = 24.5; lh.add(lamp);
  flashers.push({ mat: lampMat, ph: 2, slow: true });
  scene.add(lh);
}

function buildBridge(scene) {
  const deckMat = new THREE.MeshPhongMaterial({ color: 0x171c24, specular: 0x5a7ba6, shininess: 60 });
  const railMat = new THREE.MeshLambertMaterial({ color: 0x39424f });
  const segs = 14;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs, tm = (t0 + t1) / 2;
    const x0 = WORLD.bridgeX0 + t0 * (WORLD.shoreX0 - WORLD.bridgeX0);
    const x1 = WORLD.bridgeX0 + t1 * (WORLD.shoreX0 - WORLD.bridgeX0);
    const ym = groundY((x0 + x1) / 2, 0);
    const segLen = Math.hypot(x1 - x0, groundY(x1, 0) - groundY(x0, 0)) + 0.4;
    const ang = Math.atan2(groundY(x1, 0) - groundY(x0, 0), x1 - x0);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.8, 19), deckMat);
    deck.position.set((x0 + x1) / 2, ym - 0.4, 0); deck.rotation.z = ang; scene.add(deck);
    for (const side of [-9.2, 9.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen, 1.1, 0.5), railMat);
      rail.position.set((x0 + x1) / 2, ym + 0.55, side); rail.rotation.z = ang; scene.add(rail);
    }
    if (i % 4 === 2) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(4, ym + 8, 14), railMat);
      pillar.position.set((x0 + x1) / 2, (ym - 8) / 2 - 0.5, 0); scene.add(pillar);
    }
  }
  // suspension cables: two long thin boxes over the crown
  for (const side of [-8.6, 8.6]) {
    const cable = new THREE.Mesh(new THREE.BoxGeometry(330, 0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x67d7ff }));
    cable.position.set((WORLD.bridgeX0 + WORLD.shoreX0) / 2, WORLD.bridgeDeckY + 6.5, side);
    scene.add(cable);
    const towerM = new THREE.Mesh(new THREE.BoxGeometry(1.2, 15, 0.8), railMat);
    towerM.position.set((WORLD.bridgeX0 + WORLD.shoreX0) / 2 - 60, WORLD.bridgeDeckY + 3, side); scene.add(towerM);
    const towerM2 = towerM.clone(); towerM2.position.x += 120; scene.add(towerM2);
  }
}

function buildRain(scene) {
  const streakTex = makeTex(16, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(180,215,255,0)'); gr.addColorStop(0.5, 'rgba(180,215,255,0.9)'); gr.addColorStop(1, 'rgba(180,215,255,0)');
    g.fillStyle = gr; g.fillRect(6, 0, 4, h);
  });
  const N = 1400;
  rainPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    rainPos[i * 3] = rand(-40, 40); rainPos[i * 3 + 1] = rand(0, 42); rainPos[i * 3 + 2] = rand(-40, 40);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  rain = new THREE.Points(geo, new THREE.PointsMaterial({
    map: streakTex, size: 1.5, transparent: true, opacity: 0.5,
    color: 0xa8c8ee, depthWrite: false, sizeAttenuation: true,
  }));
  rain.frustumCulled = false; scene.add(rain);
  // ground spray: tiny bright points skittering on the wet ground near the camera
  const M = 240;
  splashPos = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) {
    splashPos[i * 3] = rand(-30, 30); splashPos[i * 3 + 1] = 0.12; splashPos[i * 3 + 2] = rand(-30, 30);
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
  const dropTex = makeTex(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  });
  splashes = new THREE.Points(sgeo, new THREE.PointsMaterial({
    map: dropTex, size: 0.34, transparent: true, opacity: 0.6, color: 0xcfe6ff, depthWrite: false,
  }));
  splashes.frustumCulled = false; scene.add(splashes);
}

// per-frame world life: rain follows the camera, billboards cycle ads, lightning
let adCycleT = 0;
export function updateWorld(dt, focus) {
  if (rain) {
    rain.position.set(focus.x, 0, focus.z);
    const arr = rain.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= 46 * dt;
      arr[i] -= 5 * dt;
      if (arr[i + 1] < 0) { arr[i + 1] = 42; arr[i] = rand(-40, 40); arr[i + 2] = rand(-40, 40); }
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }
  if (splashes) {
    splashes.position.set(focus.x, groundY(focus.x, focus.z), focus.z);
    const arr = splashes.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      if (Math.random() < 0.12) { arr[i] = rand(-30, 30); arr[i + 2] = rand(-30, 30); }
      arr[i + 1] = 0.1 + Math.abs(Math.sin(G.time * 9 + i)) * 0.16;
    }
    splashes.geometry.attributes.position.needsUpdate = true;
  }
  adCycleT -= dt;
  if (adCycleT <= 0) {
    adCycleT = 9;
    if (G.wanted < 2) {
      for (const b of billboards) { b.adIndex++; drawAd(b.ctx, 512, 256, BRANDS[b.adIndex % BRANDS.length]); b.tex.needsUpdate = true; }
    }
  }
  for (const f of flashers) {
    f.ph += dt * (f.slow ? 1.2 : 7);
    const on = Math.sin(f.ph) > 0;
    f.mat.color.setHex(f.slow ? (on ? 0xfff2b0 : 0x6b6242) : (on ? 0xff2244 : 0x2255ff));
  }
  lightningT -= dt;
  if (lightningT <= 0) {
    lightningT = rand(8, 22);
    if (ambientLight) ambientLight.intensity = 3.2;
    setTimeout(() => { if (ambientLight) ambientLight.intensity = 1.1; }, 110);
    setTimeout(() => { if (Math.random() < 0.7) import('./audio.js').then(a => a.thunder()); }, rand(250, 1400));
  }
}
