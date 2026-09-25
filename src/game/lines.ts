import { clamp, hsl } from '../core/math';
import type { Sprites } from '../render/sprites';
import type { Pen } from './pens';

export const MAXP = 180;
const MIN_DIST = 8;
const FADE = 0.45;

/**
 * Oyuncunun çizdiği mürekkep çizgisi. Hat sanatı fırçası gibi: hızlı çizilen yerler incelir,
 * uçlar sivrilir. Çarpışmada nokta dizisi (polyline) kullanılır.
 */
export class InkLine {
  id = 0;
  alive = false;
  drawing = false;
  pts = new Float32Array(MAXP * 2);
  wid = new Float32Array(MAXP);
  arc = new Float32Array(MAXP);
  n = 0;
  len = 0;
  life = 0;
  maxLife = 1;
  /** >= 0 ise hızlı yok oluyor (kırıldı/yerine yenisi geldi) */
  killT = -1;
  shattered = false;
  minX = 0;
  minY = 0;
  maxX = 0;
  maxY = 0;
  /** titreşim: [s0, t, amp] x3 */
  wob = new Float32Array(9);
  wobN = 0;
  deflects = 0;
  hue = 0;
  /** buz kristali dokundu: süre dolunca kırılır */
  frozen = 0;
  private lastT = 0;
  private wTarget = 1;

  reset(id: number, x: number, y: number, t: number, hue: number): void {
    this.id = id;
    this.alive = true;
    this.drawing = true;
    this.n = 0;
    this.len = 0;
    this.life = 0;
    this.maxLife = 1;
    this.killT = -1;
    this.shattered = false;
    this.wobN = 0;
    this.deflects = 0;
    this.frozen = 0;
    this.hue = hue;
    this.minX = this.maxX = x;
    this.minY = this.maxY = y;
    this.lastT = t;
    this.wTarget = 1;
    this.push(x, y, 1);
  }

  get collidable(): boolean {
    return this.alive && this.killT < 0 && this.n >= 2;
  }

  get lastX(): number {
    return this.pts[(this.n - 1) * 2];
  }

  get lastY(): number {
    return this.pts[(this.n - 1) * 2 + 1];
  }

  private push(x: number, y: number, w: number): void {
    const i = this.n;
    if (i > 0) {
      const dx = x - this.pts[(i - 1) * 2];
      const dy = y - this.pts[(i - 1) * 2 + 1];
      this.len += Math.sqrt(dx * dx + dy * dy);
    }
    this.pts[i * 2] = x;
    this.pts[i * 2 + 1] = y;
    this.wid[i] = w;
    this.arc[i] = this.len;
    this.n++;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  get full(): boolean {
    return this.n >= MAXP;
  }

  /** Aday noktaya olan uzaklık (mürekkep maliyeti hesabı için) */
  distTo(x: number, y: number): number {
    return Math.hypot(x - this.lastX, y - this.lastY);
  }

  /** Yeterince uzaksa nokta ekler; eklenen uzunluğu döndürür */
  extend(x: number, y: number, t: number): number {
    if (this.full) return 0;
    const d = this.distTo(x, y);
    if (d < MIN_DIST) return 0;
    const dtMs = Math.max(1, t - this.lastT);
    this.lastT = t;
    const speed = (d / dtMs) * 1000;
    this.wTarget = clamp(1.3 - speed / 2600, 0.62, 1.3);
    const prevW = this.wid[this.n - 1];
    this.push(x, y, prevW + (this.wTarget - prevW) * 0.4);
    return d;
  }

  finish(life: number): void {
    this.drawing = false;
    this.life = life;
    this.maxLife = life;
    if (this.n < 2) this.alive = false;
  }

  kill(): void {
    if (this.killT < 0) this.killT = 0;
  }

  wobble(s0: number, amp: number): void {
    const i = this.wobN < 3 ? this.wobN++ : 0;
    this.wob[i * 3] = s0;
    this.wob[i * 3 + 1] = 0;
    this.wob[i * 3 + 2] = amp;
  }

  alpha(): number {
    if (this.killT >= 0) return Math.max(0, 1 - this.killT / 0.16);
    if (this.drawing) return 1;
    return this.life < FADE ? this.life / FADE : 1;
  }
}

// Paylaşılan çizim tamponları (her karede alloc yok)
const RX = new Float32Array(MAXP * 2);
const LX = new Float32Array(MAXP * 2);
const RR = new Float32Array(MAXP * 2);

export class LineManager {
  pool: InkLine[] = [];
  current: InkLine | null = null;
  private nextId = 1;
  private t = 0;

