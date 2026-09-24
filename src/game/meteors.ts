import { TAU } from '../core/math';
import { METEOR_COLORS } from '../render/palette';
import { METEOR_R, type Sprites } from '../render/sprites';

export const enum MK {
  Normal = 0,
  Fast = 1,
  Heavy = 2,
  Splitter = 3,
  Golden = 4,
  Shard = 5,
  Boss = 6,
}

export interface KindDef {
  key: keyof typeof METEOR_COLORS;
  r: number;
  speed: number;
  score: number;
}

export const KINDS: KindDef[] = [
  { key: 'normal', r: 22, speed: 1, score: 50 },
  { key: 'fast', r: 14, speed: 1.65, score: 75 },
  { key: 'heavy', r: 30, speed: 0.72, score: 120 },
  { key: 'splitter', r: 25, speed: 0.9, score: 80 },
  { key: 'golden', r: 20, speed: 0.85, score: 60 },
  { key: 'shard', r: 12.5, speed: 1.2, score: 30 },
  { key: 'boss', r: 80, speed: 1, score: 0 },
];

export const TRAIL = 12;

export class Meteor {
  active = false;
  kind: MK = MK.Normal;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  r = 10;
  rot = 0;
  spin = 0;
  friendly = false;
  armor = 0;
  hp = 1;
  maxHp = 1;
  age = 0;
  variant = 0;
  trail = new Float32Array(TRAIL * 2);
  trailN = 0;
  trailHead = 0;
  trailAcc = 0;
  lastLine = -1;
  lineCd = 0;
  bounces = 0;
  flash = 0;
  mirrored = false;
  pierce = 0;
  swayPh = 0;
  /** golden: yatay salınım, boss: hedef iniş hızı */
  baseV = 0;
  minionT = 0;
  /** eğitim meteoru: şehre zarar vermez */
  tutorial = false;
  /** zincir derinliği (kim patlattı) */
  chainDepth = 0;
  /** bu meteoru sektiren çizgi (görev takibi) */
  deflectedBy = 0;

  spawn(kind: MK, x: number, y: number, vx: number, vy: number, rScale = 1): this {
    const d = KINDS[kind];
    this.active = true;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = d.r * rScale;
    this.rot = Math.random() * TAU;
    this.spin = (Math.random() - 0.5) * (kind === MK.Fast ? 6 : 2.2);
    this.friendly = false;
    this.armor = kind === MK.Heavy ? 1 : 0;
    this.hp = 1;
    this.maxHp = 1;
    this.age = 0;
    this.variant = (Math.random() * 3) | 0;
    this.trailN = 0;
    this.trailHead = 0;
    this.trailAcc = 0;
    this.lastLine = -1;
    this.lineCd = 0;
    this.bounces = 0;
    this.flash = 0;
    this.mirrored = false;
    this.pierce = 0;
    this.swayPh = Math.random() * TAU;
    this.baseV = vx;
    this.minionT = 2;
    this.tutorial = false;
    this.chainDepth = 0;
    this.deflectedBy = 0;
    return this;
  }

  pushTrail(): void {
    this.trail[this.trailHead * 2] = this.x;
    this.trail[this.trailHead * 2 + 1] = this.y;
    this.trailHead = (this.trailHead + 1) % TRAIL;
    if (this.trailN < TRAIL) this.trailN++;
  }
}

