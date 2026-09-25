/**
 * requestAnimationFrame döngüsü + kare hızı kilidi + performans izleme.
 *
 * Kare hızı kilidi: 120/144 Hz ekranlarda oyun her ikinci yenilemede çizilir (sabit 60/72 FPS).
 * Tarayıcı 120 FPS'e zorlanıp yetişemediğinde kareler 60 ile 120 arasında zıplar ve bu, akıcı
 * 60'tan daha "takılgan" hissettirir; ayrıca telefon ısınıp işlemciyi yavaşlatır.
 * Ekran yenileme hızı sürekli ölçülür (değişken hızlı ekranlar için).
 */
export class Loop {
  private raf = 0;
  private last = 0;
  private running = false;
  fps = 60;
  /** Son karelerde güncelleme+çizim süresi (ms), üstel ortalama */
  workMs = 4;
  /** kaç yenilemede bir çizilir (1 = her yenileme) */
  divisor = 1;
  /** ölçülen ekran yenileme aralığı (ms) */
  vsyncMs = 16.7;
  /** false: kilit kapalı (ölçüm/test için) */
  autoLock = true;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lastRaw = 0;
  private raws = new Float32Array(90);
  private rawN = 0;
  private skip = 0;

  constructor(private frame: (dt: number, now: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.lastRaw = 0;
    this.skip = 0;
    const tick = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      this.sample(now);
      // kilit: ara yenilemeleri atla (çizim yok, dokunuşlar yine de işlenir)
      if (this.divisor > 1 && ++this.skip < this.divisor) return;
      this.skip = 0;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.05) dt = 0.05;
      if (dt < 0) dt = 0;
      const t0 = performance.now();
      this.frame(dt, now);
      const work = performance.now() - t0;
      this.workMs += (work - this.workMs) * 0.05;
      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Ham rAF aralıklarından ekran yenileme hızını ölç, kilidi ayarla */
  private sample(now: number): void {
    if (this.lastRaw > 0) {
      const d = now - this.lastRaw;
      if (d > 2 && d < 40) this.raws[this.rawN++ % this.raws.length] = d;
    }
    this.lastRaw = now;
    if (this.rawN >= this.raws.length && this.rawN % 30 === 0) {
      // en kısa aralıkların medyanı: kaçırılan kareler ölçümü bozmasın
      const s = Array.from(this.raws).sort((a, b) => a - b);
      const v = s[Math.floor(s.length * 0.25)];
      this.vsyncMs = v;
      const hz = 1000 / v;
      // ≥100 Hz: ikiye böl (120→60, 144→72); 90 Hz ve altı: her yenilemede çiz
      const div = this.autoLock && hz >= 100 ? Math.max(1, Math.floor(hz / 60)) : 1;
      if (div !== this.divisor) {
        this.divisor = div;
        this.skip = 0;
      }
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
