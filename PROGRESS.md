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
