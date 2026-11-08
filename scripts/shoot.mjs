// Screenshot rig: spins up vite, drives the scene through window.__shot,
// saves PNGs to shots/ for visual judging.
//   npm run shoot               all scene shots + movement/collision/eat checks
//   npm run shoot -- settings   focused settings-menu check only (shots/settings/)
//   npm run shoot -- rooms      HUD room-name check only (shots/rooms/)
//   npm run shoot -- perf before|after|compare
//                               render cost + deterministic frames per tier × room
//                               (shots/perf/<label>/), compare → shots/perf/report.json
// Set PUPPETEER_EXECUTABLE_PATH to use an already installed Chromium.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const PORT = 5199;
mkdirSync('shots', { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true, // own process group so we can kill the whole tree
});
function killVite() {
  try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* already gone */ }
}
process.on('exit', killVite);
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite timeout')), 20000);
  vite.stdout.on('data', (d) => {
    if (d.toString().includes('Local:')) { clearTimeout(t); res(); }
  });
  vite.stderr.on('data', (d) => {
    process.stderr.write(d);
    if (d.toString().includes('already in use')) { clearTimeout(t); rej(new Error('port busy')); }
  });
});

const CHROME_ARGS = [
  '--no-sandbox',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--disable-dev-shm-usage',
];
const browser = await puppeteer.launch({ headless: true, args: CHROME_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

if (process.argv[2] === 'settings') {
  let code = 0;
  try {
    await runSettingsCheck({ browser, page, url: `http://localhost:${PORT}/spaceship/` });
  } catch (e) {
    console.error('SETTINGS CHECK FAILED:', e.message);
    code = 1;
  }
  await browser.close();
  killVite();
  process.exit(code);
}

if (process.argv[2] === 'perf') {
  let code = 0;
  try {
    await runPerf({ browser, page, url: `http://localhost:${PORT}/spaceship/`, label: process.argv[3] });
  } catch (e) {
    console.error('PERF FAILED:', e.message);
    code = 1;
  }
  await browser.close();
  killVite();
  process.exit(code);
}

if (process.argv[2] === 'rooms') {
  let code = 0;
  try {
    await runRoomsCheck({ page, url: `http://localhost:${PORT}/spaceship/` });
  } catch (e) {
    console.error('ROOMS CHECK FAILED:', e.message);
    code = 1;
  }
  await browser.close();
  killVite();
  process.exit(code);
}

await page.goto(`http://localhost:${PORT}/spaceship/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true', { timeout: 30000 });
// hide start overlay + HUD crosshair noise for clean shots? keep HUD (part of look)
await page.evaluate(() => {
  document.getElementById('start').classList.add('hidden');
});
await new Promise((r) => setTimeout(r, 1500)); // warm up, textures, AO

const SHOTS = [
  // [name, x, y, z, yaw, pitch, spaceTime]
  ['01_corridor_fwd', 0, 1.7, 5.8, 0, 0.02, 18],
  ['02_cockpit', 0, 1.7, -8.4, 0, -0.04, 70],
  ['03_cockpit_window', 0, 1.7, -9.6, 0, 0.06, 70],
  ['04_porthole', -0.4, 1.62, -3.0, Math.PI / 2, 0, 56],
  ['05_quarters', 2.0, 1.7, -0.4, -0.76, -0.1, 18],
  ['06_galley', -2.0, 1.7, 3.9, 1.02, -0.1, 18],
  ['07_bathroom', 1.7, 1.65, 5.3, -0.89, -0.3, 18],
  ['08_corridor_aft', 0, 1.7, -5.5, Math.PI, 0.0, 18],
  ['10_seats', 1.4, 1.5, -10.7, 2.45, -0.35, 18],
];

for (const [name, x, y, z, yaw, pitch, st] of SHOTS) {
  await page.evaluate((args) => {
    const [x, y, z, yaw, pitch, st] = args;
    window.__shot.setTime(st);
    window.__shot.set(x, y, z, yaw, pitch);
  }, [x, y, z, yaw, pitch, st]);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('shot', name);
}

// interaction flow: aim at bed → prompt → E → fade → message → wake lighting
await page.evaluate(() => window.__shot.set(3.0, 1.7, -1.4, -0.67, -0.5));
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: 'shots/11_prompt.png' });
console.log('shot 11_prompt');
const promptVisible = await page.evaluate(() => {
  const el = document.getElementById('prompt');
  return el.style.display !== 'none' ? el.textContent : null;
});
console.log('PROMPT', JSON.stringify(promptVisible));
await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })));
// wait for: full black + message visible (state-driven; screenshots are slow in software GL)
await page.waitForFunction(() => {
  const m = getComputedStyle(document.getElementById('message'));
  const f = getComputedStyle(document.getElementById('fade'));
  return parseFloat(m.opacity) > 0.6 && parseFloat(f.opacity) > 0.95;
}, { timeout: 10000, polling: 50 });
await page.screenshot({ path: 'shots/12_sleep_msg.png' });
console.log('shot 12_sleep_msg');
// wait for fade-out done, shoot the rest-lit room immediately
console.log('FADE NOW', await page.evaluate(() => getComputedStyle(document.getElementById('fade')).opacity));
await page.waitForFunction(
  () => parseFloat(getComputedStyle(document.getElementById('fade')).opacity) < 0.05,
  { timeout: 30000, polling: 100 },
);
await page.evaluate(() => window.__shot.set(2.0, 1.7, -0.4, -0.76, -0.1));
await page.screenshot({ path: 'shots/13_wake_rest.png' });
console.log('shot 13_wake_rest');
console.log('WAKE PROBE', JSON.stringify(await page.evaluate(() => window.__shot.probe())));
const status = await page.evaluate(() => document.getElementById('status').textContent);
console.log('STATUS', JSON.stringify(status));
// let the rest→day ramp settle back before the dedicated rest shot
await new Promise((r) => setTimeout(r, 4500));

// rest-cycle lighting shot
const probes = await page.evaluate(() => {
  const before = window.__shot.probe();
  window.__shot.rest(1);
  window.__shot.set(0, 1.7, 5.8, 0, 0.02);
  return { before, after: window.__shot.probe() };
});
console.log('REST PROBE', JSON.stringify(probes));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: 'shots/09_rest_cycle.png' });
console.log('shot 09_rest_cycle');
console.log('POST-09 PROBE', JSON.stringify(await page.evaluate(() => window.__shot.probe())));
await page.evaluate(() => window.__shot.rest(0));

// collision smoke tests: walk into the quarters wall (+x) and the stern bulkhead (+z)
const col1 = await page.evaluate(() => window.__shot.walk(0, 0, 0.05, 0, 60)); // expect x ≈ 1.08
const col2 = await page.evaluate(() => window.__shot.walk(0, 5, 0, 0.05, 80)); // expect z ≈ 6.68
console.log('COLLISION', JSON.stringify({ col1, col2 }));

// eat interaction: aim at the galley counter, press E, clock/energy should change.
// headless rAF can idle between captures — wait for real frames, not wall time.
async function waitFrames(min) {
  const n0 = await page.evaluate(() => window.__shot.frames());
  await page.waitForFunction(
    (base, k) => window.__shot.frames() > base + k,
    { timeout: 15000, polling: 100 }, n0, min,
  );
}
// stove cooktop is at (-4.6, 0.99, 1.9); the ray reaches 2.6 m
await page.evaluate(() => window.__shot.set(-3.4, 1.7, 1.9, Math.PI / 2, -0.5));
await waitFrames(3);
console.log('IDBG', JSON.stringify(await page.evaluate(() => window.__shot.idbg())));
const eat = await page.evaluate(() => {
  const before = document.getElementById('status').textContent;
  const prompt = document.getElementById('prompt').textContent;
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  return { before, prompt };
});
await new Promise((r) => setTimeout(r, 800));
const eatAfter = await page.evaluate(() => document.getElementById('status').textContent);
console.log('EAT', JSON.stringify({ ...eat, after: eatAfter }));

// stats
const stats = await page.evaluate(() => ({ fps: window.__shot.fps(), scene: window.__shot.stats() }));
console.log('STATS', JSON.stringify(stats));

await browser.close();
killVite();
process.exit(0);

// ---- focused settings-menu check (`npm run shoot -- settings`) ----
// Drives the real menu controls with mouse and keyboard, enters the game with
// the menu's Resume button, releases the lock with Esc, re-opens the menu,
// reloads, and repeats with a throwing localStorage. Every check is an
// assertion: the first failure throws and the script exits with code 1.
// Evidence goes to shots/settings/ (PNG before/after + report.json).
async function runSettingsCheck(ctx) {
  const report = { steps: [], consoleErrors: [], notes: [] };
  try {
    await settingsScenario(ctx, report);
    report.result = 'pass';
  } catch (e) {
    report.result = 'fail';
    report.failure = e.message;
    throw e;
  } finally {
    const { writeFileSync } = await import('node:fs');
    writeFileSync('shots/settings/report.json', JSON.stringify(report, null, 2));
  }
}
async function settingsScenario({ browser, page, url }, report) {
  const OUT = 'shots/settings';
  mkdirSync(OUT, { recursive: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fail = (msg, data) => { throw new Error(`${msg}${data === undefined ? '' : ` — ${JSON.stringify(data)}`}`); };
  const check = (cond, msg, data) => { if (!cond) fail(msg, data); };
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
  const errorsOf = (p) => {
    p.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
    p.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${e.message}`));
  };
  errorsOf(page);
  // record the GainNodes the page creates: audio.js makes its master gain
  // first, so the real gain value can be compared with the menu.
  const tapAudio = () => {
    const proto = (window.AudioContext || window.webkitAudioContext)?.prototype;
    window.__gains = [];
    if (!proto) return;
    const orig = proto.createGain;
    proto.createGain = function (...a) { const g = orig.apply(this, a); window.__gains.push(g); return g; };
  };
  await page.evaluateOnNewDocument(tapAudio);

  const state = (p = page) => p.evaluate(() => ({
    ...window.__shot.settings(),
    stored: localStorage.getItem('spaceship.settings.v1'),
    unrelated: localStorage.getItem('unrelated-key'),
    startHidden: document.getElementById('start').classList.contains('hidden'),
    lockElement: !!document.pointerLockElement,
    hint: document.getElementById('start-hint').textContent,
    board: document.getElementById('board').textContent,
    masterGain: window.__gains?.[0]?.gain.value ?? null,
    weapon: window.__shot.weapon(),
    hud: document.getElementById('status').textContent,
    message: document.getElementById('message').textContent,
  }));
  const step = async (name, p = page) => {
    const s = await state(p);
    report.steps.push({ name, ...s });
    console.log('STEP', name, JSON.stringify({ ui: s.ui, applied: { ...s.applied, passes: undefined }, stored: s.stored, locked: s.locked, masterGain: s.masterGain }));
    return s;
  };
  const shot = async (name, p = page) => { await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', `${OUT}/${name}.png`); };
  const passOn = (s, name) => s.applied.passes.find((x) => x.name === name)?.enabled;
  // UI value, applied post/audio/Player state and storage must agree
  const agree = (s, want, { stored = true } = {}) => {
    check(s.ui.quality === want.quality && s.applied.quality === want.quality, 'quality ui/applied', s);
    check(Number(s.ui.volume) === Math.round(want.volume * 100), 'volume ui', s.ui);
    check(s.ui.volumeText === `${Math.round(want.volume * 100)}%`, 'volume text', s.ui);
    check(near(s.applied.volume, want.volume), 'volume applied', s.applied);
    check(near(Number(s.ui.sensitivity), want.sensitivity) && near(s.applied.sensitivity, want.sensitivity), 'sensitivity ui/applied', s);
    check(s.ui.sensitivityText === `${want.sensitivity.toFixed(2)}×`, 'sensitivity text', s.ui);
    if (s.masterGain !== null) check(Math.abs(s.masterGain - want.volume) < 1e-6, 'master GainNode value', s.masterGain);
    const tier = { high: [true, true], medium: [true, true], low: [false, false] }[want.quality];
    check(passOn(s, 'N8AOPass') === tier[0] && passOn(s, 'UnrealBloomPass') === tier[1], 'AO/bloom passes', s.applied.passes);
    // one scene render per frame: RenderPass only when N8AO (which renders the scene itself) is off
    check(passOn(s, 'RenderPass') === !tier[0], 'RenderPass enabled === !AO', s.applied.passes);
    if (want.quality === 'low') check(s.applied.pixelRatio === 1, 'low pixel ratio', s.applied);
    if (stored) check(JSON.stringify(JSON.parse(s.stored)) === JSON.stringify(want), 'localStorage value', s.stored);
  };
  // headless Chromium may stop producing rAF frames while nothing is
  // captured; a throwaway screenshot forces a frame
  async function waitFrames(p, k) {
    const n0 = await p.evaluate(() => window.__shot.frames());
    const t0 = Date.now();
    while (await p.evaluate(() => window.__shot.frames()) <= n0 + k) {
      if (Date.now() - t0 > 45000) {
        fail('frame loop stalled', await p.evaluate((b) => ({ n0: b, now: window.__shot.frames(), vis: document.visibilityState, focus: document.hasFocus() }), n0));
      }
      await p.screenshot({ type: 'jpeg', quality: 10 });
    }
  }
  async function waitLock(p, want) {
    try {
      // wait for the page's pointerlockchange handlers, not just the element
      await p.waitForFunction((w) => !!document.pointerLockElement === w && window.__shot.settings().locked === w,
        { timeout: 4000, polling: 50 }, want);
      return true;
    } catch { return false; }
  }

  // small viewport: SwiftShader renders only a few frames/s at 1280×720
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  // 1. first visit: no stored value → defaults, start screen
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('unrelated-key', 'keep'));
  await waitFrames(page, 3);
  let s = await step('01_start_defaults');
  check(!s.startHidden && !s.ui.open && !s.locked, 'start screen visible, menu closed, unlocked', s);
  check(s.stored === null && s.ui.status === '', 'nothing stored yet', s);
  agree(s, { quality: 'high', volume: 1, sensitivity: 1 }, { stored: false });
  await shot('01_start_defaults');

  // 2. open the menu with the mouse
  await page.click('#open-settings');
  s = await step('02_menu_open');
  check(s.ui.open && !s.lockElement, 'menu opens without pointer lock', s);
  const ammo0 = s.weapon.ammo, msg0 = s.message;

  // 3. keyboard: quality select (focused on open) high → medium, volume 100 → 35
  check(await page.evaluate(() => document.activeElement.id) === 'set-quality', 'select focused on open');
  await page.keyboard.press('ArrowDown');
  await page.focus('#set-volume');
  for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowLeft');
  // game keys typed into the menu must not reach the game
  for (const k of ['KeyE', 'KeyR', 'KeyW', 'Space']) await page.keyboard.press(k);
  // mouse: click the sensitivity slider at 75% of its track
  await page.$eval('#set-sensitivity', (e) => e.scrollIntoView({ block: 'center' })); // menu scrolls in short viewports
  const box = await (await page.$('#set-sensitivity')).boundingBox();
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  // click empty panel space and the title: must not lock or fire
  await page.click('#settings-title');
  await page.mouse.click(5, 5); // overlay backdrop while the menu is open
  await sleep(300);
  s = await step('03_menu_changed');
  const sens1 = Number(s.ui.sensitivity);
  check(sens1 > 1.5 && sens1 < 3, 'mouse moved sensitivity', s.ui);
  const want1 = { quality: 'medium', volume: 0.35, sensitivity: sens1 };
  agree(s, want1);
  check(s.ui.status === 'SETTINGS SAVED' && !s.ui.statusError, 'saved status', s.ui);
  check(!s.lockElement && s.ui.open, 'menu input did not grab the pointer', s);
  // the HUD clock ticks on its own, so the interaction check uses the
  // sleep/eat/refresh message line, which only changes on an interaction
  check(s.weapon.ammo === ammo0 && s.weapon.decals === 0 && s.message === msg0, 'menu input did not fire or interact', { ammo0, msg0, w: s.weapon, msg: s.message });
  check(s.unrelated === 'keep', 'other localStorage keys kept');
  await shot('03_menu_changed');

  // 4. enter the game with the menu's Board/Resume button
  await page.click('#resume-settings');
  check(await waitLock(page, true), 'pointer lock acquired from the Resume button');
  s = await step('04_in_game');
  check(s.startHidden && !s.ui.open && s.locked, 'overlay hidden while playing', s);

  // movement with real keys, mouse look at the chosen sensitivity, fire
  const p0 = await page.evaluate(() => window.__shot.pos());
  await page.keyboard.down('KeyW');
  await waitFrames(page, 3);
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => window.__shot.pos());
  check(p1.z < p0.z - 0.2, 'W moves the player forward after settings', { p0, p1 });
  const yawDelta = await page.evaluate(() => {
    const read = () => window.__shot.settings().yaw;
    const a = read();
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: 0 }));
    return a - read();
  });
  check(near(yawDelta, 100 * 0.0023 * sens1, 1e-9), 'mouse look uses the saved sensitivity', { yawDelta, sens1 });
  await page.mouse.click(320, 240);
  await sleep(200);
  s = await step('04b_after_fire');
  check(s.weapon.ammo === ammo0 - 1, 'LMB still fires in game', s.weapon);
  check(s.masterGain !== null && Math.abs(s.masterGain - 0.35) < 1e-6, 'real master GainNode at saved volume', s.masterGain);
  // collision (same walks as the full rig) and the galley eat interaction
  const col = await page.evaluate(() => ({ a: window.__shot.walk(0, 0, 0.05, 0, 60), b: window.__shot.walk(0, 5, 0, 0.05, 80) }));
  check(near(col.a.x, 1.08, 0.03) && near(col.b.z, 6.68, 0.03), 'collision stops at walls', col);
  // face the stove cooktop (-4.6, 0.99, 1.9) from 1.4 m away (ray far = 2.6 m)
  await page.evaluate(() => window.__shot.set(-3.4, 1.7, 1.9, Math.PI / 2, -0.5));
  await waitFrames(page, 3);
  const hover = await page.evaluate(() => ({ dbg: window.__shot.idbg(), prompt: document.getElementById('prompt').textContent }));
  check(hover.dbg.hovered === 'E: Eat' && hover.prompt === 'E: Eat', 'stove hovered with E: Eat prompt', hover);
  const prompt = hover.prompt;
  await page.keyboard.press('KeyE');
  await sleep(900);
  const hudAfterEat = await page.evaluate(() => document.getElementById('message').textContent);
  check(/YOU EAT/.test(hudAfterEat), 'E interaction still works in game', { prompt, hudAfterEat });
  await page.evaluate(() => { window.__shot.release(); });
  report.movement = { p0, p1, yawDelta, col, prompt, hudAfterEat };

  // 5. Esc releases the lock → pause screen
  await sleep(1200); // let the eat fade finish
  await page.keyboard.press('Escape');
  let escWorked = await waitLock(page, false);
  if (!escWorked) {
    report.notes.push('Esc key did not release pointer lock in headless Chromium; used document.exitPointerLock() (same pointerlockchange path)');
    await page.evaluate(() => document.exitPointerLock());
    check(await waitLock(page, false), 'exitPointerLock released the lock');
  }
  report.escReleasedLock = escWorked;
  s = await step('05_paused');
  check(!s.startHidden && !s.locked && s.board === 'RESUME' && s.hint.startsWith('PAUSED'), 'pause screen after unlock', s);
  await shot('05_paused');

  // 5b. regression (review of abcbd43): facing an interactable with the menu
  // open, a click on the title or backdrop moves focus to BODY; E must still
  // do nothing and Esc must close only the menu.
  await page.evaluate(() => window.__shot.set(-3.4, 1.7, 1.9, Math.PI / 2, -0.5));
  await waitFrames(page, 3);
  let iso = await page.evaluate(() => window.__shot.idbg());
  check(iso.hovered === 'E: Eat' && !iso.busy, 'paused player faces the stove', iso);
  await page.click('#open-settings');
  await page.click('#settings-title');
  await page.mouse.click(5, 5);
  const msgEl = () => page.evaluate(() => document.getElementById('message').textContent);
  await page.evaluate(() => { document.getElementById('message').textContent = 'SENTINEL'; });
  iso = await page.evaluate(() => ({ focus: document.activeElement.tagName, open: !document.getElementById('settings').hidden }));
  check(iso.focus === 'BODY' && iso.open, 'focus on BODY with the menu open', iso);
  for (const k of ['KeyE', 'KeyR', 'KeyW']) await page.keyboard.press(k);
  await sleep(900);
  s = await step('05b_menu_body_focus_keys');
  check(s.message === 'SENTINEL' && !(await page.evaluate(() => window.__shot.idbg().busy)), 'E with BODY focus did not interact', { message: s.message });
  check(s.weapon.ammo === ammo0 - 1 && !s.lockElement, 'R/W with BODY focus did nothing', s.weapon);
  await page.keyboard.press('Escape');
  s = await step('05c_esc_closes_menu');
  check(!s.ui.open && !s.startHidden && !s.lockElement && s.board === 'RESUME', 'Esc with BODY focus closes only the menu', s);
  // pause screen without the menu: E is still blocked
  await page.evaluate(() => { document.activeElement?.blur?.(); });
  await page.keyboard.press('KeyE');
  await sleep(900);
  check(await msgEl() === 'SENTINEL', 'E on the pause screen did not interact', await msgEl());
  await shot('05c_after_esc');
  await page.evaluate(() => window.__shot.release());

  // 6. re-open the menu: values kept; keyboard to low, volume +5
  await page.keyboard.press('Tab'); // keyboard path to the Settings button
  await page.focus('#open-settings');
  await page.keyboard.press('Enter');
  s = await step('06_menu_reentry');
  check(s.ui.open && !s.lockElement, 'menu re-opened from pause by keyboard', s);
  agree(s, want1);
  await page.keyboard.press('ArrowDown'); // medium → low
  await page.focus('#set-volume');
  await page.keyboard.press('ArrowRight');
  s = await step('06b_low');
  const want2 = { quality: 'low', volume: 0.4, sensitivity: sens1 };
  agree(s, want2);
  check(!s.lockElement, 'still unlocked');
  await shot('06_menu_low');

  // 7. resize keeps the tier
  await page.setViewport({ width: 480, height: 320, deviceScaleFactor: 1 });
  await waitFrames(page, 2);
  s = await step('07_resize_low');
  check(s.applied.quality === 'low' && s.applied.pixelRatio === 1 && s.applied.drawingBuffer.w === 480 && s.applied.drawingBuffer.h === 320, 'low survives resize', s.applied);
  await page.focus('#set-quality');
  await page.keyboard.press('ArrowUp'); // low → medium
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  await waitFrames(page, 2);
  const med = await step('07b_resize_medium');
  await page.keyboard.press('ArrowUp'); // medium → high
  await waitFrames(page, 2);
  const high = await step('07c_high');
  check(med.applied.quality === 'medium' && high.applied.quality === 'high', 'tiers via keyboard', { m: med.applied.quality, h: high.applied.quality });
  check(med.applied.bloomWidth * 2 === high.applied.bloomWidth && med.applied.drawingBuffer.w === 640, 'medium bloom half size after resize', { m: med.applied, h: high.applied.bloomWidth });
  // back to the low tier for the reload check, by keyboard
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  // close with Esc inside the menu (not a pointer-lock key here)
  await page.keyboard.press('Escape');
  s = await step('07d_closed');
  check(!s.ui.open && !s.lockElement && !s.startHidden, 'Esc closes the menu, overlay stays', s);
  agree(s, want2);

  // 8. reload: UI and applied state restored from storage
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  await waitFrames(page, 3);
  await page.click('#open-settings');
  s = await step('08_after_reload');
  agree(s, want2);
  check(s.ui.status === '' && s.unrelated === 'keep', 'clean status, other keys kept', s);
  await shot('08_after_reload');

  // 9. storage that throws: game runs, session settings apply, failure shown
  const p2 = await browser.newPage();
  errorsOf(p2);
  await p2.setViewport({ width: 390, height: 700, deviceScaleFactor: 1 }); // narrow phone-size viewport
  await p2.evaluateOnNewDocument(tapAudio);
  await p2.evaluateOnNewDocument(() => {
    Storage.prototype.getItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
  });
  await p2.goto(url, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction('window.__ready === true', { timeout: 30000 });
  await waitFrames(p2, 3);
  const st = () => p2.evaluate(() => ({ ...window.__shot.settings(), lockElement: !!document.pointerLockElement }));
  let f = await st();
  check(f.ui.statusError && /NOT SAVED/.test(f.ui.status), 'load failure shown', f.ui);
  check(f.applied.quality === 'high' && f.applied.volume === 1 && f.applied.sensitivity === 1, 'defaults applied', f.applied);
  await p2.click('#open-settings');
  await p2.focus('#set-volume');
  for (let i = 0; i < 4; i++) await p2.keyboard.press('ArrowLeft');
  await p2.focus('#set-quality');
  await p2.keyboard.press('ArrowDown');
  f = await st();
  check(f.applied.quality === 'medium' && near(f.applied.volume, 0.8) && f.ui.volumeText === '80%', 'session settings applied without storage', f);
  check(f.ui.statusError && /NOT SAVED/.test(f.ui.status), 'save failure shown, not "saved"', f.ui);
  const menuFits = await p2.evaluate(() => {
    const r = document.getElementById('settings').getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
  });
  check(menuFits.left >= 0 && menuFits.right <= menuFits.vw && menuFits.top >= 0 && menuFits.bottom <= menuFits.vh, 'menu fits a 390 px viewport', menuFits);
  report.storageFailure = { ...f, menuFits };
  await p2.screenshot({ path: `${OUT}/09_storage_failure_narrow.png` });
  console.log('shot', `${OUT}/09_storage_failure_narrow.png`);
  await p2.click('#resume-settings');
  check(await waitLock(p2, true), 'game starts with blocked storage');
  await p2.close();

  check(report.consoleErrors.length === 0, 'no console errors', report.consoleErrors);
  console.log('SETTINGS CHECK PASSED', JSON.stringify({ escReleasedLock: report.escReleasedLock, notes: report.notes }));
}

