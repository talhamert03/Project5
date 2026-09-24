/** Tur içi güçlendirmeler (roguelite). Her dalga sonunda 3 kart sunulur. */

export interface Stats {
  maxInk: number;
  inkRegen: number;
  lineLife: number;
  maxLines: number;
  bounceMult: number;
  deflectScoreMult: number;
  explosionR: number;
  inkPerKill: number;
  slowmo: number;
  drawCost: number;
  lineWidth: number;
  heavyProof: boolean;
  cometBurst: number;
  domePerWave: number;
  mirror: number;
  chain: number;
  fireChance: number;
  pierce: number;
  blackHole: number;
  scoreMult: number;
  coinMult: number;
  phoenix: number;
}

export function baseStats(): Stats {
  return {
    maxInk: 100,
    inkRegen: 11,
    lineLife: 3,
    maxLines: 3,
    bounceMult: 1.12,
    deflectScoreMult: 1,
    explosionR: 66,
    inkPerKill: 5,
    slowmo: 0.36,
    drawCost: 1 / 6.2,
    lineWidth: 10,
    heavyProof: false,
    cometBurst: 0,
    domePerWave: 0,
    mirror: 0,
    chain: 0,
    fireChance: 0,
    pierce: 0,
    blackHole: 0,
    scoreMult: 1,
    coinMult: 1,
    phoenix: 0,
  };
}

export const enum Rarity {
  Common = 0,
  Rare = 1,
  Epic = 2,
  Legendary = 3,
}

export interface UpgradeDef {
  id: string;
  rarity: Rarity;
  max: number;
  /** ikon anahtarı (ui/icons) */
  icon: string;
  apply: (s: Stats) => void;
  /** açıklamadaki {v} yer tutucusu için değer (bir sonraki seviye) */
  value?: (nextLevel: number) => string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'ink_regen', rarity: Rarity.Common, max: 5, icon: 'drop', apply: (s) => (s.inkRegen *= 1.3), value: () => '30' },
  { id: 'ink_max', rarity: Rarity.Common, max: 5, icon: 'well', apply: (s) => (s.maxInk += 25), value: () => '25' },
  { id: 'line_life', rarity: Rarity.Common, max: 4, icon: 'hourglass', apply: (s) => (s.lineLife *= 1.35), value: () => '35' },
  {
    id: 'bounce',
    rarity: Rarity.Common,
    max: 3,
    icon: 'bounce',
    apply: (s) => {
      s.bounceMult += 0.2;
      s.deflectScoreMult += 0.5;
    },
  },
  { id: 'blast', rarity: Rarity.Common, max: 4, icon: 'blast', apply: (s) => (s.explosionR *= 1.2), value: () => '20' },
  { id: 'repair', rarity: Rarity.Common, max: 99, icon: 'house', apply: () => undefined },
  { id: 'extra_line', rarity: Rarity.Rare, max: 2, icon: 'lines', apply: (s) => (s.maxLines += 1) },
  { id: 'leech', rarity: Rarity.Rare, max: 2, icon: 'leech', apply: (s) => (s.inkPerKill *= 2) },
  {
    id: 'timewarp',
    rarity: Rarity.Rare,
    max: 2,
    icon: 'clock',
    apply: (s) => {
      s.slowmo *= 0.68;
      s.drawCost *= 0.85;
    },
  },
  {
    id: 'thick',
    rarity: Rarity.Rare,
    max: 1,
    icon: 'nib',
    apply: (s) => {
      s.lineWidth *= 1.45;
      s.heavyProof = true;
    },
  },
  { id: 'comet', rarity: Rarity.Rare, max: 3, icon: 'comet', apply: (s) => (s.cometBurst += 1) },
  { id: 'dome', rarity: Rarity.Rare, max: 3, icon: 'dome', apply: (s) => (s.domePerWave += 1) },
  { id: 'mirror', rarity: Rarity.Epic, max: 2, icon: 'mirror', apply: (s) => (s.mirror += 1) },
  { id: 'chain', rarity: Rarity.Epic, max: 3, icon: 'bolt', apply: (s) => (s.chain += 1), value: (l) => String(l) },
  { id: 'fire', rarity: Rarity.Epic, max: 3, icon: 'flame', apply: (s) => (s.fireChance += 0.22), value: (l) => String(l * 22) },
  { id: 'pierce', rarity: Rarity.Epic, max: 3, icon: 'arrow', apply: (s) => (s.pierce += 1), value: (l) => String(l) },
  { id: 'blackhole', rarity: Rarity.Legendary, max: 1, icon: 'hole', apply: (s) => (s.blackHole += 1) },
  {
    id: 'midas',
    rarity: Rarity.Legendary,
    max: 2,
    icon: 'crown',
    apply: (s) => {
      s.scoreMult += 0.5;
      s.coinMult += 0.5;
    },
  },
  { id: 'phoenix', rarity: Rarity.Legendary, max: 1, icon: 'phoenix', apply: (s) => (s.phoenix += 1) },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export const RARITY_COLORS = ['#F3EEDF', '#3EF0E0', '#B57BFF', '#FFC857'] as const;
