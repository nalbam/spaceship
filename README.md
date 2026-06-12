# Spaceship

First-person walkable interior of a small Star Wars-style freighter in flight.
Everything is procedural — no downloaded models or textures.

## Run

```bash
npm install
npm run dev      # open the printed URL, click to grab pointer lock
```

- **WASD** move · **mouse** look · **E** interact
- Interactions: bed (sleep → time skip + rest-cycle lighting), galley (eat), bathroom (refresh)

## Screenshot / self-review rig

```bash
npm run shoot    # boots vite + headless Chrome (SwiftShader), writes shots/*.png
```

The page exposes `window.__shot` (teleport camera, set space time, force rest
lighting, probe light intensities, scene stats) so the rig can frame
deterministic shots and verify the interaction flow end to end.

## Architecture

| Module | Responsibility |
| --- | --- |
| `src/main.js` | renderer, scene, PMREM env, frame loop, debug rig |
| `src/player.js` | pointer lock, WASD, head bob, capsule-vs-AABB collision |
| `src/ship.js` | interior kit-bash: corridor, cockpit, quarters, galley, bathroom; lights + rest-cycle mix |
| `src/space.js` | parallax star shells, near dust drift, gas giant + atmosphere rim, nebula billboards |
| `src/interact.js` | center-screen raycast, hover highlight + prompt, sleep/eat/refresh flows, HUD status |
| `src/post.js` | N8AO → UnrealBloom → vignette/grain → OutputPass (ACES on renderer) |
| `src/textures.js` | canvas-generated PBR maps: painted panels, brushed metal, deck plate, grate, fabric; console screens |

Coordinates: corridor runs along z (-7…7), cockpit forward (-z), floor y=0,
ceiling 2.6 m. Collision is a flat list of `THREE.Box3` resolved against a
horizontal circle (player capsule), so visual detail never blocks movement.
