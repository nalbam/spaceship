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
