import { TAU, hexToRgb } from '../core/math';
import { Rng } from '../core/rng';
import { BOSS_COLORS, METEOR_COLORS } from './palette';

export type Canvas = HTMLCanvasElement;

export function makeCanvas(w: number, h: number): Canvas {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: Canvas): CanvasRenderingContext2D {
  return c.getContext('2d')!;
}

const GLOW_SIZE = 64;

/**
 * Önceden çizilmiş sprite önbelleği. Oyun sırasında shadowBlur / gradient üretmek yerine
 * hazır parıltı görselleri additive modda basılır: mobil GPU için en ucuz "neon" yöntemi.
 */
export class Sprites {
  private glows = new Map<string, Canvas>();
  private hotGlows = new Map<string, Canvas>();
  private meteors = new Map<string, Canvas[]>();
  private armored = new Map<string, Canvas[]>();
  readonly smoke: Canvas;
  readonly sparkle: Canvas;
  readonly vignette: Canvas;
  readonly ring: Canvas;

  constructor() {
    this.smoke = this.makeSmoke();
    this.sparkle = this.makeSparkle();
    this.vignette = this.makeVignette();
    this.ring = this.makeRing();
  }

  /** Radyal parıltı; hot=true ise merkezi beyaz-sıcak */
  glow(color: string, hot = false): Canvas {
    // sıcak yolda metin birleştirme yok: iki ayrı önbellek (karede yüzlerce çağrı)
    const cache = hot ? this.hotGlows : this.glows;
    let c = cache.get(color);
    if (c) return c;
    c = makeCanvas(GLOW_SIZE, GLOW_SIZE);
    const g = ctx2d(c);
    const [r, gg, b] = hexToRgb(color);
    const h = GLOW_SIZE / 2;
    const grad = g.createRadialGradient(h, h, 0, h, h, h);
    if (hot) {
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.14, `rgba(${Math.min(255, r + 120)},${Math.min(255, gg + 120)},${Math.min(255, b + 120)},0.95)`);
      grad.addColorStop(0.32, `rgba(${r},${gg},${b},0.55)`);
    } else {
      grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
      grad.addColorStop(0.2, `rgba(${r},${gg},${b},0.7)`);
      grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.22)`);
    }
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    cache.set(color, c);
    return c;
  }

  private makeSmoke(): Canvas {
    const c = makeCanvas(64, 64);
    const g = ctx2d(c);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(40,34,60,0.55)');
    grad.addColorStop(0.5, 'rgba(30,26,48,0.28)');
    grad.addColorStop(1, 'rgba(20,18,36,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  /** Dört köşeli ışık yıldızı (altın, kusursuz dalga, kıvılcım) */
  private makeSparkle(): Canvas {
    const s = 96;
    const c = makeCanvas(s, s);
    const g = ctx2d(c);
    g.globalCompositeOperation = 'lighter';
    const h = s / 2;
    const ray = (w: number, len: number, rot: number): void => {
      g.save();
      g.translate(h, h);
      g.rotate(rot);
      const grad = g.createLinearGradient(-len, 0, len, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(0, 0, len, w, 0, 0, TAU);
      g.fill();
      g.restore();
    };
    ray(3.2, h, 0);
    ray(3.2, h, Math.PI / 2);
    ray(1.6, h * 0.55, Math.PI / 4);
    ray(1.6, h * 0.55, -Math.PI / 4);
    const grad = g.createRadialGradient(h, h, 0, h, h, h * 0.35);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  }

  private makeVignette(color = '#000000'): Canvas {
    const c = makeCanvas(256, 256);
    const g = ctx2d(c);
    const [r, gg, b] = hexToRgb(color);
    const grad = g.createRadialGradient(128, 128, 60, 128, 128, 182);
    grad.addColorStop(0, `rgba(${r},${gg},${b},0)`);
    grad.addColorStop(0.6, `rgba(${r},${gg},${b},0.35)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},1)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return c;
  }

  private tinted = new Map<string, Canvas>();

  /** Renkli kenar karartması (hasar: kırmızı, ağır çekim: mürekkep rengi) */
  vignetteOf(color: string): Canvas {
    let c = this.tinted.get(color);
    if (!c) {
      c = this.makeVignette(color);
      this.tinted.set(color, c);
    }
    return c;
  }

  private makeRing(): Canvas {
    const s = 128;
    const c = makeCanvas(s, s);
    const g = ctx2d(c);
    const grad = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.72, 'rgba(255,255,255,0.0)');
    grad.addColorStop(0.86, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  }

  /** Tüm meteor görsellerini önceden hazırlayan adımlar (ilk görünüşte takılma olmasın) */
  warmSteps(): Array<() => void> {
    const keys = Object.keys(METEOR_COLORS) as Array<keyof typeof METEOR_COLORS>;
    const steps: Array<() => void> = keys.map((k) => () => {
      this.meteor(k, 0);
      this.glow(METEOR_COLORS[k]);
      this.glow(METEOR_COLORS[k], true);
    });
    steps.push(() => this.meteor('heavy', 0, true));
    return steps;
  }

  /** Meteor gövdesi (türe göre 3 varyant). R = sprite yarıçapı piksel. */
  meteor(kind: keyof typeof METEOR_COLORS, variant: number, armor = false): Canvas {
    const cache = armor ? this.armored : this.meteors;
    let list = cache.get(kind);
    if (!list) {
      list = [];
      // boss: her tür ayrı görünüm (varyant = boss türü)
      const count = kind === 'boss' ? 5 : 3;
      for (let v = 0; v < count; v++) list.push(drawMeteor(kind, v, armor));
      cache.set(kind, list);
    }
    return list[variant % list.length];
  }
}

