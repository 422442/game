// Web Audio API procedural sound engine for Descension
// Zero external audio assets required; 100% procedural sound synthesis.

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambientGain = null;
    this.engineGain = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineNoise = null;
    this.engineFilter = null;
    this.enabled = true;
    this.initialized = false;

    // Ambient drone oscillators
    this.droneOscs = [];
    this.currentZone = 0;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Master Compressor & Limiter
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
      compressor.knee.setValueAtTime(10, this.ctx.currentTime);
      compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
      compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
      compressor.release.setValueAtTime(0.1, this.ctx.currentTime);
      compressor.connect(this.ctx.destination);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(compressor);

      // Submarine Thruster Engine Synth
      this.setupEngineSynth();

      // Abyssal Ambient Drone Synth
      this.setupAmbientSynth();

      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio initialization error:', e);
    }
  }

  unlock() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setupEngineSynth() {
    // Twin low rumble oscillators for sub cavitation and turbine
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.05, this.ctx.currentTime);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(120, this.ctx.currentTime);
    this.engineFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'triangle';
    this.engineOsc1.frequency.setValueAtTime(45, this.ctx.currentTime);

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.setValueAtTime(46.5, this.ctx.currentTime);

    // Procedural Brown Noise generator for water turbulence
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    this.engineNoise = this.ctx.createBufferSource();
    this.engineNoise.buffer = noiseBuffer;
    this.engineNoise.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(90, this.ctx.currentTime);
    noiseFilter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, this.ctx.currentTime);

    this.engineNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.engineGain);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);

    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
    this.engineNoise.start();
  }

  setupAmbientSynth() {
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    this.ambientGain.connect(this.masterGain);

    // Ambient chords per zone:
    // Zone 0: Mystical Ocean (D minor / F maj)
    // Zone 1: Shardfields (C minor add9)
    // Zone 2: Verdant Deep (E phrygian)
    // Zone 3: Ribbon Sky (A mystic lydian)
    // Zone 4: Core (D low fundamental + ominous fifth)
    const baseFreqs = [55, 110, 164.81, 220, 329.63];

    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(baseFreqs[i] || 110, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280 + i * 80, this.ctx.currentTime);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.06 / (i + 1), this.ctx.currentTime);

      // Low frequency LFO for gentle oceanic breathing modulation
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.08 + i * 0.04, this.ctx.currentTime);
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      lfo.start();

      osc.connect(filter);
      filter.connect(g);
      g.connect(this.ambientGain);
      osc.start();

      this.droneOscs.push({ osc, filter, gain: g, baseFreq: baseFreqs[i] });
    }
  }

  updateEngine(throttle, isBoosting) {
    if (!this.initialized || !this.enabled) return;
    const now = this.ctx.currentTime;
    const absThrottle = Math.min(1.0, Math.max(0.05, Math.abs(throttle)));
    const boostMult = isBoosting ? 1.9 : 1.0;

    // Pitch rises with speed
    const baseFreq = 42 + absThrottle * 28 * boostMult;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.03, now, 0.08);

    // Filter opens up as water flow increases
    const cutoff = 110 + absThrottle * 220 * (isBoosting ? 2.4 : 1.0);
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.1);

    // Volume scales with power
    const targetGain = 0.04 + absThrottle * 0.18 + (isBoosting ? 0.22 : 0.0);
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);
  }

  setZone(zoneIndex) {
    if (!this.initialized || zoneIndex === this.currentZone) return;
    this.currentZone = zoneIndex;
    const now = this.ctx.currentTime;

    const zonePitches = [
      [55, 110, 164.81, 220],     // Sighing Sea
      [48.99, 97.99, 146.83, 196],// Shardfields
      [41.2, 82.4, 123.47, 164.81],// Verdant Deep
      [58.27, 116.54, 174.61, 233.08],// Ribbon Sky
      [36.71, 73.42, 110, 146.83], // The Core
    ];

    const freqs = zonePitches[Math.min(zoneIndex, zonePitches.length - 1)];
    this.droneOscs.forEach((d, idx) => {
      if (freqs[idx]) {
        d.osc.frequency.setTargetAtTime(freqs[idx], now, 2.5);
      }
    });
  }

  playSonarPing() {
    if (!this.initialized || !this.enabled) return;
    const now = this.ctx.currentTime;

    // High clarity acoustic pulse with multi-tap underwater echo
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    // Delay echo
    const delay = this.ctx.createDelay();
    delay.delayTime.setValueAtTime(0.32, now);
    const delayFeedback = this.ctx.createGain();
    delayFeedback.gain.setValueAtTime(0.45, now);

    const delayFilter = this.ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.setValueAtTime(1200, now);

    osc.connect(gain);
    gain.connect(this.masterGain);

    gain.connect(delay);
    delay.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delay);
    delayFilter.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 2.0);
  }

  playPulseCannon() {
    if (!this.initialized || !this.enabled) return;
    const now = this.ctx.currentTime;

    // Sub-surface hydrodynamic cavitation burst
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.22);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    // Sharp cavitation snap
    const snapOsc = this.ctx.createOscillator();
    snapOsc.type = 'sawtooth';
    snapOsc.frequency.setValueAtTime(1200, now);
    snapOsc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

    const snapGain = this.ctx.createGain();
    snapGain.gain.setValueAtTime(0.35, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    snapOsc.connect(snapGain);
    snapGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.36);
    snapOsc.start(now);
    snapOsc.stop(now + 0.1);
  }

  playShardShatter() {
    if (!this.initialized || !this.enabled) return;
    const now = this.ctx.currentTime;

    // Crystalline resonance fracture
    const freqs = [920, 1420, 2180, 2840];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f + (Math.random() - 0.5) * 60, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.4, now + 0.45);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.2 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + i * 0.1);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.7);
    });

    // Deep sub thump
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(95, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.35);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.42);
  }

  playCollectChime() {
    if (!this.initialized || !this.enabled) return;
    const now = this.ctx.currentTime;

    // Arpeggiated celestial harmonic chord
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.055;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.28, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.7);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(noteTime);
      osc.stop(noteTime + 0.75);
    });
  }

  playRelicAcquired() {
    if (!this.initialized || !this.enabled) return;
    const now = this.ctx.currentTime;

    // Grand majestic ancient chime chord
    const notes = [329.63, 440.0, 554.37, 659.25, 880.0]; // A major 9
    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.08;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 2.2);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(noteTime);
      osc.stop(noteTime + 2.3);
    });
  }

  playImpact(strength = 1.0) {
    if (!this.initialized || !this.enabled) return;
    const now = this.ctx.currentTime;

    // Deep metallic hull collision thud
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.28);

    const gain = this.ctx.createGain();
    const vol = Math.min(0.85, 0.3 * strength);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  playSlipstreamWhoosh() {
    if (!this.initialized || !this.enabled) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.3);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.8);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(540, now);
    filter.Q.setValueAtTime(4.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.9);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.enabled ? 0.7 : 0.0, this.ctx.currentTime);
    }
    return this.enabled;
  }
}

export const sound = new SoundEngine();
