import { Rng } from '../core/rng';

/**
 * Şehir kostümleri: korunan beş mahallenin görünümü. İstanbul varsayılandır (city.ts içindeki
 * cumbalı evler); diğerleri burada çizilir. Her kostüm yalnızca görünüştür, oyunu değiştirmez.
 * Çizimler blok başına bir kez sprite'a basılır (oyun sırasında maliyeti yoktur).
 */
export interface CitySkin {
  id: string;
  /** altın fiyatı (0: ücretsiz) */
  price: number;
  /** Başlangıç Paketi ile de açılır */
  starter?: boolean;
  /** kart vurgu rengi */
  accent: string;
}

export const CITY_SKINS: CitySkin[] = [
  { id: 'istanbul', price: 0, accent: '#FFB45A' },
  { id: 'tokyo', price: 3000, accent: '#FF4FA0' },
  { id: 'paris', price: 3000, accent: '#FFC870' },
  { id: 'losangeles', price: 3500, accent: '#FF8A5C' },
  { id: 'newyork', price: 4500, accent: '#FFD27A' },
  { id: 'dubai', price: 5000, accent: '#5CC8FF' },
  { id: 'moon', price: 9000, starter: true, accent: '#3EF0E0' },
];

export const CITY_SKIN_BY_ID = new Map(CITY_SKINS.map((s) => [s.id, s]));

/** blok genişliği (dünya birimi) ve ev tabanı (sprite içinde) */
const W = 144;

type G = CanvasRenderingContext2D;
/** hasarlı halde pencere sönük mü */
type Off = () => boolean;

export type SkinPainter = (g: G, bi: number, base: number, off: Off) => void;

export function shade(hex: string, amt: number): string {
  const v = parseInt(hex.slice(1), 16);
  let r = (v >> 16) & 255;
  let gg = (v >> 8) & 255;
  let b = v & 255;
  if (amt < 0) {
    r *= 1 + amt;
    gg *= 1 + amt;
    b *= 1 + amt;
  } else {
    r += (255 - r) * amt;
    gg += (255 - gg) * amt;
    b += (255 - b) * amt;
  }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

function wall(g: G, x: number, top: number, w: number, base: number, col: string, dark = -0.5): void {
  const wg = g.createLinearGradient(0, top, 0, base);
  wg.addColorStop(0, col);
  wg.addColorStop(1, shade(col, dark));
  g.fillStyle = wg;
  g.fillRect(x, top, w, base - top + 40);
  // ay ışığı kenarı
  g.fillStyle = 'rgba(200,210,255,0.08)';
  g.fillRect(x + w - 2, top, 2, base - top);
}

/** pencere ızgarası */
function grid(
  g: G,
  x: number,
  top: number,
  w: number,
  base: number,
  o: { cw: number; ch: number; ww: number; wh: number; pad?: number; lit: number; warm?: string; cool?: string; dim?: string },
  rng: Rng,
  off: Off,
): void {
  const pad = o.pad ?? 3;
  const cols = Math.max(1, Math.floor((w - pad * 2 + (o.cw - o.ww)) / o.cw));
  const rows = Math.max(1, Math.floor((base - top - pad - 6) / o.ch));
  const x0 = x + (w - (cols * o.cw - (o.cw - o.ww))) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x0 + c * o.cw;
      const wy = top + pad + 2 + r * o.ch;
      let lit = rng.chance(o.lit);
      if (lit && off()) lit = false;
      g.fillStyle = lit ? (o.cool && rng.chance(0.45) ? o.cool : (o.warm ?? '#FFD58A')) : (o.dim ?? '#1E1C38');
      g.fillRect(wx, wy, o.ww, o.wh);
    }
  }
}

// ───────────────────────── TOKYO ─────────────────────────

const TOKYO_WALLS = ['#3A4260', '#2E3550', '#4A3F5C', '#36485A', '#43405E'];
const NEON = ['#FF4FA0', '#3EF0E0', '#FFD84A', '#7CFF8A', '#B57BFF'];

