import type { Lang } from './core/storage';

type Dict = Record<string, string>;

const tr: Dict = {
  // oyun içi yazılar
  'w.combo.10': 'HARİKA!',
  'w.combo.25': 'MUHTEŞEM!',
  'w.combo.50': 'EFSANE!',
  'w.combo.75': 'DURDURULAMAZ!',
  'w.combo.100': 'HATTAT!',
  'w.combo.150': 'ÜSTAD!',
  'w.combo.200': 'İSTANBUL SENİNLE!',
  'w.comboBreak': 'KOMBO KIRILDI',
  'w.comboBonus': 'KOMBO BONUSU',
  'w.record': 'YENİ REKOR!',
  'w.perfect': 'KUSURSUZ!',
  'w.dome': 'KUBBE!',
  'w.bossDown': 'KIZIL DEV DÜŞTÜ!',
  'w.phoenix': 'ANKA KUŞU!',
  'w.chain': 'ZİNCİR x{n}',
  'w.retry': 'Tekrar dene',
  'w.great': 'Harika!',
  'w.nice': 'Güzel!',
  'w.escaped': 'kaçtı',
  'w.armor': 'ZIRH!',
  'w.repair': 'ONARILDI',
  'w.inkEmpty': 'MÜREKKEP BİTTİ',
};

const en: Dict = {
  'w.combo.10': 'GREAT!',
  'w.combo.25': 'AMAZING!',
  'w.combo.50': 'LEGENDARY!',
  'w.combo.75': 'UNSTOPPABLE!',
  'w.combo.100': 'CALLIGRAPHER!',
  'w.combo.150': 'GRANDMASTER!',
  'w.combo.200': 'ISTANBUL IS WITH YOU!',
  'w.comboBreak': 'COMBO BROKEN',
  'w.comboBonus': 'COMBO BONUS',
  'w.record': 'NEW RECORD!',
  'w.perfect': 'PERFECT!',
  'w.dome': 'DOME!',
  'w.bossDown': 'RED GIANT DOWN!',
  'w.phoenix': 'PHOENIX!',
  'w.chain': 'CHAIN x{n}',
  'w.retry': 'Try again',
  'w.great': 'Great!',
  'w.nice': 'Nice!',
  'w.escaped': 'escaped',
  'w.armor': 'ARMOR!',
  'w.repair': 'REPAIRED',
  'w.inkEmpty': 'OUT OF INK',
};

const dicts: Record<'tr' | 'en', Dict> = { tr, en };
let current: 'tr' | 'en' = 'tr';

export function setLang(lang: Lang): void {
  if (lang === 'auto') {
    const nav = (navigator.language || 'tr').toLowerCase();
    current = nav.startsWith('tr') ? 'tr' : 'en';
  } else {
    current = lang;
  }
  document.documentElement.lang = current;
}

export function getLang(): 'tr' | 'en' {
  return current;
}

export function extend(lang: 'tr' | 'en', entries: Dict): void {
  Object.assign(dicts[lang], entries);
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? dicts.tr[key] ?? key;
  if (params) {
    for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  }
  return s;
}
