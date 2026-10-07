import * as THREE from 'three';
import { sound } from './audio.js';

export class WorldManager {
  constructor(scene) {
    this.scene = scene;

    // Arrays for interactive world objects
    this.projectiles = [];
    this.shards = [];
    this.destructibleShards = [];
    this.relics = [];
    this.energyOrbs = [];
    this.jellyfish = [];
    this.smokeParticles = [];
    this.sonarWaves = [];
    this.debrisParticles = [];

    // Relic collection state
    this.collectedRelics = [false, false, false, false, false];
    this.totalRelics = 5;

    // Stats
    this.shardsDestroyed = 0;
    this.energyCollected = 0;

    // Zone depths definition (world Y coordinates)
    this.zones = [
      { name: "I — The Sighing Sea", topY: 10, bottomY: -120, fogCol: 0x071526, fogDens: 0.0075, bg: 0x040e1a },
      { name: "II — The Shardfields", topY: -120, bottomY: -350, fogCol: 0x120a2e, fogDens: 0.009, bg: 0x090418 },
      { name: "III — The Verdant Deep", topY: -350, bottomY: -700, fogCol: 0x031e14, fogDens: 0.0095, bg: 0x01130b },
      { name: "IV — The Ribbon Sky", topY: -700, bottomY: -1100, fogCol: 0x041933, fogDens: 0.008, bg: 0x020d1c },
      { name: "V — The Singularity Core", topY: -1100, bottomY: -1600, fogCol: 0x2e0816, fogDens: 0.011, bg: 0x19030b },
    ];

    this.currentZoneIndex = 0;

    this.initLighting();
    this.initOceanSurface();
    this.initMarineSnow();
    this.initZone1Sea();
    this.initZone2Shardfields();
    this.initZone3VerdantDeep();
    this.initZone4RibbonSky();
    this.initZone5SingularityCore();
    this.initRelicsAndOrbs();
  }

  initLighting() {
    // Ambient abyssal light
    this.ambientLight = new THREE.AmbientLight(0x18243b, 1.2);
    this.scene.add(this.ambientLight);

    // Directional surface sun for sea surface specular glints & god rays
    this.sun = new THREE.DirectionalLight(0xd0f0ff, 2.8);
    this.sun.position.set(40, 120, 30);
    this.scene.add(this.sun);
  }

  initOceanSurface() {
    // Realistic Gerstner ocean surface at y = 0
    const geo = new THREE.PlaneGeometry(1600, 1600, 140, 140);
    geo.rotateX(-Math.PI / 2);

    this.seaUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.9, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(0xa5f3fc) },
      uWaterColor: { value: new THREE.Color(0x02253b) },
      uDeepColor: { value: new THREE.Color(0x010811) },
      uFoamColor: { value: new THREE.Color(0x7ee7f8) },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.seaUniforms,
      side: THREE.DoubleSide,
      transparent: true,
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vElevation;

        // Gerstner Wave function with analytical normals
        vec3 gerstnerWave(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
          float steepness = wave.z;
          float wavelength = wave.w;
          float k = 2.0 * 3.14159265 / wavelength;
          float c = sqrt(9.8 / k);
          vec2 d = normalize(wave.xy);
          float f = k * (dot(d, p.xz) - c * uTime * 0.7);
          float a = steepness / k;

          tangent += vec3(
            -d.x * d.x * (steepness * sin(f)),
            d.x * (steepness * cos(f)),
            -d.x * d.y * (steepness * sin(f))
          );
          binormal += vec3(
            -d.x * d.y * (steepness * sin(f)),
            d.y * (steepness * cos(f)),
            -d.y * d.y * (steepness * sin(f))
          );

          return vec3(
            d.x * (a * cos(f)),
            a * sin(f),
            d.y * (a * cos(f))
          );
        }

