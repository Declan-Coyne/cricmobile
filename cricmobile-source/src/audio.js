// Synthesised sound effects (no audio files, fully offline)
const CROWD = 0.035; // ambient crowd level
export class Audio {
  constructor() { this.ctx = null; this.on = true; this.crowd = false; this.crowdGain = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { } // play even with the iPhone silent switch on
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.9 : 0; this.master.connect(this.ctx.destination);
    // noise buffer
    const len = this.ctx.sampleRate * 6; // long buffer so the crowd loop isn't audible
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    this.brown = buf;
    const wb = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const wd = wb.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    this.white = wb;
    // crowd ambience loop
    const src = this.ctx.createBufferSource(); src.buffer = this.brown; src.loop = true;
    // soft low murmur (lowpass, quiet) with a slow swell instead of a constant hiss
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.3;
    this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = this.crowd ? CROWD : 0;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoG = this.ctx.createGain(); lfoG.gain.value = CROWD * 0.35;
    lfo.connect(lfoG); this.swell = lfoG;
    src.connect(lp); lp.connect(this.crowdGain); lfoG.connect(this.crowdGain.gain); this.crowdGain.connect(this.master); src.start(); lfo.start();
  }
  setCrowd(v) { this.crowd = v; if (this.crowdGain) { this.crowdGain.gain.value = v ? CROWD : 0; this.swell.gain.value = v ? CROWD * 0.35 : 0; } }
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.9 : 0; }
  _noise(dur, freq, q, gain, type = 'bandpass', buf) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = buf || this.white;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  _tone(freq, dur, gain, type = 'sine', slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  bat(q = 1) { this._noise(0.09, 1800 + q * 900, 1.2, 0.9 * (0.5 + q * 0.5)); this._tone(420 + q * 200, 0.07, 0.5, 'triangle', 0.6); }
  edge() { this._noise(0.05, 3200, 3, 0.5); }
  bounce() { this._noise(0.05, 300, 1, 0.35); }
  pad() { this._noise(0.08, 500, 1, 0.5); this._tone(140, 0.08, 0.3); }
  stumps() { this._tone(900, 0.12, 0.4, 'square', 0.5); this._noise(0.15, 2500, 2, 0.6); this._tone(1300, 0.2, 0.25, 'triangle', 0.7); }
  gloves() { this._noise(0.06, 900, 1, 0.5); }
  click() { this._tone(1200, 0.04, 0.15, 'square'); }
  roar(level = 1, dur = 2.5) {
    if (!this.ctx || !this.crowd) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.brown; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 750; f.Q.value = 0.3;
    // gentle swell and fade, no whistles
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * level, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 4); s.stop(t + dur + 0.1);
  }
  groan() {
    if (!this.ctx || !this.crowd) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.brown; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(300, t + 1.2);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 1.5);
  }
  appeal() { if (!this.crowd) return; this._noise(0.8, 500, 0.6, 0.12, 'lowpass', this.brown); }
}