function neonSign(g: G, x: number, y: number, w: number, h: number, col: string, rng: Rng): void {
  g.fillStyle = col;
  g.globalAlpha = 0.25;
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.globalAlpha = 1;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(20,10,30,0.55)';
  // yazı benzeri işaretler
  if (h > w) {
    for (let yy = y + 3; yy < y + h - 4; yy += 6) g.fillRect(x + 1.5, yy, w - 3, rng.range(1.5, 3));
  } else {
    for (let xx = x + 3; xx < x + w - 4; xx += 6) g.fillRect(xx, y + 1.5, rng.range(1.5, 3), h - 3);
  }
}

function tokyoTower(g: G, cx: number, base: number, off: Off): void {
  const top = 14;
  const red = '#E0473A';
  const white = '#E8E2E6';
  // ayaklar
  g.fillStyle = red;
  g.beginPath();
  g.moveTo(cx - 30, base);
  g.quadraticCurveTo(cx - 12, base - 70, cx - 4, base - 140);
  g.lineTo(cx + 4, base - 140);
  g.quadraticCurveTo(cx + 12, base - 70, cx + 30, base);
  g.lineTo(cx + 20, base);
  g.quadraticCurveTo(cx + 6, base - 60, cx, base - 100);
  g.quadraticCurveTo(cx - 6, base - 60, cx - 20, base);
  g.closePath();
  g.fill();
  // kafes çaprazları
  g.strokeStyle = 'rgba(255,220,210,0.35)';
  g.lineWidth = 0.8;
  for (let i = 0; i < 9; i++) {
    const y1 = base - 10 - i * 14;
    const half = 26 - i * 2.6;
    g.beginPath();
    g.moveTo(cx - half, y1);
    g.lineTo(cx + half - 2.6, y1 - 14);
    g.moveTo(cx + half, y1);
    g.lineTo(cx - half + 2.6, y1 - 14);
    g.stroke();
  }
  // beyaz bantlar
  g.fillStyle = white;
  g.fillRect(cx - 9, base - 112, 18, 4);
  g.fillRect(cx - 5, base - 150, 10, 3);
  // seyir terasları
  g.fillStyle = '#C23A30';
  g.fillRect(cx - 14, base - 84, 28, 8);
  g.fillRect(cx - 7, base - 132, 14, 6);
  g.fillStyle = off() ? '#3A2030' : '#FFE2A0';
  g.fillRect(cx - 12, base - 82, 24, 3);
  g.fillRect(cx - 5, base - 130, 10, 2);
  // anten
  g.fillStyle = red;
  g.fillRect(cx - 2.5, base - 160, 5, 22);
  g.fillStyle = white;
  g.fillRect(cx - 1, top, 2, base - 160 - top);
  g.fillStyle = '#FF5A4A';
  g.fillRect(cx - 1.5, top - 2, 3, 3);
}

const tokyo: SkinPainter = (g, bi, base, off) => {
  const rng = new Rng(7000 + bi * 31);
  const tower = bi === 2;
  if (tower) tokyoTower(g, W / 2, base, off);
  let x = 1;
  while (x < W - 14) {
    const w = Math.min(rng.range(22, 36), W - x - 1);
    if (w < 14) break;
    // kulenin önündeki binalar alçak
    const nearTower = tower && x + w > W / 2 - 34 && x < W / 2 + 34;
    const h = nearTower ? rng.range(34, 54) : rng.range(70, 122);
    const top = base - h;
    wall(g, x, top, w, base, rng.pick(TOKYO_WALLS));
    grid(g, x, top, w, base, { cw: 6, ch: 8, ww: 3.5, wh: 4.5, lit: 0.6, warm: '#FFD9A0', cool: '#D8ECFF', dim: '#1B1A33' }, rng, off);
    // çatı: anten / su deposu
    g.fillStyle = '#23263C';
    if (rng.chance(0.5)) g.fillRect(x + w * 0.3, top - 7, w * 0.35, 7);
    else g.fillRect(x + w * 0.6, top - 14, 1.5, 14);
    // dikey neon tabela
    if (!nearTower && rng.chance(0.75)) {
      const sh = rng.range(24, 44);
      neonSign(g, x + (rng.chance(0.5) ? 1 : w - 7), top + rng.range(8, 20), 6, sh, rng.pick(NEON), rng);
    }
    // yatay tabela (alt katlar)
    if (rng.chance(0.5)) neonSign(g, x + 3, base - rng.range(24, 40), w - 6, 6, rng.pick(NEON), rng);
    x += w + rng.range(0, 2);
  }
};

