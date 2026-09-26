/** Oyunun renk kimliği: gece laciverti, ebru turkuazı, köz turuncusu, safran altını. */
export const C = {
  night: '#060A22',
  lacivert: '#10194A',
  deep: '#1A1150',
  dusk: '#3A1846',
  horizon: '#6B2A4F',
  turkuaz: '#3EF0E0',
  ember: '#FF6A3D',
  crimson: '#FF3355',
  gold: '#FFC857',
  paper: '#F3EEDF',
  rose: '#FF4F8B',
  violet: '#A77BFF',
  ice: '#8ADFFF',
  lime: '#B9FF6B',
  white: '#FFFFFF',
  silhouette: '#0B1036',
  window: '#FFC66B',
} as const;

/** Meteor türlerinin renkleri (gövde parıltısı, iz) */
export const METEOR_COLORS = {
  normal: '#FF6A3D',
  fast: '#8ADFFF',
  heavy: '#B45CFF',
  splitter: '#FFB23D',
  golden: '#FFD866',
  shard: '#FF7F4F',
  boss: '#FF3355',
  comet: '#7FFFE0',
  ice: '#A8E6FF',
  phantom: '#C79BFF',
  nova: '#FF4FD8',
  blink: '#B8FF3D',
  flare: '#FF9A1F',
  prism: '#E8DEFF',
  mender: '#4DFF9A',
  wisp: '#FF6EB4',
} as const;

/** Boss türlerine göre ışıma rengi: Kaya Titanı, Kuyruklu Kraliçe, Buz Kalesi, Tekillik, İkiz Yıldızlar */
export const BOSS_COLORS = ['#FF3355', '#7FFFE0', '#8FE8FF', '#B066FF', '#FFB030'] as const;
