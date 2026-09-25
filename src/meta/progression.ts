import { dayDiff, hashString, todayKey } from '../core/rng';
import type { MissionState, SaveData } from '../core/storage';
import type { DailyMod, MetaBonus, RunResult } from '../game/world';

// ───────────────────────── RÜTBELER ─────────────────────────
// Hat sanatı ustalık basamakları: Çırak → Kalfa → Usta → Hattat → Üstad → Efsane

export interface Rank {
  key: string;
  tier: number;
  min: number;
  color: string;
}

export const RANKS: Rank[] = [
  { key: 'cirak', tier: 1, min: 0, color: '#B9A58C' },
  { key: 'cirak', tier: 2, min: 1500, color: '#B9A58C' },
  { key: 'cirak', tier: 3, min: 3500, color: '#B9A58C' },
  { key: 'kalfa', tier: 1, min: 6000, color: '#C9D3E6' },
  { key: 'kalfa', tier: 2, min: 9000, color: '#C9D3E6' },
  { key: 'kalfa', tier: 3, min: 13000, color: '#C9D3E6' },
  { key: 'usta', tier: 1, min: 18000, color: '#FFC857' },
  { key: 'usta', tier: 2, min: 24000, color: '#FFC857' },
  { key: 'usta', tier: 3, min: 31000, color: '#FFC857' },
  { key: 'hattat', tier: 1, min: 40000, color: '#3EF0E0' },
  { key: 'hattat', tier: 2, min: 52000, color: '#3EF0E0' },
  { key: 'hattat', tier: 3, min: 66000, color: '#3EF0E0' },
  { key: 'ustad', tier: 0, min: 85000, color: '#B57BFF' },
  { key: 'efsane', tier: 0, min: 120000, color: '#FF4F8B' },
];

export function rankIndex(score: number): number {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].min) idx = i;
  return idx;
}

export interface RankProgress {
  idx: number;
  rank: Rank;
  next: Rank | null;
  frac: number;
  need: number;
}

export function rankProgress(score: number): RankProgress {
  const idx = rankIndex(score);
  const rank = RANKS[idx];
  const next = RANKS[idx + 1] ?? null;
  if (!next) return { idx, rank, next, frac: 1, need: 0 };
  const frac = (score - rank.min) / (next.min - rank.min);
  return { idx, rank, next, frac: Math.max(0, Math.min(1, frac)), need: next.min - score };
}

// ───────────────────────── ATÖLYE ─────────────────────────

export interface WorkshopItem {
  id: string;
  max: number;
  icon: string;
  cost: (level: number) => number;
}

export const WORKSHOP: WorkshopItem[] = [
  { id: 'ink', max: 5, icon: 'well', cost: (l) => Math.round(120 * Math.pow(1.75, l)) },
  { id: 'regen', max: 5, icon: 'drop', cost: (l) => Math.round(140 * Math.pow(1.75, l)) },
  { id: 'dome', max: 3, icon: 'dome', cost: (l) => Math.round(400 * Math.pow(2.2, l)) },
  { id: 'reroll', max: 3, icon: 'reroll', cost: (l) => Math.round(300 * Math.pow(2, l)) },
  { id: 'coin', max: 5, icon: 'coin', cost: (l) => Math.round(200 * Math.pow(1.8, l)) },
  { id: 'golden', max: 3, icon: 'star', cost: (l) => Math.round(250 * Math.pow(2, l)) },
  { id: 'start', max: 2, icon: 'card', cost: (l) => (l === 0 ? 900 : 2600) },
];

export function metaBonus(save: SaveData): MetaBonus {
  const w = (id: string): number => save.workshop[id] ?? 0;
  return {
    maxInk: w('ink') * 12,
    regenMult: 1 + w('regen') * 0.08,
    domeStart: w('dome'),
    coinMult: 1 + w('coin') * 0.1,
    goldenBonus: w('golden') * 0.012,
    rerolls: w('reroll'),
    startRarity: w('start') > 0 ? w('start') : -1,
  };
}

