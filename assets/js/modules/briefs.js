/* =====================================================================
 *  模块 · Brief 归档库（独立于脚本）
 *  字段：品名 / 对标视频(多个链接) / brief 文件 / 备注
 *  · 列表 + 按月归档树
 *  与「脚本归档库」分开，归档更清晰。
 * ===================================================================== */
(function () {
  'use strict';
  const state = { tab: 'list' };
  const BRIEF_EXTS = ['doc', 'docx', 'xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'];

  function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }
  function safeUrl(u) {
    try { const p = new URL(u); return (p.protocol === 'http:' || p.protocol === 'https:') ? u : null; }
    catch (_) { return null; }
  }

  App.register('briefs', {
    title: '<span class="accent">📋</span> Brief 归档库',
    render(view) {
      const root = U.el('div');
      root.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'title', html: '<span class="em">📋</span> Brief 归档库' }),
          U.el('div', { class: 'sub', text: '品名 / 对标视频(多链接) / brief 文件 / 备注 · 列表 + 按月归档' }),
        ]),
        U.el('div', { class: 'spacer' }),
        U.el('div', { class: 'tabs' }, [
          U.el('div', { class: 'tab' + (state.tab === 'list' ? ' active' : ''), text: '📋 全部 Brief', onclick: () => { state.tab = 'list'; App.render(); } }),
          U.el('div', { class: 'tab' + (state.tab === 'archive' ? ' active' : ''), text: '🗂 归档树', onclick: () => { state.tab = 'archive'; App.render(); } }),
        ]),
        U.el('button', { class: 'btn btn-primary', text: '＋ 新建 Brief', onclick: () => editBrief(null) }),
      ]));
      const dyn = U.el('div', { style: 'margin-top:8px' }); root.appendChild(dyn);
      view.appendChild(root);
      paint(dyn);
    }
  });

  async function paint(dyn) {
    dyn.innerHTML = '';
    const list = await DB.list('briefs');
    if (state.tab === 'archive') return paintArchive(dyn, list);
    if (!list.length) { dyn.appendChild(U.el('div', { class: 'empty', text: '还没有 Brief，点「新建 Brief」开始归档。' })); return; }
    const grid = U.el('div', { class: 'grid cols-3' });
    list.forEach(s => {
      const title = s.brand || s.title || '未命名 Brief';
      const comps = (s.competitors && s.competitors.length) ? s.competitors : [];
      const ym = ymOf(s);
      grid.appendChild(U.el('div', { class: 'card', onclick: () => editBrief(s) }, [
        U.el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start' }, [
          U.el('div', { style: 'font-weight:800;font-size:15px', text: title }),
          U.el('span', { class: 'badge pink', text: ym }),
        ]),
        U.el('div', { class: 'muted', style: 'font-size:12.5px;line-height:1.6;margin-top:6px', text: '🔗 对标视频：' + comps.length + ' 条' }),
        renderLinks(comps),
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center' }, [
          s.brief
            ? U.el('span', { class: 'file-link', style: 'cursor:pointer', text: '📄 brief：' + s.brief.name, title: '点击查看 / 下载', onclick: (e) => { e.stopPropagation(); U.fileModal(s.brief); } })
            : U.el('span', { text: '📄 brief：无' }),
        ]),
        s.note ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px', text: '📝 ' + s.note.slice(0, 30) + (s.note.length > 30 ? '…' : '') }) : null,
        U.el('div', { style: 'margin-top:10px;display:flex;gap:10px' }, [
          U.el('span', { class: 'link', text: '✎ 编辑', onclick: (e) => { e.stopPropagation(); editBrief(s); } }),
          U.el('span', { class: 'link danger', text: '🗑', onclick: async (e) => { e.stopPropagation(); if (await U.confirm('删除该 Brief？', true)) { await DB.removeQuiet('briefs', s.id); const card = e.target.closest('.card'); if (card) card.remove(); U.toast('已删除', 'success'); } } }),
        ].filter(Boolean)),
      ]));
    });
    dyn.appendChild(grid);
  }

  /* 卡片内渲染对标视频链接（前 3 条：链接 + 一键复制，超出折叠） */
  function renderLinks(comps) {
    if (!comps || !comps.length) return null;
    const box = U.el('div', { style: 'margin-top:4px' });
    comps.slice(0, 3).forEach(u => {
      const safe = safeUrl(u);
      const line = U.el('div', { style: 'font-size:12px;margin-top:2px;display:flex;align-items:center;gap:6px' });
      line.appendChild(safe
        ? U.el('a', { href: safe, target: '_blank', rel: 'noopener', text: '🔗 ' + truncate(u, 30), style: 'color:var(--pink-2);word-break:break-all;flex:1;min-width:0' })
        : U.el('span', { class: 'muted', text: '🔗 ' + truncate(u, 30), style: 'flex:1;min-width:0' }));
      line.appendChild(U.el('span', { class: 'link', text: '📋 复制', style: 'flex:none;font-size:11px;cursor:pointer;white-space:nowrap', onclick: (e) => { e.stopPropagation(); U.copyText(u); } }));
      box.appendChild(line);
    });
    if (comps.length > 3) box.appendChild(U.el('div', { class: 'muted', style: 'font-size:11px;margin-top:2px', text: '…等 ' + comps.length + ' 条（点开查看全部）' }));
    return box;
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
        tree[y][m].forEach(s => mChild.appendChild(U.el('div', { class: 'leaf', text: '📄 ' + (s.brand || s.title || '未命名 Brief'), onclick: () => editBrief(s) })));
        mNode.appendChild(mChild); yChild.appendChild(mNode);
      });
      yNode.appendChild(yChild); root.appendChild(yNode);
    });
    dyn.appendChild(root);
  }

  function ymParts(s) {
    const t = s.createdAt || s.updatedAt || Date.now();
    const d = new Date(t);
    return [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0')];
  }
  function ymOf(s) { const [y, m] = ymParts(s); return y + '-' + m; }

  /* ---------- 新建 / 编辑 Brief ---------- */
  function editBrief(it) {
    const isNew = !it;
    const form = U.el('form', { class: 'script-form' });

    // 1 · 品名 / 品牌
    const head = U.el('div', { class: 'form-row' });
    const brandW = U.el('div'); brandW.appendChild(U.el('label', { text: '1 · 品名 / 品牌' }));
    const brandI = U.el('input', { name: 'brand', value: (it && it.brand) || '', placeholder: '例如：星耀持妆粉底液' });
    brandW.appendChild(brandI); head.appendChild(brandW);
    form.appendChild(head);

    // 2 · 对标视频（多个链接）
    const compWrap = U.el('div', { class: 'field' });
    compWrap.appendChild(U.el('label', { text: '2 · 对标视频（可分别粘贴多个链接，每行一个）' }));
    const compList = U.linkList(it && it.competitors, '粘贴对标视频链接，如 https://www.xiaohongshu.com/...');
    compWrap.appendChild(compList.el);
    form.appendChild(compWrap);

    // 3 · brief 文件上传（含图片）
    const briefWrap = U.el('div', { class: 'field' });
    briefWrap.appendChild(U.el('label', { text: '3 · brief 文件上传（Word / Excel / PDF / 图片）' }));
    const briefState = { file: (it && it.brief) || null };
    briefWrap.appendChild(U.buildFileUpload(briefState, { exts: BRIEF_EXTS, allowImage: true, accept: '.doc,.docx,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.gif,.webp', hint: '未上传 brief 文件' }));
    form.appendChild(briefWrap);

    // 4 · 备注
    const noteWrap = U.el('div', { class: 'field' });
    noteWrap.appendChild(U.el('label', { text: '4 · 备注' }));
    const noteTa = U.el('textarea', { name: 'note', placeholder: '补充说明、对接要点、注意事项…' }); if (it && it.note) noteTa.value = it.note;
    noteWrap.appendChild(noteTa);
    form.appendChild(noteWrap);

    const actions = [
      { label: '取消', value: false },
      { label: isNew ? '创建' : '保存', value: true, primary: true, onclick: () => {
        const base = U.readForm(form);
        const obj = {
          brand: (base.brand || '').trim(),
          competitors: compList.get(),
          brief: briefState.file,
          note: (base.note || '').trim(),
        };
        if (!obj.brand) { U.toast('请填写品名 / 品牌', 'error'); return false; }
        if (isNew) {
          DB.insert('briefs', obj).then(() => U.toast('已创建 Brief', 'success'));
        } else {
          DB.update('briefs', it.id, obj).then(() => U.toast('已保存 Brief', 'success'));
        }
        return true;
      } },
    ];

    const body = U.el('div'); body.appendChild(form);
    U.modal({ title: isNew ? '新建 Brief' : '编辑 Brief · ' + (it.brand || it.title || ''), body, width: 720, actions });
  }
})();
