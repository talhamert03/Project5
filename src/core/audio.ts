/**
 * Prosedürel ses motoru: tüm efektler ve müzik WebAudio ile anlık sentezlenir.
 * Hiç ses dosyası yok -> küçük paket, internetsiz çalışır.
 * Müzik Hicaz makamında (D Hicaz: D Eb F# G A Bb C) üretken, yumuşak bir ambiyans:
 * notalar geniş bir yankı odasından geçer, kuru ses çok azdır (kulağı yormaz).
 */

const HICAZ = [0, 1, 4, 5, 7, 8, 10];
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Hicaz dizisinde derece -> midi (derece 7'yi geçince oktav atlar) */
const hicaz = (degree: number, base: number): number => {
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return base + oct * 12 + HICAZ[idx];
};

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  freq: number;
  freqEnd?: number;
  dur: number;
  vol: number;
  attack?: number;
  when?: number;
  dest?: AudioNode;
  reverb?: number;
  detune?: number;
  lp?: number;
}

interface NoiseOpts {
  dur: number;
  vol: number;
  type?: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  when?: number;
  attack?: number;
  dest?: AudioNode;
  reverb?: number;
}

// Akor ilerleyişi (D kökünden yarım ses): D | Eb | D | Cm
const BAR_ROOTS = [0, 1, 0, -2];
const BAR_CHORDS = [
  [0, 4, 7],
  [1, 5, 8],
  [0, 4, 7],
  [-2, 1, 5],
];

