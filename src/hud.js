// High-End Cyber-Marine Submersible HUD & Tactical Radar

export class HUD {
  constructor(container, world, sub) {
    this.container = container;
    this.world = world;
    this.sub = sub;

    this.radarCanvas = null;
    this.radarCtx = null;
    this.radarRadius = 75;

    this.sonarCooldown = 0;
    this.maxSonarCooldown = 2.0;

    this.buildHTML();
    this.bindEvents();
  }

  buildHTML() {
    this.container.innerHTML = `
      <!-- TOP STATUS BAR -->
      <header class="hud-top">
        <div class="hud-brand">
          <span class="hud-logo-icon">❖</span>
          <span class="hud-title">DESCENSION</span>
          <span class="hud-subtitle">ABYSSAL ODYSSEY</span>
        </div>

        <div class="hud-zone-pill" id="hud-zone">
          <span class="zone-icon">◈</span>
          <span id="hud-zone-name">ZONE I — THE SIGHING SEA</span>
        </div>

        <div class="hud-relics-tray">
          <span class="relics-label">RELICS:</span>
          <div class="relic-slots" id="hud-relics">
            <span class="relic-slot" data-index="0">◆</span>
            <span class="relic-slot" data-index="1">◆</span>
            <span class="relic-slot" data-index="2">◆</span>
            <span class="relic-slot" data-index="3">◆</span>
            <span class="relic-slot" data-index="4">◆</span>
          </div>
        </div>

        <div class="hud-actions">
          <button id="btn-sound" class="hud-btn" title="Toggle Audio (M)">🔊 SFX</button>
          <button id="btn-cam" class="hud-btn" title="Change Camera View (V)">🎥 CAM</button>
          <button id="btn-mode" class="hud-btn" title="Toggle Free Flight / Cruise (C)">⚡ FREE</button>
          <button id="btn-help" class="hud-btn" title="Show Controls (H)">❓ HELP</button>
        </div>
      </header>

      <!-- ARTIFICIAL HORIZON & CENTER RETICLE -->
      <div class="hud-center">
        <div class="hud-horizon" id="hud-horizon">
          <div class="horizon-line"></div>
          <div class="pitch-ladder">
            <div class="pitch-rung p-up">+10°</div>
            <div class="pitch-center"></div>
            <div class="pitch-rung p-down">-10°</div>
          </div>
        </div>

        <div class="hud-reticle">
          <div class="reticle-outer"></div>
          <div class="reticle-cross"></div>
          <div class="reticle-pip"></div>
          <div class="reticle-telemetry" id="reticle-target-dist">SCANNING DEPTHS</div>
        </div>
      </div>

      <!-- LEFT INSTRUMENTS PANEL -->
      <aside class="hud-left-panel">
        <!-- HULL INTEGRITY -->
        <div class="instrument-box">
          <div class="inst-label">HULL INTEGRITY</div>
          <div class="inst-bar-bg">
            <div class="inst-bar-fill hull-fill" id="hud-hull-bar" style="width: 100%;"></div>
          </div>
          <div class="inst-value"><span id="hud-hull-val">100</span>%</div>
        </div>

        <!-- SHIELD / OVERDRIVE CAPACITOR -->
        <div class="instrument-box">
          <div class="inst-label">SHIELD CAPACITOR</div>
          <div class="inst-bar-bg">
            <div class="inst-bar-fill shield-fill" id="hud-shield-bar" style="width: 100%;"></div>
          </div>
          <div class="inst-value"><span id="hud-shield-val">100</span>%</div>
        </div>

        <!-- TELEMETRY METERS -->
        <div class="telemetry-grid">
          <div class="tele-item">
            <span class="tele-label">DEPTH</span>
            <span class="tele-val" id="hud-depth-val">0</span>
            <span class="tele-unit">M</span>
          </div>
          <div class="tele-item">
            <span class="tele-label">VELOCITY</span>
            <span class="tele-val" id="hud-speed-val">0</span>
            <span class="tele-unit">KTS</span>
          </div>
          <div class="tele-item">
            <span class="tele-label">PRESSURE</span>
            <span class="tele-val" id="hud-press-val">1.0</span>
            <span class="tele-unit">ATM</span>
          </div>
          <div class="tele-item">
            <span class="tele-label">BOOST</span>
            <span class="tele-val" id="hud-boost-val">READY</span>
            <span class="tele-unit">DRIVE</span>
          </div>
        </div>
      </aside>

      <!-- RIGHT TACTICAL RADAR PANEL -->
      <aside class="hud-right-panel">
        <div class="radar-box">
          <div class="radar-header">
            <span>SONAR RADAR</span>
            <span class="radar-range">RANGE: 250M</span>
          </div>
          <div class="radar-canvas-wrap">
            <canvas id="hud-radar" width="160" height="160"></canvas>
            <div class="radar-sweep"></div>
          </div>
        </div>

        <div class="tactical-actions">
          <button id="btn-sonar-ping" class="tactical-btn" title="Ping Active Sonar (Space / Right-Click)">
            <span>◈ ACTIVE SONAR</span>
            <small id="sonar-timer">[SPACE]</small>
          </button>
          <button id="btn-pulse-cannon" class="tactical-btn" title="Fire Cavitation Cannon (Left Click / F)">
            <span>✦ CAVITATION PULSE</span>
            <small>[L-CLICK]</small>
          </button>
        </div>

        <div class="mission-brief">
          <div class="brief-title">OBJECTIVES</div>
          <div class="brief-task" id="hud-mission-task">Descend into Zone I & collect Relic I</div>
          <div class="brief-stats">
            <span>SHARDS DESTROYED: <strong id="hud-shards-val">0</strong></span>
            <span>ENERGY COLLECTED: <strong id="hud-energy-val">0</strong></span>
          </div>
        </div>
      </aside>

      <!-- BOTTOM PROGRESS TRACKER -->
      <footer class="hud-bottom">
        <div class="depth-ruler">
          <span class="zone-tick" style="left: 0%;">SEA (0m)</span>
          <span class="zone-tick" style="left: 20%;">SHARDS (400m)</span>
          <span class="zone-tick" style="left: 45%;">VERDANT (1200m)</span>
          <span class="zone-tick" style="left: 70%;">RIBBON (2400m)</span>
          <span class="zone-tick" style="left: 95%;">CORE (3600m+)</span>
          <div class="depth-marker" id="hud-depth-marker" style="left: 0%;">
            <div class="sub-icon-marker">▲</div>
          </div>
        </div>
        <div class="quick-hints">
          MOUSE TO STEER &nbsp;·&nbsp; W/S THROTTLE &nbsp;·&nbsp; A/D STRAFE &nbsp;·&nbsp; SHIFT BOOST &nbsp;·&nbsp; L-CLICK FIRE &nbsp;·&nbsp; SPACE SONAR &nbsp;·&nbsp; H HELP
        </div>
      </footer>

      <!-- HELP MODAL -->
      <div class="modal-backdrop" id="modal-help" style="display: none;">
        <div class="modal-card">
          <div class="modal-header">
            <h2>NAUTILUS-X FLIGHT MANUAL</h2>
            <button id="btn-close-help" class="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="control-grid">
              <div class="control-row"><kbd>Mouse</kbd> <span>Pitch & Yaw flight direction</span></div>
              <div class="control-row"><kbd>W / S</kbd> <span>Main forward throttle / Reverse</span></div>
              <div class="control-row"><kbd>A / D</kbd> <span>Port & Starboard hydrodynamic strafe / roll</span></div>
              <div class="control-row"><kbd>Space / Up</kbd> <span>Ascend vertically</span></div>
              <div class="control-row"><kbd>C / Down</kbd> <span>Descend into the trench</span></div>
              <div class="control-row"><kbd>Left Shift</kbd> <span>Afterburner / Cavitation Turbo Boost</span></div>
              <div class="control-row"><kbd>Left Click / F</kbd> <span>Fire Cavitation Pulse Cannon (Shatter Shards)</span></div>
              <div class="control-row"><kbd>Right Click / Q</kbd> <span>Active 3D Sonar Ping (Echo location)</span></div>
              <div class="control-row"><kbd>C</kbd> <span>Toggle Free Flight vs Cinematic Auto-Cruise</span></div>
              <div class="control-row"><kbd>V</kbd> <span>Cycle Camera (Chase / Cockpit / Far)</span></div>
              <div class="control-row"><kbd>M</kbd> <span>Mute / Unmute Procedural Audio</span></div>
              <div class="control-row"><kbd>H / Esc</kbd> <span>Toggle this Flight Manual</span></div>
            </div>
            <div class="lore-box">
              <h3>MISSION: FIVE DEPTHS OF THE ABYSS</h3>
              <p>Pilot the Nautilus-X through 5 distinct oceanic depth zones. Recover all 5 Primordial Relics hidden across the depths. Fly through aurora ribbons for slipstream acceleration. Bring all relics to the Singularity Core to achieve stabilization!</p>
            </div>
          </div>
          <div class="modal-footer">
            <button id="btn-start-game" class="btn-primary">CONTINUE MISSION</button>
          </div>
        </div>
      </div>

      <!-- VICTORY MODAL -->
      <div class="modal-backdrop" id="modal-victory" style="display: none;">
        <div class="modal-card victory-card">
          <div class="modal-header">
            <h2>SINGULARITY STABILIZED</h2>
          </div>
          <div class="modal-body">
            <div class="victory-icon">✦ ❖ ✦</div>
            <p class="victory-message">All 5 Primordial Relics have resonated with the Abyssal Core. The mantle equilibrium has been restored.</p>
            <div class="stats-summary" id="victory-stats"></div>
          </div>
          <div class="modal-footer">
            <button id="btn-replay" class="btn-primary">RE-DIVE THE ABYSS</button>
          </div>
        </div>
      </div>

      <!-- CRITICAL REPAIR / RESPAWN MODAL -->
      <div class="modal-backdrop" id="modal-danger" style="display: none;">
        <div class="modal-card danger-card">
          <div class="modal-header">
            <h2>CRITICAL HULL BREACH</h2>
          </div>
          <div class="modal-body">
            <p>Pressure envelope compromised! Emergency nanite repair protocol ready to deploy.</p>
          </div>
          <div class="modal-footer">
            <button id="btn-emergency-repair" class="btn-primary danger-btn">EXECUTE EMERGENCY REPAIR</button>
          </div>
        </div>
      </div>
    `;

    this.radarCanvas = document.getElementById('hud-radar');
    if (this.radarCanvas) {
      this.radarCtx = this.radarCanvas.getContext('2d');
    }
  }

