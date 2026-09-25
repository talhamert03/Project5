import { type Plugin, defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Eski WebView'lar (Nox/MEmu gibi emülatörler, Android 7-9) color-mix() bilmez; bu durumda
 * kural tamamen yok sayılır (kenarlık/arka plan kaybolur). Her color-mix bildiriminin önüne
 * aynı özellik için basit bir yedek renk eklenir: yeni tarayıcılar ikinciyi, eskiler ilkini kullanır.
 */
function colorMixFallback(): Plugin {
  const MIX = /color-mix\(\s*in srgb\s*,\s*([^,()]+(?:\([^()]*\))?)\s+(\d+(?:\.\d+)?)%\s*,\s*([^()]+?)\s*\)/g;
  const fallback = (value: string): string =>
    value.replace(MIX, (_m, a: string, p: string, b: string) => {
      const pct = Number(p) / 100;
      // saydama karışım: tarafsız yarı saydam beyaz; koyu renge karışım: ana renk
      return b.trim() === 'transparent' ? `rgba(255, 255, 255, ${(pct * 0.45).toFixed(3)})` : a.trim();
    });
  return {
    name: 'color-mix-fallback',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.css')) return null;
      const out = code.replace(/^(\s*)([a-z-]+):([^;{}]*color-mix\([^;{}]*);/gm, (_m, ind: string, prop: string, val: string) => {
        const fb = fallback(val);
        return fb.includes('color-mix') ? `${ind}${prop}:${val};` : `${ind}${prop}:${fb};\n${ind}${prop}:${val};`;
      });
      return { code: out, map: null };
    },
  };
}

/**
 * Flex "gap" Chrome 84 öncesinde yoktur (eski emülatör WebView'ları): boşluklar kaybolur.
 * Her flex + gap kuralı için `.nfg` sınıfı altında margin tabanlı yedek üretilir; sınıf,
 * açılışta tarayıcı flex gap desteklemiyorsa eklenir (main.ts).
 */
function flexGapFallback(): Plugin {
  return {
    name: 'flex-gap-fallback',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.css')) return null;
      const extra: string[] = [];
      const rule = /([^{}@;]+)\{([^{}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = rule.exec(code))) {
        const sel = m[1].trim();
        const body = m[2];
        if (!/display:\s*(inline-)?flex\b/.test(body)) continue;
        const gap = /(?:^|;|\s)gap:\s*([^;]+);/.exec(body);
        if (!gap || sel.startsWith('@') || sel.includes('%') || /^(from|to)$/.test(sel)) continue;
        const parts = gap[1].trim().split(/\s+/);
        const rowGap = parts[0];
        const colGap = parts[1] ?? parts[0];
        const column = /flex-direction:\s*column/.test(body);
        const sels = sel.split(',').map((x) => x.trim()).filter(Boolean);
        const target = sels.map((x) => `.nfg ${x} > * + *`).join(', ');
        extra.push(`${target} { margin-${column ? 'top' : 'left'}: ${column ? rowGap : colGap}; }`);
      }
      if (!extra.length) return null;
      return { code: `${code}\n/* flex gap yedekleri (eski WebView) */\n${extra.join('\n')}\n`, map: null };
    },
  };
}

// Tek dosyalık çıktı: hem Capacitor (Android) hem de tarayıcıda denemek için
// tüm JS, CSS ve fontlar index.html içine gömülür. Oyun internetsiz çalışır.
export default defineConfig({
  base: './',
  plugins: [colorMixFallback(), flexGapFallback(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    // Android 7+ WebView (Chrome 61+): emülatörler ve eski telefonlar için sözdizimi düşürülür
    target: ['es2017', 'chrome61'],
    // CSS de eski WebView'a göre (inset -> top/right/bottom/left vb.)
    cssTarget: ['chrome61'],
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  server: { host: true },
});
