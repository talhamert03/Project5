import { clamp, easeInCubic, easeOutBack } from '../core/math';
import { Rng } from '../core/rng';
import { type Canvas, type Sprites, ctx2d, makeCanvas } from '../render/sprites';
import { WORLD_W, type View } from '../render/view';

export const BLOCKS = 5;
export const BLOCK_W = WORLD_W / BLOCKS;
/** Blok sprite yüksekliği (dünya birimi) */
const SPR_H = 230;
/** Çatı hizası: meteorun şehre çarptığı yükseklik (H'den yukarı) */
export const ROOF_Y = 128;

interface House {
  x: number;
  w: number;
  h: number;
  roof: number;
  wall: string;
  roofCol: string;
  floors: number;
  cumba: boolean;
  chimney: number;
  lit: boolean[];
}

export interface Block {
  i: number;
  hp: number;
  maxHp: number;
  houses: House[];
  sprHealthy: Canvas | null;
  sprDamaged: Canvas | null;
  sprRubble: Canvas | null;
  collapseT: number;
  repairT: number;
  flash: number;
  fireT: number;
  wobble: number;
}

const WALLS = ['#6A4B63', '#4C5A7D', '#7A5C4A', '#4A6A66', '#7B4A50', '#5A4E80', '#6B6045', '#40587A'];
const ROOFS = ['#4B2530', '#532A26', '#3E2440', '#5A302A'];

/**
 * Yakın plan: beş mahalle, her biri cumbalı İstanbul evlerinden oluşur.
 * Her mahallenin 2 canı var; yıkılınca enkaza döner, "Onarım" ile yeniden yükselir.
 */
export class City {
  blocks: Block[] = [];
  domeCharges = 0;
  domeFlash = 0;
  private t = 0;

  constructor(
    private view: View,
    private sprites: Sprites,
  ) {
    const rng = new Rng(1453);
    for (let b = 0; b < BLOCKS; b++) {
      const houses: House[] = [];
      let x = 2;
      while (x < BLOCK_W - 20) {
        const w = Math.min(rng.range(40, 56), BLOCK_W - x - 2);
        if (w < 26) break;
        const floors = rng.int(2, 3);
        houses.push({
          x,
          w,
          h: floors * 34 + rng.range(4, 14),
          roof: rng.int(0, 2),
          wall: rng.pick(WALLS),
          roofCol: rng.pick(ROOFS),
          floors,
          cumba: rng.chance(0.65),
          chimney: rng.chance(0.6) ? rng.range(0.2, 0.75) : -1,
          lit: Array.from({ length: 12 }, () => rng.chance(0.7)),
        });
        x += w - 1;
      }
      this.blocks.push({
        i: b,
        hp: 2,
        maxHp: 2,
        houses,
        sprHealthy: null,
        sprDamaged: null,
        sprRubble: null,
        collapseT: -1,
        repairT: -1,
        flash: 0,
        fireT: 0,
        wobble: 0,
      });
    }
    view.onResize(() => this.build());
    this.build();
  }

  reset(): void {
    for (const b of this.blocks) {
      b.hp = b.maxHp;
      b.collapseT = -1;
      b.repairT = -1;
      b.flash = 0;
      b.wobble = 0;
    }
    this.domeCharges = 0;
    this.domeFlash = 0;
  }

  get alive(): number {
    let n = 0;
    for (const b of this.blocks) if (b.hp > 0) n++;
    return n;
  }

  get totalHp(): number {
    let n = 0;
    for (const b of this.blocks) n += b.hp;
    return n;
  }

  roofY(): number {
    return this.view.H - ROOF_Y;
  }

  blockAt(x: number): number {
    return clamp(Math.floor(x / BLOCK_W), 0, BLOCKS - 1);
  }

  /** Yıkık bloğa düşen hasar en yakın ayaktaki bloğa sıçrar */
  targetBlock(x: number): number {
    const i = this.blockAt(x);
    if (this.blocks[i].hp > 0) return i;
    let best = -1;
    let bd = 99;
    for (const b of this.blocks) {
      if (b.hp > 0 && Math.abs(b.i - i) < bd) {
        bd = Math.abs(b.i - i);
        best = b.i;
      }
    }
    return best;
  }

  private tint = '#FFFFFF';
  private glowCol = '#FFB45A';

  /** Atmosfer ışığı: evler çarpma (multiply) tonuyla yeniden boyanır */
  /** renk tonuna göre hazır ev görselleri (dünya geçişinde yeniden çizilmesin) */
  private sets = new Map<string, Canvas[][]>();

  setAtmosphere(tint: string, glow: string): void {
    if (tint === this.tint && glow === this.glowCol) return;
    this.tint = tint;
    this.glowCol = glow;
    this.apply();
  }