// ───────────────────────── YETENEKLER ─────────────────────────

export type SkillShape = 'circle' | 'triangle' | 'square' | 'zigzag';

export interface SkillDef {
  id: 'nova' | 'warp' | 'aegis' | 'starfall';
  /** açma bedeli (0: başlangıçta açık) */
  price: number;
  icon: string;
  color: string;
  /** oyunda bu şekli çizince atılır */
  shape: SkillShape;
  /** seviye 1-3 bekleme süresi (sn) */
  cd: [number, number, number];
  /** seviye 1-3 gücü (süre sn / sayı / boss hasarı) */
  power: [number, number, number];
  /** 2. ve 3. seviye bedelleri */
  up: [number, number];
}

export const SKILL_MAX_LV = 3;

/**
 * Yetenek ağacı: açılan her yetenek oyunda şeklini çizince atılır (bekleme süresiyle).
 * Seviye atlatmak bekleme süresini kısaltır ve gücü artırır.
 */
export const SKILLS: SkillDef[] = [
  { id: 'nova', price: 0, icon: 'burst', color: '#FFFFFF', shape: 'circle', cd: [40, 34, 28], power: [3, 4, 6], up: [900, 2400] },
  { id: 'warp', price: 1500, icon: 'clock', color: '#6EC8FF', shape: 'triangle', cd: [36, 31, 26], power: [5, 6.5, 8], up: [1400, 3400] },
  { id: 'aegis', price: 2800, icon: 'shield', color: '#3EF0E0', shape: 'square', cd: [46, 40, 34], power: [6, 8, 10], up: [1900, 4400] },
  { id: 'starfall', price: 4200, icon: 'stars', color: '#FFC857', shape: 'zigzag', cd: [40, 34, 28], power: [12, 16, 22], up: [2400, 5400] },
];

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id as string, s]));

/** Sıradaki seviyenin bedeli (en üst seviyedeyse -1) */
export function skillUpCost(k: SkillDef, lv: number): number {
  return lv >= SKILL_MAX_LV ? -1 : k.up[lv - 1];
}

// ───────────────────────── GÜNLÜK MEYDAN OKUMA ─────────────────────────

export const DAILY_MODS: DailyMod[] = [
  { id: 'storm', speed: 1.28, scoreMult: 1.5 },
  { id: 'goldrush', golden: 4 },
  { id: 'shortink', lineLife: 0.55, scoreMult: 1.3 },
  { id: 'giants', size: 1.35, speed: 0.85 },
  { id: 'chaos', chaos: true, scoreMult: 1.25 },
  { id: 'mirrorday', startUpgrade: 'mirror' },
  { id: 'oneline', maxLines: 1, scoreMult: 1.6 },
];

export interface DailyInfo {
  key: string;
  seed: number;
  mod: DailyMod;
}

export function dailyInfo(date = new Date()): DailyInfo {
  const key = todayKey(date);
  const seed = hashString('mk-daily-' + key);
  return { key, seed, mod: DAILY_MODS[seed % DAILY_MODS.length] };
}

// ───────────────────────── GÖREVLER ─────────────────────────

type StatKey = 'kills' | 'maxCombo' | 'wave' | 'score' | 'perfectWaves' | 'bossKills' | 'golden' | 'maxLineDeflect' | 'maxChain' | 'deflects' | 'daily';

interface MissionTemplate {
  id: string;
  stat: StatKey;
  /** run: tek oyunda ulaş, total: oyunlar boyunca biriktir */
  mode: 'run' | 'total';
  targets: number[];
  rewards: number[];
}

