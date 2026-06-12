// Procedural canvas textures + PBR material families.
// Everything generated at runtime: albedo, roughness, normal (from height).
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

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Tileable multi-octave value noise field, returned as a sampler fn in [0,1].
function makeNoiseField(seed, gridSize) {
  const rand = mulberry32(seed);
  const g = gridSize;
  const grid = new Float32Array(g * g);
  for (let i = 0; i < g * g; i++) grid[i] = rand();
  const at = (x, y) => grid[((y % g + g) % g) * g + ((x % g + g) % g)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => { // u,v in [0,1), tiles
    const x = u * g, y = v * g;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function fbm(seed, octaves) {
  const fields = [];
  for (let o = 0; o < octaves; o++) fields.push(makeNoiseField(seed + o * 131, 4 << o));
  return (u, v) => {
    let sum = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < octaves; o++) {
      sum += fields[o](u, v) * amp;
      tot += amp; amp *= 0.55;
    }
    return sum / tot;
  };
}

// Sobel height -> normal map canvas.
function heightToNormal(heightCanvas, strength) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  const hAt = (x, y) => src[(((y % h + h) % h) * w + ((x % w + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * strength;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 + 0.5 > 1 ? 255 : ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function tex(canvas, srgb, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

// ---------- painted hull panels (off-white, worn, occasional orange accent) ----------
function makePanelMaps(seed, baseColor, accentColor, accentChance) {
  const S = 1024;
  const albedo = makeCanvas(S, S), rough = makeCanvas(S, S), height = makeCanvas(S, S);
  const a = albedo.getContext('2d'), r = rough.getContext('2d'), hc = height.getContext('2d');
  const rand = mulberry32(seed);
  const grime = fbm(seed + 7, 4);
  const micro = fbm(seed + 23, 5);

  a.fillStyle = baseColor; a.fillRect(0, 0, S, S);
  r.fillStyle = '#969696'; r.fillRect(0, 0, S, S); // base roughness ~0.59
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, S, S);

  // panel grid with irregular sizes
  const rows = 4;
  let y = 0;
  for (let ry = 0; ry < rows; ry++) {
    const rh = (S / rows) * (0.8 + rand() * 0.4);
    let x = 0;
    while (x < S - 8) {
      const pw = S * (0.12 + rand() * 0.2);
      // slight per-panel tint
      const isAccent = rand() < accentChance;
      const tintShift = Math.floor((rand() - 0.5) * 16);
      if (isAccent) {
        a.fillStyle = accentColor;
      } else {
        a.fillStyle = `rgba(${tintShift > 0 ? 255 : 0},${tintShift > 0 ? 250 : 10},${tintShift > 0 ? 240 : 30},${Math.abs(tintShift) / 55})`;
      }
      a.fillRect(x + 3, y + 3, pw - 6, rh - 6);
      // seams: dark albedo, deep height, rough
      a.strokeStyle = 'rgba(18,16,14,0.85)'; a.lineWidth = 3;
      a.strokeRect(x + 1.5, y + 1.5, pw - 3, rh - 3);
      hc.strokeStyle = '#1a1a1a'; hc.lineWidth = 4;
      hc.strokeRect(x + 2, y + 2, pw - 4, rh - 4);
      r.strokeStyle = '#d0d0d0'; r.lineWidth = 4;
      r.strokeRect(x + 2, y + 2, pw - 4, rh - 4);
      // bolts at corners
      for (const [bx, by] of [[x + 12, y + 12], [x + pw - 12, y + 12], [x + 12, y + rh - 12], [x + pw - 12, y + rh - 12]]) {
        if (rand() < 0.8) {
          a.fillStyle = 'rgba(40,42,46,0.9)';
          a.beginPath(); a.arc(bx, by, 4, 0, 7); a.fill();
          hc.fillStyle = '#b0b0b0';
          hc.beginPath(); hc.arc(bx, by, 4, 0, 7); hc.fill();
          r.fillStyle = '#5a5a5a';
          r.beginPath(); r.arc(bx, by, 4.5, 0, 7); r.fill();
        }
      }
      // occasional vent / detail stripe inside panel
      if (rand() < 0.18 && pw > 90) {
        const vy = y + rh * 0.3, vw = pw * 0.5, vx = x + pw * 0.25;
        a.fillStyle = 'rgba(30,32,36,0.8)';
        for (let k = 0; k < 4; k++) a.fillRect(vx, vy + k * 8, vw, 4);
        hc.fillStyle = '#303030';
        for (let k = 0; k < 4; k++) hc.fillRect(vx, vy + k * 8, vw, 4);
      }
      // small stencil markings
      if (rand() < 0.14) {
        a.fillStyle = isAccent ? 'rgba(30,25,20,0.65)' : 'rgba(190,110,40,0.7)';
        a.font = `${10 + Math.floor(rand() * 8)}px monospace`;
        a.fillText(`${['K-7', 'AUX', 'PWR', '04', 'C2', 'VNT', '113'][Math.floor(rand() * 7)]}`, x + 14, y + rh - 18);
      }
      x += pw;
    }
    y += rh;
    if (y > S - 10) break;
  }

  // grime multiply + streaks, scratches
  const ai = a.getImageData(0, 0, S, S), ri = r.getImageData(0, 0, S, S);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const u = px / S, v = py / S;
      const g = grime(u, v);
      const m = micro(u * 3 % 1, v * 3 % 1);
      const dirt = Math.max(0, g - 0.38) * 1.1 + Math.max(0, m - 0.55) * 0.35;
      const i = (py * S + px) * 4;
      const mul = 1 - dirt * 0.62;
      ai.data[i] *= mul; ai.data[i + 1] *= mul * 0.985; ai.data[i + 2] *= mul * 0.96;
      ri.data[i] = Math.min(255, ri.data[i] + dirt * 140 + (m - 0.5) * 50);
      ri.data[i + 1] = ri.data[i]; ri.data[i + 2] = ri.data[i];
    }
  }
  a.putImageData(ai, 0, 0); r.putImageData(ri, 0, 0);

  // scratches: thin light lines (worn to metal -> shinier)
  for (let s = 0; s < 70; s++) {
    const x0 = rand() * S, y0 = rand() * S, ang = rand() * Math.PI * 2, len = 10 + rand() * 60;
    a.strokeStyle = `rgba(${170 + rand() * 60},${168 + rand() * 50},${160 + rand() * 40},${0.25 + rand() * 0.3})`;
    a.lineWidth = 1;
    a.beginPath(); a.moveTo(x0, y0); a.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); a.stroke();
    r.strokeStyle = 'rgba(70,70,70,0.55)'; r.lineWidth = 1;
    r.beginPath(); r.moveTo(x0, y0); r.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); r.stroke();
  }

  return { albedo, rough, normal: heightToNormal(height, 2.2) };
}

// ---------- worn brushed metal ----------
function makeMetalMaps(seed, tone) {
  const S = 512;
  const albedo = makeCanvas(S, S), rough = makeCanvas(S, S), height = makeCanvas(S, S);
  const a = albedo.getContext('2d'), r = rough.getContext('2d'), hc = height.getContext('2d');
  const rand = mulberry32(seed);
  const stain = fbm(seed + 3, 4);

  a.fillStyle = tone; a.fillRect(0, 0, S, S);
  r.fillStyle = '#6a6a6a'; r.fillRect(0, 0, S, S);
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, S, S);

  // brushed lines
  for (let i = 0; i < 900; i++) {
    const yy = rand() * S, ll = 30 + rand() * 200, xx = rand() * S;
    const lum = (rand() - 0.5) * 36;
    a.strokeStyle = `rgba(${128 + lum},${130 + lum},${134 + lum},0.12)`;
    a.lineWidth = 1;
    a.beginPath(); a.moveTo(xx, yy); a.lineTo(xx + ll, yy); a.stroke();
    r.strokeStyle = `rgba(${100 + lum * 2},${100 + lum * 2},${100 + lum * 2},0.2)`;
    r.beginPath(); r.moveTo(xx, yy); r.lineTo(xx + ll, yy); r.stroke();
  }
  // stains + oxidation patches
  const ai = a.getImageData(0, 0, S, S), ri = r.getImageData(0, 0, S, S);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const st = stain(px / S, py / S);
      const i = (py * S + px) * 4;
      const d = Math.max(0, st - 0.5) * 1.4;
      ai.data[i] *= 1 - d * 0.45; ai.data[i + 1] *= 1 - d * 0.4; ai.data[i + 2] *= 1 - d * 0.32;
      ri.data[i] = Math.min(255, ri.data[i] + d * 150);
      ri.data[i + 1] = ri.data[i]; ri.data[i + 2] = ri.data[i];
    }
  }
  a.putImageData(ai, 0, 0); r.putImageData(ri, 0, 0);
  // dents
  for (let i = 0; i < 26; i++) {
    const x = rand() * S, y = rand() * S, rad = 4 + rand() * 14;
    const g = hc.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, '#6a6a6a'); g.addColorStop(1, '#808080');
    hc.fillStyle = g; hc.beginPath(); hc.arc(x, y, rad, 0, 7); hc.fill();
  }
  return { albedo, rough, normal: heightToNormal(height, 1.6) };
}