  /** Sıradaki dünyanın evlerini önceden hazırla */
  prebuild(tint: string): void {
    this.setFor(tint);
  }

  private build(): void {
    this.sets.clear();
    this.apply();
  }

  private setFor(tint: string): Canvas[][] {
    let set = this.sets.get(tint);
    if (!set) {
      const k = this.view.scale * this.view.dpr;
      set = this.blocks.map((b) => [0, 1, 2].map((st) => this.toned(this.drawBlock(b, k, st), tint)));
      this.sets.set(tint, set);
      // bellek: en fazla 3 ton
      for (const key of this.sets.keys()) {
        if (this.sets.size <= 3) break;
        if (key !== tint && key !== this.tint) this.sets.delete(key);
      }
    }
    return set;
  }

  private apply(): void {
    const set = this.setFor(this.tint);
    this.blocks.forEach((b, i) => {
      [b.sprHealthy, b.sprDamaged, b.sprRubble] = set[i];
    });
  }

  private toned(c: Canvas, tint: string): Canvas {
    if (tint === '#FFFFFF') return c;
    const copy = makeCanvas(c.width, c.height);
    ctx2d(copy).drawImage(c, 0, 0);
    const g = ctx2d(c);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
    // saydam alanları geri al
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(copy, 0, 0);
    g.restore();
    return c;
  }

  /** state: 0 sağlam, 1 hasarlı, 2 enkaz */
  private drawBlock(b: Block, k: number, state: number): Canvas {
    const c = makeCanvas(BLOCK_W * k + 2, SPR_H * k);
    const g = ctx2d(c);
    g.scale(k, k);
    const base = SPR_H - 40; // ev tabanı (altı ekran dışına taşar)
    const rng = new Rng(b.i * 97 + state * 13 + 5);

    if (state === 2) {
      // Enkaz yığını
      g.fillStyle = '#1B1430';
      g.beginPath();
      g.moveTo(0, SPR_H);
      let x = 0;
      while (x <= BLOCK_W) {
        g.lineTo(x, base - rng.range(8, 40));
        x += rng.range(8, 16);
      }
      g.lineTo(BLOCK_W, SPR_H);
      g.closePath();
      g.fill();
      // kırık duvar kalıntıları
      for (let i = 0; i < 3; i++) {
        const wx = rng.range(10, BLOCK_W - 30);
        const wh = rng.range(24, 60);
        g.fillStyle = '#2A2140';
        g.beginPath();
        g.moveTo(wx, base);
        g.lineTo(wx, base - wh);
        g.lineTo(wx + 8, base - wh + rng.range(6, 16));
        g.lineTo(wx + 16, base - wh * 0.5);
        g.lineTo(wx + 18, base);
        g.fill();
      }
      // kor parçaları
      for (let i = 0; i < 14; i++) {
        const ex = rng.range(4, BLOCK_W - 4);
        const ey = base - rng.range(0, 26);
        const grad = g.createRadialGradient(ex, ey, 0, ex, ey, 6);
        grad.addColorStop(0, 'rgba(255,140,60,0.9)');
        grad.addColorStop(1, 'rgba(255,80,30,0)');
        g.fillStyle = grad;
        g.fillRect(ex - 6, ey - 6, 12, 12);
      }
      g.fillStyle = '#120D24';
      g.fillRect(0, base, BLOCK_W, SPR_H - base);
      return c;
    }

    for (const h of b.houses) {
      const top = base - h.h;
      // duvar
      const wg = g.createLinearGradient(0, top, 0, base);
      wg.addColorStop(0, h.wall);
      wg.addColorStop(1, shade(h.wall, -0.45));
      g.fillStyle = wg;
      g.fillRect(h.x, top, h.w, h.h + 40);
      // ay ışığı kenarı (sağ)
      g.fillStyle = 'rgba(200,210,255,0.08)';
      g.fillRect(h.x + h.w - 3, top, 3, h.h);
      // kat silmeleri
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let f = 1; f < h.floors; f++) g.fillRect(h.x, base - f * 34, h.w, 2);

      // pencereler
      const cols = h.w > 46 ? 3 : 2;
      let wi = 0;
      for (let f = 0; f < h.floors; f++) {
        for (let cI = 0; cI < cols; cI++) {
          const wx = h.x + (h.w / cols) * (cI + 0.5) - 4;
          const wy = base - f * 34 - 26;
          let lit = h.lit[wi++ % h.lit.length];
          if (state === 1 && rng.chance(0.55)) lit = false;
          g.fillStyle = '#16142C';
          g.fillRect(wx - 1, wy - 1, 10, 17);
          if (lit) {
            const lg = g.createLinearGradient(0, wy, 0, wy + 15);
            lg.addColorStop(0, '#FFE2A0');
            lg.addColorStop(1, '#FFB04A');
            g.fillStyle = lg;
          } else {
            g.fillStyle = '#23203F';
          }
          g.fillRect(wx, wy, 8, 15);
          g.fillStyle = 'rgba(40,20,20,0.7)';
          g.fillRect(wx + 3.5, wy, 1, 15);
          g.fillRect(wx, wy + 6, 8, 1);
        }
      }

      // cumba (çıkma)
      if (h.cumba && h.floors >= 2) {
        const cy = base - 34 * (h.floors - 1) - 30;
        const cx0 = h.x + h.w * 0.16;
        const cw = h.w * 0.68;
        g.fillStyle = shade(h.wall, 0.12);
        g.fillRect(cx0 - 3, cy, cw + 6, 30);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(cx0 - 3, cy + 30, cw + 6, 3);
        g.beginPath();
        g.moveTo(cx0 - 3, cy + 33);
        g.lineTo(cx0 + 4, cy + 40);
        g.lineTo(cx0 + cw - 4, cy + 40);
        g.lineTo(cx0 + cw + 3, cy + 33);
        g.fillStyle = shade(h.wall, -0.3);
        g.fill();
        const n = 3;
        for (let i = 0; i < n; i++) {
          const wx = cx0 + 3 + i * ((cw - 6) / n);
          const ww = (cw - 6) / n - 3;
          const lit = state === 0 ? h.lit[(i + 5) % h.lit.length] : rng.chance(0.3);
          g.fillStyle = lit ? '#FFCB6E' : '#23203F';
          g.fillRect(wx, cy + 6, ww, 17);
        }
        g.fillStyle = h.roofCol;
        g.fillRect(cx0 - 5, cy - 3, cw + 10, 4);
      }

      // çatı
      g.fillStyle = h.roofCol;
      g.beginPath();
      if (h.roof === 0) {
        g.moveTo(h.x - 4, top);
        g.lineTo(h.x + h.w / 2, top - 22);
        g.lineTo(h.x + h.w + 4, top);
      } else if (h.roof === 1) {
        g.moveTo(h.x - 4, top);
        g.lineTo(h.x + h.w * 0.25, top - 16);
        g.lineTo(h.x + h.w * 0.75, top - 16);
        g.lineTo(h.x + h.w + 4, top);
      } else {
        g.rect(h.x - 2, top - 6, h.w + 4, 6);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,190,160,0.12)';
      g.lineWidth = 1;
      g.stroke();
      if (h.chimney > 0) {
        const chx = h.x + h.w * h.chimney;
        g.fillStyle = shade(h.roofCol, -0.2);
        g.fillRect(chx, top - 26, 7, 18);
      }
    }

