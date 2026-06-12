// Screenshot rig: spins up vite, drives the scene through window.__shot,
// saves PNGs to shots/ for visual judging.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const PORT = 5199;
mkdirSync('shots', { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite timeout')), 20000);
  vite.stdout.on('data', (d) => {
    if (d.toString().includes('Local:')) { clearTimeout(t); res(); }
  });
  vite.stderr.on('data', (d) => process.stderr.write(d));
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
  // [name, x, y(feet→eye handled by rig: pass eye y), z, yaw, pitch, spaceTime]
  ['01_corridor_fwd', 0, 1.7, 5.8, 0, 0.02, 18],
  ['02_cockpit', 0, 1.7, -8.4, 0, -0.04, 18],
  ['03_cockpit_window', 0, 1.7, -9.6, 0, 0.06, 22],
  ['04_porthole', -0.5, 1.62, -1.8, Math.PI / 2, 0, 40],
  ['05_quarters', 2.2, 1.7, -0.2, Math.PI + 0.7, -0.12, 18],
  ['06_galley', -2.0, 1.7, 1.6, -Math.PI / 4 - 0.5, -0.1, 18],
  ['07_bathroom', 1.9, 1.7, 4.1, -Math.PI / 2 - 0.5, -0.15, 18],
  ['08_corridor_aft', 0, 1.7, -5.5, Math.PI, 0.0, 18],
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

// rest-cycle lighting shot
await page.evaluate(() => { window.__shot.rest(1); window.__shot.set(0, 1.7, 5.8, 0, 0.02); });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: 'shots/09_rest_cycle.png' });
console.log('shot 09_rest_cycle');
await page.evaluate(() => window.__shot.rest(0));

// stats
const stats = await page.evaluate(() => ({ fps: window.__shot.fps(), info: window.__shot.info() }));
console.log('STATS', JSON.stringify(stats));

await browser.close();
vite.kill();
process.exit(0);
