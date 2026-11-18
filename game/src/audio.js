// All sound is synthesized with WebAudio: no audio files, nothing fetched.
// Engine hum, sirens, gunshots, UI blips and a slow original chord-pad loop
// are all oscillators and filtered noise, composed in code. Audio starts on
// the first user gesture (the start button) and M toggles mute.

const CHORDS = [
  [130.81, 196.0, 246.94, 329.63], // Cmaj7
  [110.0, 164.81, 220.0, 277.18], // Am7
  [87.31, 130.81, 174.61, 220.0], // Fmaj7
  [98.0, 146.83, 196.0, 246.94], // G6
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startMusic();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // --- one-shot effects -------------------------------------------------
  blip(freq = 660, dur = 0.08, type = 'sine', vol = 0.2) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    this.blip(120, 0.09, 'triangle', 0.25);
  }

  crash(strength = 1) {
    if (!this.ctx || this.muted) return;
    this.blip(70 + Math.random() * 40, 0.18, 'sawtooth', 0.25 * strength);
  }

  pickup() {
    this.blip(523, 0.09, 'sine', 0.2);
    setTimeout(() => this.blip(784, 0.12, 'sine', 0.2), 90);
  }

  missionComplete() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.22), i * 110));
  }

  missionFail() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'triangle', 0.2), i * 140));
  }

  // --- continuous loops --------------------------------------------------
  // Engine note follows speed; call every frame with speed 0..1 (or null to stop).
  setEngine(speedNorm) {
    if (!this.ctx) return;
    if (speedNorm === null) {
      if (this.engineOsc) {
        try { this.engineOsc.stop(); } catch { /* already stopped */ }
        this.engineOsc = null;
        this.engineGain = null;
      }
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.05;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    this.engineOsc.frequency.value = 55 + speedNorm * 130;
    this.engineGain.gain.value = 0.03 + speedNorm * 0.05;
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenOsc) {
        try { this.sirenOsc.stop(); } catch { /* already stopped */ }
        this.sirenOsc = null;
      }
      if (this.sirenTimer) clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      return;
    }
    if (this.sirenOsc) return;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.045;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    let high = true;
    this.sirenTimer = setInterval(() => {
      if (!this.sirenOsc) return;
      high = !high;
      this.sirenOsc.frequency.setValueAtTime(high ? 880 : 660, this.ctx.currentTime);
    }, 420);
  }

  // A slow original chord pad: four chords, one every four seconds.
  startMusic() {
    if (this.musicTimer) return;
    const playChord = () => {
      if (!this.ctx || this.muted) return;
      const chord = CHORDS[this.musicStep % CHORDS.length];
      this.musicStep += 1;
      const t = this.ctx.currentTime;
      for (const freq of chord) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.035, t + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + 4.3);
      }
    };
    playChord();
    this.musicTimer = setInterval(playChord, 4000);
  }
}
