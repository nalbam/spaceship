# Planet + atmosphere sphere segments: 48×32 → 32×24

결론: 행성 구(`SphereGeometry(260, …)`)와 대기 구(`SphereGeometry(272, …)`)의 segment를 48×32에서 **32×24**로 줄였다. 목표 값 24×16은 1280×720 조종실 창 확대 비교에서 행성 오른쪽 윤곽에 직선 구간과 꺾인 점이 보여 기각했다. draw call 수는 모든 프레임에서 같다. 행성이 그려지는 프레임의 삼각형 수는 −3 008(`low`)·−4 512(`medium`/`high`)이다. 장면 전체 삼각형은 17 251 → 14 243이다.

## 실행 조건

- 기준 revision: `200b89e` (main). before = `200b89e` 작업 트리, `src/` 변경 없음(`before/result.json`의 `dirtySrc: []`). 리그 변경(`scripts/shoot.mjs`)만 작업 트리에 있었다. after = 같은 트리 + `src/space.js` segment 변경(`after/result.json`의 `dirtySrc: ["M src/space.js"]`).
- 브라우저: Playwright `chromium_headless_shell-1254` (`chrome-headless-shell-linux-arm64/chrome-headless-shell`, `HeadlessChrome/158.0.8127.18`)를 `PUPPETEER_EXECUTABLE_PATH`로 지정했다. Puppeteer의 Chrome은 x86-64용이라 이 aarch64 샌드박스에서 실행되지 않는다. before와 after는 같은 binary로 실행했다(`report.json`의 `before.chrome`/`after.chrome`, `executable` 동일, `sameBrowser: true`).
- Chromium flags(전후 동일): `--no-sandbox --enable-unsafe-swiftshader --use-angle=swiftshader --disable-dev-shm-usage` (headless, SwiftShader, GPU 없음).
- 화면: 프레임 18장은 480×270, deviceScaleFactor 1(전후 동일, `report.json`의 `before.viewport`/`after.viewport`). 확대 비교는 1280×720, deviceScaleFactor 1, `high`.
- 프레임: 다섯 공간은 기존 perf 자세와 `__shot.capture(18, 0, 0)`. `cockpit_window`는 전체 리그 `03_cockpit_window`의 자세 (0, 1.7, −9.6, yaw 0, pitch 0.06)와 `__shot.capture(70, 0, 0)`.
- 명령(출력은 `run.log`):
  ```
  PUPPETEER_EXECUTABLE_PATH=…/chrome-headless-shell npm run shoot -- perf before shots/planet-segments    # src/space.js = 200b89e (48×32)
  # src/space.js 24×16
  PUPPETEER_EXECUTABLE_PATH=…/chrome-headless-shell npm run shoot -- perf after shots/planet-segments
  PUPPETEER_EXECUTABLE_PATH=…/chrome-headless-shell npm run shoot -- perf compare shots/planet-segments
  # src/space.js 32×24 (최종) — after와 compare를 다시 실행
  PUPPETEER_EXECUTABLE_PATH=…/chrome-headless-shell npm run shoot -- perf after shots/planet-segments
  PUPPETEER_EXECUTABLE_PATH=…/chrome-headless-shell npm run shoot -- perf compare shots/planet-segments
  ```
- 숫자는 `composer.render` 한 번 전체의 `renderer.info.render`(`autoReset=false`)이다. SwiftShader 프레임 시간은 근거로 쓰지 않는다. 실제 GPU 기기의 시간과 체감 화질은 사람이 확인해야 한다.

## 18개 위치의 draw call·삼각형 (최종 32×24)

