import { TAU, clamp, easeOutBack, easeOutCubic } from '../core/math';
import { C } from '../render/palette';
import { type Sprites, blit } from '../render/sprites';


interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t: number;
  life: number;
  color: string;
  width: number;
}

interface Bolt {
  pts: Float32Array;
  n: number;
  t: number;
  life: number;
  color: string;
}

export interface Floater {
  text: string;
  x: number;
  y: number;
  vy: number;
  t: number;
  life: number;
  size: number;
  color: string;
  big: boolean;
  font: string;
}

interface Homer {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  color: string;
  size: number;
  done?: () => void;
}

const FONT_DISPLAY = '"Unbounded Variable", "Unbounded", "Rubik Variable", system-ui, sans-serif';

/** Ekran çapında sarsıntı, flaş, şok halkaları, şimşek, uçan yazılar, HUD'a uçan damlalar. */
export class Effects {
  rings: Ring[] = [];
  bolts: Bolt[] = [];
  floaters: Floater[] = [];
  homers: Homer[] = [];
  /** 0..1 travma: sarsıntı = travma² */
  trauma = 0;
  flashA = 0;
  flashColor: string = C.white;
  damageA = 0;
  private t = 0;
  shakeX = 0;
  shakeY = 0;
  shakeScale = 1;
  /** Yazılar HUD'un altına girmesin (dünya birimi) */
  minY = 0;

  constructor(private sprites: Sprites) {}

  clear(): void {
    this.rings.length = 0;
    this.bolts.length = 0;
    this.floaters.length = 0;
    this.homers.length = 0;
    this.trauma = 0;
    this.flashA = 0;
    this.damageA = 0;
  }

  shake(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  flash(color: string, a: number): void {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  }

  ring(x: number, y: number, r0: number, r1: number, life: number, color: string, width = 10): void {
    if (this.rings.length > 40) this.rings.shift();
    this.rings.push({ x, y, r0, r1, t: 0, life, color, width });
  }

  bolt(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const n = 12;
    const pts = new Float32Array(n * 2);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const j = i === 0 || i === n - 1 ? 0 : (Math.random() - 0.5) * len * 0.22;
      pts[i * 2] = x0 + dx * f + nx * j;
      pts[i * 2 + 1] = y0 + dy * f + ny * j;
    }
    this.bolts.push({ pts, n, t: 0, life: 0.28, color });
  }

  text(text: string, x: number, y: number, size: number, color: string, big = false, life = 0.9): void {
    if (this.floaters.length > 34) this.floaters.shift();
    this.floaters.push({
      text,
      x: clamp(x, 60, 660),
      y: Math.max(y, this.minY + size * 0.6),
      vy: big ? -30 : -70,
      t: 0,
      life,
      size,
      color,
      big,
      font: `800 ${Math.round(size)}px ${FONT_DISPLAY}`,
    });
  }

  /** Dünya noktasından hedefe (HUD) kavisli uçan parıltı */
  home(x0: number, y0: number, x1: number, y1: number, color: string, size: number, dur: number, done?: () => void): void {
    if (this.homers.length > 60) {
      const h = this.homers.shift();
      h?.done?.();
    }
    const side = Math.random() < 0.5 ? -1 : 1;
    this.homers.push({
      x0,
      y0,
      cx: (x0 + x1) / 2 + side * (80 + Math.random() * 120),
      cy: Math.max(y0, y1) + 60 + Math.random() * 60,
      x1,
      y1,
      t: -Math.random() * 0.12,
      dur,
      color,
      size,
      done,
    });
  }

