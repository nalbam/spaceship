# Spaceship

First-person walkable interior of a small Star Wars-style freighter in flight.
Everything is procedural — no downloaded models, textures, or sounds.

**Live demo**: https://nalbam.github.io/spaceship/ — auto-deployed from `main`
by `.github/workflows/deploy.yml` (GitHub Pages, Actions source).

## Run

```bash
npm install
npm run dev      # open the printed URL, click to grab pointer lock
npm test         # unit tests (Node 22+, node:test with mock timers)
```

`npm test` needs Node.js 22 or later. It runs `tests/*.test.js` with the
built-in `node:test` runner against the real modules, a stub DOM, and virtual
time. It needs no browser, GPU, or network. The suites cover:

| Test file | Checks |
| --- | --- |
| `tests/settings.test.js` | settings defaults, nothing stored, broken JSON, wrong structure/types, missing fields, out-of-range clamping, throwing storage, save → load round trip that keeps other keys |
| `tests/player.test.js` | mouse-look sensitivity (default, range, clamping), menu clicks (`[data-no-lock]`) not requesting pointer lock, held keys cleared on lock change |
| `tests/audio.test.js` | every sound effect passes through the master gain; `setMasterVolume` before and after the AudioContext exists |
| `tests/post.test.js` | `setQuality` pass/size/pixel-ratio tiers and their persistence across `setSize` |
| `tests/interact.test.js` | interaction message timing |

To install dependencies without
the Puppeteer browser download, use `PUPPETEER_SKIP_DOWNLOAD=true npm ci`.

- **WASD** move · **Shift** run (hold + forward, slight zoom) · **mouse** look · **Space** jump · **E** interact
- **RMB** aim (zoom) · **LMB** fire · **R** reload
- Interactions: bed (sleep → time skip + rest-cycle lighting), galley (eat), bathroom (refresh)
- **Esc** releases the pointer and pauses. The pause screen has **RESUME**
  (click it, click anywhere outside the buttons, or press Enter on it) and **SETTINGS**.

## Settings

Open **SETTINGS** on the start screen or the pause screen. Use the mouse, or
**Tab** to move between controls and the arrow keys to change a value. Every
change applies at once and is saved. **BACK** (or **Esc**) closes the menu and
keeps the game paused. **BOARD / RESUME** in the menu closes it and grabs the
pointer. Clicks and keys inside the menu never grab the pointer, fire, or
trigger an interaction.

| Setting | Values | Effect |
| --- | --- | --- |
| Graphics quality | `high` (default) | original look: N8AO (Medium) + full-resolution bloom, pixel ratio min(devicePixelRatio, 1.75) |
| | `medium` | N8AO Performance mode, bloom rendered at half resolution |
| | `low` | N8AO and bloom off, renderer pixel ratio 1 |
| Volume | 0–100 % (default 100 %) | master gain of every sound effect; 0 % is silent |
| Mouse sensitivity | 0.25×–3× (default 1×) | multiplier on mouse-look yaw and pitch |

Settings are stored in `localStorage` under the key `spaceship.settings.v1`
only; other keys are not touched. They are applied before the first frame on
the next visit. A missing or broken value falls back to the defaults, an
unknown quality or a non-number field falls back to that field's default, and
a number outside its range is clamped to the nearest bound. If the browser
blocks `localStorage` (or a write fails), the game still runs and the changes
apply for the current session; the menu then shows
`SETTINGS NOT SAVED (STORAGE UNAVAILABLE)` instead of `SETTINGS SAVED`.

## Screenshot / self-review rig

```bash
npm run shoot              # boots vite + headless Chrome (SwiftShader), writes shots/*.png
npm run shoot -- settings  # focused settings-menu check only, writes shots/settings/
```

Puppeteer uses its own downloaded Chrome. To use an installed Chromium
instead (for example after `PUPPETEER_SKIP_DOWNLOAD=true npm ci`), set
`PUPPETEER_EXECUTABLE_PATH=/path/to/chrome`.

The settings check (about 4 minutes with SwiftShader) drives the real menu controls with the
mouse and keyboard: start screen → change quality, volume and sensitivity →
**BOARD** (pointer lock) → walk, mouse look, fire, collision walks, galley
**E** → **Esc** → re-open the menu → change the tier and resize the viewport →
reload → repeat with a `localStorage` that throws, in a 390 px wide viewport.
At each step it compares the menu text with the state actually applied to
`post.js`, `audio.js` (the real master `GainNode`) and `Player`, and with the
stored value. If headless Chromium does not release the lock on Esc, it calls
`document.exitPointerLock()` (same `pointerlockchange` path) and records this
in the report. Any failed check exits with code 1. Output:
`shots/settings/*.png` (before/after screenshots) and
`shots/settings/report.json` (every step's UI text, applied state,
`localStorage` value, console errors and the pass/fail result).

The page exposes `window.__shot` (teleport camera, set space time, force rest
lighting, probe light intensities, scene stats, collision walks, raycast,
audio/position state and `settings()` — menu values vs. applied quality,
volume, sensitivity, pixel ratio and post passes) so the rig can frame deterministic shots and verify
movement, collision, and the interaction flow end to end.

## Architecture

| Module | Responsibility |
| --- | --- |
| `src/main.js` | renderer, scene, PMREM env, frame loop, settings menu wiring (load → apply before first frame, save on change, pause screen), debug rig |
| `src/settings.js` | settings defaults, validation/clamping, JSON parse/serialize, `localStorage` read/write with injected storage (no browser access at import) |
| `src/player.js` | pointer lock (overlay click, `requestLock()`, `[data-no-lock]` menu exclusion), mouse look × sensitivity (`setSensitivity`, 0.25–3), WASD, Shift run, Space jump (gravity, ceiling bump, landing on furniture), head bob, capsule-vs-AABB collision |
| `src/ship.js` | interior kit-bash: corridor, cockpit, quarters, galley, bathroom; lights + rest-cycle mix |
| `src/space.js` | parallax star shells, near dust drift, gas giant + atmosphere rim, nebula billboards |
| `src/interact.js` | center-screen raycast, hover highlight + prompt, sleep/eat/refresh flows, HUD status |
| `src/post.js` | N8AO → UnrealBloom → split toning/vignette/grain → OutputPass (ACES on renderer); `setQuality('low' \| 'medium' \| 'high')`, kept across `setSize` |
| `src/audio.js` | procedural Web Audio footsteps (thump + bandpassed tap) synced to head-bob footfalls, weapon sounds; one master gain, `setMasterVolume(0–1)` (works before the AudioContext exists) |
| `src/textures.js` | canvas-generated PBR maps: painted panels, brushed metal, deck plate, grate, fabric; console screens |

Coordinates: corridor runs along z (-7…7), cockpit forward (-z), floor y=0,
ceiling 2.6 m. Collision is a flat list of `THREE.Box3`: horizontal push-out
against the capsule circle, plus a vertical pass for jumping — land on the
highest box top under the capsule, bump on box bottoms above. Visual detail
never blocks movement.
