/* =====================================================================
 *  模块 1 · 数据分析
 *  多平台切换 / 粉丝核心指标 / 粉丝增长曲线 / 数据录入管理
 * ===================================================================== */
(function () {
  'use strict';
  const PLATFORMS = [
    { key: 'xhs', name: '小红书', color: '#FF1493' },
    { key: 'dy', name: '抖音', color: '#FF69B4' },
    { key: 'all', name: '全网', color: '#ffb03c' },
  ];
  const state = { platform: 'xhs', mode: 'single', diagnosis: '' }; // mode: single | compare | manage

  function pct(a, b) { if (!b) return 0; return +(((a - b) / b) * 100).toFixed(1); }
  const pname = k => { const p = PLATFORMS.find(x => x.key === k); return p ? p.name : k; };
  const pcolor = k => { const p = PLATFORMS.find(x => x.key === k); return p ? p.color : 'var(--pink-2)'; };
  // 真实可录入平台（全网是自动汇总，不允许手动录入）
  const REAL_PLATFORMS = PLATFORMS.filter(p => p.key !== 'all');

  /* 全网 = 小红书 + 抖音 同日的自动汇总（粉丝相加，播放相加，互动率取均值），不落库 */
  function mergeAllRows(list) {
    const dates = new Set();
    const byDate = {};
    list.forEach(m => {
      if (m.platform === 'xhs' || m.platform === 'dy') { dates.add(m.date); (byDate[m.date] = byDate[m.date] || {})[m.platform] = m; }
    });
    const out = [];
    Array.from(dates).sort().forEach(date => {
      const rec = byDate[date]; const x = rec.xhs, d = rec.dy;
      const fans = (x ? x.fans : 0) + (d ? d.fans : 0);
      if (fans <= 0) return;
      const o = { platform: 'all', date, fans, _merged: true };
      if (x && d) {
        if (x.views != null && d.views != null) o.views = x.views + d.views;
        if (x.rate != null && d.rate != null) o.rate = +((x.rate + d.rate) / 2).toFixed(2);
      } else if (x) { if (x.views != null) o.views = x.views; if (x.rate != null) o.rate = x.rate; }
      else if (d) { if (d.views != null) o.views = d.views; if (d.rate != null) o.rate = d.rate; }
      out.push(o);
    });
    return out;
  }

  function getMetrics(list, platform) {
    if (platform === 'all') return mergeAllRows(list).sort((a, b) => a.date < b.date ? -1 : 1);
    return list.filter(m => m.platform === platform).sort((a, b) => a.date < b.date ? -1 : 1);
  }

  function computeKPI(rows) {
    if (!rows.length) return null;
    const last = rows[rows.length - 1];
    const at = (daysAgo) => {
      const target = new Date(new Date(last.date).getTime() - daysAgo * 86400000);
      let best = null;
      rows.forEach(r => { if (new Date(r.date) <= target && (!best || r.date > best.date)) best = r; });
      return best;
    };
    const r7 = at(7), r30 = at(30);
    const grow7 = r7 ? last.fans - r7.fans : null;
    const grow30 = r30 ? last.fans - r30.fans : null;
    const days = Math.max(1, (new Date(last.date) - new Date(rows[0].date)) / 86400000 + 1);
    const avgDaily = Math.round((last.fans - rows[0].fans) / days);
    return { fans: last.fans, grow7, grow30, avgDaily, lastDate: last.date };
  }

  App.register('dashboard', {
    title: '<span class="accent">📊</span> 数据分析',
    render(view) {
      const root = U.el('div');
      root.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'title', html: '<span class="em">📊</span> 数据分析' }),
          U.el('div', { class: 'sub', text: '多平台粉丝数据 · 增长趋势 · 我的账号数据录入' }),
        ]),
        U.el('div', { class: 'spacer' }),
        U.el('button', { class: 'btn', text: '🤖 AI 解析填表', onclick: () => aiParseModal() }),
        U.el('button', { class: 'btn', text: '🩺 AI 流量诊断', onclick: () => aiDiagnose() }),
        U.el('button', { class: 'btn btn-primary', text: '＋ 录入我的数据', onclick: () => editMetric(null, state.platform) }),
        U.el('div', { class: 'tabs' }, [
          U.el('div', { class: 'tab' + (state.mode === 'single' ? ' active' : ''), text: '单平台', onclick: () => { state.mode = 'single'; App.render(); } }),
          U.el('div', { class: 'tab' + (state.mode === 'compare' ? ' active' : ''), text: '平台对比', onclick: () => { state.mode = 'compare'; App.render(); } }),
          U.el('div', { class: 'tab' + (state.mode === 'manage' ? ' active' : ''), text: '📋 数据管理', onclick: () => { state.mode = 'manage'; App.render(); } }),
        ])
      ]));

      const dyn = U.el('div'); root.appendChild(dyn);
      view.appendChild(root);
      paint(dyn);
    }
  });

  async function paint(dyn) {
    dyn.innerHTML = '';
    const all = await DB.list('metrics');
    if (state.mode === 'manage') return paintManage(dyn, all);

    // 平台切换 tabs（单平台模式）
    if (state.mode === 'single') {
      const tabs = U.el('div', { class: 'tabs', style: 'margin-bottom:16px' });
      PLATFORMS.forEach(p => tabs.appendChild(U.el('div', {
        class: 'tab' + (state.platform === p.key ? ' active' : ''), text: p.name,
        onclick: () => { state.platform = p.key; App.render(); }
      })));
      dyn.appendChild(tabs);
    }

    const primary = state.mode === 'compare' ? PLATFORMS[0] : PLATFORMS.find(p => p.key === state.platform);
    const rows = getMetrics(all, primary.key);
    const k = computeKPI(rows);
    if (!k) {
      dyn.appendChild(U.el('div', { class: 'empty', html: '「' + primary.name + '」还没有任何数据。<br>点击右上角 <b>「＋ 录入我的数据」</b> 添加你账号的每日粉丝数。' }));
      return;
    }

    // KPI 卡片（粉丝维度）
    const cards = U.el('div', { class: 'grid cols-4' });
    const item = (label, ico, val, delta, up) => U.el('div', { class: 'kpi' }, [
      U.el('div', { class: 'label' }, [U.el('span', { text: ico }), U.el('span', { text: label })]),
      U.el('div', { class: 'val', text: val }),
      delta != null ? U.el('div', { class: 'delta ' + (up ? 'up' : 'down'), html: (up ? '▲ ' : '▼ ') + (delta >= 0 ? '+' : '') + U.fmtNum(delta) }) : null,
    ]);
    cards.appendChild(item('累计粉丝', '👥', U.fmtNum(k.fans), null));
    cards.appendChild(item('近 7 天净增', '✨', (k.grow7 == null ? '—' : (k.grow7 >= 0 ? '+' : '') + U.fmtNum(k.grow7)), null));
    cards.appendChild(item('近 30 天净增', '📈', (k.grow30 == null ? '—' : (k.grow30 >= 0 ? '+' : '') + U.fmtNum(k.grow30)), null));
    cards.appendChild(item('日均增长', '🚀', (k.avgDaily >= 0 ? '+' : '') + U.fmtNum(k.avgDaily), null));
    dyn.appendChild(cards);
    dyn.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px', text: '数据截至 ' + k.lastDate + ' · 统计基于你录入的记录' }));

    // 图表区（粉丝曲线）
    const labels = rows.map(r => r.date.slice(5));
    const chartRow = U.el('div', { class: 'grid cols-2', style: 'margin-top:18px' });
    const c1 = U.el('div', { class: 'chart-card' }, [U.el('h4', { text: '粉丝增长曲线（按录入记录）' })]);
    const cv1 = U.el('canvas', { class: 'chart' }); c1.appendChild(cv1);
    const leg1 = U.el('div', { class: 'legend' }); c1.appendChild(leg1);
    const c2 = U.el('div', { class: 'chart-card' }, [U.el('h4', { text: '每日净增粉丝' })]);
    const cv2 = U.el('canvas', { class: 'chart' }); c2.appendChild(cv2);
    const leg2 = U.el('div', { class: 'legend' }); c2.appendChild(leg2);
    chartRow.appendChild(c1); chartRow.appendChild(c2);
    dyn.appendChild(chartRow);

    // AI 流量诊断结果卡片
    if (state.diagnosis) dyn.appendChild(U.el('div', { class: 'card no-lift diag-card', style: 'margin-top:16px' }, [
      U.el('h4', { text: '🩺 AI 流量诊断与优化建议' }),
      U.el('div', { class: 'diag-text', text: state.diagnosis }),
    ]));

    const dailyDelta = rows.map((r, i) => i === 0 ? 0 : r.fans - rows[i - 1].fans);
    if (state.mode === 'compare') {
      const dsFans = PLATFORMS.map(p => ({ name: p.name, color: p.color, data: getMetrics(all, p.key).map(r => r.fans) }));
      const dsDelta = PLATFORMS.map(p => {
        const rs = getMetrics(all, p.key);
        return { name: p.name, color: p.color, data: rs.map((r, i) => i === 0 ? 0 : r.fans - rs[i - 1].fans) };
      });
      setTimeout(() => {
        Charts.line(cv1, dsFans, { labels });
        Charts.line(cv2, dsDelta, { labels });
      }, 30);
      PLATFORMS.forEach(p => { leg1.appendChild(legendItem(p.color, p.name)); leg2.appendChild(legendItem(p.color, p.name)); });
    } else {
      setTimeout(() => {
        Charts.line(cv1, [{ name: primary.name, color: primary.color, data: rows.map(r => r.fans) }], { labels });
        Charts.line(cv2, [{ name: primary.name, color: primary.color, data: dailyDelta }], { labels });
      }, 30);
      leg1.appendChild(legendItem(primary.color, primary.name));
      leg2.appendChild(legendItem(primary.color, primary.name));
    }
  }

  /* ================= 数据管理：查看 / 编辑 / 删除 ================= */
  async function paintManage(dyn, all) {
    const sorted = all.slice().sort((a, b) => a.date < b.date ? 1 : -1);

    const bar = U.el('div', { class: 'tabs', style: 'margin-bottom:14px' });
    const allTab = U.el('div', { class: 'tab active', text: '全部 ' + all.length + ' 条' });
    allTab.onclick = () => { App.render(); };
    bar.appendChild(allTab);
    REAL_PLATFORMS.forEach(p => {
      const n = all.filter(m => m.platform === p.key).length;
      const tabEl = U.el('div', { class: 'tab', text: p.name + ' ' + n });
      tabEl.onclick = () => {
        Array.from(dyn.children).forEach(ch => { if (!ch.classList.contains('tabs') && !ch.classList.contains('muted')) ch.remove(); });
        Array.from(bar.children).forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        const sub = all.filter(m => m.platform === p.key).sort((a, b) => a.date < b.date ? 1 : -1);
        if (!sub.length) dyn.appendChild(U.el('div', { class: 'empty', text: '「' + p.name + '」暂无数据，点「＋ 录入我的数据」添加。' }));
        else renderTable(dyn, sub, p);
      };
      bar.appendChild(tabEl);
    });
    dyn.appendChild(bar);
    dyn.appendChild(U.el('div', { class: 'muted', style: 'font-size:12.5px;margin-bottom:12px', html: '提示：「全网」为小红书 + 抖音 同日的自动汇总，无需手动录入。看板的粉丝指标与曲线均基于这里的记录计算。点击任意行可编辑。' }));

    if (!sorted.length) { dyn.appendChild(U.el('div', { class: 'empty', text: '暂无数据记录，点右上角「＋ 录入我的数据」开始。' })); return; }
    renderTable(dyn, sorted, null);
  }

  function renderTable(dyn, list, platformFilter) {
    const selected = new Set();
    const wrap = U.el('div', { class: 'card no-lift', style: 'padding:0;overflow:auto' });

    // 批量操作栏
    const bar = U.el('div', { class: 'batch-bar', style: 'display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,105,180,.12);background:rgba(255,20,147,.04)' });
    const countLabel = U.el('span', { class: 'muted', style: 'font-size:12px', text: '已选 0 条' });
    const delBtn = U.el('button', { class: 'btn btn-danger', style: 'font-size:12px;padding:5px 12px;opacity:.5;pointer-events:none', text: '🗑 批量删除', onclick: async () => {
      if (!selected.size) return;
      if (await U.confirm('确定删除选中的 ' + selected.size + ' 条数据？删除后不可恢复。', true)) {
        for (const id of selected) await DB.removeQuiet('metrics', id);
        // 就地移除已选行，避免整表重绘闪动
        selected.forEach(id => { const cb = dyn.querySelector('input[data-id="' + id + '"]'); const tr = cb && cb.closest('tr'); if (tr) tr.remove(); });
        U.toast('已批量删除 ' + selected.size + ' 条', 'success');
      }
    } });
    bar.appendChild(U.el('input', { type: 'checkbox', title: '全选', style: 'accent-color:var(--pink);width:16px;height:16px;cursor:pointer', onchange: (e) => {
      const checked = e.target.checked;
      rowChecks.forEach(cb => { cb.checked = checked; if (checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id); });
      updateBatchUI();
    } }));
    bar.appendChild(countLabel);
    bar.appendChild(U.el('div', { class: 'spacer' }));
    bar.appendChild(delBtn);
    wrap.appendChild(bar);

    function updateBatchUI() {
      countLabel.textContent = '已选 ' + selected.size + ' 条';
      delBtn.style.opacity = selected.size ? '1' : '.5';
      delBtn.style.pointerEvents = selected.size ? 'auto' : 'none';
    }

    const table = U.el('table', { class: 'data-table' });
    const thead = U.el('thead');
    const headerRow = U.el('tr');
    ['', '日期', '平台', '累计粉丝（当日）', '操作'].forEach(t => headerRow.appendChild(U.el('th', { text: t, style: t === '' ? 'width:36px;text-align:center' : '' })));
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = U.el('tbody');
    const rowChecks = [];
    list.slice(0, 60).forEach(m => {
      const tr = U.el('tr', { onclick: () => editMetric(m) });
      const cb = U.el('input', { type: 'checkbox', dataset: { id: m.id }, style: 'accent-color:var(--pink);width:16px;height:16px;cursor:pointer', onclick: (e) => { e.stopPropagation(); if (cb.checked) selected.add(m.id); else selected.delete(m.id); updateBatchUI(); } });
      rowChecks.push(cb);
      const c0 = U.el('td', { style: 'text-align:center' }); c0.appendChild(cb); tr.appendChild(c0);
      tr.appendChild(U.el('td', { text: m.date }));
      tr.appendChild(U.el('td', {}, [U.el('span', { class: 'badge dim', style: 'color:' + pcolor(m.platform), text: pname(m.platform) })]));
      tr.appendChild(U.el('td', { text: U.fmtNum(m.fans) }));
      const act = U.el('td', { style: 'white-space:nowrap' }, [
        U.el('span', { class: 'link', text: '✎ 编辑', onclick: (e) => { e.stopPropagation(); editMetric(m); } }),
        U.el('span', { class: 'link danger', style: 'margin-left:10px', text: '🗑', onclick: async (e) => { e.stopPropagation(); if (await U.confirm('删除 ' + m.date + ' ' + pname(m.platform) + ' 的数据？', true)) { await DB.removeQuiet('metrics', m.id); const tr = e.target.closest('tr'); if (tr) tr.remove(); U.toast('已删除', 'success'); } } }),
      ]);
      tr.appendChild(act);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    dyn.appendChild(wrap);
    if (list.length > 60) dyn.appendChild(U.el('div', { class: 'muted', style: 'margin-top:10px;font-size:12px', text: '仅显示最近 60 条（共 ' + list.length + ' 条），旧数据仍参与看板计算。' }));
  }

  /* ================= 录入 / 编辑单条数据（平台 + 日期 + 粉丝） ================= */
  function editMetric(it, defaultPlatform) {
    const form = U.el('form', { class: 'form-row' });

    // 平台
    const pw = U.el('div');
    pw.appendChild(U.el('label', { text: '平台' }));
    const platSel = U.el('select', { name: 'platform' });
    REAL_PLATFORMS.forEach(p => platSel.appendChild(U.el('option', { value: p.key, text: p.name })));
    platSel.value = (it && it.platform && it.platform !== 'all') ? it.platform : (REAL_PLATFORMS.some(p => p.key === defaultPlatform) ? defaultPlatform : 'xhs');
    pw.appendChild(platSel);
    form.appendChild(pw);

    // 日期（日历点选）
    const dw = U.el('div');
    dw.appendChild(U.el('label', { text: '日期' }));
    const cal = U.calendarPicker(it ? it.date : U.fmtDate(new Date()));
    dw.appendChild(cal.el);
    form.appendChild(dw);

    // 累计粉丝数
    const fw = U.el('div');
    fw.appendChild(U.el('label', { text: '累计粉丝数（当日）' }));
    const fansI = U.el('input', { name: 'fans', type: 'number', placeholder: '例如：12500' });
    if (it && it.fans != null) fansI.value = it.fans;
    fw.appendChild(fansI);
    form.appendChild(fw);

    const actions = [
      { label: '取消', value: false },
      { label: it ? '保存' : '录入', value: true, primary: true, onclick: async () => {
        const obj = {
          platform: platSel.value,
          date: cal.get(),
          fans: Number(fansI.value) || 0,
        };
        if (!obj.date) { U.toast('请选择日期', 'error'); return false; }
        if (obj.fans <= 0) { U.toast('请填写当日累计粉丝数', 'error'); return false; }
        if (it) { await DB.update('metrics', it.id, obj); U.toast('已保存', 'success'); }
        else { await DB.insert('metrics', obj); U.toast('已录入 ' + obj.date + ' ' + pname(obj.platform) + ' 粉丝 ' + obj.fans, 'success'); }
        return true;
      } },
    ];
    if (it) actions.push({ label: '🗑 删除', value: 'del', danger: true, onclick: async () => { if (await U.confirm('删除该条数据？', true)) { await DB.remove('metrics', it.id); U.toast('已删除', 'success'); } return 'del'; } });

    const body = U.el('div');
    body.appendChild(form);
    body.appendChild(U.el('div', { class: 'muted', style: 'margin-top:12px;font-size:12.5px;line-height:1.7', html: '· 建议每天 / 每周固定录入一次当日累计粉丝数，连续记录后即可查看增长趋势。' }));

    U.modal({ title: it ? '编辑数据 · ' + it.date + ' ' + pname(it.platform) : '录入我的账号数据', body, width: 620, actions });
  }

  /* ================= 🤖 AI 智能解析填表（文本粘贴 / 截图上传） ================= */
  function aiParseModal() {
    let imageDataUrl = null;
    const body = U.el('div');
    body.appendChild(U.el('div', { class: 'muted', style: 'font-size:12.5px;line-height:1.7;margin-bottom:10px', html: '粘贴后台数据文本（粉丝量 / 播放量 / 互动率），或上传数据截图，点击「开始解析」后 AI 将自动提取并填入数据库，同时完成今日「统计账号数据」打卡。' }));

    const ta = U.el('textarea', { placeholder: '例如：小红书 · 今日粉丝 12,580 · 播放 34,000 · 互动率 6.2%', style: 'width:100%;min-height:110px;resize:vertical' });
    body.appendChild(ta);

    const fw = U.el('div', { style: 'margin-top:10px' });
    fw.appendChild(U.el('label', { style: 'font-size:12.5px', text: '📷 上传数据截图（可选，支持图片）' }));
    const fi = U.el('input', { type: 'file', accept: 'image/*' });
    const thumb = U.el('div', { style: 'margin-top:8px' });
    fi.addEventListener('change', () => {
      const f = fi.files && fi.files[0];
      thumb.innerHTML = '';
      if (!f) { imageDataUrl = null; return; }
      const rd = new FileReader();
      rd.onload = () => {
        imageDataUrl = rd.result;
        thumb.appendChild(U.el('img', { class: 'ai-parse-preview', src: imageDataUrl, style: 'max-height:180px' }));
      };
      rd.readAsDataURL(f);
    });
    fw.appendChild(fi); fw.appendChild(thumb);
    body.appendChild(fw);

    U.modal({
      title: '🤖 AI 智能解析填表', body, width: 560,
      actions: [
        { label: '取消', value: false },
        { label: '⚡ 开始解析', value: true, primary: true, onclick: async () => {
          const text = ta.value.trim();
          if (!text && !imageDataUrl) { U.toast('请先粘贴数据文本或上传截图', 'error'); return false; }
          const today = U.fmtDate(new Date());
          const prompt = '你是自媒体后台数据解析助手。请从' + (imageDataUrl ? '上传的截图（以及我提供的文本）' : '我提供的文本') + '中识别并提取账号数据。'
            + '截图通常是 小红书/抖音 创作者主页或数据中心。需要提取：平台、日期、累计粉丝数、播放量（如有）、互动率（如有）。'
            + '仅输出一个 JSON 对象，不要任何多余文字：{"platform":"xhs|dy","date":"YYYY-MM-DD","fans":数字,"views":数字或null,"rate":数字或null}。'
            + '平台映射：小红书/红薯/RED/个人主页有"关注"按钮=xhs；抖音/DOU/个人主页有"关注"按钮=dy。注意：「全网」是系统自动汇总，绝不允许单独识别为全网，识别不出平台时默认 xhs。'
            + '粉丝数可能是"1.2万"、"12.5w"、"12.5k"、"12500"等格式，请统一换算成纯数字（如 1.2万=12000，1.2w=1200 错误请修正为 12000，注意中文"万"=10000）。'
            + 'fans=累计粉丝数（必填纯数字，识别不出填 null）；views=播放量；rate=互动率百分比数字（如 6.2% 填 6.2）。'
            + '今天日期是 ' + today + '，数据中若无日期则 date 填今天。'
            + (text ? '\n辅助文本：' + text : '');
          try {
            const reply = await askGeminiAI(prompt, { files: imageDataUrl ? [{ name: 'screenshot.png', mime: 'image/png', dataUrl: imageDataUrl }] : [] });
            const d = aiExtractJSON(reply);
            let fans = d.fans;
            if (typeof fans === 'string') {
              fans = fans.replace(/[,，]/g, '').trim();
              const m = fans.match(/^([\d.]+)\s*([万亿wk]?)$/i);
              if (m) {
                const n = parseFloat(m[1]);
                const u = m[2].toLowerCase();
                if (u === '万' || u === 'w') fans = Math.round(n * 10000);
                else if (u === '千' || u === 'k') fans = Math.round(n * 1000);
                else if (u === '亿') fans = Math.round(n * 100000000);
                else fans = Math.round(n);
              } else {
                fans = Number(fans);
              }
            } else {
              fans = Number(fans);
            }
            if (!fans || fans <= 0 || isNaN(fans)) { U.toast('AI 未能从内容中识别出粉丝量，请补充文本或换张截图', 'error'); return false; }
            const pkeys = REAL_PLATFORMS.map(p => p.key);
            const obj = {
              platform: pkeys.indexOf(d.platform) >= 0 ? d.platform : 'xhs',
              date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : today,
              fans,
            };
            if (d.views != null && !isNaN(Number(d.views))) obj.views = Number(d.views);
            if (d.rate != null && !isNaN(Number(d.rate))) obj.rate = Number(d.rate);
            // 同平台同日去重：已有记录则更新
            const exist = (await DB.list('metrics')).find(m => m.platform === obj.platform && m.date === obj.date);
            if (exist) await DB.update('metrics', exist.id, obj);
            else await DB.insert('metrics', obj);
            U.toast('AI 已填入：' + pname(obj.platform) + ' · ' + obj.date + ' · 粉丝 ' + U.fmtNum(fans) + (exist ? '（覆盖同日旧值）' : ''), 'success');
            return true;
          } catch (err) {
            U.toast(err && err.message || 'AI 解析失败，请重试', 'error');
            return false;
          }
        } },
      ]
    });
  }

  /* ================= 🩺 AI 流量诊断（当前数据 → 诊断建议卡片） ================= */
  async function aiDiagnose() {
    const all = await DB.list('metrics');
    const today = U.fmtDate(new Date());
    const parts = PLATFORMS.map(p => {
      const rows = getMetrics(all, p.key);
      const k = computeKPI(rows);
      if (!k) return p.name + '：暂无数据';
      return p.name + '：粉丝 ' + k.fans + '，近7天' + (k.grow7 == null ? '—' : (k.grow7 >= 0 ? '+' : '') + k.grow7)
        + '，近30天' + (k.grow30 == null ? '—' : (k.grow30 >= 0 ? '+' : '') + k.grow30) + '，日均' + (k.avgDaily >= 0 ? '+' : '') + k.avgDaily + '（截至 ' + k.lastDate + '）';
    }).join('；');

    state.diagnosis = '⏳ AI 正在诊断流量数据…';
    App.render();
    try {
      const reply = await askGeminiAI('你是自媒体运营专家。基于以下账号粉丝数据做简短流量诊断：先一句话总结现状，再给出 3 条具体可执行的优化建议，总字数 150 字内。\n今日日期：' + today + '\n数据：' + parts);
      state.diagnosis = reply;
    } catch (err) {
      state.diagnosis = '⚠ ' + (err && err.message || 'AI 调用失败');
    }
    App.render();
  }

  function legendItem(color, name) { return U.el('span', {}, [U.el('i', { style: 'background:' + color }), document.createTextNode(name)]); }
})();
