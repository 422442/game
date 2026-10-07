import * as THREE from 'three';
import { Submersible } from './submersible.js';
import { WorldManager } from './world.js';
import { setupPostProcessing } from './postprocessing.js';
import { HUD } from './hud.js';
import { sound } from './audio.js';
import './style.css';

/* ----------------------------- Setup & Renderer ----------------------------- */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040e1a);
scene.fog = new THREE.FogExp2(0x071526, 0.0075);

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 2500);

/* ----------------------------- Game Systems ----------------------------- */

const sub = new Submersible(scene);
const world = new WorldManager(scene);
const postFX = setupPostProcessing(renderer, scene, camera);
const hudContainer = document.getElementById('hud-overlay');
const hud = new HUD(hudContainer, world, sub);

/* ----------------------------- Camera State ----------------------------- */

let cameraMode = 'chase'; // 'chase', 'cockpit', 'far'
let targetCamPos = new THREE.Vector3();
let targetCamLook = new THREE.Vector3();
let camPos = new THREE.Vector3(0, 0, 40);
let camLook = new THREE.Vector3(0, 0, 0);
let camShake = 0;
let baseFov = 64;

/* ----------------------------- Input Handling ----------------------------- */

const mouseScreen = { x: 0, y: 0 };
let isMouseDown = false;
let userInteracted = false;

function ensureAudio() {
  if (!userInteracted) {
    userInteracted = true;
    sound.unlock();
  }
}

// Keyboard input
window.addEventListener('keydown', (e) => {
  ensureAudio();
  const code = e.code;

  if (code === 'KeyW' || code === 'ArrowUp') sub.inputs.forward = true;
  if (code === 'KeyS' || code === 'ArrowDown') sub.inputs.backward = true;
  if (code === 'KeyA' || code === 'ArrowLeft') sub.inputs.left = true;
  if (code === 'KeyD' || code === 'ArrowRight') sub.inputs.right = true;
  if (code === 'Space') sub.inputs.up = true;
  if (code === 'KeyC') sub.inputs.down = true;
  if (code === 'ShiftLeft' || code === 'ShiftRight') sub.inputs.boost = true;

  // Actions
  if (code === 'KeyF') {
    world.firePulseProjectile(sub);
  }
  if (code === 'KeyQ') {
    if (hud.sonarCooldown <= 0) {
      world.triggerSonarPing(sub);
      hud.sonarCooldown = hud.maxSonarCooldown;
    }
  }

  // Toggles
  if (code === 'KeyV') {
    cycleCamera();
  }
  if (code === 'KeyM') {
    sound.toggle();
  }
  if (code === 'KeyH' || code === 'Escape') {
    const modal = document.getElementById('modal-help');
    if (modal) {
      modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
    }
  }
});

window.addEventListener('keyup', (e) => {
  const code = e.code;
  if (code === 'KeyW' || code === 'ArrowUp') sub.inputs.forward = false;
  if (code === 'KeyS' || code === 'ArrowDown') sub.inputs.backward = false;
  if (code === 'KeyA' || code === 'ArrowLeft') sub.inputs.left = false;
  if (code === 'KeyD' || code === 'ArrowRight') sub.inputs.right = false;
  if (code === 'Space') sub.inputs.up = false;
  if (code === 'KeyC') sub.inputs.down = false;
  if (code === 'ShiftLeft' || code === 'ShiftRight') sub.inputs.boost = false;
});

// Pointer / Mouse steering
window.addEventListener('pointermove', (e) => {
  ensureAudio();
  // Normalized screen coordinates (-1 to 1)
  mouseScreen.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseScreen.y = -(e.clientY / window.innerHeight) * 2 + 1;

  // Steering deadzone in center
  const deadzone = 0.08;
  let steerX = mouseScreen.x;
  let steerY = mouseScreen.y;

  if (Math.abs(steerX) < deadzone) steerX = 0;
  else steerX = Math.sign(steerX) * (Math.abs(steerX) - deadzone) / (1 - deadzone);

  if (Math.abs(steerY) < deadzone) steerY = 0;
  else steerY = Math.sign(steerY) * (Math.abs(steerY) - deadzone) / (1 - deadzone);

  sub.inputs.mouseYaw = -steerX * 1.4;
  sub.inputs.mousePitch = steerY * 1.4;
});