  constructor(private sprites: Sprites) {
    for (let i = 0; i < 10; i++) this.pool.push(new InkLine());
  }

  clear(): void {
    for (const l of this.pool) l.alive = false;
    this.current = null;
  }

  /** Aktif (yok olmayan) çizgi sayısı */
  activeCount(): number {
    let c = 0;
    for (const l of this.pool) if (l.alive && l.killT < 0) c++;
    return c;
  }

  begin(x: number, y: number, t: number, maxLines: number, hue: number): InkLine | null {
    // sınır doluysa en eski çizgi hızla söner
    while (this.activeCount() >= maxLines) {
      let oldest: InkLine | null = null;
      for (const l of this.pool) {
        if (l.alive && l.killT < 0 && !l.drawing && (!oldest || l.id < oldest.id)) oldest = l;
      }
      if (!oldest) break;
      oldest.kill();
    }
    const line = this.pool.find((l) => !l.alive);
    if (!line) return null;
    line.reset(this.nextId++, x, y, t, hue);
    this.current = line;
    return line;
  }

  end(life: number): InkLine | null {
    const l = this.current;
    this.current = null;
    if (l) l.finish(life);
    return l;
  }

  /** Süresi dolan çizgiler için onExpire çağrılır (çözülme efektleri) */
  update(dt: number, onExpire: (l: InkLine) => void): void {
    this.t += dt;
    for (const l of this.pool) {
      if (!l.alive) continue;
      for (let w = 0; w < l.wobN; w++) l.wob[w * 3 + 1] += dt;
      if (l.killT >= 0) {
        l.killT += dt;
        if (l.killT > 0.16) {
          l.alive = false;
          if (!l.shattered) onExpire(l);
        }
        continue;
      }
      if (l.drawing) continue;
      l.life -= dt;
      if (l.life <= 0) {
        l.alive = false;
        onExpire(l);
      }
    }
  }