| tier | room | calls before | calls after | Δ | tris before | tris after | Δ | diff px | max ch | diff image |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| low | corridor | 160 | 160 | 0 | 8780 | 8780 | 0 | 0 | 0 | `diff/low_corridor.png` |
| low | cockpit | 57 | 57 | 0 | 1408 | 1408 | 0 | 0 | 0 | `diff/low_cockpit.png` |
| low | quarters | 82 | 82 | 0 | 10374 | 7366 | -3008 | 0 | 0 | `diff/low_quarters.png` |
| low | galley | 70 | 70 | 0 | 5476 | 5476 | 0 | 0 | 0 | `diff/low_galley.png` |
| low | bathroom | 94 | 94 | 0 | 10662 | 7654 | -3008 | 0 | 0 | `diff/low_bathroom.png` |
| low | cockpit_window | 39 | 39 | 0 | 7140 | 4132 | -3008 | 1067 | 135 | `diff/low_cockpit_window.png` |
| medium | corridor | 195 | 195 | 0 | 8909 | 8909 | 0 | 0 | 0 | `diff/medium_corridor.png` |
| medium | cockpit | 88 | 88 | 0 | 1441 | 1441 | 0 | 0 | 0 | `diff/medium_cockpit.png` |
| medium | quarters | 113 | 113 | 0 | 13381 | 8869 | -4512 | 0 | 0 | `diff/medium_quarters.png` |
| medium | galley | 100 | 100 | 0 | 5507 | 5507 | 0 | 0 | 0 | `diff/medium_galley.png` |
| medium | bathroom | 123 | 123 | 0 | 13665 | 9153 | -4512 | 0 | 0 | `diff/medium_bathroom.png` |
| medium | cockpit_window | 71 | 71 | 0 | 10149 | 5637 | -4512 | 1051 | 119 | `diff/medium_cockpit_window.png` |
| high | corridor | 195 | 195 | 0 | 8909 | 8909 | 0 | 0 | 0 | `diff/high_corridor.png` |
| high | cockpit | 88 | 88 | 0 | 1441 | 1441 | 0 | 0 | 0 | `diff/high_cockpit.png` |
| high | quarters | 113 | 113 | 0 | 13381 | 8869 | -4512 | 0 | 0 | `diff/high_quarters.png` |
| high | galley | 100 | 100 | 0 | 5507 | 5507 | 0 | 0 | 0 | `diff/high_galley.png` |
| high | bathroom | 123 | 123 | 0 | 13665 | 9153 | -4512 | 0 | 0 | `diff/high_bathroom.png` |
| high | cockpit_window | 71 | 71 | 0 | 10149 | 5637 | -4512 | 1019 | 123 | `diff/high_cockpit_window.png` |
| zoom | cockpit_window | 71 | 71 | 0 | 10149 | 5637 | -4512 | 38034 | 137 | `diff/zoom_cockpit_window.png` |

`diff px` = 최대 RGB 채널 차이가 0보다 큰 픽셀 수(480×270 = 129 600 중, zoom은 780×600 = 468 000 중). `max ch` = 가장 큰 채널 차이(0–255). 차이 이미지는 `diff/`에 18개 위치 모두와 zoom이 있다(바뀐 픽셀은 빨강, 나머지는 before의 어두운 회색 사본). PNG: `before/<tier>_<room>.png`, `after/<tier>_<room>.png`.

## 각 프레임에 행성·대기가 보이는가

| 위치 | 행성·대기 | 근거 |
|---|---|---|
| corridor, cockpit, galley (모든 화질) | 보이지 않음, frustum 밖 | 삼각형 Δ 0, diff px 0. elapsed 18에서 행성은 +x 쪽(약 x 943, z −66)이다. |
| quarters, bathroom (모든 화질) | 화면에 보이지 않음. frustum 안이지만 벽에 가려짐 | 삼각형은 줄었지만(행성이 그려짐) diff px 0. |
| cockpit_window (모든 화질) | 창 정면에 크게 보임 | diff px 1 019–1 067, 바뀐 픽셀은 행성 윤곽과 대기 테두리, 텍스처 띠 경계에 있다. |

## 확대 비교 (판정 근거)

1280×720, `high`, 조종실 창 시점에서 행성 오른쪽 위 윤곽과 대기 테두리가 함께 보이는 영역(x 330, y 270, 260×200)을 잘라 최근접 보간으로 3× 확대했다(780×600).

- before(48×32): `before/zoom_cockpit_window.png`
- after(최종 32×24): `after/zoom_cockpit_window.png`
- diff: `diff/zoom_cockpit_window.png` (38 034 / 468 000 px, max ch 137)
- 기각한 24×16: `rejected_24x16/zoom_cockpit_window.png`, `rejected_24x16/diff_zoom_cockpit_window.png` (56 268 px, max ch 137)

