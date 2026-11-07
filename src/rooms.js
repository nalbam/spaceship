// Room bounds and the "which room is the player in" rule for the HUD.
// Pure module: no browser, no three. ship.js builds its walls from these
// bounds, so the HUD rule and the geometry cannot drift apart.

// Floor rectangles of each space (x0 < x1, z0 < z1), in metres. Walls are
// WALL_T = 0.15 thick and sit outside the corridor (|x| 1.4…1.55, z -7.15…-7).
export const ROOM_BOUNDS = Object.freeze({
  cockpit: Object.freeze({ x0: -2.6, x1: 2.6, z0: -11.6, z1: -7 }),
  corridor: Object.freeze({ x0: -1.4, x1: 1.4, z0: -7, z1: 7 }),
  quarters: Object.freeze({ x0: 1.4, x1: 5.4, z0: -3.5, z1: 0.5 }),
  galley: Object.freeze({ x0: -5, x1: -1.4, z0: 1, z1: 4.6 }),
  bathroom: Object.freeze({ x0: 1.4, x1: 3.6, z0: 3.4, z1: 5.6 }),
});

// HUD text per room id, in the HUD's upper-case monospace language.
export const ROOM_NAMES = Object.freeze({
  cockpit: 'COCKPIT',
  corridor: 'CORRIDOR',
  quarters: 'QUARTERS',
  galley: 'GALLEY',
  bathroom: 'BATHROOM',
});

export const ROOM_IDS = Object.freeze(Object.keys(ROOM_BOUNDS));
export const DEFAULT_ROOM = 'corridor'; // the player starts at (0, 0, 4.5)
export const ROOM_MARGIN = 0.3; // metres a player must be inside a room to switch to it

function inside(b, x, z, m) {
  return x >= b.x0 + m && x <= b.x1 - m && z >= b.z0 + m && z <= b.z1 - m;
}

// Rule (hysteresis): the room changes only when the feet are at least
// ROOM_MARGIN inside another room; in a doorway, inside a wall, within the
// margin of an edge, or outside every room, the previous room is kept.
// With no valid previous room, the first room that contains the point
// (ROOM_IDS order) is used, else DEFAULT_ROOM.
export function roomAt(x, z, prev = null) {
  const known = prev != null && Object.hasOwn(ROOM_BOUNDS, prev);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return known ? prev : DEFAULT_ROOM;
  for (const id of ROOM_IDS) {
    if (inside(ROOM_BOUNDS[id], x, z, ROOM_MARGIN)) return id;
  }
  if (known) return prev;
  for (const id of ROOM_IDS) {
    if (inside(ROOM_BOUNDS[id], x, z, 0)) return id;
  }
  return DEFAULT_ROOM;
}

// HUD updater: writes el.textContent only when the room changes (the first
// call always writes once). `writes` counts DOM writes for the screenshot rig.
export function createRoomHud(el) {
  const state = { room: null, text: '', writes: 0 };
  return {
    update(x, z) {
      const next = roomAt(x, z, state.room);
      if (next !== state.room) {
        state.room = next;
        state.text = ROOM_NAMES[next];
        el.textContent = state.text;
        state.writes++;
      }
      return state.room;
    },
    get room() { return state.room; },
    get text() { return state.text; },
    get writes() { return state.writes; },
  };
}
