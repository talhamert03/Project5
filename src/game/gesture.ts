/**
 * Tek çizgilik şekil tanıyıcı (sürüm 2). Oyuncu mürekkeple daire, üçgen, kare, zikzak, sarmal,
 * yıldız ya da sonsuzluk çizerse ilgili yetenek atılır.
 *
 * El çizimi kusurlu olur: daire yumurta ya da elips çıkar, uç başlangıcı geçer ya da kısa kalır,
 * köşeler yuvarlanır, parmak kalkarken küçük bir kanca kalır. Bu yüzden eşikli tek bir ölçüye
 * değil, modellerin çizgiye ne kadar iyi oturduğuna bakılır:
 *  1. Halka arama: başlangıç ve bitişin en yakın geçtiği yer bulunur, taşan uç ve kancalar kesilir.
 *  2. Dönüş sayısı (topolojik, titremeden etkilenmez): 1 tur basit şekil, 2 tur yıldız, 0 sonsuzluk.
 *  3. Basit şekilde: elips (dairenin basık hali) uyum hatası ile en iyi üçgen/dörtgen uyum hatası
 *     karşılaştırılır; köşeler dönüşün yoğunlaştığı yerlerden seçilir.
 * Normal savunma çizgileri (düz, kavisli, V, dalgalı) hiçbir şekle uymaz.
 */

export type Shape = 'circle' | 'triangle' | 'square' | 'zigzag' | 'spiral' | 'star' | 'infinity';

export interface GestureResult {
  shape: Shape;
  /** şeklin merkezi ve yaklaşık yarıçapı (efekt buradan doğar) */
  cx: number;
  cy: number;
  r: number;
}

/** yeniden örnekleme nokta sayısı */
const N = 80;
/** en küçük şekil (dünya birimi, ekran genişliği 720) */
const MIN_SIZE = 70;
const TAU = Math.PI * 2;

const A = new Float64Array(N * 2); // açık yol
const Q = new Float64Array(N * 2); // kapalı halka
const dirA = new Float64Array(N);
const dirQ = new Float64Array(N);
const cw = new Float64Array(N);

const wrap = (a: number): number => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

/** Yolu eşit aralıklı m noktaya yeniden örnekle (closed: son noktadan ilke dönüş kenarı da yola dahil) */
function resample(src: ArrayLike<number>, from: number, to: number, m: number, out: Float64Array, closed: boolean): number {
  const cnt = to - from + 1;
  let len = 0;
  for (let i = 1; i < cnt; i++) len += Math.hypot(src[(from + i) * 2] - src[(from + i - 1) * 2], src[(from + i) * 2 + 1] - src[(from + i - 1) * 2 + 1]);
  const closeLen = closed ? Math.hypot(src[from * 2] - src[to * 2], src[from * 2 + 1] - src[to * 2 + 1]) : 0;
  const total = len + closeLen;
  if (total <= 0) return 0;
  const step = total / (closed ? m : m - 1);
  out[0] = src[from * 2];
  out[1] = src[from * 2 + 1];
  let k = 1;
  let acc = 0;
  let px = out[0];
  let py = out[1];
  const segs = closed ? cnt : cnt - 1;
  for (let s = 1; s <= segs && k < m; s++) {
    const idx = from + (s % cnt);
    const qx = src[idx * 2];
    const qy = src[idx * 2 + 1];
    let d = Math.hypot(qx - px, qy - py);
    while (acc + d >= step && k < m) {
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
  while (k < m) {
    out[k * 2] = src[to * 2];
    out[k * 2 + 1] = src[to * 2 + 1];
    k++;
  }
  return total;
}

/** kenar yönleri; kapalıda N kenar (son kenar ilke döner), açıkta N-1 */
function directions(p: Float64Array, closed: boolean, out: Float64Array): void {
  const cnt = closed ? N : N - 1;
  for (let i = 0; i < cnt; i++) {
    const j = (i + 1) % N;
    out[i] = Math.atan2(p[j * 2 + 1] - p[i * 2 + 1], p[j * 2] - p[i * 2]);
  }
}

/**
 * Pencereli köşe gücü: k köşesinin w kenar öncesi ile w kenar sonrası arasındaki yön farkı.
 * Titreme ardışık dönüşlerde birbirini götürür; gerçek köşe (ya da sıkı kavis) büyük kalır.
 */
function cornerStrength(dir: Float64Array, closed: boolean, w: number, out: Float64Array): void {
  for (let k = 0; k < N; k++) {
    if (closed) {
      const a = dir[(k - w - 1 + N * 2) % N];
      const b = dir[(k + w) % N];
      out[k] = wrap(b - a);
    } else if (k - w - 1 < 0 || k + w > N - 2) {
      out[k] = 0;
    } else {
      out[k] = wrap(dir[k + w] - dir[k - w - 1]);
    }
  }
}

/** köşe güçlerinin tepe noktaları (sign yönünde, eşik üstü), ±nms komşulukta en büyük olan */
function peaks(str: Float64Array, closed: boolean, sign: number, thr: number, nms: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < N; k++) {
    const v = str[k] * sign;
    if (v < thr) continue;
    let top = true;
    for (let j = 1; j <= nms && top; j++) {
      const l = closed ? (k - j + N) % N : k - j;
      const r = closed ? (k + j) % N : k + j;
      if (l >= 0 && l < N && str[l] * sign > v) top = false;
      if (r >= 0 && r < N && str[r] * sign >= v) top = false;
    }
    if (top) out.push(k);
  }
  out.sort((a, b) => str[b] * sign - str[a] * sign);
  return out;
}

/** açık yolda işaretten bağımsız tepe noktaları (zikzak için) */
function peaksAbs(str: Float64Array, thr: number, nms: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < N; k++) {
    const v = Math.abs(str[k]);
    if (v < thr) continue;
    let top = true;
    for (let j = 1; j <= nms && top; j++) {
      if (k - j >= 0 && Math.abs(str[k - j]) > v) top = false;
      if (k + j < N && Math.abs(str[k + j]) >= v) top = false;
    }
    if (top) out.push(k);
  }
  return out;
}