판정:
- 화면상 행성 반지름 R은 1280×720에서 약 280 px이다(확대 영역의 윤곽 곡률에서 어림한 값). 다각형 윤곽 편차 R·(1−cos(π/segW))는 48 → 약 0.6 px, 32 → 약 1.3 px, 24 → 약 2.4 px이다.
- **24×16 (기각)**: 확대본의 오른쪽 윤곽(대기 테두리 포함)에서 직선 구간과 꺾인 점이 보인다. 위쪽 윤곽도 짧은 직선을 이은 모양이다. 편차가 약 2.4 px라 1×에서도 윤곽이 다각형으로 보일 수 있다. 그래서 '눈에 띄게 각짐'으로 판정했다.
- **32×24 (채택)**: 같은 확대본에서 윤곽과 대기 테두리가 before처럼 연속된 곡선으로 보인다. 꺾인 점이 보이지 않는다. 대기 rim 밝기도 띠 모양으로 고르게 이어지며 계단처럼 끊기지 않는다. diff 이미지의 빨간 픽셀은 윤곽을 따라 1–2 px 폭의 띠로 나타난다(윤곽이 약 1 px 안쪽으로 옮겨진 결과). 그 밖에는 행성 텍스처 띠 경계에 흩어진 픽셀만 있다. 1×에서는 편차가 약 1.3 px라 '눈에 띄게 각지지 않았다'고 판정했다.
- 행성과 대기에 같은 값을 쓴다. 대기 rim은 보간된 vertex normal로 계산하므로 행성보다 거칠게 하면 윤곽이 먼저 각진다. 행성만 더 거칠게 하면 대기 테두리 안쪽에 행성 꼭짓점이 드러난다.

## 차이가 생긴 원인과 처리

1. `cockpit_window`의 diff px 약 1 000(0.8 %)과 max ch 123–135: 행성·대기 윤곽이 안쪽으로 최대 약 1 px 옮겨지면서, 그 자리의 픽셀이 행성 색과 우주 배경 색 사이에서 바뀐다. 그래서 채널 차이가 크다. 처리: 확대 비교로 모양을 판정했고 수용한다.
2. 행성 내부의 흩어진 픽셀과 가로 줄: 꼭짓점 사이의 UV·normal 보간 위치가 바뀌어 텍스처 띠 경계와 조명 값이 1 px 단위로 바뀐다. 처리: 수용한다.
3. quarters/bathroom의 삼각형 감소, diff px 0: 행성이 frustum 안에 있어 그려지지만 벽에 가려진다. 원래 비용만 줄었다.
4. `medium`/`high`의 Δ가 `low`의 1.5배: N8AO가 장면을 한 번 더 그릴 때 불투명한 행성은 포함하고, 투명한 대기는 포함하지 않는 것으로 보인다(행성 1 504 + 대기 1 504 + N8AO 행성 1 504 = 4 512). 이 해석은 숫자에서 추론한 것이다.
5. 충돌 상자, 충돌 이동, 상호작용, pass chain은 전후 같다(`report.json`의 `colliders.identical`, `collision.identical`, `interactions.identical` = true).

## 콘솔 오류

before 0, after 0 (24×16 실행과 32×24 실행 모두 `PERF … done … "consoleErrors":0`, `report.json`의 `consoleErrors`). vite가 `THREE.Clock` deprecation 경고를 출력하지만 오류는 아니다.

## 증거 크기

`du -sh shots/planet-segments` = 4.6M (`du -b` 4 680 380 bytes, REPORT.md 작성 전 측정). 작업 한도 10 MiB 안이다. 화면 크기와 확대 영역은 줄이지 않았다.

## 검사

- `npm test`: 43 pass, 0 fail, 종료 코드 0.
- `npm run build`: 종료 코드 0(청크 크기 경고만 있음).
- `git diff --stat -- shots/perf`: 비어 있음. 기존 `shots/perf`는 다시 실행하지 않았다.
