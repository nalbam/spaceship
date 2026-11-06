// Regression tests for src/interact.js message timing.
// Runs the real setupInteractions against a minimal DOM stub, a Three.js
// camera and interactable meshes, with node:test mock timers (no browser/GPU).
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setupInteractions } from '../src/interact.js';

const IDS = ['prompt', 'message', 'fade', 'status'];

function makeDocument() {
  const listeners = new Map();
  const els = Object.fromEntries(IDS.map((id) => [id, { id, textContent: '', style: {} }]));
  return {
    els,
    getElementById: (id) => els[id] ?? null,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type, ev) { for (const fn of listeners.get(type) ?? []) fn(ev); },
  };
}

function makeTarget(action, label, position) {
  const group = new THREE.Group();
  group.userData = { action, label };
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshStandardMaterial({ emissive: 0x000000 }),
  );
  group.add(mesh);
  group.position.copy(position);
  group.updateMatrixWorld(true);
  return group;
}

let doc;
let now;
let camera;
let player;
let game;

// Advance virtual time 1 ms at a time and let awaited fades/delays continue.
async function advance(ms) {
  for (let i = 0; i < ms; i++) {
    mock.timers.tick(1);
    now += 1;
    await new Promise((r) => setImmediate(r));
  }
}
async function advanceTo(t) { await advance(t - now); }

function aim(yaw) {
  camera.rotation.set(0, yaw, 0);
  camera.updateMatrixWorld(true);
  game.update(0.016);
}
const LOOK_GALLEY = 0; // -z
const LOOK_BED = -Math.PI / 2; // +x
const LOOK_BATH = Math.PI / 2; // -x

function pressE() { doc.dispatch('keydown', { code: 'KeyE' }); }
const msg = () => doc.els.message;
const opacity = () => Number(msg().style.opacity ?? 0);

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  now = 0;
  doc = makeDocument();
  globalThis.document = doc;
  camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 100);
  player = { frozen: false };
  const interactables = [
    makeTarget('eat', 'E: Eat', new THREE.Vector3(0, 0, -1.5)),
    makeTarget('sleep', 'E: Sleep', new THREE.Vector3(1.5, 0, 0)),
    makeTarget('refresh', 'E: Refresh', new THREE.Vector3(-1.5, 0, 0)),
  ];
  game = setupInteractions({ camera, interactables, player, setRestMix: () => {} });
});

afterEach(() => {
  mock.timers.reset();
  delete globalThis.document;
});

test('eat twice 1000 ms apart: second message lasts its full 1800 ms', async () => {
  aim(LOOK_GALLEY);
  assert.equal(doc.els.prompt.textContent, 'E: Eat');
  pressE();
  assert.equal(msg().textContent, 'YOU EAT. ENERGY RESTORED.');
  assert.equal(opacity(), 1);
  assert.match(doc.els.status.textContent, /SHIP TIME 08:20 · ENERGY 100%/);

  await advanceTo(1000);
  aim(LOOK_GALLEY); // busy cleared at 900 ms; hover is re-acquired
  assert.equal(game.dbg().busy, false);
  pressE();
  assert.equal(msg().textContent, 'YOU EAT. ENERGY RESTORED.');
  assert.equal(opacity(), 1);
  assert.match(doc.els.status.textContent, /SHIP TIME 08:40/);

  await advanceTo(1800); // first call's hide timer expiry
  assert.equal(opacity(), 1, 'first timer must not hide the second message');
  await advanceTo(1000 + 1799);
  assert.equal(opacity(), 1);
  await advanceTo(1000 + 1800);
  assert.equal(opacity(), 0);
});

test('refresh then eat: eat message is not cut short by the refresh timer', async () => {
  aim(LOOK_BATH);
  pressE();
  assert.equal(player.frozen, true);
  await advanceTo(1030); // fade 600+30, wait 400
  assert.equal(msg().textContent, 'REFRESHED.');
  assert.equal(opacity(), 1);
  await advanceTo(1860); // fade back 800+30 → busy/frozen released
  assert.equal(player.frozen, false);
  assert.equal(game.dbg().busy, false);
  assert.match(doc.els.status.textContent, /SHIP TIME 08:10/);

  aim(LOOK_GALLEY);
  pressE();
  const eatAt = now;
  assert.equal(msg().textContent, 'YOU EAT. ENERGY RESTORED.');
  await advanceTo(1030 + 1600); // refresh hide timer expiry
  assert.equal(opacity(), 1, 'refresh timer must not hide the eat message');
  await advanceTo(eatAt + 1799);
  assert.equal(opacity(), 1);
  await advanceTo(eatAt + 1800);
  assert.equal(opacity(), 0);
});

test('eat then sleep: sleep message follows its own 4600 ms hold', async () => {
  aim(LOOK_GALLEY);
  pressE();
  await advanceTo(1000);
  aim(LOOK_BED);
  assert.equal(doc.els.prompt.textContent, 'E: Sleep');
  pressE();
  assert.equal(player.frozen, true);
  const sleepMsgAt = 1000 + 830 + 400; // fade 800+30, then 400 ms
  await advanceTo(sleepMsgAt);
  assert.equal(msg().textContent, '8 HOURS PASS');
  assert.equal(opacity(), 1);
  assert.match(doc.els.status.textContent, /SHIP TIME 16:20 · ENERGY 100%/);
  await advanceTo(sleepMsgAt + 4599);
  assert.equal(opacity(), 1);
  await advanceTo(sleepMsgAt + 4600);
  assert.equal(opacity(), 0);
  await advanceTo(sleepMsgAt + 3400 + 1230); // fade back → released
  assert.equal(player.frozen, false);
  assert.equal(game.dbg().busy, false);
});