export const MISSIONS: MissionTemplate[] = [
  { id: 'kills', stat: 'kills', mode: 'run', targets: [20, 40, 70, 110, 160, 230, 320], rewards: [60, 90, 130, 180, 240, 320, 420] },
  { id: 'combo', stat: 'maxCombo', mode: 'run', targets: [10, 20, 35, 55, 80, 120, 160], rewards: [60, 100, 150, 210, 280, 360, 460] },
  { id: 'wave', stat: 'wave', mode: 'run', targets: [3, 5, 7, 10, 13, 16, 20, 25], rewards: [50, 90, 140, 200, 270, 350, 450, 600] },
  { id: 'score', stat: 'score', mode: 'run', targets: [3000, 8000, 16000, 30000, 50000, 80000, 120000], rewards: [60, 110, 170, 240, 320, 420, 560] },
  { id: 'perfect', stat: 'perfectWaves', mode: 'run', targets: [1, 2, 4, 6, 9, 12], rewards: [50, 90, 150, 220, 300, 400] },
  { id: 'boss', stat: 'bossKills', mode: 'total', targets: [1, 2, 4, 7, 10, 15], rewards: [100, 160, 240, 330, 440, 600] },
  { id: 'golden', stat: 'golden', mode: 'total', targets: [2, 5, 10, 18, 30, 50], rewards: [60, 100, 150, 220, 300, 420] },
  { id: 'oneline', stat: 'maxLineDeflect', mode: 'run', targets: [2, 3, 4, 5, 6, 8], rewards: [60, 110, 170, 250, 340, 460] },
  { id: 'chain', stat: 'maxChain', mode: 'run', targets: [3, 5, 7, 9, 12, 16], rewards: [60, 110, 170, 250, 340, 460] },
  { id: 'deflects', stat: 'deflects', mode: 'total', targets: [40, 100, 200, 350, 600, 1000], rewards: [50, 90, 140, 200, 280, 380] },
  { id: 'daily', stat: 'daily', mode: 'total', targets: [1, 3, 7, 14, 30], rewards: [80, 150, 250, 400, 700] },
];

const MISSION_BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));

function makeMission(id: string, tier: number): MissionState {
  const tpl = MISSION_BY_ID.get(id)!;
  const i = Math.min(tier, tpl.targets.length - 1);
  // son kademeden sonra hedefler büyümeye devam eder
  const over = Math.max(0, tier - (tpl.targets.length - 1));
  const target = Math.round(tpl.targets[i] * Math.pow(1.35, over));
  const reward = Math.round(tpl.rewards[i] * Math.pow(1.2, over));
  return { id, tier, progress: 0, target, reward };
}

export function ensureMissions(save: SaveData): void {
  save.missions = save.missions.filter((m) => MISSION_BY_ID.has(m.id));
  let guard = 0;
  while (save.missions.length < 3 && guard++ < 50) {
    const active = new Set(save.missions.map((m) => m.id));
    const free = MISSIONS.filter((m) => !active.has(m.id));
    const pick = free[Math.floor(Math.random() * free.length)];
    save.missions.push(makeMission(pick.id, save.missionTiers[pick.id] ?? 0));
  }
}

export interface MissionDone {
  id: string;
  target: number;
  reward: number;
}

export function missionStat(m: MissionState): StatKey {
  return MISSION_BY_ID.get(m.id)?.stat ?? 'kills';
}

/** Oyun sonucu ile görevleri ilerletir, tamamlananları ödüllendirip yerine yenisini koyar */
export function progressMissions(save: SaveData, r: RunResult): MissionDone[] {
  const done: MissionDone[] = [];
  const value = (k: StatKey): number => (k === 'daily' ? (r.daily ? 1 : 0) : r[k]);
  for (let i = 0; i < save.missions.length; i++) {
    const m = save.missions[i];
    const tpl = MISSION_BY_ID.get(m.id);
    if (!tpl) continue;
    const v = value(tpl.stat);
    if (tpl.mode === 'run') m.progress = Math.max(m.progress, v);
    else m.progress += v;
    if (m.progress >= m.target) {
      done.push({ id: m.id, target: m.target, reward: m.reward });
      save.coins += m.reward;
      save.missionTiers[m.id] = (save.missionTiers[m.id] ?? 0) + 1;
      // yerine farklı bir görev
      const active = new Set(save.missions.map((x) => x.id));
      const free = MISSIONS.filter((x) => !active.has(x.id));
      const pick = free.length ? free[Math.floor(Math.random() * free.length)] : tpl;
      save.missions[i] = makeMission(pick.id, save.missionTiers[pick.id] ?? 0);
    }
  }
  return done;
}

