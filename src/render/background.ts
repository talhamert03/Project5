import { TAU, clamp, hexToRgb, lerp } from '../core/math';
import { Rng } from '../core/rng';
import { ATMOSPHERES, type Atmosphere } from './atmospheres';
import { type Canvas, type Sprites, ctx2d, makeCanvas, blit } from './sprites';
import { WORLD_W, type View } from './view';

// ───────────────────────── GÜRÜLTÜ ─────────────────────────

type Noise = (x: number, y: number) => number;

/** Değer gürültüsü (tohumlu) */
function makeNoise(seed: number): Noise {
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
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(n: Noise, x: number, y: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    s += n(x * f, y * f) * amp;
    norm += amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s / norm;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ───────────────────────── GEOMETRİ ─────────────────────────

/** Sahnenin çizileceği yüzey: ekran ya da küçük önizleme */
interface Geom {
  pw: number;
  ph: number;
  /** 1 dünya birimi = k piksel */
  k: number;
  ox: number;
  oy: number;
  H: number;
  letterboxed: boolean;
}

interface Scene {
  sky: Canvas;
  skyline: Canvas;
  lights: Canvas;
  beacons: Array<[number, number]>;
}

const SKYLINE_H = 440;
/** Gökyüzü karesinin tazeleme aralığı (sn) ve kaç kareye yayıldığı */
const SKY_REFRESH = 3;
const SKY_STRIPS = 12;
const SKYLINE_B = SKYLINE_H - 20;

// ───────────────────────── GÖKYÜZÜ ─────────────────────────

/** Ebru bulutsusu gövdesi + HD damarlar + yıldızlar + gök cismi */
function buildSky(atm: Atmosphere, geo: Geom, detail: number): Canvas {
  const { pw, ph, k, ox, oy, H } = geo;
  const c = makeCanvas(pw, ph);
  const g = ctx2d(c);
  const top = oy;

  // 1) dikey gradyan (dünyaya sabit: her cihazda ufuk aynı yerde)
  const grad = g.createLinearGradient(0, top, 0, oy + H * k);
  for (const [p, col] of atm.sky) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, pw, ph);

  const noise = makeNoise(4242 + atm.id.length * 97);
  const aspect = H / WORLD_W;
  const field = (wx: number, wy: number): { f: number; rx: number } => {
    const px = (wx / WORLD_W) * 2.6;
    const py = (wy / WORLD_W) * 2.6;
    const qx = fbm(noise, px, py);
    const qy = fbm(noise, px + 5.2, py + 1.3);
    const rx = fbm(noise, px + 3.5 * qx + 1.7, py + 3.5 * qy + 9.2);
    const ry = fbm(noise, px + 3.5 * qx + 8.3, py + 3.5 * qy + 2.8);
    return { f: fbm(noise, px + 3 * rx, py + 3 * ry), rx };
  };
  const mask = (wy: number): number => {
    const vy = wy / H;
    return smoothstep(-0.02, 0.1, vy) * (1 - smoothstep(0.55, 0.84, vy));
  };

  // 2) yumuşak bulutsu gövdesi (bulanık olması doğal, damar içermez)
  const nw = Math.round(150 * detail);
  const nh = Math.round(nw * aspect);
  const neb = makeCanvas(nw, nh);
  const ng = ctx2d(neb);
  const img = ng.createImageData(nw, nh);
  const d = img.data;
  const [ar, ag, ab] = hexToRgb(atm.nebula[0]);
  const [br, bg, bb] = hexToRgb(atm.nebula[1]);
  for (let y = 0; y < nh; y++) {
    const wy = (y / nh) * H;
    const m = mask(wy);
    for (let x = 0; x < nw; x++) {
      const i = (y * nw + x) * 4;
      if (m <= 0.001) {
        d[i + 3] = 0;
        continue;
      }
      const { f, rx } = field((x / nw) * WORLD_W, wy);
      const body = smoothstep(0.36, 0.8, f);
      const mix = smoothstep(0.45, 0.8, rx);
      d[i] = lerp(ar, br, mix);
      d[i + 1] = lerp(ag, bg, mix);
      d[i + 2] = lerp(ab, bb, mix);
      d[i + 3] = clamp(body * m * atm.nebulaAlpha, 0, 1) * 255;
    }
  }
  ng.putImageData(img, 0, 0);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(neb, ox - 30 * k, oy, (WORLD_W + 60) * k, H * k);
  g.restore();

  // 3) HD ebru damarları: dönel (curl) akış alanını izleyen vektörel çizgiler.
  // Piksel çözünürlüğünde çizildiği için her ekranda keskin kalır.
  const pot = (wx: number, wy: number): number => {
    const px = (wx / WORLD_W) * 2.2;
    const py = (wy / WORLD_W) * 2.2;
    const qx = fbm(noise, px + 11.3, py + 4.1, 3);
    const qy = fbm(noise, px + 2.7, py + 13.9, 3);
    return fbm(noise, px + 2.4 * qx, py + 2.4 * qy, 3);
  };
  const e = 1.5;
  const rng = new Rng(7331 + atm.id.length);
  g.save();
  g.globalCompositeOperation = 'lighter';
  // parçalar arka arkaya eklenir: düz uç, üst üste binen parlak boncuklar oluşmaz
  g.lineCap = 'butt';
  g.lineJoin = 'round';
  const count = Math.round(atm.veinCount * 0.62 * detail);
  const pts: number[] = [];
  for (let s = 0; s < count; s++) {
    // tohum: bulutsunun yoğun yerlerinde başla
    let sx = 0;
    let sy = 0;
    let ok = false;
    for (let tries = 0; tries < 12 && !ok; tries++) {
      sx = rng.range(-40, WORLD_W + 40);
      sy = rng.range(H * 0.03, H * 0.72);
      const fv = field(sx, sy).f;
      ok = fv > 0.48 || rng.chance(0.08);
    }
    const col = atm.veins[s % atm.veins.length];
    // katmanlı derinlik: bazı damarlar geniş ve yumuşak, çoğu ince ve keskin
    const soft = rng.chance(0.28);
    const bundle = !soft && rng.chance(0.35) ? rng.int(2, 4) : 1;
    const width = soft ? rng.range(3, 6) : rng.range(0.5, 1.8);
    const bright = soft ? 0.35 : 1;
    const steps = rng.int(40, 140);
    const dir = rng.sign();
    for (let bI = 0; bI < bundle; bI++) {
      pts.length = 0;
      let x = sx + (bI - (bundle - 1) / 2) * rng.range(5, 10);
      let y = sy + (bI - (bundle - 1) / 2) * rng.range(3, 7);
      for (let i = 0; i < steps; i++) {
        pts.push(x, y);
        const dpx = (pot(x + e, y) - pot(x - e, y)) / (2 * e);
        const dpy = (pot(x, y + e) - pot(x, y - e)) / (2 * e);
        // dönel alan: (∂ψ/∂y, -∂ψ/∂x)
        let vx = dpy;
        let vy = -dpx;
        const L = Math.hypot(vx, vy);
        if (L < 1e-7) break;
        vx /= L;
        vy /= L;
        x += vx * 4.5 * dir;
        y += vy * 4.5 * dir;
        if (x < -80 || x > WORLD_W + 80 || y < -40 || y > H * 0.86) break;
      }
      const n = pts.length / 2;
      if (n < 6) continue;
      // uçlarda incelip sönen şerit: parçalara bölüp zarfla çiz
      const chunk = 6;
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = col;
        for (let i0 = 0; i0 < n - 1; i0 += chunk) {
          const i1 = Math.min(n - 1, i0 + chunk);
          const tMid = (i0 + i1) / 2 / (n - 1);
          const env = Math.sin(Math.PI * tMid);
          const m = mask(pts[i0 * 2 + 1]);
          if (m < 0.02) continue;
          const a = (pass === 0 ? 0.05 * env * m : (0.14 + 0.28 * env) * env * m) * bright;
          if (a < 0.01) continue;
          g.globalAlpha = a;
          g.lineWidth = (pass === 0 ? width * 5 : width * (0.5 + 0.6 * env)) * k;
          g.beginPath();
          g.moveTo(ox + pts[i0 * 2] * k, oy + pts[i0 * 2 + 1] * k);
          for (let i = i0 + 1; i <= i1; i++) g.lineTo(ox + pts[i * 2] * k, oy + pts[i * 2 + 1] * k);
          g.stroke();
        }
      }
    }
  }
  g.restore();

  // 4) yıldızlar
  const srng = new Rng(99);
  const scount = Math.round(((pw * ph) / 5200) * atm.stars);
  const starScale = Math.max(0.6, k / 1.6);
  for (let i = 0; i < scount; i++) {
    const x = srng.range(0, pw);
    const yN = Math.pow(srng.next(), 1.5);
    const y = top + yN * (H * 0.8) * k;
    const s = srng.range(0.35, 1.25) * starScale * (srng.chance(0.05) ? 1.8 : 1);
    const a = srng.range(0.25, 0.95) * (1 - yN * 0.6);
    const tint = srng.int(0, 5);
    g.fillStyle = tint === 0 ? `rgba(255,220,180,${a})` : tint === 1 ? `rgba(170,220,255,${a})` : `rgba(255,255,255,${a})`;
    g.beginPath();
    g.arc(x, y, s, 0, TAU);
    g.fill();
  }

  // 5) gök cismi
  drawCelestial(g, atm, ox + atm.celestialPos[0] * WORLD_W * k, oy + atm.celestialPos[1] * H * k, k);

  // 6) oyun alanı dışı (tablet/masaüstü) kenarlar
  if (geo.letterboxed && ox > 0) {
    g.fillStyle = 'rgba(3,4,16,0.55)';
    g.fillRect(0, 0, ox, ph);
    g.fillRect(ox + WORLD_W * k, 0, pw - (ox + WORLD_W * k), ph);
  }
  return c;
}

