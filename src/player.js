// First-person controller: pointer lock, WASD, head bob, capsule-vs-AABB collision.
import * as THREE from 'three';
import { playFootstep } from './audio.js';

const EYE_HEIGHT = 1.7;
const RADIUS = 0.32;
const SPEED = 2.6;
const RUN_SPEED = 4.5; // Shift + forward
const HEAD = 1.85; // capsule top above feet, for ceiling bumps
const GRAVITY = 13.0;
const JUMP_SPEED = 4.0;

export class Player {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.position = new THREE.Vector3(0, 0, 4.5); // feet
    this.yaw = 0; // facing -z (cockpit)
    this.pitch = 0;
    this.keys = {};
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.lastStepIdx = 0;
    this.velY = 0;
    this.grounded = true;
    this.running = false; // Shift + forward; weapon.js reads this for run zoom
    this.runAmount = 0; // eased 0..1 for bob intensity
    this.locked = false;
    this.frozen = false; // during interactions/fades
    this.debugCam = false; // screenshot rig takes over

    // the #start overlay sits on top of the canvas, so it must request the lock too
    const requestLock = () => {
      if (!this.locked) domElement.requestPointerLock();
    };
    domElement.addEventListener('click', requestLock);
    document.getElementById('start').addEventListener('click', requestLock);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === domElement;
      document.getElementById('start').classList.toggle('hidden', this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.frozen) return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch -= e.movementY * 0.0023;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    document.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    this.applyCamera();
  }

  // resolve horizontal circle-vs-AABB for every collider
  collide(pos) {
    const feetY = pos.y, headY = pos.y + EYE_HEIGHT + 0.1;
    for (const b of this.colliders) {
      if (b.max.y < feetY + 0.25 || b.min.y > headY) continue; // step over low / under high
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const push = (RADIUS - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
        } else {
          // center inside the box: push out along the smallest penetration axis
          const px = Math.min(pos.x - b.min.x + RADIUS, b.max.x - pos.x + RADIUS);
          const pz = Math.min(pos.z - b.min.z + RADIUS, b.max.z - pos.z + RADIUS);
          if (px < pz) pos.x += (pos.x - b.min.x < b.max.x - pos.x) ? -px : px;
          else pos.z += (pos.z - b.min.z < b.max.z - pos.z) ? -pz : pz;
        }
      }
    }
  }

  // highest collider top under the capsule (never below the deck at 0)
  groundHeight(refFeetY) {
    let g = 0;
    for (const b of this.colliders) {
      if (b.max.y > refFeetY + 0.01 || b.max.y <= g) continue;
      const cx = Math.max(b.min.x, Math.min(this.position.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(this.position.z, b.max.z));
      const dx = this.position.x - cx, dz = this.position.z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS * 0.6) g = b.max.y;
    }
    return g;
  }

  // lowest collider bottom above the head (room ceiling by default)
  ceilingHeight(refFeetY) {
    let c = Infinity;
    for (const b of this.colliders) {
      if (b.min.y < refFeetY + HEAD - 0.01 || b.min.y >= c) continue;
      const cx = Math.max(b.min.x, Math.min(this.position.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(this.position.z, b.max.z));
      const dx = this.position.x - cx, dz = this.position.z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) c = b.min.y;
    }
    return c;
  }

  update(dt) {
    if (this.debugCam) return;
    const move = new THREE.Vector3();
    if (!this.frozen && this.locked) {
      if (this.keys.KeyW) move.z -= 1;
      if (this.keys.KeyS) move.z += 1;
      if (this.keys.KeyA) move.x -= 1;
      if (this.keys.KeyD) move.x += 1;
    }
    const moving = move.lengthSq() > 0;
    // running: hold Shift while moving forward (W)
    this.running = !!(moving && this.keys.KeyW && (this.keys.ShiftLeft || this.keys.ShiftRight)
      && this.grounded && !this.frozen && this.locked);
    if (moving) {
      move.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const step = move.multiplyScalar((this.running ? RUN_SPEED : SPEED) * dt);
      // sub-step so fast frames don't tunnel
      const n = Math.ceil(step.length() / (RADIUS * 0.5));
      for (let i = 0; i < n; i++) {
        this.position.addScaledVector(step, 1 / n);
        this.collide(this.position);
      }
    }
    // jump + gravity
    if (this.keys.Space && this.grounded && !this.frozen && this.locked) {
      this.velY = JUMP_SPEED;
      this.grounded = false;
    }
    if (!this.grounded) {
      const prevY = this.position.y;
      this.velY -= GRAVITY * dt;
      this.position.y += this.velY * dt;
      if (this.velY > 0) {
        // ceiling bump
        const ceil = this.ceilingHeight(prevY);
        if (this.position.y + HEAD > ceil) {
          this.position.y = ceil - HEAD;
          this.velY = 0;
        }
      } else {
        // land on the floor or whatever is under the capsule
        const ground = this.groundHeight(prevY);
        if (this.position.y <= ground) {
          this.position.y = ground;
          this.velY = 0;
          this.grounded = true;
          playFootstep(1.3); // landing thump
        }
      }
    } else {
      // walked off an edge (e.g. off a crate or the bed)
      const ground = this.groundHeight(this.position.y);
      if (this.position.y > ground + 0.001) {
        this.grounded = false;
        this.velY = 0;
      }
    }
    // head bob: ease in/out with movement (no bob while airborne)
    const bobbing = moving && this.grounded;
    this.bobAmount += ((bobbing ? 1 : 0) - this.bobAmount) * Math.min(1, dt * 8);
    this.runAmount += ((this.running ? 1 : 0) - this.runAmount) * Math.min(1, dt * 8);
    if (bobbing) {
      this.bobPhase += dt * (this.running ? 13 : 9); // faster cadence when running
      // footfall at each head-bob low point (sin(phase*2) minimum)
      const stepIdx = Math.floor((this.bobPhase * 2 + Math.PI / 2) / (Math.PI * 2));
      if (stepIdx !== this.lastStepIdx) {
        this.lastStepIdx = stepIdx;
        playFootstep(0.8 + Math.random() * 0.4);
      }
    }
    this.applyCamera();
  }

  applyCamera() {
    const runBoost = 1 + 0.5 * this.runAmount; // deeper bob while running
    const bobY = Math.sin(this.bobPhase * 2) * 0.025 * this.bobAmount * runBoost;
    const bobX = Math.sin(this.bobPhase) * 0.012 * this.bobAmount * runBoost;
    this.camera.position.set(
      this.position.x + Math.cos(this.yaw) * bobX,
      this.position.y + EYE_HEIGHT + bobY,
      this.position.z - Math.sin(this.yaw) * bobX,
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }

  // screenshot/debug rig
  teleport(x, y, z, yaw, pitch) {
    this.debugCam = true;
    this.running = false;
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(yaw);
    this.camera.rotateX(pitch);
  }
  releaseDebug() { this.debugCam = false; }
}
