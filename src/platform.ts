import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

/** Yerel (Android) ve web arasındaki farkları tek yerde toplar. */
export const isNative = ((): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();

export function initNative(onBack: () => void, onPause: () => void): void {
  if (!isNative) return;
  void StatusBar.hide().catch(() => undefined);
  void CapApp.addListener('backButton', () => onBack());
  void CapApp.addListener('pause', () => onPause());
}

export function exitApp(): void {
  if (isNative) void CapApp.exitApp();
}

// Ekran kilidi: oyun sırasında ekran kararmasın
type WakeLockSentinelLike = { release: () => Promise<void> };
let lock: WakeLockSentinelLike | null = null;

export async function keepAwake(on: boolean): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
  try {
    if (on && !lock && nav.wakeLock) {
      lock = await nav.wakeLock.request('screen');
    } else if (!on && lock) {
      const l = lock;
      lock = null;
      await l.release();
    }
  } catch {
    lock = null;
  }
}

export const canFullscreen = (): boolean => !isNative && typeof document.documentElement.requestFullscreen === 'function';

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* gömülü görünümlerde izin verilmeyebilir */
  }
}

export const isTouch = (): boolean => matchMedia('(pointer: coarse)').matches;
