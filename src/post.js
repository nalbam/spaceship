// Post chain: N8AO → bloom → vignette/grain shader → output (ACES on renderer).
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
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + time * 43.7) * 43758.5453);
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
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

export function setupPost(renderer, scene, camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

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

  function setSize(w, h) {
    composer.setSize(w, h);
    n8ao.setSize(w, h);
    bloom.setSize(w, h);
  }

  function render(dt) {
    grainPass.uniforms.time.value = (grainPass.uniforms.time.value + dt) % 100;
    composer.render(dt);
  }

  return { composer, setSize, render };
}
