/**
 * Atmosferler: oyun ilerledikçe (her 5 dalgada) sahne tamburu dönüp yeni bir dünyaya geçer.
 * Her atmosferin kendi gökyüzü, ebru bulutsusu, gök cismi, silüet ışıkları, ortam efekti,
 * müzik tonu ve küçük bir oynanış farkı vardır.
 */

export type Celestial = 'crescent' | 'sun' | 'fullmoon' | 'bloodmoon' | 'planet' | 'twin' | 'belt' | 'saturn' | 'blackhole' | 'supernova';
export type Ambient = 'none' | 'petals' | 'snow' | 'embers' | 'stardust' | 'ink' | 'crystals' | 'spiral' | 'sparks';

export interface Atmosphere {
  id: string;
  /** dikey gökyüzü gradyanı [konum, renk] */
  sky: Array<[number, string]>;
  /** bulutsu gövde renkleri */
  nebula: [string, string];
  nebulaAlpha: number;
  /** HD ebru damarlarının renkleri */
  veins: string[];
  veinCount: number;
  stars: number;
  celestial: Celestial;
  celestialPos: [number, number];
  /** akan büyük ışık lekeleri */
  glows: [string, string, string];
  skyline: {
    top: string;
    bottom: string;
    rim: string;
    windows: string[];
    bridge: string;
    bridgeLights: string;
  };
  /** yakın evler: çarpma (multiply) tonu ve pencere ışıması */
  house: { tint: string; glow: string };
  ambient: Ambient;
  aurora: boolean;
  lightning: boolean;
  music: { root: number; bpm: number };
  /** düşman meteorlara yatay rüzgâr ivmesi (birim/sn²) */
  wind: number;
  /** meteor türü ağırlık çarpanları: normal, hızlı, zırhlı, bölünen, kuyruklu, buz, hayalet, nova */
  bias: number[];
  /** arayüz vurgu rengi */
  accent: string;
}

