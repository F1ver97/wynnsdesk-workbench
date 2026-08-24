/* =====================================================================
 *  模块 4 · PR对接
 *  报价询问 → 寄品中 → 脚本审核 → 发布前审核 → 财务结算 → 已完成归档
 * ===================================================================== */
(function () {
  'use strict';
  const STAGES = [
    { key: 'inquiry', name: '报价询问', n: '①' },
    { key: 'sample', name: '寄品中', n: '②' },
    { key: 'script', name: '脚本审核', n: '③' },
    { key: 'prepub', name: '发布前审核', n: '④' },
    { key: 'settle', name: '财务结算', n: '⑤' },
  ];
  const DONE_KEY = 'done', DONE_NAME = '已完成';
  // 历史数据阶段映射（评估决策→寄品中、执行对接→脚本审核）
  const LEGACY = { eval: 'sample', exec: 'script' };
  // 有效阶段：已完成（含尾款已结清的历史商单）优先归档
  function effStage(o) { if (o.stage === DONE_KEY || o.paid) return DONE_KEY; return LEGACY[o.stage] || o.stage; }
  const state = { stage: 'all' };

  App.register('orders', {
    title: '<span class="accent">💼</span> PR对接',
    render(view) {
      const root = U.el('div');
      root.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'title', html: '<span class="em">💼</span> PR对接' }),
          U.el('div', { class: 'sub', text: '从报价询问到尾款结算，全生命周期一站追踪' }),
        ]),
        U.el('div', { class: 'spacer' }),
        U.el('button', { class: 'btn btn-primary', text: '＋ 登记商单', onclick: () => editOrder(null) }),
      ]));
      const dyn = U.el('div'); root.appendChild(dyn);
      view.appendChild(root);
      paint(dyn);
    }
  });

  async function paint(dyn) {
    dyn.innerHTML = '';
    let list = await DB.list('orders');

    // 阶段管道（含「已完成」归档）
    const pipe = U.el('div', { class: 'pipe' });
    pipe.appendChild(stageChip('all', '全部', list.length, state.stage === 'all'));
    STAGES.forEach(s => pipe.appendChild(stageChip(s.key, s.name, list.filter(o => effStage(o) === s.key).length, state.stage === s.key)));
    pipe.appendChild(stageChip(DONE_KEY, '✓ ' + DONE_NAME, list.filter(o => effStage(o) === DONE_KEY).length, state.stage === DONE_KEY));
    dyn.appendChild(pipe);

    if (state.stage !== 'all') list = list.filter(o => effStage(o) === state.stage);

    // 预警统计
    const overdue = list.filter(o => effStage(o) === 'settle' && !o.paid && new Date(o.due) < new Date());
    if (overdue.length) dyn.appendChild(U.el('div', { class: 'badge bad', style: 'margin-bottom:12px;font-size:13px;padding:8px 14px', text: '⚠ ' + overdue.length + ' 笔商单已超时未结清尾款，请及时催款' }));

    if (!list.length) { dyn.appendChild(U.el('div', { class: 'empty', text: '该阶段暂无商单。' })); return; }

    const table = U.el('table');
    table.appendChild(U.el('thead', {}, U.el('tr', {}, [
      th('品牌 / PR'), th('预算'), th('档期月份'), th('阶段'), th('决策'), th('尾款'), th('操作')
    ])));
    const tb = U.el('tbody');
    list.forEach(o => {
      const es = effStage(o);
      const overdue = es === 'settle' && !o.paid && new Date(o.due) < new Date();
      tb.appendChild(U.el('tr', {}, [
        U.el('td', {}, [
          U.el('div', { style: 'font-weight:800', text: o.brand || '未命名' }),
          U.el('div', { class: 'muted', style: 'font-size:12px', text: '📞 ' + (o.pr || '—') + (o.contact ? ' · ' + o.contact : '') + ' · ' + (o.platform || '') }),
        ]),
        U.el('td', {}, [U.el('b', { style: 'color:var(--pink-2)', text: '¥' + U.fmtNum(o.budget || 0) })]),
        U.el('td', { class: 'muted', text: o.month || '—' }),
        U.el('td', {}, [es === DONE_KEY ? U.el('span', { class: 'badge ok', text: '✓ ' + DONE_NAME }) : U.el('span', { class: 'badge pink', text: stageName(es) })]),
        U.el('td', {}, [decisionBadge(o.decision)]),
        U.el('td', {}, [o.paid ? U.el('span', { class: 'badge ok', text: '已结清' }) : U.el('span', { class: 'badge ' + (overdue ? 'bad' : 'warn'), text: overdue ? '超时未结' : '待结算' })]),
        U.el('td', { style: 'white-space:nowrap;vertical-align:top' }, [
          U.el('span', { class: 'row-action', text: '编辑', onclick: () => editOrder(o) }),
          es !== DONE_KEY ? U.el('span', { class: 'row-action', text: '推进', onclick: () => advance(o) }) : null,
          U.el('span', { class: 'row-action del', text: '删除', onclick: async (e) => { if (await U.confirm('删除该商单？', true)) { await DB.removeQuiet('orders', o.id); const row = e.target.closest('tr'); if (row) row.remove(); U.toast('已删除', 'success'); } } }),
          es === 'settle' && !o.paid ? U.el('span', { class: 'row-action', text: '催款', onclick: () => remind(o) }) : null,
        ]),
      ]));
    });
    table.appendChild(tb);
    const card = U.el('div', { class: 'card no-lift', style: 'padding:6px 4px;overflow:auto' }, [table]);
    dyn.appendChild(card);
  }

  function stageChip(key, name, count, active) {
    return U.el('div', { class: 'stage' + (active ? ' active' : ''), onclick: () => { state.stage = key; App.render(); } }, [
      U.el('div', { class: 'n', text: name }), U.el('div', { class: 'c', text: count }),
    ]);
  }
  function stageName(k) { if (k === DONE_KEY) return DONE_NAME; const s = STAGES.find(x => x.key === k); return s ? s.name : k; }
  function th(t) { return U.el('th', { text: t }); }
  function decisionBadge(d) {
    if (d === '接') return U.el('span', { class: 'badge ok', text: '✓ 接' });
    if (d === '不接') return U.el('span', { class: 'badge bad', text: '✕ 不接' });
    if (d === '评估中') return U.el('span', { class: 'badge warn', text: '评估中' });
    return U.el('span', { class: 'badge dim', text: '待定' });
  }

  function nextStage(k) { const i = STAGES.findIndex(s => s.key === k); return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1].key : null; }
  async function advance(o) {
    const es = effStage(o);
    if (es === DONE_KEY) { U.toast('该商单已完成', 'info'); return; }
    if (es === 'settle') {
      // 财务结算 → 已完成：自动结清尾款并归档
      await DB.update('orders', o.id, { stage: DONE_KEY, paid: true, doneAt: Date.now() });
      U.toast('尾款已结清，商单已归档至「已完成」', 'success');
      return;
    }
    const ns = nextStage(es);
    if (!ns) { U.toast('已是最后阶段（财务结算）', 'info'); return; }
    await DB.update('orders', o.id, { stage: ns });
    U.toast('已推进至：' + stageName(ns), 'success');
  }
  async function remind(o) {
    await DB.update('orders', o.id, { remindedAt: Date.now() });
    U.toast('已记录一次催款提醒（' + U.fmtDateTime(Date.now()) + '）', 'success');
  }

  function editOrder(it) {
    const form = U.el('form', { class: 'form-row' });
    const f = (name, label, opts) => { const w = U.el('div'); w.appendChild(U.el('label', { text: label })); let i; if (opts && opts.type === 'select') { i = U.el('select', { name }); (opts.options || []).forEach(o => i.appendChild(U.el('option', { value: o, text: o }))); } else if (opts && opts.type === 'textarea') { i = U.el('textarea', { name, placeholder: opts.ph || '' }); } else { i = U.el('input', { name, placeholder: opts && opts.ph || '', type: (opts && opts.type) || 'text' }); } if (it && it[name] != null) i.value = it[name]; w.appendChild(i); form.appendChild(w); return w; };
    f('brand', '品牌名称');
    f('pr', 'PR联系方式');
    f('contact', '合作形式');
    f('platform', '投放平台');
    f('budget', '预算(元)', { type: 'number' });
    f('month', '预计发布月份', { type: 'month' });
    // 当前阶段：中文选项（存储值保持不变，兼容历史数据）
    const wstage = U.el('div');
    wstage.appendChild(U.el('label', { text: '当前阶段' }));
    const stageSel = U.el('select', { name: 'stage' });
    STAGES.forEach(s => stageSel.appendChild(U.el('option', { value: s.key, text: s.n + ' ' + s.name })));
    stageSel.appendChild(U.el('option', { value: DONE_KEY, text: '✓ ' + DONE_NAME }));
    const curStage = it ? effStage(it) : 'inquiry';
    stageSel.value = STAGES.some(s => s.key === curStage) || curStage === DONE_KEY ? curStage : 'inquiry';
    wstage.appendChild(stageSel); form.appendChild(wstage);
    f('decision', '接单决策', { type: 'select', options: ['', '接', '不接', '评估中'] });
    // 截止/发布日期：日历点选（隐藏 input 供 readForm 读取）
    const wdue = U.el('div');
    wdue.appendChild(U.el('label', { text: '截止/发布日期' }));
    const dueHidden = U.el('input', { type: 'hidden', name: 'due' });
    if (it && it.due) dueHidden.value = it.due;
    const dueCal = U.calendarPicker(it && it.due ? it.due : '', (v) => { dueHidden.value = v; });
    wdue.appendChild(dueHidden); wdue.appendChild(dueCal.el);
    form.appendChild(wdue);
    const wpaid = U.el('div'); wpaid.appendChild(U.el('label', { text: '尾款状态' })); const sel = U.el('select', { name: 'paid' }); [['false', '未结清'], ['true', '已结清']].forEach(([v, t]) => sel.appendChild(U.el('option', { value: v, text: t }))); if (it) sel.value = String(!!it.paid); wpaid.appendChild(sel); form.appendChild(wpaid);
    const wnote = U.el('div', { class: 'full' }); wnote.appendChild(U.el('label', { text: '备注' })); const ta = U.el('textarea', { name: 'note', placeholder: '需求要点、脚本要求、审核节点…' }); if (it && it.note) ta.value = it.note; wnote.appendChild(ta); form.appendChild(wnote);

    U.modal({ title: it ? '编辑商单' : '登记商单', body: form, width: 640, actions: [
      { label: '取消', value: false },
      { label: '保存', value: true, primary: true, onclick: () => {
        const obj = U.readForm(form); obj.budget = Number(obj.budget) || 0; obj.paid = obj.paid === 'true' || obj.stage === DONE_KEY;
        if (it) { DB.update('orders', it.id, obj).then(() => U.toast('已保存', 'success')); } else { DB.insert('orders', obj).then(() => U.toast('已登记', 'success')); }
        return true;
      } }
    ] });
  }
})();