  render(g: CanvasRenderingContext2D, pen: Pen, baseWidth: number): void {
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const l of this.pool) {
      if (!l.alive || l.n < 1) continue;
      const a = l.alpha();
      if (a <= 0.01) continue;
      const color = l.frozen > 0 ? '#CFF6FF' : pen.rainbow ? hsl(l.hue + this.t * 90, 95, 62) : pen.color;
      const n = l.n;
      // titreşim uygulanmış çizim noktaları
      for (let i = 0; i < n; i++) {
        let x = l.pts[i * 2];
        let y = l.pts[i * 2 + 1];
        if (l.wobN > 0 && n > 1) {
          const i0 = i > 0 ? i - 1 : i;
          const i1 = i < n - 1 ? i + 1 : i;
          let tx = l.pts[i1 * 2] - l.pts[i0 * 2];
          let ty = l.pts[i1 * 2 + 1] - l.pts[i0 * 2 + 1];
          const tl = Math.sqrt(tx * tx + ty * ty) || 1;
          tx /= tl;
          ty /= tl;
          let d = 0;
          const s = l.arc[i];
          for (let w = 0; w < l.wobN; w++) {
            const s0 = l.wob[w * 3];
            const wt = l.wob[w * 3 + 1];
            const amp = l.wob[w * 3 + 2];
            if (wt > 1.2) continue;
            const ds = (s - s0) / 70;
            d += amp * Math.exp(-4.5 * wt) * Math.sin(34 * wt - (s - s0) * 0.06) * Math.exp(-ds * ds);
          }
          x += -ty * d;
          y += tx * d;
        }
        RR[i * 2] = x;
        RR[i * 2 + 1] = y;
      }

      const flash = l.killT >= 0 ? 1 + (1 - l.killT / 0.16) * 1.5 : 1;
      const bw = baseWidth * (l.drawing ? 1.05 : 1);

      if (n >= 2) {
        // 1-2) ışıma geçişleri (merkez hat)
        g.strokeStyle = color;
        g.globalAlpha = 0.14 * a * flash;
        g.lineWidth = bw * 3.6;
        this.centerPath(g, n);
        g.stroke();
        g.globalAlpha = 0.3 * a * flash;
        g.lineWidth = bw * 1.8;
        g.stroke();

        // 3-4) fırça şeridi + beyaz-sıcak çekirdek
        this.ribbon(l, n, bw * 0.55);
        g.fillStyle = color;
        g.globalAlpha = 0.9 * a;
        this.fillRibbon(g, n);
        this.ribbon(l, n, bw * 0.2);
        g.fillStyle = pen.core;
        g.globalAlpha = 0.95 * a;
        this.fillRibbon(g, n);
      }

      // çizim ucu parıltısı
      if (l.drawing) {
        const x = RR[(n - 1) * 2];
        const y = RR[(n - 1) * 2 + 1];
        g.globalAlpha = 0.9;
        const s = 64 + Math.sin(this.t * 30) * 6;
        g.drawImage(this.sprites.glow(color), x - s / 2, y - s / 2, s, s);
        g.globalAlpha = 1;
        const s2 = 22;
        g.drawImage(this.sprites.glow(pen.core, true), x - s2 / 2, y - s2 / 2, s2, s2);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private centerPath(g: CanvasRenderingContext2D, n: number): void {
    g.beginPath();
    g.moveTo(RR[0], RR[1]);
    if (n === 2) {
      g.lineTo(RR[2], RR[3]);
      return;
    }
    for (let i = 1; i < n - 1; i++) {
      const mx = (RR[i * 2] + RR[i * 2 + 2]) * 0.5;
      const my = (RR[i * 2 + 1] + RR[i * 2 + 3]) * 0.5;
      g.quadraticCurveTo(RR[i * 2], RR[i * 2 + 1], mx, my);
    }
    g.lineTo(RR[(n - 1) * 2], RR[(n - 1) * 2 + 1]);
  }

  /** Kalınlığı değişken şerit kenarlarını hesaplar */
  private ribbon(l: InkLine, n: number, half: number): void {
    const len = Math.max(1, l.len);
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : i;
      const i1 = i < n - 1 ? i + 1 : i;
      let tx = RR[i1 * 2] - RR[i0 * 2];
      let ty = RR[i1 * 2 + 1] - RR[i0 * 2 + 1];
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= tl;
      ty /= tl;
      const s = l.arc[i];
      const taper = Math.min(1, 0.3 + s / 26) * Math.min(1, 0.3 + (len - s) / 26);
      const w = half * l.wid[i] * taper;
      LX[i * 2] = RR[i * 2] - ty * w;
      LX[i * 2 + 1] = RR[i * 2 + 1] + tx * w;
      RX[i * 2] = RR[i * 2] + ty * w;
      RX[i * 2 + 1] = RR[i * 2 + 1] - tx * w;
    }
  }

  private fillRibbon(g: CanvasRenderingContext2D, n: number): void {
    g.beginPath();
    g.moveTo(LX[0], LX[1]);
    for (let i = 1; i < n - 1; i++) {
      g.quadraticCurveTo(LX[i * 2], LX[i * 2 + 1], (LX[i * 2] + LX[i * 2 + 2]) * 0.5, (LX[i * 2 + 1] + LX[i * 2 + 3]) * 0.5);
    }
    g.lineTo(LX[(n - 1) * 2], LX[(n - 1) * 2 + 1]);
    // yuvarlak uç
    g.lineTo(RX[(n - 1) * 2], RX[(n - 1) * 2 + 1]);
    for (let i = n - 2; i > 0; i--) {
      g.quadraticCurveTo(RX[i * 2], RX[i * 2 + 1], (RX[i * 2] + RX[i * 2 - 2]) * 0.5, (RX[i * 2 + 1] + RX[i * 2 - 1]) * 0.5);
    }
    g.lineTo(RX[0], RX[1]);
    g.closePath();
    g.fill();
  }
}
