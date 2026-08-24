/* =====================================================================
 *  管理后台模块（仅管理员可见）
 *  - 成员管理：邀请同事、查看已注册成员、禁用/启用
 *  - 云端数据管理：各表行数、导出全库、清空某表
 * ===================================================================== */
(function (global) {
  'use strict';
  const App = global.App, DB = global.DB, U = global.U;

  App.register('admin', {
    title: '<span class="accent">🛡️</span> 管理后台',
    render(view) {
      if (!DB.auth.isAdmin()) { view.innerHTML = '<div class="empty">需要管理员权限</div>'; return; }
      const root = U.el('div');

      root.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'title', html: '<span class="em">🛡️</span> 管理后台' }),
          U.el('div', { class: 'sub', text: '成员管理 + 云端数据管理（管理员专属）' }),
        ]),
      ]));

      root.appendChild(memberPanel());
      root.appendChild(dataPanel());
      view.appendChild(root);
    }
  });

  /* ---------------- 成员管理 ---------------- */
  function memberPanel() {
    const panel = U.el('div', { class: 'card', style: 'padding:18px;margin-bottom:18px' });
    panel.appendChild(U.el('div', { class: 'hub-panel-title', text: '👥 成员管理' }));

    // 邀请同事
    const invWrap = U.el('div', { style: 'display:flex;gap:8px;margin:10px 0 4px;flex-wrap:wrap' });
    const invI = U.el('input', { placeholder: '输入同事邮箱，生成邀请链接', style: 'flex:1;min-width:220px' });
    const genBtn = U.el('button', { class: 'btn btn-primary', text: '生成邀请链接', onclick: () => {
      const e = invI.value.trim();
      if (!e) return U.toast('请输入邮箱', 'error');
      const link = DB.auth.inviteLink(e);
      invOut.value = link; invOut.select();
      U.toast('已生成，复制发给同事即可', 'success');
    } });
    invWrap.appendChild(invI); invWrap.appendChild(genBtn);
    panel.appendChild(invWrap);
    const invOut = U.el('input', { readonly: true, placeholder: '邀请链接将显示在这里，可一键复制', style: 'width:100%;margin-bottom:6px' });
    panel.appendChild(invOut);
    panel.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:10px', text: '同事点开链接 → 自己设密码注册 → 自动进入共享工作区。无需你保管密码。' }));

    // 已注册成员列表
    const listBox = U.el('div', { style: 'margin-top:6px' });
    panel.appendChild(listBox);
    loadMembers(listBox);

    return panel;
  }

  async function loadMembers(box) {
    box.innerHTML = '<div class="muted">加载成员…</div>';
    try {
      const sb = global.SUPABASE_CLIENT || global.supabase;
      const { data, error } = await sb.from('user_profiles').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      const rows = data || [];
      if (!rows.length) { box.innerHTML = '<div class="muted">暂无成员记录（成员首次登录后会出现在这里）</div>'; return; }
      const table = U.el('table', { class: 'tbl' });
      table.appendChild(U.el('thead', {}, [U.el('tr', {}, [
        U.el('th', { text: '邮箱' }), U.el('th', { text: '角色' }), U.el('th', { text: '状态' }), U.el('th', { text: '操作' })
      ])]));
      const tb = U.el('tbody');
      rows.forEach(r => {
        const tr = U.el('tr');
        tr.appendChild(U.el('td', { text: r.email || '(未知)' }));
        tr.appendChild(U.el('td', { text: r.role === 'admin' ? '🛡️ 管理员' : '成员' }));
        tr.appendChild(U.el('td', {}, [U.el('span', { class: 'badge ' + (r.disabled ? 'warn' : 'ok'), text: r.disabled ? '已禁用' : '正常' })]));
        const ops = U.el('td', { style: 'white-space:nowrap' });
        if (r.role !== 'admin') {
          ops.appendChild(U.el('span', { class: 'row-action', text: r.disabled ? '启用' : '禁用', onclick: async () => {
            const sb = global.SUPABASE_CLIENT || global.supabase;
            await sb.from('user_profiles').update({ disabled: !r.disabled }).eq('id', r.id);
            loadMembers(box); U.toast('已' + (r.disabled ? '启用' : '禁用') + '该成员', 'success');
          } }));
          ops.appendChild(U.el('span', { class: 'row-action del', style: 'margin-left:8px', text: '注销', onclick: async () => {
            if (!(await U.confirm('注销该成员账号？此操作需你在 Supabase 后台 Auth 用户页完成删除（前端无法直接删账号）。', true))) return;
            const sb = global.SUPABASE_CLIENT || global.supabase;
            await sb.from('user_profiles').delete().eq('id', r.id);
            loadMembers(box); U.toast('已移除其档案（账号本体请在 Supabase Auth 后台删除）', 'info');
          } }));
        } else {
          ops.appendChild(U.el('span', { class: 'muted', text: '—' }));
        }
        tr.appendChild(ops);
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      box.innerHTML = '';
      box.appendChild(table);
    } catch (e) {
      box.innerHTML = '<div class="auth-err">加载失败：' + (e.message || e) + '</div>';
    }
  }

  /* ---------------- 云端数据管理 ---------------- */
  function dataPanel() {
    const panel = U.el('div', { class: 'card', style: 'padding:18px' });
    panel.appendChild(U.el('div', { class: 'hub-panel-title', text: '🗄️ 云端数据管理（Supabase）' }));

    const cols = DB.COLLECTIONS.filter(c => c !== 'hotspots');
    const grid = U.el('div', { class: 'grid cols-2', style: 'margin-top:10px' });
    cols.forEach(col => {
      const card = U.el('div', { class: 'hub-panel', style: 'padding:12px' });
      card.appendChild(U.el('div', { style: 'font-weight:800', text: col }));
      const cnt = U.el('div', { class: 'muted', style: 'font-size:12px;margin:4px 0', text: '…' });
      card.appendChild(cnt);
      const row = U.el('div', { style: 'display:flex;gap:8px;margin-top:6px' });
      row.appendChild(U.el('button', { class: 'btn btn-ghost', style: 'font-size:12px', text: '导出该表', onclick: async () => {
        const data = await DB.list(col);
        download(col + '.json', JSON.stringify(data, null, 2));
      } }));
      row.appendChild(U.el('button', { class: 'btn btn-ghost', style: 'font-size:12px;color:#ff7aa0', text: '清空', onclick: async () => {
        if (!(await U.confirm('确认清空「' + col + '」全部数据？此操作不可恢复。', true))) return;
        const items = await DB.list(col);
        for (const it of items) await DB.removeQuiet(col, it.id);
        U.toast('已清空 ' + col, 'success'); renderCounts();
      } }));
      card.appendChild(row);
      grid.appendChild(card);
    });
    panel.appendChild(grid);

    const expAll = U.el('button', { class: 'btn btn-primary', style: 'margin-top:12px', text: '📦 导出全部数据（JSON）', onclick: async () => {
      const all = await DB.exportAll();
      download('workbench_all.json', JSON.stringify(all, null, 2));
      U.toast('已导出全库', 'success');
    } });
    panel.appendChild(expAll);

    function renderCounts() {
      cols.forEach(async (col, i) => {
        const n = (await DB.list(col)).length;
        const el = grid.children[i] && grid.children[i].querySelector('.muted');
        if (el) el.textContent = '共 ' + n + ' 条';
      });
    }
    setTimeout(renderCounts, 50);

    return panel;
  }

  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})(window);
