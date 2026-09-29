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

export interface UpgradeDef {
  id: string;
  max: number;
  /** ikon anahtarı (ui/icons) */
  icon: string;
  apply: (s: Stats) => void;
  /** açıklamadaki {v} yer tutucusu için değer (bir sonraki seviye) */
  value?: (nextLevel: number) => string;
}

export const UPGRADES: UpgradeDef[] = [
  // ── Sıradan: temel ekonomi, küçük ama güvenilir adımlar
  { id: 'ink_regen', max: 5, icon: 'drop', apply: (s) => (s.inkRegen *= 1.2), value: () => '20' },
  { id: 'ink_max', max: 5, icon: 'well', apply: (s) => (s.maxInk += 22), value: () => '22' },
  // stratejik çizgi: küçük bir artış (sık seçilir, duvar kurmayı kolaylaştırmasın)
  { id: 'line_life', max: 3, icon: 'hourglass', apply: (s) => (s.lineLife *= 1.06), value: () => '6' },
  {
    id: 'bounce',
    max: 3,
    icon: 'bounce',
    apply: (s) => {
      s.bounceMult += 0.2;
      s.deflectScoreMult += 0.5;
    },
  },
  { id: 'blast', max: 4, icon: 'blast', apply: (s) => (s.explosionR *= 1.18), value: () => '18' },
  { id: 'repair', max: 99, icon: 'house', apply: () => undefined },
  {
    id: 'lucky',
    max: 3,
    icon: 'star',
    apply: (s) => (s.luckyCoins += 3),
  },
  { id: 'ink_surge', max: 3, icon: 'wave', apply: (s) => (s.inkSurge += 18), value: (l) => String(l * 18) },
  // ── Nadir: oynanışı değiştiren araçlar
  { id: 'extra_line', max: 2, icon: 'lines', apply: (s) => (s.maxLines += 1) },
  { id: 'leech', max: 2, icon: 'leech', apply: (s) => (s.inkPerKill *= 1.8) },
  {
    id: 'timewarp',
    max: 2,
    icon: 'clock',
    apply: (s) => {
      s.slowmo *= 0.7;
      s.drawCost *= 0.87;
    },
  },
  {
    id: 'thick',
    max: 1,
    icon: 'nib',
    apply: (s) => {
      s.lineWidth *= 1.45;
      s.heavyProof = true;
    },
  },
  { id: 'comet', max: 3, icon: 'comet', apply: (s) => (s.cometBurst += 1) },
  { id: 'dome', max: 3, icon: 'dome', apply: (s) => (s.domePerWave += 1) },
  { id: 'magnet', max: 2, icon: 'magnet', apply: (s) => (s.magnet += 1) },
  { id: 'frost', max: 2, icon: 'snow', apply: (s) => (s.frost += 1.4), value: (l) => (l * 1.4).toFixed(1) },
  { id: 'ricochet', max: 2, icon: 'ricochet', apply: (s) => (s.ricochet += 1), value: (l) => String(l) },
  { id: 'overcharge', max: 3, icon: 'battery', apply: (s) => (s.charge += 0.25), value: (l) => String(l * 25) },
  { id: 'second_wind', max: 1, icon: 'wind', apply: (s) => (s.secondWind = 1) },
  // ── Destansı: güçlü kombinasyonlar
  { id: 'mirror', max: 2, icon: 'mirror', apply: (s) => (s.mirror += 1) },
  { id: 'chain', max: 3, icon: 'bolt', apply: (s) => (s.chain += 1), value: (l) => String(l) },
  { id: 'fire', max: 3, icon: 'flame', apply: (s) => (s.fireChance += 0.15), value: (l) => String(l * 15) },
  { id: 'pierce', max: 3, icon: 'arrow', apply: (s) => (s.pierce += 1), value: (l) => String(l) },
  { id: 'guardian', max: 2, icon: 'satellite', apply: (s) => (s.guardian += 1), value: (l) => (l >= 2 ? '4' : '7') },
  // ── Efsanevi: tur kazandıran nadir güçler
  { id: 'blackhole', max: 1, icon: 'hole', apply: (s) => (s.blackHole += 1) },
  {
    id: 'midas',
    max: 2,
    icon: 'crown',
    apply: (s) => {
      s.scoreMult += 0.4;
      s.coinMult += 0.4;
    },
  },
  { id: 'phoenix', max: 1, icon: 'phoenix', apply: (s) => (s.phoenix += 1) },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export const RARITY_COLORS = ['#F3EEDF', '#3EF0E0', '#B57BFF', '#FFC857'] as const;