/** Sprite içindeki gövde yarıçapı (px). Çizimde r_dünya / METEOR_R ölçeklenir. */
export const METEOR_R = 48;

function drawMeteor(kind: keyof typeof METEOR_COLORS, variant: number, armor: boolean): Canvas {
  const R = kind === 'boss' ? METEOR_R * 2 : METEOR_R;
  const pad = R * 0.35;
  const size = (R + pad) * 2;
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const rng = new Rng(1234 + variant * 7919 + kind.length * 131 + (armor ? 17 : 0));
  const cx = size / 2;
  const cy = size / 2;
  const bossType = kind === 'boss' ? variant : -1;
  const glowCol = kind === 'boss' ? BOSS_COLORS[variant] : METEOR_COLORS[kind];
  const [gr, gg, gb] = hexToRgb(glowCol);
  const crystal = kind === 'ice' || bossType === 2;
  const smooth = kind === 'comet' || kind === 'phantom' || bossType === 3 || bossType === 4;

  // Dış hat: kaya (düzensiz), kristal (altıgen), pürüzsüz (kuyruklu yıldız, hayalet)
  const n = crystal ? 6 : kind === 'fast' ? 7 : smooth ? 20 : 16;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (crystal ? -Math.PI / 2 : rng.range(-0.12, 0.12));
    let rr: number;
    if (crystal) rr = R * (i % 2 ? 0.94 : 1.04);
    else if (kind === 'phantom') rr = R * (0.92 + 0.08 * Math.sin(a * 3) + (Math.sin(a) > 0.3 ? 0.06 * Math.sin(a * 9) : 0));
    else if (smooth) rr = R * rng.range(0.95, 1);
    else rr = R * (kind === 'fast' ? rng.range(0.8, 1) : rng.range(0.86, 1));
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  const outline = (): void => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  };

  // Gövde dolgusu
  let light = '#6d5a5a';
  let dark = '#1b1216';
  if (kind === 'fast') {
    light = '#e9fbff';
    dark = '#2b6f96';
  } else if (kind === 'heavy') {
    light = '#6b4f86';
    dark = '#140b22';
  } else if (kind === 'golden') {
    light = '#fff3b8';
    dark = '#a8660f';
  } else if (kind === 'boss') {
    const pal: Array<[string, string]> = [
      ['#8b3a3a', '#1a0708'],
      ['#e8fff8', '#16606a'],
      ['#f0fbff', '#2a5f8c'],
      ['#4a3470', '#05020c'],
      ['#ffe7a0', '#9a3a0a'],
    ];
    [light, dark] = pal[bossType] ?? pal[0];
  } else if (kind === 'splitter') {
    light = '#7a6250';
    dark = '#1c120b';
  } else if (kind === 'comet') {
    light = '#f4fffb';
    dark = '#1e8a78';
  } else if (kind === 'ice') {
    light = '#f2fcff';
    dark = '#3a78a8';
  } else if (kind === 'phantom') {
    light = '#d9c8ff';
    dark = '#3a2266';
  } else if (kind === 'nova') {
    light = '#c24aa0';
    dark = '#2a0624';
  }
  const body = g.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R * 1.05);
  body.addColorStop(0, light);
  body.addColorStop(1, dark);
  outline();
  g.fillStyle = body;
  g.fill();

  g.save();
  outline();
  g.clip();

  if (crystal) {
    // Altıgen kristal: merkezden kenarlara açık/koyu yüzeyler + iç parıltı
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? `rgba(255,255,255,${rng.range(0.18, 0.32)})` : `rgba(20,60,110,${rng.range(0.12, 0.25)})`;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(pts[i * 2], pts[i * 2 + 1]);
      g.lineTo(pts[((i + 1) % 6) * 2], pts[((i + 1) % 6) * 2 + 1]);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = R * 0.03;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(pts[i * 2], pts[i * 2 + 1]);
      g.stroke();
    }
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
    core.addColorStop(0, 'rgba(255,255,255,0.9)');
    core.addColorStop(1, 'rgba(200,240,255,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, size, size);
  } else if (kind === 'comet' || bossType === 1) {
    // Buzlu çekirdek: parlak yüzeyler ve içten gelen ışık
    for (let i = 0; i < 7; i++) {
      g.fillStyle = `rgba(255,255,255,${rng.range(0.08, 0.3)})`;
      g.beginPath();
      const a = rng.range(0, TAU);
      g.ellipse(cx + Math.cos(a) * R * 0.4, cy + Math.sin(a) * R * 0.4, R * rng.range(0.15, 0.35), R * rng.range(0.08, 0.18), a, 0, TAU);
      g.fill();
    }
    const core = g.createRadialGradient(cx - R * 0.15, cy - R * 0.15, 0, cx, cy, R * 0.8);
    core.addColorStop(0, 'rgba(255,255,255,0.85)');
    core.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    g.fillStyle = core;
    g.fillRect(0, 0, size, size);
  } else if (kind === 'phantom') {
    // Duman gibi iç bulutlar
    for (let i = 0; i < 8; i++) {
      const x = cx + rng.range(-R * 0.6, R * 0.6);
      const y = cy + rng.range(-R * 0.6, R * 0.6);
      const r = rng.range(R * 0.2, R * 0.45);
      const pg = g.createRadialGradient(x, y, 0, x, y, r);
      pg.addColorStop(0, 'rgba(255,240,255,0.22)');
      pg.addColorStop(1, 'rgba(255,240,255,0)');
      g.fillStyle = pg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (kind === 'nova' || bossType === 3 || bossType === 4) {
    // Parlayan çekirdek ve ondan yayılan ışık çatlakları
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
    const hot = bossType === 3 ? '200,150,255' : bossType === 4 ? '255,230,150' : '255,170,240';
    core.addColorStop(0, `rgba(${hot},0.95)`);
    core.addColorStop(1, `rgba(${hot},0)`);
    g.fillStyle = core;
    g.fillRect(0, 0, size, size);
    g.lineCap = 'round';
    const rays = bossType === 3 ? 7 : 9;
    for (let i = 0; i < rays; i++) {
      let a = (i / rays) * TAU + rng.range(-0.2, 0.2);
      let x = cx + Math.cos(a) * R * 0.3;
      let y = cy + Math.sin(a) * R * 0.3;
      const path = [x, y];
      for (let k2 = 0; k2 < 4; k2++) {
        // Tekillik: çatlaklar girdap gibi kıvrılır
        a += bossType === 3 ? 0.35 : rng.range(-0.5, 0.5);
        x += Math.cos(a) * R * 0.18;
        y += Math.sin(a) * R * 0.18;
        path.push(x, y);
      }
      for (const [w, al] of [
        [R * 0.12, 0.3],
        [R * 0.045, 0.95],
      ] as const) {
        g.strokeStyle = `rgba(${hot},${al})`;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(path[0], path[1]);
        for (let p = 2; p < path.length; p += 2) g.lineTo(path[p], path[p + 1]);
        g.stroke();
      }
    }
  } else if (kind === 'fast') {
    // Buz kristali yüzeyleri
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(255,255,255,${rng.range(0.05, 0.22)})`;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(pts[(i * 2) % pts.length], pts[(i * 2 + 1) % pts.length]);
      g.lineTo(pts[(i * 2 + 2) % pts.length], pts[(i * 2 + 3) % pts.length]);
      g.closePath();
      g.fill();
    }
  } else if (kind === 'golden') {
    // Parlak yüzey + yansıma
    const shine = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    shine.addColorStop(0.2, 'rgba(255,255,255,0)');
    shine.addColorStop(0.42, 'rgba(255,255,255,0.55)');
    shine.addColorStop(0.52, 'rgba(255,255,255,0)');
    g.fillStyle = shine;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i++) {
      const x = cx + rng.range(-R * 0.6, R * 0.6);
      const y = cy + rng.range(-R * 0.6, R * 0.6);
      const r = rng.range(R * 0.08, R * 0.18);
      g.fillStyle = 'rgba(140,80,10,0.35)';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  } else {
    // Kraterler
    const craters = kind === 'boss' ? 10 : 6;
    for (let i = 0; i < craters; i++) {
      const a = rng.range(0, TAU);
      const d = rng.range(0, R * 0.7);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      const r = rng.range(R * 0.08, R * 0.22);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,230,210,0.14)';
      g.lineWidth = Math.max(1, r * 0.22);
      g.beginPath();
      g.arc(x + r * 0.12, y + r * 0.12, r, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
    }
    // Erimiş çatlaklar
    const cracks = kind === 'boss' ? 9 : kind === 'splitter' ? 3 : 4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 0; i < cracks; i++) {
      let x: number;
      let y: number;
      let a: number;
      if (kind === 'splitter') {
        // Y şeklinde ikaz çatlağı: bölüneceğini belli eder
        x = cx;
        y = cy;
        a = (i / 3) * TAU - Math.PI / 2;
      } else {
        a = rng.range(0, TAU);
        x = cx + Math.cos(a) * rng.range(0, R * 0.5);
        y = cy + Math.sin(a) * rng.range(0, R * 0.5);
      }
      const segs = kind === 'splitter' ? 5 : rng.int(3, 5);
      const path: number[] = [x, y];
      for (let s = 0; s < segs; s++) {
        a += rng.range(-0.7, 0.7);
        const L = rng.range(R * 0.12, R * 0.26);
        x += Math.cos(a) * L;
        y += Math.sin(a) * L;
        path.push(x, y);
      }
      const strokeCrack = (w: number, col: string): void => {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(path[0], path[1]);
        for (let p = 2; p < path.length; p += 2) g.lineTo(path[p], path[p + 1]);
        g.stroke();
      };
      strokeCrack(R * 0.12, `rgba(${gr},${gg},${gb},0.35)`);
      strokeCrack(R * 0.05, `rgba(${Math.min(255, gr + 60)},${Math.min(255, gg + 80)},${Math.min(255, gb + 60)},0.95)`);
    }
  }

  // Alt taraf gölgesi (hacim)
  const shade = g.createRadialGradient(cx + R * 0.5, cy + R * 0.55, R * 0.2, cx + R * 0.3, cy + R * 0.3, R * 1.3);
  shade.addColorStop(0, 'rgba(0,0,0,0.5)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, size, size);
  g.restore();

  // Kenar ışığı
  outline();
  g.strokeStyle = `rgba(${gr},${gg},${gb},0.75)`;
  g.lineWidth = R * 0.06;
  g.stroke();

  // Sevimli yüzler: hayalet ve bosslar (kişilik katar)
  if (kind === 'phantom' || kind === 'boss') drawFace(g, cx, cy, R, kind === 'phantom' ? -1 : bossType);

  if (armor) {
    // Zırh plakaları: ağır meteor, ilk çarpmada kabuğunu kaybeder
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU + 0.08;
      const a1 = ((i + 1) / segs) * TAU - 0.08;
      g.beginPath();
      g.arc(cx, cy, R * 1.16, a0, a1);
      g.arc(cx, cy, R * 0.96, a1, a0, true);
      g.closePath();
      const pg = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      pg.addColorStop(0, '#9c86c2');
      pg.addColorStop(0.5, '#4a3a6a');
      pg.addColorStop(1, '#221838');
      g.fillStyle = pg;
      g.fill();
      g.strokeStyle = 'rgba(220,200,255,0.55)';
      g.lineWidth = R * 0.03;
      g.stroke();
      // perçin
      const am = (a0 + a1) / 2;
      g.fillStyle = 'rgba(255,240,255,0.7)';
      g.beginPath();
      g.arc(cx + Math.cos(am) * R * 1.06, cy + Math.sin(am) * R * 1.06, R * 0.035, 0, TAU);
      g.fill();
    }
  }
  return c;
}

/** Göz ve kaş: hayalet meraklı, bosslar kızgın/kendinden emin */
function drawFace(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, bossType: number): void {
  const ghost = bossType < 0;
  const ex = R * (ghost ? 0.3 : 0.32);
  const ey = cy - R * (ghost ? 0.05 : 0.08);
  const ew = R * (ghost ? 0.16 : 0.15);
  const eh = R * (ghost ? 0.22 : 0.12);
  const eyeCol = bossType === 3 ? '#E6CCFF' : bossType === 1 || bossType === 2 ? '#0E2A40' : '#FFF6E0';
  const pupil = bossType === 3 ? '#5A1AA0' : bossType === 1 || bossType === 2 ? '#BFFBFF' : '#1A0A10';
  for (const side of [-1, 1]) {
    const x = cx + side * ex;
    // göz akı
    g.fillStyle = eyeCol;
    g.beginPath();
    g.ellipse(x, ey, ew, eh, 0, 0, TAU);
    g.fill();
    // bebek + parıltı
    g.fillStyle = pupil;
    g.beginPath();
    g.ellipse(x + side * ew * 0.15, ey + eh * 0.2, ew * 0.55, eh * 0.62, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(x - ew * 0.25, ey - eh * 0.2, ew * 0.22, 0, TAU);
    g.fill();
    if (!ghost) {
      // kızgın kaş
      g.strokeStyle = bossType === 1 || bossType === 2 ? '#0E2A40' : 'rgba(20,6,10,0.9)';
      g.lineWidth = R * 0.07;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x - side * ew * 1.2, ey - eh * 1.9);
      g.lineTo(x + side * ew * 0.9, ey - eh * 1.1);
      g.stroke();
    }
  }
  if (ghost) {
    // küçük "o" ağız
    g.fillStyle = '#2a1848';
    g.beginPath();
    g.ellipse(cx, cy + R * 0.32, R * 0.09, R * 0.12, 0, 0, TAU);
    g.fill();
    // yanak pembeliği
    g.fillStyle = 'rgba(255,150,210,0.35)';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + side * R * 0.48, cy + R * 0.2, R * 0.12, R * 0.07, 0, 0, TAU);
      g.fill();
    }
  } else {
    // sırıtan ağız
    g.strokeStyle = bossType === 1 || bossType === 2 ? '#0E2A40' : 'rgba(20,6,10,0.85)';
    g.lineWidth = R * 0.05;
    g.beginPath();
    g.arc(cx, cy + R * 0.18, R * 0.24, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  }
}