  bindEvents() {
    const btnHelp = document.getElementById('btn-help');
    const modalHelp = document.getElementById('modal-help');
    const btnCloseHelp = document.getElementById('btn-close-help');
    const btnStart = document.getElementById('btn-start-game');

    const toggleHelp = () => {
      const show = modalHelp.style.display === 'none';
      modalHelp.style.display = show ? 'flex' : 'none';
    };

    if (btnHelp) btnHelp.onclick = toggleHelp;
    if (btnCloseHelp) btnCloseHelp.onclick = toggleHelp;
    if (btnStart) btnStart.onclick = toggleHelp;

    const btnRepair = document.getElementById('btn-emergency-repair');
    if (btnRepair) {
      btnRepair.onclick = () => {
        this.sub.hull = 100.0;
        this.sub.shield = 100.0;
        document.getElementById('modal-danger').style.display = 'none';
      };
    }

    const btnReplay = document.getElementById('btn-replay');
    if (btnReplay) {
      btnReplay.onclick = () => {
        window.location.reload();
      };
    }
  }

  update(delta, cameraMode, isMuted) {
    if (this.sonarCooldown > 0) {
      this.sonarCooldown -= delta;
      const sTimer = document.getElementById('sonar-timer');
      if (sTimer) {
        sTimer.textContent = this.sonarCooldown > 0 ? `${this.sonarCooldown.toFixed(1)}S` : '[SPACE]';
      }
    }

    // Update Telemetry
    const hullBar = document.getElementById('hud-hull-bar');
    const hullVal = document.getElementById('hud-hull-val');
    if (hullBar && hullVal) {
      const hullPct = Math.max(0, Math.round(this.sub.hull));
      hullBar.style.width = `${hullPct}%`;
      hullVal.textContent = hullPct;
      if (hullPct < 25) {
        hullBar.classList.add('critical');
      } else {
        hullBar.classList.remove('critical');
      }
    }

    // Danger Modal trigger
    const dangerModal = document.getElementById('modal-danger');
    if (dangerModal && this.sub.hull <= 0 && dangerModal.style.display === 'none') {
      dangerModal.style.display = 'flex';
    }

    const shieldBar = document.getElementById('hud-shield-bar');
    const shieldVal = document.getElementById('hud-shield-val');
    if (shieldBar && shieldVal) {
      const shieldPct = Math.max(0, Math.round(this.sub.shield));
      shieldBar.style.width = `${shieldPct}%`;
      shieldVal.textContent = shieldPct;
    }

    const depthVal = document.getElementById('hud-depth-val');
    if (depthVal) depthVal.textContent = this.sub.getDepthMeters();

    const speedVal = document.getElementById('hud-speed-val');
    if (speedVal) speedVal.textContent = this.sub.getSpeedKnots();

    const pressVal = document.getElementById('hud-press-val');
    if (pressVal) pressVal.textContent = this.sub.getAtmospheres();

    const boostVal = document.getElementById('hud-boost-val');
    if (boostVal) {
      boostVal.textContent = this.sub.isBoosting ? 'OVERDRIVE' : (this.sub.shield > 10 ? 'READY' : 'DRAINED');
      boostVal.style.color = this.sub.isBoosting ? '#38bdf8' : (this.sub.shield > 10 ? '#34d399' : '#f87171');
    }

    // Zone Title
    const curZone = this.world.getCurrentZone();
    const zoneName = document.getElementById('hud-zone-name');
    if (zoneName && curZone) {
      zoneName.textContent = curZone.name;
    }

    // Mission Task update
    const missionTask = document.getElementById('hud-mission-task');
    if (missionTask) {
      const missingIndex = this.world.collectedRelics.indexOf(false);
      if (missingIndex !== -1) {
        const zoneNames = ["Sighing Sea", "Shardfields", "Verdant Deep", "Ribbon Sky", "Singularity Core"];
        missionTask.textContent = `Recover Relic ${missingIndex + 1} in the ${zoneNames[missingIndex]}`;
      } else {
        missionTask.textContent = "All Relics Secured! Stabilize the Singularity Core at 3600m depth!";
      }
    }

    // Relic slots UI
    const relicSlots = document.querySelectorAll('.relic-slot');
    relicSlots.forEach((slot, idx) => {
      if (this.world.collectedRelics[idx]) {
        slot.classList.add('collected');
      } else {
        slot.classList.remove('collected');
      }
    });

    // Stats
    const shardsVal = document.getElementById('hud-shards-val');
    if (shardsVal) shardsVal.textContent = this.world.shardsDestroyed;

    const energyVal = document.getElementById('hud-energy-val');
    if (energyVal) energyVal.textContent = this.world.energyCollected;

    // Depth Progression Marker
    const marker = document.getElementById('hud-depth-marker');
    if (marker) {
      const maxDepth = 4200;
      const progress = Math.min(1.0, Math.max(0.0, this.sub.getDepthMeters() / maxDepth));
      marker.style.left = `${(progress * 100).toFixed(1)}%`;
    }

    // Horizon line tilt based on sub roll and pitch
    const horizon = document.getElementById('hud-horizon');
    if (horizon) {
      const rollDeg = (this.sub.rotation.z * 180 / Math.PI);
      const pitchOffset = this.sub.rotation.x * 40;
      horizon.style.transform = `translate(-50%, -50%) rotate(${-rollDeg}deg) translateY(${pitchOffset}px)`;
    }

    // Sound button icon
    const btnSound = document.getElementById('btn-sound');
    if (btnSound) {
      btnSound.textContent = isMuted ? '🔇 MUTED' : '🔊 SFX';
    }

    // Mode button
    const btnMode = document.getElementById('btn-mode');
    if (btnMode) {
      btnMode.textContent = this.sub.autoCruise ? '⚡ CRUISE' : '⚡ FREE';
      btnMode.style.borderColor = this.sub.autoCruise ? '#38bdf8' : 'rgba(255,255,255,0.2)';
    }

    // Camera button
    const btnCam = document.getElementById('btn-cam');
    if (btnCam) {
      btnCam.textContent = cameraMode === 'cockpit' ? '🎥 COCKPIT' : '🎥 CHASE';
    }

    // Check Victory
    if (this.world.allRelicsCollected() && this.sub.getDepthMeters() >= 3500) {
      const victoryModal = document.getElementById('modal-victory');
      if (victoryModal && victoryModal.style.display === 'none') {
        victoryModal.style.display = 'flex';
        const vStats = document.getElementById('victory-stats');
        if (vStats) {
          vStats.innerHTML = `
            <div>DEPTH REACHED: <strong>${this.sub.getDepthMeters()} METERS</strong></div>
            <div>RELICS SECURED: <strong>5 / 5</strong></div>
            <div>SHARDS SHATTERED: <strong>${this.world.shardsDestroyed}</strong></div>
            <div>ENERGY CELLS HARVESTED: <strong>${this.world.energyCollected}</strong></div>
          `;
        }
      }
    }

    // Draw Tactical Sonar Radar
    this.drawRadar();
  }

