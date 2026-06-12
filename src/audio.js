// Procedural footstep audio — Web Audio only, no assets.
// Metal deck step = low thump (sine drop) + short metallic tap (bandpassed noise).
let ctx = null;
let noiseBuf = null;
let stepCount = 0;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.floor(ctx.sampleRate * 0.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function playFootstep(intensity = 1) {
  const c = ensureCtx();
  if (c.state !== 'running') return;
  stepCount++;
  const t = c.currentTime;
  // low thump
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(72 + Math.random() * 22, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.09);
  const og = c.createGain();
  og.gain.setValueAtTime(0.16 * intensity, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  osc.connect(og).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.13);
  // metallic tap
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 850 + Math.random() * 950;
  bp.Q.value = 1.3;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.09 * intensity, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  src.connect(bp).connect(ng).connect(c.destination);
  src.start(t);
  src.stop(t + 0.09);
}

// blaster "pew": two detuned square sweeps + a high noise crack
export function playShot() {
  const c = ensureCtx();
  if (c.state !== 'running') return;
  const t = c.currentTime;
  for (const [f0, det] of [[1300, 0], [1560, 8]]) {
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.detune.value = det;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.14);
    const g = c.createGain();
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.12, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(hp).connect(ng).connect(c.destination);
  src.start(t);
  src.stop(t + 0.06);
}

// impact: sizzling crack + dull thump
export function playHit() {
  const c = ensureCtx();
  if (c.state !== 'running') return;
  const t = c.currentTime + 0.02;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200 + Math.random() * 800;
  bp.Q.value = 1.1;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.1, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  src.connect(bp).connect(ng).connect(c.destination);
  src.start(t);
  src.stop(t + 0.1);
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.07);
  const og = c.createGain();
  og.gain.setValueAtTime(0.08, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(og).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.09);
}

function mechClick(c, t, gain) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3200;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  src.connect(hp).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + 0.04);
}

export function playReload() {
  const c = ensureCtx();
  if (c.state !== 'running') return;
  mechClick(c, c.currentTime, 0.09); // mag out
  mechClick(c, c.currentTime + 0.55, 0.11); // mag in
  mechClick(c, c.currentTime + 0.95, 0.07); // charge
}

export function playEmpty() {
  const c = ensureCtx();
  if (c.state !== 'running') return;
  mechClick(c, c.currentTime, 0.06);
}

export function audioDebug() {
  return { state: ctx ? ctx.state : 'uninitialized', steps: stepCount };
}
