/** Kalemler: mürekkep rengini değiştiren kozmetikler. Bazıları rütbe ile açılır (rekabet motivasyonu). */
export interface Pen {
  id: string;
  color: string;
  /** çekirdek (en parlak) renk */
  core: string;
  price: number;
  /** gereken rütbe indeksi (RANKS dizisinde) */
  rank?: number;
  rainbow?: boolean;
}

export const PENS: Pen[] = [
  { id: 'turkuaz', color: '#3EF0E0', core: '#E9FFFD', price: 0 },
  { id: 'lale', color: '#FF4F8B', core: '#FFE3EE', price: 600 },
  { id: 'safran', color: '#FFC23D', core: '#FFF6DC', price: 900 },
  { id: 'zumrut', color: '#3DF58A', core: '#E6FFEF', price: 900 },
  { id: 'menekse', color: '#A77BFF', core: '#F1E9FF', price: 1400 },
  { id: 'ates', color: '#FF6B2E', core: '#FFF0D8', price: 0, rank: 6 },
  { id: 'buz', color: '#8ADFFF', core: '#FFFFFF', price: 0, rank: 9 },
  { id: 'gokkusagi', color: '#FF4F8B', core: '#FFFFFF', price: 0, rank: 12, rainbow: true },
];

export const PEN_BY_ID = new Map(PENS.map((p) => [p.id, p]));
