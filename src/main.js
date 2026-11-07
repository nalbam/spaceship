import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShip } from './ship.js';
import { buildSpace } from './space.js';
import { Player } from './player.js';
import { setupInteractions } from './interact.js';
import { setupPost } from './post.js';
import { setupWeapon } from './weapon.js';
import { audioDebug, setMasterVolume } from './audio.js';
import { getBrowserStorage, loadSettings, saveSettings, normalizeSettings } from './settings.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#020308');
scene.fog = new THREE.FogExp2('#0e0c0a', 0.045);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 5000);

// PMREM environment so metals reflect something plausible
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.07;
  pmrem.dispose();
}

const ship = buildShip(scene);
const space = buildSpace(scene);
const player = new Player(camera, renderer.domElement, ship.colliders);
const interactions = setupInteractions({
  camera,
  interactables: ship.interactables,
  player,
  setRestMix: ship.setRestMix,
});
const weapon = setupWeapon({ scene, camera, player, targetGroup: ship.group });
const post = setupPost(renderer, scene, camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// ---- settings: load before the first frame, apply, wire the menu ----
const { storage } = getBrowserStorage();
const loaded = loadSettings(storage);
let settings = loaded.settings;
const applied = { volume: settings.volume };
function applySettings(s) {
  post.setQuality(s.quality);
  applied.volume = setMasterVolume(s.volume);
  player.setSensitivity(s.sensitivity);
}
applySettings(settings);

const startEl = document.getElementById('start');
const settingsEl = document.getElementById('settings');
const qualityEl = document.getElementById('set-quality');
const volumeEl = document.getElementById('set-volume');
const volumeOut = document.getElementById('out-volume');
const sensEl = document.getElementById('set-sensitivity');
const sensOut = document.getElementById('out-sensitivity');
const statusEl = document.getElementById('settings-status');
const boardBtn = document.getElementById('board');
const openBtn = document.getElementById('open-settings');
const closeBtn = document.getElementById('close-settings');
const resumeBtn = document.getElementById('resume-settings');
const hintEl = document.getElementById('start-hint');
const SESSION_ONLY = 'SETTINGS NOT SAVED (STORAGE UNAVAILABLE) — THEY APPLY TO THIS SESSION ONLY';

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', !!isError);
}
function renderSettings() {
  qualityEl.value = settings.quality;
  volumeEl.value = String(Math.round(settings.volume * 100));
  volumeOut.textContent = `${Math.round(settings.volume * 100)}%`;
  sensEl.value = String(settings.sensitivity);
  sensOut.textContent = `${settings.sensitivity.toFixed(2)}×`;
}
function updateSetting(patch) {
  const result = saveSettings(storage, normalizeSettings({ ...settings, ...patch }));
  settings = result.settings; // applied even when it could not be stored
  applySettings(settings);
  renderSettings();
  if (result.ok) setStatus('SETTINGS SAVED', false);
  else setStatus(SESSION_ONLY, true);
}
renderSettings();
if (!loaded.ok) setStatus(SESSION_ONLY, true);

qualityEl.addEventListener('change', () => updateSetting({ quality: qualityEl.value }));
volumeEl.addEventListener('input', () => updateSetting({ volume: Number(volumeEl.value) / 100 }));
sensEl.addEventListener('input', () => updateSetting({ sensitivity: Number(sensEl.value) }));

function openSettings() {
  startEl.classList.add('settings-open');
  startEl.dataset.noLock = ''; // backdrop clicks must not grab the pointer while the menu is open
  settingsEl.hidden = false;
  qualityEl.focus();
}
function closeSettings({ focus = true } = {}) {
  startEl.classList.remove('settings-open');
  delete startEl.dataset.noLock;
  settingsEl.hidden = true;
  if (focus) openBtn.focus();
}
openBtn.addEventListener('click', openSettings);
closeBtn.addEventListener('click', () => closeSettings());
resumeBtn.addEventListener('click', () => player.requestLock());
// keys typed in the overlay (arrow keys on a slider, E/R/WASD on a focused
// button) stay out of the game's document-level handlers; Esc closes the menu
for (const type of ['keydown', 'keyup']) {
  startEl.addEventListener(type, (e) => {
    e.stopPropagation();
    if (type === 'keydown' && e.code === 'Escape' && !settingsEl.hidden) closeSettings();
  });
}
let boarded = false;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    boarded = true;
    closeSettings({ focus: false });
    document.activeElement?.blur?.();
  } else if (boarded) {
    // Esc (or any other unlock) → pause screen with Resume and Settings
    hintEl.textContent = 'PAUSED — CLICK OR PRESS RESUME TO CONTINUE';
    boardBtn.textContent = 'RESUME';
    resumeBtn.textContent = 'RESUME';
  }
});

