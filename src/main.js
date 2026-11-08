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
import { createRoomHud } from './rooms.js';

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
// HUD room name: follows player.position (feet), writes the DOM only on a change
const roomHud = createRoomHud(document.getElementById('room'));

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
// While the start/pause overlay is visible the game is paused: no key may
// reach the game's document-level handlers (E interact, R reload, WASD),
// wherever focus is — a menu control, a button, or BODY after a click on the
// title or backdrop. The listener runs on window in the capture phase, so it
// sees every key first. stopPropagation does not cancel default actions, so
// arrow keys on the select/sliders, Tab and Enter/Space on buttons still work.
// Esc closes the settings menu. The screenshot rig hides the overlay and uses
// window.__shot directly, so it is not affected.
for (const type of ['keydown', 'keyup']) {
  window.addEventListener(type, (e) => {
    if (startEl.classList.contains('hidden')) return; // playing: keys go to the game
    e.stopPropagation();
    if (type === 'keydown' && e.code === 'Escape' && !settingsEl.hidden) {
      e.preventDefault();
      closeSettings();
    }
  }, true);
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

let paused = false; // __shot.pause(): stop updating/rendering (deterministic capture)

function tick() {
  if (paused) { requestAnimationFrame(tick); return; }
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.elapsedTime;
  player.update(dt);
  roomHud.update(player.position.x, player.position.z);
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
// State that the frame loop changes from frame history instead of from
// clock.elapsedTime: passing glints in space (position += dt) and the cockpit
// screen canvas swap. capture() restores the initial values so two page loads
// render the same frame.
const initialSpace = [];
space.group.traverse((o) => initialSpace.push([o, o.position.clone()]));
const initialCanvasTextures = [];
scene.traverse((o) => {
  const map = o.material?.map;
  if (map?.isCanvasTexture || map?.image instanceof HTMLCanvasElement) initialCanvasTextures.push([map, map.image]);
});
const grainUniforms = post.composer.passes.find((p) => p.uniforms?.grain)?.uniforms;
// one composer.render with renderer.info counting every render call in it
function countFrame() {
  const info = renderer.info;
  const auto = info.autoReset;
  info.autoReset = false;
  info.reset();
  try {
    post.render(0);
    const { calls, triangles, points, lines } = info.render;
    return { calls, triangles, points, lines };
  } finally {
    info.autoReset = auto;
  }
}
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
  // current HUD room: id, text the updater wrote, text in the DOM, DOM writes so far
  room() {
    return { id: roomHud.room, text: roomHud.text, dom: document.getElementById('room').textContent, writes: roomHud.writes };
  },
  // move the real player (feet) and hand control back to it, unlike set()
  // which only moves the camera; the next frame updates the HUD room
  place(x, z, yaw = player.yaw, pitch = player.pitch) {
    player.position.set(x, 0, z);
    player.velY = 0;
    player.grounded = true;
    player.yaw = yaw;
    player.pitch = pitch;
    player.releaseDebug();
    player.applyCamera();
    return { x: player.position.x, y: player.position.y, z: player.position.z };
  },
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
  // whole-frame cost: draw calls/triangles of every render call in one
  // composer.render (info() only shows the last pass)
  frameInfo() { return countFrame(); },
  // stop (true) or resume (false) the frame loop
  pause(v = true) { paused = !!v; return paused; },
  // select a quality tier through the settings path (menu, storage, post)
  quality(level) { updateSetting({ quality: level }); return post.getQuality(); },
  // deterministic frame: fixed elapsed time, grain time, flicker, star drift,
  // glints and screen canvas; renders once and returns the frame cost and the
  // canvas as a PNG data URL read in the same task (no preserveDrawingBuffer).
  // grain (optional) overrides the film-grain amount for this frame only;
  // 0 gives a noise-free frame that compresses to a small PNG
  capture(elapsed = 18, grainTime = 0, grain) {
    for (const [o, p] of initialSpace) o.position.copy(p);
    for (const [map, img] of initialCanvasTextures) {
      if (map.image !== img) { map.image = img; map.needsUpdate = true; }
    }
    clock.elapsedTime = elapsed;
    ship.update(0, elapsed);
    space.update(0, elapsed);
    if (grainUniforms) grainUniforms.time.value = grainTime;
    const grain0 = grainUniforms?.grain.value;
    if (grainUniforms && grain !== undefined) grainUniforms.grain.value = grain;
    const info = countFrame();
    const png = renderer.domElement.toDataURL('image/png');
    if (grainUniforms) grainUniforms.grain.value = grain0;
    return { info, png };
  },
  // collision boxes as [min xyz, max xyz] in array order
  colliders() { return ship.colliders.map((b) => [b.min.toArray(), b.max.toArray()]); },
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