interface Stats {
  mx: number;
  my: number;
  /** ağırlık merkezine ortalama uzaklık */
  rad: number;
  /** elipse göre yuvarlaklık hatası (daire/elips 0) */
  ell: number;
  /** ana eksen oranı (>= 1) */
  elong: number;
}

/** Kapalı halkanın ağırlık merkezi, ortalama yarıçapı ve elips uyum hatası */
function loopStats(p: Float64Array): Stats {
  let mx = 0;
  let my = 0;
  for (let i = 0; i < N; i++) {
    mx += p[i * 2];
    my += p[i * 2 + 1];
  }
  mx /= N;
  my /= N;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let rad = 0;
  for (let i = 0; i < N; i++) {
    const x = p[i * 2] - mx;
    const y = p[i * 2 + 1] - my;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    rad += Math.hypot(x, y);
  }
  sxx /= N;
  syy /= N;
  sxy /= N;
  rad /= N;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = Math.max(1e-6, tr / 2 + disc);
  const l2 = Math.max(1e-6, tr / 2 - disc);
  const phi = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const k1 = 1 / Math.sqrt(l1);
  const k2 = 1 / Math.sqrt(l2);
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < N; i++) {
    const x = p[i * 2] - mx;
    const y = p[i * 2 + 1] - my;
    const u = (x * c + y * s) * k1;
    const v = (-x * s + y * c) * k2;
    const r = Math.hypot(u, v);
    sum += r;
    sum2 += r * r;
  }
  const mean = sum / N;
  const ell = Math.sqrt(Math.max(0, sum2 / N - mean * mean)) / Math.max(1e-6, mean);
  return { mx, my, rad, ell, elong: Math.sqrt(l1 / l2) };
}

/** Köşeleri verilen çokgenin halkaya uyum hatası (ortalama yarıçapa oranla RMS uzaklık) */
function polyError(p: Float64Array, idx: number[], rad: number): number {
  const k = idx.length;
  const v = idx.slice().sort((a, b) => a - b);
  let s2 = 0;
  for (let c = 0; c < k; c++) {
    const a = v[c];
    const b = v[(c + 1) % k];
    const ax = p[a * 2];
    const ay = p[a * 2 + 1];
    const dx = p[b * 2] - ax;
    const dy = p[b * 2 + 1] - ay;
    const L2 = Math.max(1e-6, dx * dx + dy * dy);
    for (let i = a; i !== b; i = (i + 1) % N) {
      const px = p[i * 2] - ax;
      const py = p[i * 2 + 1] - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / L2));
      const ex = px - dx * t;
      const ey = py - dy * t;
      s2 += ex * ex + ey * ey;
    }
  }
  return Math.sqrt(s2 / N) / Math.max(1, rad);
}

/** köşeler arasındaki en kısa kenarın çevreye oranı */
function minGap(idx: number[]): number {
  const v = idx.slice().sort((a, b) => a - b);
  let g = N;
  for (let i = 0; i < v.length; i++) g = Math.min(g, (v[(i + 1) % v.length] - v[i] + N) % N || N);
  return g / N;
}

