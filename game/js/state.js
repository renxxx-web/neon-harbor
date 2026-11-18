// state.js — the one shared game state for NEON HARBOR, plus small helpers every
// other module uses. Nothing here touches the DOM or three.js scene directly.

export const WORLD = {
  pitch: 56,            // distance between block centres
  block: 42,            // building block footprint
  road: 14,             // road width between blocks
  gridMin: -196,        // first block centre
  gridMax: 196,         // last block centre
  roadLines: [-224, -168, -112, -56, 0, 56, 112, 168, 224], // drivable axes
  quayZ: 252,           // harbour ground starts here (south)
  waterZ: 292,          // open water beyond the piers
  bridgeX0: 238,        // bridge starts (east edge of the island)
  bridgeX1: 566,        // bridge lands on the far shore
  bridgeDeckY: 7,       // bridge deck height at the crown
  shoreX0: 566,         // far-shore district bounds
  shoreX1: 854,
  shoreZ: 168,          // far-shore half depth
};

export const G = {
  mode: 'title',        // title | play | pause | busted | wasted
  driving: false,       // true while the player is in a car
  time: 0,              // seconds since boot
  cash: 250,
  bounty: 0,            // grows with crimes; shown on the WANTED billboards
  heat: 0,              // raw police pressure, maps to wanted stars
  wanted: 0,            // 0..5 stars
  health: 100,
  missionIndex: 0,      // next story mission to play
  mission: null,        // live mission state machine (missions.js)
  activity: null,       // live side activity (race / courier)
  hasPistol: false,
  crimesSeen: 0,
  stats: { stolen: 0, racesWon: 0, deliveries: 0, bustedCount: 0, wastedCount: 0 },
  bestRaceMs: 0,
  seenByPolice: 0,      // seconds since a cop last had eyes on the player
  hideoutDrain: false,  // standing in the safehouse garage drains wanted
  muted: false,
  shot: null,           // ?shot= staging name, or null in real play
  god: false,           // screenshot staging flag
};

export function wantedFromHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(5, 1 + Math.floor(heat / 3));
}

export function addHeat(n, crimeBounty = 0) {
  G.heat = Math.max(0, G.heat + n);
  if (crimeBounty > 0) {
    G.bounty += crimeBounty;
    G.crimesSeen++;
  }
  G.wanted = wantedFromHeat(G.heat);
}

export function setWanted(stars) {
  G.wanted = Math.max(0, Math.min(5, stars));
  G.heat = G.wanted === 0 ? 0 : (G.wanted - 1) * 3 + 1;
}

// deterministic-enough random helpers (Math.random is fine for a game)
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const angleLerp = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