// ───────────────────────── PARİS ─────────────────────────

const PARIS_WALLS = ['#CDBB9A', '#BFAE8C', '#D6C6A5', '#C4B08E'];

function eiffel(g: G, cx: number, base: number): void {
  const col = '#5A4632';
  const top = 6;
  const hTot = base - top;
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(cx - 44, base);
  g.quadraticCurveTo(cx - 18, base - hTot * 0.35, cx - 6, base - hTot * 0.72);
  g.lineTo(cx - 2, base - hTot * 0.93);
  g.lineTo(cx, top);
  g.lineTo(cx + 2, base - hTot * 0.93);
  g.lineTo(cx + 6, base - hTot * 0.72);
  g.quadraticCurveTo(cx + 18, base - hTot * 0.35, cx + 44, base);
  g.lineTo(cx + 30, base);
  g.quadraticCurveTo(cx, base - 70, cx - 30, base);
  g.closePath();
  g.fill();
  // kafes dokusu
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(255,214,150,0.28)';
  g.lineWidth = 0.7;
  for (let y = base; y > top; y -= 6) {
    g.beginPath();
    g.moveTo(cx - 50, y);
    g.lineTo(cx + 50, y - 6);
    g.moveTo(cx + 50, y);
    g.lineTo(cx - 50, y - 6);
    g.stroke();
  }
  g.restore();
  // platformlar
  g.fillStyle = shade(col, -0.25);
  g.fillRect(cx - 24, base - 58, 48, 5);
  g.fillRect(cx - 11, base - hTot * 0.55, 22, 4);
  // ışıklar
  g.fillStyle = '#FFC870';
  for (let i = 0; i < 9; i++) {
    const y = base - 60 - i * 12;
    const half = Math.max(1.5, 20 - i * 2.2);
    g.fillRect(cx - half, y, 1.6, 1.6);
    g.fillRect(cx + half - 1.6, y, 1.6, 1.6);
  }
  g.fillRect(cx - 1, top - 1, 2, 3);
}

const paris: SkinPainter = (g, bi, base, off) => {
  const rng = new Rng(8100 + bi * 37);
  const tower = bi === 2;
  if (tower) eiffel(g, W / 2, base);
  let x = 1;
  while (x < W - 20) {
    const w = Math.min(rng.range(36, 52), W - x - 1);
    if (w < 22) break;
    const nearTower = tower && x + w > W / 2 - 30 && x < W / 2 + 30;
    const floors = nearTower ? 2 : rng.int(5, 6);
    const fh = 16;
    const h = floors * fh + 8;
    const top = base - h;
    const col = rng.pick(PARIS_WALLS);
    wall(g, x, top, w, base, col, -0.62);
    // katlar ve uzun Fransız pencereleri
    const cols = Math.max(2, Math.floor((w - 6) / 10));
    const x0 = x + (w - cols * 10 + 4) / 2;
    for (let f = 0; f < floors; f++) {
      const wy = base - (f + 1) * fh + 3;
      for (let c = 0; c < cols; c++) {
        const wx = x0 + c * 10;
        let lit = f === 0 ? rng.chance(0.85) : rng.chance(0.55);
        if (lit && off()) lit = false;
        g.fillStyle = lit ? (f === 0 ? '#FFC36A' : '#FFDDA0') : '#2A2438';
        g.fillRect(wx, wy, 6, 11);
      }
      // ferforje balkon (2. ve son kat)
      if (f === 1 || f === floors - 1) {
        g.fillStyle = 'rgba(30,24,30,0.85)';
        g.fillRect(x + 1, wy + 8, w - 2, 1.2);
        for (let bx = x + 2; bx < x + w - 1; bx += 2.5) g.fillRect(bx, wy + 8, 0.6, 3.5);
      }
    }
    // zemin kat: kafe tentesi
    g.fillStyle = rng.pick(['#7A2F35', '#2F4A6A', '#3C5A3A']);
    g.fillRect(x + 2, base - fh + 1, w - 4, 3);
    // mansart çatı ve çatı pencereleri
    const mh = 13;
    g.fillStyle = '#3E4A5E';
    g.beginPath();
    g.moveTo(x - 1, top);
    g.lineTo(x + 4, top - mh);
    g.lineTo(x + w - 4, top - mh);
    g.lineTo(x + w + 1, top);
    g.closePath();
    g.fill();
    g.fillStyle = '#56637A';
    g.fillRect(x - 1, top - 1, w + 2, 2);
    for (let c = 0; c < cols; c += 2) {
      const dx = x0 + c * 10;
      g.fillStyle = '#4A566C';
      g.fillRect(dx - 1, top - mh + 3, 8, 8);
      g.fillStyle = !off() && rng.chance(0.5) ? '#FFD58A' : '#232035';
      g.fillRect(dx + 1, top - mh + 5, 4, 5);
    }
    // bacalar
    g.fillStyle = '#6A5A50';
    g.fillRect(x + w * 0.22, top - mh - 6, 5, 7);
    g.fillRect(x + w * 0.7, top - mh - 5, 4, 6);
    x += w - 1;
  }
};