window.addEventListener('pointerdown', (e) => {
  ensureAudio();
  if (e.target.closest('button') || e.target.closest('.modal-card')) return;

  if (e.button === 0) {
    // Left click: Fire pulse cannon
    isMouseDown = true;
    world.firePulseProjectile(sub);
  } else if (e.button === 2) {
    // Right click: Sonar Ping
    if (hud.sonarCooldown <= 0) {
      world.triggerSonarPing(sub);
      hud.sonarCooldown = hud.maxSonarCooldown;
    }
  }
});

window.addEventListener('pointerup', () => {
  isMouseDown = false;
});

// Prevent context menu on right click for sonar ping
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// HUD Button Bindings
function bindHUDButtons() {
  const btnSound = document.getElementById('btn-sound');
  if (btnSound) {
    btnSound.onclick = (e) => {
      e.stopPropagation();
      ensureAudio();
      sound.toggle();
    };
  }

  const btnCam = document.getElementById('btn-cam');
  if (btnCam) {
    btnCam.onclick = (e) => {
      e.stopPropagation();
      cycleCamera();
    };
  }

  const btnMode = document.getElementById('btn-mode');
  if (btnMode) {
    btnMode.onclick = (e) => {
      e.stopPropagation();
      sub.autoCruise = !sub.autoCruise;
    };
  }

  const btnSonar = document.getElementById('btn-sonar-ping');
  if (btnSonar) {
    btnSonar.onclick = (e) => {
      e.stopPropagation();
      ensureAudio();
      if (hud.sonarCooldown <= 0) {
        world.triggerSonarPing(sub);
        hud.sonarCooldown = hud.maxSonarCooldown;
      }
    };
  }

  const btnCannon = document.getElementById('btn-pulse-cannon');
  if (btnCannon) {
    btnCannon.onclick = (e) => {
      e.stopPropagation();
      ensureAudio();
      world.firePulseProjectile(sub);
    };
  }
}

bindHUDButtons();

function cycleCamera() {
  if (cameraMode === 'chase') cameraMode = 'cockpit';
  else if (cameraMode === 'cockpit') cameraMode = 'far';
  else cameraMode = 'chase';
}

// Window resize
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  postFX.resize(width, height);
});

/* ----------------------------- Main Loop ----------------------------- */

const clock = new THREE.Clock();

let fireCooldown = 0;

function animate() {
  requestAnimationFrame(animate);

  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.08); // avoid physics explosion
  const time = clock.getElapsedTime();

  // Continuous Flight Stick Steering from mouse deflection
  const deadzone = 0.06;
  let steerX = mouseScreen.x;
  let steerY = mouseScreen.y;

  if (Math.abs(steerX) < deadzone) steerX = 0;
  else steerX = Math.sign(steerX) * ((Math.abs(steerX) - deadzone) / (1 - deadzone));

  if (Math.abs(steerY) < deadzone) steerY = 0;
  else steerY = Math.sign(steerY) * ((Math.abs(steerY) - deadzone) / (1 - deadzone));

  sub.inputs.mouseYaw = -steerX * 1.6;
  sub.inputs.mousePitch = steerY * 1.5;

  // Deflect reticle pip with flight stick position
  const pip = document.querySelector('.reticle-pip');
  if (pip) {
    pip.style.transform = `translate(${mouseScreen.x * 24}px, ${-mouseScreen.y * 24}px)`;
  }

  // Rapid fire if mouse is held down
  if (isMouseDown) {
    fireCooldown -= delta;
    if (fireCooldown <= 0) {
      world.firePulseProjectile(sub);
      fireCooldown = 0.22;
    }
  } else {
    fireCooldown = 0;
  }

  // Real-time target scanning ahead of submersible
  let closestTarget = null;
  let closestDist = Infinity;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(sub.quaternion);

  // Check uncollected relics first
  for (const relic of world.relics) {
    if (relic.userData.collected) continue;
    const toTarget = relic.position.clone().sub(sub.position);
    const dist = toTarget.length();
    if (dist < 320 && toTarget.normalize().dot(fwd) > 0.35) {
      if (dist < closestDist) {
        closestDist = dist;
        closestTarget = { name: relic.userData.name.toUpperCase(), dist: Math.round(dist) };
      }
    }
  }

  // If no relic in cone, check destructible amethyst shards
  if (!closestTarget) {
    for (const shard of world.destructibleShards) {
      if (!shard.userData.alive) continue;
      const toTarget = shard.position.clone().sub(sub.position);
      const dist = toTarget.length();
      if (dist < 200 && toTarget.normalize().dot(fwd) > 0.45) {
        if (dist < closestDist) {
          closestDist = dist;
          closestTarget = { name: "AMETHYST SHARD", dist: Math.round(dist) };
        }
      }
    }
  }

  const targetElem = document.getElementById('reticle-target-dist');
  if (targetElem) {
    if (closestTarget) {
      targetElem.textContent = `TARGET: ${closestTarget.name} [${closestTarget.dist}M]`;
      targetElem.style.color = '#38bdf8';
    } else {
      targetElem.textContent = 'SCANNING DEPTHS';
      targetElem.style.color = 'rgba(56, 189, 248, 0.6)';
    }
  }

  // 1. Update Submersible Flight & Physics
  sub.update(delta, time);

  // 2. Update Deep World (Flora, fauna, shards, particles, collisions)
  world.update(delta, time, sub);

  // 3. Dynamic Camera Controller
  updateCamera(delta, time);

  // 4. Update HUD
  hud.update(delta, cameraMode, !sound.enabled);

  // 5. Post-Processing Effects Update
  const speedNorm = sub.velocity.length() / sub.maxSpeed;
  const damageFlash = sub.collisionCooldown > 0 ? (sub.collisionCooldown / 0.5) : 0;
  const depthNorm = Math.min(1.0, sub.getDepthMeters() / 4200);

  postFX.update(time, speedNorm, damageFlash, depthNorm);

  // 6. Render PostFX pipeline
  postFX.composer.render();
}

