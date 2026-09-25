/**
 * Tek çizgilik şekil tanıyıcı: oyuncu mürekkeple daire, üçgen, kare ya da zikzak çizerse
 * ilgili yetenek atılır. Şablon eşleştirme yerine özelliklere bakılır (kapalılık, köşe sayısı,
 * yarıçap düzgünlüğü); böylece şeklin boyutu, dönüşü ve çizim yönü önemli değildir.
 * Normal savunma çizgileri (düz ya da kavisli, açık uçlu) hiçbir şekle uymaz.
 */

export type Shape = 'circle' | 'triangle' | 'square' | 'zigzag';

export interface GestureResult {
  shape: Shape;
  /** şeklin merkezi ve yaklaşık yarıçapı (efekt buradan doğar) */
  cx: number;
  cy: number;
  r: number;
}

const N = 48;
/** en küçük şekil (dünya birimi, ekran genişliği 720) */
const MIN_SIZE = 84;

/** Yolu eşit aralıklı N noktaya yeniden örnekle */
function resample(pts: ArrayLike<number>, n: number, out: Float64Array): number {
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  if (len <= 0) return 0;
  const step = len / (N - 1);
  out[0] = pts[0];
  out[1] = pts[1];
  let k = 1;
  let acc = 0;
  let px = pts[0];
  let py = pts[1];
  for (let i = 1; i < n && k < N; i++) {
    const qx = pts[i * 2];
    const qy = pts[i * 2 + 1];
    let d = Math.hypot(qx - px, qy - py);
    while (acc + d >= step && k < N) {
      const f = (step - acc) / d;
      const nx = px + (qx - px) * f;
      const ny = py + (qy - py) * f;
      out[k * 2] = nx;
      out[k * 2 + 1] = ny;
      k++;
      px = nx;
      py = ny;
      d = Math.hypot(qx - px, qy - py);
      acc = 0;
    }
    acc += d;
    px = qx;
    py = qy;
  }
  while (k < N) {
    out[k * 2] = pts[(n - 1) * 2];
    out[k * 2 + 1] = pts[(n - 1) * 2 + 1];
    k++;
  }
  return len;
}

const buf = new Float64Array(N * 2);
const turn = new Float64Array(N);

