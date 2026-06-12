// Screenshot rig: spins up vite, drives the scene through window.__shot,
// saves PNGs to shots/ for visual judging.
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

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded' });
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
  ['07_bathroom', 1.7, 1.7, 3.9, -2.0, -0.18, 18],
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
await page.evaluate(() => window.__shot.rest(0));

// stats
const stats = await page.evaluate(() => ({ fps: window.__shot.fps(), info: window.__shot.info() }));
console.log('STATS', JSON.stringify(stats));

await browser.close();
killVite();
process.exit(0);