/** güçten zayıfa sıralı tepelerden, birbirine sep örnekten yakın olmayan en fazla k köşe seç
 * (kapanış noktasındaki kanca aynı köşeyi iki kez saydırmasın) */
function pickCorners(pk: number[], sep: number, k: number): number[] {
  const out: number[] = [];
  for (const p of pk) {
    let ok = true;
    for (const q of out) {
      const d = Math.abs(p - q);
      if (Math.min(d, N - d) < sep) ok = false;
    }
    if (ok) out.push(p);
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Aday köşelerden k tanesini, çokgen uyum hatası en küçük olacak biçimde seç (el çiziminde köşe
 * yuvarlanır ya da seyrek noktalarda pahlanır; en güçlü tepeler her zaman gerçek köşeler olmaz).
 * [hata, en kısa kenarın çevreye oranı]
 */
function bestPoly(p: Float64Array, cand: number[], k: number, minG: number, rad: number): [number, number] {
  const c = cand.slice(0, 8);
  let best: [number, number] = [9, 0];
  const pick: number[] = [];
  const rec = (start: number): void => {
    if (pick.length === k) {
      const g = minGap(pick);
      if (g < minG) return;
      const e = polyError(p, pick, rad);
      if (e < best[0]) best = [e, g];
      return;
    }
    for (let i = start; i < c.length; i++) {
      pick.push(c[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return best;
}

/** Açık çoklu çizginin (verilen köşelerden geçen) yola uyum hatası, boyuta oranla RMS */
function openPolyError(p: Float64Array, idx: number[], size: number): number {
  let s2 = 0;
  for (let c = 0; c + 1 < idx.length; c++) {
    const a = idx[c];
    const b = idx[c + 1];
    const ax = p[a * 2];
    const ay = p[a * 2 + 1];
    const dx = p[b * 2] - ax;
    const dy = p[b * 2 + 1] - ay;
    const L2 = Math.max(1e-6, dx * dx + dy * dy);
    for (let i = a; i <= b; i++) {
      const px = p[i * 2] - ax;
      const py = p[i * 2 + 1] - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / L2));
      const ex = px - dx * t;
      const ey = py - dy * t;
      s2 += ex * ex + ey * ey;
    }
  }
  return Math.sqrt(s2 / N) / Math.max(1, size);
}

/** Açık yay için cebirsel daire uyumu (Kasa): [cx, cy, R, göreli hata] */
function fitCircle(p: Float64Array): [number, number, number, number] {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (let i = 0; i < N; i++) {
    const x = p[i * 2];
    const y = p[i * 2 + 1];
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  // [sxx sxy sx; sxy syy sy; sx sy N] [D E F]' = -[sxz syz sz]'
  const m = [
    [sxx, sxy, sx, -sxz],
    [sxy, syy, sy, -syz],
    [sx, sy, N, -sz],
  ];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    if (Math.abs(m[c][c]) < 1e-9) return [0, 0, 0, 1];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
    }
  }
  const D = m[0][3] / m[0][0];
  const E = m[1][3] / m[1][1];
  const F = m[2][3] / m[2][2];
  const cx = -D / 2;
  const cy = -E / 2;
  const R = Math.sqrt(Math.max(0, cx * cx + cy * cy - F));
  if (!(R > 0)) return [0, 0, 0, 1];
  let s2 = 0;
  for (let i = 0; i < N; i++) {
    const e = Math.hypot(p[i * 2] - cx, p[i * 2 + 1] - cy) - R;
    s2 += e * e;
  }
  return [cx, cy, R, Math.sqrt(s2 / N) / R];
}


/**
 * Çizgiyi tanı. pts: [x0,y0,x1,y1,...], n: nokta sayısı.
 * Tanınmazsa null (sıradan bir mürekkep çizgisi).
 */
export function recognize(pts: ArrayLike<number>, n: number): GestureResult | null {
  if (n < 6) return null;
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
  const size = Math.max(maxX - minX, maxY - minY);
  if (size < MIN_SIZE) return null;
  const len = resample(pts, 0, n - 1, N, A, false);
  if (len < size * 1.12) return null;
  const step = len / (N - 1);

  directions(A, false, dirA);
  // açık yolun toplam (işaretli) dönüşü
  let turnOpen = 0;
  for (let i = 1; i < N - 1; i++) turnOpen += wrap(dirA[i] - dirA[i - 1]);
  const turnsOpen = turnOpen / TAU;

  // --- sarmal: hep aynı yöne dönen ve yarıçapı düzenli büyüyen/küçülen çizgi ---
  if (Math.abs(turnsOpen) > 0.95) {
    let mx = 0;
    let my = 0;
    for (let i = 0; i < N; i++) {
      mx += A[i * 2];
      my += A[i * 2 + 1];
    }
    mx /= N;
    my /= N;
    const q = Math.round(N * 0.2);
    let rin = 0;
    let rout = 0;
    for (let i = 0; i < q; i++) {
      rin += Math.hypot(A[i * 2] - mx, A[i * 2 + 1] - my);
      rout += Math.hypot(A[(N - 1 - i) * 2] - mx, A[(N - 1 - i) * 2 + 1] - my);
    }
    const ratio = Math.max(rin, rout) / Math.max(1e-6, Math.min(rin, rout));
    // dönüşün ne kadarı ana yönde (titreme için iki kenarlık yumuşatma)
    const sg = turnsOpen >= 0 ? 1 : -1;
    let main = 0;
    let all = 0;
    for (let i = 2; i < N - 1; i++) {
      const v = wrap(dirA[i] - dirA[i - 2]) * sg;
      all += Math.abs(v);
      if (v > 0) main += v;
    }
    const mono = main / Math.max(1e-6, all);
    if (mono > 0.8 && ((Math.abs(turnsOpen) > 1.2 && ratio > 1.6) || ratio > 1.9)) {
      return { shape: 'spiral', cx: mx, cy: my, r: size / 2 };
    }
  }

  // --- halka arama: baş ve sonun en yakın geçtiği nokta çifti (taşan uç ve kancalar kesilir) ---
  let bi = 0;
  let bj = N - 1;
  let best = Infinity;
  let bestD = Infinity;
  const iMax = Math.floor(N * 0.3);
  const jMin = Math.floor(N * 0.55);
  for (let i = 0; i <= iMax; i++) {
    for (let j = Math.max(jMin, i + Math.floor(N * 0.5)); j < N; j++) {
      const d = Math.hypot(A[i * 2] - A[j * 2], A[i * 2 + 1] - A[j * 2 + 1]);
      const cost = d + 0.12 * step * (i + (N - 1 - j));
      if (cost < best) {
        best = cost;
        bestD = d;
        bi = i;
        bj = j;
      }
    }
  }
  const closed = bestD < Math.max(0.25 * size, 26);

  if (closed) {
    const loopLen = resample(A, bi, bj, N, Q, true);
    if (loopLen < size * 1.6) return null;
    directions(Q, true, dirQ);
    let tsum = 0;
    for (let i = 0; i < N; i++) tsum += wrap(dirQ[i] - dirQ[(i - 1 + N) % N]);
    const m = Math.round(tsum / TAU);
    const st = loopStats(Q);
    const sign = m >= 0 ? 1 : -1;
    cornerStrength(dirQ, true, 2, cw);

    if (m === 1 || m === -1) {
      if (st.elong > 3.2) return null;
      const cand = peaks(cw, true, sign, 0.45, 2);
      const [e3, g3] = bestPoly(Q, cand, 3, 0.14, st.rad);
      const [e4, g4] = bestPoly(Q, cand, 4, 0.1, st.rad);
      const ell = Math.max(0.01, st.ell);
      const res = (shape: Shape): GestureResult => ({ shape, cx: st.mx, cy: st.my, r: st.rad });
      // Çokgen uyum hatasının elips uyum hatasına oranı ölçekten ve dönüşten bağımsızdır.
      // El çizimi benzetiminde (yuvarlak köşe, titreme, seyrek nokta, açık/taşan kapanış):
      //   dörtgen/elips oranı: daire >= 4.0, kare <= 2.5; üçgen/elips: üçgen <= 1.9, kare >= 2.9, daire >= 7
      //   karede üçgen hatası dörtgen hatasının >= 2.3 katı; üçgende ise dördüncü köşe bir şey kazandırmaz
      if (e4 < 0.2 && e4 < ell * 3.2 && e3 > e4 * 2 && g4 > 0.1) return res('square');
      if (e3 < 0.28 && e3 < ell * 2.4 && g3 > 0.14) return res('triangle');
      if (st.ell < 0.13) return res('circle');
      return null;
    }

    if (m === 2 || m === -2) {
      const pk = peaks(cw, true, sign, 1.3, 2);
      if (pk.length >= 4) return { shape: 'star', cx: st.mx, cy: st.my, r: st.rad * 1.15 };
      if (pk.length <= 1 && st.ell < 0.2) return { shape: 'circle', cx: st.mx, cy: st.my, r: st.rad };
      return null;
    }

    if (m === 0) {
      // sonsuzluk: iki ters yönlü halka; eğriliğin hem pozitif hem negatif kısmı büyük
      let pos = 0;
      let neg = 0;
      for (let i = 0; i < N; i++) {
        const v = wrap(dirQ[(i + 1) % N] - dirQ[(i - 1 + N) % N]) / 2;
        if (v > 0) pos += v;
        else neg -= v;
      }
      if (pos > TAU * 0.55 && neg > TAU * 0.55 && st.elong < 4) {
        return { shape: 'infinity', cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, r: size / 2 };
      }
      return null;
    }
    return null;
  }

  // --- açık uçlu çizgi ---
  cornerStrength(dirA, false, 2, cw);
  const gap = Math.hypot(A[0] - A[(N - 1) * 2], A[1] - A[(N - 1) * 2 + 1]) / size;
  const at = Math.abs(turnsOpen);
  const sign = turnsOpen >= 0 ? 1 : -1;
  const strong = peaksAbs(cw, 1.3, 3);
  const same = strong.filter((k) => Math.sign(cw[k]) === sign);

  // kısa kalmış daire: 270 dereceden fazla, köşesiz, daireye iyi oturan yay
  // (uçlardaki kanca sayılmaz)
  const edge = Math.round(N * 0.1);
  const inner = strong.filter((k) => k > edge && k < N - 1 - edge).length;
  if (at > 0.75 && at < 1.3 && inner === 0 && gap < 0.66) {
    const [fx, fy, fr, fe] = fitCircle(A);
    if (fe < 0.18) return { shape: 'circle', cx: fx, cy: fy, r: fr };
  }
  // kapanmamış üçgen / kare: aynı yöne keskin köşeler, uç başa yakın
  if (gap < 0.42 && strong.length === same.length) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    if (same.length === 2 && at > 0.55 && at < 1.0 && len > size * 2.2) return { shape: 'triangle', cx, cy, r: size / 2 };
    if (same.length === 3 && at > 0.62 && at < 1.05 && len > size * 2.6) return { shape: 'square', cx, cy, r: size / 2 };
  }
  // zikzak: 2-4 keskin kırılma, en az biri yön değiştiren (Z, N, W, şimşek); kırılmalar arası düz.
  // Dalgalı savunma çizgisinde dönüş yayılır, çoklu doğru oturmaz.
  cornerStrength(dirA, false, 3, cw);
  const zc = pickCorners(peaksAbs(cw, 1.0, 3).sort((a, b) => Math.abs(cw[b]) - Math.abs(cw[a])), Math.round(N * 0.1), 5)
    .filter((k) => Math.abs(cw[k]) >= 1.1)
    .sort((a, b) => a - b);
  if (zc.length >= 2 && zc.length <= 4 && at < 0.8) {
    let alt = 0;
    for (let i = 1; i < zc.length; i++) if (Math.sign(cw[zc[i]]) !== Math.sign(cw[zc[i - 1]])) alt++;
    const pe = openPolyError(A, [0, ...zc, N - 1], size);
    if (alt >= 1 && pe < 0.06) return { shape: 'zigzag', cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, r: size / 2 };
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
    case 'spiral': {
      // içten dışa 1,75 tur
      const out: Array<[number, number]> = [];
      for (let i = 0; i <= 56; i++) {
        const f = i / 56;
        const a = -Math.PI / 2 + f * Math.PI * 3.5;
        const rr = 0.05 + f * 0.37;
        out.push([0.5 + Math.cos(a) * rr, 0.5 + Math.sin(a) * rr]);
      }
      return out;
    }
    case 'star': {
      // tek çizgide beş köşeli yıldız (her seferinde bir köşe atlanır)
      const out: Array<[number, number]> = [];
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
        out.push([0.5 + Math.cos(a) * 0.42, 0.53 + Math.sin(a) * 0.42]);
      }
      return out;
    }
    case 'infinity': {
      // yatay sekiz (lemniskat): merkezden başlar, iki halkayı dolaşıp merkeze döner
      const out: Array<[number, number]> = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const d = 1 + Math.sin(t) * Math.sin(t);
        out.push([0.5 + (0.42 * Math.cos(t)) / d, 0.5 + (0.42 * Math.sin(t) * Math.cos(t)) / d]);
      }
      // merkezden başlasın
      return out.slice(16).concat(out.slice(1, 17));
    }
  }
}
