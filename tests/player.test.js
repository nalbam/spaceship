// Regression tests for src/player.js mouse-look sensitivity.
// Runs the real Player against a minimal DOM stub (no browser): pointer lock
// state and mousemove events are dispatched through the stub document.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';

const BASE_RATE = 0.0023; // rotation per movement unit before sensitivity existed

function makeDocument() {
  const listeners = new Map();
  const startListeners = [];
  const start = {
    classList: { toggle() {} },
    addEventListener: (type, fn) => { if (type === 'click') startListeners.push(fn); },
    click: (target) => { for (const fn of startListeners) fn({ target }); },
  };
  return {
    pointerLockElement: null,
    start,
    getElementById: (id) => (id === 'start' ? start : null),
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type, ev) { for (const fn of listeners.get(type) ?? []) fn(ev); },
  };
}

let doc;
let canvas;
let player;

function lock() {
  doc.pointerLockElement = canvas;
  doc.dispatch('pointerlockchange', {});
}
function unlock() {
  doc.pointerLockElement = null;
  doc.dispatch('pointerlockchange', {});
}
const move = (movementX, movementY) => doc.dispatch('mousemove', { movementX, movementY });

beforeEach(() => {
  doc = makeDocument();
  globalThis.document = doc;
  canvas = { lockRequests: 0, addEventListener() {}, requestPointerLock() { this.lockRequests++; } };
  player = new Player(new THREE.PerspectiveCamera(), canvas, []);
});
afterEach(() => { delete globalThis.document; });

test('default sensitivity 1 keeps the original rotation per movement', () => {
  assert.equal(player.sensitivity, 1);
  lock();
  move(100, 50);
  assert.ok(Math.abs(player.yaw - -100 * BASE_RATE) < 1e-12);
  assert.ok(Math.abs(player.pitch - -50 * BASE_RATE) < 1e-12);
});

test('yaw and pitch change in proportion to sensitivity', () => {
  lock();
  for (const s of [0.25, 0.5, 2, 3]) {
    player.yaw = 0;
    player.pitch = 0;
    assert.equal(player.setSensitivity(s), s);
    move(40, -30); // pitch stays well below the 1.45 clamp at s=3
    assert.ok(Math.abs(player.yaw - -40 * BASE_RATE * s) < 1e-12, `yaw at ${s}`);
    assert.ok(Math.abs(player.pitch - 30 * BASE_RATE * s) < 1e-12, `pitch at ${s}`);
  }
});

test('pitch stays within the existing ±1.45 limit at high sensitivity', () => {
  lock();
  player.setSensitivity(3);
  move(0, 1000);
  assert.equal(player.pitch, -1.45);
  move(0, -5000);
  assert.equal(player.pitch, 1.45);
});

test('no rotation while unlocked or frozen', () => {
  player.setSensitivity(3);
  move(100, 100);
  assert.equal(player.yaw, 0);
  assert.equal(player.pitch, 0);
  lock();
  player.frozen = true;
  move(100, 100);
  assert.equal(player.yaw, 0);
  assert.equal(player.pitch, 0);
  player.frozen = false;
  unlock();
  move(100, 100);
  assert.equal(player.yaw, 0);
  assert.equal(player.pitch, 0);
});

test('out-of-range sensitivity clamps and invalid input restores the default', () => {
  const cases = [
    [0, 0.25], [0.1, 0.25], [-2, 0.25], [5, 3], [3, 3], [0.25, 0.25],
    [NaN, 1], [Infinity, 1], [-Infinity, 1], ['2', 1], [undefined, 1], [null, 1],
  ];
  for (const [input, want] of cases) {
    player.setSensitivity(2);
    assert.equal(player.setSensitivity(input), want, `setSensitivity(${String(input)})`);
    assert.equal(player.sensitivity, want);
  }
});

// minimal element stand-in: `closest('[data-no-lock]')` finds itself or an ancestor
function el(noLock, parent = null) {
  const node = {
    closest: (sel) => {
      if (sel !== '[data-no-lock]') return null;
      return noLock ? node : (parent?.closest(sel) ?? null);
    },
  };
  return node;
}

test('start overlay click requests the lock, settings controls do not', () => {
  const plain = el(false);
  const menu = el(true);
  const sliderInMenu = el(false, menu);
  doc.start.click(plain);
  assert.equal(canvas.lockRequests, 1);
  doc.start.click(menu);
  doc.start.click(sliderInMenu);
  assert.equal(canvas.lockRequests, 1);
  // explicit resume path (settings menu "Resume" button)
  player.requestLock();
  assert.equal(canvas.lockRequests, 2);
  // no request while already locked
  lock();
  player.requestLock();
  doc.start.click(plain);
  assert.equal(canvas.lockRequests, 2);
});

test('held keys are cleared when the pointer lock changes', () => {
  lock();
  doc.dispatch('keydown', { code: 'KeyW' });
  assert.equal(player.keys.KeyW, true);
  unlock(); // Esc while holding W; keyup may land in the menu
  assert.equal(player.keys.KeyW, undefined);
  doc.dispatch('keydown', { code: 'KeyD' }); // typed while the menu is open
  lock();
  assert.equal(player.keys.KeyD, undefined);
  const z0 = player.position.z, x0 = player.position.x;
  player.update(0.1);
  assert.equal(player.position.z, z0);
  assert.equal(player.position.x, x0);
});