// ---- focused HUD room-name check (`npm run shoot -- rooms`) ----
// Moves the real player (window.__shot.place → player.position, not only the
// camera) into each room, lets the frame loop update #room, and compares the
// text with src/rooms.js. Then steps the player through the quarters door and
// jitters at the cockpit door, and checks that the number of #room DOM writes
// equals the number of room changes. Checks #room's rect against the other HUD
// elements at 1280×720 and 390×844 and collects console errors.
// Evidence: shots/rooms/<nn>_<room>.png, report.json (run.log via tee).
async function runRoomsCheck(ctx) {
  const report = { steps: [], consoleErrors: [], notes: [] };
  try {
    await roomsScenario(ctx, report);
    if (report.consoleErrors.length) throw new Error(`console errors: ${report.consoleErrors.length}`);
    report.result = 'pass';
  } catch (e) {
    report.result = 'fail';
    report.failure = e.message;
    throw e;
  } finally {
    const { writeFileSync } = await import('node:fs');
    writeFileSync('shots/rooms/report.json', JSON.stringify(report, null, 2));
  }
}
async function roomsScenario({ page, url }, report) {
  const OUT = 'shots/rooms';
  mkdirSync(OUT, { recursive: true });
  const { roomAt, ROOM_NAMES } = await import('../src/rooms.js');
  const check = (cond, msg, data) => {
    if (!cond) throw new Error(`${msg}${data === undefined ? '' : ` — ${JSON.stringify(data)}`}`);
  };
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${e.message}`));
  const frames = () => page.evaluate(() => window.__shot.frames());
  async function waitFrames(k) {
    const n0 = await frames();
    await page.waitForFunction((b, n) => window.__shot.frames() >= b + n, { timeout: 15000, polling: 20 }, n0, k);
  }
  const room = () => page.evaluate(() => window.__shot.room());

  // SwiftShader renders the high tier at several seconds per frame; the HUD
  // check needs many frames, so it runs on the low tier (stored through the
  // game's own settings key in this fresh headless profile).
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('spaceship.settings.v1', JSON.stringify({ quality: 'low', volume: 1, sensitivity: 1 }));
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  await page.evaluate(() => document.getElementById('start').classList.add('hidden'));
  await waitFrames(3);
  report.quality = await page.evaluate(() => window.__shot.settings().applied.quality);
  check(report.quality === 'low', 'low tier applied', report.quality);
  const initial = await room();
  check(initial.id === 'corridor' && initial.dom === 'CORRIDOR' && initial.writes === 1,
    'start position shows CORRIDOR after one write', initial);
  report.steps.push({ step: 'start', room: initial, pass: true });

  // 1. each room: real player position, frame-loop update, screenshot
  const ROOMS = [
    // [file, expected id, feet x, feet z, yaw, pitch]
    ['01_corridor', 'corridor', 0, 5.8, 0, 0.02],
    ['02_cockpit', 'cockpit', 0, -8.4, 0, -0.04],
    ['03_quarters', 'quarters', 2.0, -0.4, -0.76, -0.1],
    ['04_galley', 'galley', -2.0, 3.9, 1.02, -0.1],
    ['05_bathroom', 'bathroom', 1.9, 5.0, -0.89, -0.3],
  ];
  let prevId = initial.id;
  for (const [file, id, x, z, yaw, pitch] of ROOMS) {
    const before = await room();
    await page.evaluate((a) => window.__shot.place(...a), [x, z, yaw, pitch]);
    await waitFrames(2);
    const pos = await page.evaluate(() => window.__shot.pos());
    const after = await room();
    const expectedText = ROOM_NAMES[id];
    const expectedWrites = before.writes + (id === prevId ? 0 : 1);
    const step = {
      step: `room ${id}`, screenshot: `${OUT}/${file}.png`,
      playerPosition: { x: pos.x, y: pos.y, z: pos.z },
      expectedText, actualText: after.dom, updaterText: after.text, id: after.id,
      writesBefore: before.writes, writesAfter: after.writes, expectedWrites,
    };
    step.pass = Math.abs(pos.x - x) < 1e-9 && Math.abs(pos.z - z) < 1e-9
      && after.id === id && after.dom === expectedText && after.text === expectedText
      && after.writes === expectedWrites;
    report.steps.push(step);
    await page.screenshot({ path: `${OUT}/${file}.png` });
    console.log('room', id, JSON.stringify({ pos: step.playerPosition, text: after.dom, writes: after.writes }));
    check(step.pass, `room ${id}`, step);
    prevId = id;
  }

  // 2. movement sequences: writes must equal room changes (browser and rooms.js agree)
  async function sequence(name, points) {
    const start = await room();
    const ids = [];
    let expect = start.id, expectedChanges = 0;
    for (const [x, z] of points) {
      await page.evaluate((a) => window.__shot.place(a[0], a[1]), [x, z]);
      await waitFrames(1);
      const r = await room();
      ids.push(r.id);
      const next = roomAt(x, z, expect);
      if (next !== expect) expectedChanges++;
      expect = next;
    }
    const end = await room();
    const observedChanges = ids.filter((id, i) => id !== (i ? ids[i - 1] : start.id)).length;
    const step = {
      step: name, points, ids, startRoom: start.id, endRoom: end.id, endText: end.dom,
      writes: end.writes - start.writes, observedChanges, expectedChanges,
    };
    step.pass = step.writes === observedChanges && observedChanges === expectedChanges
      && end.dom === ROOM_NAMES[end.id];
    report.steps.push(step);
    console.log('sequence', name, JSON.stringify({ ids, writes: step.writes, observedChanges, expectedChanges }));
    check(step.pass, name, step);
    return step;
  }
  await page.evaluate(() => window.__shot.place(0, -1.5, -Math.PI / 2, 0));
  await waitFrames(2);
  const cross = [];
  for (let i = 0; i <= 15; i++) cross.push([+(i * 0.2).toFixed(2), -1.5]); // corridor x=0 → quarters x=3
  for (let i = 14; i >= 0; i -= 2) cross.push([+(i * 0.2).toFixed(2), -1.5]); // and back
  const s1 = await sequence('walk through the quarters door (x = 1.4) and back', cross);
  check(s1.expectedChanges === 2, 'door walk has two room changes', s1);
  const jitter = [-6.5, -6.9, -7.1, -7.25, -6.95, -7.2, -6.8, -7.28, -7.6, -7.1, -6.8, -7.2, -6.75, -6.5]
    .map((z) => [0, z]);
  const s2 = await sequence('jitter at the cockpit door (z = -7)', jitter);
  check(s2.expectedChanges === 2, 'cockpit door jitter changes only when well inside', s2);

  // 3. layout: #room must not overlap the other HUD elements
  async function layout(w, h) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await waitFrames(2);
    const rects = await page.evaluate(() => {
      const prompt = document.getElementById('prompt');
      const saved = { display: prompt.style.display, text: prompt.textContent };
      prompt.style.display = 'block';
      prompt.textContent = 'E — SLEEP';
      const r = {};
      for (const id of ['room', 'status', 'ammo', 'crosshair', 'prompt']) {
        const b = document.getElementById(id).getBoundingClientRect();
        r[id] = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      }
      prompt.style.display = saved.display;
      prompt.textContent = saved.text;
      return r;
    });
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const overlaps = ['status', 'ammo', 'crosshair', 'prompt'].filter((id) => hit(rects.room, rects[id]));
    const r = rects.room;
    const onScreen = r.left >= 0 && r.top >= 0 && r.right <= w && r.bottom <= h;
    const step = { step: `layout ${w}x${h}`, rects, overlaps, roomOnScreen: onScreen, pass: overlaps.length === 0 && onScreen };
    report.steps.push(step);
    console.log('layout', `${w}x${h}`, JSON.stringify({ room: r, overlaps, onScreen }));
    check(step.pass, `layout ${w}x${h}`, step);
  }
  await layout(1280, 720);
  await layout(390, 844);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  report.consoleErrorCount = report.consoleErrors.length;
  report.seconds = +((Date.now() - t0) / 1000).toFixed(1);
  report.notes.push('Players are moved with window.__shot.place (sets player.position, releases debug camera); the HUD is updated by the frame loop in src/main.js, not by the rig.');
  report.fps = await page.evaluate(() => window.__shot.fps());
  console.log('consoleErrors', report.consoleErrors.length, 'seconds', report.seconds, 'fps', report.fps);
}

// ---- render cost before/after (`npm run shoot -- perf before|after|compare`) ----
// before/after: one page load at 480×270 (deviceScaleFactor 1). Records the
// pass chain of each tier, the collider boxes, the collision walks and, with
// the frame loop paused, one deterministic frame per tier × room
// (window.__shot.capture: fixed clock, flicker, star drift, film grain off
// so the PNGs stay small and compare exactly): the
// draw calls/triangles of the whole composer.render and the canvas PNG.
// Then the bed/stove/bathroom interactions on the low tier.
// Output: shots/perf/<label>/<tier>_<room>.png and result.json.
// compare: reads both result.json files, compares the PNGs pixel by pixel in
// a browser canvas (no extra dependency), writes shots/perf/report.json and
// shots/perf/diff/<tier>_<room>.png for frames that differ.
// Frame times are not recorded: SwiftShader is a CPU renderer.
async function runPerf({ browser, page, url, label }) {
  const PERF_TIERS = ['low', 'medium', 'high'];
  const PERF_ROOMS = [ // same feet positions/yaw/pitch as the rooms check, eye height 1.7
    ['corridor', 0, 5.8, 0, 0.02],
    ['cockpit', 0, -8.4, 0, -0.04],
    ['quarters', 2.0, -0.4, -0.76, -0.1],
    ['galley', -2.0, 3.9, 1.02, -0.1],
    ['bathroom', 1.9, 5.0, -0.89, -0.3],
  ];
  const PERF_VIEWPORT = { width: 480, height: 270, deviceScaleFactor: 1 };
  const { writeFileSync, readFileSync, existsSync } = await import('node:fs');
  const { execSync } = await import('node:child_process');
  const ROOT = 'shots/perf';
  if (label === 'compare') return perfCompare({ browser, page, ROOT, writeFileSync, readFileSync, existsSync });
  if (label !== 'before' && label !== 'after') throw new Error('usage: npm run shoot -- perf before|after|compare');
  const OUT = `${ROOT}/${label}`;
  mkdirSync(OUT, { recursive: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rev = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return null; } })();
  const dirty = (() => { try { return execSync('git status --porcelain src').toString().trim().split('\n').filter(Boolean); } catch { return null; } })();
  const result = {
    label, revision: rev, dirtySrc: dirty, chrome: await browser.version(), chromeArgs: CHROME_ARGS,
    viewport: PERF_VIEWPORT, consoleErrors: [], passes: {}, frames: {},
  };
  page.on('console', (m) => { if (m.type() === 'error') result.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => result.consoleErrors.push(`pageerror: ${e.message}`));
  async function waitFrames(k) {
    const n0 = await page.evaluate(() => window.__shot.frames());
    const t0 = Date.now();
    while (await page.evaluate(() => window.__shot.frames()) <= n0 + k) {
      if (Date.now() - t0 > 60000) throw new Error('frame loop stalled');
      await page.screenshot({ type: 'jpeg', quality: 10 }); // headless may idle rAF
    }
  }
  await page.setViewport(PERF_VIEWPORT);
  // start on the low tier so the warm-up frames are fast
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('spaceship.settings.v1', JSON.stringify({ quality: 'low', volume: 1, sensitivity: 1 }));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  await page.evaluate(() => document.getElementById('start').classList.add('hidden'));
  await waitFrames(3);

  // pass chain per tier, in an order that also repeats a tier
  for (const tier of ['high', 'low', 'medium', 'medium', 'high', 'low']) {
    const passes = await page.evaluate((t) => { window.__shot.quality(t); return window.__shot.settings().applied.passes; }, tier);
    result.passes[tier] = passes;
    console.log('PASSES', tier, JSON.stringify(passes));
  }
  result.colliders = await page.evaluate(() => window.__shot.colliders());
  console.log('COLLIDERS', result.colliders.length);
  result.collision = await page.evaluate(() => ({ a: window.__shot.walk(0, 0, 0.05, 0, 60), b: window.__shot.walk(0, 5, 0, 0.05, 80) }));
  console.log('COLLISION', JSON.stringify(result.collision));
  result.sceneStats = await page.evaluate(() => window.__shot.stats());
  console.log('SCENE', JSON.stringify(result.sceneStats));

  // deterministic frames: loop paused, one render per tier × room
  await page.evaluate(() => window.__shot.pause(true));
  for (const tier of PERF_TIERS) {
    await page.evaluate((t) => window.__shot.quality(t), tier);
    for (const [room, x, z, yaw, pitch] of PERF_ROOMS) {
      const { info, png } = await page.evaluate((a) => {
        window.__shot.set(a[0], 1.7, a[1], a[2], a[3]);
        return window.__shot.capture(18, 0, 0); // grain off: small, exact PNGs
      }, [x, z, yaw, pitch]);
      const file = `${OUT}/${tier}_${room}.png`;
      writeFileSync(file, await compactPng(Buffer.from(png.split(',')[1], 'base64')));
      result.frames[`${tier}_${room}`] = { ...info, png: file };
      console.log('FRAME', tier, room, JSON.stringify(info));
    }
  }

  // interactions on the low tier with the loop running again
  await page.evaluate(() => { window.__shot.quality('low'); window.__shot.pause(false); });
  const dom = () => page.evaluate(() => ({
    prompt: document.getElementById('prompt').textContent,
    promptShown: document.getElementById('prompt').style.display !== 'none',
    message: document.getElementById('message').textContent,
    status: document.getElementById('status').textContent,
  }));
  const energy = (st) => Number(/(\d+)\s*%/.exec(st)?.[1] ?? NaN);
  async function aim(pose) {
    await page.evaluate((p) => window.__shot.set(...p), pose);
    await waitFrames(3);
    const hover = await page.evaluate(() => ({ ray: window.__shot.ray(), idbg: window.__shot.idbg().hovered }));
    return { ...hover, ray: hover.ray.map((r) => r && r.label), ...(await dom()) };
  }
  async function press(waitMs, until) {
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })));
    if (until) await page.waitForFunction(until, { timeout: 15000, polling: 50 });
    else await sleep(waitMs);
    return dom();
  }
  const idle = () => page.waitForFunction(() => !window.__shot.idbg().busy, { timeout: 20000, polling: 100 });
  const it = {};
  // stove cooktop (-4.6, 0.99, 1.9) from 1.2 m
  it.eat = { hover: await aim([-3.4, 1.7, 1.9, Math.PI / 2, -0.5]) };
  it.eat.after = await press(700);
  it.eat.energyBefore = energy(it.eat.hover.status);
  it.eat.energyAfter = energy(it.eat.after.status);
  it.eat.statusChanged = it.eat.after.status !== it.eat.hover.status;
  await idle();
  // bathroom sink (3.3, 0.85, 4.0) from 1 m
  it.refresh = { hover: await aim([2.3, 1.7, 4.0, -Math.PI / 2, -0.75]) };
  it.refresh.after = await press(0, () => /REFRESHED/.test(document.getElementById('message').textContent));
  await idle();
  // bed (same pose as the full rig's prompt shot)
  it.sleep = { hover: await aim([3.0, 1.7, -1.4, -0.67, -0.5]) };
  it.sleep.after = await press(0, () => /HOURS PASS/.test(document.getElementById('message').textContent));
  it.sleep.energyAfter = energy(it.sleep.after.status);
  result.interactions = it;
  console.log('INTERACT', JSON.stringify(it));
  writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
  console.log('PERF', label, 'done', JSON.stringify({ revision: rev, dirtySrc: dirty, consoleErrors: result.consoleErrors.length }));
  if (result.consoleErrors.length) throw new Error(`console errors: ${JSON.stringify(result.consoleErrors)}`);
}

// Lossless PNG re-encoder for the perf evidence: Chrome's toDataURL PNG uses
// fast compression and keeps an opaque alpha channel. Re-encode as 8-bit RGB
// (when alpha is all 255), Paeth filter, zlib level 9 — same pixels, ~40 %
// fewer bytes, so the 30 before/after frames stay small in the repository.
async function compactPng(buf) {
  const zlib = await import('node:zlib');
  let i = 8, ihdr = null; const idat = [];
  while (i < buf.length) {
    const n = buf.readUInt32BE(i), t = buf.toString('latin1', i + 4, i + 8);
    if (t === 'IHDR') ihdr = buf.subarray(i + 8, i + 8 + n);
    else if (t === 'IDAT') idat.push(buf.subarray(i + 8, i + 8 + n));
    i += 12 + n;
  }
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  if (ihdr[8] !== 8 || ihdr[12] !== 0 || (ihdr[9] !== 6 && ihdr[9] !== 2)) return buf; // only 8-bit RGB(A), non-interlaced
  const bpp = ihdr[9] === 6 ? 4 : 3, st = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * st);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], src = y * (st + 1) + 1, o = y * st;
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - st + x] : 0, c = x >= bpp && y ? px[o - st + x - bpp] : 0;
      const v = raw[src + x];
      px[o + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255;
    }
  }
  let opaque = bpp === 4;
  for (let k = 3; opaque && k < px.length; k += 4) if (px[k] !== 255) opaque = false;
  const nb = opaque ? 3 : bpp, ost = w * nb, out = Buffer.alloc(h * (ost + 1));
  const at = (y, x) => (opaque ? px[y * st + Math.floor(x / 3) * 4 + (x % 3)] : px[y * st + x]);
  for (let y = 0; y < h; y++) {
    const o = y * (ost + 1); out[o] = 4;
    for (let x = 0; x < ost; x++) {
      const a = x >= nb ? at(y, x - nb) : 0, b = y ? at(y - 1, x) : 0, c = x >= nb && y ? at(y - 1, x - nb) : 0;
      out[o + 1 + x] = (at(y, x) - paeth(a, b, c)) & 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const tb = Buffer.concat([Buffer.from(t, 'latin1'), d]); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(tb)); return Buffer.concat([l, tb, c]); };
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = opaque ? 2 : 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

async function perfCompare({ page, ROOT, writeFileSync, readFileSync, existsSync }) {
  const load = (l) => {
    const f = `${ROOT}/${l}/result.json`;
    if (!existsSync(f)) throw new Error(`missing ${f}: run perf ${l} first`);
    return JSON.parse(readFileSync(f, 'utf8'));
  };
  const before = load('before'), after = load('after');
  mkdirSync(`${ROOT}/diff`, { recursive: true });
  await page.goto('about:blank');
  const frames = {};
  for (const key of Object.keys(before.frames)) {
    const b = before.frames[key], a = after.frames[key];
    const toUrl = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    const px = await page.evaluate(async (ua, ub) => {
      const img = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
      const [ia, ib] = await Promise.all([img(ua), img(ub)]);
      const w = ia.width, h = ia.height;
      if (ib.width !== w || ib.height !== h) return { sizeMismatch: [w, h, ib.width, ib.height] };
      const data = (i) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, w, h).data; };
      const da = data(ia), db = data(ib);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); const out = x.createImageData(w, h);
      let diffPixels = 0, maxChannelDiff = 0;
      for (let i = 0; i < da.length; i += 4) {
        let m = 0;
        for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(da[i + k] - db[i + k]));
        if (m > 0) diffPixels++;
        if (m > maxChannelDiff) maxChannelDiff = m;
        // diff image: dim, posterised grey copy of before (small PNG), changed
        // pixels in red (brightness = size)
        const g = Math.round((da[i] + da[i + 1] + da[i + 2]) / 72) * 8;
        out.data[i] = m ? Math.min(255, 96 + m * 8) : g; out.data[i + 1] = m ? 0 : g; out.data[i + 2] = m ? 0 : g; out.data[i + 3] = 255;
      }
      x.putImageData(out, 0, 0);
      return { w, h, diffPixels, maxChannelDiff, diffPng: diffPixels ? c.toDataURL('image/png') : null };
    }, toUrl(b.png), toUrl(a.png));
    const entry = {
      before: { calls: b.calls, triangles: b.triangles, points: b.points, lines: b.lines },
      after: { calls: a.calls, triangles: a.triangles, points: a.points, lines: a.lines },
      deltaCalls: a.calls - b.calls, deltaTriangles: a.triangles - b.triangles,
      pixels: { total: px.w * px.h, diffPixels: px.diffPixels, maxChannelDiff: px.maxChannelDiff, sizeMismatch: px.sizeMismatch },
    };
    if (px.diffPng) {
      entry.pixels.diffImage = `${ROOT}/diff/${key}.png`;
      writeFileSync(entry.pixels.diffImage, await compactPng(Buffer.from(px.diffPng.split(',')[1], 'base64')));
    }
    frames[key] = entry;
    console.log('COMPARE', key, JSON.stringify({ calls: [b.calls, a.calls], tris: [b.triangles, a.triangles], diffPixels: px.diffPixels, maxChannelDiff: px.maxChannelDiff }));
  }
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const strip = (it) => JSON.parse(JSON.stringify(it, (k, v) => (k === 'status' || k === 'statusChanged' || k === 'energyBefore' || k === 'energyAfter' ? undefined : v)));
  const report = {
    baseRevision: '38b6b27',
    before: { revision: before.revision, dirtySrc: before.dirtySrc, chrome: before.chrome },
    after: { revision: after.revision, dirtySrc: after.dirtySrc, chrome: after.chrome },
    chromeArgs: after.chromeArgs, viewport: after.viewport,
    passes: { before: before.passes, after: after.passes },
    colliders: { count: [before.colliders.length, after.colliders.length], identical: same(before.colliders, after.colliders), before: before.colliders, after: after.colliders },
    collision: { before: before.collision, after: after.collision, identical: same(before.collision, after.collision) },
    interactions: {
      before: before.interactions, after: after.interactions,
      // HUD clock/energy text depends on wall time; compare labels, prompts,
      // messages, that eat changed the status, and the energy after eating
      identical: same(strip(before.interactions), strip(after.interactions))
        && before.interactions.eat.energyAfter === after.interactions.eat.energyAfter
        && before.interactions.eat.statusChanged === after.interactions.eat.statusChanged,
    },
    sceneStats: { before: before.sceneStats, after: after.sceneStats },
    consoleErrors: { before: before.consoleErrors, after: after.consoleErrors },
    frames,
  };
  writeFileSync(`${ROOT}/report.json`, JSON.stringify(report, null, 2));
  console.log('SUMMARY', JSON.stringify({ colliders: report.colliders.identical, collision: report.collision.identical, interactions: report.interactions.identical }));
  console.log('| tier | room | calls before | calls after | Δ | tris before | tris after | Δ | diff px | max ch |');
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [k, e] of Object.entries(frames)) {
    const [tier, room] = k.split('_');
    console.log(`| ${tier} | ${room} | ${e.before.calls} | ${e.after.calls} | ${e.deltaCalls} | ${e.before.triangles} | ${e.after.triangles} | ${e.deltaTriangles} | ${e.pixels.diffPixels} | ${e.pixels.maxChannelDiff} |`);
  }
}