        void main() {
          vec3 gridPos = position;
          vec3 tangent = vec3(1.0, 0.0, 0.0);
          vec3 binormal = vec3(0.0, 0.0, 1.0);
          vec3 p = gridPos;

          // Multi-frequency Gerstner wave octaves
          p += gerstnerWave(vec4(1.0, 0.2, 0.22, 60.0), gridPos, tangent, binormal);
          p += gerstnerWave(vec4(0.6, 0.8, 0.18, 32.0), gridPos, tangent, binormal);
          p += gerstnerWave(vec4(-0.4, 0.7, 0.14, 18.0), gridPos, tangent, binormal);
          p += gerstnerWave(vec4(0.2, -0.9, 0.10, 9.0), gridPos, tangent, binormal);

          vNormal = normalize(cross(binormal, tangent));
          vElevation = p.y;
          vec4 worldPos = modelMatrix * vec4(p, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uWaterColor;
        uniform vec3 uDeepColor;
        uniform vec3 uFoamColor;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vElevation;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 n = normalize(vNormal);

          // Fresnel reflection
          float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 4.0);

          // Specular glint from sun
          vec3 halfDir = normalize(uSunDir + viewDir);
          float spec = pow(max(dot(n, halfDir), 0.0), 120.0);

          // Water depth gradient & foam crest
          float foamFactor = smoothstep(1.8, 3.2, vElevation);
          vec3 baseWater = mix(uDeepColor, uWaterColor, clamp(vElevation * 0.3 + 0.5, 0.0, 1.0));
          baseWater = mix(baseWater, uFoamColor, foamFactor * 0.75);

          vec3 finalColor = baseWater * (0.35 + fresnel * 0.65) + uSunColor * spec * 1.8;

          // Distance atmospheric fade
          float dist = length(cameraPosition - vWorldPos);
          float alpha = 1.0 - smoothstep(400.0, 800.0, dist);

          gl_FragColor = vec4(finalColor, alpha * 0.92);
        }
      `,
    });

    this.seaMesh = new THREE.Mesh(geo, mat);
    this.seaMesh.position.y = 0;
    this.scene.add(this.seaMesh);

    // Volumetric God Rays from surface
    const rayGeo = new THREE.CylinderGeometry(0.5, 8.0, 90, 8, 1, true);
    rayGeo.rotateX(Math.PI / 8);
    const rayMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float shaft = sin(vUv.x * 24.0 + uTime * 0.4) * 0.5 + 0.5;
          float fade = (1.0 - vUv.y) * vUv.y * 3.5;
          gl_FragColor = vec4(0.35, 0.85, 1.0, shaft * fade * 0.12);
        }
      `,
    });

    this.godRays = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.position.set((Math.random() - 0.5) * 240, -45, (Math.random() - 0.5) * 240);
      ray.scale.set(1 + Math.random() * 2, 1, 1 + Math.random() * 2);
      this.godRays.add(ray);
    }
    this.scene.add(this.godRays);
    this.rayMaterial = rayMat;
  }

  initMarineSnow() {
    // 3,000 particulate flakes drifting in water
    const SNOW_COUNT = 3200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(SNOW_COUNT * 3);
    const seeds = new Float32Array(SNOW_COUNT);

    for (let i = 0; i < SNOW_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 450;
      positions[i * 3 + 1] = 5 - Math.random() * 1550; // spanning all 5 depths
      positions[i * 3 + 2] = (Math.random() - 0.5) * 450;
      seeds[i] = Math.random() * 1000;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.snowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSubPos: { value: new THREE.Vector3() },
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        uniform vec3 uSubPos;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          // Loop around submersible to maintain infinite field density
          p.x = mod(p.x - uSubPos.x + 225.0, 450.0) - 225.0 + uSubPos.x;
          p.y = mod(p.y - uSubPos.y + 150.0, 300.0) - 150.0 + uSubPos.y;
          p.z = mod(p.z - uSubPos.z + 225.0, 450.0) - 225.0 + uSubPos.z;

          // Gentle buoyant oceanic drift
          p.x += sin(uTime * 0.35 + aSeed) * 2.5;
          p.y += -mod(uTime * 1.8 + aSeed, 20.0) + 10.0;
          p.z += cos(uTime * 0.28 + aSeed * 0.8) * 2.5;

          // Distance fade to sub floodlights
          float distToSub = length(p - uSubPos);
          vAlpha = smoothstep(120.0, 10.0, distToSub) * (0.35 + 0.65 * sin(uTime * 0.8 + aSeed));

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.8 + sin(aSeed * 3.0) * 1.0) * (140.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float soft = (1.0 - d * 2.0);
          gl_FragColor = vec4(0.65, 0.9, 1.0, soft * vAlpha * 0.65);
        }
      `,
    });

    this.snowPoints = new THREE.Points(geo, this.snowMaterial);
    this.scene.add(this.snowPoints);
  }

  initZone1Sea() {
    // Bioluminescent abyss jellyfish (Medusae) drifting in Zone 1 (0 to -120m)
    this.jellyfishGroup = new THREE.Group();
    const bellGeo = new THREE.SphereGeometry(1.4, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const bellMat = new THREE.MeshStandardMaterial({
      color: 0x0fe3c5,
      emissive: 0x0fe3c5,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.72,
      roughness: 0.1,
    });

    for (let i = 0; i < 18; i++) {
      const jelly = new THREE.Group();
      const bell = new THREE.Mesh(bellGeo, bellMat);
      jelly.add(bell);

      // Tentacles
      for (let t = 0; t < 6; t++) {
        const tentGeo = new THREE.CylinderGeometry(0.04, 0.01, 3.5, 4);
        tentGeo.translate(0, -1.75, 0);
        const tentMat = new THREE.MeshBasicMaterial({ color: 0x4fffe0, transparent: true, opacity: 0.6 });
        const tent = new THREE.Mesh(tentGeo, tentMat);
        const angle = (t / 6) * Math.PI * 2;
        tent.position.set(Math.cos(angle) * 0.9, -0.2, Math.sin(angle) * 0.9);
        jelly.add(tent);
      }

      jelly.position.set(
        (Math.random() - 0.5) * 180,
        -15 - Math.random() * 85,
        (Math.random() - 0.5) * 180
      );
      jelly.userData = {
        baseY: jelly.position.y,
        speed: 0.6 + Math.random() * 0.8,
        pulseOffset: Math.random() * 10,
      };

      this.jellyfish.push(jelly);
      this.jellyfishGroup.add(jelly);
    }
    this.scene.add(this.jellyfishGroup);
  }

  initZone2Shardfields() {
    // Floating obsidian monoliths and destructible crystalline shards (Y = -120 to -350)
    this.shardGroup = new THREE.Group();

    // Giant non-destructible background monoliths
    const monolithGeo = new THREE.IcosahedronGeometry(8.0, 0);
    const monolithMat = new THREE.MeshStandardMaterial({
      color: 0x181028,
      roughness: 0.35,
      metalness: 0.85,
      emissive: 0x3d1c85,
      emissiveIntensity: 0.25,
    });

    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(monolithGeo, monolithMat);
      m.position.set(
        (Math.random() - 0.5) * 220,
        -140 - Math.random() * 180,
        (Math.random() - 0.5) * 220
      );
      m.scale.set(1.5 + Math.random() * 2, 2.5 + Math.random() * 4, 1.5 + Math.random() * 2);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.userData = {
        rotSpeed: (Math.random() - 0.5) * 0.2,
        isObstacle: true,
        radius: 12.0,
      };
      this.shardGroup.add(m);
      this.shards.push(m);
    }

    // Floating Destructible Amethyst Shards (Targetable & Shatterable!)
    const crystalGeo = new THREE.OctahedronGeometry(2.4, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x221342,
      roughness: 0.15,
      metalness: 0.92,
      emissive: 0x9333ea,
      emissiveIntensity: 0.85,
    });

    for (let i = 0; i < 28; i++) {
      const crystal = new THREE.Mesh(crystalGeo, crystalMat.clone());
      crystal.position.set(
        (Math.random() - 0.5) * 160,
        -130 - Math.random() * 200,
        (Math.random() - 0.5) * 160
      );
      crystal.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      crystal.userData = {
        rotX: (Math.random() - 0.5) * 0.8,
        rotY: (Math.random() - 0.5) * 0.8,
        radius: 3.2,
        health: 25,
        alive: true,
        isDestructible: true,
      };

      // Shard PointLight for intense local illumination
      const pLight = new THREE.PointLight(0xa855f7, 45, 18);
      crystal.add(pLight);

      this.shardGroup.add(crystal);
      this.destructibleShards.push(crystal);
    }

    this.scene.add(this.shardGroup);
  }

  initZone3VerdantDeep() {
    // Towering hydrothermal black smoker chimneys & bioluminescent thermal spires (Y = -350 to -700)
    this.verdantGroup = new THREE.Group();

    const chimneyGeo = new THREE.CylinderGeometry(1.6, 5.0, 48, 12);
    chimneyGeo.translate(0, 24, 0);
    const chimneyMat = new THREE.MeshStandardMaterial({
      color: 0x051a12,
      roughness: 0.75,
      metalness: 0.2,
      emissive: 0x10b981,
      emissiveIntensity: 0.35,
    });

    const spires = 32;
    for (let i = 0; i < spires; i++) {
      const spire = new THREE.Mesh(chimneyGeo, chimneyMat);
      const x = (Math.random() - 0.5) * 260;
      const z = (Math.random() - 0.5) * 260;
      const y = -680 + Math.random() * 120;
      spire.position.set(x, y, z);
      spire.scale.set(0.8 + Math.random() * 1.5, 0.7 + Math.random() * 1.2, 0.8 + Math.random() * 1.5);
      spire.userData = { isObstacle: true, radius: 4.5, topY: y + 48 };

      // Vent mouth glowing magma light
      const ventLight = new THREE.PointLight(0x34d399, 65, 30);
      ventLight.position.set(0, 48, 0);
      spire.add(ventLight);

      this.verdantGroup.add(spire);
      this.shards.push(spire); // register for collision
    }

    // Smoker thermal bubbling particle system
    const SMOKE_COUNT = 300;
    const smokeGeo = new THREE.BufferGeometry();
    const smokePos = new Float32Array(SMOKE_COUNT * 3);
    const smokeAlphas = new Float32Array(SMOKE_COUNT);
    this.smokeVelocities = [];

    for (let i = 0; i < SMOKE_COUNT; i++) {
      smokePos[i * 3] = (Math.random() - 0.5) * 200;
      smokePos[i * 3 + 1] = -600 + Math.random() * 180;
      smokePos[i * 3 + 2] = (Math.random() - 0.5) * 200;
      smokeAlphas[i] = Math.random();
      this.smokeVelocities.push(new THREE.Vector3((Math.random() - 0.5) * 1.2, 8.0 + Math.random() * 6.0, (Math.random() - 0.5) * 1.2));
    }

    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
    smokeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(smokeAlphas, 1));

    const smokeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (18.0) * (140.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float soft = 1.0 - d * 2.0;
          gl_FragColor = vec4(0.2, 0.95, 0.6, soft * vAlpha * 0.35);
        }
      `,
    });

    this.smokeMesh = new THREE.Points(smokeGeo, smokeMat);
    this.verdantGroup.add(this.smokeMesh);
    this.smokePositions = smokePos;
    this.smokeAlphas = smokeAlphas;

    this.scene.add(this.verdantGroup);
  }

  initZone4RibbonSky() {
    // Massive twisting volumetric Aurora Ribbons (Y = -700 to -1100)
    this.ribbonGroup = new THREE.Group();

    // 4 Grand Aurora Cylinders / Tunnels that player can fly through for slipstream boost!
    this.ribbonTunnels = [];
    const ribbonMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          float flow = sin(vUv.x * 14.0 + uTime * 1.5) * sin(vUv.y * 8.0 - uTime * 1.2);
          float ribbon = smoothstep(0.2, 0.8, flow * 0.5 + 0.5) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
          vec3 col = mix(vec3(0.05, 0.85, 0.95), vec3(0.45, 0.25, 0.95), sin(vUv.y * 3.14 + uTime * 0.6) * 0.5 + 0.5);
          gl_FragColor = vec4(col * 1.8, ribbon * 0.45);
        }
      `,
    });

    this.ribbonMat = ribbonMat;

    const tunnelGeo = new THREE.CylinderGeometry(24, 24, 180, 24, 1, true);
    for (let i = 0; i < 4; i++) {
      const tunnel = new THREE.Mesh(tunnelGeo, ribbonMat);
      const angle = (i / 4) * Math.PI * 2;
      tunnel.position.set(Math.cos(angle) * 75, -880 + (i - 1.5) * 60, Math.sin(angle) * 75);
      tunnel.rotation.set(0.3, angle, 0.4);
      tunnel.userData = { isSlipstream: true, radius: 26, length: 180 };
      this.ribbonGroup.add(tunnel);
      this.ribbonTunnels.push(tunnel);
    }

    this.scene.add(this.ribbonGroup);
  }

  initZone5SingularityCore() {
    // The Abyssal Hearth / Mantle Core (Y = -1100 to -1600)
    this.coreGroup = new THREE.Group();
    this.coreGroup.position.set(0, -1380, 0);

    // Giant central plasma core sphere
    const coreGeo = new THREE.SphereGeometry(32, 48, 48);
    this.coreMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vec3 view = normalize(-vPos);
          float pulse = sin(uTime * 2.2) * 0.5 + 0.5;
          float pattern = sin(vPos.x * 0.15 + uTime) * sin(vPos.y * 0.15 - uTime * 0.8) * sin(vPos.z * 0.15 + uTime * 0.5);
          vec3 fiery = mix(vec3(1.0, 0.25, 0.15), vec3(1.0, 0.85, 0.25), pattern * 0.5 + 0.5);
          fiery = mix(vec3(0.4, 0.02, 0.15), fiery, pulse * 0.3 + 0.7);
          float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);
          gl_FragColor = vec4(fiery * 1.6 + rim * vec3(1.0, 0.4, 0.2), 1.0);
        }
      `,
    });

    this.coreSphere = new THREE.Mesh(coreGeo, this.coreMat);
    this.coreGroup.add(this.coreSphere);

    // Colossal PointLight illuminating the entire trench
    this.coreLight = new THREE.PointLight(0xff4538, 900, 320);
    this.coreGroup.add(this.coreLight);

    // Ancient Concentric Containment Rings
    this.rings = [];
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x241822,
      metalness: 0.95,
      roughness: 0.2,
      emissive: 0xff6347,
      emissiveIntensity: 0.6,
    });

    const ringRadii = [42, 54, 68];
    ringRadii.forEach((r, idx) => {
      const ringGeo = new THREE.TorusGeometry(r, 1.8, 16, 64);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.userData = { axis: new THREE.Vector3(idx === 0 ? 1 : 0, idx === 1 ? 1 : 0, idx === 2 ? 1 : 0).normalize(), speed: 0.3 + idx * 0.2 };
      this.coreGroup.add(ring);
      this.rings.push(ring);
    });

    this.scene.add(this.coreGroup);
  }

  initRelicsAndOrbs() {
    // 5 Primordial Relics - 1 in each Zone!
    const relicPositions = [
      new THREE.Vector3(30, -50, -40),    // Zone 1: Sighing Sea
      new THREE.Vector3(-45, -230, 35),   // Zone 2: Shardfields
      new THREE.Vector3(50, -510, -30),   // Zone 3: Verdant Deep
      new THREE.Vector3(-25, -890, 45),   // Zone 4: Ribbon Sky
      new THREE.Vector3(0, -1310, 0),     // Zone 5: At the Core Singularity
    ];

    const relicNames = [
      "Relic I: Pearl of the Epipelagic",
      "Relic II: Obsidian Core Matrix",
      "Relic III: Chlorophyte Chrono-Spire",
      "Relic IV: Aetherial Ribbon Prism",
      "Relic V: Singularity Heart",
    ];

    const relicGeo = new THREE.DodecahedronGeometry(2.5, 0);
    const relicMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.05,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.8,
    });

    for (let i = 0; i < 5; i++) {
      const relicGroup = new THREE.Group();
      const mesh = new THREE.Mesh(relicGeo, relicMat.clone());
      relicGroup.add(mesh);

      // Surrounding holographic orbital rings
      const haloGeo = new THREE.TorusGeometry(3.6, 0.12, 12, 32);
      const haloMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      relicGroup.add(halo);

      // Light
      const light = new THREE.PointLight(0x38bdf8, 80, 35);
      relicGroup.add(light);

      relicGroup.position.copy(relicPositions[i]);
      relicGroup.userData = {
        index: i,
        name: relicNames[i],
        collected: false,
        radius: 6.0,
      };

      this.scene.add(relicGroup);
      this.relics.push(relicGroup);
    }

    // Energy Nanite Orbs (restore hull & shield upon contact)
    const orbGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });

    for (let i = 0; i < 45; i++) {
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(
        (Math.random() - 0.5) * 200,
        -20 - Math.random() * 1350,
        (Math.random() - 0.5) * 200
      );
      orb.userData = {
        alive: true,
        radius: 3.5,
        baseY: orb.position.y,
        seed: Math.random() * 10,
      };
      this.scene.add(orb);
      this.energyOrbs.push(orb);
    }
  }

  firePulseProjectile(sub) {
    // Cavitation Pulse Projectile
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(sub.quaternion);
    const spawnPos = sub.position.clone().addScaledVector(fwd, 4.0);

    const geo = new THREE.SphereGeometry(0.55, 12, 12);
    geo.scale(1.0, 1.0, 2.8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(spawnPos);
    mesh.quaternion.copy(sub.quaternion);

    const light = new THREE.PointLight(0x67e8f9, 40, 15);
    mesh.add(light);

    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      velocity: fwd.clone().multiplyScalar(140.0).add(sub.velocity),
      life: 1.8,
      radius: 2.0,
    });

    sound.playPulseCannon();
  }

  triggerSonarPing(sub) {
    // Expanding 3D spherical sonar wave
    const waveGeo = new THREE.SphereGeometry(1.0, 32, 32);
    const waveMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      wireframe: true,
      uniforms: {
        uAlpha: { value: 0.8 },
      },
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        void main() {
          gl_FragColor = vec4(0.2, 0.9, 1.0, uAlpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(waveGeo, waveMat);
    mesh.position.copy(sub.position);
    this.scene.add(mesh);

    this.sonarWaves.push({
      mesh,
      mat: waveMat,
      radius: 1.0,
      maxRadius: 260.0,
      speed: 120.0,
      life: 2.2,
    });

    sound.playSonarPing();
  }

  spawnDebris(position, colorHex = 0xa855f7) {
    const DEBRIS_COUNT = 16;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const geo = new THREE.TetrahedronGeometry(0.35 + Math.random() * 0.4);
      const mat = new THREE.MeshBasicMaterial({ color: colorHex });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22
      );

      this.scene.add(mesh);
      this.debrisParticles.push({
        mesh,
        velocity: vel,
        life: 0.9 + Math.random() * 0.6,
      });
    }
  }

  update(delta, time, sub) {
    // Update ocean uniforms
    if (this.seaUniforms) {
      this.seaUniforms.uTime.value = time;
    }
    if (this.rayMaterial) {
      this.rayMaterial.uniforms.uTime.value = time;
    }
    if (this.snowMaterial) {
      this.snowMaterial.uniforms.uTime.value = time;
      this.snowMaterial.uniforms.uSubPos.value.copy(sub.position);
    }
    if (this.ribbonMat) {
      this.ribbonMat.uniforms.uTime.value = time;
    }
    const allCollected = this.allRelicsCollected();
    if (this.coreMat) {
      this.coreMat.uniforms.uTime.value = time;
      const pulseFreq = allCollected ? 5.0 : 2.5;
      this.coreSphere.scale.setScalar(1.0 + Math.sin(time * pulseFreq) * (allCollected ? 0.09 : 0.04));
      this.coreLight.intensity = (allCollected ? 1400 : 800) + Math.sin(time * pulseFreq) * 350;
      if (allCollected) {
        this.coreLight.color.setHex(0x38bdf8);
      }
    }

    // Rings rotation
    this.rings.forEach(r => {
      const speedMult = allCollected ? 2.5 : 1.0;
      r.rotateOnAxis(r.userData.axis, r.userData.speed * speedMult * delta);
    });

    // Jellyfish animation
    this.jellyfish.forEach(j => {
      const pulse = Math.sin(time * j.userData.speed * 2.5 + j.userData.pulseOffset);
      j.position.y = j.userData.baseY + pulse * 2.5;
      j.scale.set(1.0 + pulse * 0.15, 1.0 - pulse * 0.15, 1.0 + pulse * 0.15);
      j.rotation.y += delta * 0.15;
    });

    // Shards rotation
    this.shards.forEach(s => {
      if (s.userData.rotSpeed) {
        s.rotation.y += s.userData.rotSpeed * delta;
      }
    });

    // Destructible Shards rotation
    this.destructibleShards.forEach(c => {
      if (!c.userData.alive) return;
      c.rotation.x += c.userData.rotX * delta;
      c.rotation.y += c.userData.rotY * delta;
    });

    // Smoke particles update
    if (this.smokeMesh) {
      const pos = this.smokePositions;
      const count = this.smokeVelocities.length;
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] += this.smokeVelocities[i].y * delta;
        if (pos[i * 3 + 1] > -380) {
          pos[i * 3 + 1] = -660;
        }
      }
      this.smokeMesh.geometry.attributes.position.needsUpdate = true;
    }

    // Update Debris Particles
    for (let i = this.debrisParticles.length - 1; i >= 0; i--) {
      const p = this.debrisParticles[i];
      p.life -= delta;
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.velocity.multiplyScalar(0.96); // drag
      p.mesh.scale.multiplyScalar(0.98);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.debrisParticles.splice(i, 1);
      }
    }

    // Update Sonar Waves
    for (let i = this.sonarWaves.length - 1; i >= 0; i--) {
      const w = this.sonarWaves[i];
      w.life -= delta;
      w.radius += w.speed * delta;
      w.mesh.scale.setScalar(w.radius);
      w.mat.uniforms.uAlpha.value = Math.max(0, w.life / 2.2);
      if (w.life <= 0 || w.radius > w.maxRadius) {
        this.scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        w.mat.dispose();
        this.sonarWaves.splice(i, 1);
      }
    }

    // Update Projectiles & Check collisions
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= delta;
      p.mesh.position.addScaledVector(p.velocity, delta);

      // Hit test against destructible shards
      let hit = false;
      for (const shard of this.destructibleShards) {
        if (!shard.userData.alive) continue;
        if (p.mesh.position.distanceTo(shard.position) < (p.radius + shard.userData.radius)) {
          shard.userData.health -= 35;
          if (shard.userData.health <= 0) {
            shard.userData.alive = false;
            this.scene.remove(shard);
            this.spawnDebris(shard.position, 0xa855f7);
            sound.playShardShatter();
            this.shardsDestroyed++;
          }
          hit = true;
          break;
        }
      }

      if (hit || p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // Update Relics animation & tractor pickup
    this.relics.forEach(r => {
      if (r.userData.collected) return;
      r.rotation.y += delta * 0.8;
      r.rotation.z += delta * 0.4;
      const d = sub.position.distanceTo(r.position);
      if (d < 16.0) {
        // Tractor beam pull
        r.position.lerp(sub.position, delta * 3.5);
        if (d < 5.0) {
          r.userData.collected = true;
          this.collectedRelics[r.userData.index] = true;
          this.scene.remove(r);
          sound.playRelicAcquired();
          sub.repair(40);
        }
      }
    });

    // Update Energy Orbs
    this.energyOrbs.forEach(orb => {
      if (!orb.userData.alive) return;
      orb.position.y = orb.userData.baseY + Math.sin(time * 2.0 + orb.userData.seed) * 1.5;
      const d = sub.position.distanceTo(orb.position);
      if (d < 18.0) {
        orb.position.lerp(sub.position, delta * 4.0);
        if (d < 4.2) {
          orb.userData.alive = false;
          this.scene.remove(orb);
          sound.playCollectChime();
          sub.repair(15);
          this.energyCollected++;
        }
      }
    });

    // Check Submersible collisions with world obstacles
    this.checkSubCollisions(sub);

    // Check Slipstream Tunnels
    this.checkSlipstreams(sub, delta);

    // Update depth zone lighting and fog
    this.updateAtmosphere(sub.position.y);
  }

  checkSubCollisions(sub) {
    const subRadius = 2.4;
    for (const obs of this.shards) {
      if (!obs.userData.isObstacle) continue;
      const dist = sub.position.distanceTo(obs.position);
      if (dist < (subRadius + obs.userData.radius)) {
        sub.takeDamage(22);
        break;
      }
    }

    // Destructible shards also cause impact if not destroyed
    for (const shard of this.destructibleShards) {
      if (!shard.userData.alive) continue;
      const dist = sub.position.distanceTo(shard.position);
      if (dist < (subRadius + shard.userData.radius)) {
        sub.takeDamage(14);
        shard.userData.alive = false;
        this.scene.remove(shard);
        this.spawnDebris(shard.position, 0x9333ea);
        sound.playShardShatter();
        break;
      }
    }

    // Water surface ceiling boundary at Y = 2
    if (sub.position.y > 2.0) {
      sub.position.y = 2.0;
      sub.velocity.y = Math.min(0, sub.velocity.y);
    }

    // Trench bottom boundary at Y = -1550
    if (sub.position.y < -1550) {
      sub.position.y = -1550;
      sub.velocity.y = Math.max(0, sub.velocity.y);
    }
  }

  checkSlipstreams(sub, delta) {
    for (const tunnel of this.ribbonTunnels) {
      const dist = sub.position.distanceTo(tunnel.position);
      if (dist < tunnel.userData.radius) {
        // Accelerate along tunnel axis
        const axis = new THREE.Vector3(0, -1, 0).applyQuaternion(tunnel.quaternion);
        sub.velocity.addScaledVector(axis, 55.0 * delta);
        sub.shield = Math.min(sub.maxShield, sub.shield + delta * 25.0);
        sound.playSlipstreamWhoosh();
        break;
      }
    }
  }

  updateAtmosphere(subY) {
    // Find current zone based on Y coordinate
    let zoneIdx = 0;
    for (let i = 0; i < this.zones.length; i++) {
      if (subY <= this.zones[i].topY && subY >= this.zones[i].bottomY) {
        zoneIdx = i;
        break;
      } else if (subY < this.zones[this.zones.length - 1].bottomY) {
        zoneIdx = this.zones.length - 1;
      }
    }

    if (zoneIdx !== this.currentZoneIndex) {
      this.currentZoneIndex = zoneIdx;
      sound.setZone(zoneIdx);
    }

    const cur = this.zones[zoneIdx];
    const next = this.zones[Math.min(zoneIdx + 1, this.zones.length - 1)];
    const range = cur.topY - cur.bottomY;
    const factor = THREE.MathUtils.clamp((cur.topY - subY) / Math.max(1, range), 0.0, 1.0);

    // Fog interpolation
    if (this.scene.fog) {
      const colA = new THREE.Color(cur.fogCol);
      const colB = new THREE.Color(next.fogCol);
      this.scene.fog.color.lerpColors(colA, colB, factor);
      this.scene.fog.density = THREE.MathUtils.lerp(cur.fogDens, next.fogDens, factor);

      const bgA = new THREE.Color(cur.bg);
      const bgB = new THREE.Color(next.bg);
      this.scene.background.lerpColors(bgA, bgB, factor);
    }
  }

  getCurrentZone() {
    return this.zones[this.currentZoneIndex];
  }

  allRelicsCollected() {
    return this.collectedRelics.every(r => r === true);
  }
}