// ---------- deck floor: dark plate + tread + center grate ----------
function makeFloorMaps(seed) {
  const S = 1024;
  const albedo = makeCanvas(S, S), rough = makeCanvas(S, S), height = makeCanvas(S, S);
  const a = albedo.getContext('2d'), r = rough.getContext('2d'), hc = height.getContext('2d');
  const rand = mulberry32(seed);
  const wear = fbm(seed + 11, 4);

  a.fillStyle = '#33363b'; a.fillRect(0, 0, S, S);
  r.fillStyle = '#8e8e8e'; r.fillRect(0, 0, S, S);
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, S, S);

  // big plates
  const plate = S / 2;
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const x = px * plate, y = py * plate;
      a.strokeStyle = 'rgba(12,12,14,0.9)'; a.lineWidth = 5;
      a.strokeRect(x + 2.5, y + 2.5, plate - 5, plate - 5);
      hc.strokeStyle = '#252525'; hc.lineWidth = 6;
      hc.strokeRect(x + 3, y + 3, plate - 6, plate - 6);
      // tread bumps (diamond plate)
      for (let ty = 28; ty < plate - 20; ty += 44) {
        for (let tx = 28; tx < plate - 20; tx += 44) {
          const ox = ((ty / 44) % 2) * 22;
          const cx = x + tx + ox, cy = y + ty;
          a.save(); a.translate(cx, cy); a.rotate(Math.PI / 4);
          a.fillStyle = 'rgba(78,82,90,0.85)'; a.fillRect(-7, -2.6, 14, 5.2);
          a.restore();
          hc.save(); hc.translate(cx, cy); hc.rotate(Math.PI / 4);
          hc.fillStyle = '#b5b5b5'; hc.fillRect(-7, -2.6, 14, 5.2);
          hc.restore();
          r.save(); r.translate(cx, cy); r.rotate(Math.PI / 4);
          r.fillStyle = '#646464'; r.fillRect(-7, -2.6, 14, 5.2);
          r.restore();
        }
      }
      // corner bolts
      for (const [bx, by] of [[x + 16, y + 16], [x + plate - 16, y + 16], [x + 16, y + plate - 16], [x + plate - 16, y + plate - 16]]) {
        a.fillStyle = '#1c1e22'; a.beginPath(); a.arc(bx, by, 6, 0, 7); a.fill();
        hc.fillStyle = '#c5c5c5'; hc.beginPath(); hc.arc(bx, by, 5, 0, 7); hc.fill();
      }
    }
  }
  // wear: lighter polished path + grime pockets
  const ai = a.getImageData(0, 0, S, S), ri = r.getImageData(0, 0, S, S);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const w = wear(px / S, py / S);
      const i = (py * S + px) * 4;
      if (w > 0.56) { // polished wear
        const d = (w - 0.56) * 2.2;
        ai.data[i] += d * 26; ai.data[i + 1] += d * 27; ai.data[i + 2] += d * 30;
        ri.data[i] = Math.max(0, ri.data[i] - d * 90);
      } else if (w < 0.4) { // grime
        const d = (0.4 - w) * 1.8;
        ai.data[i] *= 1 - d * 0.4; ai.data[i + 1] *= 1 - d * 0.4; ai.data[i + 2] *= 1 - d * 0.36;
        ri.data[i] = Math.min(255, ri.data[i] + d * 80);
      }
      ri.data[i + 1] = ri.data[i]; ri.data[i + 2] = ri.data[i];
    }
  }
  a.putImageData(ai, 0, 0); r.putImageData(ri, 0, 0);
  // scuff streaks
  for (let s = 0; s < 40; s++) {
    const x0 = rand() * S, y0 = rand() * S, len = 30 + rand() * 120;
    a.strokeStyle = `rgba(120,122,128,${0.1 + rand() * 0.18})`; a.lineWidth = 2 + rand() * 3;
    a.beginPath(); a.moveTo(x0, y0); a.lineTo(x0 + len, y0 + (rand() - 0.5) * 30); a.stroke();
  }
  return { albedo, rough, normal: heightToNormal(height, 2.6) };
}

