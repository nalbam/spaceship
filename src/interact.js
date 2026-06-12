// Raycast interactions: hover highlight + prompt, E to trigger.
// Bed → sleep (fade, time skip, rest-cycle lighting). Galley → eat. Bathroom → refresh.
import * as THREE from 'three';

const promptEl = () => document.getElementById('prompt');
const messageEl = () => document.getElementById('message');
const fadeEl = () => document.getElementById('fade');
const statusEl = () => document.getElementById('status');

export function setupInteractions({ camera, interactables, player, setRestMix }) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 2.6;
  const center = new THREE.Vector2(0, 0);

  let hovered = null;
  let busy = false;
  const state = { hour: 8, minute: 0, energy: 86 };

  // hover highlight: temporarily boost emissive on all child materials
  const boosted = new Map();
  function setHighlight(group, on) {
    group.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (on) {
          if (!boosted.has(m)) {
            boosted.set(m, { e: m.emissive ? m.emissive.clone() : null });
            if (m.emissive) m.emissive.offsetHSL(0, 0, 0.07);
          }
        } else if (boosted.has(m)) {
          const orig = boosted.get(m);
          if (orig.e) m.emissive.copy(orig.e);
          boosted.delete(m);
        }
      }
    });
  }

  function updateStatus() {
    const hh = String(Math.floor(state.hour)).padStart(2, '0');
    const mm = String(Math.floor(state.minute)).padStart(2, '0');
    statusEl().textContent = `SHIP TIME ${hh}:${mm} · ENERGY ${Math.round(state.energy)}% · CRUISE 0.42c`;
  }
  updateStatus();

  function showMessage(text, holdMs = 1800) {
    const el = messageEl();
    el.textContent = text;
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, holdMs);
  }

  function fadeTo(opacity, ms = 700) {
    return new Promise((res) => {
      fadeEl().style.transition = `opacity ${ms}ms ease`;
      fadeEl().style.opacity = opacity;
      setTimeout(res, ms + 30);
    });
  }

  // animate rest mix 0→1 or 1→0 over seconds
  let mixTarget = 0, mixCurrent = 0;

  async function doSleep() {
    busy = true; player.frozen = true;
    await fadeTo(1, 800);
    mixTarget = 1; mixCurrent = 1; setRestMix(1); // lights off while black
    state.hour = (state.hour + 8) % 24;
    state.energy = 100;
    updateStatus();
    await new Promise((r) => setTimeout(r, 400));
    showMessage('8 HOURS PASS', 4600);
    await new Promise((r) => setTimeout(r, 3400));
    await fadeTo(0, 1200);
    player.frozen = false; busy = false;
    // wake into rest lighting, then ramp the day cycle back up
    setTimeout(() => { mixTarget = 0; }, 3500);
  }

  async function doEat() {
    busy = true;
    state.energy = Math.min(100, state.energy + 18);
    state.minute += 20;
    if (state.minute >= 60) { state.minute -= 60; state.hour = (state.hour + 1) % 24; }
    updateStatus();
    showMessage('YOU EAT. ENERGY RESTORED.', 1800);
    setTimeout(() => { busy = false; }, 900);
  }

  async function doRefresh() {
    busy = true; player.frozen = true;
    await fadeTo(1, 600);
    state.minute += 10;
    if (state.minute >= 60) { state.minute -= 60; state.hour = (state.hour + 1) % 24; }
    updateStatus();
    await new Promise((r) => setTimeout(r, 400));
    showMessage('REFRESHED.', 1600);
    await fadeTo(0, 800);
    player.frozen = false; busy = false;
  }

  const actions = { sleep: doSleep, eat: doEat, refresh: doRefresh };

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && hovered && !busy) {
      actions[hovered.userData.action]?.();
    }
  });

  // passive clock: 1 game-minute per real 2 s
  let clockAcc = 0;

  function update(dt) {
    clockAcc += dt;
    if (clockAcc > 2) {
      clockAcc = 0;
      state.minute += 1;
      state.energy = Math.max(5, state.energy - 0.06);
      if (state.minute >= 60) { state.minute = 0; state.hour = (state.hour + 1) % 24; }
      updateStatus();
    }
    // rest-mix easing
    if (Math.abs(mixCurrent - mixTarget) > 0.002) {
      mixCurrent += (mixTarget - mixCurrent) * Math.min(1, dt * 1.2);
      setRestMix(mixCurrent);
    }

    if (busy) {
      if (hovered) { setHighlight(hovered, false); hovered = null; }
      promptEl().style.display = 'none';
      return;
    }
    raycaster.setFromCamera(center, camera);
    let hit = null;
    for (const group of interactables) {
      const hits = raycaster.intersectObject(group, true);
      if (hits.length && (!hit || hits[0].distance < hit.dist)) {
        hit = { group, dist: hits[0].distance };
      }
    }
    const next = hit ? hit.group : null;
    if (next !== hovered) {
      if (hovered) setHighlight(hovered, false);
      hovered = next;
      if (hovered) {
        setHighlight(hovered, true);
        promptEl().textContent = hovered.userData.label;
        promptEl().style.display = 'block';
      } else {
        promptEl().style.display = 'none';
      }
    }
  }

  // external override (debug/screenshot rig): pin the mix so easing can't fight it
  function setMix(m) {
    mixTarget = m; mixCurrent = m;
    setRestMix(m);
  }

  return { update, setMix };
}
