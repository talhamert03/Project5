import { TAU, clamp, lerp } from '../core/math';
import { Rng } from '../core/rng';
import { C } from './palette';
import { type Canvas, type Sprites, ctx2d, makeCanvas } from './sprites';
import { WORLD_W, type View } from './view';

/** Değer gürültüsü + fbm: ebru desenli bulutsu üretimi için */
function makeNoise(seed: number): (x: number, y: number) => number {
  const rng = new Rng(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rng.next();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const sm = (t: number): number => t * t * (3 - 2 * t);
  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const a = vals[perm[perm[X] + Y]];
    const b = vals[perm[perm[X + 1] + Y]];
    const c = vals[perm[perm[X] + Y + 1]];
    const d = vals[perm[perm[X + 1] + Y + 1]];
    const u = sm(xf);
    const v = sm(yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

function fbm(n: (x: number, y: number) => number, x: number, y: number): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    s += n(x * f, y * f) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s / 0.9375;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

interface Twinkle {
  x: number;
  y: number;
  s: number;
  ph: number;
  sp: number;
  col: number;
}

interface Shooting {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
}

/**
 * Gökyüzü katmanları: gradyan + ebru bulutsusu + yıldızlar + hilal (statik, önceden çizilir),
 * canlı: parıldayan yıldızlar, akan aurora ışıkları, kayan yıldızlar, uzak İstanbul silüeti.
 */
export class Background {
  private sky: Canvas | null = null;
  private skyline: Canvas | null = null;
  private skylineLights: Canvas | null = null;
  private skylineTop = 0;
  private twinkles: Twinkle[] = [];
  private shooting: Shooting[] = [];
  private shootTimer = 3;
  private t = 0;
  /** 0..1: şehir ışıklarının parlaklığı (mahalleler düştükçe azalır) */
  lights = 1;
  private lightsShown = 1;

  constructor(
    private view: View,
    private sprites: Sprites,
  ) {
    view.onResize(() => this.build());
    this.build();
  }

  build(): void {
    this.buildSky();
    this.buildSkyline();
    const rng = new Rng(77);
    this.twinkles = [];
    for (let i = 0; i < 46; i++) {
      this.twinkles.push({
        x: rng.range(-60, WORLD_W + 60),
        y: rng.range(-40, this.view.H * 0.62),
        s: rng.range(5, 13),
        ph: rng.range(0, TAU),
        sp: rng.range(0.6, 2.2),
        col: rng.int(0, 3),
      });
    }
  }

  private buildSky(): void {
    const v = this.view;
    const pw = v.canvas.width;
    const ph = v.canvas.height;
    const c = makeCanvas(pw, ph);
    const g = ctx2d(c);
    const k = v.scale * v.dpr;
    const oy = v.offY * v.dpr;
    const ox = v.offX * v.dpr;
    const H = v.H;

    // Dikey gradyan: dünya koordinatına bağlı (her cihazda ufuk aynı yerde)
    const top = oy;
    const bottom = oy + H * k;
    const grad = g.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, C.night);
    grad.addColorStop(0.4, C.lacivert);
    grad.addColorStop(0.68, C.deep);
    grad.addColorStop(0.84, C.dusk);
    grad.addColorStop(0.95, C.horizon);
    grad.addColorStop(1, '#7d3a55');
    g.fillStyle = grad;
    g.fillRect(0, 0, pw, ph);

    // Ebru bulutsusu (düşük çözünürlükte hesaplanıp yumuşakça büyütülür)
    const nw = 132;
    const nh = Math.round(nw * (H / WORLD_W));
    const neb = makeCanvas(nw, nh);
    const ng = ctx2d(neb);
    const img = ng.createImageData(nw, nh);
    const noise = makeNoise(4242);
    const d = img.data;
    for (let y = 0; y < nh; y++) {
      const vy = y / nh;
      const mask = smoothstep(0.0, 0.12, vy) * (1 - smoothstep(0.55, 0.82, vy));
      for (let x = 0; x < nw; x++) {
        const px = (x / nw) * 2.6;
        const py = vy * 2.6 * (H / WORLD_W);
        const qx = fbm(noise, px, py);
        const qy = fbm(noise, px + 5.2, py + 1.3);
        const rx = fbm(noise, px + 3.5 * qx + 1.7, py + 3.5 * qy + 9.2);
        const ry = fbm(noise, px + 3.5 * qx + 8.3, py + 3.5 * qy + 2.8);
        const f = fbm(noise, px + 3 * rx, py + 3 * ry);
        // ebru damarları: bükülmüş alan üzerinde ince sinüs bantları
        const band = Math.pow(0.5 + 0.5 * Math.sin((px * 1.4 + py * 0.5 + rx * 5.5) * 5.2), 6);
        const body = smoothstep(0.38, 0.78, f);
        const teal = smoothstep(0.55, 0.85, rx);
        let r = lerp(52, 30, teal) * body;
        let gg = lerp(30, 120, teal) * body;
        let b = lerp(120, 150, teal) * body;
        const vein = band * body * 0.9;
        r += 250 * vein * (1 - teal * 0.6);
        gg += 110 * vein + 90 * vein * teal;
        b += 150 * vein;
        const a = clamp((body * 0.55 + vein * 0.45) * mask, 0, 1);
        const i = (y * nw + x) * 4;
        d[i] = clamp(r, 0, 255);
        d[i + 1] = clamp(gg, 0, 255);
        d[i + 2] = clamp(b, 0, 255);
        d[i + 3] = a * 255;
      }
    }
    ng.putImageData(img, 0, 0);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.6;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // hafif taşma ile tüm genişliği kapla
    g.drawImage(neb, ox - 40 * k, oy - 20 * k, (WORLD_W + 80) * k, (H + 20) * k);
    g.restore();

    // Statik yıldızlar
    const rng = new Rng(99);
    const count = Math.round((pw * ph) / 5200);
    for (let i = 0; i < count; i++) {
      const x = rng.range(0, pw);
      const yN = Math.pow(rng.next(), 1.5);
      const y = top + yN * (H * 0.8) * k;
      const s = rng.range(0.35, 1.25) * v.dpr * (rng.chance(0.05) ? 1.8 : 1);
      const a = rng.range(0.25, 0.95) * (1 - yN * 0.6);
      const tint = rng.int(0, 5);
      g.fillStyle =
        tint === 0 ? `rgba(255,220,180,${a})` : tint === 1 ? `rgba(170,220,255,${a})` : `rgba(255,255,255,${a})`;
      g.beginPath();
      g.arc(x, y, s, 0, TAU);
      g.fill();
    }

    // Hilal ve hale
    const mx = ox + WORLD_W * 0.8 * k;
    const my = oy + H * 0.13 * k;
    const mr = 30 * k;
    const halo = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 6);
    halo.addColorStop(0, 'rgba(255,236,200,0.32)');
    halo.addColorStop(0.3, 'rgba(255,200,170,0.09)');
    halo.addColorStop(1, 'rgba(255,200,170,0)');
    g.fillStyle = halo;
    g.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
    const moon = makeCanvas(mr * 2.4, mr * 2.4);
    const mg = ctx2d(moon);
    const mc = mr * 1.2;
    const mgrad = mg.createRadialGradient(mc - mr * 0.3, mc - mr * 0.3, 0, mc, mc, mr);
    mgrad.addColorStop(0, '#FFFBEA');
    mgrad.addColorStop(1, '#F2D9A8');
    mg.fillStyle = mgrad;
    mg.beginPath();
    mg.arc(mc, mc, mr, 0, TAU);
    mg.fill();
    mg.globalCompositeOperation = 'destination-out';
    mg.beginPath();
    mg.arc(mc + mr * 0.42, mc - mr * 0.2, mr * 0.86, 0, TAU);
    mg.fill();
    g.drawImage(moon, mx - mc, my - mc);

    // Oyun alanı dışı (tablet/masaüstü) kenarları hafif karart
    if (v.letterboxed) {
      g.fillStyle = 'rgba(3,4,16,0.55)';
      if (ox > 0) {
        g.fillRect(0, 0, ox, ph);
        g.fillRect(ox + WORLD_W * k, 0, pw - (ox + WORLD_W * k), ph);
      }
      const edge = g.createLinearGradient(ox - 30 * k, 0, ox, 0);
      edge.addColorStop(0, 'rgba(62,240,224,0)');
      edge.addColorStop(1, 'rgba(62,240,224,0.12)');
      g.fillStyle = edge;
      if (ox > 0) g.fillRect(ox - 30 * k, 0, 30 * k, ph);
    }
    this.sky = c;
  }

  /** Uzak İstanbul silüeti: Galata Kulesi, kubbeler ve minareler (yıkılmaz, arka plan) */
  private buildSkyline(): void {
    const v = this.view;
    const k = v.scale * v.dpr;
    const LH = 440;
    const c = makeCanvas(WORLD_W * k, LH * k);
    const lights = makeCanvas(WORLD_W * k, LH * k);
    const g = ctx2d(c);
    const lg = ctx2d(lights);
    g.scale(k, k);
    lg.scale(k, k);
    const B = LH - 20; // taban çizgisi
    const rng = new Rng(2024);

    const p = new Path2D();
    // tepeler
    p.moveTo(0, B + 20);
    p.lineTo(0, B - 38);
    p.bezierCurveTo(60, B - 70, 140, B - 72, 200, B - 50);
    p.bezierCurveTo(260, B - 36, 300, B - 78, 380, B - 82);
    p.bezierCurveTo(470, B - 84, 520, B - 44, 580, B - 52);
    p.bezierCurveTo(640, B - 62, 690, B - 50, WORLD_W, B - 40);
    p.lineTo(WORLD_W, B + 20);
    p.closePath();

    const winSpots: Array<[number, number]> = [];
    const rect = (x: number, y: number, w: number, h: number, windows = true): void => {
      p.rect(x, y, w, h);
      if (windows) {
        const n = Math.floor((w * h) / 260);
        for (let i = 0; i < n; i++) winSpots.push([x + rng.range(3, w - 3), y + rng.range(4, h - 3)]);
      }
    };
    const dome = (cx: number, cy: number, r: number): void => {
      p.moveTo(cx - r, cy);
      p.arc(cx, cy, r, Math.PI, 0);
      p.closePath();
    };
    const minaret = (x: number, base: number, h: number): void => {
      const w = 7;
      p.rect(x - w / 2, base - h, w, h);
      p.rect(x - w, base - h * 0.62, w * 2, 4);
      p.rect(x - w * 0.85, base - h * 0.84, w * 1.7, 3.5);
      p.moveTo(x - w / 2 - 0.5, base - h);
      p.lineTo(x, base - h - 30);
      p.lineTo(x + w / 2 + 0.5, base - h);
      p.closePath();
      p.rect(x - 0.6, base - h - 38, 1.2, 9);
    };

    // Galata Kulesi
    const gx = 110;
    const gb = B - 64;
    p.moveTo(gx - 19, gb);
    p.lineTo(gx - 15, gb - 150);
    p.lineTo(gx + 15, gb - 150);
    p.lineTo(gx + 19, gb);
    p.closePath();
    p.rect(gx - 21, gb - 162, 42, 12);
    p.rect(gx - 15, gb - 186, 30, 24);
    p.moveTo(gx - 19, gb - 186);
    p.lineTo(gx, gb - 250);
    p.lineTo(gx + 19, gb - 186);
    p.closePath();
    p.rect(gx - 0.8, gb - 262, 1.6, 12);
    for (let i = 0; i < 5; i++) winSpots.push([gx - 11 + i * 5.5, gb - 172]);
    for (let i = 0; i < 6; i++) winSpots.push([gx + rng.range(-9, 9), gb - rng.range(20, 140)]);

    // Galata çevresi evler
    for (let x = 20; x < 190; x += rng.range(14, 22)) {
      if (Math.abs(x - gx) < 26) continue;
      const h = rng.range(26, 58);
      rect(x, B - 60 - h + 18, rng.range(12, 20), h);
    }

    // Büyük cami (merkez)
    const mx = 388;
    const mb = B - 80;
    rect(mx - 86, mb - 64, 172, 64, false);
    dome(mx - 52, mb - 64, 30);
    dome(mx + 52, mb - 64, 30);
    rect(mx - 38, mb - 92, 76, 28, false);
    dome(mx, mb - 92, 46);
    dome(mx - 74, mb - 64, 13);
    dome(mx + 74, mb - 64, 13);
    p.rect(mx - 0.8, mb - 150, 1.6, 14);
    minaret(mx - 104, mb + 4, 196);
    minaret(mx - 128, mb + 10, 164);
    minaret(mx + 104, mb + 4, 196);
    minaret(mx + 128, mb + 10, 164);
    for (let i = 0; i < 14; i++) winSpots.push([mx - 80 + i * 12, mb - 22]);
    for (let i = 0; i < 7; i++) winSpots.push([mx - 30 + i * 10, mb - 76]);

    // Aradaki şehir dokusu
    for (let x = 200; x < 270; x += rng.range(12, 20)) {
      const h = rng.range(30, 70);
      rect(x, B - 50 - h + 10, rng.range(12, 18), h);
    }
    for (let x = 520; x < 560; x += rng.range(12, 18)) {
      const h = rng.range(30, 60);
      rect(x, B - 46 - h + 8, rng.range(12, 18), h);
    }

    // Küçük cami (sağ)
    const sx = 624;
    const sb = B - 58;
    rect(sx - 44, sb - 44, 88, 44, false);
    dome(sx, sb - 44, 30);
    dome(sx - 32, sb - 44, 12);
    dome(sx + 32, sb - 44, 12);
    minaret(sx - 56, sb + 4, 150);
    minaret(sx + 56, sb + 4, 150);
    for (let i = 0; i < 6; i++) winSpots.push([sx - 34 + i * 13, sb - 16]);
    for (let x = 684; x < WORLD_W; x += 14) {
      const h = rng.range(24, 44);
      rect(x, B - 48 - h + 8, 13, h);
    }

    // Ay ışığı kenarı: açık renkli kopyayı hafif yukarı kaydırıp üstüne koyu dolgu
    g.save();
    g.translate(-0.8, -1.6);
    g.fillStyle = 'rgba(150,160,255,0.35)';
    g.fill(p, 'nonzero');
    g.restore();
    const fill = g.createLinearGradient(0, B - 280, 0, B);
    fill.addColorStop(0, '#1A2160');
    fill.addColorStop(1, '#0A0E30');
    g.fillStyle = fill;
    g.fill(p, 'nonzero');

    // Uzak pencereler (ayrı katman: şehir düştükçe söner)
    for (const [x, y] of winSpots) {
      const a = rng.range(0.35, 0.95);
      lg.fillStyle = rng.chance(0.15) ? `rgba(180,230,255,${a})` : `rgba(255,198,107,${a})`;
      lg.fillRect(x - 0.9, y - 1.2, 1.8, 2.4);
    }
    this.skyline = c;
    this.skylineLights = lights;
    this.skylineTop = v.H - 95 - B;
  }

  update(dt: number): void {
    this.t += dt;
    this.lightsShown += (this.lights - this.lightsShown) * Math.min(1, dt * 2);
    for (let i = this.shooting.length - 1; i >= 0; i--) {
      const s = this.shooting[i];
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.t >= s.life) this.shooting.splice(i, 1);
    }
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = 4 + Math.random() * 7;
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.shooting.push({
        x: dir > 0 ? Math.random() * 300 : 420 + Math.random() * 300,
        y: 40 + Math.random() * this.view.H * 0.3,
        vx: dir * (700 + Math.random() * 300),
        vy: 260 + Math.random() * 120,
        t: 0,
        life: 0.55 + Math.random() * 0.3,
      });
    }
  }

  /** Piksel uzayında gökyüzü */
  renderSky(g: CanvasRenderingContext2D): void {
    if (this.sky) g.drawImage(this.sky, 0, 0);
  }

  /** Dünya uzayında canlı katmanlar (dünya dönüşümü ayarlanmış olmalı) */
  renderLive(g: CanvasRenderingContext2D, quality: number): void {
    const H = this.view.H;
    g.globalCompositeOperation = 'lighter';
    if (quality > 0) {
      // Akan aurora ışıkları
      const t = this.t;
      const auroras: Array<[string, number, number, number, number]> = [
        [C.turkuaz, 180 + Math.sin(t * 0.07) * 120, H * 0.22 + Math.cos(t * 0.05) * 60, 620, 0.06],
        [C.violet, 540 + Math.cos(t * 0.06) * 140, H * 0.36 + Math.sin(t * 0.04) * 80, 700, 0.07],
        [C.rose, 360 + Math.sin(t * 0.045 + 2) * 200, H * 0.62, 760, 0.05],
      ];
      for (const [col, x, y, s, a] of auroras) {
        g.globalAlpha = a;
        g.drawImage(this.sprites.glow(col), x - s / 2, y - s / 2, s, s);
      }
    }
    // Parıldayan yıldızlar
    const cols = [C.white, C.ice, C.gold, C.rose];
    for (const s of this.twinkles) {
      const tw = 0.5 + 0.5 * Math.sin(this.t * s.sp + s.ph);
      const a = tw * tw * 0.9;
      if (a < 0.03) continue;
      g.globalAlpha = a;
      const sz = s.s * (0.7 + tw * 0.5);
      g.drawImage(this.sprites.glow(cols[s.col], true), s.x - sz / 2, s.y - sz / 2, sz, sz);
      if (tw > 0.92) {
        g.globalAlpha = (tw - 0.92) * 8;
        const ss = sz * 2.4;
        g.drawImage(this.sprites.sparkle, s.x - ss / 2, s.y - ss / 2, ss, ss);
      }
    }
    // Kayan yıldızlar
    for (const s of this.shooting) {
      const p = s.t / s.life;
      const a = Math.sin(p * Math.PI);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        g.globalAlpha = a * (1 - f) * 0.8;
        const sz = 10 * (1 - f) + 2;
        const x = s.x - s.vx * f * 0.09;
        const y = s.y - s.vy * f * 0.09;
        g.drawImage(this.sprites.glow(C.white, true), x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    // Uzak silüet
    if (this.skyline && this.skylineLights) {
      const k = this.view.scale * this.view.dpr;
      const w = WORLD_W;
      const h = this.skyline.height / k;
      g.drawImage(this.skyline, 0, this.skylineTop, w, h);
      g.globalAlpha = clamp(this.lightsShown, 0, 1) * (0.75 + 0.25 * Math.sin(this.t * 1.3));
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.skylineLights, 0, this.skylineTop, w, h);
      // Galata'nın kırmızı ikaz ışığı
      const blink = Math.sin(this.t * 3) > 0.3 ? 1 : 0.15;
      g.globalAlpha = blink * 0.9;
      const gx = 110;
      const gy = this.skylineTop + 440 - 20 - 64 - 262;
      g.drawImage(this.sprites.glow(C.crimson, true), gx - 9, gy - 9, 18, 18);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }
}