  update(dt: number, realDt: number): void {
    this.t += realDt;
    // sarsıntı gerçek zamanla söner (ağır çekimde de hissedilir)
    this.trauma = Math.max(0, this.trauma - realDt * 1.6);
    const s = this.trauma * this.trauma * 26 * this.shakeScale;
    this.shakeX = s * (Math.sin(this.t * 71.3) * 0.6 + Math.sin(this.t * 43.1) * 0.4);
    this.shakeY = s * (Math.sin(this.t * 63.7 + 1.3) * 0.6 + Math.sin(this.t * 37.9) * 0.4);
    this.flashA = Math.max(0, this.flashA - realDt * 3.2);
    this.damageA = Math.max(0, this.damageA - realDt * 1.4);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      if (b.t >= b.life) this.bolts.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += realDt;
      f.y += f.vy * realDt;
      f.vy *= Math.exp(-3 * realDt);
      if (f.t >= f.life) this.floaters.splice(i, 1);
    }
    for (let i = this.homers.length - 1; i >= 0; i--) {
      const h = this.homers[i];
      h.t += realDt;
      if (h.t >= h.dur) {
        this.homers.splice(i, 1);
        h.done?.();
      }
    }
  }

  renderRings(g: CanvasRenderingContext2D): void {
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const p = r.t / r.life;
      const rad = r.r0 + (r.r1 - r.r0) * easeOutCubic(p);
      const a = (1 - p) * (1 - p);
      g.globalAlpha = a;
      g.strokeStyle = r.color;
      g.lineWidth = r.width * (1 - p * 0.7);
      g.beginPath();
      g.arc(r.x, r.y, rad, 0, TAU);
      g.stroke();
      g.globalAlpha = a * 0.5;
      const s = rad * 2.25;
      blit(g, this.sprites.ring, r.x - s / 2, r.y - s / 2, s, s);
    }
    for (const b of this.bolts) {
      const a = 1 - b.t / b.life;
      const flick = Math.random() < 0.25 ? 0.4 : 1;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        g.globalAlpha = a * flick * (pass === 0 ? 0.35 : 1);
        g.strokeStyle = pass === 0 ? b.color : '#ffffff';
        g.lineWidth = pass === 0 ? 12 : 2.5;
        g.beginPath();
        g.moveTo(b.pts[0], b.pts[1]);
        for (let i = 1; i < b.n; i++) g.lineTo(b.pts[i * 2], b.pts[i * 2 + 1]);
        g.stroke();
      }
    }
    for (const h of this.homers) {
      if (h.t < 0) continue;
      const p = easeOutCubic(clamp(h.t / h.dur, 0, 1));
      const q = 1 - p;
      const x = q * q * h.x0 + 2 * q * p * h.cx + p * p * h.x1;
      const y = q * q * h.y0 + 2 * q * p * h.cy + p * p * h.y1;
      g.globalAlpha = 0.95;
      const s = h.size * (1 - p * 0.4);
      blit(g, this.sprites.glow(h.color, true), x - s / 2, y - s / 2, s, s);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  renderText(g: CanvasRenderingContext2D, _k: number): void {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    let lastFont = '';
    for (const f of this.floaters) {
      const p = f.t / f.life;
      let scale: number;
      let a: number;
      if (f.big) {
        scale = p < 0.25 ? easeOutBack(p / 0.25) : 1 + (p - 0.25) * 0.08;
        a = p > 0.75 ? (1 - p) / 0.25 : 1;
      } else {
        scale = p < 0.15 ? 0.6 + easeOutBack(p / 0.15) * 0.4 : 1;
        a = p > 0.6 ? (1 - p) / 0.4 : 1;
      }
      if (a <= 0.01) continue;
      if (f.font !== lastFont) {
        g.font = f.font;
        lastFont = f.font;
      }
      g.save();
      g.translate(f.x, f.y);
      g.scale(scale, scale);
      g.globalAlpha = a;
      g.lineWidth = f.size * 0.22;
      g.strokeStyle = 'rgba(8,6,30,0.85)';
      g.strokeText(f.text, 0, 0);
      g.fillStyle = f.color;
      g.fillText(f.text, 0, 0);
      g.restore();
    }
    g.globalAlpha = 1;
  }
}
