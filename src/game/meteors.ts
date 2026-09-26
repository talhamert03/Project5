import { TAU } from '../core/math';
import { BOSS_COLORS, METEOR_COLORS } from '../render/palette';
import { METEOR_R, type Sprites, blit } from '../render/sprites';

export const enum MK {
  Normal = 0,
  Fast = 1,
  Heavy = 2,
  Splitter = 3,
  Golden = 4,
  Shard = 5,
  Boss = 6,
  /** kuyruklu yıldız: yandan, çapraz ve çok hızlı gelir */
  Comet = 7,
  /** buz kristali: dokunduğu çizgiyi dondurup kırar */
  Ice = 8,
  /** hayalet: aralıklarla saydamlaşır, o an çizgilerden geçer */
  Phantom = 9,
  /** nova çekirdeği: büyük patlar (şehre 2 hasar, patlatınca dev zincir) */
  Nova = 10,
  /** ışınlanan: düşerken (önceden haber vererek) yana ışınlanır */
  Blink = 11,
  /** alev meteoru: sektiği çizgiyi yakar */
  Flare = 12,
  /** prizma: sektirilince üç dost parçaya bölünür */
  Prism = 13,
  /** şifa kristali: sektirilirse şehri onarır, düşerse zararsız söner */
  Mender = 14,
  /** kıvılcım: küçük, dalgalanarak iner (yılan dizisi halinde gelir) */
  Wisp = 15,
}

/** Normal dalgalarda seçilebilen türler (yönetmen ağırlık sırası) */
export const SPAWN_KINDS: MK[] = [
  MK.Normal,
  MK.Fast,
  MK.Heavy,
  MK.Splitter,
  MK.Comet,
  MK.Ice,
  MK.Phantom,
  MK.Nova,
  MK.Flare,
  MK.Prism,
  MK.Wisp,
  MK.Blink,
];

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
  { key: 'comet', r: 16, speed: 1.85, score: 110 },
  { key: 'ice', r: 21, speed: 0.95, score: 90 },
  { key: 'phantom', r: 21, speed: 1.05, score: 100 },
  { key: 'nova', r: 24, speed: 0.78, score: 130 },
  { key: 'blink', r: 20, speed: 0.92, score: 110 },
  { key: 'flare', r: 23, speed: 0.9, score: 100 },
  { key: 'prism', r: 21, speed: 0.88, score: 90 },
  { key: 'mender', r: 19, speed: 0.72, score: 40 },
  { key: 'wisp', r: 11.5, speed: 1.08, score: 45 },
];