/** müzik kanalının açık seviyesi */
const MUSIC_VOL = 0.62;

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private musicLP!: BiquadFilterNode;
  /** müzik notalarının girişi: az kuru + çok yankı -> alçak geçiren -> müzik kanalı */
  private musicIn!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private drawGain: GainNode | null = null;
  private drawFilter: BiquadFilterNode | null = null;
  private last: Record<string, number> = {};

  musicOn = true;
  sfxOn = true;

  // müzik sıralayıcı
  private seqTimer = 0;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private intensity = 0;
  private targetIntensity = 0;
  private musicPlaying = false;
  private melodyDeg = 7;
  private melodySeed = 1;
  /** atmosfere göre ton kaydırma (yarım ses) ve tempo */
  private root = 0;
  private bpm = 104;
  private nextRoot = 0;
  private nextBpm = 104;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** İlk kullanıcı dokunuşunda çağrılır (tarayıcılar sesi ancak etkileşimden sonra açar). */
  unlock(): void {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
    this.sfxBus.connect(this.master);

    this.musicLP = ctx.createBiquadFilter();
    this.musicLP.type = 'lowpass';
    this.musicLP.frequency.value = 18000;
    this.musicLP.Q.value = 0.7;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? MUSIC_VOL : 0;
    this.musicLP.connect(this.musicBus);
    this.musicBus.connect(this.master);

    // Müzik: tüm notalar (yankıları dahil) müzik kanalından geçer -> kapatınca tamamen susar
    this.musicIn = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 0.2;
    const hall = ctx.createConvolver();
    hall.buffer = this.impulse(2.8, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 1;
    this.musicIn.connect(dry);
    dry.connect(this.musicLP);
    this.musicIn.connect(hall);
    hall.connect(wet);
    wet.connect(this.musicLP);

    // Efektler için kısa sentetik reverb (üretilmiş dürtü yanıtı)
    const rev = ctx.createConvolver();
    rev.buffer = this.impulse(1.6, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(rev);
    rev.connect(this.master);

    // Beyaz gürültü tamponu
    const nlen = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    // Çizim sesi: sürekli dönen filtreli gürültü, kalem hızına göre açılır
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.drawFilter = ctx.createBiquadFilter();
    this.drawFilter.type = 'bandpass';
    this.drawFilter.frequency.value = 2600;
    this.drawFilter.Q.value = 0.9;
    this.drawGain = ctx.createGain();
    this.drawGain.gain.value = 0;
    src.connect(this.drawFilter);
    this.drawFilter.connect(this.drawGain);
    this.drawGain.connect(this.sfxBus);
    src.start();
  }

  /** Rastgele gürültüden sönümlenen stereo dürtü yanıtı (yankı odası) */
  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return ir;
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, this.ctx.currentTime, 0.1);
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  /** Çizim sırasında müziği boğuklaştır (ağır çekim hissi). */
  setSlowmo(amount: number): void {
    if (!this.ctx) return;
    const f = 18000 * Math.pow(650 / 18000, amount);
    this.musicLP.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.06);
  }

  setDrawing(active: boolean, speed: number): void {
    if (!this.ctx || !this.drawGain || !this.drawFilter) return;
    const t = this.ctx.currentTime;
    const g = active ? Math.min(0.09, 0.012 + speed / 26000) : 0;
    this.drawGain.gain.setTargetAtTime(g, t, active ? 0.03 : 0.06);
    this.drawFilter.frequency.setTargetAtTime(2000 + Math.min(speed, 4000) * 0.6, t, 0.05);
  }

  private gate(key: string, minGap: number): boolean {
    if (!this.ctx || !this.sfxOn) return false;
    const now = this.ctx.currentTime;
    if ((this.last[key] ?? -1) + minGap > now) return false;
    this.last[key] = now;
    return true;
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ctx!;
    const t = o.when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node: AudioNode = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.dest ?? this.sfxBus);
    if (o.reverb) {
      const s = ctx.createGain();
      s.gain.value = o.reverb;
      g.connect(s);
      s.connect(this.reverbSend);
    }
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  private noiseBurst(o: NoiseOpts): void {
    const ctx = this.ctx!;
    const t = o.when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.freqEnd), t + o.dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.dest ?? this.sfxBus);
    if (o.reverb) {
      const s = ctx.createGain();
      s.gain.value = o.reverb;
      g.connect(s);
      s.connect(this.reverbSend);
    }
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }

  // ───────────────────────── EFEKTLER ─────────────────────────

  ui(): void {
    if (!this.gate('ui', 0.03)) return;
    this.tone({ type: 'sine', freq: 740, freqEnd: 1180, dur: 0.07, vol: 0.12 });
    this.tone({ type: 'triangle', freq: 1480, dur: 0.05, vol: 0.03 });
  }

  back(): void {
    if (!this.gate('ui', 0.03)) return;
    this.tone({ type: 'sine', freq: 900, freqEnd: 520, dur: 0.08, vol: 0.1 });
  }

  whoosh(): void {
    if (!this.gate('whoosh', 0.05)) return;
    this.noiseBurst({ type: 'bandpass', freq: 500, freqEnd: 3200, q: 1.4, dur: 0.28, vol: 0.12, attack: 0.08 });
  }

  select(): void {
    if (!this.gate('select', 0.1)) return;
    const t = this.ctx!.currentTime;
    [0, 2, 4, 7].forEach((d, i) => {
      this.tone({ type: 'triangle', freq: mtof(hicaz(d + 7, 62)), dur: 0.5, vol: 0.09, when: t + i * 0.05, reverb: 0.5 });
    });
  }

  /** Sekme: kombo arttıkça Hicaz dizisinde yükselen çan sesi. */
  deflect(combo: number): void {
    if (!this.gate('deflect', 0.035)) return;
    const deg = Math.min(combo, 20);
    const f = mtof(hicaz(deg, 74));
    this.tone({ type: 'sine', freq: f, dur: 0.42, vol: 0.13, reverb: 0.45 });
    this.tone({ type: 'triangle', freq: f * 2, dur: 0.16, vol: 0.035 });
    this.noiseBurst({ type: 'highpass', freq: 5000, dur: 0.04, vol: 0.05 });
  }

  explode(size: number): void {
    if (!this.gate('explode', 0.04)) return;
    const s = Math.min(size, 3);
    this.noiseBurst({ type: 'lowpass', freq: 2400 + s * 800, freqEnd: 140, dur: 0.35 + s * 0.12, vol: 0.2 + s * 0.06, reverb: 0.25 });
    this.tone({ type: 'sine', freq: 130, freqEnd: 38, dur: 0.28 + s * 0.08, vol: 0.28 + s * 0.05 });
  }

  zap(): void {
    if (!this.gate('zap', 0.06)) return;
    this.noiseBurst({ type: 'bandpass', freq: 3800, freqEnd: 1200, q: 3, dur: 0.18, vol: 0.12 });
    this.tone({ type: 'square', freq: 1800, freqEnd: 300, dur: 0.12, vol: 0.03, lp: 3000 });
  }

  shatter(): void {
    if (!this.gate('shatter', 0.06)) return;
    this.noiseBurst({ type: 'highpass', freq: 3000, dur: 0.25, vol: 0.14 });
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 4; i++) {
      this.tone({ type: 'sine', freq: 2400 + Math.random() * 2400, dur: 0.1, vol: 0.03, when: t + i * 0.025 });
    }
  }

  cityHit(): void {
    if (!this.gate('city', 0.08)) return;
    this.tone({ type: 'sine', freq: 90, freqEnd: 28, dur: 0.8, vol: 0.5 });
    this.noiseBurst({ type: 'lowpass', freq: 900, freqEnd: 90, dur: 0.9, vol: 0.34, reverb: 0.3 });
    this.tone({ type: 'sawtooth', freq: 70, freqEnd: 40, dur: 0.4, vol: 0.08, lp: 400 });
  }

  dome(): void {
    if (!this.gate('dome', 0.1)) return;
    this.tone({ type: 'sine', freq: 520, freqEnd: 1040, dur: 0.5, vol: 0.12, reverb: 0.6 });
    this.tone({ type: 'triangle', freq: 780, freqEnd: 1560, dur: 0.4, vol: 0.05 });
  }

  bossHit(): void {
    if (!this.gate('bossHit', 0.05)) return;
    this.tone({ type: 'square', freq: 220, freqEnd: 90, dur: 0.22, vol: 0.08, lp: 1400 });
    this.noiseBurst({ type: 'bandpass', freq: 1400, q: 2, dur: 0.14, vol: 0.14 });
  }

  bossAppear(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'sawtooth', freq: 55, freqEnd: 73, dur: 2.2, vol: 0.14, attack: 0.8, lp: 500 });
    this.tone({ type: 'sawtooth', freq: 82, freqEnd: 110, dur: 2.2, vol: 0.08, attack: 0.9, lp: 700, detune: 8 });
    this.noiseBurst({ type: 'lowpass', freq: 200, freqEnd: 1200, dur: 2, vol: 0.12, attack: 1.2, when: t });
  }

  bossDie(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    this.noiseBurst({ type: 'lowpass', freq: 3000, freqEnd: 60, dur: 2.2, vol: 0.45, reverb: 0.5 });
    this.tone({ type: 'sine', freq: 110, freqEnd: 24, dur: 1.6, vol: 0.5 });
    [0, 2, 4, 7, 9, 11, 14].forEach((d, i) => {
      this.tone({ type: 'triangle', freq: mtof(hicaz(d, 62)), dur: 0.9, vol: 0.07, when: t + 0.35 + i * 0.07, reverb: 0.6 });
    });
  }

  waveStart(): void {
    if (!this.ctx || !this.sfxOn) return;
    this.noiseBurst({ type: 'bandpass', freq: 300, freqEnd: 5000, q: 1.2, dur: 0.9, vol: 0.12, attack: 0.7 });
    this.tone({ type: 'sawtooth', freq: 146, freqEnd: 293, dur: 0.9, vol: 0.05, attack: 0.6, lp: 1800 });
  }

  waveClear(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((s, i) => {
      this.tone({ type: 'triangle', freq: mtof(62 + s), dur: 1.1, vol: 0.08, when: t + i * 0.06, reverb: 0.6 });
    });
    this.tone({ type: 'sine', freq: mtof(38), dur: 0.8, vol: 0.2 });
  }

  perfect(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      this.tone({ type: 'sine', freq: mtof(hicaz(i + 7, 62)), dur: 0.35, vol: 0.06, when: t + i * 0.045, reverb: 0.7 });
    }
  }

  coin(): void {
    if (!this.gate('coin', 0.045)) return;
    this.tone({ type: 'square', freq: 1970, dur: 0.05, vol: 0.025, lp: 5000 });
    this.tone({ type: 'sine', freq: 2630, dur: 0.12, vol: 0.05 });
  }

  inkEmpty(): void {
    if (!this.gate('ink', 0.25)) return;
    this.tone({ type: 'triangle', freq: 180, freqEnd: 90, dur: 0.18, vol: 0.14 });
    this.noiseBurst({ type: 'lowpass', freq: 800, dur: 0.08, vol: 0.08 });
  }

  combo(level: number): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const base = 62 + Math.min(level, 4) * 2;
    [0, 4, 7].forEach((s, i) => {
      this.tone({ type: 'sawtooth', freq: mtof(base + s), dur: 0.5, vol: 0.05, when: t + i * 0.03, lp: 2600, reverb: 0.4 });
    });
  }

  record(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const seq = [0, 4, 7, 11, 14];
    seq.forEach((d, i) => {
      this.tone({ type: 'triangle', freq: mtof(hicaz(d, 62)), dur: 0.7, vol: 0.1, when: t + i * 0.09, reverb: 0.6 });
      this.tone({ type: 'sine', freq: mtof(hicaz(d, 74)), dur: 0.5, vol: 0.04, when: t + i * 0.09 });
    });
  }

  rankUp(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const chord = [0, 4, 7, 12, 16, 19, 24];
    chord.forEach((s, i) => {
      this.tone({ type: 'sawtooth', freq: mtof(50 + s), dur: 1.6, vol: 0.045, when: t + i * 0.07, lp: 2400, reverb: 0.7 });
    });
    this.noiseBurst({ type: 'highpass', freq: 6000, dur: 1.4, vol: 0.05, attack: 0.3 });
  }

  gameOver(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    [7, 5, 4, 1, 0].forEach((d, i) => {
      this.tone({ type: 'triangle', freq: mtof(hicaz(d, 62)), dur: 0.9, vol: 0.09, when: t + i * 0.16, reverb: 0.6 });
    });
    this.tone({ type: 'sine', freq: mtof(38), freqEnd: mtof(26), dur: 2, vol: 0.25 });
  }

  blackHole(): void {
    if (!this.gate('bh', 0.3)) return;
    this.tone({ type: 'sawtooth', freq: 200, freqEnd: 30, dur: 1.4, vol: 0.1, lp: 600 });
    this.noiseBurst({ type: 'bandpass', freq: 3000, freqEnd: 100, q: 2, dur: 1.2, vol: 0.12 });
  }

  repair(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      this.tone({ type: 'sine', freq: mtof(hicaz(i * 2, 62)), dur: 0.4, vol: 0.06, when: t + i * 0.06, reverb: 0.5 });
    }
  }

  /** Sahne tamburu dönerken yükselen rüzgâr */
  sceneTurn(): void {
    if (!this.ctx || !this.sfxOn) return;
    this.noiseBurst({ type: 'bandpass', freq: 220, freqEnd: 2800, q: 0.9, dur: 2.5, vol: 0.12, attack: 1.4, reverb: 0.3 });
    this.tone({ type: 'triangle', freq: 110, freqEnd: 330, dur: 2.5, vol: 0.035, attack: 1.5, lp: 1200, reverb: 0.4 });
  }

  /** Yeni dünya açıldı: geniş, parlak akor */
  newWorld(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const base = 50 + this.nextRoot;
    [0, 7, 12, 16, 19, 24].forEach((s, i) => {
      this.tone({ type: 'triangle', freq: mtof(base + s), dur: 1.8, vol: 0.07, when: t + i * 0.05, reverb: 0.8 });
    });
    this.noiseBurst({ type: 'highpass', freq: 5000, dur: 1.2, vol: 0.06, attack: 0.05 });
    this.tone({ type: 'sine', freq: mtof(base - 12), dur: 1.4, vol: 0.25 });
  }

  /** Buz kristali çizgiyi dondurdu */
  freeze(): void {
    if (!this.gate('freeze', 0.1)) return;
    this.tone({ type: 'sine', freq: 2400, freqEnd: 1200, dur: 0.3, vol: 0.06, reverb: 0.4 });
    this.noiseBurst({ type: 'highpass', freq: 5000, dur: 0.25, vol: 0.08 });
  }

  /** Yetenek doldu: kısa, parlak bir yükseliş */
  skillReady(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((s, i) => {
      this.tone({ type: 'triangle', freq: mtof(74 + s), dur: 0.3, vol: 0.06, when: t + i * 0.05, reverb: 0.5 });
    });
  }

  /** Yıldız Patlaması: derin gümbürtü + yükselen parıltı */
  skillNova(): void {
    if (!this.ctx || !this.sfxOn) return;
    this.tone({ type: 'sine', freq: 90, freqEnd: 30, dur: 1.2, vol: 0.5 });
    this.noiseBurst({ type: 'lowpass', freq: 4000, freqEnd: 200, dur: 1.4, vol: 0.4, reverb: 0.6 });
    this.tone({ type: 'sawtooth', freq: 220, freqEnd: 1760, dur: 0.9, vol: 0.06, lp: 3000, reverb: 0.5 });
  }

  /** Zaman Kırılması: geri sarılan saat tiki */
  skillWarp(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'sine', freq: 1600, freqEnd: 200, dur: 1.2, vol: 0.12, reverb: 0.7 });
    for (let i = 0; i < 6; i++) this.tone({ type: 'square', freq: 3000 - i * 300, dur: 0.03, vol: 0.03, when: t + i * 0.12, lp: 5000 });
  }

  /** Aegis Kalkanı: parlayan uğultu */
  skillAegis(): void {
    if (!this.ctx || !this.sfxOn) return;
    this.tone({ type: 'sawtooth', freq: 110, freqEnd: 220, dur: 1.2, vol: 0.08, attack: 0.3, lp: 1400, reverb: 0.6 });
    this.tone({ type: 'triangle', freq: mtof(74), dur: 1.4, vol: 0.08, attack: 0.2, reverb: 0.8 });
    this.tone({ type: 'triangle', freq: mtof(81), dur: 1.4, vol: 0.06, attack: 0.3, reverb: 0.8 });
  }

  /** Yıldız Yağmuru: art arda çınlayan yükselişler */
  skillStar(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      this.tone({ type: 'triangle', freq: mtof(hicaz(i * 2, 74)), dur: 0.35, vol: 0.05, when: t + i * 0.08, reverb: 0.6 });
    }
  }

  /** Işınlanma: yukarı kayan cam sesi */
  blink(): void {
    if (!this.gate('blink', 0.08)) return;
    this.tone({ type: 'sine', freq: 520, freqEnd: 1900, dur: 0.18, vol: 0.08, reverb: 0.4 });
    this.noiseBurst({ type: 'bandpass', freq: 2400, freqEnd: 6000, q: 2, dur: 0.12, vol: 0.05 });
  }

  /** Alev meteoru çizgiyi yaktı: çıtırtılı alev */
  burn(): void {
    if (!this.gate('burn', 0.08)) return;
    this.noiseBurst({ type: 'bandpass', freq: 1800, freqEnd: 500, q: 0.9, dur: 0.35, vol: 0.16 });
    this.tone({ type: 'sawtooth', freq: 180, freqEnd: 70, dur: 0.25, vol: 0.05, lp: 900 });
  }

  /** Prizma bölündü: üç parlak çan */
  prism(): void {
    if (!this.gate('prism', 0.08)) return;
    const t = this.ctx!.currentTime;
    [0, 4, 7].forEach((d, i) => this.tone({ type: 'triangle', freq: mtof(hicaz(d + 9, 62)), dur: 0.3, vol: 0.06, when: t + i * 0.035, reverb: 0.5 }));
  }

  /** Bilardo vuruşu: tahta top tıkırtısı + çan */
  bank(): void {
    if (!this.gate('bank', 0.06)) return;
    this.tone({ type: 'square', freq: 1400, dur: 0.04, vol: 0.04, lp: 4000 });
    this.tone({ type: 'sine', freq: 1976, dur: 0.3, vol: 0.07, reverb: 0.5 });
  }

  /** Mürekkep Ateşi başladı: yükselen parlak akor */
  feverStart(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ type: 'sawtooth', freq: mtof(62 + s), dur: 0.9, vol: 0.045, when: t + i * 0.05, lp: 3000, reverb: 0.6 }));
    this.noiseBurst({ type: 'highpass', freq: 5000, dur: 0.8, vol: 0.06, attack: 0.2 });
  }

  /** Mürekkep Ateşi bitti: yumuşak iniş */
  feverEnd(): void {
    if (!this.ctx || !this.sfxOn) return;
    this.tone({ type: 'triangle', freq: 880, freqEnd: 330, dur: 0.5, vol: 0.05, reverb: 0.5 });
  }

  /** Kara Girdap: derinden dönen uğultu */
  skillVortex(): void {
    if (!this.ctx || !this.sfxOn) return;
    this.tone({ type: 'sawtooth', freq: 160, freqEnd: 40, dur: 1.6, vol: 0.1, lp: 700, reverb: 0.5 });
    this.noiseBurst({ type: 'bandpass', freq: 2400, freqEnd: 120, q: 2.5, dur: 1.4, vol: 0.14, reverb: 0.4 });
  }

  /** Yıldız Işınları: parlak lazer çınlaması */
  skillBeams(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'square', freq: 1800, freqEnd: 600, dur: 0.35, vol: 0.05, lp: 5000 });
    this.noiseBurst({ type: 'highpass', freq: 3000, dur: 0.5, vol: 0.12, reverb: 0.5 });
    [0, 4, 7, 11, 14].forEach((d, i) => this.tone({ type: 'triangle', freq: mtof(hicaz(d, 74)), dur: 0.5, vol: 0.05, when: t + i * 0.03, reverb: 0.6 }));
  }

  /** Sonsuz Yansıma: aynalı ışıltı akoru */
  skillEcho(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    [0, 7, 12, 19].forEach((s, i) => {
      this.tone({ type: 'sine', freq: mtof(69 + s), dur: 1.2, vol: 0.05, when: t + i * 0.08, reverb: 0.8 });
      this.tone({ type: 'sine', freq: mtof(69 + s) * 1.005, dur: 1.2, vol: 0.03, when: t + 0.3 + i * 0.08, reverb: 0.8 });
    });
  }

  /** Satın alma / ödül: kasa çınlaması */
  purchase(): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this.tone({ type: 'sine', freq: 2000 + i * 260, dur: 0.14, vol: 0.05, when: t + i * 0.05 });
    [0, 4, 7, 12].forEach((s, i) => this.tone({ type: 'triangle', freq: mtof(69 + s), dur: 0.6, vol: 0.07, when: t + 0.1 + i * 0.06, reverb: 0.5 }));
  }

  // ───────────────────────── MÜZİK ─────────────────────────

  /** Atmosfer müziği: bir sonraki ölçüden itibaren yeni ton ve tempo */
  setScene(root: number, bpm: number): void {
    this.nextRoot = root;
    this.nextBpm = bpm;
  }

  /** 0: menü (sakin), 1-3: dalga yoğunluğu, 4: boss */
  setIntensity(level: number): void {
    this.targetIntensity = level;
  }

  startMusic(): void {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.bar = 0;
    this.seqTimer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    this.musicPlaying = false;
    window.clearInterval(this.seqTimer);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const stepDur = 60 / this.bpm / 4;
    // sekme arka planda kaldıysa geride kalan notaları çalma
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.14) {
      // müzik kapalıyken nota üretilmez (işlemci boşa çalışmaz), ritim yine ilerler
      if (this.musicOn) this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar = (this.bar + 1) % 4;
        this.intensity = this.targetIntensity;
        this.root = this.nextRoot;
        this.bpm = this.nextBpm;
      }
    }
  }

  private rand(): number {
    this.melodySeed = (this.melodySeed * 16807) % 2147483647;
    return this.melodySeed / 2147483647;
  }

  private playStep(step: number, t: number, sd: number): void {
    const dest = this.musicIn;
    const I = this.intensity;
    const R = this.root;
    const root = 50 + R + BAR_ROOTS[this.bar];
    const chord = BAR_CHORDS[this.bar].map((c) => c + R);

    // Pad: her ölçünün başında yavaş açılan, yumuşak akor
    if (step === 0) {
      const barLen = sd * 16;
      for (const c of chord) {
        const f = mtof(62 + c);
        this.tone({ type: 'triangle', freq: f, dur: barLen * 1.15, vol: 0.026, attack: barLen * 0.3, when: t, dest, detune: -6 });
        this.tone({ type: 'sine', freq: f * 2, dur: barLen, vol: 0.01, attack: barLen * 0.4, when: t, dest, detune: 5 });
      }
      if (I >= 1) {
        // derin, yuvarlak alt ses
        this.tone({ type: 'sine', freq: mtof(root - 12), dur: barLen * 0.95, vol: 0.085, attack: 0.4, when: t, dest });
      }
      if (I >= 4) this.tone({ type: 'triangle', freq: mtof(root - 24), dur: barLen, vol: 0.05, attack: 0.8, when: t, dest, lp: 320 });
    }

    // Arpej: yankıda eriyen çan tınısı (sakinde seyrek, dalga yoğunlaştıkça sıklaşır)
    const dense = I >= 2;
    if (step % 2 === 0 || dense) {
      const k = dense ? step : step / 2;
      const n = chord[k % 3] + 74 + ((dense ? step % 6 >= 3 : step >= 8) ? 12 : 0);
      const v = dense && step % 2 === 1 ? 0.016 : 0.03;
      this.tone({ type: 'triangle', freq: mtof(n), dur: sd * 3, vol: v, when: t, dest, lp: 3200 + I * 300 });
    }

    // Ara sıra yüksek bir çan (menüde ve sakin dalgalarda)
    if (I <= 1 && step % 4 === 0 && this.rand() < 0.14) {
      const n = hicaz(7 + Math.floor(this.rand() * 7), 74 + R);
      this.tone({ type: 'sine', freq: mtof(n), dur: sd * 6, vol: 0.022, when: t, dest });
    }

    // Kalp atışı: yumuşak, kuru (yankıya gitmez) bir vuruş
    if (I >= 2 && (step === 0 || step === 8 || (I >= 4 && (step === 6 || step === 14)))) {
      this.tone({ type: 'sine', freq: 110, freqEnd: 44, dur: 0.26, vol: 0.16, when: t, dest: this.musicLP });
    }
    if (I >= 3 && step % 4 === 2) {
      this.noiseBurst({ type: 'bandpass', freq: 6200, q: 0.8, dur: 0.05, vol: 0.012, attack: 0.012, when: t, dest: this.musicLP });
    }

    if (I >= 3 && step % 2 === 0 && this.rand() < 0.38) {
      // Hicaz'da yavaş yürüyen melodi
      this.melodyDeg += Math.floor(this.rand() * 5) - 2;
      if (this.melodyDeg < 4) this.melodyDeg = 5;
      if (this.melodyDeg > 13) this.melodyDeg = 11;
      const n = hicaz(this.melodyDeg, 62 + R);
      this.tone({ type: 'triangle', freq: mtof(n), dur: sd * 4, vol: 0.045, attack: 0.03, when: t, dest });
      this.tone({ type: 'sine', freq: mtof(n + 12), dur: sd * 2.5, vol: 0.012, when: t, dest });
    }
  }
}

export const audio = new AudioEngine();
