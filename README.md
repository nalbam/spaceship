# Spaceship

First-person walkable interior of a small Star Wars-style freighter in flight.
Everything is procedural — no downloaded models, textures, or sounds.

**Live demo**: https://nalbam.github.io/spaceship/ — auto-deployed from `main`
by `.github/workflows/deploy.yml` (GitHub Pages, Actions source).

## Run

```bash
npm install
npm run dev      # open the printed URL, click to grab pointer lock
```

- **WASD** move · **mouse** look · **Space** jump · **E** interact
- Interactions: bed (sleep → time skip + rest-cycle lighting), galley (eat), bathroom (refresh)

## Screenshot / self-review rig

```bash
npm run shoot    # boots vite + headless Chrome (SwiftShader), writes shots/*.png
```

The page exposes `window.__shot` (teleport camera, set space time, force rest
lighting, probe light intensities, scene stats, collision walks, raycast and
audio/position state) so the rig can frame deterministic shots and verify
movement, collision, and the interaction flow end to end.

## Architecture

| Module | Responsibility |
| --- | --- |
| `src/main.js` | renderer, scene, PMREM env, frame loop, debug rig |
| `src/player.js` | pointer lock, WASD, Space jump (gravity, ceiling bump, landing on furniture), head bob, capsule-vs-AABB collision |
| `src/ship.js` | interior kit-bash: corridor, cockpit, quarters, galley, bathroom; lights + rest-cycle mix |
| `src/space.js` | parallax star shells, near dust drift, gas giant + atmosphere rim, nebula billboards |
| `src/interact.js` | center-screen raycast, hover highlight + prompt, sleep/eat/refresh flows, HUD status |
| `src/post.js` | N8AO → UnrealBloom → split toning/vignette/grain → OutputPass (ACES on renderer) |
| `src/audio.js` | procedural Web Audio footsteps (thump + bandpassed tap), synced to head-bob footfalls |
| `src/textures.js` | canvas-generated PBR maps: painted panels, brushed metal, deck plate, grate, fabric; console screens |

Coordinates: corridor runs along z (-7…7), cockpit forward (-z), floor y=0,
ceiling 2.6 m. Collision is a flat list of `THREE.Box3`: horizontal push-out
against the capsule circle, plus a vertical pass for jumping — land on the
highest box top under the capsule, bump on box bottoms above. Visual detail
never blocks movement.
