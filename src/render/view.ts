import { clamp } from '../core/math';
import type { Quality } from '../core/storage';

/** Mantıksal oyun alanı genişliği. Yükseklik ekran oranına göre esner. */
export const WORLD_W = 720;
const MIN_H = 1080;
const MAX_H = 1700;

/**
 * Canvas boyutlandırma ve dünya->piksel dönüşümü.
 * Tüm oyun mantığı WORLD_W x H mantıksal birimde çalışır, her cihazda aynı hisseder.
 */
export class View {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** CSS piksel boyutları */
  cssW = 1;
  cssH = 1;
  dpr = 1;
  /** Mantıksal dünya yüksekliği */
  H = 1280;
  /** 1 dünya birimi = scale CSS piksel */
  scale = 1;
  offX = 0;
  offY = 0;
  quality: Quality = 'high';
  /** Dinamik çözünürlük çarpanı (0.6..1): akıcılık düşerse iner, toparlanınca geri çıkar */
  adaptive = 1;
  /**
   * Gökyüzü sahnesinin (bulutsu, ebru damarları, yıldızlar) hazırlandığı yoğunluk: ekranın gerçek
   * yoğunluğu (bellek bütçesiyle). Dinamik çözünürlükten bağımsızdır; tuval tam yoğunluktayken
   * damarlar ekranda piksel piksel keskin görünür.
   */
  skyDpr = 1;
  private listeners: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // desynchronized: düşük gecikmeli tuval (dokunuş -> ekran arası en kısa yol)
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas 2D desteklenmiyor');
    this.ctx = ctx;
    this.resize();
    // aynı karede gelen boyut olaylarını birleştir (gökyüzü tek kez yeniden çizilir)
    let queued = false;
    const onResize = (): void => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        this.resize(false);
      });
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
  }

  onResize(fn: () => void): void {
    this.listeners.push(fn);
  }

  /**
   * Kaliteye göre en yüksek yoğunluk (dinamik çarpan hariç). Yüksek: ekranın gerçek yoğunluğu
   * (HD, en fazla 3x). Piksel bütçesi tabletlerde tuvalin GPU'yu boğmasını önler: 3,4 MP bir
   * 1080p telefonu tam karşılar, büyük tabletlerde ~1,8x'e iner (yine keskin).
   */
  baseDpr(): number {
    const cap = this.quality === 'high' ? 3 : this.quality === 'balanced' ? 2 : 1.3;
    const budget = this.quality === 'high' ? 3.4e6 : this.quality === 'balanced' ? 2.2e6 : 1.2e6;
    const area = Math.max(1, window.innerWidth * window.innerHeight);
    return Math.max(1, Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(budget / area)));
  }

  maxDpr(): number {
    return Math.max(1, this.baseDpr() * this.adaptive);
  }

  /**
   * force=false iken yalnızca piksel yoğunluğu değiştiyse (otomatik kalite) dinleyiciler çağrılmaz:
   * önbellekli görseller yeni tuvale ölçeklenerek kullanılır, yeniden çizim takılması olmaz.
   */
  resize(force = true): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const layout = force || w !== this.cssW || h !== this.cssH;
    this.cssW = w;
    this.cssH = h;
    this.dpr = this.maxDpr();
    if (layout) this.skyDpr = this.baseDpr();
    const pw = Math.round(w * this.dpr);
    const ph = Math.round(h * this.dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const aspect = h / w;
    this.H = clamp(WORLD_W * aspect, MIN_H, MAX_H);
    this.scale = Math.min(w / WORLD_W, h / this.H);
    this.offX = (w - WORLD_W * this.scale) / 2;
    this.offY = (h - this.H * this.scale) / 2;
    if (layout) for (const fn of this.listeners) fn();
  }

  /** Oyun alanı ekranı tamamen kaplamıyorsa (tablet/masaüstü) true */
  get letterboxed(): boolean {
    return this.offX > 1 || this.offY > 1;
  }

  /** Ekran (CSS px) -> dünya */
  toWorldX(cx: number): number {
    return (cx - this.offX) / this.scale;
  }

  toWorldY(cy: number): number {
    return (cy - this.offY) / this.scale;
  }

  /** Dünya -> CSS piksel */
  toScreenX(x: number): number {
    return this.offX + x * this.scale;
  }

  toScreenY(y: number): number {
    return this.offY + y * this.scale;
  }

  setWorldTransform(shakeX = 0, shakeY = 0, rot = 0): void {
    const k = this.scale * this.dpr;
    const tx = (this.offX + shakeX * this.scale) * this.dpr;
    const ty = (this.offY + shakeY * this.scale) * this.dpr;
    this.ctx.setTransform(k, 0, 0, k, tx, ty);
    if (rot !== 0) {
      // Oyun alanı merkezi etrafında hafif sarsıntı dönmesi
      this.ctx.translate(WORLD_W / 2, this.H / 2);
      this.ctx.rotate(rot);
      this.ctx.translate(-WORLD_W / 2, -this.H / 2);
    }
  }

  setPixelTransform(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