function updateCamera(delta, time) {
  const subPos = sub.position;
  const subQuat = sub.quaternion;

  // Camera shake calculation (boost, collision damage)
  if (sub.isBoosting) {
    camShake = Math.max(camShake, 0.25);
  }
  if (sub.collisionCooldown > 0) {
    camShake = Math.max(camShake, 0.6);
  }
  camShake *= Math.pow(0.88, delta * 60);

  const shakeOffset = new THREE.Vector3(
    (Math.random() - 0.5) * camShake * 1.2,
    (Math.random() - 0.5) * camShake * 1.2,
    (Math.random() - 0.5) * camShake * 1.2
  );

  if (cameraMode === 'cockpit') {
    // Inside the canopy
    sub.group.visible = true;
    const cockpitOffset = new THREE.Vector3(0, 0.55, -0.9).applyQuaternion(subQuat);
    targetCamPos.copy(subPos).add(cockpitOffset).add(shakeOffset);

    const lookAhead = new THREE.Vector3(0, 0.3, -40).applyQuaternion(subQuat);
    targetCamLook.copy(subPos).add(lookAhead);

    camPos.lerp(targetCamPos, 0.3);
    camLook.lerp(targetCamLook, 0.3);
  } else if (cameraMode === 'far') {
    // Cinematic wide chase
    sub.group.visible = true;
    const farOffset = new THREE.Vector3(0, 7.5, 26).applyQuaternion(subQuat);
    targetCamPos.copy(subPos).add(farOffset).add(shakeOffset);

    const lookAhead = new THREE.Vector3(0, 0, -35).applyQuaternion(subQuat);
    targetCamLook.copy(subPos).add(lookAhead);

    camPos.lerp(targetCamPos, delta * 5.0);
    camLook.lerp(targetCamLook, delta * 6.0);
  } else {
    // Standard Chase Camera with hydrodynamic trailing
    sub.group.visible = true;
    const chaseOffset = new THREE.Vector3(0, 3.8, 14.5).applyQuaternion(subQuat);
    targetCamPos.copy(subPos).add(chaseOffset).add(shakeOffset);

    const lookAhead = new THREE.Vector3(0, 0.8, -30).applyQuaternion(subQuat);
    targetCamLook.copy(subPos).add(lookAhead);

    // Spring damping for camera motion
    camPos.lerp(targetCamPos, delta * 7.5);
    camLook.lerp(targetCamLook, delta * 9.0);
  }

  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // Dynamic FOV based on speed
  const speed = sub.velocity.length();
  const targetFov = baseFov + (speed / sub.boostSpeed) * 16.0;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, delta * 4.0);
  camera.updateProjectionMatrix();
}

// Start game loop
animate();