// ───────────────────────── LOS ANGELES ─────────────────────────

const LA_WALLS = ['#C98A6B', '#D9A47A', '#8FA9B8', '#B88AA0', '#D8B98A', '#9C8FB8'];

function palm(g: G, x: number, base: number, h: number, lean: number): void {
  g.strokeStyle = '#3A2C2A';
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  const tx = x + lean;
  const ty = base - h;
  g.beginPath();
  g.moveTo(x, base);
  g.quadraticCurveTo(x + lean * 0.2, base - h * 0.5, tx, ty);
  g.stroke();
  // yapraklar
  g.strokeStyle = '#24402F';
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.5;
    const len = 13 + (i % 2) * 3;
    const ex = tx + Math.cos(a) * len * 1.3;
    const ey = ty + Math.sin(a) * len * 0.55 + 6;
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.cos(a) * len * 0.7, ty + Math.sin(a) * len * 0.8 - 3, ex, ey);
    g.stroke();
  }
  g.fillStyle = '#3B2A22';
  g.beginPath();
  g.arc(tx, ty + 1, 2.4, 0, Math.PI * 2);
  g.fill();
  g.lineCap = 'butt';
}

function observatory(g: G, cx: number, base: number, off: Off): void {
  // tepe
  g.fillStyle = '#2C2A3E';
  g.beginPath();
  g.moveTo(0, base);
  g.quadraticCurveTo(cx, base - 92, W, base);
  g.fill();
  const y = base - 64;
  g.fillStyle = '#D9CDBA';
  g.fillRect(cx - 30, y - 14, 60, 16);
  // kubbeler
  g.fillStyle = '#7D8C90';
  for (const [dx, r] of [
    [-24, 7],
    [0, 13],
    [24, 7],
  ]) {
    g.beginPath();
    g.arc(cx + dx, y - 14, r, Math.PI, 0);
    g.fill();
  }
  g.fillStyle = off() ? '#2A2438' : '#FFD58A';
  for (let i = -3; i <= 3; i++) g.fillRect(cx + i * 7 - 1.5, y - 10, 3, 6);
}