const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, lastFps = 0, totalFrames = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.elapsedTime;
  player.update(dt);
  ship.update(dt, elapsed);
  space.update(dt, elapsed);
  interactions.update(dt);
  weapon.update(dt);
  post.render(dt);
  frames++; totalFrames++; fpsAcc += dt;
  if (fpsAcc >= 1) { lastFps = frames / fpsAcc; frames = 0; fpsAcc = 0; }
  requestAnimationFrame(tick);
}
tick();

// ---- debug / screenshot rig ----
window.__shot = {
  set(x, y, z, yaw, pitch) { player.teleport(x, y, z, yaw, pitch); },
  release() { player.releaseDebug(); },
  setTime(t) { clock.elapsedTime = t; },
  rest(m) { interactions.setMix(m); },
  fps() { return lastFps; },
  frames() { return totalFrames; },
  audio() { return audioDebug(); },
  weapon() { return weapon.debug(); },
  fire() { weapon.fire(); },
  aim(v) { weapon.setAiming(v); },
  reload() { weapon.reload(); },
  pos() { return { x: player.position.x, y: player.position.y, z: player.position.z, grounded: player.grounded, running: player.running, fov: +camera.fov.toFixed(1) }; },
  probe() { return ship.probe(); },
  // collision smoke test: march the player capsule and return where it stopped
  walk(x, z, dx, dz, steps) {
    player.position.set(x, 0, z);
    for (let i = 0; i < steps; i++) {
      player.position.x += dx; player.position.z += dz;
      player.collide(player.position);
    }
    return { x: player.position.x, z: player.position.z };
  },
  idbg() { return interactions.dbg(); },
  ray() {
    const rc = new THREE.Raycaster();
    rc.far = 6;
    rc.setFromCamera(new THREE.Vector2(0, 0), camera);
    return ship.interactables.map((g) => {
      const h = rc.intersectObject(g, true);
      return h.length ? { label: g.userData.label, d: +h[0].distance.toFixed(2) } : null;
    });
  },
  stats() {
    let meshes = 0, lights = 0, tris = 0;
    scene.traverse((o) => {
      if (o.isMesh || o.isPoints) {
        meshes++;
        const g = o.geometry;
        tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
      }
      if (o.isLight) lights++;
    });
    return { meshes, lights, tris: Math.round(tris) };
  },
  info() { return renderer.info.render; },
  // menu value shown vs. state actually applied to post / audio / Player
  settings() {
    const passes = post.composer.passes;
    const bloomPass = passes.find((p) => p.constructor.name === 'UnrealBloomPass');
    return {
      ui: {
        open: !settingsEl.hidden,
        quality: qualityEl.value,
        volume: volumeEl.value,
        volumeText: volumeOut.textContent,
        sensitivity: sensEl.value,
        sensitivityText: sensOut.textContent,
        status: statusEl.textContent,
        statusError: statusEl.classList.contains('error'),
      },
      applied: {
        quality: post.getQuality(),
        volume: applied.volume,
        sensitivity: player.sensitivity,
        pixelRatio: renderer.getPixelRatio(),
        // n8ao ships a mangled class name; its pass is the one with `configuration`
        passes: passes.map((p) => ({ name: p.configuration ? 'N8AOPass' : p.constructor.name, enabled: p.enabled })),
        bloomWidth: bloomPass?.renderTargetsHorizontal?.[0]?.width ?? null,
        drawingBuffer: { w: renderer.domElement.width, h: renderer.domElement.height },
      },
      locked: player.locked,
      yaw: player.yaw,
    };
  },
};
window.__ready = true;
