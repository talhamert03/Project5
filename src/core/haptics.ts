import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Titreşim: Android uygulamasında yerel Haptics eklentisi, tarayıcıda navigator.vibrate.
 * Aşırı titreşim hissi bozmasın diye her kanal kısıtlanır.
 */
class HapticsService {
  enabled = true;
  private native = false;
  private lastAt = 0;

  constructor() {
    try {
      this.native = Capacitor.isNativePlatform();
    } catch {
      this.native = false;
    }
  }

  private allow(gapMs: number): boolean {
    if (!this.enabled) return false;
    const now = performance.now();
    if (now - this.lastAt < gapMs) return false;
    this.lastAt = now;
    return true;
  }

  private vibrate(pattern: number | number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* desteklenmiyor */
    }
  }

  light(): void {
    if (!this.allow(45)) return;
    if (this.native) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    else this.vibrate(6);
  }

  medium(): void {
    if (!this.allow(60)) return;
    if (this.native) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
    else this.vibrate(16);
  }

  heavy(): void {
    if (!this.allow(80)) return;
    if (this.native) void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
    else this.vibrate([30, 30, 45]);
  }

  success(): void {
    if (!this.allow(100)) return;
    if (this.native) void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    else this.vibrate([12, 40, 12, 40, 24]);
  }

  error(): void {
    if (!this.allow(100)) return;
    if (this.native) void Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
    else this.vibrate([60, 50, 90]);
  }
}

export const haptics = new HapticsService();
