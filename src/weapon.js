// Blaster: procedural viewmodel, RMB aim (slight zoom), LMB fire with recoil,
// muzzle flash, scorch decals that fade out after 10 s, ammo HUD + R reload.
import * as THREE from 'three';
import { playShot, playHit, playReload, playEmpty } from './audio.js';

const MAG_SIZE = 12;
const RELOAD_TIME = 1.2;
const DECAL_LIFE = 10; // seconds until a scorch mark is gone
const FOV_HIP = 72;
const FOV_ADS = 52;

function scorchTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(10,8,6,0.95)');
  g.addColorStop(0.45, 'rgba(18,14,10,0.8)');
  g.addColorStop(0.8, 'rgba(20,16,12,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // ragged edge spokes
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r0 = S * 0.28, r1 = S * (0.34 + Math.random() * 0.16);
    ctx.strokeStyle = `rgba(12,10,8,${0.3 + Math.random() * 0.4})`;
    ctx.lineWidth = 1.5 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0);
    ctx.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

export function setupWeapon({ scene, camera, player, targetGroup }) {
  scene.add(camera); // viewmodel renders as a camera child

  // ---- viewmodel (kit-bashed blaster pistol)
  const gun = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.45, metalness: 0.85 });
  const gripMat = new THREE.MeshStandardMaterial({ color: '#3a2e24', roughness: 0.9, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: '#9c5526', roughness: 0.55, metalness: 0.4 });
  const sightMat = new THREE.MeshStandardMaterial({ color: '#031a18', emissive: '#2ee8d8', emissiveIntensity: 2.5 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.07, 0.2), dark);
  gun.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.17, 12), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.16);
  gun.add(barrel);
  const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12), accent);
  muzzleRing.rotation.x = Math.PI / 2;
  muzzleRing.position.set(0, 0.012, -0.235);
  gun.add(muzzleRing);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.05), gripMat);
  grip.position.set(0, -0.075, 0.06);
  grip.rotation.x = 0.32;
  gun.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.008), sightMat);
  sight.position.set(0, 0.045, -0.07);
  gun.add(sight);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.026, 0.1), accent);
  fin.position.set(0, 0.052, 0.03);
  gun.add(fin);

  // muzzle flash: light + additive sprite, decays fast
  const flashLight = new THREE.PointLight('#ffb060', 0, 4, 2);
  flashLight.position.set(0, 0.012, -0.26);
  gun.add(flashLight);
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    color: '#ffd9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false,
  }));
  flashSprite.scale.setScalar(0.07);
  flashSprite.position.set(0, 0.012, -0.27);
  gun.add(flashSprite);

  const HIP_POS = new THREE.Vector3(0.22, -0.2, -0.42);
  const ADS_POS = new THREE.Vector3(0, -0.115, -0.34);
  // hip: barrel converges on the crosshair point a few meters out, so the muzzle
  // visibly points where the bolts land
  const CONVERGE = new THREE.Vector3(0, 0, -6);
  const hipQuat = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(HIP_POS, CONVERGE, new THREE.Vector3(0, 1, 0)),
  );
  const adsQuat = new THREE.Quaternion();
  gun.position.copy(HIP_POS);
  gun.quaternion.copy(hipQuat);
  camera.add(gun);

  // ---- state
  let ammo = MAG_SIZE;
  let aiming = false;
  let reloading = 0; // seconds left
  let recoil = 0; // gun kickback
  let flash = 0;
  const decals = [];
  const sparks = [];
  const bolts = [];
  const BOLT_SPEED = 60; // m/s
  const boltGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6);
  boltGeo.rotateX(Math.PI / 2); // axis along z
  const boltMat = new THREE.MeshBasicMaterial({
    color: '#ff7a35', transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const scorchTex = scorchTexture();
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const ammoEl = document.getElementById('ammo');

  function updateHud() {
    ammoEl.textContent = reloading > 0
      ? 'RELOADING…'
      : `CHARGE ${String(ammo).padStart(2, '0')} / ${MAG_SIZE}`;
    ammoEl.classList.toggle('empty', ammo === 0 && reloading <= 0);
  }
  updateHud();

  function spawnDecal(point, normal) {
    const size = 0.1 + Math.random() * 0.07;
    const mat = new THREE.MeshBasicMaterial({
      map: scorchTex, transparent: true, opacity: 0.95,
      polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.position.copy(point).addScaledVector(normal, 0.006);
    m.lookAt(point.clone().add(normal));
    m.rotateZ(Math.random() * Math.PI * 2);
    scene.add(m);
    decals.push({ mesh: m, age: 0 });
    // brief hot ember glow
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      color: '#ff7a30', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(size * 0.9);
    glow.position.copy(point).addScaledVector(normal, 0.02);
    scene.add(glow);
    sparks.push({ sprite: glow, age: 0 });
  }

  function fire() {
    if (reloading > 0 || player.frozen) return;
    if (ammo <= 0) { playEmpty(); return; }
    ammo--;
    updateHud();
    playShot();
    recoil = 1;
    flash = 1;
    player.pitch = Math.min(1.45, player.pitch + 0.016); // muzzle climb
    // hit scan against the ship interior
    camera.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(targetGroup, true)
      .filter((h) => h.face && h.object.visible && !h.object.material?.transparent);
    const hit = hits.length ? {
      point: hits[0].point.clone(),
      normal: hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld),
    } : null;
    // visible bolt flies from the muzzle to the impact point
    const muzzle = gun.localToWorld(new THREE.Vector3(0, 0.012, -0.27));
    const end = hit ? hit.point : raycaster.ray.at(50, new THREE.Vector3());
    const dir = end.clone().sub(muzzle);
    const dist = dir.length();
    dir.normalize();
    const bolt = new THREE.Mesh(boltGeo, boltMat);
    bolt.position.copy(muzzle);
    bolt.lookAt(end);
    scene.add(bolt);
    bolts.push({ mesh: bolt, dir, remaining: dist, hit });
  }

  function reload() {
    if (reloading > 0 || ammo === MAG_SIZE || player.frozen) return;
    reloading = RELOAD_TIME;
    playReload();
    updateHud();
  }

  document.addEventListener('mousedown', (e) => {
    if (!document.pointerLockElement) return;
    if (e.button === 0) fire();
    if (e.button === 2) aiming = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 2) aiming = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && document.pointerLockElement) reload();
  });

  const tmp = new THREE.Vector3();
  function update(dt) {
    // reload timer
    if (reloading > 0) {
      reloading -= dt;
      if (reloading <= 0) {
        reloading = 0;
        ammo = MAG_SIZE;
        updateHud();
      }
    }
    // ADS: slight zoom + gun to center
    const targetFov = aiming && !player.frozen ? FOV_ADS : FOV_HIP;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    // reload motion: dip + tilt that peaks mid-reload
    const dip = reloading > 0 ? Math.sin((1 - reloading / RELOAD_TIME) * Math.PI) : 0;
    tmp.copy(aiming ? ADS_POS : HIP_POS);
    tmp.z += recoil * 0.05; // kickback
    tmp.y -= dip * 0.13;
    gun.position.lerp(tmp, Math.min(1, dt * 14));
    gun.quaternion.slerp(aiming ? adsQuat : hipQuat, Math.min(1, dt * 14));
    gun.rotateX(recoil * 0.12 - dip * 0.75);
    gun.rotateZ(dip * 0.35);
    recoil = Math.max(0, recoil - dt * 7);
    // bolts in flight: advance, impact at the end of the path
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const step = Math.min(BOLT_SPEED * dt, b.remaining);
      b.mesh.position.addScaledVector(b.dir, step);
      b.remaining -= step;
      if (b.remaining <= 0.001) {
        if (b.hit) {
          spawnDecal(b.hit.point, b.hit.normal);
          playHit();
        }
        scene.remove(b.mesh);
        bolts.splice(i, 1);
      }
    }
    // muzzle flash decay
    flash = Math.max(0, flash - dt * 14);
    flashLight.intensity = flash * 6;
    flashSprite.material.opacity = flash;
    // decals: fade near end of life, then dispose
    for (let i = decals.length - 1; i >= 0; i--) {
      const d = decals[i];
      d.age += dt;
      if (d.age > DECAL_LIFE - 1.2) d.mesh.material.opacity = Math.max(0, (DECAL_LIFE - d.age) / 1.2) * 0.95;
      if (d.age >= DECAL_LIFE) {
        scene.remove(d.mesh);
        d.mesh.material.dispose();
        d.mesh.geometry.dispose();
        decals.splice(i, 1);
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      s.sprite.material.opacity = Math.max(0, 0.9 - s.age * 2.2);
      if (s.age > 0.45) {
        scene.remove(s.sprite);
        s.sprite.material.dispose();
        sparks.splice(i, 1);
      }
    }
  }

  return {
    update,
    debug: () => ({ ammo, reloading: +reloading.toFixed(2), aiming, fov: +camera.fov.toFixed(1), decals: decals.length, bolts: bolts.length }),
    fire, // exposed for the headless rig
    reload,
    setAiming(v) { aiming = v; },
  };
}
