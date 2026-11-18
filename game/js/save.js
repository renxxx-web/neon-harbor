// save.js — NEON HARBOR keeps its save in localStorage: cash, story progress,
// the pistol, side-activity records and where Ren was standing.

import { G } from './state.js';

const KEY = 'neon-harbor-save-v1';

export function saveExists() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function writeSave(playerPos) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: G.cash, bounty: G.bounty, missionIndex: G.missionIndex,
      hasPistol: G.hasPistol, stats: G.stats, bestRaceMs: G.bestRaceMs,
      x: playerPos.x, z: playerPos.z,
    }));
  } catch (e) { /* private mode etc. — the game just won't persist */ }
}

export function readSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s) return null;
    G.cash = s.cash ?? G.cash;
    G.bounty = s.bounty ?? 0;
    G.missionIndex = s.missionIndex ?? 0;
    G.hasPistol = !!s.hasPistol;
    Object.assign(G.stats, s.stats || {});
    G.bestRaceMs = s.bestRaceMs || 0;
    return { x: s.x ?? -196, z: s.z ?? 208 };
  } catch (e) { return null; }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
