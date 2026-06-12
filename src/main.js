import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShip } from './ship.js';
import { buildSpace } from './space.js';
import { Player } from './player.js';
import { setupInteractions } from './interact.js';
import { setupPost } from './post.js';

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
  scene.environmentIntensity = 0.25;
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
const post = setupPost(renderer, scene, camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, lastFps = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.elapsedTime;
  player.update(dt);
  ship.update(dt, elapsed);
  space.update(dt, elapsed);
  interactions.update(dt);
  post.render(dt);
  frames++; fpsAcc += dt;
  if (fpsAcc >= 1) { lastFps = frames / fpsAcc; frames = 0; fpsAcc = 0; }
  requestAnimationFrame(tick);
}
tick();

// ---- debug / screenshot rig ----
window.__shot = {
  set(x, y, z, yaw, pitch) { player.teleport(x, y, z, yaw, pitch); },
  release() { player.releaseDebug(); },
  setTime(t) { clock.elapsedTime = t; },
  rest(m) { ship.setRestMix(m); },
  fps() { return lastFps; },
  info() { return renderer.info.render; },
};
window.__ready = true;
