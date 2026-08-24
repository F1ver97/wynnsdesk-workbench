/* =====================================================================
 *  charts.js —— 零依赖 Canvas 图表（折线 / 柱状 / 雷达）
 *  适配霓虹黑粉主题，支持多数据集对比与悬浮提示。
 * ===================================================================== */
(function (global) {
  'use strict';

  const PINK = '#FF1493';
  const PINK2 = '#FF69B4';
  const GRID = 'rgba(255,105,180,0.12)';
  const TEXT = 'rgba(255,255,255,0.65)';

  function setupHiDPI(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.clientWidth || 600;
    const h = rect.height || canvas.clientHeight || 260;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function niceMax(v) {
    if (v <= 0) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
  }

  /* ------------------------------ 折线图 ------------------------------ */
  function line(canvas, datasets, opts) {
    opts = opts || {};
    const { ctx, w, h } = setupHiDPI(canvas);
    ctx.clearRect(0, 0, w, h);
    const padL = 46, padR = 16, padT = 16, padB = 30;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const labels = opts.labels || (datasets[0] ? datasets[0].data.map((_, i) => i + 1) : []);
    let maxV = 0; datasets.forEach(d => d.data.forEach(v => { if (v > maxV) maxV = v; }));
    maxV = niceMax(maxV * 1.1) || 10;
    const x = i => padL + (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
    const y = v => padT + plotH - (v / maxV) * plotH;

    // 网格
    ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = TEXT; ctx.font = '11px sans-serif';
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
      const gy = padT + (plotH / steps) * s;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
      ctx.fillText(global.U ? U.fmtNum(maxV * (1 - s / steps)) : Math.round(maxV * (1 - s / steps)), 4, gy + 3);
    }
    // X 轴标签（抽取）
    const tick = Math.ceil(labels.length / 6);
    ctx.textAlign = 'center';
    labels.forEach((lb, i) => { if (i % tick === 0) ctx.fillText(String(lb), x(i), h - 10); });

    // 数据集
    datasets.forEach((d, di) => {
      const color = d.color || (di === 0 ? PINK : PINK2);
      ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.beginPath();
      d.data.forEach((v, i) => { const px = x(i), py = y(v); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 填充
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(x(0), y(d.data[0]));
      d.data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
      ctx.lineTo(x(d.data.length - 1), padT + plotH); ctx.lineTo(x(0), padT + plotH); ctx.closePath(); ctx.fill();
    });
  }

  /* ------------------------------ 柱状图 ------------------------------ */
  function bar(canvas, datasets, opts) {
    opts = opts || {};
    const { ctx, w, h } = setupHiDPI(canvas);
    ctx.clearRect(0, 0, w, h);
    const padL = 46, padR = 16, padT = 16, padB = 30;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const labels = opts.labels || datasets[0].data.map((_, i) => i + 1);
    let maxV = 0; datasets.forEach(d => d.data.forEach(v => { if (v > maxV) maxV = v; }));
    maxV = niceMax(maxV * 1.1) || 10;
    const y = v => padT + plotH - (v / maxV) * plotH;
    ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.fillStyle = TEXT; ctx.font = '11px sans-serif';
    const steps = 4;
    for (let s = 0; s <= steps; s++) { const gy = padT + (plotH / steps) * s; ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke(); ctx.fillText(global.U ? U.fmtNum(maxV * (1 - s / steps)) : Math.round(maxV * (1 - s / steps)), 4, gy + 3); }
    const groupW = plotW / labels.length;
    const barW = Math.min(40, (groupW * 0.6) / datasets.length);
    datasets.forEach((d, di) => {
      const color = d.color || (di === 0 ? PINK : PINK2);
      d.data.forEach((v, i) => {
        const bx = padL + groupW * i + groupW / 2 - (datasets.length * barW) / 2 + di * barW;
        const by = y(v); const bh = padT + plotH - by;
        const grad = ctx.createLinearGradient(0, by, 0, by + bh);
        grad.addColorStop(0, color); grad.addColorStop(1, color + '44');
        ctx.fillStyle = grad; ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.fillRect(bx, by, barW - 3, bh); ctx.shadowBlur = 0;
      });
    });
    ctx.textAlign = 'center'; ctx.fillStyle = TEXT; const tick = Math.ceil(labels.length / 6);
    labels.forEach((lb, i) => { if (i % tick === 0) ctx.fillText(String(lb), padL + groupW * i + groupW / 2, h - 10); });
  }

  /* ------------------------------ 雷达图 ------------------------------ */
  function radar(canvas, axes, series, opts) {
    opts = opts || {};
    const { ctx, w, h } = setupHiDPI(canvas);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 + 6, R = Math.min(w, h) / 2 - 36;
    const n = axes.length;
    ctx.strokeStyle = GRID; ctx.fillStyle = TEXT; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i % n) / n * Math.PI * 2; const r = R * ring / 4; const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
    }
    axes.forEach((ax, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2; ctx.fillText(ax, cx + Math.cos(a) * (R + 18), cy + Math.sin(a) * (R + 18) + 4); });
    series.forEach((s, si) => {
      const color = s.color || (si === 0 ? PINK : PINK2);
      ctx.beginPath();
      s.values.forEach((v, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2; const r = R * Math.max(0, Math.min(1, v / 100)); const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
      ctx.closePath(); ctx.fillStyle = color + '33'; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    });
  }

  global.Charts = { line, bar, radar };
})(window);