    if (state === 1) {
      // yanık izleri + çatı kırıkları
      g.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 4; i++) {
        const sx = rng.range(10, BLOCK_W - 10);
        const sy = base - rng.range(40, 120);
        const r = rng.range(18, 34);
        const grad = g.createRadialGradient(sx, sy, 0, sx, sy, r);
        grad.addColorStop(0, 'rgba(10,6,14,0.85)');
        grad.addColorStop(1, 'rgba(10,6,14,0)');
        g.fillStyle = grad;
        g.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 2; i++) {
        const sx = rng.range(20, BLOCK_W - 20);
        const sy = base - 140 + rng.range(-10, 30);
        g.beginPath();
        g.moveTo(sx - 16, sy - 30);
        g.lineTo(sx + 14, sy - 30);
        g.lineTo(sx + 6, sy + 10);
        g.lineTo(sx - 2, sy + 2);
        g.lineTo(sx - 10, sy + 14);
        g.closePath();
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    return c;
  }

  update(dt: number, emitFire: (x: number, y: number, rubble: boolean) => void): void {
    this.t += dt;
    this.domeFlash = Math.max(0, this.domeFlash - dt * 2);
    for (const b of this.blocks) {
      b.flash = Math.max(0, b.flash - dt * 2.5);
      b.wobble = Math.max(0, b.wobble - dt * 2);
      if (b.collapseT >= 0) {
        b.collapseT += dt;
        if (b.collapseT > 0.9) b.collapseT = -1;
      }
      if (b.repairT >= 0) {
        b.repairT += dt;
        if (b.repairT > 1) b.repairT = -1;
      }
      if (b.hp < b.maxHp) {
        b.fireT -= dt;
        if (b.fireT <= 0) {
          const rubble = b.hp <= 0;
          b.fireT = rubble ? 0.12 : 0.045;
          const x = b.i * BLOCK_W + 10 + Math.random() * (BLOCK_W - 20);
          const y = this.view.H - (rubble ? 60 : 110 + Math.random() * 50);
          emitFire(x, y, rubble);
        }
      }
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const H = this.view.H;
    const top = H - SPR_H + 40;
    for (const b of this.blocks) {
      const x = b.i * BLOCK_W;
      const jitter = b.wobble > 0 ? Math.sin(this.t * 60) * b.wobble * 4 : 0;
      if (b.collapseT >= 0) {
        // Çöküş: bina yere gömülür, üstünde enkaz belirir
        const p = clamp(b.collapseT / 0.8, 0, 1);
        const sink = easeInCubic(p) * 150;
        g.save();
        g.beginPath();
        g.rect(x - 4, top - 60, BLOCK_W + 8, SPR_H + 60);
        g.clip();
        if (b.sprDamaged) g.drawImage(b.sprDamaged, x + Math.sin(this.t * 50) * 4 * (1 - p), top + sink, BLOCK_W + 0.5, SPR_H);
        g.restore();
        g.globalAlpha = p;
        if (b.sprRubble) g.drawImage(b.sprRubble, x, top, BLOCK_W + 0.5, SPR_H);
        g.globalAlpha = 1;
        continue;
      }
      if (b.repairT >= 0) {
        const p = clamp(b.repairT, 0, 1);
        const rise = (1 - easeOutBack(p)) * 160;
        g.globalAlpha = 1 - p;
        if (b.sprRubble) g.drawImage(b.sprRubble, x, top, BLOCK_W + 0.5, SPR_H);
        g.globalAlpha = 1;
        g.save();
        g.beginPath();
        g.rect(x - 4, top - 60, BLOCK_W + 8, SPR_H + 60);
        g.clip();
        if (b.sprHealthy) g.drawImage(b.sprHealthy, x, top + rise, BLOCK_W + 0.5, SPR_H);
        g.restore();
        continue;
      }
      const spr = b.hp >= b.maxHp ? b.sprHealthy : b.hp > 0 ? b.sprDamaged : b.sprRubble;
      if (spr) g.drawImage(spr, x + jitter, top, BLOCK_W + 0.5, SPR_H);
    }

    // Pencere ışımaları ve vuruş flaşları
    g.globalCompositeOperation = 'lighter';
    for (const b of this.blocks) {
      if (b.hp > 0 && b.collapseT < 0) {
        const x = b.i * BLOCK_W + BLOCK_W / 2;
        const pulse = 0.08 + 0.03 * Math.sin(this.t * 1.7 + b.i * 2);
        g.globalAlpha = (b.hp >= b.maxHp ? 1 : 0.5) * pulse;
        const s = BLOCK_W * 2.2;
        g.drawImage(this.sprites.glow(this.glowCol), x - s / 2, H - 150 - s / 2, s, s);
      }
      if (b.flash > 0) {
        g.globalAlpha = b.flash;
        const s = BLOCK_W * 2.6;
        g.drawImage(this.sprites.glow('#FF5A3A', true), b.i * BLOCK_W + BLOCK_W / 2 - s / 2, H - 120 - s / 2, s, s);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** Kubbe kalkanı: şarj varken şehrin üstünde soluk bir yay */
  renderDome(g: CanvasRenderingContext2D, color: string): void {
    if (this.domeCharges <= 0 && this.domeFlash <= 0) return;
    const H = this.view.H;
    const cy = H + 420;
    const r = 640;
    g.globalCompositeOperation = 'lighter';
    const base = this.domeCharges > 0 ? 0.16 + 0.06 * Math.sin(this.t * 2.4) : 0;
    const a = Math.min(1, base + this.domeFlash);
    g.strokeStyle = color;
    g.globalAlpha = a * 0.35;
    g.lineWidth = 16;
    g.beginPath();
    g.arc(WORLD_W / 2, cy, r, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
    g.globalAlpha = a;
    g.lineWidth = 2.5;
    g.stroke();
    // şarj göstergeleri
    for (let i = 0; i < this.domeCharges; i++) {
      const ang = Math.PI * 1.5 + (i - (this.domeCharges - 1) / 2) * 0.05;
      const x = WORLD_W / 2 + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      g.globalAlpha = 0.9;
      g.drawImage(this.sprites.glow(color, true), x - 9, y - 9, 18, 18);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  domeY(x: number): number {
    const H = this.view.H;
    const cy = H + 420;
    const r = 640;
    const dx = x - WORLD_W / 2;
    return cy - Math.sqrt(Math.max(0, r * r - dx * dx));
  }
}

function shade(hex: string, amt: number): string {
  const v = parseInt(hex.slice(1), 16);
  let r = (v >> 16) & 255;
  let g = (v >> 8) & 255;
  let b = v & 255;
  if (amt < 0) {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  } else {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

