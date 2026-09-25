// Android ikonları, açılış ekranları ve Play Store görsellerini üretir.
// Kullanım: CHROME_PATH=/yol/chrome node scripts/gen-icons.mjs
// (playwright-core geliştirme bağımlılığıdır; herhangi bir Chromium yeterli)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const RES = 'android/app/src/main/res';
const exe = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const font = (f) => readFileSync(`src/assets/fonts/${f}`).toString('base64');
const art = readFileSync('scripts/icon-art.js', 'utf8');

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head><style>
@font-face{font-family:'Unbounded Variable';font-weight:200 900;src:url(data:font/woff2;base64,${font('unbounded-latin.woff2')}) format('woff2')}
@font-face{font-family:'Unbounded Variable';font-weight:200 900;src:url(data:font/woff2;base64,${font('unbounded-tr.woff2')}) format('woff2');unicode-range:U+011E-011F,U+0130-0131,U+015E-015F}
@font-face{font-family:'Rubik Variable';font-weight:300 900;src:url(data:font/woff2;base64,${font('rubik-latin.woff2')}) format('woff2')}
@font-face{font-family:'Rubik Variable';font-weight:300 900;src:url(data:font/woff2;base64,${font('rubik-tr.woff2')}) format('woff2');unicode-range:U+011E-011F,U+0130-0131,U+015E-015F}
</style></head><body><script>${art}</script></body></html>`);
await page.evaluate(() => Promise.all([document.fonts.load('900 40px "Unbounded Variable"'), document.fonts.load('500 20px "Rubik Variable"')]));

async function render(w, h, fn) {
  const data = await page.evaluate(
    ({ w, h, fn }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      new Function('c', fn)(c);
      return c.toDataURL('image/png');
    },
    { w, h, fn },
  );
  return Buffer.from(data.split(',')[1], 'base64');
}

const save = (path, buf) => {
  writeFileSync(path, buf);
  console.log('✓', path);
};

// Başlatıcı ikonları (dp -> px)
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  const dir = join(RES, `mipmap-${d}`);
  save(join(dir, 'ic_launcher.png'), await render(48 * k, 48 * k, "drawIcon(c,'legacy')"));
  save(join(dir, 'ic_launcher_round.png'), await render(48 * k, 48 * k, "drawIcon(c,'round')"));
  save(join(dir, 'ic_launcher_foreground.png'), await render(108 * k, 108 * k, "drawIcon(c,'fg')"));
  save(join(dir, 'ic_launcher_background.png'), await render(108 * k, 108 * k, "drawIcon(c,'bg')"));
}

// Açılış ekranı: res/drawable/splash.xml ön plan ikonunu kullanır (ayrı PNG gerekmez)

// Play Store (tanıtım görselleri PNG üretilir; yüklemeden önce JPEG'e çevrilebilir)
save('store/icon-512.png', await render(512, 512, "drawIcon(c,'full')"));
save('store/feature-graphic-tr.png', await render(1024, 500, "drawFeature(c,'INK','FALL','Çiz. Sektir. Şehri meteordan kurtar.')"));
save('store/feature-graphic-en.png', await render(1024, 500, "drawFeature(c,'INK','FALL','Draw. Deflect. Save the city.')"));
await browser.close();
