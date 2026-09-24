// Mürekkep Kalkanı ikon ve mağaza görselleri: kodla çizilen sanat (Canvas 2D).
// gen-icons.mjs bu dosyayı bir sayfaya yükleyip PNG'lere dönüştürür.
/* eslint-disable */
(function () {
  const TAU = Math.PI * 2;

  function bg(g, W, H, opts) {
    const gr = g.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.8);
    gr.addColorStop(0, '#26307f');
    gr.addColorStop(0.45, '#10194a');
    gr.addColorStop(1, '#050820');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // ebru damarları
    g.save();
    g.globalCompositeOperation = 'lighter';
    const veins = [
      ['rgba(167,123,255,0.20)', 0.0, 0.22, 0.35, 0.02, 0.62, 0.2, 1.0, 0.12],
      ['rgba(62,240,224,0.12)', 0.0, 0.42, 0.3, 0.3, 0.7, 0.5, 1.0, 0.3],
      ['rgba(255,79,139,0.10)', 0.0, 0.62, 0.4, 0.5, 0.6, 0.72, 1.0, 0.58],
      ['rgba(167,123,255,0.12)', 0.1, 0.1, 0.4, 0.3, 0.7, 0.05, 0.95, 0.28],
    ];
    for (const [c, x0, y0, c1x, c1y, c2x, c2y, x1, y1] of veins) {
      g.strokeStyle = c;
      g.lineWidth = Math.min(W, H) * 0.012;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0 * W, y0 * H);
      g.bezierCurveTo(c1x * W, c1y * H, c2x * W, c2y * H, x1 * W, y1 * H);
      g.stroke();
      g.lineWidth = Math.min(W, H) * 0.04;
      g.globalAlpha = 0.35;
      g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();
    // yıldızlar
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < (opts.stars ?? 40); i++) {
      const x = rnd() * W;
      const y = rnd() * H * 0.7;
      const r = (0.4 + rnd() * 1.2) * Math.min(W, H) / 400;
      g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    if (opts.skyline) skyline(g, W, H, opts.skylineY ?? 0.86, opts.skylineScale ?? 1);
  }

  function skyline(g, W, H, baseY, sc) {
    const s = Math.min(W, H) * sc;
    const B = H * baseY;
    const cx = W * (0.5 + (W > H ? 0.22 : 0));
    g.fillStyle = '#070b2c';
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, B);
    g.quadraticCurveTo(W * 0.5, B - s * 0.06, W, B);
    g.lineTo(W, H);
    g.fill();
    // cami
    const dome = (x, y, r) => {
      g.beginPath();
      g.arc(x, y, r, Math.PI, 0);
      g.fill();
    };
    g.fillRect(cx - s * 0.16, B - s * 0.1, s * 0.32, s * 0.12);
    dome(cx, B - s * 0.1, s * 0.1);
    dome(cx - s * 0.12, B - s * 0.1, s * 0.05);
    dome(cx + s * 0.12, B - s * 0.1, s * 0.05);
    for (const dx of [-0.2, 0.2]) {
      const x = cx + dx * s;
      g.fillRect(x - s * 0.008, B - s * 0.3, s * 0.016, s * 0.3);
      g.beginPath();
      g.moveTo(x - s * 0.012, B - s * 0.3);
      g.lineTo(x, B - s * 0.36);
      g.lineTo(x + s * 0.012, B - s * 0.3);
      g.fill();
    }
    // Galata
    const gx = cx - s * 0.42;
    g.fillRect(gx - s * 0.035, B - s * 0.24, s * 0.07, s * 0.26);
    g.beginPath();
    g.moveTo(gx - s * 0.045, B - s * 0.24);
    g.lineTo(gx, B - s * 0.34);
    g.lineTo(gx + s * 0.045, B - s * 0.24);
    g.fill();
    // pencere ışıkları
    g.fillStyle = 'rgba(255,198,107,0.9)';
    for (let i = 0; i < 7; i++) g.fillRect(cx - s * 0.13 + i * s * 0.04, B - s * 0.05, s * 0.012, s * 0.018);
  }

  function glowDot(g, x, y, r, color, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', String(a)));
    gr.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }

  /** Ön plan: turkuaz fırça darbesi + köz meteor (u = birim ölçü) */
  function art(g, ox, oy, u) {
    const P = (x, y) => [ox + x * u, oy + y * u];
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // gelen meteor izi
    g.globalCompositeOperation = 'lighter';
    const [tx0, ty0] = P(0.12, 0.08);
    const [mx, my] = P(0.5, 0.44);
    for (let i = 0; i < 28; i++) {
      const f = i / 27;
      const x = tx0 + (mx - tx0) * f;
      const y = ty0 + (my - ty0) * f;
      glowDot(g, x, y, u * (0.03 + 0.09 * f), 'rgba(255,106,61,A)', 0.18 + f * 0.3);
    }
    // fırça darbesi (hat kalemi gibi incelen şerit)
    const stroke = (w, color, alpha) => {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineWidth = w;
      g.beginPath();
      const [a, b] = P(0.1, 0.74);
      const [c, d] = P(0.46, 0.9);
      const [e, f] = P(0.9, 0.56);
      g.moveTo(a, b);
      g.quadraticCurveTo(c, d, e, f);
      g.stroke();
    };
    stroke(u * 0.2, '#3EF0E0', 0.1);
    stroke(u * 0.12, '#3EF0E0', 0.25);
    g.globalCompositeOperation = 'source-over';
    // şerit gövdesi (değişken kalınlık)
    g.globalAlpha = 1;
    const ribbon = (half, color) => {
      const N = 40;
      const L = [];
      const R = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = (1 - t) * (1 - t) * 0.1 + 2 * (1 - t) * t * 0.46 + t * t * 0.9;
        const y = (1 - t) * (1 - t) * 0.74 + 2 * (1 - t) * t * 0.9 + t * t * 0.56;
        const dx = 2 * (1 - t) * (0.46 - 0.1) + 2 * t * (0.9 - 0.46);
        const dy = 2 * (1 - t) * (0.9 - 0.74) + 2 * t * (0.56 - 0.9);
        const l = Math.hypot(dx, dy);
        const w = half * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) * (0.55 + 0.45 * Math.sin(Math.PI * t));
        L.push(P(x - (dy / l) * w, y + (dx / l) * w));
        R.push(P(x + (dy / l) * w, y - (dx / l) * w));
      }
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(L[0][0], L[0][1]);
      for (const p of L) g.lineTo(p[0], p[1]);
      for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
      g.closePath();
      g.fill();
    };
    ribbon(0.055, '#3EF0E0');
    ribbon(0.02, '#E9FFFD');
    // temas kıvılcımı
    g.globalCompositeOperation = 'lighter';
    const [sx, sy] = P(0.47, 0.8);
    glowDot(g, sx, sy, u * 0.2, 'rgba(62,240,224,A)', 0.55);
    glowDot(g, sx, sy, u * 0.07, 'rgba(255,255,255,A)', 0.9);
    // meteor ışıması
    glowDot(g, mx, my, u * 0.26, 'rgba(255,106,61,A)', 0.55);
    g.globalCompositeOperation = 'source-over';
    // meteor gövdesi: düzensiz kaya, kraterler, erimiş çatlaklar
    meteorBody(g, mx, my, u * 0.11);
    g.restore();
  }

  function meteorBody(g, mx, my, r) {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const N = 13;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + (rnd() - 0.5) * 0.25;
      const rr = r * (0.84 + rnd() * 0.16);
      pts.push([mx + Math.cos(a) * rr, my + Math.sin(a) * rr]);
    }
    const path = () => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) g.lineTo(p[0], p[1]);
      g.closePath();
    };
    const body = g.createRadialGradient(mx - r * 0.45, my - r * 0.5, r * 0.1, mx, my, r * 1.1);
    body.addColorStop(0, '#7b6560');
    body.addColorStop(0.6, '#3a2a2c');
    body.addColorStop(1, '#140c10');
    path();
    g.fillStyle = body;
    g.fill();
    g.save();
    path();
    g.clip();
    for (const [dx, dy, cr] of [[-0.35, -0.2, 0.22], [0.25, -0.35, 0.16], [0.1, 0.3, 0.2], [-0.3, 0.35, 0.12]]) {
      g.fillStyle = 'rgba(0,0,0,0.38)';
      g.beginPath();
      g.arc(mx + dx * r, my + dy * r, cr * r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,225,200,0.18)';
      g.lineWidth = r * 0.05;
      g.beginPath();
      g.arc(mx + dx * r + r * 0.02, my + dy * r + r * 0.02, cr * r, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
    }
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const crack = (list, w) => {
      g.beginPath();
      g.moveTo(mx + list[0][0] * r, my + list[0][1] * r);
      for (const [x, y] of list) g.lineTo(mx + x * r, my + y * r);
      g.stroke();
    };
    const cracks = [
      [[-0.46, -0.28], [-0.2, -0.08], [-0.26, 0.14], [0.06, 0.22], [0.2, 0.44], [0.42, 0.5]],
      [[-0.2, -0.08], [0.1, -0.24], [0.34, -0.14]],
      [[0.06, 0.22], [0.3, 0.12]],
    ];
    for (const c of cracks) {
      g.strokeStyle = 'rgba(255,106,61,0.55)';
      g.lineWidth = r * 0.16;
      crack(c);
      g.strokeStyle = 'rgba(255,214,150,0.95)';
      g.lineWidth = r * 0.06;
      crack(c);
    }
    // hareket yönündeki sıcak kenar
    const hot = g.createRadialGradient(mx + r * 0.55, my + r * 0.6, 0, mx + r * 0.55, my + r * 0.6, r * 0.9);
    hot.addColorStop(0, 'rgba(255,190,110,0.85)');
    hot.addColorStop(1, 'rgba(255,106,61,0)');
    g.fillStyle = hot;
    g.fillRect(mx - r, my - r, r * 2, r * 2);
    g.restore();
    path();
    g.strokeStyle = 'rgba(255,140,80,0.8)';
    g.lineWidth = r * 0.07;
    g.stroke();
  }

  function sparkle(g, x, y, s) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(x, y - s);
    g.quadraticCurveTo(x, y, x + s, y);
    g.quadraticCurveTo(x, y, x, y + s);
    g.quadraticCurveTo(x, y, x - s, y);
    g.quadraticCurveTo(x, y, x, y - s);
    g.fill();
    g.restore();
  }

  window.drawIcon = function (canvas, mode) {
    const g = canvas.getContext('2d');
    const S = canvas.width;
    g.clearRect(0, 0, S, S);
    if (mode === 'fg') {
      // uyarlanabilir ikon: güvenli bölge (merkezdeki %61) içinde kal
      const u = S * 0.62;
      art(g, (S - u) / 2, (S - u) / 2 + S * 0.01, u);
      return;
    }
    if (mode === 'bg') {
      bg(g, S, S, { skyline: true, skylineY: 0.82, skylineScale: 0.55, stars: 50 });
      return;
    }
    // tam ikon (Play Store / eski Android)
    g.save();
    if (mode === 'round') {
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2, 0, TAU);
      g.clip();
    } else if (mode === 'legacy') {
      const r = S * 0.2;
      g.beginPath();
      g.moveTo(r, 0);
      g.arcTo(S, 0, S, S, r);
      g.arcTo(S, S, 0, S, r);
      g.arcTo(0, S, 0, 0, r);
      g.arcTo(0, 0, S, 0, r);
      g.closePath();
      g.clip();
    }
    bg(g, S, S, { skyline: true, skylineY: 0.88, skylineScale: 0.7, stars: 60 });
    const u = S * 0.84;
    art(g, (S - u) / 2, (S - u) / 2 - S * 0.02, u);
    sparkle(g, S * 0.78, S * 0.2, S * 0.035);
    g.restore();
  };

  window.drawFeature = function (canvas, title1, title2, tagline) {
    const g = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    bg(g, W, H, { skyline: true, skylineY: 0.9, skylineScale: 0.62, stars: 120 });
    // hilal (ayrı katmanda kesilir)
    const mr = H * 0.07;
    const moon = document.createElement('canvas');
    moon.width = moon.height = Math.ceil(mr * 2.4);
    const mg = moon.getContext('2d');
    const mc = moon.width / 2;
    mg.fillStyle = '#FFF4D6';
    mg.beginPath();
    mg.arc(mc, mc, mr, 0, TAU);
    mg.fill();
    mg.globalCompositeOperation = 'destination-out';
    mg.beginPath();
    mg.arc(mc + mr * 0.42, mc - mr * 0.2, mr * 0.86, 0, TAU);
    mg.fill();
    glowDot(g, W * 0.9, H * 0.18, mr * 3.2, 'rgba(255,236,200,A)', 0.25);
    g.drawImage(moon, W * 0.9 - mc, H * 0.18 - mc);
    art(g, W * 0.56, H * 0.02, H * 0.92);
    // başlık
    g.textBaseline = 'alphabetic';
    const fill = g.createLinearGradient(0, H * 0.2, 0, H * 0.7);
    fill.addColorStop(0, '#FFFFFF');
    fill.addColorStop(1, '#CFFFFA');
    g.fillStyle = fill;
    g.shadowColor = 'rgba(62,240,224,0.5)';
    g.shadowBlur = 30;
    g.font = `900 ${Math.round(H * 0.15)}px "Unbounded Variable"`;
    g.fillText(title1, W * 0.06, H * 0.42);
    g.font = `900 ${Math.round(H * 0.175)}px "Unbounded Variable"`;
    g.fillText(title2, W * 0.06, H * 0.62);
    g.shadowBlur = 0;
    g.strokeStyle = '#3EF0E0';
    g.lineWidth = H * 0.018;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(W * 0.065, H * 0.7);
    g.bezierCurveTo(W * 0.2, H * 0.66, W * 0.3, H * 0.74, W * 0.5, H * 0.68);
    g.stroke();
    g.fillStyle = 'rgba(243,238,223,0.85)';
    g.font = `500 ${Math.round(H * 0.058)}px "Rubik Variable"`;
    g.fillText(tagline, W * 0.065, H * 0.82);
  };
})();
