// Tests for src/rooms.js: room bounds, the hysteresis rule at the four doors,
// points outside every room / inside walls, and the change-only HUD updater.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOM_BOUNDS, ROOM_NAMES, ROOM_IDS, ROOM_MARGIN, DEFAULT_ROOM, roomAt, createRoomHud,
} from '../src/rooms.js';

// walk a list of points, feeding each result back as `prev`
function walk(start, points) {
  let room = start;
  return points.map(([x, z]) => (room = roomAt(x, z, room)));
}

test('bounds match the ship geometry (CW / CK / Q / G / B) and ship.js uses them', () => {
  assert.deepEqual({ ...ROOM_BOUNDS.corridor }, { x0: -1.4, x1: 1.4, z0: -7, z1: 7 });
  assert.deepEqual({ ...ROOM_BOUNDS.cockpit }, { x0: -2.6, x1: 2.6, z0: -11.6, z1: -7 });
  assert.deepEqual({ ...ROOM_BOUNDS.quarters }, { x0: 1.4, x1: 5.4, z0: -3.5, z1: 0.5 });
  assert.deepEqual({ ...ROOM_BOUNDS.galley }, { x0: -5, x1: -1.4, z0: 1, z1: 4.6 });
  assert.deepEqual({ ...ROOM_BOUNDS.bathroom }, { x0: 1.4, x1: 3.6, z0: 3.4, z1: 5.6 });
  const src = readFileSync(new URL('../src/ship.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ ROOM_BOUNDS \} from '\.\/rooms\.js'/);
  assert.match(src, /const CW = ROOM_BOUNDS\.corridor\.x1;/);
  assert.match(src, /const CK = ROOM_BOUNDS\.cockpit;/);
  assert.match(src, /const Q = ROOM_BOUNDS\.quarters;/);
  assert.match(src, /const G = ROOM_BOUNDS\.galley;/);
  assert.match(src, /const B = ROOM_BOUNDS\.bathroom;/);
  assert.ok(Object.isFrozen(ROOM_BOUNDS.cockpit), 'shared bounds cannot be mutated by ship.js');
});

test('display names are the upper-case HUD names', () => {
  assert.deepEqual(ROOM_IDS, ['cockpit', 'corridor', 'quarters', 'galley', 'bathroom']);
  assert.deepEqual(Object.values(ROOM_NAMES), ['COCKPIT', 'CORRIDOR', 'QUARTERS', 'GALLEY', 'BATHROOM']);
  assert.equal(ROOM_MARGIN, 0.3);
});

test('interior points of all five rooms, from any previous room', () => {
  const interiors = {
    cockpit: [0, -9.3], corridor: [0, 4.5], quarters: [3.4, -1.5], galley: [-3.2, 2.8], bathroom: [2.5, 4.5],
  };
  for (const [id, [x, z]] of Object.entries(interiors)) {
    for (const prev of [null, ...ROOM_IDS]) assert.equal(roomAt(x, z, prev), id, `${id} from ${prev}`);
  }
  // player start (0, 0, 4.5) and capsule-reachable corners (radius 0.32 from the walls)
  assert.equal(roomAt(0, 4.5), 'corridor');
  assert.equal(roomAt(-1.08, 6.68, 'cockpit'), 'corridor');
  assert.equal(roomAt(5.08, 0.18, 'corridor'), 'quarters');
  assert.equal(roomAt(-4.68, 1.32, 'corridor'), 'galley');
  assert.equal(roomAt(3.28, 5.28, 'corridor'), 'bathroom');
  assert.equal(roomAt(-2.28, -7.47, 'corridor'), 'cockpit');
});

// For each door: back and forth inside the ±margin band keeps the value,
// going ≥ margin into the other room switches it, both directions.
const DOORS = [
  {
    name: 'cockpit door (z = -7)', a: 'corridor', b: 'cockpit',
    p: (d) => [0, -7 - d], // d > 0 → into the cockpit
  },
  { name: 'quarters door (x = 1.4)', a: 'corridor', b: 'quarters', p: (d) => [1.4 + d, -1.5] },
  { name: 'galley door (x = -1.4)', a: 'corridor', b: 'galley', p: (d) => [-1.4 - d, 2.8] },
  { name: 'bathroom door (x = 1.4)', a: 'corridor', b: 'bathroom', p: (d) => [1.4 + d, 4.5] },
];

for (const door of DOORS) {
  test(`${door.name}: no flicker inside the margin, switch when well inside`, () => {
    const { a, b, p } = door;
    // from A: jitter around the door line, through the wall thickness (0.15)
    const jitterA = [-0.5, -0.25, 0, 0.1, 0.15, 0.25, 0.05, -0.2, 0.28, -0.29, 0.29];
    assert.deepEqual(walk(a, jitterA.map(p)), jitterA.map(() => a));
    // A → B: ≥ margin inside B switches once
    assert.deepEqual(walk(a, [0.2, 0.31, 0.6].map(p)), [a, b, b]);
    // from B: jitter back across the door line keeps B
    const jitterB = [0.6, 0.25, 0, -0.1, -0.29, 0.1, -0.25, 0.2];
    assert.deepEqual(walk(b, jitterB.map(p)), jitterB.map(() => b));
    // B → A: ≥ margin inside A switches back once
    assert.deepEqual(walk(b, [-0.2, -0.31, -0.6].map(p)), [b, a, a]);
    // full round trip with jitter: exactly two changes
    const seq = walk(a, [-0.5, 0.1, -0.1, 0.2, 0.4, 0.1, -0.1, 0.2, -0.4, 0.05].map(p));
    assert.deepEqual(seq, [a, a, a, a, b, b, b, b, a, a]);
    const changes = seq.filter((r, i) => r !== (i ? seq[i - 1] : a)).length;
    assert.equal(changes, 2);
  });
}

test('points inside walls or outside every room keep the previous room', () => {
  // inside the corridor/quarters wall (x 1.4…1.55), away from the door
  assert.equal(roomAt(1.47, -3.0, 'corridor'), 'corridor');
  assert.equal(roomAt(1.47, -3.0, 'quarters'), 'quarters');
  // inside the cockpit back wall (z -7.15…-7), beside the door
  assert.equal(roomAt(-1.5, -7.07, 'corridor'), 'corridor');
  assert.equal(roomAt(-1.5, -7.07, 'cockpit'), 'cockpit');
  // galley outer wall and the quarters/bathroom gap
  assert.equal(roomAt(-5.07, 2.8, 'galley'), 'galley');
  assert.equal(roomAt(2.5, 2.0, 'quarters'), 'quarters');
  // outside the ship
  for (const prev of ROOM_IDS) {
    assert.equal(roomAt(20, 0, prev), prev);
    assert.equal(roomAt(0, -40, prev), prev);
    assert.equal(roomAt(Number.NaN, 0, prev), prev);
  }
});

test('without a valid previous room the result is deterministic', () => {
  assert.equal(DEFAULT_ROOM, 'corridor');
  for (const prev of [null, undefined, 'engine', '']) {
    assert.equal(roomAt(20, 0, prev), 'corridor'); // outside → default
    assert.equal(roomAt(Number.NaN, Number.NaN, prev), 'corridor');
    assert.equal(roomAt(1.5, -1.5, prev), 'quarters'); // within the margin, but only quarters contains it
    assert.equal(roomAt(0, -7, prev), 'cockpit'); // shared edge: first in ROOM_IDS order
    assert.equal(roomAt(2.5, 4.5, prev), 'bathroom');
  }
});

function stubEl() {
  const el = { sets: 0, _t: '' };
  Object.defineProperty(el, 'textContent', {
    get() { return this._t; },
    set(v) { this._t = v; this.sets++; },
  });
  return el;
}

test('HUD updater writes the DOM once per room change only', () => {
  const el = stubEl();
  const hud = createRoomHud(el);
  assert.equal(el.sets, 0);
  assert.equal(hud.update(0, 4.5), 'corridor');
  assert.equal(el.textContent, 'CORRIDOR');
  assert.equal(el.sets, 1);
  // same room for many frames → no writes
  for (let i = 0; i < 50; i++) hud.update(0, 4.5 - i * 0.05);
  assert.equal(el.sets, 1);
  // door jitter inside the margin → no writes
  for (const x of [1.2, 1.4, 1.6, 1.45, 1.3, 1.69]) hud.update(x, -1.5);
  assert.equal(el.sets, 1);
  assert.equal(hud.room, 'corridor');
  // enter quarters → exactly one write
  hud.update(2.0, -1.5);
  hud.update(3.0, -1.5);
  assert.equal(el.sets, 2);
  assert.equal(el.textContent, 'QUARTERS');
  assert.equal(hud.text, 'QUARTERS');
  // back to corridor, then the cockpit → one write each
  hud.update(0, -1.5);
  hud.update(0, -6.9);
  hud.update(0, -9);
  assert.equal(el.sets, 4);
  assert.equal(el.textContent, 'COCKPIT');
  assert.equal(hud.writes, el.sets);
});
