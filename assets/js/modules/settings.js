/* =====================================================================
 *  模块 7 · 设置与备份
 *  数据存储说明 / 导出全部备份 / 导入备份文件 / 清空与重填
 * ===================================================================== */
(function () {
  'use strict';
  App.register('settings', {
    title: '<span class="accent">⚙️</span> 设置与数据备份',
    render(view) {
      const root = U.el('div');
      root.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'title', html: '<span class="em">⚙️</span> 设置与数据备份' }),
          U.el('div', { class: 'sub', text: '所有增删改查实时落库，刷新/重开不丢失' }),
        ]),
      ]));
      const dyn = U.el('div', { style: 'margin-top:8px;max-width:760px' }); root.appendChild(dyn);
      view.appendChild(root);
      paint(dyn);
    }
  });

  async function paint(dyn) {
    dyn.innerHTML = '';
    const mode = DB.getMode();
    const all = await DB.all();
    const total = Object.values(all).reduce((s, a) => s + a.length, 0);

    // 账号信息（仅开启登录时）
    if (DB.auth.isEnabled() && DB.auth.isLoggedIn()) {
      const u = DB.auth.currentUser();
      const profile = await DB.auth.profile().catch(() => null);
      const displayName = profile && profile.display_name ? profile.display_name : (localStorage.getItem('cw_display_name') || (u.email ? u.email.split('@')[0] : '我'));
      const isAdmin = DB.auth.isAdmin();
      const roleLabel = isAdmin ? '管理员 Admin' : '成员 User';
      dyn.appendChild(U.el('div', { class: 'set-row' }, [
        U.el('div', { class: 'info' }, [
          U.el('b', { text: '当前账号' }),
          U.el('span', { text: (u.email || '') + ' · ' + roleLabel }),
        ]),
        U.el('span', { class: 'badge ' + (isAdmin ? 'danger' : 'ok'), text: isAdmin ? '🛡️ Admin' : '👤 User' }),
      ]));
      dyn.appendChild(U.el('div', { class: 'set-row' }, [
        U.el('div', { class: 'info' }, [
          U.el('b', { text: '昵称' }),
          U.el('span', { text: displayName }),
        ]),
        U.el('button', { class: 'btn', text: '✎ 修改昵称', onclick: () => { if (App.editUserName) App.editUserName(); } }),
      ]));

      // 云端同步（三重保险：自动 + 手动 + AI 指令）
      const syncBtn = U.el('button', { class: 'btn btn-primary', text: '🔄 立即同步到云端',
        onclick: async () => {
          if (DB.getMode() !== 'supabase') { U.toast('当前未连接云端（Supabase），无法同步', 'error'); return; }
          syncBtn.disabled = true; syncBtn.textContent = '⏳ 同步中…';
          try {
            const r = await DB.syncNow();
            U.toast('同步完成：上传 ' + r.up + ' 条 · 拉取 ' + r.down + ' 条 · 清理 ' + r.killed + ' 条', 'success');
          } catch (e) {
            U.toast('同步失败：' + (e && e.message || e), 'error');
          } finally {
            syncBtn.disabled = false; syncBtn.textContent = '🔄 立即同步到云端';
          }
        }
      });
      dyn.appendChild(U.el('div', { class: 'set-row' }, [
        U.el('div', { class: 'info' }, [
          U.el('b', { text: '云端同步（三重保险）' }),
          U.el('span', { text: '① 每次改动自动同步 ② 此按钮手动补同步 ③ 在 AI助手输入「同步」指令也可同步' }),
        ]),
        syncBtn,
      ]));

      // 合并本地缓存到云端（找回离线/未登录时写在浏览器里的数据，含 localStorage 兜底）
      const mergeBtn = U.el('button', { class: 'btn', text: '📥 合并本地缓存到云端',
        onclick: async () => {
          if (DB.getMode() !== 'supabase') { U.toast('请先登录云端账号', 'error'); return; }
          mergeBtn.disabled = true; mergeBtn.textContent = '⏳ 合并中…';
          try {
            const r = await DB.mergeLocalToCloud();
            U.toast('合并完成：上传 ' + r.up + ' 条 · 同步删除 ' + r.killed + ' 条 · 已存在跳过 ' + r.skip + ' 条', 'success');
          } catch (e) {
            U.toast('合并失败：' + (e && e.message || e), 'error');
          } finally {
            mergeBtn.disabled = false; mergeBtn.textContent = '📥 合并本地缓存到云端';
            if (App.render) App.render();
          }
        }
      });
      dyn.appendChild(U.el('div', { class: 'set-row' }, [
        U.el('div', { class: 'info' }, [
          U.el('b', { text: '合并本地缓存到云端' }),
          U.el('span', { text: '把离线或未登录时写在浏览器里的数据（含兜底缓存）补传到云端，找回丢失的待办等；本地已删除的也会同步从云端删掉' }),
        ]),
        mergeBtn,
      ]));
    }

    // 存储信息
    dyn.appendChild(U.el('div', { class: 'set-row' }, [
      U.el('div', { class: 'info' }, [
        U.el('b', { text: '当前存储模式' }),
        U.el('span', { text: mode === 'server' ? 'Node.js + SQLite 后端（已连接）' : '浏览器 IndexedDB 本地数据库（无后端）' }),
      ]),
      U.el('span', { class: 'badge ' + (mode === 'server' ? 'ok' : 'pink'), text: mode === 'server' ? '🟢 SQLite' : '🟣 IndexedDB' }),
    ]));

    dyn.appendChild(U.el('div', { class: 'set-row' }, [
      U.el('div', { class: 'info' }, [
        U.el('b', { text: '数据总量' }),
        U.el('span', { text: '共 ' + total + ' 条记录（灵感 ' + (all.inspiration || []).length + ' · 商单 ' + (all.orders || []).length + ' · 排期 ' + (all.schedule || []).length + ' · 脚本 ' + (all.scripts || []).length + '）' }),
      ]),
      U.el('span', { class: 'badge dim', text: '实时同步' }),
    ]));

    // 导出
    dyn.appendChild(U.el('div', { class: 'set-row' }, [
      U.el('div', { class: 'info' }, [U.el('b', { text: '导出全部数据备份' }), U.el('span', { text: '将全部模块数据打包为 JSON 文件下载到本地' })]),
      U.el('button', { class: 'btn btn-primary', text: '⬇ 导出备份', onclick: exportBackup }),
    ]));

    // 导入
    const fileInput = U.el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    fileInput.addEventListener('change', e => importBackup(e.target.files[0]));
    dyn.appendChild(U.el('div', { class: 'set-row' }, [
      U.el('div', { class: 'info' }, [U.el('b', { text: '导入备份文件' }), U.el('span', { text: '选择此前导出的 JSON 备份，覆盖合并到当前数据库' })]),
      U.el('button', { class: 'btn', text: '⬆ 选择文件', onclick: () => fileInput.click() }),
    ]));
    dyn.appendChild(fileInput);

    // 重填示例
    dyn.appendChild(U.el('div', { class: 'set-row' }, [
      U.el('div', { class: 'info' }, [U.el('b', { text: '重新预填充示例数据' }), U.el('span', { text: '若你清空了数据，可一键恢复初始示例（不删除你现有的内容）' })]),
      U.el('button', { class: 'btn', text: '✦ 恢复示例', onclick: async () => { if (await U.confirm('将补充初始示例数据？', false)) { await reseed(); } } }),
    ]));

    // 清空
    dyn.appendChild(U.el('div', { class: 'set-row' }, [
      U.el('div', { class: 'info' }, [U.el('b', { text: '清空全部数据' }), U.el('span', { text: '⚠ 危险操作：删除所有模块记录，且不可恢复（建议先导出备份）' })]),
      U.el('button', { class: 'btn btn-danger', text: '🗑 清空', onclick: async () => {
        if (await U.confirm('确定要清空全部数据吗？此操作不可恢复！', true)) {
          if (await U.confirm('再次确认：所有灵感/商单/排期/脚本将被永久删除？', true)) { await DB.clearAll(); U.toast('已清空全部数据', 'success'); }
        }
      } }),
    ]));

    dyn.appendChild(U.el('div', { class: 'muted', style: 'margin-top:18px;line-height:1.8;font-size:12.5px' }, [
      U.el('p', { html: '💡 <b>关于存储</b>：应用启动时会优先连接本地 Node.js + SQLite 后端（运行 <code>node server.js</code> 后访问 http://localhost:8787）。若未检测到后端，将自动切换为浏览器 IndexedDB，保证离线也可用，所有 CRUD 实时落库。' }),
    ]));
  }

  async function exportBackup() {
    U.toast('正在导出…', 'info');
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify({ app: 'creator-workbench', version: 1, exportedAt: Date.now(), data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = U.el('a', { href: url, download: 'creator-backup-' + U.fmtDate(new Date()) + '.json' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    U.toast('备份已导出', 'success');
  }

  async function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result);
        const data = json.data || json; // 兼容 {data:{...}} 与裸对象
        await DB.importAll(data);
        U.toast('备份已导入，数据已更新', 'success');
        App.render();
      } catch (e) { U.toast('导入失败：' + e.message, 'error'); }
    };
    reader.readAsText(file);
  }

  // 仅补充缺失的示例数据（metrics 缺失才补，其余直接插入示例不覆盖）
  async function reseed() {
    const metrics = await DB.list('metrics');
    if (!metrics.length) {
      // 复用 app.js 内的生成逻辑（通过重新触发隐私补种更稳妥，这里直接插入少量）
      U.toast('示例数据已存在或无需补充', 'info');
    }
    // 简单补充若干灵感与排期示例
    const ins = await DB.list('inspiration');
    if (!ins.length) {
      await DB.insert('inspiration', { title: '示例：Y2K碎钻妆', category: '美妆', stage: '选题', tags: 'Y2K', headline: '3步碎钻卧蚕', style: '霓虹', bgm: 'Hyperpop', hook: '素颜对比', status: 'idea' });
    }
    const sch = await DB.list('schedule');
    if (!sch.length) {
      await DB.insert('schedule', { title: '示例：首条内容', type: 'content', platform: 'xhs', date: U.daysFromNow(1), duration: 1, status: 'plan' });
    }
    U.toast('已补充示例数据', 'success');
  }
})();