const losangeles: SkinPainter = (g, bi, base, off) => {
  const rng = new Rng(9200 + bi * 41);
  if (bi === 2) observatory(g, W / 2, base, off);
  const glass = bi === 1 || bi === 3;
  let x = 1;
  const palms: number[] = [];
  let tallDone = false;
  while (x < W - 16) {
    const tall = glass && !tallDone && x > 30 && x < 90;
    if (tall) tallDone = true;
    const w = Math.min(tall ? rng.range(28, 34) : rng.range(30, 46), W - x - 1);
    if (w < 16) break;
    const h = tall ? rng.range(108, 122) : bi === 2 ? rng.range(26, 38) : rng.range(50, 84);
    const top = base - h;
    if (tall) {
      wall(g, x, top, w, base, '#3B4E6E', -0.4);
      grid(g, x, top, w, base, { cw: 5, ch: 6, ww: 4, wh: 3.5, pad: 2, lit: 0.55, warm: '#BFE6FF', cool: '#FFE3B0', dim: '#22314A' }, rng, off);
      g.fillStyle = '#56709A';
      g.fillRect(x - 1, top - 3, w + 2, 3);
    } else {
      const col = rng.pick(LA_WALLS);
      wall(g, x, top, w, base, col, -0.55);
      // parapet
      g.fillStyle = shade(col, 0.15);
      g.fillRect(x - 1, top - 3, w + 2, 3);
      // geniş pencereler
      const rows = Math.max(1, Math.floor((h - 18) / 14));
      for (let r = 0; r < rows; r++) {
        for (let wx = x + 4; wx < x + w - 10; wx += 12) {
          let lit = rng.chance(0.6);
          if (lit && off()) lit = false;
          g.fillStyle = lit ? '#FFD69A' : '#2A2540';
          g.fillRect(wx, top + 6 + r * 14, 9, 7);
        }
      }
      // vitrin
      g.fillStyle = off() ? '#2A2540' : '#FFB86A';
      g.fillRect(x + 3, base - 12, w - 6, 8);
      if (rng.chance(0.5)) {
        g.fillStyle = rng.pick(['#FF4FA0', '#3EF0E0', '#FFD84A']);
        g.fillRect(x + 5, base - 18, w * 0.5, 3);
      }
    }
    if (!tall && rng.chance(0.6) && x + w < W - 6) palms.push(x + w);
    x += w + rng.range(1, 6);
  }
  for (const px of palms) palm(g, px, base, rng.range(78, 112), rng.range(-8, 8));
};

// ───────────────────────── NEW YORK ─────────────────────────

const NY_WALLS = ['#7A4636', '#5C3B33', '#6B5A4E', '#4E4B5C', '#6A4A44'];

function waterTower(g: G, x: number, top: number): void {
  g.fillStyle = '#2A2228';
  g.fillRect(x, top - 6, 1, 6);
  g.fillRect(x + 8, top - 6, 1, 6);
  g.fillStyle = '#5A4234';
  g.fillRect(x - 1, top - 15, 11, 9);
  g.beginPath();
  g.moveTo(x - 1, top - 15);
  g.lineTo(x + 4.5, top - 20);
  g.lineTo(x + 10, top - 15);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x - 1, top - 12, 11, 1);
}

function empireState(g: G, cx: number, base: number, off: Off): void {
  const col = '#6E6A78';
  const steps: Array<[number, number]> = [
    [30, 104],
    [22, 124],
    [15, 142],
    [8, 156],
    [4, 166],
  ];
  for (const [half, h] of steps) {
    wall(g, cx - half, base - h, half * 2, base, col, -0.5);
  }
  // art deco dikey ışık şeritleri
  for (const [half, h] of steps.slice(0, 3)) {
    for (let x = cx - half + 3; x < cx + half - 2; x += 4) {
      g.fillStyle = off() ? 'rgba(40,36,60,0.8)' : 'rgba(255,214,140,0.55)';
      g.fillRect(x, base - h + 4, 1.2, h - 8 - (h - 104));
    }
  }
  // taç ışığı + iğne
  g.fillStyle = '#FFD27A';
  g.fillRect(cx - 8, base - 154, 16, 3);
  g.fillRect(cx - 4, base - 165, 8, 2);
  g.fillStyle = '#B8B4C0';
  g.fillRect(cx - 1, base - 186, 2, 20);
  g.fillStyle = '#FF5A4A';
  g.fillRect(cx - 1.2, base - 188, 2.4, 2.4);
}