/** Meteor çizimi: iz (additive), gövde (normal), ışıma (additive) */
export function renderMeteors(
  g: CanvasRenderingContext2D,
  list: Meteor[],
  sprites: Sprites,
  inkColor: string,
  k: number,
  tx: number,
  ty: number,
  time: number,
): void {
  // 1) izler + hale
  g.globalCompositeOperation = 'lighter';
  for (const m of list) {
    if (!m.active) continue;
    const col = m.friendly ? inkColor : METEOR_COLORS[KINDS[m.kind].key];
    const glow = sprites.glow(col);
    const n = m.trailN;
    for (let i = 0; i < n; i++) {
      // en yeni -> en eski
      const idx = (m.trailHead - 1 - i + TRAIL * 2) % TRAIL;
      const x = m.trail[idx * 2];
      const y = m.trail[idx * 2 + 1];
      const f = 1 - i / TRAIL;
      const s = m.r * (1.1 + 1.6 * f) * (m.kind === MK.Boss ? 1.2 : 1);
      g.globalAlpha = 0.55 * f * f;
      g.drawImage(glow, x - s, y - s, s * 2, s * 2);
    }
    const hs = m.r * (m.kind === MK.Boss ? 4.4 : 5.2);
    g.globalAlpha = m.friendly ? 0.75 : 0.55;
    g.drawImage(glow, m.x - hs / 2, m.y - hs / 2, hs, hs);
  }

  // 2) gövdeler
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  for (const m of list) {
    if (!m.active) continue;
    const def = KINDS[m.kind];
    const spr = sprites.meteor(def.key, m.variant, m.armor > 0);
    const scale = (m.r / (m.kind === MK.Boss ? METEOR_R * 2 : METEOR_R)) * k;
    const c = Math.cos(m.rot) * scale;
    const s = Math.sin(m.rot) * scale;
    g.setTransform(c, s, -s, c, tx + m.x * k, ty + m.y * k);
    g.drawImage(spr, -spr.width / 2, -spr.height / 2);
  }
  g.setTransform(k, 0, 0, k, tx, ty);

  // 3) sıcak ön kenar, dost parıltısı, vuruş flaşı
  g.globalCompositeOperation = 'lighter';
  for (const m of list) {
    if (!m.active) continue;
    const sp = Math.hypot(m.vx, m.vy) || 1;
    const hx = m.x + (m.vx / sp) * m.r * 0.55;
    const hy = m.y + (m.vy / sp) * m.r * 0.55;
    const col = m.friendly ? inkColor : METEOR_COLORS[KINDS[m.kind].key];
    const hs = m.r * 2.2;
    g.globalAlpha = 0.85;
    g.drawImage(sprites.glow(col, true), hx - hs / 2, hy - hs / 2, hs, hs);
    if (m.friendly) {
      g.globalAlpha = 0.55;
      const fs = m.r * 2.6;
      g.drawImage(sprites.glow(inkColor), m.x - fs / 2, m.y - fs / 2, fs, fs);
    }
    if (m.kind === MK.Golden) {
      g.globalAlpha = 0.6 + Math.sin(time * 9 + m.swayPh) * 0.4;
      const ss = m.r * 3.4;
      g.drawImage(sprites.sparkle, m.x - ss / 2 + m.r * 0.3, m.y - ss / 2 - m.r * 0.3, ss, ss);
    }
    if (m.kind === MK.Boss) {
      // nabız gibi atan çekirdek
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      g.globalAlpha = 0.35 + pulse * 0.35;
      const cs = m.r * (1.2 + pulse * 0.3);
      g.drawImage(sprites.glow('#FF7A4F', true), m.x - cs / 2, m.y - cs / 2, cs, cs);
    }
    if (m.flash > 0) {
      g.globalAlpha = Math.min(1, m.flash * 3);
      const fs = m.r * 3;
      g.drawImage(sprites.glow('#FFFFFF', true), m.x - fs / 2, m.y - fs / 2, fs, fs);
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/** Boss can halkası */
export function renderBossRing(g: CanvasRenderingContext2D, m: Meteor, time: number): void {
  const frac = Math.max(0, m.hp / m.maxHp);
  const R = m.r + 16;
  g.lineCap = 'round';
  g.globalAlpha = 0.35;
  g.strokeStyle = '#2a0f1a';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(m.x, m.y, R, 0, TAU);
  g.stroke();
  g.globalAlpha = 0.95;
  g.strokeStyle = frac < 0.35 ? (Math.sin(time * 14) > 0 ? '#FFFFFF' : '#FF3355') : '#FF3355';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(m.x, m.y, R, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
  g.stroke();
  g.globalAlpha = 1;
}
