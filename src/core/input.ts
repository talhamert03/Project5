import type { View } from '../render/view';

export interface PointerSink {
  pointerDown(x: number, y: number, t: number): void;
  pointerMove(x: number, y: number, t: number): void;
  pointerUp(): void;
}

/**
 * Tek parmak çizim girişi. getCoalescedEvents ile 120-240Hz dokunmatik örnekleri
 * kaybetmeden alır, böylece hızlı çizilen çizgiler bile pürüzsüz olur.
 */
export class Input {
  private activeId: number | null = null;
  sink: PointerSink | null = null;
  enabled = true;

  constructor(
    private el: HTMLElement,
    private view: View,
  ) {
    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener('pointerdown', (e) => this.down(e), opts);
    el.addEventListener('pointermove', (e) => this.move(e), opts);
    el.addEventListener('pointerup', (e) => this.up(e), opts);
    el.addEventListener('pointercancel', (e) => this.up(e), opts);
    el.addEventListener('lostpointercapture', (e) => this.up(e), opts);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari: çift dokunma yakınlaştırma ve jestleri engelle
    el.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    document.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
  }

  /** Ekran dışına kaymış bir parmağı güvenle bırak (duraklatma vb.) */
  cancel(): void {
    if (this.activeId !== null) {
      this.activeId = null;
      this.sink?.pointerUp();
    }
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    if (!this.enabled || this.activeId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.activeId = e.pointerId;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* bazı webview'larda desteklenmez */
    }
    this.sink?.pointerDown(this.view.toWorldX(e.clientX), this.view.toWorldY(e.clientY), e.timeStamp);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) return;
    e.preventDefault();
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    if (list && list.length > 0) {
      for (const ce of list) {
        this.sink?.pointerMove(this.view.toWorldX(ce.clientX), this.view.toWorldY(ce.clientY), ce.timeStamp);
      }
    } else {
      this.sink?.pointerMove(this.view.toWorldX(e.clientX), this.view.toWorldY(e.clientY), e.timeStamp);
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    this.sink?.pointerUp();
  }
}