// ---------- grate strip (corridor center) ----------
function makeGrateMaps(seed) {
  const S = 512;
  const albedo = makeCanvas(S, S), height = makeCanvas(S, S);
  const a = albedo.getContext('2d'), hc = height.getContext('2d');
  a.fillStyle = '#101216'; a.fillRect(0, 0, S, S);
  hc.fillStyle = '#202020'; hc.fillRect(0, 0, S, S);
  const bar = 22, gap = 26;
  for (let y = 0; y < S; y += bar + gap) {
    a.fillStyle = '#4a4e55'; a.fillRect(0, y, S, bar);
    const g = a.createLinearGradient(0, y, 0, y + bar);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
    a.fillStyle = g; a.fillRect(0, y, S, bar);
    hc.fillStyle = '#d0d0d0'; hc.fillRect(0, y, S, bar);
  }
  for (let x = 0; x < S; x += 128) { // cross supports
    a.fillStyle = '#3c4046'; a.fillRect(x, 0, 14, S);
    hc.fillStyle = '#e0e0e0'; hc.fillRect(x, 0, 14, S);
  }
  return { albedo, normal: heightToNormal(height, 2.4) };
}

// ---------- fabric (bed / padding) ----------
function makeFabricMaps(seed, color) {
  const S = 512;
  const albedo = makeCanvas(S, S), height = makeCanvas(S, S);
  const a = albedo.getContext('2d'), hc = height.getContext('2d');
  const rand = mulberry32(seed);
  const wrinkle = fbm(seed + 5, 4);
  a.fillStyle = color; a.fillRect(0, 0, S, S);
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, S, S);
  // weave
  for (let y = 0; y < S; y += 3) {
    a.strokeStyle = `rgba(0,0,0,${0.05 + (y % 6 === 0 ? 0.06 : 0)})`;
    a.beginPath(); a.moveTo(0, y); a.lineTo(S, y); a.stroke();
  }
  for (let x = 0; x < S; x += 3) {
    a.strokeStyle = 'rgba(255,255,255,0.035)';
    a.beginPath(); a.moveTo(x, 0); a.lineTo(x, S); a.stroke();
  }
  const ai = a.getImageData(0, 0, S, S);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const w = wrinkle(px / S, py / S);
      const i = (py * S + px) * 4;
      const d = (w - 0.5) * 0.5;
      ai.data[i] *= 1 + d; ai.data[i + 1] *= 1 + d; ai.data[i + 2] *= 1 + d;
    }
  }
  a.putImageData(ai, 0, 0);
  const hi = hc.getImageData(0, 0, S, S);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const w = wrinkle(px / S, py / S);
      hi.data[(py * S + px) * 4] = w * 255;
      hi.data[(py * S + px) * 4 + 1] = w * 255;
      hi.data[(py * S + px) * 4 + 2] = w * 255;
    }
  }
  hc.putImageData(hi, 0, 0);
  return { albedo, normal: heightToNormal(height, 3.5) };
}

