// Ship interior: corridor + cockpit + crew quarters + galley + bathroom.
// Kit-bashed from primitives, procedural materials from textures.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMaterials, makeConsoleCanvas } from './textures.js';

const WALL_T = 0.15;
const CEIL_H = 2.6;

// Rescale box UVs so textures keep a consistent world-space density.
function scaleBoxUVs(geom, sx, sy, sz, density = 0.5) {
  const uv = geom.attributes.uv;
  const dims = [
    [sz, sy], [sz, sy], // +x, -x
    [sx, sz], [sx, sz], // +y, -y
    [sx, sy], [sx, sy], // +z, -z
  ];
  for (let face = 0; face < 6; face++) {
    const [du, dv] = dims[face];
    for (let v = face * 4; v < face * 4 + 4; v++) {
      uv.setXY(v, uv.getX(v) * du * density, uv.getY(v) * dv * density);
    }
  }
  uv.needsUpdate = true;
  return geom;
}

function box(sx, sy, sz, mat, density) {
  const g = scaleBoxUVs(new THREE.BoxGeometry(sx, sy, sz), sx, sy, sz, density);
  return new THREE.Mesh(g, mat);
}

export function buildShip(scene) {
  const M = createMaterials();
  const ship = new THREE.Group();
  scene.add(ship);

  const colliders = [];
  const lightRegistry = []; // { light, day, rest } or { mat, day, rest } for emissives
  const flickers = [];

  function addCollider(cx, cy, cz, sx, sy, sz) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
    ));
  }

  function slab(cx, cy, cz, sx, sy, sz, mat, opts = {}) {
    const m = box(sx, sy, sz, mat, opts.density ?? 0.5);
    m.position.set(cx, cy, cz);
    (opts.parent ?? ship).add(m);
    if (!opts.noCollide) addCollider(cx, cy, cz, sx, sy, sz);
    return m;
  }

  function regLight(light, day, rest) {
    light.intensity = day;
    lightRegistry.push({ light, day, rest });
    return light;
  }
  function regEmissive(mat, day, rest) {
    mat.emissiveIntensity = day;
    lightRegistry.push({ mat, day, rest });
    return mat;
  }

  // unique emissive materials per logical group so rest-cycle dims correctly
  const warmStripMat = regEmissive(M.stripWarm.clone(), 2.6, 0.12);
  const whiteStripMat = regEmissive(M.stripWhite.clone(), 2.2, 0.1);
  const tealStripMat = regEmissive(M.stripTeal.clone(), 2.4, 3.0); // night guidance brightens
  const redStripMat = regEmissive(M.stripRed.clone(), 1.8, 1.8);

  // ============================================================ corridor
  // x in [-1.4, 1.4], z in [-7, 7]
  const CW = 1.4; // corridor half width

  // floor + ceiling
  slab(0, -0.05, 0, CW * 2, 0.1, 14, M.floor);
  slab(0, CEIL_H + 0.05, 0, CW * 2, 0.1, 14, M.hullDark);
  // center grate strip, slightly raised
  const grateStrip = box(1.15, 0.04, 13.6, M.grate, 1);
  grateStrip.position.set(0, 0.021, 0);
  ship.add(grateStrip);
  // teal under-glow lines along grate edges
  for (const gx of [-0.62, 0.62]) {
    const glow = box(0.05, 0.02, 13.6, tealStripMat);
    glow.position.set(gx, 0.025, 0);
    ship.add(glow);
  }

  // corridor walls — leave openings: portholes (-x), quarters door (+x @ z=-1.5),
  // galley door (-x @ z=2.8), bathroom door (+x @ z=4.5), cockpit (z=-7), stern (z=7)
  // +x wall: solid from z=-7..-2.1, door z=-2.1..-0.9, solid -0.9..3.9, door 3.9..5.1, solid 5.1..7
  function wallRun(side, z0, z1, mat) {
    const len = z1 - z0;
    slab(side * (CW + WALL_T / 2), CEIL_H / 2, (z0 + z1) / 2, WALL_T, CEIL_H, len, mat);
  }
  wallRun(1, -7, -2.1, M.hull);
  wallRun(1, -0.9, 3.9, M.hull);
  wallRun(1, 5.1, 7, M.hull);
  // door headers (+x)
  slab(CW + WALL_T / 2, 2.3, -1.5, WALL_T, 0.6, 1.2, M.hull);
  slab(CW + WALL_T / 2, 2.3, 4.5, WALL_T, 0.6, 1.2, M.hull);

  // -x wall with two portholes at z=-4.6 and z=-1.8, galley door z=2.2..3.4
  wallRun(-1, -7, -5.25, M.hull);
  wallRun(-1, -3.95, -2.45, M.hull);
  wallRun(-1, -1.15, 2.2, M.hull);
  wallRun(-1, 3.4, 7, M.hull);
  slab(-CW - WALL_T / 2, 2.3, 2.8, WALL_T, 0.6, 1.2, M.hull);
  // porthole wall segments (above/below openings)
  for (const pz of [-4.6, -1.8]) {
    slab(-CW - WALL_T / 2, 0.55, pz, WALL_T, 1.1, 1.3, M.hull); // below
    slab(-CW - WALL_T / 2, 2.42, pz, WALL_T, 0.36, 1.3, M.hull); // above
    buildPorthole(-CW - WALL_T / 2, 1.62, pz);
  }

  function buildPorthole(x, y, z) {
    // plate with circular hole covering the square opening
    const shape = new THREE.Shape();
    shape.moveTo(-0.65, -0.52); shape.lineTo(0.65, -0.52);
    shape.lineTo(0.65, 0.44); shape.lineTo(-0.65, 0.44); shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.33, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: WALL_T + 0.02, bevelEnabled: false });
    const plate = new THREE.Mesh(g, M.hullDark);
    plate.rotation.y = Math.PI / 2;
    plate.position.set(x - WALL_T / 2 - 0.01, y, z);
    ship.add(plate);
    // ring frame
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 10, 28), M.metal);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x + WALL_T / 2, y, z);
    ship.add(ring);
    // bolts around ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 6), M.darkMetal);
      b.rotation.z = Math.PI / 2; b.rotation.y = Math.PI / 2;
      b.position.set(x + WALL_T / 2 + 0.02, y + Math.sin(a) * 0.42, z + Math.cos(a) * 0.42);
      ship.add(b);
    }
    // glass
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.33, 24), M.glass);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(x, y, z);
    ship.add(glass);
    // outer tube so space view has depth
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 0.5, 20, 1, true), M.darkMetal);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(x - 0.3, y, z);
    ship.add(tube);
  }

  // corridor rib frames every 2m (octagonal arch look via chamfered posts)
  for (let z = -6; z <= 6.01; z += 2) {
    const rib = new THREE.Group();
    const post = box(0.16, CEIL_H - 0.5, 0.22, M.darkMetal, 1);
    const pL = post.clone(); pL.position.set(-CW + 0.07, (CEIL_H - 0.5) / 2, 0); rib.add(pL);
    const pR = post.clone(); pR.position.set(CW - 0.07, (CEIL_H - 0.5) / 2, 0); rib.add(pR);
    // chamfer corners
    for (const s of [-1, 1]) {
      const ch = box(0.7, 0.16, 0.22, M.darkMetal, 1);
      ch.position.set(s * (CW - 0.3), CEIL_H - 0.28, 0);
      ch.rotation.z = -s * Math.PI / 5;
      rib.add(ch);
    }
    const beam = box(1.7, 0.16, 0.22, M.darkMetal, 1);
    beam.position.set(0, CEIL_H - 0.07, 0);
    rib.add(beam);
    // base kick plates
    for (const s of [-1, 1]) {
      const kick = box(0.2, 0.5, 0.3, M.stripe, 1);
      kick.position.set(s * (CW - 0.09), 0.25, 0);
      rib.add(kick);
    }
    rib.position.z = z;
    ship.add(rib);
  }

  // ceiling light strips between ribs (warm)
  for (let z = -5; z <= 5.01; z += 2) {
    const lightBox = box(0.8, 0.05, 1.0, whiteStripMat);
    lightBox.position.set(0, CEIL_H - 0.02, z);
    ship.add(lightBox);
    const frame = box(0.95, 0.06, 1.15, M.darkMetal, 1);
    frame.position.set(0, CEIL_H + 0.01, z);
    ship.add(frame);
  }
  // corridor point lights (warm practicals)
  for (let z = -4.5; z <= 5; z += 4.5) {
    const pl = new THREE.PointLight('#ffd9a0', 0, 7, 1.8);
    pl.position.set(0, CEIL_H - 0.35, z);
    ship.add(pl);
    regLight(pl, 9, 0.7);
    if (z < -4) flickers.push(pl);
  }
  // cool spill from portholes
  const portLight = new THREE.PointLight('#7fb4d8', 0, 5, 1.8);
  portLight.position.set(-1.0, 1.6, -3.2);
  ship.add(portLight);
  regLight(portLight, 2.5, 3.2);

  // wall conduits & pipes along the ceiling corners (merged)
  buildPipes();
  function buildPipes() {
    const runs = [];
    const pipeGeo = (r, len) => new THREE.CylinderGeometry(r, r, len, 10);
    // two long runs on each upper corner
    const defs = [
      { x: -CW + 0.14, y: CEIL_H - 0.42, r: 0.055 },
      { x: -CW + 0.26, y: CEIL_H - 0.5, r: 0.038 },
      { x: CW - 0.14, y: CEIL_H - 0.42, r: 0.055 },
      { x: CW - 0.22, y: CEIL_H - 0.52, r: 0.03 },
    ];
    const geosMetal = [], geosAccent = [];
    for (const d of defs) {
      const g = pipeGeo(d.r, 13.8);
      g.rotateX(Math.PI / 2);
      g.translate(d.x, d.y, 0);
      (d.r < 0.04 ? geosAccent : geosMetal).push(g);
    }
    // clamps
    for (let z = -6; z <= 6.01; z += 2) {
      for (const d of defs) {
        const c = new THREE.CylinderGeometry(d.r + 0.025, d.r + 0.025, 0.06, 8);
        c.rotateX(Math.PI / 2);
        c.translate(d.x, d.y, z + 0.5);
        geosMetal.push(c);
      }
    }
    // junction boxes at intervals
    for (let z = -5; z <= 6; z += 3.7) {
      const jb = new THREE.BoxGeometry(0.22, 0.16, 0.3);
      jb.translate(-CW + 0.12, CEIL_H - 0.75, z);
      geosMetal.push(jb);
    }
    const mMesh = new THREE.Mesh(mergeGeometries(geosMetal), M.metal);
    ship.add(mMesh);
    const aMesh = new THREE.Mesh(mergeGeometries(geosAccent), M.accent);
    ship.add(aMesh);
  }

  // waist-height greeble band on corridor walls (boxes, vents, valves)
  buildGreebles();
  function buildGreebles() {
    const rng = (() => { let s = 42; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const geosDark = [], geosMetal = [], geosAccent = [];
    const bands = [
      { x: CW - 0.04, zs: [-6.4, -5.6, -4.8, -3.6, -2.8, 0.2, 1.0, 2.2, 3.0, 5.6, 6.4], face: -1 },
      { x: -CW + 0.04, zs: [-6.6, -5.8, -0.6, 0.4, 1.2, 4.0, 4.8, 5.6, 6.4], face: 1 },
    ];
    for (const band of bands) {
      for (const z of band.zs) {
        const kind = rng();
        const y = 0.9 + rng() * 0.8;
        if (kind < 0.4) { // conduit box
          const g = new THREE.BoxGeometry(0.07 + rng() * 0.08, 0.15 + rng() * 0.3, 0.2 + rng() * 0.35);
          g.translate(band.x, y, z);
          (rng() < 0.25 ? geosAccent : geosDark).push(g);
        } else if (kind < 0.65) { // vent grill
          for (let k = 0; k < 4; k++) {
            const g = new THREE.BoxGeometry(0.05, 0.035, 0.4);
            g.translate(band.x, y + k * 0.07, z);
            geosDark.push(g);
          }
        } else if (kind < 0.85) { // valve wheel
          const g = new THREE.TorusGeometry(0.09, 0.022, 8, 16);
          g.rotateY(Math.PI / 2);
          g.translate(band.x + band.face * 0.05, y, z);
          geosMetal.push(g);
          const hub = new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8);
          hub.rotateZ(Math.PI / 2);
          hub.translate(band.x, y, z);
          geosMetal.push(hub);
        } else { // small breaker panel
          const g = new THREE.BoxGeometry(0.06, 0.4, 0.28);
          g.translate(band.x, y, z);
          geosAccent.push(g);
        }
      }
    }
    if (geosDark.length) ship.add(new THREE.Mesh(mergeGeometries(geosDark), M.darkMetal));
    if (geosMetal.length) ship.add(new THREE.Mesh(mergeGeometries(geosMetal), M.metal));
    if (geosAccent.length) ship.add(new THREE.Mesh(mergeGeometries(geosAccent), M.accent));
  }

  // stern bulkhead (z=7): big sealed circular hatch + warning stripes
  slab(0, CEIL_H / 2, 7 + WALL_T / 2, CW * 2 + 1, CEIL_H, WALL_T, M.hullDark);
  {
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 24), M.metal);
    hatch.rotation.x = Math.PI / 2;
    hatch.position.set(0, 1.35, 6.96);
    ship.add(hatch);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.18, 12), M.darkMetal);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, 1.35, 6.9);
    ship.add(hub);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spoke = box(0.07, 0.6, 0.05, M.darkMetal, 1);
      spoke.position.set(Math.cos(a) * 0.42, 1.35 + Math.sin(a) * 0.42, 6.89);
      spoke.rotation.z = a + Math.PI / 2;
      ship.add(spoke);
    }
    const stripeTop = box(2.4, 0.22, 0.06, M.stripe, 1);
    stripeTop.position.set(0, 2.42, 6.92);
    ship.add(stripeTop);
    // red status lights
    for (const sx of [-1.05, 1.05]) {
      const lamp = box(0.1, 0.1, 0.06, redStripMat);
      lamp.position.set(sx, 2.1, 6.92);
      ship.add(lamp);
    }
  }

  // ============================================================ cockpit
  // x in [-2.6, 2.6], z in [-11.6, -7]
  const CK = { x0: -2.6, x1: 2.6, z0: -11.6, z1: -7 };
  slab(0, -0.05, -9.3, 5.2, 0.1, 4.6, M.floor);
  slab(0, CEIL_H + 0.05, -9.3, 5.2, 0.1, 4.6, M.hullDark);
  // back wall (door to corridor at center, opening 1.2)
  slab(-1.65, CEIL_H / 2, -7 - WALL_T / 2, 1.9, CEIL_H, WALL_T, M.hull);
  slab(1.65, CEIL_H / 2, -7 - WALL_T / 2, 1.9, CEIL_H, WALL_T, M.hull);
  slab(0, 2.3, -7 - WALL_T / 2, 1.2, 0.6, WALL_T, M.hull);
  // door frame stripes
  for (const sx of [-0.66, 0.66]) {
    const post = box(0.12, 2.0, 0.3, M.stripe, 1);
    post.position.set(sx, 1.0, -7);
    ship.add(post);
  }
  // side walls
  slab(CK.x0 - WALL_T / 2, CEIL_H / 2, -9.0, WALL_T, CEIL_H, 4.0, M.hull);
  slab(CK.x1 + WALL_T / 2, CEIL_H / 2, -9.0, WALL_T, CEIL_H, 4.0, M.hull);
  // angled front corners (45°)
  for (const s of [-1, 1]) {
    const corner = box(1.7, CEIL_H, WALL_T, M.hull, 0.5);
    corner.position.set(s * 2.05, CEIL_H / 2, -11.15);
    corner.rotation.y = -s * Math.PI / 4.5;
    ship.add(corner);
    addCollider(s * 2.05, CEIL_H / 2, -11.15, 1.4, CEIL_H, 1.2);
  }
  // front viewport wall: lower hull, big 3-pane window leaning back, header
  slab(0, 0.45, -11.5, 3.0, 0.9, WALL_T, M.hullDark);
  addCollider(0, 1.5, -11.45, 3.2, 3, 0.6); // keep player off the glass
  {
    const W = 3.4, H = 1.55;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, -H / 2); shape.lineTo(W / 2, -H / 2);
    shape.lineTo(W / 2, H / 2); shape.lineTo(-W / 2, H / 2); shape.closePath();
    // three panes with mullions
    const paneW = (W - 0.5) / 3;
    for (let i = 0; i < 3; i++) {
      const x0 = -W / 2 + 0.125 + i * (paneW + 0.125);
      const hole = new THREE.Path();
      hole.moveTo(x0, -H / 2 + 0.12); hole.lineTo(x0 + paneW, -H / 2 + 0.12);
      hole.lineTo(x0 + paneW, H / 2 - 0.12); hole.lineTo(x0, H / 2 - 0.12);
      hole.closePath();
      shape.holes.push(hole);
    }
    const frame = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 }),
      M.darkMetal,
    );
    const winGroup = new THREE.Group();
    winGroup.add(frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, H - 0.1), M.glass);
    glass.position.z = 0.06;
    winGroup.add(glass);
    winGroup.position.set(0, 1.72, -11.52);
    winGroup.rotation.x = 0.16; // lean top away
    ship.add(winGroup);
    // header above window
    slab(0, 2.52, -11.42, 3.6, 0.25, 0.3, M.hullDark, { noCollide: true });
  }

  // dashboard console under the window
  const galleyRef = {}, dashboard = new THREE.Group();
  {
    const deck = box(3.2, 0.12, 1.0, M.darkMetal, 1);
    deck.position.set(0, 0.95, -10.9);
    deck.rotation.x = -0.18;
    dashboard.add(deck);
    const front = box(3.2, 0.55, 0.7, M.hullDark, 1);
    front.position.set(0, 0.55, -10.8);
    dashboard.add(front);
    addCollider(0, 0.7, -10.85, 3.2, 1.4, 1.1);
    // emissive instrument screens
    const consoleCanvas = makeConsoleCanvas(11, 1024, 256);
    const consoleCanvas2 = makeConsoleCanvas(57, 1024, 256);
    const ctex = new THREE.CanvasTexture(consoleCanvas);
    ctex.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshStandardMaterial({
      map: ctex, emissive: '#ffffff', emissiveMap: ctex, emissiveIntensity: 1.6,
      roughness: 0.35, metalness: 0,
    });
    regEmissive(screenMat, 1.6, 0.5);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.62), screenMat);
    screen.position.set(0, 1.06, -10.93);
    screen.rotation.x = -0.18;
    screen.translateZ(0.07);
    dashboard.add(screen);
    // alternate the screen content for life
    let t = 0, which = 0;
    flickers.push({ // piggyback custom updater object
      isScreen: true,
      update(dt) {
        t += dt;
        if (t > 0.9) {
          t = 0; which = 1 - which;
          ctex.image = which ? consoleCanvas2 : consoleCanvas;
          ctex.needsUpdate = true;
        }
      },
    });
    // side consoles
    for (const s of [-1, 1]) {
      const side = box(0.8, 0.9, 1.6, M.hullDark, 1);
      side.position.set(s * 2.05, 0.45, -9.9);
      dashboard.add(side);
      addCollider(s * 2.05, 0.45, -9.9, 0.8, 0.9, 1.6);
      const sCanvas = makeConsoleCanvas(70 + s, 256, 256);
      const sTex = new THREE.CanvasTexture(sCanvas);
      sTex.colorSpace = THREE.SRGBColorSpace;
      const sMat = new THREE.MeshStandardMaterial({
        map: sTex, emissive: '#ffffff', emissiveMap: sTex, emissiveIntensity: 1.2, roughness: 0.4,
      });
      regEmissive(sMat, 1.2, 0.4);
      const sScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), sMat);
      sScreen.position.set(s * 2.05, 0.96, -9.9);
      sScreen.rotation.x = -Math.PI / 2;
      sScreen.rotation.z = s * 0.3;
      sScreen.position.y = 0.91;
      dashboard.add(sScreen);
    }
    ship.add(dashboard);
  }

  // pilot seats
  for (const s of [-1, 1]) {
    const seat = new THREE.Group();
    const base = box(0.18, 0.4, 0.18, M.darkMetal, 1);
    base.position.y = 0.2; seat.add(base);
    const cushion = box(0.56, 0.14, 0.52, M.fabric, 2);
    cushion.position.y = 0.47; seat.add(cushion);
    const back = box(0.56, 0.75, 0.14, M.fabric, 2);
    back.position.set(0, 0.85, 0.3); back.rotation.x = 0.12; seat.add(back);
    const head = box(0.34, 0.22, 0.12, M.fabricWarm, 2);
    head.position.set(0, 1.32, 0.36); seat.add(head);
    for (const as of [-1, 1]) {
      const arm = box(0.08, 0.08, 0.42, M.rubber, 1);
      arm.position.set(as * 0.33, 0.62, 0.08); seat.add(arm);
    }
    seat.position.set(s * 0.65, 0, -9.7);
    ship.add(seat);
    addCollider(s * 0.65, 0.7, -9.7, 0.6, 1.4, 0.6);
  }

  // cockpit lights: cool key through the window + warm fill behind
  const coolKey = new THREE.PointLight('#9fc8ff', 0, 9, 1.6);
  coolKey.position.set(0, 1.9, -11.0);
  ship.add(coolKey);
  regLight(coolKey, 7, 5);
  const warmFill = new THREE.PointLight('#ffc890', 0, 6, 2);
  warmFill.position.set(0, 2.3, -7.8);
  ship.add(warmFill);
  regLight(warmFill, 6, 0.5);
  // overhead switch panel w/ tiny emissive dots
  {
    const panel = box(1.2, 0.5, 0.08, M.hullDark, 1);
    panel.position.set(0, 2.35, -10.4);
    panel.rotation.x = 0.5;
    ship.add(panel);
    const dotGeos = [];
    const rng = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BoxGeometry(0.04, 0.04, 0.03);
      g.translate(-0.5 + (i % 8) * 0.14, 2.28 + Math.floor(i / 8) * 0.13, -10.42 + Math.floor(i / 8) * 0.072);
      dotGeos.push(g);
    }
    const dotsMat = regEmissive(M.stripTeal.clone(), 1.6, 1.0);
    const dots = new THREE.Mesh(mergeGeometries(dotGeos), dotsMat);
    dots.rotation.x = 0; // positions pre-baked
    ship.add(dots);
  }

  // ============================================================ crew quarters
  // x in [1.4, 5.4], z in [-3.5, 0.5], door at x=1.4, z=-1.5
  const Q = { x0: 1.4, x1: 5.4, z0: -3.5, z1: 0.5 };
  slab(3.4, -0.05, -1.5, 4.0, 0.1, 4.0, M.floor);
  slab(3.4, CEIL_H + 0.05, -1.5, 4.0, 0.1, 4.0, M.hullDark);
  slab(Q.x1 + WALL_T / 2, CEIL_H / 2, -1.5, WALL_T, CEIL_H, 4.0, M.hull);
  slab(3.4, CEIL_H / 2, Q.z0 - WALL_T / 2, 4.0, CEIL_H, WALL_T, M.hull);
  slab(3.4, CEIL_H / 2, Q.z1 + WALL_T / 2, 4.0, CEIL_H, WALL_T, M.hull);

  // bed along the far wall
  const bed = new THREE.Group();
  {
    const frame = box(2.0, 0.32, 1.0, M.darkMetal, 1);
    frame.position.set(0, 0.16, 0); bed.add(frame);
    const mattress = box(1.94, 0.18, 0.94, M.fabric, 1);
    mattress.position.set(0, 0.41, 0); bed.add(mattress);
    const blanket = box(1.3, 0.08, 0.96, M.fabricWarm, 1);
    blanket.position.set(-0.3, 0.52, 0); bed.add(blanket);
    const pillow = box(0.4, 0.12, 0.6, M.fabricWarm, 2);
    pillow.position.set(0.7, 0.53, 0); bed.add(pillow);
    // headboard shelf + reading strip
    const shelf = box(0.3, 0.06, 1.0, M.metal, 1);
    shelf.position.set(0.95, 1.1, 0); bed.add(shelf);
    const readStrip = box(0.04, 0.04, 0.9, warmStripMat);
    readStrip.position.set(0.93, 1.05, 0); bed.add(readStrip);
    bed.position.set(4.3, 0, -2.85);
    ship.add(bed);
    addCollider(4.3, 0.4, -2.85, 2.0, 0.8, 1.0);
  }
  bed.userData = { label: 'E: Sleep', action: 'sleep' };

  // locker + desk + crates
  {
    const locker = box(0.6, 1.9, 1.1, M.hullDark, 1);
    locker.position.set(5.05, 0.95, -0.2);
    ship.add(locker);
    addCollider(5.05, 0.95, -0.2, 0.6, 1.9, 1.1);
    for (const dz of [-0.45, 0.1]) { // locker door seams + handles
      const handle = box(0.04, 0.16, 0.04, M.metal, 1);
      handle.position.set(4.72, 1.0, -0.2 + dz);
      ship.add(handle);
    }
    const desk = box(0.9, 0.06, 0.7, M.metal, 1);
    desk.position.set(2.0, 0.78, 0.0);
    ship.add(desk);
    const deskLeg = box(0.08, 0.78, 0.08, M.darkMetal, 1);
    deskLeg.position.set(2.3, 0.39, 0.25); ship.add(deskLeg);
    const deskLeg2 = deskLeg.clone(); deskLeg2.position.set(2.3, 0.39, -0.25); ship.add(deskLeg2);
    addCollider(2.0, 0.5, 0.0, 0.9, 1.0, 0.7);
    // crates with stripes
    const crate = box(0.55, 0.55, 0.55, M.accent, 1);
    crate.position.set(2.0, 0.275, -3.0);
    crate.rotation.y = 0.3;
    ship.add(crate);
    const crate2 = box(0.45, 0.45, 0.45, M.hullDark, 1);
    crate2.position.set(2.55, 0.225, -3.1);
    crate2.rotation.y = -0.2;
    ship.add(crate2);
    addCollider(2.25, 0.3, -3.05, 1.2, 0.6, 0.8);
  }
  const qLight = new THREE.PointLight('#ffcf9a', 0, 6, 1.8);
  qLight.position.set(3.4, CEIL_H - 0.3, -1.2);
  ship.add(qLight);
  regLight(qLight, 7, 0.4);
  {
    const fixture = box(0.5, 0.04, 0.5, whiteStripMat);
    fixture.position.set(3.4, CEIL_H - 0.02, -1.2);
    ship.add(fixture);
    // teal floor strip
    const strip = box(0.04, 0.03, 3.6, tealStripMat);
    strip.position.set(Q.x1 - 0.08, 0.03, -1.5);
    ship.add(strip);
  }

  // ============================================================ galley
  // x in [-5, -1.4], z in [1, 4.6], door at x=-1.4, z=2.8
  const G = { x0: -5, x1: -1.4, z0: 1, z1: 4.6 };
  slab(-3.2, -0.05, 2.8, 3.6, 0.1, 3.6, M.floor);
  slab(-3.2, CEIL_H + 0.05, 2.8, 3.6, 0.1, 3.6, M.hullDark);
  slab(G.x0 - WALL_T / 2, CEIL_H / 2, 2.8, WALL_T, CEIL_H, 3.6, M.hull);
  slab(-3.2, CEIL_H / 2, G.z0 - WALL_T / 2, 3.6, CEIL_H, WALL_T, M.hull);
  slab(-3.2, CEIL_H / 2, G.z1 + WALL_T / 2, 3.6, CEIL_H, WALL_T, M.hull);

  const galley = new THREE.Group();
  {
    // counter along far wall
    const counter = box(0.7, 0.92, 3.3, M.hullDark, 1);
    counter.position.set(-4.6, 0.46, 2.8);
    galley.add(counter);
    const top = box(0.76, 0.05, 3.36, M.metal, 1);
    top.position.set(-4.6, 0.95, 2.8);
    galley.add(top);
    addCollider(-4.6, 0.5, 2.8, 0.8, 1.0, 3.4);
    // sink recess
    const sink = box(0.4, 0.12, 0.5, M.darkMetal, 1);
    sink.position.set(-4.6, 0.93, 3.7);
    galley.add(sink);
    const faucet = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 16, Math.PI), M.metal);
    faucet.position.set(-4.78, 1.05, 3.7);
    faucet.rotation.y = Math.PI / 2;
    galley.add(faucet);
    // hotplate rings (emissive)
    const plateMat = regEmissive(new THREE.MeshStandardMaterial({
      color: '#170703', emissive: '#ff6a2a', emissiveIntensity: 1.6, roughness: 0.5,
    }), 1.6, 0.2);
    for (const dz of [1.6, 2.2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 24), plateMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(-4.6, 0.98, dz);
      galley.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 16), plateMat);
      ring2.rotation.x = Math.PI / 2;
      ring2.position.set(-4.6, 0.98, dz);
      galley.add(ring2);
    }
    // overhead cabinets
    const cab = box(0.5, 0.7, 3.0, M.hull, 1);
    cab.position.set(-4.72, 2.0, 2.8);
    galley.add(cab);
    for (const dz of [1.6, 2.8, 4.0]) {
      const seam = box(0.04, 0.5, 0.03, M.darkMetal, 1);
      seam.position.set(-4.45, 2.0, dz);
      galley.add(seam);
    }
    // under-cabinet warm strip
    const ucStrip = box(0.04, 0.04, 3.0, warmStripMat);
    ucStrip.position.set(-4.5, 1.62, 2.8);
    galley.add(ucStrip);
    // table + stools
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.05, 16), M.metal);
    table.position.set(-2.4, 0.82, 3.7);
    galley.add(table);
    const tLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.82, 10), M.darkMetal);
    tLeg.position.set(-2.4, 0.41, 3.7);
    galley.add(tLeg);
    addCollider(-2.4, 0.5, 3.7, 0.9, 1.0, 0.9);
    for (const a of [0.6, 2.5]) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.06, 12), M.fabricWarm);
      const sx = -2.4 + Math.cos(a) * 0.85, sz = 3.7 + Math.sin(a) * 0.85;
      stool.position.set(sx, 0.5, sz);
      galley.add(stool);
      const sLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.5, 8), M.darkMetal);
      sLeg.position.set(sx, 0.25, sz);
      galley.add(sLeg);
      addCollider(sx, 0.3, sz, 0.36, 0.6, 0.36);
    }
    ship.add(galley);
  }
  galley.userData = { label: 'E: Eat', action: 'eat' };
  galleyRef.group = galley;

  const gLight = new THREE.PointLight('#ffd9a0', 0, 6, 1.8);
  gLight.position.set(-3.6, CEIL_H - 0.4, 2.8);
  ship.add(gLight);
  regLight(gLight, 8, 0.5);
  {
    const fixture = box(0.5, 0.04, 0.9, whiteStripMat);
    fixture.position.set(-3.6, CEIL_H - 0.02, 2.8);
    ship.add(fixture);
  }

  // ============================================================ bathroom
  // x in [1.4, 3.6], z in [3.4, 5.6], door at x=1.4, z=4.5
  const B = { x0: 1.4, x1: 3.6, z0: 3.4, z1: 5.6 };
  slab(2.5, -0.05, 4.5, 2.2, 0.1, 2.2, M.floor);
  slab(2.5, CEIL_H + 0.05, 4.5, 2.2, 0.1, 2.2, M.hullDark);
  slab(B.x1 + WALL_T / 2, CEIL_H / 2, 4.5, WALL_T, CEIL_H, 2.2, M.hull);
  slab(2.5, CEIL_H / 2, B.z0 - WALL_T / 2, 2.2, CEIL_H, WALL_T, M.hull);
  slab(2.5, CEIL_H / 2, B.z1 + WALL_T / 2, 2.2, CEIL_H, WALL_T, M.hull);

  const bath = new THREE.Group();
  {
    // compact san-unit: seat + tank
    const unit = box(0.5, 0.45, 0.45, M.hullDark, 1);
    unit.position.set(3.25, 0.225, 5.2);
    bath.add(unit);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 14), M.hull);
    lid.position.set(3.25, 0.48, 5.2);
    bath.add(lid);
    addCollider(3.25, 0.3, 5.2, 0.5, 0.6, 0.5);
    // sink + mirror
    const basin = box(0.45, 0.12, 0.4, M.metal, 1);
    basin.position.set(3.3, 0.85, 4.0);
    bath.add(basin);
    const pedestal = box(0.18, 0.85, 0.18, M.darkMetal, 1);
    pedestal.position.set(3.3, 0.42, 4.0);
    bath.add(pedestal);
    addCollider(3.3, 0.5, 4.0, 0.5, 1.0, 0.45);
    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 0.6),
      new THREE.MeshStandardMaterial({ color: '#c8d4dc', roughness: 0.05, metalness: 1.0 }),
    );
    mirror.position.set(3.66, 1.55, 4.0);
    mirror.rotation.y = -Math.PI / 2;
    bath.add(mirror);
    ship.add(bath);
  }
  bath.userData = { label: 'E: Freshen Up', action: 'refresh' };

  const bLight = new THREE.PointLight('#dcecff', 0, 4, 1.8);
  bLight.position.set(2.5, CEIL_H - 0.3, 4.5);
  ship.add(bLight);
  regLight(bLight, 5, 0.6);
  {
    const fixture = box(0.4, 0.04, 0.4, whiteStripMat);
    fixture.position.set(2.5, CEIL_H - 0.02, 4.5);
    ship.add(fixture);
  }

  // ============================================================ global
  const hemi = new THREE.HemisphereLight('#2c3640', '#1c150e', 0);
  scene.add(hemi);
  regLight(hemi, 0.5, 0.18);

  // rest-cycle mix control
  let restMix = 0;
  function setRestMix(m) {
    restMix = m;
    for (const e of lightRegistry) {
      const v = e.day + (e.rest - e.day) * m;
      if (e.light) e.light.intensity = v;
      else e.mat.emissiveIntensity = v;
    }
  }
  setRestMix(0);

  // flicker + screen updates
  let ft = 0;
  function update(dt, elapsed) {
    ft += dt;
    for (const f of flickers) {
      if (f.isScreen) { f.update(dt); continue; }
      // subtle dirty-ballast flicker on one corridor light
      const base = f === flickers[0] ? 1 : 1;
      const n = Math.sin(elapsed * 31.7) * Math.sin(elapsed * 17.3 + 1.7) * Math.sin(elapsed * 7.1);
      const dayBase = 9 * (1 - restMix) + 0.7 * restMix;
      f.intensity = dayBase * (0.92 + 0.08 * n * base);
    }
  }

  return {
    group: ship,
    colliders,
    interactables: [bed, galleyRef.group, bath],
    setRestMix,
    update,
  };
}
