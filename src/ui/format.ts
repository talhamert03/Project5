import { getLang, t } from '../i18n';

let nf: Intl.NumberFormat | null = null;
let nfLang = '';

/** Binlik ayraçlı sayı (tr: 12.340, en: 12,340) */
export function fmt(n: number): string {
  const lang = getLang();
  if (!nf || nfLang !== lang) {
    nf = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 0 });
    nfLang = lang;
  }
  return nf.format(Math.floor(n));
}

export function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? t('common.hm', { h, m: m % 60 }) : t('common.min', { m });
}

export const roman = (n: number): string => ['', 'I', 'II', 'III'][n] ?? '';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
