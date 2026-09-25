export type Quality = 'high' | 'balanced' | 'saver';
export type Lang = 'auto' | 'tr' | 'en';

export interface MissionState {
  /** şablon kimliği */
  id: string;
  /** zorluk seviyesi (her tamamlanışta artar) */
  tier: number;
  progress: number;
  target: number;
  reward: number;
}

export interface RunRecord {
  score: number;
  wave: number;
  date: string;
  daily?: boolean;
}

export interface Settings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  quality: Quality;
  lang: Lang;
  showFps: boolean;
}

export interface SaveData {
  v: number;
  coins: number;
  best: number;
  bestWave: number;
  bestCombo: number;
  totalRuns: number;
  totalKills: number;
  totalGolden: number;
  totalPlaySec: number;
  bossKills: number;
  records: RunRecord[];
  workshop: Record<string, number>;
  pens: string[];
  pen: string;
  missions: MissionState[];
  missionTiers: Record<string, number>;
  daily: { date: string; best: number; attempts: number };
  streak: { last: string; count: number };
  settings: Settings;
  tutorialDone: boolean;
  /** Oyuncunun ulaştığı en yüksek rütbe indeksi (rütbe atlama kutlaması için) */
  rankSeen: number;
  /** ulaşılan en uzak atmosfer (dünya) indeksi */
  maxAtm: number;
  /** menü arka planında gösterilen dünya */
  menuAtm: number;
  /** günlük hediye: son alınan gün ve 7 günlük döngüdeki sıra */
  gift: { last: string; day: number };
  /** Reklamsız paket: ödüllü videoların ödülü anında verilir */
  noAds: boolean;
  /** başlangıç paketi (tek sefer) alındı mı */
  starter: boolean;
  /** açılan yetenekler ve takılı olan */
  skills: string[];
  skill: string;
  /** günlük ücretsiz altın videoları */
  adCoins: { date: string; n: number };
}

const KEY = 'murekkep-kalkani/save/v1';

export function defaultSave(): SaveData {
  return {
    v: 1,
    coins: 0,
    best: 0,
    bestWave: 0,
    bestCombo: 0,
    totalRuns: 0,
    totalKills: 0,
    totalGolden: 0,
    totalPlaySec: 0,
    bossKills: 0,
    records: [],
    workshop: {},
    pens: ['turkuaz'],
    pen: 'turkuaz',
    missions: [],
    missionTiers: {},
    daily: { date: '', best: 0, attempts: 0 },
    streak: { last: '', count: 0 },
    settings: {
      music: true,
      sfx: true,
      haptics: true,
      quality: 'high',
      lang: 'auto',
      showFps: false,
    },
    tutorialDone: false,
    rankSeen: 0,
    maxAtm: 0,
    menuAtm: 0,
    gift: { last: '', day: 0 },
    noAds: false,
    starter: false,
    skills: ['nova'],
    skill: 'nova',
    adCoins: { date: '', n: 0 },
  };
}

/** localStorage bazı ortamlarda (gizli sekme, önizleme) hata fırlatabilir: her erişim korumalı. */
export function loadSave(): SaveData {
  const def = defaultSave();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...def,
      ...parsed,
      settings: { ...def.settings, ...(parsed.settings ?? {}) },
      daily: { ...def.daily, ...(parsed.daily ?? {}) },
      streak: { ...def.streak, ...(parsed.streak ?? {}) },
      gift: { ...def.gift, ...(parsed.gift ?? {}) },
      adCoins: { ...def.adCoins, ...(parsed.adCoins ?? {}) },
      skills: Array.isArray(parsed.skills) && parsed.skills.length ? parsed.skills : def.skills,
      workshop: { ...(parsed.workshop ?? {}) },
      missionTiers: { ...(parsed.missionTiers ?? {}) },
      pens: Array.isArray(parsed.pens) && parsed.pens.length ? parsed.pens : def.pens,
      records: Array.isArray(parsed.records) ? parsed.records : [],
      missions: Array.isArray(parsed.missions) ? parsed.missions : [],
    };
  } catch {
    return def;
  }
}

export function writeSave(data: SaveData): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* depolama kapalıysa oyun bellekte devam eder */
  }
}
