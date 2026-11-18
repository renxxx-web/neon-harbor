// hud.js — everything flat on the screen: cash and bounty, wanted stars, the
// canvas minimap (police blips, mission diamond, race markers), the phone that
// Mama Ivo calls on, prompts, toasts and the objective line.

import { G, fmtMoney, clamp } from './state.js';
import { busted } from './police.js';

const el = (id) => document.getElementById(id);
const ui = {};
let phoneQueue = [], phoneT = 0, toastT = 0;

export function initHud() {
  for (const id of ['hud-root', 'cash', 'bounty-line', 'stars', 'minimap', 'obj-title', 'obj-text', 'obj-dist',
    'health-bar', 'speed', 'radio-line', 'prompt', 'toast', 'busted-meter', 'busted-bar', 'phone', 'phone-who', 'phone-msg'])
    ui[id] = el(id);
  ui.mapCtx = ui.minimap.getContext('2d');
}

export function showHud(on) { ui['hud-root'].classList.toggle('hidden', !on); }

// phone dialogue: lines play in sequence; who = 'MAMA IVO', 'REN', ...
export function phone(lines) {
  for (const l of lines) phoneQueue.push(l);
  if (phoneT <= 0 && phoneQueue.length) nextPhoneLine();
}
function nextPhoneLine() {
  const l = phoneQueue.shift();
  if (!l) { ui.phone.style.display = 'none'; phoneT = 0; return; }
  ui.phone.style.display = 'block';
  ui['phone-who'].innerHTML = '📱 <b>' + l.who + '</b>';
  ui['phone-msg'].textContent = l.text;
  phoneT = l.dur || Math.max(2.2, l.text.length * 0.055);
}
export function phoneBusy() { return phoneT > 0 || phoneQueue.length > 0; }

export function toast(main, sub = '') {
  ui.toast.innerHTML = main + (sub ? '<span class="sub">' + sub + '</span>' : '');
  ui.toast.style.opacity = 1;
  toastT = 3.2;
}

export function setObjective(title, text, distText = '') {
  ui['obj-title'].textContent = title || '';
  ui['obj-text'].textContent = text || '';
  ui['obj-dist'].textContent = distText || '';
}

export function setPrompt(html) {
  if (html) { ui.prompt.innerHTML = html; ui.prompt.style.display = 'block'; }
  else ui.prompt.style.display = 'none';
}

export function setRadio(text) { ui['radio-line'].textContent = text; }

export function updateHud(dt, playerCar) {
  ui.cash.textContent = fmtMoney(G.cash);
  ui['bounty-line'].innerHTML = 'BOUNTY <b>' + fmtMoney(G.bounty) + '</b>';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '<span class="off">★</span>';
  ui.stars.innerHTML = stars;
  ui['health-bar'].style.width = clamp(G.health, 0, 100) + '%';
  const kmh = playerCar ? Math.abs(playerCar.speed) * 3.6 : 0;
  ui.speed.innerHTML = Math.round(kmh) + ' <small>KM/H</small>';
  if (busted.meter > 0.02) {
    ui['busted-meter'].style.display = 'block';
    ui['busted-bar'].style.width = (busted.meter * 100) + '%';
  } else ui['busted-meter'].style.display = 'none';
  if (phoneT > 0) { phoneT -= dt; if (phoneT <= 0) nextPhoneLine(); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) ui.toast.style.opacity = 0; }
}

// --- minimap -------------------------------------------------------------------
// world extent mapped onto the square: x -260..900, z -280..480
const MAP = { x0: -260, x1: 900, z0: -280, z1: 480 };
function mx(x) { return (x - MAP.x0) / (MAP.x1 - MAP.x0) * 216; }
function mz(z) { return (z - MAP.z0) / (MAP.z1 - MAP.z0) * 216; }

export function drawMinimap(playerPos, heading, cops, markers) {
  const g = ui.mapCtx;
  if (!g) return;
  g.fillStyle = '#081426'; g.fillRect(0, 0, 216, 216);
  g.fillStyle = '#1a2432';
  g.fillRect(mx(-242), mz(-242), mx(242) - mx(-242), mz(256) - mz(-242));       // island
  g.fillRect(mx(566), mz(-172), mx(858) - mx(566), mz(172) - mz(-172));          // far shore
  g.fillStyle = '#232f40';
  for (let i = 0; i <= 8; i++) {                                                // roads
    const c = -224 + i * 56;
    g.fillRect(mx(c) - 1, mz(-224), 2, mz(224) - mz(-224));
    g.fillRect(mx(-224), mz(c) - 1, mx(224) - mx(-224), 2);
  }
  g.fillRect(mx(238), mz(0) - 1, mx(566) - mx(238), 2);                          // bridge
  g.fillStyle = '#2c3e55'; g.fillRect(mx(-146), mz(256), mx(-96) - mx(-146), mz(396) - mz(256));
  g.fillRect(mx(64), mz(256), mx(114) - mx(64), mz(396) - mz(256));
  // markers: {x,z,kind} kind = mission | race | courier | safehouse
  for (const m of markers || []) {
    const x = mx(m.x), y = mz(m.z);
    if (m.kind === 'mission') {
      g.fillStyle = '#ffd94d';
      g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.closePath(); g.fill();
    } else if (m.kind === 'race') {
      g.fillStyle = '#37e0ff'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    } else if (m.kind === 'courier') {
      g.fillStyle = '#7dff9a'; g.fillRect(x - 3, y - 3, 6, 6);
    } else if (m.kind === 'safehouse') {
      g.fillStyle = '#ff9ff3'; g.fillRect(x - 3, y - 3, 6, 6);
    }
  }
  if (G.wanted > 0) {
    g.fillStyle = '#ff4757';
    for (const c of cops) { g.beginPath(); g.arc(mx(c.x), mz(c.z), 3, 0, 7); g.fill(); }
  }
  // player arrow
  const px = mx(playerPos.x), py = mz(playerPos.z);
  g.save(); g.translate(px, py); g.rotate(-heading);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(0, 2.4); g.lineTo(-4, 5); g.closePath(); g.fill();
  g.restore();
}
