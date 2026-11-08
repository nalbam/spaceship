# Render cost before/after: AO-tier RenderPass off + corridor static mesh merge

- Base revision: `38b6b27` (main). "before" = 38b6b27 + measurement hooks only (`src/main.js` `__shot.frameInfo/pause/quality/capture/colliders`, `scripts/shoot.mjs` perf mode); `src/post.js` and `src/ship.js` unchanged. "after" = same + the `src/post.js` and `src/ship.js` changes (both runs: working tree on 38b6b27, see `dirtySrc` in `before/result.json`, `after/result.json`).
- Browser: Playwright `chromium_headless_shell-1208` (arm64 headless shell, `HeadlessChrome/145.0.7632.0`; Puppeteer's own Chrome download is x86-64 and does not run on this aarch64 sandbox), used with `PUPPETEER_EXECUTABLE_PATH`. Before and after ran with the same binary.
- Chromium flags: `--no-sandbox --enable-unsafe-swiftshader --use-angle=swiftshader --disable-dev-shm-usage` (headless, SwiftShader, no GPU).
- Viewport: 480×270, deviceScaleFactor 1. One deterministic frame per tier × room: `__shot.capture(18, 0, 0)` (clock.elapsedTime 18, grain time 0, film grain amount 0 for this frame, flicker/star drift from that time, glints and cockpit screen reset to their initial state, frame loop paused). Grain is a per-pixel hash added the same way before and after; it is turned off only so the 30 PNGs stay small (with the lossless RGB/Paeth/zlib-9 re-encoding in the rig, ~120 KB each instead of ~500 KB) and fit the repository change limit.
- Commands (output in `run.log`):
  ```
  PUPPETEER_EXECUTABLE_PATH=…/chromium_headless_shell-1208/chrome-linux/headless_shell npm run shoot -- perf before   # src/post.js, src/ship.js restored from 38b6b27
  PUPPETEER_EXECUTABLE_PATH=…/chromium_headless_shell-1208/chrome-linux/headless_shell npm run shoot -- perf after
  PUPPETEER_EXECUTABLE_PATH=…/chromium_headless_shell-1208/chrome-linux/headless_shell npm run shoot -- perf compare
  ```
- Counts are `renderer.info.render` summed over one whole `composer.render` (`autoReset=false`). Frame times are not used as evidence (SwiftShader is a CPU renderer); real-GPU timing must be checked on a device.

## Draw calls and triangles per frame (whole composer.render)

| tier | room | calls before | calls after | Δ | tris before | tris after | Δ | diff px | max ch |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| low | corridor | 247 | 160 | -87 | 8636 | 8780 | 144 | 25 | 11 |
| low | cockpit | 57 | 57 | 0 | 1408 | 1408 | 0 | 0 | 0 |
| low | quarters | 90 | 82 | -8 | 9090 | 10374 | 1284 | 0 | 0 |
| low | galley | 74 | 70 | -4 | 4144 | 5476 | 1332 | 0 | 0 |
| low | bathroom | 107 | 94 | -13 | 9438 | 10662 | 1224 | 0 | 0 |
| medium | corridor | 527 | 195 | -332 | 17399 | 8909 | -8490 | 380 | 5 |
| medium | cockpit | 143 | 88 | -55 | 2847 | 1441 | -1406 | 0 | 0 |
| medium | quarters | 209 | 113 | -96 | 21185 | 13381 | -7804 | 1 | 1 |
| medium | galley | 176 | 100 | -76 | 8317 | 5507 | -2810 | 0 | 0 |
| medium | bathroom | 241 | 123 | -118 | 21877 | 13665 | -8212 | 0 | 0 |
| high | corridor | 527 | 195 | -332 | 17399 | 8909 | -8490 | 475 | 5 |
| high | cockpit | 143 | 88 | -55 | 2847 | 1441 | -1406 | 0 | 0 |
| high | quarters | 209 | 113 | -96 | 21185 | 13381 | -7804 | 0 | 0 |
| high | galley | 176 | 100 | -76 | 8317 | 5507 | -2810 | 0 | 0 |
| high | bathroom | 241 | 123 | -118 | 21877 | 13665 | -8212 | 0 | 0 |

`diff px` = pixels whose max RGB channel difference is > 0 (of 129 600); `max ch` = largest channel difference (0–255). Diff images: `diff/low_corridor.png`, `diff/medium_corridor.png`, `diff/high_corridor.png`, `diff/medium_quarters.png` (changed pixels in red over a grey copy of "before"). PNGs: `before/<tier>_<room>.png`, `after/<tier>_<room>.png`.

## Corridor vs. the analysis estimate (527 → 282, about −106 per scene render)

- `low` corridor shows the merge alone (no RenderPass change on `low`): 247 → 160 = **−87 calls per scene render** (estimate −106). The merge turns 108 meshes (ribs 49, ceiling light boxes + frames 12, porthole bolts 16, wall-run band/trim 14 + slabs 7, hatch spokes 6, grate glow 2, red lamps 2) into 8 meshes (one per material): scene meshes 288 → 188 (−100). The measured saving is smaller than −100/−106 because from this camera some of those meshes were already frustum-culled before the merge.
- `medium`/`high` corridor before: 527 (= 247 RenderPass + 280 in N8AO/bloom/grain/output). Removing the RenderPass alone corresponds to 527 − 247 = **280** (estimate 282). With both changes: **527 → 195 (−332, −63 %)**; 280 − 195 = 85 ≈ the −87 of the merge in N8AO's own scene render.
- Other rooms on `medium`/`high`: −55 to −118 calls (mainly the removed RenderPass scene render).

## Other changes in the numbers and the frames — causes and handling

1. **Triangles rise on `low` in quarters/galley/bathroom (+1224…+1332) and corridor (+144); calls still fall.** Cause: frustum culling now tests one bounding sphere per merged material mesh that spans the whole corridor. When any part of it is visible (e.g. through a door) the whole batch is drawn, where before only the visible ribs/bolts were. The rasterised result is the same (off-screen triangles are clipped); frames in those rooms are pixel-identical. Handling: accepted — the batch is small (scene total triangles unchanged at 17 251) and draw calls, the cost the analysis targeted, go down everywhere. On `medium`/`high` the RenderPass removal outweighs it.
2. **Corridor frames differ in 25 (`low`), 380 (`medium`), 475 (`high`) of 129 600 pixels (≤ 0.37 %), max channel difference 11 (`low`) and 5 (`medium`/`high`).** The diff images show isolated pixels at the rib chamfer/beam/post junctions and the wall band edges, where boxes intersect or touch at equal depth. Cause: which overlapping surface wins the depth test at equal depth depends on draw order and on the vertex positions; merging changes the draw order of those primitives and moves the transform from the GPU (modelViewMatrix × position) to a CPU-baked position (`applyMatrix4`), giving last-bit float differences. Handling: accepted as non-visible at play resolution (single scattered pixels, no shape or colour change; see the diff images). No other room changes on `low`; the AO tiers add a few differing pixels where AO samples the same edges.
3. **`medium` quarters: 1 pixel, max difference 1.** Cause: float rounding in the AO/bloom input from the same junction pixels seen through the door. Handling: accepted.
4. Points 13 080 → 8 720 on AO tiers: the star layers were drawn twice (RenderPass + N8AO beauty) and are now drawn once.

## Pass chain (`__shot.settings().applied.passes`)

| tier | before | after |
|---|---|---|
| high | RenderPass on, N8AOPass on, UnrealBloomPass on, ShaderPass on, OutputPass on | RenderPass **off**, N8AOPass on, UnrealBloomPass on, ShaderPass on, OutputPass on |
| medium | RenderPass on, N8AOPass on, UnrealBloomPass on, ShaderPass on, OutputPass on | RenderPass **off**, N8AOPass on, UnrealBloomPass on, ShaderPass on, OutputPass on |
| low | RenderPass on, N8AOPass off, UnrealBloomPass off, ShaderPass on, OutputPass on | same |

Recorded in the order high → low → medium → medium → high → low (tier repeat included); the order and count (5) are unchanged.

## Colliders, collision, interactions (`report.json`)

- Colliders: 58 boxes before and after, `colliders.identical: true` (min/max arrays, same values and order).
- Collision walks: `walk(0,0,0.05,0,60)` → x = 1.08, `walk(0,5,0,0.05,80)` → z = 6.68, before and after (`collision.identical: true`).
- Interactions (`low` tier, `interactions.identical: true`):

| target | ray label | hover / prompt | E result |
|---|---|---|---|
| stove | `E: Eat` | `E: Eat` / `E: Eat` | `YOU EAT. ENERGY RESTORED.`, status changed, energy 100 % |
| bathroom sink | `E: Freshen Up` | `E: Freshen Up` / `E: Freshen Up` | `REFRESHED.` |
| bed | `E: Sleep` | `E: Sleep` / `E: Sleep` | `8 HOURS PASS` |

  The HUD clock and energy text depend on wall time, so the comparison ignores the raw status line but checks that eating changed it and the energy after eating.
- Scene stats: meshes 288 → 188, lights 13, triangles 17 251 (unchanged). Console errors: none in either run.