function halo(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number): void {
  const [cr, cg, cb] = hexToRgb(col);
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
  gr.addColorStop(0.35, `rgba(${cr},${cg},${cb},${a * 0.35})`);
  gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawCelestial(g: CanvasRenderingContext2D, atm: Atmosphere, x: number, y: number, k: number): void {
  const disc = (r: number, c0: string, c1: string): void => {
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    gr.addColorStop(0, c0);
    gr.addColorStop(1, c1);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  };
  const crescent = (cx: number, cy: number, r: number, c0: string, c1: string): void => {
    const m = makeCanvas(r * 2.4, r * 2.4);
    const mg = ctx2d(m);
    const mc = r * 1.2;
    const gr = mg.createRadialGradient(mc - r * 0.3, mc - r * 0.3, 0, mc, mc, r);
    gr.addColorStop(0, c0);
    gr.addColorStop(1, c1);
    mg.fillStyle = gr;
    mg.beginPath();
    mg.arc(mc, mc, r, 0, TAU);
    mg.fill();
    mg.globalCompositeOperation = 'destination-out';
    mg.beginPath();
    mg.arc(mc + r * 0.42, mc - r * 0.2, r * 0.86, 0, TAU);
    mg.fill();
    g.drawImage(m, cx - mc, cy - mc);
  };
  switch (atm.celestial) {
    case 'crescent': {
      const r = 30 * k;
      halo(g, x, y, r * 6, '#FFE8C8', 0.3);
      crescent(x, y, r, '#FFFBEA', '#F2D9A8');
      break;
    }
    case 'sun': {
      const r = 78 * k;
      halo(g, x, y, r * 5.5, '#FF9A50', 0.45);
      halo(g, x, y, r * 2.2, '#FFD27A', 0.6);
      disc(r, '#FFF6D8', '#FFB04A');
      // ufuk pusu: güneşin alt kısmında ince yatay bantlar
      g.save();
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 5; i++) {
        const by = y + r * (0.25 + i * 0.16);
        g.fillStyle = `rgba(0,0,0,${0.35 + i * 0.1})`;
        g.fillRect(x - r * 1.1, by, r * 2.2, r * (0.03 + i * 0.015));
      }
      g.restore();
      break;
    }
    case 'fullmoon': {
      const r = 34 * k;
      halo(g, x, y, r * 6, '#CFF6FF', 0.28);
      disc(r, '#F4FBFF', '#B8D4E0');
      const rng = new Rng(3);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = 'rgba(80,110,130,0.18)';
        g.beginPath();
        g.arc(x + rng.range(-0.6, 0.6) * r, y + rng.range(-0.6, 0.6) * r, rng.range(0.08, 0.2) * r, 0, TAU);
        g.fill();
      }
      break;
    }
    case 'bloodmoon': {
      const r = 42 * k;
      halo(g, x, y, r * 6.5, '#FF3A2A', 0.4);
      disc(r, '#FF8A5A', '#8A1410');
      const rng = new Rng(5);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = 'rgba(60,0,0,0.22)';
        g.beginPath();
        g.arc(x + rng.range(-0.6, 0.6) * r, y + rng.range(-0.6, 0.6) * r, rng.range(0.08, 0.22) * r, 0, TAU);
        g.fill();
      }
      break;
    }
    case 'planet': {
      const r = 58 * k;
      halo(g, x, y, r * 4.5, '#B57BFF', 0.3);
      const ring = (front: boolean): void => {
        g.save();
        g.translate(x, y);
        g.rotate(-0.35);
        g.scale(1, 0.28);
        g.lineWidth = r * 0.5;
        const rg = g.createLinearGradient(-r * 2.2, 0, r * 2.2, 0);
        rg.addColorStop(0, 'rgba(255,200,240,0.1)');
        rg.addColorStop(0.5, 'rgba(255,220,250,0.75)');
        rg.addColorStop(1, 'rgba(200,160,255,0.1)');
        g.strokeStyle = rg;
        g.beginPath();
        if (front) g.arc(0, 0, r * 1.75, 0, Math.PI);
        else g.arc(0, 0, r * 1.75, Math.PI, TAU);
        g.stroke();
        g.restore();
      };
      ring(false);
      disc(r, '#FFC7E8', '#5A2A9A');
      // bantlar
      g.save();
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.clip();
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(60,20,120,0.18)';
        g.fillRect(x - r, y - r + i * r * 0.36, r * 2, r * 0.18);
      }
      g.restore();
      ring(true);
      break;
    }
    case 'twin': {
      const r = 28 * k;
      halo(g, x, y, r * 6, '#FFD86B', 0.3);
      crescent(x, y, r, '#FFF6D0', '#FFC857');
      const x2 = x - 120 * k;
      const y2 = y + 50 * k;
      halo(g, x2, y2, r * 3, '#FF9FD0', 0.25);
      crescent(x2, y2, r * 0.5, '#FFE0F0', '#FF8FC0');
      break;
    }
    case 'belt': {
      // Orion kuşağı: çapraz dizilmiş üç mavi-beyaz dev yıldız, altında pembe bulutsu
      halo(g, x - 40 * k, y + 120 * k, 150 * k, '#FF7AC0', 0.3);
      halo(g, x - 30 * k, y + 110 * k, 70 * k, '#FFB0E0', 0.35);
      for (let i = 0; i < 3; i++) {
        const sx = x + (i - 1) * 62 * k;
        const sy = y + (i - 1) * 26 * k;
        starFlare(g, sx, sy, (i === 1 ? 7 : 6) * k, '#BFE0FF');
      }
      starFlare(g, x - 150 * k, y - 60 * k, 5 * k, '#FFB58A');
      starFlare(g, x + 140 * k, y + 170 * k, 5.5 * k, '#CFE8FF');
      break;
    }
    case 'saturn': {
      const r = 104 * k;
      halo(g, x, y, r * 4, '#FFD08A', 0.25);
      const rings = (front: boolean): void => {
        g.save();
        g.translate(x, y);
        g.rotate(-0.22);
        g.scale(1, 0.24);
        // çok katlı halka: Cassini boşluğu ile iki ana bant
        const bands: Array<[number, number, string]> = [
          [1.28, 0.16, 'rgba(255,230,190,0.5)'],
          [1.5, 0.22, 'rgba(255,215,160,0.75)'],
          [1.78, 0.2, 'rgba(240,220,200,0.55)'],
          [2.02, 0.1, 'rgba(200,210,230,0.35)'],
        ];
        for (const [rr, w, col] of bands) {
          g.strokeStyle = col;
          g.lineWidth = r * w;
          g.beginPath();
          if (front) g.arc(0, 0, r * rr, 0, Math.PI);
          else g.arc(0, 0, r * rr, Math.PI, TAU);
          g.stroke();
        }
        g.restore();
      };
      rings(false);
      disc(r, '#FFF0CC', '#8A5A2A');
      g.save();
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.clip();
      const bandCols = ['rgba(255,240,210,0.16)', 'rgba(140,80,30,0.22)', 'rgba(255,220,170,0.12)', 'rgba(120,70,40,0.18)'];
      for (let i = 0; i < 9; i++) {
        g.fillStyle = bandCols[i % bandCols.length];
        g.fillRect(x - r, y - r + i * r * 0.23, r * 2, r * (0.1 + (i % 3) * 0.04));
      }
      // gölge tarafı
      const sh = g.createLinearGradient(x - r, y - r, x + r, y + r);
      sh.addColorStop(0.45, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(10,6,20,0.65)');
      g.fillStyle = sh;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.restore();
      rings(true);
      // uydular
      disc2(g, x + 190 * k, y - 70 * k, 9 * k, '#E8F4FF', '#6A7A9A');
      disc2(g, x - 170 * k, y + 60 * k, 6 * k, '#FFE8C8', '#8A6A4A');
      break;
    }
    case 'blackhole': {
      // Olay ufku: bükülmüş ışık halkası, parlak toplanma diski, zifiri çekirdek
      const r = 46 * k;
      halo(g, x, y, r * 7, '#FF8A3D', 0.28);
      const disk = (front: boolean): void => {
        g.save();
        g.translate(x, y);
        g.rotate(-0.12);
        g.scale(1, 0.2);
        for (const [w, a, col] of [
          [r * 1.6, 0.25, '#FF7A2A'],
          [r * 0.9, 0.6, '#FFB050'],
          [r * 0.35, 0.95, '#FFF0C8'],
        ] as const) {
          g.strokeStyle = col;
          g.globalAlpha = a;
          g.lineWidth = w;
          g.beginPath();
          if (front) g.arc(0, 0, r * 2.3, 0, Math.PI);
          else g.arc(0, 0, r * 2.3, Math.PI, TAU);
          g.stroke();
        }
        g.restore();
        g.globalAlpha = 1;
      };
      disk(false);
      // kütleçekimsel mercek: diskin arka yüzü ufkun üstünden kıvrılır
      for (const [w, a, col] of [
        [r * 0.7, 0.25, '#FF8A3D'],
        [r * 0.3, 0.7, '#FFC870'],
        [r * 0.1, 0.95, '#FFF6E0'],
      ] as const) {
        g.strokeStyle = col;
        g.globalAlpha = a;
        g.lineWidth = w;
        g.beginPath();
        g.ellipse(x, y, r * 1.45, r * 1.3, 0, Math.PI * 1.02, Math.PI * 1.98);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#000000';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,220,170,0.9)';
      g.lineWidth = 2 * k;
      g.beginPath();
      g.arc(x, y, r * 1.03, 0, TAU);
      g.stroke();
      disk(true);
      break;
    }
    case 'supernova': {
      // patlayan yıldız: beyaz çekirdek, renkli şok kabuğu ve uzun kırınım ışınları
      const r = 18 * k;
      halo(g, x, y, r * 16, '#FF4FD8', 0.25);
      halo(g, x, y, r * 9, '#7FFFE0', 0.35);
      const shell = new Rng(11);
      for (let i = 0; i < 90; i++) {
        const a = (i / 90) * TAU;
        const rr = r * (6.5 + shell.range(-0.6, 0.6));
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr * 0.92;
        halo(g, px, py, r * shell.range(0.8, 1.8), i % 3 ? '#FF7AE0' : '#8FFFF0', 0.35);
      }
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.2;
        const L = r * (i % 3 === 0 ? 14 : 7);
        const gr = g.createLinearGradient(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)');
        gr.addColorStop(1, 'rgba(160,255,240,0)');
        g.strokeStyle = gr;
        g.lineWidth = (i % 3 === 0 ? 3 : 1.6) * k;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
        g.stroke();
      }
      g.restore();
      halo(g, x, y, r * 3, '#FFFFFF', 0.9);
      disc(r, '#FFFFFF', '#CFFFF6');
      break;
    }
  }
}

