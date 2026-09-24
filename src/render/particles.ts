import { TAU } from '../core/math';
import type { Canvas } from './sprites';

export const enum Shape {
  /** yumuşak parıltı (sprite) */
  Glow = 0,
  /** hız yönünde uzamış kıvılcım */
  Streak = 1,
  /** dönen enkaz parçası */
  Chip = 2,
}

export interface SpawnOpts {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  sizeEnd?: number;
  sprite: number;
  shape?: Shape;
  additive?: boolean;
  drag?: number;
  gravity?: number;
  alpha?: number;
  spin?: number;
  stretch?: number;
}

/**
 * Yapı-dizisi (SoA) parçacık sistemi: sıfır çöp üretimi, sıkı döngüler.
 * Ölü parçacık sonuncuyla takas edilerek silinir -> dizi hep yoğun kalır.
 */
export class Particles {
  cap: number;
  n = 0;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private alpha: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private stretch: Float32Array;
  private spr: Uint16Array;
  private shape: Uint8Array;
  private add: Uint8Array;

  /** sprite kayıt defteri: id -> canvas (Glow/Streak) veya renk (Chip) */
  private sprites: Canvas[] = [];
  private colors: string[] = [];
  private ids = new Map<string, number>();

  constructor(capacity: number) {
    this.cap = capacity;
    const F = (): Float32Array => new Float32Array(capacity);
    this.x = F();
    this.y = F();
    this.vx = F();
    this.vy = F();
    this.life = F();
    this.max = F();
    this.s0 = F();
    this.s1 = F();
    this.drag = F();
    this.grav = F();
    this.alpha = F();
    this.rot = F();
    this.spin = F();
    this.stretch = F();
    this.spr = new Uint16Array(capacity);
    this.shape = new Uint8Array(capacity);
    this.add = new Uint8Array(capacity);
  }

  /** Görsel kaydı: aynı anahtar tekrar kayıt edilmez */
  register(key: string, sprite: Canvas, color = '#fff'): number {
    const found = this.ids.get(key);
    if (found !== undefined) return found;
    const id = this.sprites.length;
    this.sprites.push(sprite);
    this.colors.push(color);
    this.ids.set(key, id);
    return id;
  }

  setBudget(cap: number): void {
    this.cap = Math.min(cap, this.x.length);
    if (this.n > this.cap) this.n = this.cap;
  }

  clear(): void {
    this.n = 0;
  }

  spawn(o: SpawnOpts): void {
    let i = this.n;
    if (i >= this.cap) {
      // bütçe doluysa en eski yerine rastgele birini ez (görsel olarak fark edilmez)
      i = (Math.random() * this.cap) | 0;
    } else {
      this.n++;
    }
    this.x[i] = o.x;
    this.y[i] = o.y;
    this.vx[i] = o.vx;
    this.vy[i] = o.vy;
    this.life[i] = o.life;
    this.max[i] = o.life;
    this.s0[i] = o.size;
    this.s1[i] = o.sizeEnd ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.alpha[i] = o.alpha ?? 1;
    this.rot[i] = Math.random() * TAU;
    this.spin[i] = o.spin ?? 0;
    this.stretch[i] = o.stretch ?? 0.045;
    this.spr[i] = o.sprite;
    this.shape[i] = o.shape ?? Shape.Glow;
    this.add[i] = o.additive === false ? 0 : 1;
  }

  /** Dairesel patlama */
  burst(
    x: number,
    y: number,
    count: number,
    sprite: number,
    speedMin: number,
    speedMax: number,
    life: number,
    size: number,
    opts: Partial<SpawnOpts> = {},
  ): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      const sp = speedMin + Math.random() * (speedMax - speedMin);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life * (0.6 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.7),
        sprite,
        ...opts,
      });
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      const l = this.life[i] - dt;
      if (l <= 0) {
        this.kill(i);
        continue;
      }
      this.life[i] = l;
      const d = this.drag[i];
      if (d > 0) {
        const f = Math.exp(-d * dt);
        this.vx[i] *= f;
        this.vy[i] *= f;
      }
      this.vy[i] += this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
  }

  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.s0[i] = this.s0[j];
    this.s1[i] = this.s1[j];
    this.drag[i] = this.drag[j];
    this.grav[i] = this.grav[j];
    this.alpha[i] = this.alpha[j];
    this.rot[i] = this.rot[j];
    this.spin[i] = this.spin[j];
    this.stretch[i] = this.stretch[j];
    this.spr[i] = this.spr[j];
    this.shape[i] = this.shape[j];
    this.add[i] = this.add[j];
  }

  /**
   * k, tx, ty: aktif dünya dönüşümü (setTransform değerleri). Kıvılcımlar dönüşümü
   * doğrudan hesaplayıp save/restore maliyetinden kaçınır.
   */
  render(g: CanvasRenderingContext2D, k: number, tx: number, ty: number): void {
    // 1) normal karışımlı (duman, enkaz)
    g.globalCompositeOperation = 'source-over';
    this.pass(g, k, tx, ty, 0);
    // 2) additive (ışık, kıvılcım)
    g.globalCompositeOperation = 'lighter';
    this.pass(g, k, tx, ty, 1);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.setTransform(k, 0, 0, k, tx, ty);
  }

  private pass(g: CanvasRenderingContext2D, k: number, tx: number, ty: number, add: number): void {
    let transformed = false;
    for (let i = 0; i < this.n; i++) {
      if (this.add[i] !== add) continue;
      const t = this.life[i] / this.max[i]; // 1 -> 0
      const size = this.s1[i] + (this.s0[i] - this.s1[i]) * t;
      if (size <= 0.2) continue;
      // hızlı parlayıp yavaş sönme eğrisi
      const fade = t > 0.85 ? (1 - t) / 0.15 : t < 0.5 ? t / 0.5 : 1;
      const a = this.alpha[i] * (add ? fade : t);
      if (a <= 0.01) continue;
      g.globalAlpha = a > 1 ? 1 : a;
      const shape = this.shape[i];
      const x = this.x[i];
      const y = this.y[i];
      if (shape === Shape.Glow) {
        if (transformed) {
          g.setTransform(k, 0, 0, k, tx, ty);
          transformed = false;
        }
        g.drawImage(this.sprites[this.spr[i]], x - size * 0.5, y - size * 0.5, size, size);
      } else if (shape === Shape.Streak) {
        const vx = this.vx[i];
        const vy = this.vy[i];
        const sp = Math.sqrt(vx * vx + vy * vy) + 1e-4;
        const len = size + sp * this.stretch[i];
        const c = (vx / sp) * k;
        const s = (vy / sp) * k;
        g.setTransform(c, s, -s, c, tx + x * k, ty + y * k);
        transformed = true;
        g.drawImage(this.sprites[this.spr[i]], -len * 0.5, -size * 0.5, len, size);
      } else {
        const r = this.rot[i];
        const c = Math.cos(r) * k;
        const s = Math.sin(r) * k;
        g.setTransform(c, s, -s, c, tx + x * k, ty + y * k);
        transformed = true;
        g.fillStyle = this.colors[this.spr[i]];
        g.fillRect(-size * 0.5, -size * 0.35, size, size * 0.7);
      }
    }
    if (transformed) g.setTransform(k, 0, 0, k, tx, ty);
  }
}