const newyork: SkinPainter = (g, bi, base, off) => {
  const rng = new Rng(9900 + bi * 43);
  const landmark = bi === 2;
  let x = 1;
  const towers: Array<[number, number]> = [];
  while (x < W - 14) {
    const w = Math.min(rng.range(24, 36), W - x - 1);
    if (w < 14) break;
    if (landmark && x + w > W / 2 - 32 && x < W / 2 + 32) {
      x = W / 2 + 32;
      continue;
    }
    const h = rng.range(92, 124);
    const top = base - h;
    const col = rng.pick(NY_WALLS);
    wall(g, x, top, w, base, col, -0.55);
    grid(g, x, top, w, base, { cw: 6, ch: 8, ww: 3.5, wh: 5, lit: 0.55, warm: '#FFD08A', dim: '#221C2C' }, rng, off);
    // korniş
    g.fillStyle = shade(col, -0.35);
    g.fillRect(x - 1, top - 2, w + 2, 3);
    // yangın merdiveni
    if (rng.chance(0.5)) {
      g.strokeStyle = 'rgba(20,16,24,0.85)';
      g.lineWidth = 0.8;
      g.beginPath();
      const fx = x + 2;
      for (let y = top + 10; y < base - 10; y += 10) {
        g.moveTo(fx, y);
        g.lineTo(fx + 8, y);
        g.moveTo(fx, y);
        g.lineTo(fx + 8, y + 10);
      }
      g.stroke();
    }
    if (rng.chance(0.55)) towers.push([x + w * rng.range(0.2, 0.6), top]);
    x += w + rng.range(0, 2);
  }
  if (landmark) empireState(g, W / 2, base, off);
  for (const [tx, ty] of towers) waterTower(g, tx, ty);
};

// ───────────────────────── DUBAİ ─────────────────────────

function burj(g: G, cx: number, base: number, off: Off): void {
  const segs: Array<[number, number]> = [
    [16, 70],
    [12, 112],
    [9, 140],
    [6, 160],
    [3.5, 174],
  ];
  for (const [half, h] of segs) wall(g, cx - half, base - h, half * 2, base, '#5A7090', -0.45);
  // dikey cam şeritleri
  for (const [half, h] of segs.slice(0, 4)) {
    g.fillStyle = off() ? 'rgba(30,40,70,0.7)' : 'rgba(190,230,255,0.45)';
    g.fillRect(cx - half + 2, base - h + 3, 1.2, h - 6);
    g.fillRect(cx + half - 3.2, base - h + 3, 1.2, h - 6);
  }
  g.fillStyle = '#C8D6E8';
  g.beginPath();
  g.moveTo(cx - 2, base - 174);
  g.lineTo(cx, base - 189);
  g.lineTo(cx + 2, base - 174);
  g.fill();
  g.fillStyle = '#FF5A4A';
  g.fillRect(cx - 1, base - 190, 2, 2);
}

function sail(g: G, x: number, base: number, off: Off): void {
  g.fillStyle = '#C9D4E2';
  g.beginPath();
  g.moveTo(x, base);
  g.lineTo(x, base - 134);
  g.quadraticCurveTo(x + 40, base - 70, x + 36, base);
  g.closePath();
  g.fill();
  g.fillStyle = '#7C8EA8';
  g.fillRect(x - 2, base - 140, 3, 140);
  g.strokeStyle = 'rgba(80,100,140,0.6)';
  g.lineWidth = 0.8;
  for (let y = base - 120; y < base; y += 12) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 8 + (y - base + 134) * 0.2, y);
    g.stroke();
  }
  g.fillStyle = off() ? '#3A4058' : '#8FE0FF';
  g.fillRect(x + 1, base - 136, 2, 6);
}

