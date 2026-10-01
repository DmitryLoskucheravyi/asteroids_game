import { Save } from './storage';

type Wave = OscillatorType;

/**
 * Синтезовані звукові ефекти через WebAudio — без жодних аудіофайлів.
 * AudioContext створюється лише після першої взаємодії користувача (вимога браузерів).
 */
class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  applyVolume(): void {
    if (this.master) this.master.gain.value = Save.data.settings.volume * 0.5;
  }

  private tone(freq: number, dur: number, type: Wave = 'sine', vol = 0.3, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || Save.data.settings.volume <= 0) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFrom: number, filterTo: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf || Save.data.settings.volume <= 0) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFrom, t);
    f.frequency.exponentialRampToValueAtTime(filterTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  hover(): void {
    this.tone(880, 0.05, 'square', 0.04);
  }
  click(): void {
    this.tone(520, 0.08, 'square', 0.08, 780);
  }
  pickup(): void {
    this.tone(880, 0.09, 'triangle', 0.2);
    this.tone(1320, 0.14, 'triangle', 0.2, undefined, 0.07);
  }
  powerup(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.18, undefined, i * 0.05));
  }
  freeze(): void {
    this.tone(1800, 0.5, 'sine', 0.15, 400);
    this.noise(0.4, 0.15, 8000, 2000);
  }
  boost(): void {
    this.tone(180, 0.4, 'sawtooth', 0.12, 720);
  }
  jump(): void {
    this.tone(300, 0.18, 'square', 0.1, 1200);
    this.noise(0.15, 0.12, 4000, 800);
  }
  shieldHit(): void {
    this.tone(220, 0.3, 'square', 0.15, 110);
    this.noise(0.25, 0.25, 3000, 300);
  }
  explode(): void {
    this.noise(1.1, 0.6, 2400, 60);
    this.tone(110, 0.8, 'sawtooth', 0.2, 30);
  }
  laser(): void {
    this.tone(1400, 0.35, 'sawtooth', 0.1, 300);
    this.tone(90, 0.4, 'square', 0.08);
  }
  mine(): void {
    this.noise(0.6, 0.45, 3000, 80);
    this.tone(140, 0.4, 'sawtooth', 0.15, 40);
  }
  bossShot(): void {
    this.tone(70, 0.5, 'sawtooth', 0.2, 35);
    this.noise(0.35, 0.3, 1200, 100);
  }
  warning(): void {
    this.tone(660, 0.12, 'square', 0.08);
    this.tone(660, 0.12, 'square', 0.08, undefined, 0.18);
  }
  countdown(final = false): void {
    this.tone(final ? 1046 : 523, final ? 0.35 : 0.15, 'square', 0.12);
  }
  win(): void {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.2, undefined, i * 0.1));
  }
  lose(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'square', 0.1, undefined, i * 0.16));
  }
  star(i: number): void {
    this.tone(784 + i * 196, 0.2, 'triangle', 0.22);
  }
}

export const Sfx = new SoundFx();