  drawRadar() {
    if (!this.radarCtx) return;
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = this.radarRadius / 220; // 220m radius

    ctx.clearRect(0, 0, w, h);

    // Sonar grid rings
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.arc(cx, cy, this.radarRadius * 0.33, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, this.radarRadius * 0.66, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, this.radarRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, cy - this.radarRadius);
    ctx.lineTo(cx, cy + this.radarRadius);
    ctx.moveTo(cx - this.radarRadius, cy);
    ctx.lineTo(cx + this.radarRadius, cy);
    ctx.stroke();

    const subX = this.sub.position.x;
    const subZ = this.sub.position.z;
    const subYaw = this.sub.rotation.y;

    // Helper to rotate world relative coords into radar coordinates
    const toRadar = (worldX, worldZ) => {
      const dx = worldX - subX;
      const dz = worldZ - subZ;
      // Rotate by sub's heading so radar is always heading-up
      const cos = Math.cos(subYaw);
      const sin = Math.sin(subYaw);
      const rx = (dx * cos - dz * sin) * scale;
      const ry = (dx * sin + dz * cos) * scale;
      return { x: cx + rx, y: cy + ry };
    };

    // Draw Destructible Shards (purple dots)
    ctx.fillStyle = '#c084fc';
    for (const shard of this.world.destructibleShards) {
      if (!shard.userData.alive) continue;
      const pt = toRadar(shard.position.x, shard.position.z);
      const d = Math.hypot(pt.x - cx, pt.y - cy);
      if (d <= this.radarRadius) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Energy Orbs (teal dots)
    ctx.fillStyle = '#22d3ee';
    for (const orb of this.world.energyOrbs) {
      if (!orb.userData.alive) continue;
      const pt = toRadar(orb.position.x, orb.position.z);
      const d = Math.hypot(pt.x - cx, pt.y - cy);
      if (d <= this.radarRadius) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Relics (cyan diamonds with pulsing glow)
    for (const relic of this.world.relics) {
      if (relic.userData.collected) continue;
      const pt = toRadar(relic.position.x, relic.position.z);
      const d = Math.hypot(pt.x - cx, pt.y - cy);
      if (d <= this.radarRadius) {
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - 4);
        ctx.lineTo(pt.x + 4, pt.y);
        ctx.lineTo(pt.x, pt.y + 4);
        ctx.lineTo(pt.x - 4, pt.y);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Center player icon (Forward arrow)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx - 3.5, cy + 4);
    ctx.lineTo(cx, cy + 2);
    ctx.lineTo(cx + 3.5, cy + 4);
    ctx.closePath();
    ctx.fill();
  }
}