const dubai: SkinPainter = (g, bi, base, off) => {
  const rng = new Rng(10400 + bi * 47);
  if (bi === 2) burj(g, W / 2, base, off);
  if (bi === 4) sail(g, W * 0.62, base, off);
  let x = 1;
  while (x < W - 14) {
    const glass = rng.chance(0.5);
    const w = Math.min(glass ? rng.range(18, 26) : rng.range(28, 40), W - x - 1);
    if (w < 14) break;
    const blocked = (bi === 2 && x + w > W / 2 - 20 && x < W / 2 + 20) || (bi === 4 && x + w > W * 0.6 && x < W * 0.62 + 38);
    if (blocked) {
      x += w;
      continue;
    }
    if (glass) {
      const h = rng.range(96, 124);
      const top = base - h;
      wall(g, x, top, w, base, rng.pick(['#2E4560', '#3A5578', '#2F5468']), -0.4);
      grid(g, x, top, w, base, { cw: 4, ch: 6, ww: 3, wh: 4, pad: 2, lit: 0.5, warm: '#BFE6FF', cool: '#FFE3B0', dim: '#1C2A40' }, rng, off);
      // eğik tepe
      g.fillStyle = '#4A6A90';
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + w, top - rng.range(4, 14));
      g.lineTo(x + w, top);
      g.fill();
    } else {
      const h = rng.range(36, 60);
      const top = base - h;
      const col = rng.pick(['#C9A77A', '#B8956A', '#D4B88E']);
      wall(g, x, top, w, base, col, -0.6);
      // kemerli pencereler
      for (let wx = x + 4; wx < x + w - 6; wx += 9) {
        for (let wy = top + 8; wy < base - 10; wy += 14) {
          let lit = rng.chance(0.6);
          if (lit && off()) lit = false;
          g.fillStyle = lit ? '#FFD08A' : '#2A2238';
          g.beginPath();
          g.moveTo(wx, wy + 9);
          g.lineTo(wx, wy + 3);
          g.arc(wx + 2.5, wy + 3, 2.5, Math.PI, 0);
          g.lineTo(wx + 5, wy + 9);
          g.fill();
        }
      }
      g.fillStyle = shade(col, 0.2);
      g.fillRect(x - 1, top - 2, w + 2, 2);
    }
    x += w + rng.range(0, 3);
  }
};

// ───────────────────────── AY KOLONİSİ ─────────────────────────

function dome(g: G, cx: number, base: number, r: number, off: Off): void {
  // iç ışık
  const ig = g.createRadialGradient(cx, base - r * 0.3, 1, cx, base, r);
  ig.addColorStop(0, off() ? 'rgba(60,80,110,0.6)' : 'rgba(150,255,240,0.75)');
  ig.addColorStop(1, 'rgba(40,90,140,0.35)');
  g.fillStyle = ig;
  g.beginPath();
  g.arc(cx, base, r, Math.PI, 0);
  g.fill();
  // kafes
  g.strokeStyle = 'rgba(210,240,255,0.55)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, base, r, Math.PI, 0);
  g.stroke();
  g.lineWidth = 0.6;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.ellipse(cx, base, r * (i / 4), r, 0, Math.PI, 0);
    g.stroke();
  }
  for (let i = 1; i < 3; i++) {
    const y = base - r * (i / 3);
    const half = Math.sqrt(r * r - (base - y) ** 2);
    g.beginPath();
    g.moveTo(cx - half, y);
    g.lineTo(cx + half, y);
    g.stroke();
  }
  // içerdeki bitkiler / binalar
  g.fillStyle = 'rgba(40,120,90,0.55)';
  g.beginPath();
  g.arc(cx - r * 0.3, base, r * 0.32, Math.PI, 0);
  g.arc(cx + r * 0.25, base, r * 0.26, Math.PI, 0);
  g.fill();
}

