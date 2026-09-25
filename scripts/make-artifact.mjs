// dist/index.html (tek dosya) -> artifact/murekkep-kalkani.html
// claude.ai Artifact sayfası kendi <html>/<head>/<body> iskeletini ekler; bu yüzden
// yalnızca başlık, stiller, oyun işaretlemesi ve betik kalır.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);

const title = (html.match(/<title>[\s\S]*?<\/title>/) ?? ['<title>Inkfall</title>'])[0];
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script[^>]*>[\s\S]*?<\/script>/g);
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) ?? ['', ''])[1]
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

const out = [title, ...styles, body, ...scripts].join('\n');
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/murekkep-kalkani.html', out);
console.log(`artifact/murekkep-kalkani.html  ${(out.length / 1024).toFixed(1)} KB`);