/** Parıltılı yıldız: hale + dört kollu kırınım ışını */
function starFlare(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  halo(g, x, y, r * 7, col, 0.45);
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const L = r * (i % 2 ? 6 : 9);
    const gr = g.createLinearGradient(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr;
    g.lineWidth = r * 0.35;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
  g.restore();
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.arc(x, y, r * 0.8, 0, TAU);
  g.fill();
}

function disc2(g: CanvasRenderingContext2D, x: number, y: number, r: number, c0: string, c1: string): void {
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  gr.addColorStop(0, c0);
  gr.addColorStop(1, c1);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

// ───────────────────────── SİLÜET ─────────────────────────

/** Uzak şehir: Boğaz Köprüsü + apartmanlar ve gökdelenler (ayrı ışık katmanı) */
function buildSkyline(atm: Atmosphere, k: number): { skyline: Canvas; lights: Canvas; beacons: Array<[number, number]> } {
  const c = makeCanvas(WORLD_W * k, SKYLINE_H * k);
  const lc = makeCanvas(WORLD_W * k, SKYLINE_H * k);
  const g = ctx2d(c);
  const lg = ctx2d(lc);
  g.scale(k, k);
  lg.scale(k, k);
  const B = SKYLINE_B;
  const rng = new Rng(2024);
  const beacons: Array<[number, number]> = [];
  const win = atm.skyline.windows;

  // ── Katman 1 (en uzak): tepeler + köprü
  const far = new Path2D();
  far.moveTo(-10, B + 20);
  far.lineTo(-10, B - 40);
  far.bezierCurveTo(90, B - 62, 170, B - 58, 260, B - 44);
  far.bezierCurveTo(360, B - 30, 450, B - 60, 560, B - 56);
  far.bezierCurveTo(640, B - 52, 700, B - 40, WORLD_W + 10, B - 44);
  far.lineTo(WORLD_W + 10, B + 20);
  far.closePath();
  g.fillStyle = atm.skyline.bridge;
  g.fill(far);

  const deck = B - 96;
  const xL = 150;
  const xR = 570;
  const towerTop = deck - 150;
  const bridge = new Path2D();
  // kuleler (iki bacak + kirişler)
  for (const tx of [xL, xR]) {
    bridge.rect(tx - 9, towerTop, 5, deck - towerTop + 60);
    bridge.rect(tx + 4, towerTop, 5, deck - towerTop + 60);
    for (const cy of [towerTop + 4, towerTop + 60, deck - 6]) bridge.rect(tx - 9, cy, 18, 4);
    beacons.push([tx, towerTop - 3]);
  }
  // tabliye
  bridge.rect(-20, deck, WORLD_W + 40, 6);
  g.fillStyle = atm.skyline.bridge;
  g.fill(bridge);
  // ana kablo (parabol) + yan kablolar + askılar
  const cableY = (x: number): number => {
    if (x < xL) return towerTop + ((xL - x) / (xL + 20)) * (deck - towerTop - 4);
    if (x > xR) return towerTop + ((x - xR) / (WORLD_W + 20 - xR)) * (deck - towerTop - 4);
    const t = (x - xL) / (xR - xL);
    return towerTop + 4 + (1 - Math.pow(2 * t - 1, 2)) * (deck - towerTop - 18);
  };
  g.strokeStyle = atm.skyline.bridge;
  g.lineWidth = 2;
  g.beginPath();
  for (let x = -20; x <= WORLD_W + 20; x += 6) {
    const y = cableY(x);
    if (x === -20) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.lineWidth = 0.8;
  g.globalAlpha = 0.7;
  for (let x = -10; x <= WORLD_W + 10; x += 16) {
    if (Math.abs(x - xL) < 10 || Math.abs(x - xR) < 10) continue;
    g.beginPath();
    g.moveTo(x, cableY(x));
    g.lineTo(x, deck);
    g.stroke();
  }
  g.globalAlpha = 1;
  // gerdanlık ışıkları
  const [lr, lgC, lb] = hexToRgb(atm.skyline.bridgeLights);
  for (let x = -16; x <= WORLD_W + 16; x += 11) {
    lg.fillStyle = `rgba(${lr},${lgC},${lb},0.9)`;
    lg.beginPath();
    lg.arc(x, cableY(x), 1.3, 0, TAU);
    lg.fill();
  }
  for (let x = -16; x <= WORLD_W + 16; x += 9) {
    lg.fillStyle = `rgba(${lr},${lgC},${lb},0.55)`;
    lg.fillRect(x, deck + 1.5, 2.2, 1.6);
  }

  // ── Katman 2: apartmanlar ve gökdelenler
  const city = new Path2D();
  const windows: Array<[number, number, number]> = [];
  let x = -8;
  while (x < WORLD_W + 8) {
    const tall = rng.chance(0.13);
    const w = tall ? rng.range(34, 48) : rng.range(26, 62);
    const h = tall ? rng.range(200, 262) : rng.range(72, 170);
    const topY = B - h;
    city.rect(x, topY, w, h + 20);
    // çatı ayrıntıları
    const roof = rng.next();
    if (tall) {
      // taç + anten
      city.rect(x + w * 0.2, topY - 10, w * 0.6, 10);
      city.rect(x + w * 0.5 - 0.8, topY - 36, 1.6, 26);
      beacons.push([x + w * 0.5, topY - 37]);
    } else if (roof < 0.3) {
      // kademeli çatı katı
      city.rect(x + w * 0.15, topY - 12, w * 0.55, 12);
    } else if (roof < 0.55) {
      // su deposu
      const tx = x + rng.range(4, Math.max(5, w - 16));
      city.rect(tx, topY - 12, 12, 8);
      city.rect(tx + 1, topY - 4, 1.5, 4);
      city.rect(tx + 9.5, topY - 4, 1.5, 4);
    } else if (roof < 0.75) {
      // anten
      city.rect(x + rng.range(4, w - 4), topY - rng.range(14, 26), 1.2, 26);
    } else {
      // klima kutuları
      for (let i = 0; i < 3; i++) city.rect(x + 3 + i * 9, topY - 4, 6, 4);
    }
    // pencere ızgarası
    const cols = Math.max(2, Math.floor((w - 6) / 7));
    const rows = Math.floor((h - 50) / 9);
    const litP = tall ? 0.42 : 0.3;
    for (let r = 0; r < rows; r++) {
      for (let cI = 0; cI < cols; cI++) {
        if (rng.chance(litP)) windows.push([x + 4 + cI * ((w - 8) / cols), topY + 8 + r * 9, rng.int(0, win.length - 1)]);
      }
    }
    x += w + rng.range(0, 5);
  }
  // ay ışığı kenarı
  g.save();
  g.translate(-0.8, -1.6);
  g.fillStyle = atm.skyline.rim;
  g.fill(city);
  g.restore();
  const fill = g.createLinearGradient(0, B - 270, 0, B);
  fill.addColorStop(0, atm.skyline.top);
  fill.addColorStop(1, atm.skyline.bottom);
  g.fillStyle = fill;
  g.fill(city);

  for (const [wx, wy, ci] of windows) {
    const [r, gg, b] = hexToRgb(win[ci]);
    lg.fillStyle = `rgba(${r},${gg},${b},${rng.range(0.35, 0.95)})`;
    lg.fillRect(wx, wy, 2.4, 3.2);
  }
  return { skyline: c, lights: lc, beacons };
}

// ───────────────────────── CANLI KATMAN ─────────────────────────

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

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  ph: number;
  rot: number;
  vr: number;
  col: number;
}

/**
 * Gökyüzü: her atmosfer için önceden çizilen gökyüzü + silüet katmanları (önbellekli),
 * canlı: parıldayan yıldızlar, akan ışıklar, kayan yıldızlar, atmosfere özel ortam efekti.
 */
export class Background {
  atm: Atmosphere = ATMOSPHERES[0];
  private cache = new Map<string, Scene>();
  private scene: Scene | null = null;
  private twinkles: Twinkle[] = [];
  private shooting: Shooting[] = [];
  private motes: Mote[] = [];
  private shootTimer = 3;
  private t = 0;
  private flash = 0;
  private flashT = 4;
  private bolt: number[] | null = null;
  private boltT = 0;
  private curtains: Canvas[] = [];
  private thumbs = new Map<string, string>();
  /** 0..1: şehir ışıklarının parlaklığı (mahalleler düştükçe azalır) */
  lights = 1;
  private lightsShown = 1;

  constructor(
    private view: View,
    private sprites: Sprites,
  ) {
    view.onResize(() => {
      this.cache.clear();
      this.setAtmosphere(this.atm);
    });
    this.setAtmosphere(this.atm);
  }

  /** Gökyüzü sahnesinin geometrisi: ekranın gerçek yoğunluğu (dinamik çözünürlükten bağımsız, HD) */
  private geom(): Geom {
    const v = this.view;
    const d = v.skyDpr;
    return {
      pw: Math.max(1, Math.round(v.cssW * d)),
      ph: Math.max(1, Math.round(v.cssH * d)),
      k: v.scale * d,
      ox: v.offX * d,
      oy: v.offY * d,
      H: v.H,
      letterboxed: v.letterboxed,
    };
  }

  /** Sahne: gökyüzü ve uzak silüet ekranın gerçek yoğunluğunda hazırlanır (durağan) */
  private buildScene(atm: Atmosphere): Scene {
    const geo = this.geom();
    const sky = buildSky(atm, geo, 1);
    const { skyline, lights, beacons } = buildSkyline(atm, geo.k);
    return { sky, skyline, lights, beacons };
  }

  // ── Çift tamponlu gökyüzü: ön kare ekrana kopyalanır, arka kare arada şeritlerle hazırlanır.
  // Ön kareye hiçbir zaman yazılmaz (GPU'da kopyalama/bekleme yok); arka kare bitince yer değişir.
  private front: Canvas | null = null;
  private back: Canvas | null = null;
  /** arka karede sıradaki şerit (-1: hazırlık yok) */
  private bakeRow = -1;
  private bakeT = 0;
  /** hazırlanan karenin ışık lekesi zamanı (tüm şeritler aynı ana göre çizilir) */
  private bakeAt = 0;

  private sizedCanvas(c: Canvas | null, w: number, h: number): Canvas {
    if (c && c.width === w && c.height === h) return c;
    return makeCanvas(w, h);
  }

  /** Bir kareye (ya da şeridine) gökyüzü + ışık lekeleri: lekeler t anındaki konumlarında */
  private paintSky(target: Canvas, y0: number, y1: number, t: number): void {
    const sc = this.scene;
    if (!sc) return;
    const g = ctx2d(target);
    const v = this.view;
    const w = target.width;
    const d = v.skyDpr;
    const k = v.scale * d;
    const H = v.H;
    const atm = this.atm;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    g.rect(0, y0, w, y1 - y0);
    g.clip();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'copy';
    g.drawImage(sc.sky, 0, y0, w, y1 - y0, 0, y0, w, y1 - y0);
    g.globalCompositeOperation = 'lighter';
    g.setTransform(k, 0, 0, k, v.offX * d, v.offY * d);
    this.glow3(g, atm.glows[0], 180 + Math.sin(t * 0.07) * 120, H * 0.22 + Math.cos(t * 0.05) * 60, 620, 0.06);
    this.glow3(g, atm.glows[1], 540 + Math.cos(t * 0.06) * 140, H * 0.36 + Math.sin(t * 0.04) * 80, 700, 0.07);
    this.glow3(g, atm.glows[2], 360 + Math.sin(t * 0.045 + 2) * 200, H * 0.62, 760, 0.05);
    // uzak silüet lekelerin üstünde (eski çizim sırası): yalnızca şerit ona değiyorsa
    const sh = (sc.skyline.height / sc.skyline.width) * WORLD_W;
    const top = H - 95 - SKYLINE_B;
    const topPx = v.offY * d + top * k;
    if (y1 > topPx && y0 < topPx + sh * k) {
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.drawImage(sc.skyline, 0, top, WORLD_W, sh);
    }
    g.restore();
  }

  /** Ön kareyi hemen hazırla (dünya değişince / ilk açılışta) */
  private paintFront(): void {
    const sc = this.scene;
    if (!sc) return;
    this.front = this.sizedCanvas(this.front, sc.sky.width, sc.sky.height);
    this.paintSky(this.front, 0, sc.sky.height, this.t);
    this.bakeRow = -1;
    this.bakeT = 0;
  }

  /** Arka kareyi şerit şerit hazırla; bitince ön kareyle yer değiştir */
  private stepBake(dt: number): void {
    const sc = this.scene;
    if (!sc || !this.front) return;
    if (this.bakeRow < 0) {
      this.bakeT += dt;
      if (this.bakeT < SKY_REFRESH) return;
      this.back = this.sizedCanvas(this.back, sc.sky.width, sc.sky.height);
      this.bakeRow = 0;
      this.bakeAt = this.t;
    }
    const back = this.back;
    if (!back) return;
    const hh = back.height;
    const i = this.bakeRow;
    this.paintSky(back, Math.floor((i * hh) / SKY_STRIPS), Math.floor(((i + 1) * hh) / SKY_STRIPS), this.bakeAt);
    this.bakeRow++;
    if (this.bakeRow >= SKY_STRIPS) {
      this.back = this.front;
      this.front = back;
      this.bakeRow = -1;
      this.bakeT = 0;
    }
  }

  /** Atmosferi hemen değiştir (gerekirse inşa eder) */
  setAtmosphere(atm: Atmosphere): void {
    this.atm = atm;
    let s = this.cache.get(atm.id);
    if (!s) {
      s = this.buildScene(atm);
      this.cache.set(atm.id, s);
    }
    this.scene = s;
    this.trimCache(atm.id);
    this.resetLive();
    this.paintFront();
  }

  /** Sonraki atmosferi önceden hazırla (geçişte takılma olmasın) */
  prebuild(atm: Atmosphere): void {
    if (this.cache.has(atm.id)) return;
    this.cache.set(atm.id, this.buildScene(atm));
    this.trimCache(this.atm.id, atm.id);
  }

  private trimCache(...keep: string[]): void {
    // bellek: en fazla 2 sahne (şimdiki + sıradaki; her biri ekranın gerçek çözünürlüğünde)
    if (this.cache.size <= 2) return;
    for (const key of [...this.cache.keys()]) {
      if (this.cache.size <= 2) break;
      if (!keep.includes(key)) this.cache.delete(key);
    }
  }

  private resetLive(): void {
    const H = this.view.H;
    const rng = new Rng(77);
    this.twinkles = [];
    for (let i = 0; i < 46 * Math.min(1.5, this.atm.stars + 0.3); i++) {
      this.twinkles.push({
        x: rng.range(-60, WORLD_W + 60),
        y: rng.range(-40, H * 0.62),
        s: rng.range(5, 13),
        ph: rng.range(0, TAU),
        sp: rng.range(0.6, 2.2),
        col: rng.int(0, 3),
      });
    }
    this.motes = [];
    const kind = this.atm.ambient;
    const n =
      kind === 'none'
        ? 0
        : kind === 'snow'
          ? 70
          : kind === 'petals'
            ? 26
            : kind === 'embers'
              ? 44
              : kind === 'stardust'
                ? 60
                : kind === 'crystals'
                  ? 48
                  : kind === 'spiral'
                    ? 70
                    : kind === 'sparks'
                      ? 46
                      : 34;
    for (let i = 0; i < n; i++) this.motes.push(this.spawnMote(rng.range(-40, H)));
    // kuzey ışığı perdeleri: tek parça, pürüzsüz doku (canlıda kaydırılır)
    this.curtains = [];
    if (this.atm.aurora) {
      const cols = ['#3DF58A', '#3EF0E0', '#A77BFF'];
      for (let ci = 0; ci < cols.length; ci++) {
        const W = 256;
        const Hh = 128;
        const cv = makeCanvas(W, Hh);
        const cg = ctx2d(cv);
        const img = cg.createImageData(W, Hh);
        const [r, gg, b] = hexToRgb(cols[ci]);
        for (let x = 0; x < W; x++) {
          const u = x / W;
          // döşenebilir dalgalar (kenarlar birleşsin)
          const base = 0.35 + 0.18 * Math.sin(u * TAU * 2 + ci) + 0.08 * Math.sin(u * TAU * 5 + ci * 2);
          const len = 0.4 + 0.15 * Math.sin(u * TAU * 3 + ci * 1.3);
          const ray = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(u * TAU * 9 + ci)), 3);
          for (let y = 0; y < Hh; y++) {
            const v = y / Hh;
            const d = (v - base) / len;
            let a = 0;
            if (d > -0.15 && d < 1) a = d < 0 ? 1 + d / 0.15 : Math.pow(1 - d, 1.6);
            a *= ray;
            const i = (y * W + x) * 4;
            const hot = Math.max(0, 1 - Math.abs(d) * 4);
            img.data[i] = Math.min(255, r + hot * 90);
            img.data[i + 1] = Math.min(255, gg + hot * 90);
            img.data[i + 2] = Math.min(255, b + hot * 90);
            img.data[i + 3] = clamp(a, 0, 1) * 255;
          }
        }
        cg.putImageData(img, 0, 0);
        this.curtains.push(cv);
      }
    }
  }

  private spawnMote(y: number): Mote {
    const kind = this.atm.ambient;
    if (kind === 'spiral' || kind === 'sparks') {
      // gök cismi etrafında: vx = yarıçap/hız, vy = açısal hız
      const cx = this.atm.celestialPos[0] * WORLD_W;
      const cy = this.atm.celestialPos[1] * this.view.H;
      const a = Math.random() * TAU;
      const spiral = kind === 'spiral';
      const r = spiral ? 90 + Math.random() * 380 : 20 + Math.random() * 40;
      return {
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r * (spiral ? 0.32 : 1),
        vx: spiral ? r : Math.cos(a) * (50 + Math.random() * 110),
        vy: spiral ? 0.5 + Math.random() * 0.6 : Math.sin(a) * (50 + Math.random() * 110),
        s: spiral ? 2.5 + Math.random() * 4 : 3 + Math.random() * 5,
        ph: Math.random() * TAU,
        rot: a,
        vr: 0,
        col: Math.floor(Math.random() * 3),
      };
    }
    const up = kind === 'embers' || kind === 'ink';
    return {
      x: Math.random() * (WORLD_W + 80) - 40,
      y: up ? this.view.H - Math.random() * 120 + (y > 0 ? -y * 0.9 : 0) : y,
      vx: kind === 'petals' ? 30 + Math.random() * 40 : (Math.random() - 0.5) * 20,
      vy:
        kind === 'snow'
          ? 30 + Math.random() * 40
          : kind === 'crystals'
            ? 14 + Math.random() * 22
            : kind === 'petals'
              ? 40 + Math.random() * 30
              : up
                ? -(20 + Math.random() * 50)
                : (Math.random() - 0.5) * 8,
      s: kind === 'snow' ? 3 + Math.random() * 5 : kind === 'crystals' ? 4 + Math.random() * 6 : kind === 'petals' ? 5 + Math.random() * 4 : kind === 'embers' ? 4 + Math.random() * 7 : 3 + Math.random() * 6,
      ph: Math.random() * TAU,
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 3,
      col: Math.floor(Math.random() * 3),
    };
  }

  /** Dünyalar ekranı için küçük önizleme (data URL, önbellekli) */
  thumb(atm: Atmosphere, w = 288, h = 360): string {
    const cached = this.thumbs.get(atm.id);
    if (cached) return cached;
    const k = w / WORLD_W;
    const H = h / k;
    const sky = buildSky(atm, { pw: w, ph: h, k, ox: 0, oy: 0, H, letterboxed: false }, 0.5);
    const c = makeCanvas(w, h);
    const g = ctx2d(c);
    g.drawImage(sky, 0, 0);
    const { skyline, lights } = buildSkyline(atm, k);
    const sh = (skyline.height / skyline.width) * w;
    const y = h + 14 - (SKYLINE_B / SKYLINE_H) * sh;
    g.drawImage(skyline, 0, y, w, sh);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(lights, 0, y, w, sh);
    const url = c.toDataURL('image/jpeg', 0.86);
    this.thumbs.set(atm.id, url);
    return url;
  }

  update(dt: number): void {
    this.t += dt;
    this.stepBake(dt);
    this.lightsShown += (this.lights - this.lightsShown) * Math.min(1, dt * 2);
    const H = this.view.H;
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
        y: 40 + Math.random() * H * 0.3,
        vx: dir * (700 + Math.random() * 300),
        vy: 260 + Math.random() * 120,
        t: 0,
        life: 0.55 + Math.random() * 0.3,
      });
    }
    // ortam parçacıkları
    const kind = this.atm.ambient;
    for (const m of this.motes) {
      m.ph += dt;
      m.rot += m.vr * dt;
      if (kind === 'petals') {
        m.x += (m.vx + Math.sin(m.ph * 1.7) * 25) * dt;
        m.y += (m.vy + Math.cos(m.ph * 1.3) * 12) * dt;
      } else if (kind === 'snow' || kind === 'crystals') {
        m.x += (m.vx + Math.sin(m.ph * 1.1 + m.s) * 14) * dt;
        m.y += m.vy * dt;
      } else if (kind === 'spiral') {
        // kara deliğe doğru daralan sarmal
        const cx = this.atm.celestialPos[0] * WORLD_W;
        const cy = this.atm.celestialPos[1] * H;
        m.vx -= 16 * dt;
        m.rot += m.vy * dt * (160 / Math.max(40, m.vx));
        m.x = cx + Math.cos(m.rot) * m.vx;
        m.y = cy + Math.sin(m.rot) * m.vx * 0.32;
        if (m.vx < 52) Object.assign(m, this.spawnMote(0), { vx: 440 });
        continue;
      } else if (kind === 'sparks') {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const cx = this.atm.celestialPos[0] * WORLD_W;
        const cy = this.atm.celestialPos[1] * H;
        if ((m.x - cx) ** 2 + (m.y - cy) ** 2 > 480 * 480) Object.assign(m, this.spawnMote(0));
        continue;
      } else {
        m.x += (m.vx + Math.sin(m.ph * 0.9) * 8) * dt;
        m.y += m.vy * dt;
      }
      if (m.y > H + 20 || m.y < -40 || m.x > WORLD_W + 60 || m.x < -60) {
        const n = this.spawnMote(-20);
        if (kind === 'petals') {
          n.x = -30 + Math.random() * 200;
          n.y = Math.random() * H * 0.7;
        }
        Object.assign(m, n);
      }
    }
    // şimşek (Kızıl Kıyamet)
    this.flash = Math.max(0, this.flash - dt * 4);
    this.boltT = Math.max(0, this.boltT - dt);
    if (this.atm.lightning) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flashT = 3.5 + Math.random() * 5;
        this.flash = 1;
        this.boltT = 0.22;
        const pts: number[] = [];
        let x = 80 + Math.random() * 560;
        let y = -10;
        while (y < H * 0.72) {
          pts.push(x, y);
          x += (Math.random() - 0.5) * 60;
          y += 20 + Math.random() * 40;
        }
        this.bolt = pts;
      }
    }
  }

  /** Piksel uzayında gökyüzü */
  /** Piksel uzayında gökyüzü (tuval yalnızca piksel yoğunluğu değişerek küçülmüş olabilir: tam ekrana ölçekle) */
  /** Hazır gökyüzünü (silüet dahil, gerçek çözünürlükte) tuvale tek opak kopyayla çiz */
  renderSky(g: CanvasRenderingContext2D, _quality: number): void {
    const f = this.front;
    if (!f) return;
    g.globalCompositeOperation = 'copy';
    g.drawImage(f, 0, 0, this.view.canvas.width, this.view.canvas.height);
    g.globalCompositeOperation = 'source-over';
  }

  /**
   * Uzak silüetin pencere ışıkları ve ikaz lambaları. Silüet gökyüzüne basılı olduğundan
   * bunlar da sarsıntısız dünya dönüşümünde çizilir (hizası hiç kaymaz).
   */
  renderBeacons(g: CanvasRenderingContext2D): void {
    const sc = this.scene;
    if (!sc) return;
    const top = this.view.H - 95 - SKYLINE_B;
    const h = (sc.lights.height / sc.lights.width) * WORLD_W;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = clamp(this.lightsShown, 0, 1) * (0.78 + 0.22 * Math.sin(this.t * 1.3));
    g.drawImage(sc.lights, 0, top, WORLD_W, h);
    const blink = Math.sin(this.t * 3) > 0.3 ? 0.95 : 0.12;
    g.globalAlpha = blink;
    const red = this.sprites.glow('#FF3355', true);
    for (const [bx, by] of sc.beacons) blit(g, red, bx - 8, top + by - 8, 16, 16);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private glow3(g: CanvasRenderingContext2D, col: string, x: number, y: number, s: number, a: number): void {
    g.globalAlpha = a;
    blit(g, this.sprites.glow(col), x - s / 2, y - s / 2, s, s);
  }

  /** Dünya uzayında canlı katmanlar (dünya dönüşümü ayarlanmış olmalı) */
  renderLive(g: CanvasRenderingContext2D, quality: number): void {
    const H = this.view.H;
    const atm = this.atm;
    const t = this.t;
    g.globalCompositeOperation = 'lighter';

    // şimşek flaşı ve uzak yıldırım
    if (this.flash > 0.01) {
      g.globalAlpha = this.flash * 0.22;
      g.fillStyle = '#FFB8A0';
      g.fillRect(-400, -200, WORLD_W + 800, H + 400);
    }
    if (this.bolt && this.boltT > 0) {
      const a = this.boltT / 0.22;
      for (let pass = 0; pass < 2; pass++) {
        g.globalAlpha = a * (pass ? 0.9 : 0.3);
        g.strokeStyle = pass ? '#FFFFFF' : '#FF9A7A';
        g.lineWidth = pass ? 2 : 10;
        g.beginPath();
        g.moveTo(this.bolt[0], this.bolt[1]);
        for (let i = 2; i < this.bolt.length; i += 2) g.lineTo(this.bolt[i], this.bolt[i + 1]);
        g.stroke();
      }
    }

    // büyük ışık lekeleri çift tamponlu gökyüzü karesinde (paintSky): burada çizilmez
    void quality;

    // kuzey ışığı perdeleri: yatay akan, nefes alan dokular
    if (this.curtains.length) {
      for (let i = 0; i < this.curtains.length; i++) {
        const spr = this.curtains[i];
        const w = 900;
        const hh = 360 + 60 * Math.sin(t * 0.3 + i * 2);
        const y0 = H * (0.02 + i * 0.06) + 20 * Math.sin(t * 0.2 + i);
        const off = ((t * (14 + i * 6)) % w) - w;
        g.globalAlpha = 0.16 + 0.07 * Math.sin(t * 0.5 + i * 1.7);
        for (let x = off; x < WORLD_W + 20; x += w) g.drawImage(spr, x, y0, w, hh);
      }
    }

    this.renderCelestialLive(g, H, t);

    // parıldayan yıldızlar
    const cols = ['#FFFFFF', atm.glows[0], atm.glows[1], atm.glows[2]];
    for (const s of this.twinkles) {
      const tw = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      const a = tw * tw * 0.9;
      if (a < 0.03) continue;
      g.globalAlpha = a;
      const sz = s.s * (0.7 + tw * 0.5);
      blit(g, this.sprites.glow(cols[s.col], true), s.x - sz / 2, s.y - sz / 2, sz, sz);
      if (tw > 0.92) {
        g.globalAlpha = (tw - 0.92) * 8;
        const ss = sz * 2.4;
        blit(g, this.sprites.sparkle, s.x - ss / 2, s.y - ss / 2, ss, ss);
      }
    }
    // kayan yıldızlar
    for (const s of this.shooting) {
      const p = s.t / s.life;
      const a = Math.sin(p * Math.PI);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        g.globalAlpha = a * (1 - f) * 0.8;
        const sz = 10 * (1 - f) + 2;
        blit(g, this.sprites.glow('#FFFFFF', true), s.x - s.vx * f * 0.09 - sz / 2, s.y - s.vy * f * 0.09 - sz / 2, sz, sz);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** Gök cisminin canlı katmanı (additive, dünya uzayı) */
  private renderCelestialLive(g: CanvasRenderingContext2D, H: number, t: number): void {
    const atm = this.atm;
    const cx = atm.celestialPos[0] * WORLD_W;
    const cy = atm.celestialPos[1] * H;
    switch (atm.celestial) {
      case 'blackhole': {
        // diskte dönen sıcak noktalar + nabız gibi atan foton halkası
        const hot = this.sprites.glow('#FFC870', true);
        const cr = Math.cos(-0.12);
        const sr = Math.sin(-0.12);
        for (let i = 0; i < 9; i++) {
          const a = t * (0.9 + (i % 3) * 0.25) + (i / 9) * TAU;
          const rx = 106 + (i % 3) * 8;
          const ex = Math.cos(a) * rx;
          const ey = Math.sin(a) * rx * 0.2;
          const x = cx + ex * cr - ey * sr;
          const y = cy + ex * sr + ey * cr;
          // disk önündeyken parlak, arkadayken sönük
          g.globalAlpha = Math.sin(a) > 0 ? 0.55 : 0.2;
          const s = 22 + (i % 2) * 10;
          blit(g, hot, x - s / 2, y - s / 2, s, s);
        }
        g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 2.2);
        const rs = 118;
        blit(g, this.sprites.ring, cx - rs / 2, cy - rs / 2, rs, rs);
        break;
      }
      case 'supernova': {
        for (let i = 0; i < 2; i++) {
          const p = (t * 0.22 + i * 0.5) % 1;
          g.globalAlpha = (1 - p) * 0.45;
          const rs = 90 + p * 420;
          blit(g, this.sprites.ring, cx - rs / 2, cy - rs / 2, rs, rs);
        }
        g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 5);
        const cs = 90 + 16 * Math.sin(t * 5);
        blit(g, this.sprites.glow('#FFFFFF', true), cx - cs / 2, cy - cs / 2, cs, cs);
        break;
      }
      case 'saturn': {
        const sp = this.sprites.sparkle;
        const cr = Math.cos(-0.22);
        const sr = Math.sin(-0.22);
        for (let i = 0; i < 12; i++) {
          const a = t * 0.12 + (i / 12) * TAU;
          const rx = 104 * (1.5 + (i % 3) * 0.14);
          const ex = Math.cos(a) * rx;
          const ey = Math.sin(a) * rx * 0.24;
          const x = cx + ex * cr - ey * sr;
          const y = cy + ex * sr + ey * cr;
          g.globalAlpha = (Math.sin(a) > 0 ? 0.7 : 0.18) * (0.5 + 0.5 * Math.sin(t * 3 + i));
          const s = 14 + (i % 3) * 5;
          blit(g, sp, x - s / 2, y - s / 2, s, s);
        }
        break;
      }
      case 'belt': {
        for (let i = 0; i < 3; i++) {
          const x = cx + (i - 1) * 62;
          const y = cy + (i - 1) * 26;
          const tw = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 2);
          g.globalAlpha = 0.35 + tw * 0.5;
          const s = 34 + tw * 20;
          blit(g, this.sprites.sparkle, x - s / 2, y - s / 2, s, s);
        }
        break;
      }
      default:
        break;
    }
    g.globalAlpha = 1;
  }

  /** Ortam parçacıkları: evlerin önünde, meteorların arkasında */
  renderAmbient(g: CanvasRenderingContext2D, k: number, tx: number, ty: number): void {
    const kind = this.atm.ambient;
    if (kind === 'none' || !this.motes.length) return;
    const t = this.t;
    if (kind === 'petals') {
      const cols = ['#FF7FA8', '#FF4F7B', '#FFC0D0'];
      for (const m of this.motes) {
        const c = Math.cos(m.rot) * k;
        const s = Math.sin(m.rot) * k;
        g.setTransform(c, s, -s, c, tx + m.x * k, ty + m.y * k);
        g.globalAlpha = 0.85;
        g.fillStyle = cols[m.col];
        g.beginPath();
        g.ellipse(0, 0, m.s, m.s * 0.55 * (0.4 + 0.6 * Math.abs(Math.sin(m.ph * 2))), 0, 0, TAU);
        g.fill();
      }
      g.setTransform(k, 0, 0, k, tx, ty);
      g.globalAlpha = 1;
      return;
    }
    g.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      let col: string;
      let a: number;
      let s = m.s;
      if (kind === 'snow') {
        col = '#E8FAFF';
        a = 0.7;
      } else if (kind === 'embers') {
        col = m.col === 0 ? '#FFB04A' : '#FF6A3D';
        a = 0.5 + 0.5 * Math.sin(t * 9 + m.ph * 3);
      } else if (kind === 'stardust') {
        col = this.atm.glows[m.col];
        a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + m.ph));
        s *= 0.8;
      } else if (kind === 'crystals') {
        col = '#E8F6FF';
        a = 0.3 + 0.7 * Math.abs(Math.sin(t * 2.6 + m.ph));
        if (m.col === 0) {
          g.globalAlpha = a * 0.8;
          const ss = s * 3.2;
          blit(g, this.sprites.sparkle, m.x - ss / 2, m.y - ss / 2, ss, ss);
          continue;
        }
      } else if (kind === 'spiral') {
        col = this.atm.glows[m.col];
        a = 0.25 + 0.6 * clamp(1 - m.vx / 440, 0, 1);
      } else if (kind === 'sparks') {
        col = m.col === 0 ? '#7FFFE0' : m.col === 1 ? '#FF7AE0' : '#FFFFFF';
        const cx = this.atm.celestialPos[0] * WORLD_W;
        const cy = this.atm.celestialPos[1] * this.view.H;
        a = 0.9 * clamp(1 - Math.hypot(m.x - cx, m.y - cy) / 480, 0, 1);
      } else {
        col = this.atm.veins[m.col % this.atm.veins.length];
        a = 0.55;
        s *= 1.4;
      }
      g.globalAlpha = a;
      blit(g, this.sprites.glow(col, true), m.x - s, m.y - s, s * 2, s * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
