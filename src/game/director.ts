import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { KINDS, MK } from './meteors';

export interface Spawn {
  t: number;
  kind: MK;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface DirectorMods {
  speed: number;
  golden: number;
  size: number;
  chaos: boolean;
}

/**
 * Dalga planlayıcı: her dalga önceden, tohumlu RNG ile planlanır (günlük modda herkes aynı).
 * Desenler kombo fırsatı yaratacak şekilde tasarlandı: sütunlar, sıralar, kümeler.
 */
export class Director {
  rng: Rng;
  wave = 0;
  queue: Spawn[] = [];
  qi = 0;
  time = 0;
  bossWave = false;
  bossSpawned = false;
  escortT = 0;
  goldenBonus = 0;
  /** atmosfer eğilimi: normal, hızlı, zırhlı, bölünen ağırlık çarpanları */
  bias: [number, number, number, number] = [1, 1, 1, 1];

  constructor(
    seed: number,
    public mods: DirectorMods,
  ) {
    this.rng = new Rng(seed);
  }

  get pending(): number {
    return this.queue.length - this.qi;
  }

  baseSpeed(H: number): number {
    const w = this.wave;
    const s = 195 + 12 * Math.min(w, 25) + 4 * Math.max(0, w - 25);
    return s * (H / 1280) * this.mods.speed;
  }

  private pickKind(): MK {
    const w = this.wave;
    const r = this.rng;
    const golden = (w >= 2 ? 0.035 : 0) * this.mods.golden + this.goldenBonus;
    if (r.chance(golden)) return MK.Golden;
    const ww = this.mods.chaos ? Math.max(w, 8) : w;
    const weights = [
      1,
      ww >= 2 ? Math.min(0.45, 0.16 + 0.02 * ww) : 0,
      ww >= 3 ? Math.min(0.3, 0.1 + 0.012 * ww) : 0,
      ww >= 4 ? Math.min(0.28, 0.1 + 0.01 * ww) : 0,
    ];
    for (let i = 0; i < 4; i++) weights[i] *= this.bias[i];
    return r.weighted(weights) as MK;
  }

  /** Dalga planla. groundY: şehir çatı hizası, H: dünya yüksekliği */
  plan(wave: number, H: number, groundY: number): void {
    this.wave = wave;
    this.queue = [];
    this.qi = 0;
    this.time = 0;
    this.bossWave = wave % 5 === 0;
    this.bossSpawned = false;
    this.escortT = 4;
    const r = this.rng;
    const speed = this.baseSpeed(H);

    const aim = (x: number, kind: MK, spd: number): [number, number] => {
      const tx = clamp(x + r.range(-260, 260), 40, 680);
      const dx = tx - x;
      const dy = groundY + 40;
      const L = Math.hypot(dx, dy);
      const s = spd * KINDS[kind].speed * r.range(0.92, 1.08);
      return [(dx / L) * s, (dy / L) * s];
    };
    const add = (t: number, kind: MK, x: number, vx: number, vy: number, yOff = 0): void => {
      const rr = KINDS[kind].r * this.mods.size;
      this.queue.push({ t, kind, x, y: -rr - 12 - yOff, vx, vy });
    };

    if (this.bossWave) {
      // Boss dalgası: 1.2 sn sonra boss, önünde küçük bir öncü akın
      this.queue.push({ t: 1.2, kind: MK.Boss, x: 360, y: -110, vx: 0, vy: 0 });
      let t = 3;
      for (let i = 0; i < 4 + Math.floor(wave / 5); i++) {
        const kind = this.pickKind();
        const x = r.range(60, 660);
        const [vx, vy] = aim(x, kind, speed * 0.9);
        add(t, kind, x, vx, vy);
        t += r.range(1.1, 1.8);
      }
      this.queue.sort((a, b) => a.t - b.t);
      return;
    }

    const total = Math.round(5 + wave * 3);
    let count = 0;
    let t = 1.2;
    const pw = (min: number, w: number): number => (wave >= min ? w : 0);
    while (count < total) {
      const pattern = r.weighted([
        1.0, // tekli
        pw(2, 0.5), // çift
        pw(2, 0.45), // sütun
        pw(3, 0.4), // sıra
        pw(4, 0.35), // küme
        pw(5, 0.3), // V
        pw(6, 0.28), // yağmur
      ]);
      let n = 1;
      if (pattern === 0) {
        const kind = this.pickKind();
        const x = r.range(50, 670);
        const [vx, vy] = aim(x, kind, speed);
        add(t, kind, x, vx, vy);
      } else if (pattern === 1) {
        n = 2;
        const kind = this.pickKind();
        const x = r.range(70, 300);
        const [vx, vy] = aim(x, kind, speed);
        add(t, kind, x, vx, vy);
        add(t, kind, 720 - x, -vx, vy);
      } else if (pattern === 2) {
        n = r.int(3, 4 + Math.min(2, Math.floor(wave / 6)));
        const kind = r.chance(0.7) ? MK.Normal : this.pickKind();
        const x = r.range(90, 630);
        const [vx, vy] = aim(x, kind, speed);
        for (let i = 0; i < n; i++) add(t + i * 0.34, kind, x, vx, vy);
      } else if (pattern === 3) {
        n = r.int(3, 4);
        const kind = this.pickKind();
        const spread = r.range(90, 140);
        const x0 = 360 - (spread * (n - 1)) / 2 + r.range(-60, 60);
        const [vx, vy] = aim(360, kind, speed);
        for (let i = 0; i < n; i++) add(t, kind, clamp(x0 + i * spread, 40, 680), vx * 0.4, vy);
      } else if (pattern === 4) {
        n = 4;
        const cx = r.range(140, 580);
        const [vx, vy] = aim(cx, MK.Normal, speed * 0.85);
        for (let i = 0; i < n; i++) {
          const kind = i === 0 ? this.pickKind() : MK.Normal;
          add(t, kind, cx + r.range(-46, 46), vx, vy, r.range(0, 70));
        }
      } else if (pattern === 5) {
        n = 5;
        const cx = r.range(200, 520);
        const [vx, vy] = aim(cx, MK.Normal, speed);
        for (let i = 0; i < n; i++) {
          const off = i - 2;
          add(t, MK.Normal, cx + off * 58, vx, vy, Math.abs(off) * 48);
        }
      } else {
        n = r.int(5, 7);
        for (let i = 0; i < n; i++) {
          const x = r.range(40, 680);
          const [vx, vy] = aim(x, MK.Shard, speed * 1.05);
          add(t + i * 0.13, MK.Shard, x, vx, vy);
        }
      }
      count += n;
      const gap = Math.max(0.45, 1.45 - wave * 0.07) + n * 0.18 + r.range(-0.15, 0.2);
      t += gap;
    }
    this.queue.sort((a, b) => a.t - b.t);
  }

  /** Boss hayattayken periyodik eskort meteorları */
  escort(dt: number, H: number, groundY: number): Spawn | null {
    this.escortT -= dt;
    if (this.escortT > 0) return null;
    this.escortT = Math.max(1.6, 3.2 - this.wave * 0.05);
    const kind = this.pickKind();
    const x = this.rng.range(50, 670);
    const tx = clamp(x + this.rng.range(-200, 200), 40, 680);
    const dx = tx - x;
    const dy = groundY + 40;
    const L = Math.hypot(dx, dy);
    const s = this.baseSpeed(H) * KINDS[kind].speed * 0.95;
    return { t: 0, kind, x, y: -KINDS[kind].r - 12, vx: (dx / L) * s, vy: (dy / L) * s };
  }
}