// ---------- cockpit instrument screens (emissive) ----------
export function makeConsoleCanvas(seed, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rand = mulberry32(seed);
  ctx.fillStyle = '#06090e'; ctx.fillRect(0, 0, w, h);
  const cols = ['#ff8c3a', '#2ee8d8', '#ffd23e', '#ff4f4f', '#7fc9ff'];
  // panel sub-divisions
  const ncell = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < ncell; i++) {
    const cw = w / ncell;
    const x = i * cw;
    ctx.strokeStyle = 'rgba(80,90,100,0.6)';
    ctx.strokeRect(x + 4, 4, cw - 8, h - 8);
    const kind = rand();
    if (kind < 0.35) { // bar graph
      const col = cols[Math.floor(rand() * cols.length)];
      for (let b = 0; b < 6; b++) {
        const bh = (0.2 + rand() * 0.7) * (h - 24);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x + 10 + b * ((cw - 20) / 6), h - 10 - bh, (cw - 20) / 6 - 3, bh);
      }
      ctx.globalAlpha = 1;
    } else if (kind < 0.65) { // button grid
      for (let by = 0; by < 4; by++) {
        for (let bx = 0; bx < 5; bx++) {
          ctx.fillStyle = rand() < 0.75 ? cols[Math.floor(rand() * cols.length)] : '#1a2026';
          ctx.globalAlpha = 0.55 + rand() * 0.45;
          ctx.fillRect(x + 10 + bx * (cw - 20) / 5, 12 + by * (h - 24) / 4, (cw - 20) / 5 - 4, (h - 24) / 4 - 4);
        }
      }
      ctx.globalAlpha = 1;
    } else { // scope / lines
      ctx.strokeStyle = cols[Math.floor(rand() * cols.length)];
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let px = 0; px <= cw - 20; px += 4) {
        const yy = h / 2 + Math.sin(px * 0.15 + rand() * 4) * (h * 0.25) * rand();
        if (px === 0) ctx.moveTo(x + 10, yy); else ctx.lineTo(x + 10 + px, yy);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(46,232,216,0.25)';
      ctx.lineWidth = 1;
      for (let gy = 10; gy < h - 10; gy += 12) {
        ctx.beginPath(); ctx.moveTo(x + 10, gy); ctx.lineTo(x + cw - 10, gy); ctx.stroke();
      }
    }
  }
  return c;
}

