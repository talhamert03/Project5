import './styles/main.css';
import './ui/strings';
import { App } from './app';

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
