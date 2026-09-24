import { TAU, hexToRgb } from '../core/math';
import { Rng } from '../core/rng';
import { METEOR_COLORS } from './palette';

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

  /** Meteor gövdesi (türe göre 3 varyant). R = sprite yarıçapı piksel. */
  meteor(kind: keyof typeof METEOR_COLORS, variant: number, armor = false): Canvas {
    const cache = armor ? this.armored : this.meteors;
    let list = cache.get(kind);
    if (!list) {
      list = [];
      for (let v = 0; v < 3; v++) list.push(drawMeteor(kind, v, armor));
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
  const glowCol = METEOR_COLORS[kind];
  const [gr, gg, gb] = hexToRgb(glowCol);

  // Düzensiz kaya dış hattı
  const n = kind === 'fast' ? 7 : 16;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.12, 0.12);
    const rr = R * (kind === 'fast' ? rng.range(0.8, 1) : rng.range(0.86, 1));
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
    light = '#8b3a3a';
    dark = '#1a0708';
  } else if (kind === 'splitter') {
    light = '#7a6250';
    dark = '#1c120b';
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

  if (kind === 'fast') {
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