/** Köşeler: dönüş açısının yerel tepe noktaları (eşik üstü), birbirine çok yakın olanlar birleşir */
function corners(closed: boolean, thr: number): number[] {
  const K = 3;
  const out: number[] = [];
  const at = (i: number): number => {
    if (closed) return ((i % (N - 1)) + (N - 1)) % (N - 1);
    return i;
  };
  const M = closed ? N - 1 : N;
  for (let i = 0; i < M; i++) {
    if (!closed && (i < K || i >= N - K)) {
      turn[i] = 0;
      continue;
    }
    const a = at(i - K);
    const b = at(i);
    const c = at(i + K);
    const ax = buf[b * 2] - buf[a * 2];
    const ay = buf[b * 2 + 1] - buf[a * 2 + 1];
    const bx = buf[c * 2] - buf[b * 2];
    const by = buf[c * 2 + 1] - buf[b * 2 + 1];
    turn[i] = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
  for (let i = 0; i < M; i++) {
    const v = Math.abs(turn[i]);
    if (v < thr) continue;
    let peak = true;
    for (let j = 1; j <= K && peak; j++) {
      const l = closed ? at(i - j) : i - j;
      const r = closed ? at(i + j) : i + j;
      if (l >= 0 && l < M && Math.abs(turn[l]) > v) peak = false;
      if (r >= 0 && r < M && Math.abs(turn[r]) >= v) peak = false;
    }
    if (peak) out.push(i);
  }
  return out;
}

/**
 * Çizgiyi tanı. pts: [x0,y0,x1,y1,...], n: nokta sayısı.
 * Tanınmazsa null (sıradan bir mürekkep çizgisi).
 */
export function recognize(pts: ArrayLike<number>, n: number): GestureResult | null {
  if (n < 8) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const size = Math.max(w, h);
  if (size < MIN_SIZE) return null;
  const len = resample(pts, n, buf);
  if (len < size * 1.6) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const r = size / 2;
  const gap = Math.hypot(buf[0] - buf[(N - 1) * 2], buf[1] - buf[(N - 1) * 2 + 1]);
  const closed = gap < Math.max(0.3 * size, 36);

  if (closed) {
    // şeklin kendi ağırlık merkezine göre yarıçap düzgünlüğü
    let mx = 0;
    let my = 0;
    for (let i = 0; i < N - 1; i++) {
      mx += buf[i * 2];
      my += buf[i * 2 + 1];
    }
    mx /= N - 1;
    my /= N - 1;
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < N - 1; i++) {
      const d = Math.hypot(buf[i * 2] - mx, buf[i * 2 + 1] - my);
      sum += d;
      sum2 += d * d;
    }
    const mean = sum / (N - 1);
    const cv = Math.sqrt(Math.max(0, sum2 / (N - 1) - mean * mean)) / Math.max(1, mean);
    // yuvarlaklık (izoperimetrik oran, döndürmeden bağımsız): daire 1, kare 0.79, üçgen 0.6
    let area = 0;
    let per = 0;
    for (let i = 0; i < N - 1; i++) {
      const j = (i + 1) % (N - 1);
      area += buf[i * 2] * buf[j * 2 + 1] - buf[j * 2] * buf[i * 2 + 1];
      per += Math.hypot(buf[j * 2] - buf[i * 2], buf[j * 2 + 1] - buf[i * 2 + 1]);
    }
    const q = (4 * Math.PI * (Math.abs(area) / 2)) / Math.max(1, per * per);
    const aspect = w / Math.max(1, h);
    const cs = corners(true, 0.95).length;
    // ölçümler: daire cv < 0.1 ve q ~1; kare cv 0.07-0.14, q ~0.84; üçgen cv 0.15-0.25, q < 0.8
    if (aspect < 0.45 || aspect > 2.2) return null;
    let shape: Shape;
    if (cs <= 2) shape = cv < 0.1 || q > 0.9 ? 'circle' : cv >= 0.145 ? 'triangle' : 'square';
    else if (cs === 3) shape = cv >= 0.145 || q < 0.72 ? 'triangle' : 'square';
    else if (cs <= 6) shape = cv > 0.19 && q < 0.75 ? 'triangle' : 'square';
    else return null;
    return { shape, cx: mx, cy: my, r: mean };
  }

  // açık uçlu: en az iki keskin, yön değiştiren kırılma (Z, N, şimşek)
  const cs = corners(false, 1.55);
  if (cs.length >= 2) {
    let alt = 0;
    for (let i = 1; i < cs.length; i++) if (Math.sign(turn[cs[i]]) !== Math.sign(turn[cs[i - 1]])) alt++;
    if (alt >= 1 && len > size * 1.9) return { shape: 'zigzag', cx, cy, r };
  }
  return null;
}

/** Şeklin kılavuz çizimi (arayüz ve oyun içi hayalet için): birim karede nokta listesi */
export function shapeGuide(shape: Shape): Array<[number, number]> {
  switch (shape) {
    case 'circle': {
      const out: Array<[number, number]> = [];
      for (let i = 0; i <= 40; i++) {
        const a = -Math.PI / 2 + (i / 40) * Math.PI * 2;
        out.push([0.5 + Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.42]);
      }
      return out;
    }
    case 'triangle':
      return [
        [0.5, 0.1],
        [0.9, 0.84],
        [0.1, 0.84],
        [0.5, 0.1],
      ];
    case 'square':
      return [
        [0.14, 0.14],
        [0.86, 0.14],
        [0.86, 0.86],
        [0.14, 0.86],
        [0.14, 0.14],
      ];
    case 'zigzag':
      return [
        [0.12, 0.16],
        [0.88, 0.16],
        [0.12, 0.84],
        [0.88, 0.84],
      ];
  }
}