// ───────────────────────── OYUN SONU ─────────────────────────

export interface Settlement {
  coins: number;
  newBest: boolean;
  prevBest: number;
  rankBefore: number;
  rankAfter: number;
  missions: MissionDone[];
  streakBonus: number;
  dailyBest: boolean;
}

/** Oyun sonucu: altın, rekor, rütbe, günlük, seri, görevler. Kayda yazar. */
export function settleRun(save: SaveData, r: RunResult, coinMult: number): Settlement {
  const prevBest = save.best;
  const rankBefore = rankIndex(prevBest);
  const scoreCoins = Math.floor(r.score / 120) + r.wave * 3;
  let coins = Math.round(scoreCoins * coinMult) + r.coins;
  if (r.daily) coins = Math.round(coins * 1.5);

  save.totalRuns++;
  save.totalKills += r.kills;
  save.totalGolden += r.golden;
  save.totalPlaySec += Math.round(r.time);
  save.bossKills += r.bossKills;
  save.bestWave = Math.max(save.bestWave, r.wave);
  save.bestCombo = Math.max(save.bestCombo, r.maxCombo);
  const newBest = r.score > save.best;
  if (newBest) save.best = r.score;

  const today = todayKey();
  let dailyBest = false;
  if (r.daily) {
    if (save.daily.date !== today) save.daily = { date: today, best: 0, attempts: 0 };
    save.daily.attempts++;
    if (r.score > save.daily.best) {
      save.daily.best = r.score;
      dailyBest = true;
    }
  }

  // günlük seri: her gün en az bir oyun
  let streakBonus = 0;
  if (save.streak.last !== today) {
    const gap = save.streak.last ? dayDiff(save.streak.last, today) : 99;
    save.streak.count = gap === 1 ? save.streak.count + 1 : 1;
    save.streak.last = today;
    streakBonus = Math.min(save.streak.count, 7) * 25;
    coins += streakBonus;
  }

  save.records.push({ score: r.score, wave: r.wave, date: today, daily: r.daily || undefined });
  save.records.sort((a, b) => b.score - a.score);
  save.records = save.records.slice(0, 10);

  save.coins += coins;
  const missions = progressMissions(save, r);
  ensureMissions(save);
  const rankAfter = rankIndex(save.best);
  return { coins, newBest, prevBest, rankBefore, rankAfter, missions, streakBonus, dailyBest };
}

// ───────────────────────── GÜNLÜK HEDİYE ─────────────────────────

export const GIFT_REWARDS = [50, 80, 120, 160, 220, 300, 500];

export interface GiftState {
  /** bugün alınabilir mi */
  ready: boolean;
  /** 0..6: bugünkü (ya da sıradaki) günün indeksi */
  day: number;
}

/** Arka arkaya gelen günlerde döngü ilerler, bir gün kaçarsa baştan başlar */
export function giftState(save: SaveData): GiftState {
  const today = todayKey();
  if (save.gift.last === today) return { ready: false, day: (save.gift.day + 6) % 7 };
  const gap = save.gift.last ? dayDiff(save.gift.last, today) : 99;
  const day = gap === 1 ? save.gift.day % 7 : 0;
  return { ready: true, day };
}

export function claimGift(save: SaveData): number {
  const st = giftState(save);
  if (!st.ready) return 0;
  const reward = GIFT_REWARDS[st.day];
  save.coins += reward;
  save.gift = { last: todayKey(), day: (st.day + 1) % 7 };
  return reward;
}

/** Devam etme bedeli: dalga ilerledikçe artar */
export const reviveCost = (wave: number): number => 100 + wave * 20;
