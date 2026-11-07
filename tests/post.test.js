// Regression tests for the post-processing quality tiers in src/post.js.
// Runs the real setupPost (EffectComposer, N8AOPass, UnrealBloomPass) against a
// minimal renderer stub; nothing is rendered, so no browser/GPU is needed.
// Real WebGL rendering is checked separately in headless Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { N8AOPass } from 'n8ao';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setupPost } from '../src/post.js';

function makeRenderer(width, height, pixelRatio) {
  return {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    _w: width,
    _h: height,
    _pr: pixelRatio,
    getPixelRatio() { return this._pr; },
    setPixelRatio(pr) { this._pr = pr; },
    getSize(v) { return v.set(this._w, this._h); },
    setSize(w, h) { this._w = w; this._h = h; },
  };
}

function setup(width, height, pixelRatio) {
  const renderer = makeRenderer(width, height, pixelRatio);
  const post = setupPost(renderer, new THREE.Scene(), new THREE.PerspectiveCamera());
  const passes = post.composer.passes;
  const n8ao = passes.find((p) => p instanceof N8AOPass);
  const bloom = passes.find((p) => p instanceof UnrealBloomPass);
  return { renderer, post, passes, n8ao, bloom };
}

// observable state of the chain for one tier
function snapshot({ renderer, post, passes, n8ao, bloom }) {
  return {
    passCount: passes.length,
    rendererPR: renderer.getPixelRatio(),
    composerPR: post.composer.getPixelRatio?.() ?? post.composer._pixelRatio,
    target: [post.composer.renderTarget1.width, post.composer.renderTarget1.height],
    aoEnabled: n8ao.enabled,
    aoSamples: n8ao.configuration.aoSamples,
    aoDenoiseSamples: n8ao.configuration.denoiseSamples,
    aoHalfRes: n8ao.configuration.halfRes,
    aoTarget: [n8ao.width, n8ao.height],
    bloomEnabled: bloom.enabled,
    bloomBright: [bloom.renderTargetBright.width, bloom.renderTargetBright.height],
  };
}

test('default tier is high and keeps the original chain and settings', () => {
  const ctx = setup(800, 600, 1.5);
  const { post, passes, bloom, renderer } = ctx;
  assert.equal(post.getQuality(), 'high');
  const order = [RenderPass, N8AOPass, UnrealBloomPass, ShaderPass, OutputPass];
  assert.equal(passes.length, order.length);
  order.forEach((Cls, i) => assert.ok(passes[i] instanceof Cls, `pass ${i} is ${Cls.name}`));
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, 0.88);
  assert.deepEqual([bloom.strength, bloom.radius, bloom.threshold], [0.38, 0.5, 1.0]);
  const s = snapshot(ctx);
  assert.equal(s.aoEnabled, true);
  assert.equal(s.aoSamples, 16);
  assert.equal(s.aoDenoiseSamples, 8);
  assert.equal(s.aoHalfRes, true);
  assert.equal(s.bloomEnabled, true);
  assert.equal(s.rendererPR, 1.5);
  assert.deepEqual(s.target, [1200, 900]);
  // existing setSize(w, h) callers keep working
  post.setSize(1000, 500);
  const r = snapshot(ctx);
  assert.deepEqual(r.target, [1500, 750]);
  assert.deepEqual(r.bloomBright, [750, 375]);
  assert.deepEqual(r.aoTarget, [1500, 750]);
});

for (const dpr of [1, 1.75]) {
  test(`high→medium→low→high with resizes matches each tier (pixel ratio ${dpr})`, () => {
    const ctx = setup(1280, 720, dpr);
    const { post } = ctx;
    const dev = (v) => Math.round(v * dpr);
    const high = snapshot(ctx);

    const steps = [
      ['high', 1280, 720], ['medium', 1280, 720], ['medium', 640, 360],
      ['low', 640, 360], ['low', 1024, 576], ['high', 1024, 576], ['high', 1280, 720],
    ];
    for (const [level, w, h] of steps) {
      if (post.getQuality() !== level) post.setQuality(level);
      post.setSize(w, h);
      const s = snapshot(ctx);
      const msg = `${level} ${w}x${h}`;
      assert.equal(s.passCount, 5, msg);
      if (level === 'low') {
        assert.equal(s.rendererPR, 1, msg);
        assert.equal(s.composerPR, 1, msg);
        assert.deepEqual(s.target, [w, h], msg);
        assert.equal(s.aoEnabled, false, msg);
        assert.equal(s.bloomEnabled, false, msg);
      } else {
        assert.equal(s.rendererPR, dpr, msg);
        assert.equal(s.composerPR, dpr, msg);
        assert.deepEqual(s.target, [dev(w), dev(h)], msg);
        assert.deepEqual(s.aoTarget, [dev(w), dev(h)], msg);
        assert.equal(s.aoEnabled, true, msg);
        assert.equal(s.bloomEnabled, true, msg);
        assert.equal(s.aoHalfRes, true, msg);
      }
      if (level === 'high') {
        assert.equal(s.aoSamples, 16, msg);
        assert.equal(s.aoDenoiseSamples, 8, msg);
        assert.deepEqual(s.bloomBright, [Math.round(dev(w) / 2), Math.round(dev(h) / 2)], msg);
      }
      if (level === 'medium') {
        // lower AO quality and a smaller bloom target than high at the same size
        assert.ok(s.aoSamples < high.aoSamples, msg);
        assert.ok(s.bloomBright[0] < Math.round(dev(w) / 2), msg);
        assert.ok(s.bloomBright[1] < Math.round(dev(h) / 2), msg);
      }
    }
    // back at high 1280x720: identical to the initial state
    assert.deepEqual(snapshot(ctx), high);
  });
}

test('selecting the same tier repeatedly does not add passes or change sizes', () => {
  const ctx = setup(640, 480, 2);
  ctx.post.setQuality('medium');
  const once = snapshot(ctx);
  for (let i = 0; i < 5; i++) ctx.post.setQuality('medium');
  assert.deepEqual(snapshot(ctx), once);
});

test('unknown tier is rejected and leaves the current tier unchanged', () => {
  const ctx = setup(640, 480, 1);
  ctx.post.setQuality('medium');
  const before = snapshot(ctx);
  assert.throws(() => ctx.post.setQuality('ultra'), RangeError);
  assert.throws(() => ctx.post.setQuality(undefined), RangeError);
  assert.equal(ctx.post.getQuality(), 'medium');
  assert.deepEqual(snapshot(ctx), before);
});

test('sRGB encoding stays in the chain exactly once when N8AO is switched off', () => {
  // N8AOPass encodes its output to sRGB (gammaCorrection defaults to true) and
  // the original look depends on it. `low` turns N8AO off, so the grain pass
  // must take over that encoding; every other tier must not encode twice.
  const { post, passes, n8ao } = setup(800, 600, 1);
  const grain = passes.find((p) => p instanceof ShaderPass && p.uniforms.grain);
  assert.equal(n8ao.configuration.gammaCorrection, true);
  const encodes = () => [n8ao.enabled, grain.uniforms.encodeSRGB.value];
  assert.deepEqual(encodes(), [true, false]);
  for (const [level, expected] of [['medium', [true, false]], ['low', [false, true]], ['high', [true, false]], ['low', [false, true]], ['medium', [true, false]]]) {
    post.setQuality(level);
    assert.deepEqual(encodes(), expected, level);
  }
  assert.match(grain.material.fragmentShader, /if \(encodeSRGB\) col = sRGBTransferOETF\(col\);/);
});
