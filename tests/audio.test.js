// Regression tests for src/audio.js master volume.
// Runs the real module against a recording Web Audio stub (no browser/sound
// device): every created node and connection is kept so the test can walk the
// graph from each sound source to the destination.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

class Param {
  constructor(value) { this.value = value; }
  setValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime() { return this; }
}

class Node {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = [];
    ctx.nodes.push(this);
  }
  connect(target) { this.outputs.push(target); return target; }
  start() { this.started = true; }
  stop() {}
}

class FakeAudioContext {
  constructor() {
    FakeAudioContext.instances.push(this);
    this.nodes = [];
    this.state = 'running';
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.destination = { kind: 'destination', outputs: [] };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createBuffer(ch, len) {
    const data = new Float32Array(len);
    return { getChannelData: () => data };
  }
  createGain() { const n = new Node(this, 'gain'); n.gain = new Param(1); return n; }
  createOscillator() {
    const n = new Node(this, 'source');
    n.frequency = new Param(440);
    n.detune = new Param(0);
    return n;
  }
  createBufferSource() { return new Node(this, 'source'); }
  createBiquadFilter() {
    const n = new Node(this, 'filter');
    n.frequency = new Param(350);
    n.Q = new Param(1);
    return n;
  }
}
FakeAudioContext.instances = [];

let seq = 0;
// fresh module instance per test, so "before the context exists" is real
const load = () => import(`../src/audio.js?t=${seq++}`);

beforeEach(() => {
  FakeAudioContext.instances = [];
  globalThis.window = { AudioContext: FakeAudioContext };
});
afterEach(() => { delete globalThis.window; });

// all node paths from `node` to the destination
function paths(node, dest, path = []) {
  if (node === dest) return [path];
  return node.outputs.flatMap((n) => paths(n, dest, [...path, n]));
}

// the single gain that feeds the destination
function masterOf(ctx) {
  const feeders = ctx.nodes.filter((n) => n.outputs.includes(ctx.destination));
  assert.equal(feeders.length, 1, 'exactly one node connects to destination');
  assert.equal(feeders[0].kind, 'gain');
  return feeders[0];
}

const SOUNDS = [
  ['playFootstep', 2],
  ['playShot', 3],
  ['playHit', 2],
  ['playReload', 3],
  ['playEmpty', 1],
];

test('every effect source reaches the destination only through one master gain', async () => {
  const audio = await load();
  for (const [name, expected] of SOUNDS) {
    const ctx = FakeAudioContext.instances[0];
    const before = ctx ? ctx.nodes.length : 0;
    audio[name]();
    const c = FakeAudioContext.instances[0];
    const sources = c.nodes.slice(before).filter((n) => n.kind === 'source');
    assert.equal(sources.length, expected, `${name} source count`);
    const master = masterOf(c);
    for (const src of sources) {
      assert.ok(src.started, `${name} source started`);
      const ps = paths(src, c.destination);
      assert.ok(ps.length > 0, `${name} source reaches destination`);
      for (const p of ps) {
        assert.equal(p.at(-2), master, `${name} path ends in master`);
        assert.equal(p.filter((n) => n === master).length, 1);
      }
    }
  }
  assert.equal(FakeAudioContext.instances.length, 1, 'one context for all sounds');
});

test('volume set before the context exists applies to the first sound', async () => {
  const audio = await load();
  assert.equal(audio.setMasterVolume(0.4), 0.4);
  assert.equal(FakeAudioContext.instances.length, 0, 'setter does not create a context');
  audio.playShot();
  assert.equal(masterOf(FakeAudioContext.instances[0]).gain.value, 0.4);
});

test('volume 0 before creation gives an exactly silent master', async () => {
  const audio = await load();
  audio.setMasterVolume(0);
  audio.playFootstep();
  assert.equal(masterOf(FakeAudioContext.instances[0]).gain.value, 0);
});

test('changes after creation update the existing master gain', async () => {
  const audio = await load();
  audio.playEmpty();
  const c = FakeAudioContext.instances[0];
  const master = masterOf(c);
  assert.equal(master.gain.value, 1, 'default volume is 1');
  audio.setMasterVolume(0);
  assert.equal(master.gain.value, 0);
  audio.setMasterVolume(0.75);
  assert.equal(master.gain.value, 0.75);
  audio.playHit();
  assert.equal(masterOf(c), master, 'no new master after later sounds');
  assert.equal(c.nodes.filter((n) => n.outputs.includes(c.destination)).length, 1);
});

test('out-of-range volumes clamp and invalid ones restore the default', async () => {
  const audio = await load();
  audio.playReload();
  const master = masterOf(FakeAudioContext.instances[0]);
  const cases = [
    [-0.5, 0], [2, 1], [1, 1], [0, 0],
    [NaN, 1], [Infinity, 1], [-Infinity, 1], ['0.5', 1], [undefined, 1], [null, 1],
  ];
  for (const [input, want] of cases) {
    audio.setMasterVolume(0.3);
    assert.equal(audio.setMasterVolume(input), want, `setMasterVolume(${String(input)})`);
    assert.equal(master.gain.value, want, `gain after ${String(input)}`);
  }
});