/** Boss türleri */
export const enum BT {
  Titan = 0,
  Queen = 1,
  Frost = 2,
  Singularity = 3,
  Twins = 4,
}
export const BOSS_TYPES = 5;

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
  /** boss türü (BT) ve ikizlerde sıra */
  bossType = 0;
  twin = 0;
  /** Buz Kalesi: yörüngedeki kristal kalkan sayısı ve yeniden doğma sayacı */
  shields = 0;
  shieldT = 0;
  /** Tekillik: çizgi kıran nabız sayacı (uyarı süresi < 0 iken) */
  pulseT = 0;
  /** ayaz: bu süre boyunca yavaş */
  slowT = 0;
  /** dost meteor: en yakın düşmana yönelir (mıknatıs, yıldız yağmuru) */
  homing = 0;
  /** tavandan sekme sayısı (sekme ustası) */
  topBounces = 0;
  /** hayalet: 0 görünür .. 1 tamamen saydam */
  fade = 0;
  /** ışınlanan: yapılan ışınlanma, uyarı sayacı (>0 iken titrer) ve varış noktası */
  blinkN = 0;
  blinkT = 0;
  blinkX = 0;
  /** dost meteorun yan duvardan sekme sayısı (bilardo bonusu) */
  wallHits = 0;

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
    this.bossType = 0;
    this.twin = 0;
    this.shields = 0;
    this.shieldT = 0;
    this.pulseT = 0;
    this.slowT = 0;
    this.homing = 0;
    this.topBounces = 0;
    this.fade = 0;
    this.blinkN = 0;
    this.blinkT = 0;
    this.blinkX = x;
    this.wallHits = 0;
    if (kind === MK.Comet) this.spin = (Math.random() - 0.5) * 8;
    if (kind === MK.Wisp) this.spin = (Math.random() - 0.5) * 5;
    return this;
  }

  /** Hayalet saydamken çizgilerden geçer */
  get ghost(): boolean {
    return this.fade > 0.55;
  }

  /** Işıma rengi (dost: mürekkep rengi) */
  glowColor(inkColor: string): string {
    if (this.friendly) return inkColor;
    if (this.kind === MK.Boss) return BOSS_COLORS[this.bossType] ?? BOSS_COLORS[0];
    return METEOR_COLORS[KINDS[this.kind].key];
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
    const col = m.glowColor(inkColor);
    const glow = sprites.glow(col);
    const vis = 1 - m.fade * 0.8;
    const n = m.trailN;
    // iz: birbirine binen yumuşak parıltılar. Bir atlayarak çizilir (yarı çizim),
    // parlaklık telafi edilir: parıltılar aralıktan çok büyük olduğundan görüntü aynı kalır.
    const bs = m.kind === MK.Boss ? 1.2 : 1;
    for (let i = 0; i < n; i += 2) {
      // en yeni -> en eski
      const idx = (m.trailHead - 1 - i + TRAIL * 2) % TRAIL;
      const x = m.trail[idx * 2];
      const y = m.trail[idx * 2 + 1];
      const f = 1 - (i + 0.5) / TRAIL;
      const s = m.r * (1.1 + 1.6 * f) * bs;
      g.globalAlpha = Math.min(0.9, 0.55 * f * f * 1.75) * vis;
      blit(g, glow, x - s, y - s, s * 2, s * 2);
    }
    if (m.kind === MK.Comet || (m.kind === MK.Boss && m.bossType === BT.Queen)) {
      // uzun, ışıldayan kuyruk: hızın tersine doğru incelen parıltılar
      const sp = Math.hypot(m.vx, m.vy) || 1;
      const ux = -m.vx / sp;
      const uy = -m.vy / sp;
      const L = m.r * (m.kind === MK.Boss ? 4.2 : 11);
      const hot = sprites.glow(col, true);
      for (let i = 1; i <= 14; i++) {
        const f = i / 14;
        const w = m.r * (1.5 - f * 1.2);
        const wob = Math.sin(time * 18 + i * 0.9) * m.r * 0.18 * f;
        const x = m.x + ux * L * f - uy * wob;
        const y = m.y + uy * L * f + ux * wob;
        g.globalAlpha = 0.5 * (1 - f) * vis;
        blit(g, i < 4 ? hot : glow, x - w, y - w, w * 2, w * 2);
      }
    }
    const hs = m.r * (m.kind === MK.Boss ? 4.4 : 5.2);
    g.globalAlpha = (m.friendly ? 0.75 : 0.55) * vis;
    blit(g, glow, m.x - hs / 2, m.y - hs / 2, hs, hs);
  }

  // 2) gövdeler
  g.globalCompositeOperation = 'source-over';
  for (const m of list) {
    if (!m.active) continue;
    const def = KINDS[m.kind];
    const spr = sprites.meteor(def.key, m.kind === MK.Boss ? m.bossType : m.variant, m.armor > 0);
    const scale = (m.r / (m.kind === MK.Boss ? METEOR_R * 2 : METEOR_R)) * k;
    const c = Math.cos(m.rot) * scale;
    const s = Math.sin(m.rot) * scale;
    g.globalAlpha = 1 - m.fade * 0.85;
    g.setTransform(c, s, -s, c, tx + m.x * k, ty + m.y * k);
    g.drawImage(spr, -spr.width / 2, -spr.height / 2);
  }
  g.globalAlpha = 1;
  g.setTransform(k, 0, 0, k, tx, ty);

  // 3) sıcak ön kenar, dost parıltısı, vuruş flaşı
  g.globalCompositeOperation = 'lighter';
  for (const m of list) {
    if (!m.active) continue;
    const vis = 1 - m.fade * 0.8;
    const sp = Math.hypot(m.vx, m.vy) || 1;
    const hx = m.x + (m.vx / sp) * m.r * 0.55;
    const hy = m.y + (m.vy / sp) * m.r * 0.55;
    const col = m.glowColor(inkColor);
    const hs = m.r * 2.2;
    g.globalAlpha = 0.85 * vis;
    blit(g, sprites.glow(col, true), hx - hs / 2, hy - hs / 2, hs, hs);
    if (m.friendly) {
      g.globalAlpha = 0.55;
      const fs = m.r * 2.6;
      blit(g, sprites.glow(inkColor), m.x - fs / 2, m.y - fs / 2, fs, fs);
    } else if (m.kind === MK.Nova) {
      // kalp atışı gibi büyüyen çekirdek: patlamaya hazır
      const beat = Math.pow(Math.max(0, Math.sin(time * 7 + m.swayPh)), 6);
      g.globalAlpha = 0.45 + beat * 0.5;
      const cs = m.r * (1.6 + beat * 1.2);
      blit(g, sprites.glow('#FF9FEA', true), m.x - cs / 2, m.y - cs / 2, cs, cs);
    } else if (m.kind === MK.Ice) {
      g.globalAlpha = 0.5 + Math.sin(time * 5 + m.swayPh) * 0.3;
      const ss = m.r * 2.8;
      blit(g, sprites.sparkle, m.x - ss / 2 - m.r * 0.25, m.y - ss / 2 - m.r * 0.3, ss, ss);
    } else if (m.kind === MK.Blink) {
      // ışınlanma uyarısı: gövde titrer, varış noktasında dönen halka belirir
      if (m.blinkT > 0) {
        const p = 1 - m.blinkT / BLINK_WARN;
        g.globalAlpha = 0.5 + 0.5 * Math.sin(time * 40);
        const rs = m.r * (3.4 - p * 1.2);
        blit(g, sprites.ring, m.x - rs / 2, m.y - rs / 2, rs, rs);
        g.globalAlpha = 0.35 + 0.55 * p;
        const ds = m.r * (1.6 + p * 1.8);
        blit(g, sprites.ring, m.blinkX - ds / 2, m.y - ds / 2, ds, ds);
        blit(g, sprites.glow(col), m.blinkX - ds / 2, m.y - ds / 2, ds, ds);
      } else {
        g.globalAlpha = 0.3 + 0.2 * Math.sin(time * 6 + m.swayPh);
        const rs = m.r * 2.6;
        blit(g, sprites.ring, m.x - rs / 2, m.y - rs / 2, rs, rs);
      }
    } else if (m.kind === MK.Flare) {
      // titreyen alev hâlesi
      const f = 0.5 + 0.5 * Math.sin(time * 23 + m.swayPh) * Math.sin(time * 9);
      g.globalAlpha = 0.45 + f * 0.35;
      const cs = m.r * (2.3 + f * 0.6);
      blit(g, sprites.glow('#FFE07A', true), m.x - cs / 2, m.y - cs / 2 - m.r * 0.2, cs, cs);
    } else if (m.kind === MK.Prism) {
      // dönen gökkuşağı pırıltıları
      for (let i = 0; i < 3; i++) {
        const a = time * 2.4 + (i / 3) * TAU + m.swayPh;
        g.globalAlpha = 0.75;
        const ss = m.r * 1.5;
        blit(g, sprites.glow(PRISM_COLS[i], true), m.x + Math.cos(a) * m.r * 1.1 - ss / 2, m.y + Math.sin(a) * m.r * 1.1 - ss / 2, ss, ss);
      }
    } else if (m.kind === MK.Mender) {
      g.globalAlpha = 0.5 + 0.4 * Math.sin(time * 4 + m.swayPh);
      const ss = m.r * 3;
      blit(g, sprites.sparkle, m.x - ss / 2, m.y - ss / 2, ss, ss);
    } else if (m.kind === MK.Phantom && m.fade > 0.05) {
      // saydamken titreyen hayalet halkası: yeri belli olsun
      g.globalAlpha = m.fade * (0.35 + 0.25 * Math.sin(time * 20));
      const rs = m.r * 3.2;
      blit(g, sprites.ring, m.x - rs / 2, m.y - rs / 2, rs, rs);
    }
    if (m.kind === MK.Golden) {
      g.globalAlpha = 0.6 + Math.sin(time * 9 + m.swayPh) * 0.4;
      const ss = m.r * 3.4;
      blit(g, sprites.sparkle, m.x - ss / 2 + m.r * 0.3, m.y - ss / 2 - m.r * 0.3, ss, ss);
    }
    if (m.slowT > 0 && !m.friendly) {
      g.globalAlpha = Math.min(1, m.slowT) * 0.55;
      const fs = m.r * 2.6;
      blit(g, sprites.glow('#BFF6FF'), m.x - fs / 2, m.y - fs / 2, fs, fs);
    }
    if (m.kind === MK.Boss) renderBossFx(g, m, sprites, time);
    if (m.flash > 0) {
      g.globalAlpha = Math.min(1, m.flash * 3);
      const fs = m.r * 3;
      blit(g, sprites.glow('#FFFFFF', true), m.x - fs / 2, m.y - fs / 2, fs, fs);
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/** Işınlanma uyarı süresi (sn) */
export const BLINK_WARN = 0.42;
/** Prizma pırıltı renkleri (gökkuşağı üçlüsü) */
export const PRISM_COLS = ['#FF5C8A', '#FFE14D', '#4DD8FF'] as const;

/** Buz Kalesi kristallerinin dünya konumu */
export function shieldPos(m: Meteor, i: number, time: number): [number, number] {
  const a = time * 1.5 + (i / 3) * TAU;
  const R = m.r + 62;
  return [m.x + Math.cos(a) * R, m.y + Math.sin(a) * R * 0.72];
}

/** Boss türüne özel ışıltılar (additive modda çağrılır) */
function renderBossFx(g: CanvasRenderingContext2D, m: Meteor, sprites: Sprites, time: number): void {
  const col = BOSS_COLORS[m.bossType] ?? BOSS_COLORS[0];
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  switch (m.bossType) {
    case BT.Titan: {
      g.globalAlpha = 0.35 + pulse * 0.35;
      const cs = m.r * (1.2 + pulse * 0.3);
      blit(g, sprites.glow('#FF7A4F', true), m.x - cs / 2, m.y - cs / 2, cs, cs);
      break;
    }
    case BT.Queen: {
      // taç: başın üstünde dönen yıldız sivrileri
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.42;
        const x = m.x + Math.cos(a) * m.r * 1.05;
        const y = m.y + Math.sin(a) * m.r * 1.05;
        g.globalAlpha = 0.6 + 0.4 * Math.sin(time * 6 + i);
        const ss = m.r * (i === 2 ? 1.3 : 0.9);
        blit(g, sprites.sparkle, x - ss / 2, y - ss / 2, ss, ss);
      }
      break;
    }
    case BT.Frost: {
      for (let i = 0; i < 3; i++) {
        if (!((m.shields >> i) & 1)) continue;
        const [x, y] = shieldPos(m, i, time);
        g.globalAlpha = 0.85;
        const gs = 96;
        blit(g, sprites.glow(col), x - gs / 2, y - gs / 2, gs, gs);
        // kristal gövdesi opak çizilir (net görünsün), sonra ışıma moduna dönülür
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        const cs = 50;
        const spr = sprites.meteor('ice', i, false);
        g.save();
        g.translate(x, y);
        g.rotate(time * 1.2 + i);
        g.drawImage(spr, -cs / 2, -cs / 2, cs, cs);
        g.restore();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.35;
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(m.x, m.y);
        g.lineTo(x, y);
        g.stroke();
      }
      break;
    }
    case BT.Singularity: {
      // dönen emme diski
      for (let i = 0; i < 10; i++) {
        const a = time * 2.2 + (i / 10) * TAU;
        const R = m.r * (1.3 + 0.25 * Math.sin(time * 3 + i));
        g.globalAlpha = 0.35;
        const s = m.r * 0.7;
        blit(g, sprites.glow(col), m.x + Math.cos(a) * R - s / 2, m.y + Math.sin(a) * R * 0.5 - s / 2, s, s);
      }
      if (m.pulseT < 0) {
        // nabız uyarısı: büyüyen halka
        const p = 1 + m.pulseT;
        g.globalAlpha = 0.35 + 0.65 * (1 - p);
        const rs = m.r * 2 + p * 420;
        blit(g, sprites.ring, m.x - rs / 2, m.y - rs / 2, rs, rs);
      }
      break;
    }
    case BT.Twins: {
      g.globalAlpha = 0.4 + pulse * 0.4;
      const cs = m.r * (1.4 + pulse * 0.3);
      blit(g, sprites.glow('#FFE07A', true), m.x - cs / 2, m.y - cs / 2, cs, cs);
      break;
    }
  }
}

/** Boss can halkası */
export function renderBossRing(g: CanvasRenderingContext2D, m: Meteor, time: number): void {
  const frac = Math.max(0, m.hp / m.maxHp);
  const col = BOSS_COLORS[m.bossType] ?? BOSS_COLORS[0];
  const R = m.r + 16;
  g.lineCap = 'round';
  g.globalAlpha = 0.35;
  g.strokeStyle = '#2a0f1a';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(m.x, m.y, R, 0, TAU);
  g.stroke();
  g.globalAlpha = 0.95;
  g.strokeStyle = frac < 0.35 ? (Math.sin(time * 14) > 0 ? '#FFFFFF' : col) : col;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(m.x, m.y, R, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
  g.stroke();
  g.globalAlpha = 1;
}
