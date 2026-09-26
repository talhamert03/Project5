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
  /** dost meteorların düşmana yönelme gücü */
  magnet: number;
  /** sekmede çevredeki düşmanları yavaşlatma (sn) */
  frost: number;
  /** dost meteor tavandan kaç kez geri seker */
  ricochet: number;
  /** koruyucu uydu seviyesi (0 = yok) */
  guardian: number;
  /** altın meteor başına ek altın */
  luckyCoins: number;
  /** her 10 komboda dolan mürekkep */
  inkSurge: number;
  /** yetenek dolum hızı çarpanı */
  charge: number;
  /** mahalle yıkılınca mürekkep dolar + ağır çekim */
  secondWind: number;
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
    magnet: 0,
    frost: 0,
    ricochet: 0,
    guardian: 0,
    luckyCoins: 0,
    inkSurge: 0,
    charge: 1,
    secondWind: 0,
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
  // ── Sıradan: temel ekonomi, küçük ama güvenilir adımlar
  { id: 'ink_regen', rarity: Rarity.Common, max: 5, icon: 'drop', apply: (s) => (s.inkRegen *= 1.2), value: () => '20' },
  { id: 'ink_max', rarity: Rarity.Common, max: 5, icon: 'well', apply: (s) => (s.maxInk += 22), value: () => '22' },
  // stratejik çizgi: küçük bir artış (sık seçilir, duvar kurmayı kolaylaştırmasın)
  { id: 'line_life', rarity: Rarity.Common, max: 3, icon: 'hourglass', apply: (s) => (s.lineLife *= 1.06), value: () => '6' },
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
  { id: 'blast', rarity: Rarity.Common, max: 4, icon: 'blast', apply: (s) => (s.explosionR *= 1.18), value: () => '18' },
  { id: 'repair', rarity: Rarity.Common, max: 99, icon: 'house', apply: () => undefined },
  {
    id: 'lucky',
    rarity: Rarity.Common,
    max: 3,
    icon: 'star',
    apply: (s) => (s.luckyCoins += 3),
  },
  { id: 'ink_surge', rarity: Rarity.Common, max: 3, icon: 'wave', apply: (s) => (s.inkSurge += 18), value: (l) => String(l * 18) },
  // ── Nadir: oynanışı değiştiren araçlar
  { id: 'extra_line', rarity: Rarity.Rare, max: 2, icon: 'lines', apply: (s) => (s.maxLines += 1) },
  { id: 'leech', rarity: Rarity.Rare, max: 2, icon: 'leech', apply: (s) => (s.inkPerKill *= 1.8) },
  {
    id: 'timewarp',
    rarity: Rarity.Rare,
    max: 2,
    icon: 'clock',
    apply: (s) => {
      s.slowmo *= 0.7;
      s.drawCost *= 0.87;
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
  { id: 'magnet', rarity: Rarity.Rare, max: 2, icon: 'magnet', apply: (s) => (s.magnet += 1) },
  { id: 'frost', rarity: Rarity.Rare, max: 2, icon: 'snow', apply: (s) => (s.frost += 1.4), value: (l) => (l * 1.4).toFixed(1) },
  { id: 'ricochet', rarity: Rarity.Rare, max: 2, icon: 'ricochet', apply: (s) => (s.ricochet += 1), value: (l) => String(l) },
  { id: 'overcharge', rarity: Rarity.Rare, max: 3, icon: 'battery', apply: (s) => (s.charge += 0.25), value: (l) => String(l * 25) },
  { id: 'second_wind', rarity: Rarity.Rare, max: 1, icon: 'wind', apply: (s) => (s.secondWind = 1) },
  // ── Destansı: güçlü kombinasyonlar
  { id: 'mirror', rarity: Rarity.Epic, max: 2, icon: 'mirror', apply: (s) => (s.mirror += 1) },
  { id: 'chain', rarity: Rarity.Epic, max: 3, icon: 'bolt', apply: (s) => (s.chain += 1), value: (l) => String(l) },
  { id: 'fire', rarity: Rarity.Epic, max: 3, icon: 'flame', apply: (s) => (s.fireChance += 0.15), value: (l) => String(l * 15) },
  { id: 'pierce', rarity: Rarity.Epic, max: 3, icon: 'arrow', apply: (s) => (s.pierce += 1), value: (l) => String(l) },
  { id: 'guardian', rarity: Rarity.Epic, max: 2, icon: 'satellite', apply: (s) => (s.guardian += 1), value: (l) => (l >= 2 ? '4' : '7') },
  // ── Efsanevi: tur kazandıran nadir güçler
  { id: 'blackhole', rarity: Rarity.Legendary, max: 1, icon: 'hole', apply: (s) => (s.blackHole += 1) },
  {
    id: 'midas',
    rarity: Rarity.Legendary,
    max: 2,
    icon: 'crown',
    apply: (s) => {
      s.scoreMult += 0.4;
      s.coinMult += 0.4;
    },
  },
  { id: 'phoenix', rarity: Rarity.Legendary, max: 1, icon: 'phoenix', apply: (s) => (s.phoenix += 1) },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export const RARITY_COLORS = ['#F3EEDF', '#3EF0E0', '#B57BFF', '#FFC857'] as const;
