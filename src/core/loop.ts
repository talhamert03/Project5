/**
 * requestAnimationFrame döngüsü + performans izleme.
 * dt kırpılır (sekme dönüşünde dev sıçrama olmasın). Ekran 90/120Hz ise doğal olarak o hızda koşar.
 */
export class Loop {
  private raf = 0;
  private last = 0;
  private running = false;
  fps = 60;
  /** Son karelerde güncelleme+çizim süresi (ms), üstel ortalama */
  workMs = 4;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(private frame: (dt: number, now: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
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

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
