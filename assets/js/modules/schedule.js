/* =====================================================================
 *  模块 5 · 档期
 *  日历视图 · 档期冲突预警 · 灵活重排期 · 勾选完成/已发布
 * ===================================================================== */
(function () {
  'use strict';
  const state = { monthOffset: 0 };

  function parse(d) { const [y, m, da] = d.split('-').map(Number); return new Date(y, m - 1, da); }
  function addDays(d, n) { const x = parse(d); x.setDate(x.getDate() + n); return U.fmtDate(x); }
  function endOf(ev) { return addDays(ev.date, Math.max(1, ev.duration || 1) - 1); }
  function overlap(a, b) { return parse(a.date) <= parse(endOf(b)) && parse(b.date) <= parse(endOf(a)); }

  function detectConflicts(list) {
    const conflict = new Set();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (overlap(list[i], list[j])) { conflict.add(list[i].id); conflict.add(list[j].id); }
    }
    return conflict;
  }

  App.register('schedule', {
    title: '<span class="accent">📅</span> 档期',
    render(view) {
      const root = U.el('div');
      root.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'title', html: '<span class="em">📅</span> 档期' }),
          U.el('div', { class: 'sub', text: '日历视图 · 勾选完成 · 冲突预警 · 一键重排期' }),
        ]),
        U.el('div', { class: 'spacer' }),
        U.el('button', { class: 'btn btn-primary', text: '＋ 新建排期', onclick: () => editEvent(null) }),
      ]));
      const dyn = U.el('div', { style: 'margin-top:8px' }); root.appendChild(dyn);
      view.appendChild(root);
      paint(dyn);
    }
  });

  async function paint(dyn) {
    dyn.innerHTML = '';
    let list = await DB.list('schedule');
    const conflicts = detectConflicts(list);
    const conflictCount = conflicts.size;

    // 月份导航
    const base = new Date(); const nav = U.el('div', { class: 'page-head', style: 'margin:0 0 14px' }, [
      U.el('button', { class: 'btn btn-ghost btn-sm', text: '‹ 上个月', onclick: () => { state.monthOffset--; App.render(); } }),
      U.el('div', { class: 'spacer' }),
      U.el('div', { style: 'font-weight:800;font-size:16px', id: 'calTitle' }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn btn-ghost btn-sm', text: '下个月 ›', onclick: () => { state.monthOffset++; App.render(); } }),
    ]);
    dyn.appendChild(nav);
    const shown = new Date(base.getFullYear(), base.getMonth() + state.monthOffset, 1);
    const titleEl = nav.querySelector('#calTitle'); if (titleEl) titleEl.textContent = shown.getFullYear() + ' 年 ' + (shown.getMonth() + 1) + ' 月';

    if (conflictCount) dyn.appendChild(U.el('div', { class: 'badge bad', style: 'margin-bottom:12px;font-size:13px;padding:8px 14px', text: '⚠ 检测到 ' + conflictCount + ' 个排期存在档期冲突（同一档期内容/商单重叠）' }));

    paintCalendar(dyn, list, conflicts, shown);
  }

  function paintCalendar(dyn, list, conflicts, shown) {
    const y = shown.getFullYear(), m = shown.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const today = U.fmtDate(new Date());
    const grid = U.el('div', { class: 'cal' });
    ['日', '一', '二', '三', '四', '五', '六'].forEach(w => grid.appendChild(U.el('div', { class: 'wd', text: w })));
    for (let i = 0; i < first; i++) grid.appendChild(U.el('div'));
    for (let d = 1; d <= days; d++) {
      const ds = U.fmtDate(new Date(y, m, d));
      const evs = list.filter(e => parse(e.date) <= parse(ds) && parse(ds) <= parse(endOf(e)));
      const cell = U.el('div', { class: 'day' + (ds === today ? ' today' : ''), onclick: () => editEvent({ date: ds }) }, [
        U.el('div', { class: 'dnum', text: d }),
      ]);
      evs.slice(0, 3).forEach(e => {
        const isConf = conflicts.has(e.id);
        const chip = U.el('div', { class: 'ev ' + (e.type === 'biz' ? 'biz ' : '') + (isConf ? 'conflict' : '') + (e.done ? ' done' : ''), onclick: (ev) => { ev.stopPropagation(); editEvent(e); } }, [
          doneCheck(e),
          U.el('span', { class: 'ev-title', text: (e.type === 'biz' ? '💼 ' : '📌 ') + e.title }),
          e.done ? U.el('span', { class: 'ev-done-badge', title: '已完成 / Published', text: '已完成 ✓' }) : null,
        ]);
        cell.appendChild(chip);
      });
      if (evs.length > 3) cell.appendChild(U.el('div', { class: 'ev', text: '+' + (evs.length - 3) + ' 更多' }));
      grid.appendChild(cell);
    }
    dyn.appendChild(grid);
  }

  /* ---------- 勾选完成 / 已发布（实时存库，刷新保持） ---------- */
  function doneCheck(e) {
    const chk = U.el('input', { type: 'checkbox', class: 'ev-check sm', title: e.done ? '取消完成' : '勾选完成 / 已发布' });
    chk.checked = !!e.done;
    chk.addEventListener('click', (ev) => ev.stopPropagation());
    chk.addEventListener('change', async (ev) => {
      ev.stopPropagation();
      const done = chk.checked;
      try {
        await DB.update('schedule', e.id, { done, status: done ? 'published' : 'plan', doneAt: done ? Date.now() : null });
        U.toast(done ? '已标记完成 ✓ 已发布' : '已取消完成标记', 'success');
        App.render();
      } catch (err) {
        console.error(err); U.toast('保存失败，请重试', 'error');
      }
    });
    return chk;
  }

  function editEvent(it) {
    const form = U.el('form', { class: 'form-row' });
    const f = (name, label, type, ph, opts) => { const w = U.el('div'); w.appendChild(U.el('label', { text: label })); let i; if (type === 'select') { i = U.el('select', { name }); (opts || []).forEach(o => i.appendChild(U.el('option', { value: o, text: o }))); } else if (type === 'textarea') { i = U.el('textarea', { name, placeholder: ph || '' }); } else { i = U.el('input', { name, type: type || 'text', placeholder: ph || '' }); } if (it && it[name] != null) i.value = it[name]; w.appendChild(i); form.appendChild(w); };
    f('title', '内容/商单标题', 'text', '例如：碎钻妆教程发布');
    f('type', '类型', 'select', '', ['content', 'biz']);
    f('platform', '平台', 'text', '小红书/抖音');
    // 开始日期：日历点选（隐藏 input 供 readForm 读取）
    const wdate = U.el('div');
    wdate.appendChild(U.el('label', { text: '开始日期' }));
    const dateHidden = U.el('input', { type: 'hidden', name: 'date' });
    if (it && it.date) dateHidden.value = it.date;
    const dateCal = U.calendarPicker(it && it.date ? it.date : '', (v) => { dateHidden.value = v; });
    wdate.appendChild(dateHidden); wdate.appendChild(dateCal.el);
    form.appendChild(wdate);
    f('duration', '持续天数', 'number');
    f('status', '状态', 'select', '', ['plan', 'shooting', 'review', 'published']);
    const wn = U.el('div', { class: 'full' }); wn.appendChild(U.el('label', { text: '备注' })); const ta = U.el('textarea', { name: 'note', placeholder: '关联热点/商单说明…' }); if (it && it.note) ta.value = it.note; wn.appendChild(ta); form.appendChild(wn);

    if (!it || !it.id) {
      U.modal({ title: '新建排期', body: form, width: 640, actions: [
        { label: '取消', value: false },
        { label: '创建', value: true, primary: true, onclick: async () => {
          const obj = U.readForm(form); obj.duration = Math.max(1, Number(obj.duration) || 1);
          await DB.insert('schedule', obj);
          U.toast('已添加排期', 'success'); return true;
        } },
      ] });
      return;
    }

    // 编辑模式：先保存表单字段，再提供重排期操作
    U.modal({ title: '排期详情 · ' + (it.title || ''), body: formBody(form, it), width: 660, actions: [
      { label: '删除', value: false, danger: true, onclick: async () => { if (await U.confirm('删除该排期？', true)) { await DB.removeQuiet('schedule', it.id); U.toast('已删除', 'success'); App.render(); return true; } return false; } },
      { label: '保存修改', value: true, primary: true, onclick: async () => { await persistForm(it, form); return true; } },
      { label: '延后 3 天', value: 'shift', onclick: async () => { await persistForm(it, form); await DB.update('schedule', it.id, { date: addDays((await DB.get('schedule', it.id)).date, 3) }); U.toast('已延后 3 天', 'success'); return 'shift'; } },
      { label: '重排期并顺延后续', value: 'cascade', onclick: async () => { await cascadeReschedule(it, form); return 'cascade'; } },
    ] });
  }

  async function persistForm(it, form) {
    const obj = U.readForm(form);
    obj.duration = Math.max(1, Number(obj.duration) || 1);
    await DB.update('schedule', it.id, obj);
    U.toast('已保存修改', 'success');
  }

  async function cascadeReschedule(it, form) {
    const obj = U.readForm(form);
    const newDate = obj.date;
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) { U.toast('请先在表单中填写正确的开始日期', 'error'); return; }
    const delta = Math.round((parse(newDate) - parse(it.date)) / 86400000);
    obj.duration = Math.max(1, Number(obj.duration) || 1);
    await DB.update('schedule', it.id, obj);
    if (delta !== 0) {
      const all = await DB.list('schedule');
      for (const e of all) { if (e.id !== it.id && parse(e.date) > parse(it.date)) await DB.update('schedule', e.id, { date: addDays(e.date, delta) }); }
      U.toast('已重排并顺延后续 ' + Math.abs(delta) + ' 天', 'success');
    } else {
      U.toast('已更新排期日期', 'success');
    }
  }

  function formBody(form, it) {
    const box = U.el('div');
    box.appendChild(form);
    box.appendChild(U.el('div', { class: 'muted', style: 'margin-top:14px;font-size:12.5px;line-height:1.7', html: '· <b>保存修改</b>：保存上方所有字段。<br>· <b>延后 3 天</b>：仅本节点日期 +3 天。<br>· <b>重排期并顺延后续</b>：在上方修改「开始日期」后点击，系统自动把更晚的节点同步顺延相同天数，避免后续错位。' }));
    return box;
  }
})();
