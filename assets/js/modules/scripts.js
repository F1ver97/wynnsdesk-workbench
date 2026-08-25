/* =====================================================================
 *  模块 6 · 脚本与 Brief 归档库
 *  新建脚本字段：
 *  1 品名 / 2 对标视频(多链接) / 3 视频形式(多选) / 4 脚本档期(日历)
 *  / 5 发布档期(日历) / 6 脚本文件(Excel·Word·PDF) / 7 brief上传(含图片)
 *  / 8 备注
 *  Brief 按月分类归档 / 历史版本管理
 * ===================================================================== */
(function () {
  'use strict';
  const state = { tab: 'list' };
  const FORMATS = ['#全妆跟练', '#变装', '#局部妆教', '#妆效展示随手po', '#仅视频露出'];
  const SCRIPT_EXTS = ['xlsx', 'xls', 'doc', 'docx', 'pdf'];

  App.register('scripts', {
    title: '<span class="accent">📝</span> 脚本归档库',
    render(view) {
      const root = U.el('div');
      root.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'title', html: '<span class="em">📝</span> 脚本归档库' }),
          U.el('div', { class: 'sub', text: '品名 / 对标视频 / 视频形式 / 档期 / 文件 / 备注 · 树状按月归档 · 历史版本恢复' }),
        ]),
        U.el('div', { class: 'spacer' }),
        U.el('div', { class: 'tabs' }, [
          U.el('div', { class: 'tab' + (state.tab === 'list' ? ' active' : ''), text: '📋 脚本列表', onclick: () => { state.tab = 'list'; App.render(); } }),
          U.el('div', { class: 'tab' + (state.tab === 'archive' ? ' active' : ''), text: '🗂 归档树', onclick: () => { state.tab = 'archive'; App.render(); } }),
        ]),
        U.el('button', { class: 'btn btn-primary', text: '＋ 新建脚本', onclick: () => editScript(null) }),
      ]));
      const dyn = U.el('div', { style: 'margin-top:8px' }); root.appendChild(dyn);
      view.appendChild(root);
      paint(dyn);
    }
  });

  async function paint(dyn) {
    dyn.innerHTML = '';
    const list = await DB.list('scripts');
    if (state.tab === 'archive') return paintArchive(dyn, list);
    if (!list.length) { dyn.appendChild(U.el('div', { class: 'empty', text: '还没有脚本，点「新建脚本」开始记录。' })); return; }
    const grid = U.el('div', { class: 'grid cols-3' });
    list.forEach(s => {
      const title = s.brand || s.title || '未命名脚本';
      const ym = ymOf(s);
      const compN = (s.competitors && s.competitors.length) ? s.competitors.length : 0;
      grid.appendChild(U.el('div', { class: 'card', onclick: () => editScript(s) }, [
        U.el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start' }, [
          U.el('div', { style: 'font-weight:800;font-size:15px', text: title }),
          U.el('span', { class: 'badge pink', text: ym }),
        ]),
        U.el('div', { style: 'margin:6px 0', class: 'tag-row' }, (s.formats && s.formats.length ? s.formats : ['(未选形式)']).map(f => U.el('span', { class: 'badge dim', text: f }))),
        renderCompLinks(s.competitors),
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px', text: '📅 脚本档期：' + (s.scriptDate || '—') + ' ｜ 发布档期：' + (s.publishDate || '—') }),
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center' }, [
          s.attachment
            ? U.el('span', { class: 'file-link', style: 'cursor:pointer', text: '📎 脚本：' + s.attachment.name, title: '点击查看 / 下载', onclick: (e) => { e.stopPropagation(); U.fileModal(s.attachment); } })
            : U.el('span', { text: '📎 脚本：无' }),
          s.brief
            ? U.el('span', { class: 'file-link', style: 'cursor:pointer', text: '📋 brief：' + s.brief.name, title: '点击查看 / 下载', onclick: (e) => { e.stopPropagation(); U.fileModal(s.brief); } })
            : U.el('span', { text: '📋 brief：无' }),
        ]),
        s.note ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px', text: '📝 ' + s.note.slice(0, 30) + (s.note.length > 30 ? '…' : '') }) : null,
        U.el('div', { style: 'margin-top:10px;display:flex;gap:10px' }, [
          U.el('span', { class: 'link', text: '✎ 编辑', onclick: (e) => { e.stopPropagation(); editScript(s); } }),
          U.el('span', { class: 'link', text: '🕑 版本(' + (s.versions ? s.versions.length : 0) + ')', onclick: (e) => { e.stopPropagation(); editScript(s, 'versions'); } }),
          U.el('span', { class: 'link danger', text: '🗑', onclick: async (e) => { e.stopPropagation(); if (await U.confirm('删除该脚本？', true)) { await DB.removeQuiet('scripts', s.id); const card = e.target.closest('.card'); if (card) card.remove(); U.toast('已删除', 'success'); } } }),
        ].filter(Boolean)),
      ]));
    });
    dyn.appendChild(grid);
  }

  function paintArchive(dyn, list) {
    if (!list.length) { dyn.appendChild(U.el('div', { class: 'empty', text: '暂无归档内容。' })); return; }
    const tree = {};
    list.forEach(s => {
      const [y, m] = ymParts(s);
      tree[y] = tree[y] || {}; tree[y][m] = tree[y][m] || []; tree[y][m].push(s);
    });
    const root = U.el('div', { class: 'tree card', style: 'padding:18px' });
    Object.keys(tree).sort().forEach(y => {
      const yNode = U.el('div', { class: 'node' }, [U.el('div', { class: 'folder', text: '📁 ' + y + ' 年' })]);
      const yChild = U.el('div', { class: 'children' });
      Object.keys(tree[y]).sort().forEach(m => {
        const mNode = U.el('div', { class: 'node' }, [U.el('div', { class: 'folder', text: '📂 ' + m + ' 月' })]);
        const mChild = U.el('div', { class: 'children' });
        tree[y][m].forEach(s => mChild.appendChild(U.el('div', { class: 'leaf', text: '📄 ' + (s.brand || s.title || '未命名脚本'), onclick: () => editScript(s) })));
        mNode.appendChild(mChild); yChild.appendChild(mNode);
      });
      yNode.appendChild(yChild); root.appendChild(yNode);
    });
    dyn.appendChild(root);
  }

  function ymParts(s) {
    const d = s.scriptDate || s.publishDate || '';
    if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7).split('-');
    return ['未知', '未知'];
  }
  function ymOf(s) { const [y, m] = ymParts(s); return y + '-' + m; }

  /* ---------- 新建 / 编辑脚本 ---------- */
  function editScript(it, openTab) {
    const isNew = !it;
    const form = U.el('form', { class: 'script-form' });

    // 1 · 品名
    const head = U.el('div', { class: 'form-row' });
    const brandW = U.el('div'); brandW.appendChild(U.el('label', { text: '1 · 品名' }));
    const brandI = U.el('input', { name: 'brand', value: (it && it.brand) || '', placeholder: '例如：星耀持妆粉底液' });
    brandW.appendChild(brandI); head.appendChild(brandW);
    form.appendChild(head);

    // 2 · 对标视频（多个链接）
    const compWrap = U.el('div', { class: 'field' });
    compWrap.appendChild(U.el('label', { text: '2 · 对标视频（可分别粘贴多个链接）' }));
    const compList = linkList(it && it.competitors);
    compWrap.appendChild(compList.el);
    form.appendChild(compWrap);

    // 3 · 视频形式（多选下拉）
    const fmtWrap = U.el('div', { class: 'field' });
    fmtWrap.appendChild(U.el('label', { text: '3 · 视频形式（可多选）' }));
    const ms = multiSelect(FORMATS, it && it.formats ? it.formats.slice() : []);
    fmtWrap.appendChild(ms.el);
    form.appendChild(fmtWrap);

    // 4 & 5 · 档期（日历点选）
    const dates = U.el('div', { class: 'form-row' });
    const d1 = U.el('div'); d1.appendChild(U.el('label', { text: '4 · 脚本档期（点选日历）' })); const cal1 = calendarPicker(it && it.scriptDate); d1.appendChild(cal1.el); dates.appendChild(d1);
    const d2 = U.el('div'); d2.appendChild(U.el('label', { text: '5 · 发布档期（点选日历）' })); const cal2 = calendarPicker(it && it.publishDate); d2.appendChild(cal2.el); dates.appendChild(d2);
    form.appendChild(dates);

    // 6 · 脚本文件上传
    const attWrap = U.el('div', { class: 'field' });
    attWrap.appendChild(U.el('label', { text: '6 · 脚本文件上传（Excel / Word / PDF）' }));
    const scriptState = { file: (it && it.attachment) || null };
    attWrap.appendChild(U.buildFileUpload(scriptState, { exts: SCRIPT_EXTS, accept: '.xlsx,.xls,.doc,.docx,.pdf', hint: '未上传脚本文件' }));
    form.appendChild(attWrap);

    // 7 · 备注
    const noteWrap = U.el('div', { class: 'field' });
    noteWrap.appendChild(U.el('label', { text: '7 · 备注' }));
    const noteTa = U.el('textarea', { name: 'note', placeholder: '补充说明、注意事项、对接要点…' }); if (it && it.note) noteTa.value = it.note;
    noteWrap.appendChild(noteTa);
    form.appendChild(noteWrap);

    const actions = [
      { label: '取消', value: false },
      { label: isNew ? '创建' : '保存为新版本', value: true, primary: true, loadingText: isNew ? '⏳ 创建中…' : '⏳ 保存中…', onclick: async () => {
        const base = U.readForm(form);
        const obj = {
          brand: (base.brand || '').trim(),
          competitors: compList.get(),
          formats: ms.get(),
          scriptDate: cal1.get(),
          publishDate: cal2.get(),
          attachment: scriptState.file,
          note: (base.note || '').trim(),
        };
        if (!obj.brand) { U.toast('请填写品名', 'error'); return false; }
        try {
          if (isNew) {
            obj.versions = [snapshot(obj, 1)];
            await DB.insert('scripts', obj);
            U.toast('已创建脚本', 'success');
          } else {
            const vers = it.versions ? it.versions.slice() : [];
            const nv = (vers.length ? Math.max.apply(null, vers.map(v => v.v)) : 0) + 1;
            vers.push(snapshot(obj, nv));
            await DB.update('scripts', it.id, Object.assign({}, obj, { versions: vers }));
            U.toast('已保存第 ' + nv + ' 版', 'success');
          }
          App.render();
          return true;
        } catch (e) {
          U.toast((e && e.message) || '保存失败，请重试', 'error');
          return false;
        }
      } },
    ];

    const body = U.el('div');
    body.appendChild(form);
    if (!isNew) body.appendChild(renderVersions(it));

    U.modal({ title: isNew ? '新建脚本' : '编辑脚本 · ' + (it.brand || it.title || ''), body, width: 760, actions });
  }

  function snapshot(obj, v) {
    return {
      v: v, ts: Date.now(),
      brand: obj.brand, competitors: (obj.competitors || []).slice(), formats: (obj.formats || []).slice(),
      scriptDate: obj.scriptDate, publishDate: obj.publishDate,
      scriptFileName: obj.attachment ? obj.attachment.name : null,
      briefName: obj.brief ? obj.brief.name : null,
      note: obj.note,
    };
  }

  /* ---------- 多选下拉 ---------- */
  function multiSelect(options, selected) {
    const set = new Set(selected);
    const trigger = U.el('div', { class: 'ms-trigger', tabindex: 0 });
    const panel = U.el('div', { class: 'ms-panel' });
    options.forEach(opt => {
      const chk = U.el('input', { type: 'checkbox' }); chk.checked = set.has(opt);
      const row = U.el('label', { class: 'ms-opt' }, [chk, document.createTextNode(' ' + opt)]);
      chk.addEventListener('change', () => { if (chk.checked) set.add(opt); else set.delete(opt); updateTrigger(); });
      panel.appendChild(row);
    });
    const wrap = U.el('div', { class: 'ms-wrap' }, [trigger, panel]);
    function updateTrigger() {
      trigger.innerHTML = '';
      if (set.size === 0) { trigger.appendChild(U.el('span', { class: 'ms-ph', text: '请选择视频形式（可多选）' })); }
      else { Array.from(set).forEach(v => trigger.appendChild(U.el('span', { class: 'chip', text: v }))); }
    }
    updateTrigger();
    trigger.addEventListener('click', (e) => { e.stopPropagation(); wrap.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
    return { el: wrap, get: () => Array.from(set) };
  }

  /* ---------- 对标视频多链接 ---------- */
  function linkList(initial) {
    const arr = (initial && initial.length) ? initial.slice() : [''];
    const box = U.el('div', { class: 'link-list' });
    function render() {
      box.innerHTML = '';
      arr.forEach((val, idx) => {
        const row = U.el('div', { class: 'link-row' });
        const inp = U.el('input', { type: 'text', placeholder: '粘贴对标视频链接，如 https://...', value: val });
        inp.addEventListener('input', () => { arr[idx] = inp.value; });
        const del = U.el('span', { class: 'link danger', text: '✕', style: 'cursor:pointer' });
        del.addEventListener('click', () => { arr.splice(idx, 1); if (arr.length === 0) arr.push(''); render(); });
        row.appendChild(inp); row.appendChild(del);
        if (val && val.trim()) {
          const cp = U.el('span', { class: 'link', text: '📋', title: '复制该链接', style: 'cursor:pointer;flex:none' });
          cp.addEventListener('click', () => U.copyText(inp.value));
          row.appendChild(cp);
        }
        box.appendChild(row);
      });
      const add = U.el('button', { class: 'btn btn-sm', type: 'button', text: '＋ 添加链接' });
      add.addEventListener('click', () => { arr.push(''); render(); });
      box.appendChild(add);
    }
    render();
    return { el: box, get: () => arr.map(s => (s || '').trim()).filter(Boolean) };
  }

  /* ---------- 日历点选日期 ---------- */
  function calendarPicker(value) {
    const fmt = (dt) => { const p = n => String(n).padStart(2, '0'); return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()); };
    let cur = value ? new Date(value + 'T00:00:00') : new Date();
    let selected = value || '';
    const trigger = U.el('div', { class: 'cal-trigger' });
    const pop = U.el('div', { class: 'cal-pop' });
    const wrap = U.el('div', { class: 'cal-wrap' }, [trigger, pop]);
    function renderTrigger() { trigger.textContent = selected || '📅 点击选择日期（年-月-日）'; }
    function renderPop() {
      pop.innerHTML = '';
      const y = cur.getFullYear(), m = cur.getMonth();
      const head = U.el('div', { class: 'cal-head' });
      const prev = U.el('button', { class: 'cal-nav', type: 'button', text: '‹' });
      const next = U.el('button', { class: 'cal-nav', type: 'button', text: '›' });
      const title = U.el('div', { class: 'cal-title', text: y + ' 年 ' + (m + 1) + ' 月' });
      prev.addEventListener('click', (e) => { e.stopPropagation(); cur = new Date(y, m - 1, 1); renderPop(); });
      next.addEventListener('click', (e) => { e.stopPropagation(); cur = new Date(y, m + 1, 1); renderPop(); });
      head.appendChild(prev); head.appendChild(title); head.appendChild(next);
      pop.appendChild(head);
      const grid = U.el('div', { class: 'cal-grid' });
      ['日', '一', '二', '三', '四', '五', '六'].forEach(d => grid.appendChild(U.el('div', { class: 'cal-dow', text: d })));
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      const todayStr = fmt(new Date());
      for (let i = 0; i < first; i++) grid.appendChild(U.el('div', { class: 'cal-cell empty' }));
      for (let d = 1; d <= days; d++) {
        const ds = fmt(new Date(y, m, d));
        const cell = U.el('div', { class: 'cal-cell' + (ds === todayStr ? ' today' : '') + (ds === selected ? ' sel' : ''), text: String(d) });
        cell.addEventListener('click', (e) => { e.stopPropagation(); selected = ds; renderTrigger(); wrap.classList.remove('open'); });
        grid.appendChild(cell);
      }
      pop.appendChild(grid);
    }
    renderTrigger(); renderPop();
    trigger.addEventListener('click', (e) => { e.stopPropagation(); wrap.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
    return { el: wrap, get: () => selected };
  }

  /* ---------- 历史版本 ---------- */
  function renderVersions(it) {
    const box = U.el('div', { style: 'margin-top:18px' });
    box.appendChild(U.el('div', { class: 'section-title', text: '🕑 历史版本（' + (it.versions ? it.versions.length : 0) + '）' }));
    if (!it.versions || !it.versions.length) { box.appendChild(U.el('div', { class: 'muted', text: '暂无历史版本。' })); return box; }
    const list = U.el('div', { class: 'ver-list' });
    it.versions.slice().reverse().forEach(v => {
      const curMax = Math.max.apply(null, it.versions.map(x => x.v));
      list.appendChild(U.el('div', { class: 'ver' + (v.v === curMax ? ' current' : '') }, [
        U.el('span', { class: 'v', text: 'v' + v.v }),
        U.el('span', { class: 'muted', text: U.fmtDateTime(v.ts) }),
        U.el('div', { class: 'spacer', style: 'flex:1' }),
        U.el('span', { class: 'link', text: '对比', onclick: () => compareVersions(it, v) }),
        U.el('span', { class: 'link', text: '恢复此版', onclick: async () => {
          if (!(await U.confirm('恢复到 v' + v.v + '？当前内容将作为新版本保留。', false))) return;
          const vers = it.versions.slice(); const nv = Math.max.apply(null, vers.map(x => x.v)) + 1;
          vers.push({ v: nv, ts: Date.now(), brand: v.brand, competitors: (v.competitors || []).slice(), formats: (v.formats || []).slice(), scriptDate: v.scriptDate, publishDate: v.publishDate, scriptFileName: v.scriptFileName, briefName: v.briefName, note: v.note });
          const restore = { brand: v.brand, competitors: (v.competitors || []).slice(), formats: (v.formats || []).slice(), scriptDate: v.scriptDate, publishDate: v.publishDate, attachment: it.attachment, brief: it.brief, note: v.note };
          await DB.update('scripts', it.id, Object.assign({}, restore, { versions: vers }));
          U.toast('已恢复至 v' + v.v, 'success');
        } }),
      ]));
    });
    box.appendChild(list);
    return box;
  }

  function compareVersions(it, v) {
    const fields = [
      { k: 'brand', label: '品名' },
      { k: 'competitors', label: '对标视频', fmt: (a) => (a && a.length ? a.join('\n') : '—') },
      { k: 'formats', label: '视频形式', fmt: (a) => (a && a.length ? a.join(' ') : '—') },
      { k: 'scriptDate', label: '脚本档期' },
      { k: 'publishDate', label: '发布档期' },
      { k: 'scriptFileName', label: '脚本文件' },
      { k: 'briefName', label: 'brief 文件' },
      { k: 'note', label: '备注' },
    ];
    const rows = fields.map(f => U.el('div', { style: 'margin-bottom:12px' }, [
      U.el('div', { style: 'font-weight:800;color:var(--pink-2);font-size:13px', text: f.label }),
      U.el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px' }, [
        U.el('div', { style: 'background:var(--bg-2);padding:8px;border-radius:8px;font-size:12.5px;white-space:pre-wrap' }, [U.el('div', { class: 'muted', style: 'margin-bottom:4px', text: 'v' + v.v }), document.createTextNode(f.fmt ? f.fmt(v[f.k]) : (v[f.k] || '—'))]),
        U.el('div', { style: 'background:rgba(255,20,147,0.06);padding:8px;border-radius:8px;font-size:12.5px;white-space:pre-wrap' }, [U.el('div', { class: 'muted', style: 'margin-bottom:4px', text: '当前' }), document.createTextNode(f.fmt ? f.fmt(it[f.k]) : (it[f.k] || '—'))]),
      ]),
    ]));
    U.modal({ title: '版本对比 · v' + v.v + ' ↔ 当前', body: U.el('div', {}, rows), width: 680, actions: [{ label: '关闭', value: true, primary: true }] });
  }

  /* 卡片内渲染对标视频链接（前 3 条：链接 + 一键复制，超出折叠） */
  function renderCompLinks(comps) {
    const box = U.el('div', { style: 'margin-top:4px' });
    if (!comps || !comps.length) { box.appendChild(U.el('div', { class: 'muted', style: 'font-size:12.5px;line-height:1.6', text: '🔗 对标视频：0 条' })); return box; }
    box.appendChild(U.el('div', { class: 'muted', style: 'font-size:12.5px;line-height:1.6', text: '🔗 对标视频：' + comps.length + ' 条' }));
    comps.slice(0, 3).forEach(u => {
      const safe = (function () { try { const p = new URL(u); return (p.protocol === 'http:' || p.protocol === 'https:') ? u : null; } catch (_) { return null; } })();
      const t = u.length > 30 ? u.slice(0, 30) + '…' : u;
      const line = U.el('div', { style: 'font-size:12px;margin-top:2px;display:flex;align-items:center;gap:6px' });
      line.appendChild(safe
        ? U.el('a', { href: safe, target: '_blank', rel: 'noopener', text: '🔗 ' + t, style: 'color:var(--pink-2);word-break:break-all;flex:1;min-width:0' })
        : U.el('span', { class: 'muted', text: '🔗 ' + t, style: 'flex:1;min-width:0' }));
      line.appendChild(U.copyBtn(u));
      box.appendChild(line);
    });
    if (comps.length > 3) box.appendChild(U.el('div', { class: 'muted', style: 'font-size:11px;margin-top:2px', text: '…等 ' + comps.length + ' 条（点开查看全部）' }));
    return box;
  }
})();
