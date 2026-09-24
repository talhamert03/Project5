import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Tek dosyalık çıktı: hem Capacitor (Android) hem de tarayıcıda denemek için
// tüm JS, CSS ve fontlar index.html içine gömülür. Oyun internetsiz çalışır.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
  server: { host: true },
});
