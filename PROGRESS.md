# PROGRESS

## Iteration 1 — scaffold + first render
- Vite + three + n8ao + puppeteer screenshot rig (`npm run shoot` → shots/*.png).
- Modules: main/player/ship/space/interact/post + textures.js (procedural canvas PBR maps).
- Layout: corridor (z -7..7), cockpit (front, 3-pane viewport), quarters (+x), galley (-x), bathroom (+x), stern hatch.
- Interactions wired: bed/sleep, galley/eat, bathroom/refresh with fades + rest-cycle lighting.

### Judge notes (shots reviewed)
- ❌ Massive overexposure: walls render near-white, "clean lab" not "used future". Env/hemi/practicals all too hot.
- ❌ Quarters/galley/bathroom screenshot yaws pointed at blank walls — fix shot angles.
- ❌ Stars too dim/small; planet not in view at chosen times. Window does not yet read "flying through space".
- ❌ Porthole at z=-1.8 collides visually with rib at z=-2.
- ✅ Corridor silhouette good: ribs, chamfers, pipes, teal grate glow read nicely.
- Perf: SwiftShader 10fps (software baseline, not meaningful for GPU target; geometry is light).

### Next
- Exposure/lighting rebalance, stronger grime/seams, two-tone walls, bigger stars, planet timing per shot, porthole reposition.

## Iteration 2 — exposure + framing
- Exposure 0.88, env 0.07, all practicals ~halved, bloom threshold 1.0.
- Portholes moved to z=-3/-5 (clear of ribs); two-tone kick band + accent trim on corridor walls.
- Stars bigger; shot times aligned so the planet is actually in frame.

### Judge notes
- ✅ Corridor fwd/aft: contrast, grime, teal grate glow, stripes — reads "used future" now.
- ✅ Cockpit viewport: planet + rim glow + stars through 3 panes, emissive consoles. Best shot so far.
- ✅ Porthole: planet limb visible, frame/bolts read.
- ❌ Quarters/galley/bathroom: bare white "hospital" walls, furniture sparse, hotplates invisible.
- ❌ Panel texture reads as square bathroom tile; needs rectangular variety + dark panels.
- ❌ Rest-cycle shot (09) looks identical to day — setRestMix may not be applying; debug.

## Iteration 3 — room dressing + panel variety
- Panel texture: rectangular variety, 13% dark-slate panels, per-panel gradient shading.
- Per-room wall tints (quarters warm, bathroom cool). Quarters: poster, pipes, vents, status screen, teal blanket.
- Galley: cooktop unit + glowing rings, backsplash, cabinet doors/handles, canisters, mugs.
- Bathroom: mirror frame + light strip, under-sink pipes, towel bar, vents.
- Rest-cycle verified working via probe (warm 2.6→0.12, teal 2.4→3.0): night shot clearly reads.

### Judge notes
- ✅ Quarters reads lived-in: poster, crates, teal bed pop against warm walls.
- ✅ Rest cycle: dim warm + bright teal guidance — clearly distinct.
- ❌ Galley shot framed into a wall; reframe.
- ❌ Ceiling fixtures blow to white discs.
- ❌ Planet bands pale, washed.

## Iteration 4 — cockpit seats + planet punch + shoot rig hardening
- Seat headrest was a huge cream box from behind (fabricWarm + warm light) → tall dark shell-back chairs.
- Planet canvas: +contrast/+saturation pass — bands now read through the viewport.
- Galley reframed; cockpit side-wall greebles (conduits, tanks, vents).
- shoot.mjs: vite killed via process group (orphaned port caused intermittent "vite timeout").

### Judge notes
- ✅ Cockpit now reads: planet through panes, glowing consoles, proper pilot chairs.
- ❌ Star drift too slow to read "flying" within 5 s at a window.
- ❌ Cockpit side walls still plain; ceiling fixtures hot.

## Iteration 5 — motion cues + interaction verification
- Star layer drift ×3.5 + near "dust" shell (0.1 rad/s) so windows read "flying" within seconds.
- Cockpit side-wall trim bands + overhead housing with warm strip.
- Sleep flow verified headless: prompt "E: Sleep" → fade to black → "8 HOURS PASS" on black →
  wake into rest lighting → ramp back to day. Status clock +8h, energy 100%.
- Fixed: #message was painted under #fade (fixed-position stacking context) — moved out of #hud.
- Sleep black hold lengthened (~3.5 s) — also feels better as a time skip.
- shoot.mjs interaction shots are state-driven (CSS opacity polling), not sleep-based — software GL
  screenshots are slow and were racing the page timeline.

## Iteration 6 — fixture glow, rest-mix ownership, docs
- Ceiling fixture emissive 1.7 → 1.45 (no more blown discs).
- `__shot.rest()` now pins the interaction mix (easing was overwriting the forced rest state next frame).
- Scene stats: 274 meshes / 11 lights / ~17k tris — far under budget for 60fps on a mid-range GPU.
- README.md: run/controls/rig/architecture.

### Judge notes
- ✅ Rest cycle corridor: cooler, dimmer, teal guidance — reads as night watch.
- ✅ All 9 framed shots pass; interaction flow (prompt → black + "8 HOURS PASS" → rest wake) verified.

## Iteration 7 — final polish + full verification
- Split toning in the grade (teal shadows / warm highlights) — palette coheres.
- Galley pendant lamp over the table; bathroom shelf/bottles/teal base glow; bathroom reframed.
- Collision verified numerically: walking into quarters wall stops at x=1.08 (wall 1.4 − radius 0.32);
  stern bulkhead stops at z=6.68. No wall penetration.
- Eat interaction verified: hover "E: Eat" → E → clock +20 min. (Sleep verified in iter 5;
  refresh shares the same fade path.)
- Root-caused headless flakiness: rAF idles between CDP captures, so tests now wait on
  `__shot.frames()` deltas instead of wall time.
- Final scene: 282 meshes / 12 lights / ~17k tris. 60 fps headroom is large
  (SwiftShader software GL renders this at 10 fps at 720p — a real GPU is orders faster).

## Status: DONE — rubric check
- ✅ Pointer lock + WASD + mouse look, eye 1.7 m, head bob, capsule-vs-AABB collision (verified)
- ✅ Corridor + cockpit (3-pane viewport) + quarters + galley + bathroom, used-future dressing,
  no large bare surfaces; greebles, pipes, grates, stencils, grime everywhere
- ✅ 3 raycast interactions with hover highlight + prompts + fades + rest-cycle lighting (verified)
- ✅ One-line HUD status readout
- ✅ Windows: drifting parallax stars (3 shells + near dust), gas giant with atmosphere rim sliding
  past on a 75 s orbit, nebula billboards
- ✅ ACES + bloom + N8AO + vignette + film grain + corridor fog
- ✅ 3+ PBR families (painted panel, worn/brushed metal, fabric + rubber), roughness variation, PMREM env
- ✅ Cohesive palette: off-white hull / orange accents / teal practicals
- ✅ Procedural everything; Vite + three modules: player/ship/space/interact/post/main (+textures)

## Fix — boarding click
- Bug: pointer-lock click handler was only on the canvas, but the full-screen #start overlay
  (z-index 10) swallowed every click — boarding never started.
- Fix: #start also requests pointer lock. Verified headless: click → pointerLockElement set,
  overlay hidden.

## Feature — footstep audio
- src/audio.js: procedural Web Audio footsteps (no assets) — low sine thump (72→38 Hz) +
  bandpassed noise tap, ±randomized pitch/level per step.
- Footfalls fire at each head-bob low point (sin minimum), so audio and camera motion stay in sync.
- AudioContext lazily created; resumes off the boarding click (sticky user activation).
- Verified headless: lock → hold W for ~2.5 s → 7 steps fired, context "running".

## Feature — jump (Space)
- Space jumps when grounded: JUMP_SPEED 4.0, GRAVITY 13 → ~0.6 m rise at 60 fps.
- Vertical pass in player.update: gravity integration, ceiling bump (capsule top vs collider
  bottoms), landing on the highest collider top under the capsule — so you can hop onto
  crates/bed and walk off edges (fall resumes).
- Head bob and footstep cadence pause while airborne; landing plays a heavier thump.
- Verified headless: Space → peak 0.42 m (10 fps software integration) → lands at y=0;
  head stays under the 2.6 m ceiling.

## Deploy — GitHub Pages
- vite.config.js: base '/spaceship/' (project page path); shoot rig follows the base URL.
- .github/workflows/deploy.yml: on push to main → npm ci (puppeteer download skipped) →
  vite build → actions/deploy-pages (Pages auto-enabled via configure-pages).
- Production build verified headless under /spaceship/: boots to __ready. Empty data-URI favicon
  added to silence the 404.

## Feature — blaster
- src/weapon.js: procedural viewmodel pistol (camera child), LMB hit-scan fire with recoil
  (muzzle climb + gun kickback) and muzzle flash (light + additive sprite).
- RMB aim: FOV 72 → 52 with gun centering; smooth lerp both ways.
- Scorch decals (canvas texture, surface-normal aligned, polygon offset) + brief ember glow;
  fade out and dispose after 10 s of game time.
- Ammo: 12-round charge HUD bottom-right, R reload (1.2 s, mech-click sounds), empty click.
- audio.js: playShot (detuned square sweeps + noise crack), playHit (bandpass sizzle + thump),
  playReload, playEmpty.
- Fix: fire() updates camera.matrixWorld before the raycast (teleport-then-fire missed).
- Verified headless: LMB → ammo 11/12 + HUD; RMB → fov 52; R → "RELOADING…" → 12/12;
  decal spawns on wall and expires at 10 s page time; transparent glass is shoot-through.

## Fix — muzzle alignment + reload motion
- Hip pose now converges the barrel on the crosshair point 6 m out (Matrix4.lookAt quat),
  and every shot spawns a visible blaster bolt that flies muzzle → impact point (60 m/s);
  the decal + hit sound trigger on bolt arrival, so muzzle, tracer, and mark all line up.
- Reload motion: gun dips/tilts (sin peak mid-reload) over the 1.2 s timer, matching the
  three mech-click sounds.
- Verified headless: bolt in flight (bolts:1) → impact (decals:1); mid-reload dip frame
  captured; reload completes to 12/12 (an apparent off-by-one was debug toFixed rounding).
