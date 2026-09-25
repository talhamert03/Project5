import './styles/main.css';
import './ui/strings';
import './ui/strings2';
import { App } from './app';

// Eski WebView (Chrome < 84): flex "gap" yoksa margin yedeklerini aç (vite.config.ts)
try {
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
  d.appendChild(document.createElement('div'));
  d.appendChild(document.createElement('div'));
  document.body.appendChild(d);
  if (d.scrollHeight !== 1) document.documentElement.classList.add('nfg');
  d.remove();
} catch {
  /* yoksay */
}

function boot(): void {
  const app = new App();
  app.start();
  if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
}

// Fontlar yüklenmeden canvas yazıları yedek fontla çizilmesin
const fontsReady = Promise.race([
  Promise.all([
    document.fonts?.load('800 32px "Unbounded Variable"'),
    document.fonts?.load('500 16px "Rubik Variable"'),
  ]).catch(() => undefined),
  new Promise((r) => setTimeout(r, 1500)),
]);
void fontsReady.then(boot);