// ---------- caution stripe ----------
function makeStripeCanvas() {
  const c = makeCanvas(256, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1d1f22'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#e8722a';
  for (let x = -64; x < 256; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 64); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 64, 0); ctx.lineTo(x + 32, 64);
    ctx.closePath(); ctx.fill();
  }
  return c;
}

export function createMaterials() {
  const M = {};

  const hull = makePanelMaps(101, '#cfcabe', '#c96b2c', 0.07);
  M.hull = new THREE.MeshStandardMaterial({
    map: tex(hull.albedo, true), roughnessMap: tex(hull.rough), normalMap: tex(hull.normal),
    roughness: 1, metalness: 0.12, normalScale: new THREE.Vector2(0.8, 0.8),
  });

  const hullDark = makePanelMaps(404, '#7e8288', '#c96b2c', 0.05);
  M.hullDark = new THREE.MeshStandardMaterial({
    map: tex(hullDark.albedo, true), roughnessMap: tex(hullDark.rough), normalMap: tex(hullDark.normal),
    roughness: 1, metalness: 0.25, normalScale: new THREE.Vector2(0.8, 0.8),
  });

  const accent = makePanelMaps(202, '#d8742e', '#cfcabe', 0.1);
  M.accent = new THREE.MeshStandardMaterial({
    map: tex(accent.albedo, true), roughnessMap: tex(accent.rough), normalMap: tex(accent.normal),
    roughness: 1, metalness: 0.12, normalScale: new THREE.Vector2(0.8, 0.8),
  });

  const metal = makeMetalMaps(303, '#888d94');
  M.metal = new THREE.MeshStandardMaterial({
    map: tex(metal.albedo, true), roughnessMap: tex(metal.rough), normalMap: tex(metal.normal),
    roughness: 1, metalness: 0.92, normalScale: new THREE.Vector2(0.6, 0.6),
  });

  const darkMetal = makeMetalMaps(505, '#43464c');
  M.darkMetal = new THREE.MeshStandardMaterial({
    map: tex(darkMetal.albedo, true), roughnessMap: tex(darkMetal.rough), normalMap: tex(darkMetal.normal),
    roughness: 1, metalness: 0.85, normalScale: new THREE.Vector2(0.6, 0.6),
  });

  const floor = makeFloorMaps(606);
  M.floor = new THREE.MeshStandardMaterial({
    map: tex(floor.albedo, true), roughnessMap: tex(floor.rough), normalMap: tex(floor.normal),
    roughness: 1, metalness: 0.6, normalScale: new THREE.Vector2(1, 1),
  });

  const grate = makeGrateMaps(707);
  M.grate = new THREE.MeshStandardMaterial({
    map: tex(grate.albedo, true), normalMap: tex(grate.normal),
    roughness: 0.5, metalness: 0.8, normalScale: new THREE.Vector2(1.2, 1.2),
  });

  const fabric = makeFabricMaps(808, '#3e5a63');
  M.fabric = new THREE.MeshStandardMaterial({
    map: tex(fabric.albedo, true), normalMap: tex(fabric.normal),
    roughness: 0.95, metalness: 0,
  });

  const fabricWarm = makeFabricMaps(909, '#8a5a38');
  M.fabricWarm = new THREE.MeshStandardMaterial({
    map: tex(fabricWarm.albedo, true), normalMap: tex(fabricWarm.normal),
    roughness: 0.95, metalness: 0,
  });

  M.rubber = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.92, metalness: 0.05 });

  M.stripe = new THREE.MeshStandardMaterial({
    map: tex(makeStripeCanvas(), true), roughness: 0.6, metalness: 0.2,
  });

  M.glass = new THREE.MeshPhysicalMaterial({
    color: '#9fc3cf', transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0,
    envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false,
  });

  // emissives
  M.stripTeal = new THREE.MeshStandardMaterial({
    color: '#031a18', emissive: '#2ee8d8', emissiveIntensity: 2.4, roughness: 0.4,
  });
  M.stripWarm = new THREE.MeshStandardMaterial({
    color: '#201408', emissive: '#ffc37a', emissiveIntensity: 2.6, roughness: 0.4,
  });
  M.stripWhite = new THREE.MeshStandardMaterial({
    color: '#1a1c1e', emissive: '#fff4e0', emissiveIntensity: 2.2, roughness: 0.4,
  });
  M.stripRed = new THREE.MeshStandardMaterial({
    color: '#1a0505', emissive: '#ff5230', emissiveIntensity: 1.8, roughness: 0.4,
  });

  return M;
}
