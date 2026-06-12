// Exterior space: layered parallax starfield, drifting planet with rim glow,
// distant nebula billboards. All procedural; all materials fog-immune.
import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starLayer(seed, count, radius, size, speed) {
  const rand = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const tints = [
    [1, 1, 1], [0.75, 0.85, 1], [1, 0.9, 0.75], [0.9, 1, 0.95], [1, 0.8, 0.6],
  ];
  for (let i = 0; i < count; i++) {
    // uniform on sphere
    const u = rand() * 2 - 1, theta = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = radius * (0.9 + rand() * 0.2);
    pos[i * 3] = s * Math.cos(theta) * r;
    pos[i * 3 + 1] = u * r;
    pos[i * 3 + 2] = s * Math.sin(theta) * r;
    const t = tints[Math.floor(rand() * tints.length)];
    const b = 0.5 + rand() * 0.5;
    col[i * 3] = t[0] * b; col[i * 3 + 1] = t[1] * b; col[i * 3 + 2] = t[2] * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size, vertexColors: true, sizeAttenuation: false, fog: false,
    transparent: true, opacity: 0.95, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.userData.speed = speed;
  return points;
}

// gas-giant surface: horizontal bands + swirl noise
function planetCanvas(seed) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S / 2;
  const ctx = c.getContext('2d');
  const rand = mulberry32(seed);
  // banded base — warm amber giant with teal-gray storm bands
  const bands = [
    '#c98e52', '#e0b070', '#b4763e', '#d9a263', '#8a6a4e',
    '#caa06a', '#a87848', '#e3b87e', '#977155', '#c4925c',
  ];
  let y = 0;
  while (y < S / 2) {
    const h = 8 + rand() * 38;
    ctx.fillStyle = bands[Math.floor(rand() * bands.length)];
    ctx.fillRect(0, y, S, h);
    y += h;
  }
  // turbulence: horizontal smearing with sinusoidal offsets
  const img = ctx.getImageData(0, 0, S, S / 2);
  const out = ctx.createImageData(S, S / 2);
  for (let py = 0; py < S / 2; py++) {
    const k1 = Math.sin(py * 0.05 + seed) * 14;
    const k2 = Math.sin(py * 0.013 + seed * 2) * 40;
    for (let px = 0; px < S; px++) {
      const sx = (px + k1 + k2 + S * 4) % S | 0;
      const si = (py * S + sx) * 4, di = (py * S + px) * 4;
      out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  // storm spots
  for (let i = 0; i < 7; i++) {
    const x = rand() * S, yy = S / 8 + rand() * S / 4, r = 8 + rand() * 26;
    const g = ctx.createRadialGradient(x, yy, 0, x, yy, r);
    const warm = rand() < 0.5;
    g.addColorStop(0, warm ? 'rgba(238,210,160,0.85)' : 'rgba(90,110,118,0.8)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, yy, r * 1.8, r, 0, 0, 7); ctx.fill();
  }
  return c;
}

function nebulaCanvas(seed, hue) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const rand = mulberry32(seed);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  for (let i = 0; i < 60; i++) {
    const x = S / 2 + (rand() - 0.5) * S * 0.6;
    const y = S / 2 + (rand() - 0.5) * S * 0.6;
    const r = 20 + rand() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.02 + rand() * 0.05;
    g.addColorStop(0, `hsla(${hue + (rand() - 0.5) * 40}, 65%, ${45 + rand() * 25}%, ${a})`);
    g.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  // bright core wisps
  for (let i = 0; i < 12; i++) {
    const x = S / 2 + (rand() - 0.5) * S * 0.3;
    const y = S / 2 + (rand() - 0.5) * S * 0.3;
    const r = 10 + rand() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${hue}, 80%, 75%, ${0.05 + rand() * 0.06})`);
    g.addColorStop(1, 'hsla(0,0%,0%,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  return c;
}

export function buildSpace(scene) {
  const space = new THREE.Group();
  scene.add(space);

  // --- parallax star shells
  const layers = [
    starLayer(1, 2200, 900, 1.4, 0.0030),
    starLayer(2, 1400, 1400, 2.0, 0.0046),
    starLayer(3, 500, 2000, 2.8, 0.0066),
  ];
  for (const l of layers) space.add(l);

  // --- planet: textured sphere + atmosphere rim shell
  const planetGroup = new THREE.Group();
  const ptex = new THREE.CanvasTexture(planetCanvas(9));
  ptex.colorSpace = THREE.SRGBColorSpace;
  ptex.anisotropy = 4;
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(260, 48, 32),
    new THREE.MeshStandardMaterial({ map: ptex, roughness: 1, metalness: 0, fog: false }),
  );
  planetGroup.add(planet);
  // atmosphere: backside fresnel shell, additive
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(272, 48, 32),
    new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      depthWrite: false, fog: false,
      uniforms: { cAtmo: { value: new THREE.Color('#7ab8e8') } },
      vertexShader: /* glsl */`
        varying vec3 vNormal; varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vNormal; varying vec3 vView;
        uniform vec3 cAtmo;
        void main() {
          float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.4);
          gl_FragColor = vec4(cAtmo, 1.0) * rim * 1.6;
        }`,
    }),
  );
  planetGroup.add(atmo);
  // a sunlit side: planet lit by distant directional below
  space.add(planetGroup);

  // --- key "sun" light for exterior objects (planet shading) + cool spill into windows
  const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  sun.position.set(-600, 300, -900);
  space.add(sun);

  // --- nebula billboards
  const nebulas = [];
  const nebDefs = [
    { seed: 21, hue: 195, pos: [-1600, 300, -800], scale: 2200 },
    { seed: 33, hue: 280, pos: [1400, -200, 1500], scale: 1800 },
    { seed: 45, hue: 165, pos: [600, 600, -1700], scale: 1500 },
  ];
  for (const d of nebDefs) {
    const t = new THREE.CanvasTexture(nebulaCanvas(d.seed, d.hue));
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: t, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, opacity: 0.9,
    });
    const spr = new THREE.Sprite(mat);
    spr.position.set(...d.pos);
    spr.scale.setScalar(d.scale);
    space.add(spr);
    nebulas.push(spr);
  }

  // --- distant passing debris/ship glints (tiny moving sprites near flight path)
  const glintMat = new THREE.SpriteMaterial({
    color: '#cfe8ff', transparent: true, opacity: 0.8, fog: false,
  });
  const glints = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Sprite(glintMat.clone());
    g.scale.setScalar(2 + i);
    g.position.set(-200 - i * 150, 30 - i * 40, -400 + i * 300);
    space.add(g);
    glints.push(g);
  }

  // planet orbit: slides past the windows over ~75 s
  const ORBIT_R = 1050, ORBIT_PERIOD = 75;
  function update(dt, elapsed) {
    // star drift: slow yaw per layer + slight roll → parallax
    for (const l of layers) {
      l.rotation.y = elapsed * l.userData.speed;
      l.rotation.z = elapsed * l.userData.speed * 0.21;
    }
    const a = (elapsed / ORBIT_PERIOD) * Math.PI * 2;
    // orbit biased toward -z / -x so it crosses cockpit + porthole views
    planetGroup.position.set(
      Math.sin(a) * ORBIT_R * 0.9,
      -80 + Math.sin(a * 0.5) * 60,
      -Math.cos(a) * ORBIT_R,
    );
    planet.rotation.y = elapsed * 0.02;
    for (let i = 0; i < glints.length; i++) {
      const g = glints[i];
      g.position.x += dt * (14 + i * 8);
      if (g.position.x > 600) g.position.x = -700;
    }
  }

  return { group: space, update };
}