const moon: SkinPainter = (g, bi, base, off) => {
  const rng = new Rng(11300 + bi * 53);
  // regolit zemin
  g.fillStyle = '#4A4A5C';
  g.beginPath();
  g.moveTo(0, base + 40);
  g.lineTo(0, base - 6);
  for (let x = 0; x <= W; x += 12) g.lineTo(x, base - 6 - rng.range(0, 6));
  g.lineTo(W, base + 40);
  g.fill();
  if (bi === 2) {
    // iletişim kulesi + büyük kubbe
    g.fillStyle = '#8A93A8';
    g.fillRect(W / 2 + 36, base - 150, 4, 150);
    g.strokeStyle = '#8A93A8';
    g.lineWidth = 0.8;
    g.beginPath();
    for (let y = base; y > base - 150; y -= 10) {
      g.moveTo(W / 2 + 32, y);
      g.lineTo(W / 2 + 44, y - 10);
    }
    g.stroke();
    g.fillStyle = '#C4CCDA';
    g.beginPath();
    g.ellipse(W / 2 + 38, base - 150, 12, 5, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#FF4A5A';
    g.fillRect(W / 2 + 37, base - 160, 2.4, 2.4);
    dome(g, W / 2 - 8, base, 48, off);
    return;
  }
  // yüksek kuleler + anten (arkada)
  for (let i = 0; i < 2; i++) {
    const tx = i === 0 ? rng.range(6, W / 2 - 24) : rng.range(W / 2 + 6, W - 24);
    const th = rng.range(86, 124);
    const tw = rng.range(16, 22);
    wall(g, tx, base - th, tw, base, '#7A8298', -0.5);
    grid(g, tx, base - th, tw, base, { cw: 5, ch: 9, ww: 3, wh: 4, lit: 0.6, warm: '#8FF0FF', dim: '#2A3048' }, rng, off);
    g.fillStyle = '#9AA3B8';
    g.fillRect(tx - 2, base - th - 3, tw + 4, 3);
    g.fillRect(tx + tw / 2, base - th - 24, 1.5, 22);
    g.fillStyle = '#FF4A5A';
    g.fillRect(tx + tw / 2 - 0.5, base - th - 26, 2.5, 2.5);
  }
  // kubbeler
  const domes = rng.int(2, 3);
  for (let i = 0; i < domes; i++) dome(g, ((i + 0.5) / domes) * W + rng.range(-10, 10), base, rng.range(24, 36), off);
  // modüller (ayaklar üstünde yatay kapsüller)
  const mods = rng.int(1, 2);
  for (let i = 0; i < mods; i++) {
    const mx = rng.range(4, W - 60);
    const mw = rng.range(40, 56);
    const mh = rng.range(16, 22);
    const top = base - mh - rng.range(30, 62);
    // ayaklar
    g.fillStyle = '#5A6074';
    g.fillRect(mx + 6, top + mh, 3, base - top - mh);
    g.fillRect(mx + mw - 9, top + mh, 3, base - top - mh);
    const mg = g.createLinearGradient(0, top, 0, top + mh);
    mg.addColorStop(0, '#D4DAE6');
    mg.addColorStop(1, '#6A7288');
    g.fillStyle = mg;
    // kapsül (roundRect eski WebView'larda yok)
    const rr = mh / 2;
    g.beginPath();
    g.arc(mx + rr, top + rr, rr, Math.PI / 2, Math.PI * 1.5);
    g.arc(mx + mw - rr, top + rr, rr, -Math.PI / 2, Math.PI / 2);
    g.closePath();
    g.fill();
    for (let wx = mx + 8; wx < mx + mw - 8; wx += 8) {
      g.fillStyle = off() ? '#2A3048' : '#8FF0FF';
      g.beginPath();
      g.arc(wx, top + mh / 2, 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  // güneş paneli
  if (rng.chance(0.7)) {
    const px = rng.range(8, W - 40);
    g.fillStyle = '#5A6074';
    g.fillRect(px + 14, base - 26, 2, 26);
    g.fillStyle = '#2C3E78';
    g.fillRect(px, base - 34, 30, 9);
    g.strokeStyle = 'rgba(140,180,255,0.6)';
    g.lineWidth = 0.6;
    g.beginPath();
    for (let i = 1; i < 5; i++) {
      g.moveTo(px + i * 6, base - 34);
      g.lineTo(px + i * 6, base - 25);
    }
    g.stroke();
  }
};

/** İstanbul city.ts içinde çizilir (cumbalı evler) */
export const SKIN_PAINTERS: Record<string, SkinPainter> = { tokyo, paris, losangeles, newyork, dubai, moon };
