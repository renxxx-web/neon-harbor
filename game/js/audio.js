// audio.js — every sound in NEON HARBOR is synthesised with WebAudio: the rain
// loop, thunder, engines, sirens, gunfire, UI, and a three-station in-car radio
// whose little sequencers play original synth loops. No audio files exist.

import { G } from './state.js';

let ctx = null, master = null, rainGain = null, engineNodes = null, sirenNodes = [];
let radioTimer = 0, radioStep = 0, radioOn = false;
export const RADIO_STATIONS = [
  { name: 'PULSE 104.2 — synthwave', root: 110.0, minor: true, tempo: 0.21, wave: 'sawtooth' },
  { name: 'DOCKLINE FM — lo-fi', root: 87.31, minor: true, tempo: 0.30, wave: 'triangle' },
  { name: 'VOLT ROCK 99.9', root: 98.0, minor: false, tempo: 0.17, wave: 'square' },
];
let stationIndex = 0;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    startRain();
  } catch (e) { ctx = null; }
}

export function setMuted(m) {
  if (master) master.gain.value = m ? 0 : 0.55;
}

function noiseBuffer(seconds = 2) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function startRain() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(3); src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
  rainGain = ctx.createGain(); rainGain.gain.value = 0.05;
  src.connect(lp); lp.connect(hp); hp.connect(rainGain); rainGain.connect(master);
  src.start();
}

export function thunder() {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(1.6);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(400, ctx.currentTime);
  lp.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.07);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
  src.connect(lp); lp.connect(g); g.connect(master);
  src.start(); src.stop(ctx.currentTime + 1.6);
}

function blip(freq, dur, type = 'sine', vol = 0.15, slideTo = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur);
}

export const sfx = {
  ui: () => blip(660, 0.07, 'square', 0.06),
  cash: () => { blip(880, 0.09, 'square', 0.08); setTimeout(() => blip(1320, 0.12, 'square', 0.08), 70); },
  punch: () => blip(160, 0.09, 'sine', 0.3, 60),
  shot: () => {
    if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.15);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    src.connect(hp); hp.connect(g); g.connect(master); src.start();
    blip(220, 0.08, 'square', 0.2, 55);
  },
  alarm: () => { blip(1180, 0.14, 'square', 0.1); setTimeout(() => blip(1180, 0.14, 'square', 0.1), 180); },
  crash: (hard = 1) => blip(120, 0.22, 'sawtooth', 0.16 * hard, 40),
  checkpoint: () => { blip(740, 0.08, 'sine', 0.12); setTimeout(() => blip(1108, 0.14, 'sine', 0.12), 80); },
  fail: () => blip(196, 0.3, 'sawtooth', 0.12, 130),
  phone: () => { blip(1046, 0.09, 'sine', 0.07); setTimeout(() => blip(1046, 0.09, 'sine', 0.07), 140); },
};

// --- engine: two detuned oscillators whose pitch follows speed -------------
export function engineStart() {
  if (!ctx || engineNodes) return;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o1.type = 'sawtooth'; o2.type = 'square';
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  g.gain.value = 0.0;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
  o1.start(); o2.start();
  engineNodes = { o1, o2, g, lp };
}
export function engineUpdate(speedRatio, inCar) {
  if (!engineNodes) return;
  const t = ctx.currentTime;
  const f = 55 + Math.abs(speedRatio) * 165;
  engineNodes.o1.frequency.setTargetAtTime(f, t, 0.06);
  engineNodes.o2.frequency.setTargetAtTime(f * 0.5 + 2, t, 0.06);
  engineNodes.lp.frequency.setTargetAtTime(300 + Math.abs(speedRatio) * 900, t, 0.1);
  engineNodes.g.gain.setTargetAtTime(inCar ? 0.05 + Math.abs(speedRatio) * 0.05 : 0, t, 0.12);
}
export function engineStop() {
  if (!engineNodes) return;
  try { engineNodes.o1.stop(); engineNodes.o2.stop(); } catch (e) {}
  engineNodes = null;
}

// --- police sirens: one wailing oscillator per nearby cruiser --------------
export function sirensUpdate(count, dt) {
  if (!ctx) return;
  while (sirenNodes.length < count && sirenNodes.length < 3) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; g.gain.value = 0;
    o.connect(g); g.connect(master); o.start();
    sirenNodes.push({ o, g, ph: Math.random() * 6 });
  }
  sirenNodes.forEach((s, i) => {
    s.ph += dt * 2.4;
    s.o.frequency.value = 720 + Math.sin(s.ph) * 260;
    s.g.gain.setTargetAtTime(i < count ? 0.018 : 0, ctx.currentTime, 0.2);
  });
}

// --- radio: tiny step sequencers, one per station ---------------------------
const SCALES = { minor: [0, 3, 5, 7, 10, 12, 15], major: [0, 2, 4, 7, 9, 12, 14] };
export function radioStationName() { return RADIO_STATIONS[stationIndex].name; }
export function radioCycle() {
  stationIndex = (stationIndex + 1) % RADIO_STATIONS.length;
  radioStep = 0;
  return RADIO_STATIONS[stationIndex].name;
}
export function radioUpdate(dt, inCar) {
  const want = inCar && !G.muted;
  if (want && !radioOn) { radioOn = true; radioTimer = 0; }
  if (!want) { radioOn = false; return; }
  radioTimer -= dt;
  if (radioTimer > 0) return;
  const st = RADIO_STATIONS[stationIndex];
  radioTimer = st.tempo;
  const scale = st.minor ? SCALES.minor : SCALES.major;
  const bar = Math.floor(radioStep / 8) % 4;
  const roots = st.minor ? [0, 0, -4, -2] : [0, -4, -2, -4];
  const bassFreq = st.root * Math.pow(2, roots[bar] / 12);
  if (radioStep % 2 === 0) blip(bassFreq, st.tempo * 1.8, st.wave, 0.055);
  if (radioStep % 4 === 2) blip(bassFreq * 2, st.tempo * 1.4, st.wave, 0.03);
  const mel = scale[(radioStep * 3 + bar * 2) % scale.length];
  if (radioStep % 2 === 1) blip(st.root * 4 * Math.pow(2, mel / 12), st.tempo * 0.95, 'sine', 0.028);
  radioStep++;
}
