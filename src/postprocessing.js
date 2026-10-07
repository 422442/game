import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function setupPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);

  // 1. Render Pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. High-Fidelity Unreal Bloom Pass
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.72, // strength
    0.55, // radius
    0.80  // threshold - only neon emitters bloom
  );
  composer.addPass(bloomPass);

  // 3. Custom Underwater Cinematic & Lens Shader Pass
  const AbyssShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uSpeed: { value: 0 },
      uDamage: { value: 0 },
      uDepthNorm: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uSpeed;
      uniform float uDamage;
      uniform float uDepthNorm;
      uniform vec2 uResolution;
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        vec2 center = vec2(0.5, 0.5);
        vec2 toCenter = uv - center;
        float dist = length(toCenter);

        // Dynamic Chromatic Aberration (scales with boost speed)
        float caStrength = 0.0035 + uSpeed * 0.012;
        vec2 rOffset = toCenter * caStrength;
        vec2 bOffset = -toCenter * caStrength;

        float r = texture2D(tDiffuse, uv + rOffset).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv + bOffset).b;

        vec3 color = vec3(r, g, b);

        // Speed Streak Lines during Overdrive Boost
        if (uSpeed > 0.3) {
          float angle = atan(toCenter.y, toCenter.x);
          float streaks = sin(angle * 60.0 + uTime * 20.0) * sin(angle * 25.0);
          streaks = smoothstep(0.65, 1.0, streaks) * (uSpeed - 0.3) * dist;
          color += vec3(0.3, 0.7, 1.0) * streaks * 0.45;
        }

        // Deep-Sea Vignette
        float vignette = smoothstep(0.85, 0.25, dist);
        color *= vignette;

        // Underwater Depth Tinting (subtle twilight to hadal grading)
        vec3 depthTint = mix(vec3(1.0, 1.0, 1.0), vec3(0.85, 0.95, 1.05), uDepthNorm * 0.5);
        color *= depthTint;

        // Damage Flash
        if (uDamage > 0.01) {
          color = mix(color, vec3(0.9, 0.08, 0.12), uDamage * 0.65);
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  };

  const abyssPass = new ShaderPass(AbyssShader);
  composer.addPass(abyssPass);

  // 4. Output Pass (Color space & tone mapping)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return {
    composer,
    bloomPass,
    abyssPass,
    resize(width, height) {
      composer.setSize(width, height);
      bloomPass.resolution.set(width, height);
      abyssPass.uniforms.uResolution.value.set(width, height);
    },
    update(time, speedNorm, damageNorm, depthNorm) {
      abyssPass.uniforms.uTime.value = time;
      abyssPass.uniforms.uSpeed.value = speedNorm;
      abyssPass.uniforms.uDamage.value = damageNorm;
      abyssPass.uniforms.uDepthNorm.value = depthNorm;
    },
  };
}
