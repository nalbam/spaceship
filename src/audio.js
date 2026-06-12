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

export function audioDebug() {
  return { state: ctx ? ctx.state : 'uninitialized', steps: stepCount };
}
