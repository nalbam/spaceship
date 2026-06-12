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
const post = setupPost(renderer, scene, camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
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
};
window.__ready = true;