export const ATMOSPHERES: Atmosphere[] = [
  {
    id: 'gece',
    sky: [
      [0, '#060A22'],
      [0.4, '#10194A'],
      [0.68, '#1A1150'],
      [0.84, '#3A1846'],
      [0.95, '#6B2A4F'],
      [1, '#7D3A55'],
    ],
    nebula: ['#3A2388', '#1C7A92'],
    nebulaAlpha: 0.5,
    veins: ['#FF7AD0', '#B98CFF', '#7FF2FF', '#FFB0E8'],
    veinCount: 120,
    stars: 1,
    celestial: 'crescent',
    celestialPos: [0.8, 0.13],
    glows: ['#3EF0E0', '#A77BFF', '#FF4F8B'],
    skyline: {
      top: '#1A2160',
      bottom: '#0A0E30',
      rim: 'rgba(150,160,255,0.35)',
      windows: ['#FFC66B', '#B4E6FF'],
      bridge: '#141A55',
      bridgeLights: '#8FE9FF',
    },
    house: { tint: '#FFFFFF', glow: '#FFB45A' },
    ambient: 'none',
    aurora: false,
    lightning: false,
    music: { root: 0, bpm: 104 },
    wind: 0,
    bias: [1, 1, 1, 1, 1, 1, 1, 1],
    accent: '#3EF0E0',
  },
  {
    id: 'alaca',
    sky: [
      [0, '#1B1446'],
      [0.3, '#4A1F5E'],
      [0.55, '#A8375F'],
      [0.74, '#EC6A4A'],
      [0.88, '#FFB05C'],
      [1, '#FFD98A'],
    ],
    nebula: ['#6A2A6A', '#C0506A'],
    nebulaAlpha: 0.42,
    veins: ['#FFD07A', '#FF8FB0', '#FFB070', '#FFE7B0'],
    veinCount: 100,
    stars: 0.3,
    celestial: 'sun',
    celestialPos: [0.3, 0.74],
    glows: ['#FFC857', '#FF4F8B', '#FF8A3D'],
    skyline: {
      top: '#4A1C46',
      bottom: '#1E0C26',
      rim: 'rgba(255,170,120,0.5)',
      windows: ['#FFD27A', '#FFE9B8'],
      bridge: '#5A2450',
      bridgeLights: '#FFD8A0',
    },
    house: { tint: '#FFC2A8', glow: '#FFA24A' },
    ambient: 'petals',
    aurora: false,
    lightning: false,
    music: { root: 2, bpm: 100 },
    wind: 20,
    bias: [1, 1, 1, 1.3, 1, 1, 1, 1],
    accent: '#FFB45E',
  },
  {
    id: 'aurora',
    sky: [
      [0, '#020814'],
      [0.45, '#06203A'],
      [0.75, '#0B3B4F'],
      [0.92, '#15505A'],
      [1, '#2A6A6A'],
    ],
    nebula: ['#0A4A5A', '#1A5A8A'],
    nebulaAlpha: 0.3,
    veins: ['#7DFFC4', '#3EF0E0', '#B0FFE8', '#9DB8FF'],
    veinCount: 80,
    stars: 1.4,
    celestial: 'fullmoon',
    celestialPos: [0.22, 0.12],
    glows: ['#3DF58A', '#3EF0E0', '#A77BFF'],
    skyline: {
      top: '#12344A',
      bottom: '#061520',
      rim: 'rgba(160,255,230,0.35)',
      windows: ['#FFE6A8', '#CFF6FF'],
      bridge: '#103040',
      bridgeLights: '#B8FFF0',
    },
    house: { tint: '#A8D8FF', glow: '#9FE8FF' },
    ambient: 'snow',
    aurora: true,
    lightning: false,
    music: { root: -5, bpm: 96 },
    wind: 0,
    bias: [1, 1.7, 1, 1, 1.2, 1.6, 1, 1],
    accent: '#7DFFC4',
  },
  {
    id: 'kizil',
    sky: [
      [0, '#12040A'],
      [0.35, '#3A0A14'],
      [0.65, '#6E1418'],
      [0.85, '#B2301E'],
      [1, '#FF7A2E'],
    ],
    nebula: ['#5A0E1A', '#8A2A12'],
    nebulaAlpha: 0.5,
    veins: ['#FF9A4A', '#FF4A3A', '#FFD07A', '#FF7A7A'],
    veinCount: 110,
    stars: 0.5,
    celestial: 'bloodmoon',
    celestialPos: [0.74, 0.16],
    glows: ['#FF3355', '#FF8A3D', '#FFC857'],
    skyline: {
      top: '#3A0E16',
      bottom: '#14050A',
      rim: 'rgba(255,120,80,0.45)',
      windows: ['#FF8A4A', '#FFC07A'],
      bridge: '#40121A',
      bridgeLights: '#FF7A5A',
    },
    house: { tint: '#FF9C8C', glow: '#FF6A3D' },
    ambient: 'embers',
    aurora: false,
    lightning: true,
    music: { root: -2, bpm: 112 },
    wind: 0,
    bias: [1, 1, 1.5, 1.6, 1, 1, 1, 1.4],
    accent: '#FF5A3A',
  },
  {
    id: 'kozmos',
    sky: [
      [0, '#030208'],
      [0.5, '#0A0620'],
      [0.8, '#150A30'],
      [1, '#26104A'],
    ],
    nebula: ['#3A1A8A', '#8A1A6A'],
    nebulaAlpha: 0.62,
    veins: ['#FF6EF0', '#6EC8FF', '#FFE07A', '#9D7BFF'],
    veinCount: 140,
    stars: 2.2,
    celestial: 'planet',
    celestialPos: [0.7, 0.2],
    glows: ['#A77BFF', '#6EC8FF', '#FF4F8B'],
    skyline: {
      top: '#221452',
      bottom: '#0A0620',
      rim: 'rgba(200,160,255,0.4)',
      windows: ['#E0B0FF', '#9DE8FF'],
      bridge: '#1E1250',
      bridgeLights: '#E8B8FF',
    },
    house: { tint: '#C8B4FF', glow: '#C890FF' },
    ambient: 'stardust',
    aurora: false,
    lightning: false,
    music: { root: -3, bpm: 92 },
    wind: 0,
    bias: [1, 1.2, 1.4, 1, 1.4, 1, 1.3, 1],
    accent: '#B57BFF',
  },
  {
    id: 'orion',
    sky: [
      [0, '#0A0A2A'],
      [0.4, '#1A1060'],
      [0.7, '#3A1A70'],
      [1, '#6A2A80'],
    ],
    nebula: ['#2A4AB0', '#B02A8A'],
    nebulaAlpha: 0.55,
    veins: ['#FF4F8B', '#FFC857', '#3DF58A', '#3EF0E0', '#A77BFF'],
    veinCount: 190,
    stars: 1.2,
    celestial: 'belt',
    celestialPos: [0.64, 0.15],
    glows: ['#FFC857', '#3EF0E0', '#FF4F8B'],
    skyline: {
      top: '#2E2270',
      bottom: '#0E0A2A',
      rim: 'rgba(255,220,150,0.5)',
      windows: ['#FFD86B', '#FF9FD0', '#9FFFE0'],
      bridge: '#261C66',
      bridgeLights: '#FFE08A',
    },
    house: { tint: '#E8D0FF', glow: '#FFC857' },
    ambient: 'ink',
    aurora: false,
    lightning: false,
    music: { root: 5, bpm: 108 },
    wind: 0,
    bias: [1, 1.3, 1.3, 1.3, 1.2, 1.2, 1.2, 1.2],
    accent: '#FFC857',
  },
  {
    id: 'saturn',
    sky: [
      [0, '#0B0A1E'],
      [0.4, '#1E1A3E'],
      [0.68, '#3A2E4E'],
      [0.86, '#8A6A5A'],
      [1, '#D9B48A'],
    ],
    nebula: ['#4A3A6A', '#8A6A3A'],
    nebulaAlpha: 0.34,
    veins: ['#FFE0A8', '#FFD08A', '#BFE8FF', '#FFF2D0'],
    veinCount: 90,
    stars: 1.2,
    celestial: 'saturn',
    celestialPos: [0.36, 0.25],
    glows: ['#FFD08A', '#BFE8FF', '#FF9A6A'],
    skyline: {
      top: '#3A2E48',
      bottom: '#120E1E',
      rim: 'rgba(255,220,170,0.45)',
      windows: ['#FFE0A0', '#CFEFFF'],
      bridge: '#2E2440',
      bridgeLights: '#FFE8B0',
    },
    house: { tint: '#FFE2C4', glow: '#FFC870' },
    ambient: 'crystals',
    aurora: false,
    lightning: false,
    music: { root: 7, bpm: 98 },
    wind: 0,
    bias: [1, 1, 1, 1, 1.2, 1.9, 1, 1],
    accent: '#FFD08A',
  },
  {
    id: 'horizon',
    sky: [
      [0, '#020104'],
      [0.45, '#0A0616'],
      [0.75, '#1A0A22'],
      [0.92, '#3A1420'],
      [1, '#6A2A1A'],
    ],
    nebula: ['#3A1A4A', '#6A2A1A'],
    nebulaAlpha: 0.4,
    veins: ['#FFB04A', '#FF7A3A', '#FFE0A0', '#B070FF'],
    veinCount: 120,
    stars: 1.8,
    celestial: 'blackhole',
    celestialPos: [0.6, 0.22],
    glows: ['#FF9A3D', '#B066FF', '#FF4F8B'],
    skyline: {
      top: '#2A1020',
      bottom: '#0A0408',
      rim: 'rgba(255,150,80,0.45)',
      windows: ['#FFB060', '#FFD8A0'],
      bridge: '#24101C',
      bridgeLights: '#FFA060',
    },
    house: { tint: '#E8B8B0', glow: '#FF9A4A' },
    ambient: 'spiral',
    aurora: false,
    lightning: false,
    music: { root: -4, bpm: 116 },
    wind: 0,
    bias: [1, 1.2, 1.2, 1, 1.2, 1, 1.9, 1.3],
    accent: '#FF9A3D',
  },
  {
    id: 'nova',
    sky: [
      [0, '#03060F'],
      [0.4, '#0A1830'],
      [0.7, '#1A1040'],
      [0.9, '#4A1450'],
      [1, '#8A2A60'],
    ],
    nebula: ['#1A6A8A', '#8A1A7A'],
    nebulaAlpha: 0.6,
    veins: ['#7FFFE0', '#FF4FD8', '#FFFFFF', '#6EC8FF', '#FFC857'],
    veinCount: 200,
    stars: 2,
    celestial: 'supernova',
    celestialPos: [0.5, 0.17],
    glows: ['#7FFFE0', '#FF4FD8', '#6EC8FF'],
    skyline: {
      top: '#1C1648',
      bottom: '#080618',
      rim: 'rgba(160,255,240,0.45)',
      windows: ['#9FFFE8', '#FFB8F0'],
      bridge: '#18123E',
      bridgeLights: '#9FFFE8',
    },
    house: { tint: '#D8C8FF', glow: '#7FFFE0' },
    ambient: 'sparks',
    aurora: false,
    lightning: false,
    music: { root: 3, bpm: 120 },
    wind: 0,
    bias: [1, 1.3, 1.3, 1.3, 1.4, 1.3, 1.3, 1.7],
    accent: '#7FFFE0',
  },
];

export const ATM_BY_ID = new Map(ATMOSPHERES.map((a) => [a.id, a]));

/** Her 5 dalga bir bölüm: 1-5 Gece, 6-10 Alacakaranlık ... 41+ Süpernova */
export function atmosphereIndexForWave(wave: number): number {
  return Math.min(ATMOSPHERES.length - 1, Math.floor(Math.max(0, wave - 1) / 5));
}

/** Bir atmosferin açıldığı ilk dalga */
export function firstWaveOf(index: number): number {
  return index * 5 + 1;
}
