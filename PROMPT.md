# Prompt

## main

```
# Build: first-person spaceship interior demo (Three.js), self-evaluating loop

You are building a small first-person demo where the player walks around the interior of a medium, Star Wars style spaceship in flight. Gameplay is intentionally tiny. The entire point of this project is how good it looks.
You will work in an autonomous loop: build, screenshot, judge against the rubric, fix, repeat. Do not stop until the stopping condition fires.

## Stack and rules
- Vite + latest three from npm. Split code into modules: player.js, ship.js, space.js, interact.js, post.js, main.js.
- No downloaded models or textures. Everything procedural: canvas-generated albedo/roughness/normal maps, noise-based grime, kit-bashed geometry built from primitives. Sprites and billboards are fine for distant space objects.
- Target 60fps on a mid-range laptop GPU. If something tanks frames, optimize it, do not delete the look.
- Keep a PROGRESS.md log. Commit after every iteration.

## The demo (do not expand this scope)
- First person, pointer lock, WASD plus mouse look, eye height 1.7m, subtle head bob, capsule-vs-box collision so the player cannot walk through walls or furniture.
- Ship interior, used-future Star Wars feel: one main corridor connecting a cockpit with a large viewport, crew quarters with a bed, a small galley, a tiny bathroom. Worn metal, painted panels, pipes, conduits, floor grates, greebles. No large bare surfaces anywhere.
- Three interactions via raycast from screen center, with a hover highlight and a prompt like “E: Sleep”:
  - Bed: fade to black, "8 hours pass", interior lighting shifts to a rest cycle and back.
  - Galley: "You eat. Energy restored."
  - Bathroom: fade to black, "Refreshed."
- A one-line HUD status readout is enough. No inventory, no enemies, no other systems.
- Windows: the cockpit viewport plus one or two corridor portholes. Outside: a parallax starfield that visibly drifts, at least one large planet with an atmosphere rim glow sliding past over roughly 60 to 90 seconds, occasional distant nebula billboards. Standing at a window must read as “flying through space” within 5 seconds.

## The look (this is the actual goal)
Stylized-realistic, the No Man’s Sky / Starfield neighborhood. Clean, slightly cartoonish shapes are fine. Flat, lifeless rendering is not.
- Lighting: deliberate key/fill/accent per room. Warm practical lights inside, cool space light through the windows. Emissive strips and panels that genuinely glow.
- Post-processing: ACES tone mapping, bloom tuned so emissives glow without blowing out, ambient occlusion (N8AO or SSAO), subtle vignette and film grain, light fog down the corridor for depth.
- Materials: at least three distinct PBR families (worn metal, painted panel, fabric/rubber), visible roughness variation, and a PMREM environment so metals reflect something real.
- One cohesive palette, for example off-white hull, orange accents, teal practicals. Nothing default-gray,
...
```

## 2

```
클릭으로 탑승이 되지 않는다
```

## 3

```
걸을 때 발소리가 없다
```

## 4

```
점프가 가능 해야 한다. 스페이스 바로 점프 한다.
```

## 5

```
총을 쏠수 있어야 한다. 마우스 오른쪽 버튼으로 조준 한다. 약간의 줌이 된다. 마우스 왼쪽 버튼으로 발사 한다. 발사 충격이 있다. 발사 소리, 맞는 소리. 맞은 자리에 흔적이 남는다. 잠시후 (10초) 사라진다. 오른쪽 아래 장전된 총알 갯수가 보인다. R 버튼으로 장전 한다.
```

## 6

```
총구의 방향이 충알이 맞는 방향과 어긋나 있다. 장전 모션이 있어야 한다
```

# 7

```
리로드 모션에서 마지막에 총이 마루 회전한다. 자연스러운 리로드 모션이어야 한다
```
