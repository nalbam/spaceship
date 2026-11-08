// Post chain: RenderPass → N8AO → bloom → vignette/grain shader → output
// (ACES on renderer). Only one pass draws the scene per frame: N8AOPass renders
// the scene into its own beauty target (configuration.autoRenderBeauty, the
// default) and does not read the composer's readBuffer, so on the AO tiers
// (`medium`, `high`) the RenderPass is disabled; on `low` (no AO) the
// RenderPass draws the scene. RenderPass has needsSwap = false, so disabling
// it does not change the composer's buffer swaps.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';

const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.045 },
    vignette: { value: 0.42 },
    // N8AOPass sRGB-encodes its output (n8ao gammaCorrection, default true),
    // so the rest of the chain works on encoded colour. When N8AO is off
    // (`low`), this pass applies the same encoding to keep the brightness.
    encodeSRGB: { value: false },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, grain, vignette;
    uniform bool encodeSRGB;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + time * 43.7) * 43758.5453);
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      if (encodeSRGB) col = sRGBTransferOETF(col);
      // split toning: teal shadows, warm highlights — coheres the palette
      float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb *= mix(vec3(0.93, 1.02, 1.06), vec3(1.05, 1.0, 0.94), smoothstep(0.12, 0.65, lum));
      // vignette
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * vignette * 2.4;
      col.rgb *= v;
      // film grain
      float g = (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * grain;
      col.rgb += g * (0.6 + 0.4 * (1.0 - col.rgb));
      gl_FragColor = col;
    }`,
};

// Quality tiers. `high` is the original look; `medium` trims AO samples and
// renders bloom into a smaller target; `low` skips AO and bloom entirely,
// draws the scene with the RenderPass instead of N8AO, moves N8AO's sRGB
// encoding into the grain pass and drops the renderer to 1 device pixel per
// CSS pixel.
export const QUALITY_LEVELS = Object.freeze(['low', 'medium', 'high']);
export const QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({ ao: true, aoMode: 'Medium', bloom: true, bloomScale: 1, nativePixelRatio: true }),
  medium: Object.freeze({ ao: true, aoMode: 'Performance', bloom: true, bloomScale: 0.5, nativePixelRatio: true }),
  low: Object.freeze({ ao: false, aoMode: 'Performance', bloom: false, bloomScale: 0.5, nativePixelRatio: false }),
});

export function setupPost(renderer, scene, camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;

  // pixel ratio the caller chose (main.js: min(devicePixelRatio, 1.75));
  // restored whenever a tier other than `low` is selected
  const nativePixelRatio = renderer.getPixelRatio();

  const composer = new EffectComposer(renderer);
  // scene render for tiers without AO; disabled while N8AO renders the scene
  const renderPass = new RenderPass(scene, camera);
  renderPass.enabled = !QUALITY_PRESETS.high.ao;
  composer.addPass(renderPass);

  const size = renderer.getSize(new THREE.Vector2());
  const n8ao = new N8AOPass(scene, camera, size.x, size.y);
  n8ao.configuration.aoRadius = 0.9;
  n8ao.configuration.distanceFalloff = 0.9;
  n8ao.configuration.intensity = 3.2;
  n8ao.configuration.halfRes = true;
  n8ao.setQualityMode('Medium');
  composer.addPass(n8ao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.5, 1.0);
  composer.addPass(bloom);

  const grainPass = new ShaderPass(GrainVignetteShader);
  composer.addPass(grainPass);

  composer.addPass(new OutputPass());

  let quality = 'high';
  let width = size.x;
  let height = size.y;

  // Single sizing path for both resize and tier changes. composer.setSize
  // resizes every pass to width*height*pixelRatio, so the bloom reduction is
  // applied after it and survives later resizes.
  function applySize() {
    const preset = QUALITY_PRESETS[quality];
    const pr = preset.nativePixelRatio ? nativePixelRatio : 1;
    if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr); // stores the ratio, then resizes with the old size
    composer.setSize(width, height);
    const scale = preset.bloomScale;
    bloom.setSize(Math.max(1, Math.round(width * pr * scale)), Math.max(1, Math.round(height * pr * scale)));
  }

  function setSize(w, h) {
    width = w;
    height = h;
    applySize();
  }

  function setQuality(level) {
    if (!QUALITY_LEVELS.includes(level)) {
      throw new RangeError(`setQuality: unknown level "${level}" (expected ${QUALITY_LEVELS.join(' | ')})`);
    }
    quality = level;
    const preset = QUALITY_PRESETS[level];
    n8ao.enabled = preset.ao;
    renderPass.enabled = !preset.ao; // N8AO renders the scene itself (autoRenderBeauty)
    if (preset.ao) n8ao.setQualityMode(preset.aoMode);
    bloom.enabled = preset.bloom;
    grainPass.uniforms.encodeSRGB.value = !preset.ao;
    applySize();
  }

  function getQuality() {
    return quality;
  }

  function render(dt) {
    grainPass.uniforms.time.value = (grainPass.uniforms.time.value + dt) % 100;
    composer.render(dt);
  }

  return { composer, setSize, setQuality, getQuality, render };
}
