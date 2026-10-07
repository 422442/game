import * as THREE from 'three';
import { sound } from './audio.js';

export class Submersible {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();

    // Physics State
    this.position = new THREE.Vector3(0, -15, 30);
    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.quaternion = new THREE.Quaternion();

    this.pitchVelocity = 0;
    this.yawVelocity = 0;
    this.rollVelocity = 0;

    // Flight parameters
    this.maxSpeed = 52.0;
    this.boostSpeed = 108.0;
    this.accelerationPower = 48.0;
    this.dragCoeff = 0.945;
    this.turnRate = 1.6;
    this.damping = 0.92;

    // Controls input states
    this.inputs = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      boost: false,
      mousePitch: 0,
      mouseYaw: 0,
    };

    // Submersible telemetry & health
    this.hull = 100.0;
    this.maxHull = 100.0;
    this.shield = 100.0;
    this.maxShield = 100.0;
    this.isBoosting = false;
    this.autoCruise = false;
    this.collisionCooldown = 0;

    // Construction
    this.buildModel();
    this.setupWakeParticles();
    this.setupHeadlights();

    this.group.position.copy(this.position);
    this.scene.add(this.group);
  }

  buildModel() {
    // Materials
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x1f2735,
      metalness: 0.88,
      roughness: 0.28,
      envMapIntensity: 1.2,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x0a1420,
      metalness: 0.95,
      roughness: 0.2,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.25,
    });

    const canopyMat = new THREE.MeshPhysicalMaterial({
      color: 0x00e1ff,
      metalness: 0.1,
      roughness: 0.08,
      transmission: 0.85,
      thickness: 1.2,
      transparent: true,
      opacity: 0.85,
      emissive: 0x00aacc,
      emissiveIntensity: 0.35,
    });

    const glowTrimMat = new THREE.MeshBasicMaterial({
      color: 0x4dfcff,
    });

    // 1. Central fuselage (elongated streamlined body)
    const hullGeo = new THREE.CylinderGeometry(0.9, 1.4, 6.2, 24);
    hullGeo.rotateX(Math.PI / 2);
    this.hullMesh = new THREE.Mesh(hullGeo, hullMat);
    this.group.add(this.hullMesh);

    // Nose cap (aerodynamic dome)
    const noseGeo = new THREE.SphereGeometry(0.9, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    noseGeo.rotateX(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeo, hullMat);
    noseMesh.position.set(0, 0, -3.1);
    this.group.add(noseMesh);

    // Tail cone
    const tailGeo = new THREE.ConeGeometry(1.4, 2.4, 24);
    tailGeo.rotateX(-Math.PI / 2);
    const tailMesh = new THREE.Mesh(tailGeo, hullMat);
    tailMesh.position.set(0, 0, 4.3);
    this.group.add(tailMesh);

    // 2. Cockpit Canopy Dome
    const canopyGeo = new THREE.SphereGeometry(0.85, 24, 16);
    canopyGeo.scale(1.0, 0.7, 1.6);
    this.canopy = new THREE.Mesh(canopyGeo, canopyMat);
    this.canopy.position.set(0, 0.55, -1.0);
    this.group.add(this.canopy);

    // Glowing pilot console core
    const consoleGeo = new THREE.BoxGeometry(0.5, 0.25, 0.7);
    const consoleMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const consoleMesh = new THREE.Mesh(consoleGeo, consoleMat);
    consoleMesh.position.set(0, 0.45, -1.2);
    this.group.add(consoleMesh);

    // 3. Port & Starboard Twin Engine Nacelles
    const nacelleGeo = new THREE.CylinderGeometry(0.42, 0.48, 3.8, 16);
    nacelleGeo.rotateX(Math.PI / 2);

    this.leftNacelle = new THREE.Mesh(nacelleGeo, accentMat);
    this.leftNacelle.position.set(-2.0, -0.1, 1.2);
    this.group.add(this.leftNacelle);

    this.rightNacelle = new THREE.Mesh(nacelleGeo, accentMat);
    this.rightNacelle.position.set(2.0, -0.1, 1.2);
    this.group.add(this.rightNacelle);

    // Wing pylons connecting nacelles to hull
    const pylonGeo = new THREE.BoxGeometry(1.4, 0.12, 1.5);
    const leftPylon = new THREE.Mesh(pylonGeo, hullMat);
    leftPylon.position.set(-1.3, -0.05, 1.1);
    leftPylon.rotation.z = 0.15;
    this.group.add(leftPylon);

    const rightPylon = new THREE.Mesh(pylonGeo, hullMat);
    rightPylon.position.set(1.3, -0.05, 1.1);
    rightPylon.rotation.z = -0.15;
    this.group.add(rightPylon);

    // Glowing Thruster Exhaust Rings
    const ringGeo = new THREE.TorusGeometry(0.42, 0.08, 12, 24);
    const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x38e1ff });

    this.leftExhaust = new THREE.Mesh(ringGeo, thrusterMat);
    this.leftExhaust.position.set(-2.0, -0.1, 3.1);
    this.group.add(this.leftExhaust);

    this.rightExhaust = new THREE.Mesh(ringGeo, thrusterMat);
    this.rightExhaust.position.set(2.0, -0.1, 3.1);
    this.group.add(this.rightExhaust);

    // 4. Stabilizer fins (pitch & roll active fins)
    const finGeo = new THREE.BoxGeometry(0.12, 1.6, 1.2);
    this.topFin = new THREE.Mesh(finGeo, accentMat);
    this.topFin.position.set(0, 1.3, 2.4);
    this.group.add(this.topFin);

    const diveFinGeo = new THREE.BoxGeometry(1.6, 0.08, 0.8);
    this.diveFins = new THREE.Mesh(diveFinGeo, accentMat);
    this.diveFins.position.set(0, 0, -2.4);
    this.group.add(this.diveFins);

    // Trim illumination stripes
    const stripeGeo = new THREE.BoxGeometry(0.04, 0.04, 3.4);
    const leftStripe = new THREE.Mesh(stripeGeo, glowTrimMat);
    leftStripe.position.set(-0.95, 0.3, -0.4);
    this.group.add(leftStripe);

    const rightStripe = new THREE.Mesh(stripeGeo, glowTrimMat);
    rightStripe.position.set(0.95, 0.3, -0.4);
    this.group.add(rightStripe);
  }

  setupHeadlights() {
    // Twin high-power forward exploration spotlights
    this.leftSpot = new THREE.SpotLight(0xa5f3fc, 85, 180, Math.PI / 5, 0.45, 1.2);
    this.leftSpot.position.set(-0.9, 0.1, -2.8);
    this.leftSpotTarget = new THREE.Object3D();
    this.leftSpotTarget.position.set(-0.9, 0.1, -50);
    this.group.add(this.leftSpot);
    this.group.add(this.leftSpotTarget);
    this.leftSpot.target = this.leftSpotTarget;

    this.rightSpot = new THREE.SpotLight(0xa5f3fc, 85, 180, Math.PI / 5, 0.45, 1.2);
    this.rightSpot.position.set(0.9, 0.1, -2.8);
    this.rightSpotTarget = new THREE.Object3D();
    this.rightSpotTarget.position.set(0.9, 0.1, -50);
    this.group.add(this.rightSpot);
    this.group.add(this.rightSpotTarget);
    this.rightSpot.target = this.rightSpotTarget;

    // Sub cockpit ambient / glow pointlight
    this.subGlow = new THREE.PointLight(0x00f0ff, 15, 8);
    this.subGlow.position.set(0, 0.8, -0.8);
    this.group.add(this.subGlow);

    // Forward headlight volumetric light cones
    const coneGeo = new THREE.ConeGeometry(7.0, 40, 16, 1, true);
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.translate(0, 0, -20);

    const coneMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(0x38e1ff) },
        uIntensity: { value: 0.14 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          float fade = smoothstep(1.0, 0.05, vUv.y) * smoothstep(0.0, 0.2, vUv.y);
          gl_FragColor = vec4(uColor, fade * uIntensity);
        }
      `,
    });

    this.leftCone = new THREE.Mesh(coneGeo, coneMat);
    this.leftCone.position.set(-0.9, 0.1, -2.8);
    this.group.add(this.leftCone);

    this.rightCone = new THREE.Mesh(coneGeo, coneMat);
    this.rightCone.position.set(0.9, 0.1, -2.8);
    this.group.add(this.rightCone);
  }

  setupWakeParticles() {
    // Cavitation bubble wake emitted behind twin thrusters
    const WAKE_COUNT = 180;
    const wakeGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(WAKE_COUNT * 3);
    const scales = new Float32Array(WAKE_COUNT);
    const opacities = new Float32Array(WAKE_COUNT);
    this.wakeLifes = new Float32Array(WAKE_COUNT);
    this.wakeVelocities = [];

    for (let i = 0; i < WAKE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
      positions[i * 3 + 2] = 4 + Math.random() * 20;
      scales[i] = 0.5 + Math.random() * 1.5;
      opacities[i] = 0.0;
      this.wakeLifes[i] = Math.random();
      this.wakeVelocities.push(new THREE.Vector3());
    }

    wakeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    wakeGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    wakeGeo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));

    const wakeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aScale;
        attribute float aOpacity;
        varying float vAlpha;
        void main() {
          vAlpha = aOpacity;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aScale * (120.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float ring = smoothstep(0.48, 0.35, d) * (1.0 - smoothstep(0.3, 0.0, d) * 0.7);
          gl_FragColor = vec4(0.45, 0.9, 1.0, ring * vAlpha);
        }
      `,
    });

    this.wakeMesh = new THREE.Points(wakeGeo, wakeMat);
    this.scene.add(this.wakeMesh);
    this.wakePositions = positions;
    this.wakeOpacities = opacities;
  }

  update(delta, time) {
    if (this.collisionCooldown > 0) this.collisionCooldown -= delta;

    // Shield regeneration
    if (!this.inputs.boost && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + delta * 15.0);
    }

    // Boost state
    this.isBoosting = this.inputs.boost && this.shield > 5.0;
    if (this.isBoosting) {
      this.shield = Math.max(0.0, this.shield - delta * 24.0);
    }

    // Flight Dynamics & Steering
    const targetTurn = this.turnRate * delta;

    // Mouse pitch & yaw response
    this.pitchVelocity += (this.inputs.mousePitch * 1.8 - this.pitchVelocity) * 0.15;
    this.yawVelocity += (this.inputs.mouseYaw * 1.8 - this.yawVelocity) * 0.15;

    // Keyboard roll / bank
    let targetRoll = 0;
    if (this.inputs.left) {
      this.yawVelocity += targetTurn * 1.2;
      targetRoll += 0.45;
    }
    if (this.inputs.right) {
      this.yawVelocity -= targetTurn * 1.2;
      targetRoll -= 0.45;
    }

    // Auto-bank on yaw turn
    targetRoll -= this.yawVelocity * 0.65;
    this.rollVelocity += (targetRoll - this.rollVelocity) * 0.12;

    // Apply angular velocities to orientation
    this.rotation.x = THREE.MathUtils.clamp(this.rotation.x + this.pitchVelocity * delta, -1.35, 1.35);
    this.rotation.y += this.yawVelocity * delta;
    this.rotation.z += (this.rollVelocity - this.rotation.z) * 0.1;

    this.quaternion.setFromEuler(this.rotation);
    this.group.quaternion.copy(this.quaternion);

    // Fins animation
    if (this.diveFins) {
      this.diveFins.rotation.x = this.pitchVelocity * 0.4;
    }
    if (this.topFin) {
      this.topFin.rotation.y = -this.yawVelocity * 0.4;
    }

    // Forward / Backward thrust
    const forwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    this.acceleration.set(0, 0, 0);

    let thrustPower = 0;
    if (this.inputs.forward || this.autoCruise) {
      thrustPower += 1.0;
    }
    if (this.inputs.backward) {
      thrustPower -= 0.6;
    }

    if (this.autoCruise) {
      // Steady gentle descent cruise
      thrustPower = Math.max(thrustPower, 0.7);
    }

    const currentMaxSpeed = this.isBoosting ? this.boostSpeed : this.maxSpeed;
    const accelScale = this.isBoosting ? this.accelerationPower * 2.2 : this.accelerationPower;

    if (thrustPower !== 0) {
      this.acceleration.addScaledVector(forwardVec, thrustPower * accelScale);
    }

    // Strafe up/down / vertical propulsion
    if (this.inputs.up) {
      this.acceleration.addScaledVector(upVec, accelScale * 0.65);
    }
    if (this.inputs.down) {
      this.acceleration.addScaledVector(upVec, -accelScale * 0.65);
    }

    // In auto cruise mode, introduce slight steady downward descent
    if (this.autoCruise && !this.inputs.up && !this.inputs.down) {
      this.acceleration.y -= 8.0;
    }

    // Apply acceleration to velocity
    this.velocity.addScaledVector(this.acceleration, delta);

    // Hydrodynamic Drag / fluid viscosity
    this.velocity.multiplyScalar(Math.pow(this.dragCoeff, delta * 60));

    // Clamp max velocity
    const speed = this.velocity.length();
    if (speed > currentMaxSpeed) {
      this.velocity.multiplyScalar(currentMaxSpeed / speed);
    }

    // Position integration
    this.position.addScaledVector(this.velocity, delta);
    this.group.position.copy(this.position);

    // Update sound engine
    const throttleNorm = speed / this.maxSpeed;
    sound.updateEngine(throttleNorm, this.isBoosting);

    // Thruster glow animation
    const glowScale = 0.8 + Math.min(1.2, throttleNorm * 0.8) + (this.isBoosting ? 0.9 : 0.0);
    this.leftExhaust.scale.setScalar(glowScale);
    this.rightExhaust.scale.setScalar(glowScale);

    // Update wake particles
    this.updateWake(delta, speed);
  }

  updateWake(delta, speed) {
    if (!this.wakeMesh) return;
    const pos = this.wakePositions;
    const opacities = this.wakeOpacities;
    const count = this.wakeLifes.length;
    const rearLeft = new THREE.Vector3(-2.0, -0.1, 3.2).applyMatrix4(this.group.matrixWorld);
    const rearRight = new THREE.Vector3(2.0, -0.1, 3.2).applyMatrix4(this.group.matrixWorld);

    for (let i = 0; i < count; i++) {
      this.wakeLifes[i] += delta * (0.8 + speed * 0.05);

      if (this.wakeLifes[i] >= 1.0) {
        // Respawn at rear thruster
        this.wakeLifes[i] = 0;
        const origin = (i % 2 === 0) ? rearLeft : rearRight;
        pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.3;
        pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.3;
        pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.3;

        // Wake drift
        this.wakeVelocities[i].set(
          (Math.random() - 0.5) * 2.0,
          0.8 + Math.random() * 1.5,
          (Math.random() - 0.5) * 2.0
        );
      } else {
        // Expand and float upwards
        const v = this.wakeVelocities[i];
        pos[i * 3] += v.x * delta;
        pos[i * 3 + 1] += v.y * delta;
        pos[i * 3 + 2] += v.z * delta;

        // Opacity envelope
        const life = this.wakeLifes[i];
        opacities[i] = Math.sin(life * Math.PI) * (0.2 + (speed / this.maxSpeed) * 0.6);
      }
    }

    this.wakeMesh.geometry.attributes.position.needsUpdate = true;
    this.wakeMesh.geometry.attributes.aOpacity.needsUpdate = true;
  }

  takeDamage(amount) {
    if (this.collisionCooldown > 0) return;
    this.collisionCooldown = 0.5;

    // Shield absorbs first
    if (this.shield > 0) {
      const remaining = amount - this.shield;
      this.shield = Math.max(0, this.shield - amount);
      if (remaining > 0) {
        this.hull = Math.max(0, this.hull - remaining);
      }
    } else {
      this.hull = Math.max(0, this.hull - amount);
    }

    sound.playImpact(amount / 20.0);

    // Deflection impulse
    this.velocity.multiplyScalar(-0.4);
  }

  repair(amount) {
    this.hull = Math.min(this.maxHull, this.hull + amount);
    this.shield = Math.min(this.maxShield, this.shield + amount * 0.5);
  }

  getSpeedKnots() {
    return Math.round(this.velocity.length() * 1.94384);
  }

  getDepthMeters() {
    // Sea surface is around y = 0. Depth increases downward.
    return Math.max(0, Math.round(-this.position.y * 3.5));
  }

  getAtmospheres() {
    // 1 atm at surface, +1 atm per 10m depth
    const depth = this.getDepthMeters();
    return Math.round(1 + depth / 10);
  }
}
