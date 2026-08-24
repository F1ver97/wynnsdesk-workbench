/* =====================================================================
 *  模块 2 · 灵感与素材库
 *  拼贴（#封面 / #剪辑排版 分类板块）/ 创作灵感 / 对标视频拆解
 * ===================================================================== */
(function () {
  'use strict';
  const state = { tab: 'gallery', compTag: '' };
  const CATEGORIES = ['#美妆', '#穿搭', '#好物分享', '#plog', '#vlog'];
  const BOARDS = ['封面', '剪辑排版'];

  App.register('inspiration', {
    title: '<span class="accent">💡</span> 灵感与素材库',
    render(view) {
      const root = U.el('div');
      root.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'title', html: '<span class="em">💡</span> 灵感与素材库' }),
          U.el('div', { class: 'sub', text: '拼贴 · 创作灵感 · 对标视频拆解' }),
        ]),
        U.el('div', { class: 'spacer' }),
        U.el('div', { class: 'tabs' }, [
          tab('gallery', '🖼️ 拼贴'), tab('ideas', '🧠 创作灵感'), tab('comp', '🔍 对标拆解'),
        ]),
      ]));
      const dyn = U.el('div', { style: 'margin-top:16px' }); root.appendChild(dyn);
      view.appendChild(root);
      paint(dyn);

      function tab(key, label) { return U.el('div', { class: 'tab' + (state.tab === key ? ' active' : ''), text: label, onclick: () => { state.tab = key; App.render(); } }); }
    }
  });

  async function paint(dyn) {
    dyn.innerHTML = '';
    if (state.tab === 'gallery') await paintGallery(dyn);
    else if (state.tab === 'ideas') await paintIdeas(dyn);
    else await paintComp(dyn);
  }

  /* ---------------- 拼贴（#封面 / #剪辑排版 两个分类板块） ---------------- */
  async function paintGallery(dyn) {
    const items = await DB.list('collage');

    const boardsRow = U.el('div', { class: 'grid cols-2' });
    for (const board of BOARDS) {
      const boardItems = items.filter(it => (it.board || '封面') === board);
      const box = U.el('div', { class: 'card board', style: 'padding:16px' });
      const head = U.el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px' }, [
        U.el('div', { style: 'font-weight:800;font-size:15px' }, [
          U.el('span', { class: 'badge pink', text: '#' + board }),
          U.el('span', { class: 'muted', style: 'margin-left:8px;font-size:12px;font-weight:400', text: boardItems.length + ' 张' }),
        ]),
        U.el('label', { class: 'btn btn-primary btn-sm', style: 'cursor:pointer' }, [
          document.createTextNode('⬆ 上传'),
          (function () { const i = U.el('input', { type: 'file', accept: 'image/*', multiple: 'multiple', style: 'display:none' }); i.addEventListener('change', e => handleUpload(e.target.files, board)); return i; })()
        ]),
      ]);
      box.appendChild(head);

      if (!boardItems.length) {
        box.appendChild(U.el('div', { class: 'muted', style: 'font-size:12.5px;padding:18px 0;text-align:center', text: '还没有图片，点击「上传」添加到 #' + board }));
      } else {
        const gal = U.el('div', { class: 'gallery' });
        boardItems.forEach(it => {
          gal.appendChild(U.el('div', { class: 'tile', onclick: () => viewImage(it) }, [
            U.el('img', { src: it.dataUrl, alt: it.title || '' }),
            U.el('div', { class: 'cap', text: it.title || '未命名' }),
            U.el('button', { class: 'del', html: '🗑', onclick: async (e) => { e.stopPropagation(); if (await U.confirm('删除这张图片？', true)) { await DB.removeQuiet('collage', it.id); const tile = e.target.closest('.tile'); if (tile) tile.remove(); U.toast('已删除', 'success'); } } }),
          ]));
        });
        box.appendChild(gal);
      }
      boardsRow.appendChild(box);
    }
    dyn.appendChild(boardsRow);
  }
  function handleUpload(files, board) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = async () => {
        await DB.insert('collage', { title: file.name.replace(/\.[^.]+$/, ''), dataUrl: reader.result, board: board || '封面' });
        U.toast('已添加到 #' + (board || '封面') + '：' + file.name, 'success');
      };
      reader.readAsDataURL(file);
    });
  }
  function viewImage(it) {
    const other = (it.board || '封面') === '封面' ? '剪辑排版' : '封面';
    U.modal({
      title: (it.title || '拼贴') + ' · #' + (it.board || '封面'),
      body: U.el('div', {}, [
        U.el('img', { src: it.dataUrl, style: 'width:100%;border-radius:12px' }),
        U.el('p', { class: 'muted', style: 'margin-top:8px', text: '上传于 ' + U.fmtDateTime(it.createdAt) }),
      ]),
      width: 600,
      actions: [
        { label: '移动到 #' + other, value: 'move', onclick: async () => { await DB.update('collage', it.id, { board: other }); U.toast('已移动到 #' + other, 'success'); return true; } },
        { label: '关闭', value: true, primary: true },
      ]
    });
  }

  /* ---------------- 创作灵感 ---------------- */
  async function paintIdeas(dyn) {
    const list = await DB.list('inspiration');
    dyn.appendChild(U.el('div', { class: 'page-head', style: 'margin-bottom:14px' }, [
      U.el('div', { class: 'sub', text: '卡片化记录选题灵感：分类、备注与对标链接。' }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn btn-primary', text: '＋ 新建灵感', onclick: () => editIdea(null) }),
    ]));
    if (!list.length) { dyn.appendChild(U.el('div', { class: 'empty', text: '暂无灵感卡片，点「新建灵感」开始头脑风暴。' })); return; }
    const grid = U.el('div', { class: 'grid cols-3' });
    list.forEach(it => {
      const compN = (it.competitors && it.competitors.length) || 0;
      const card = U.el('div', { class: 'card idea-card', onclick: () => editIdea(it) }, [
        U.el('div', { style: 'font-size:15px;font-weight:800', text: it.title || '未命名灵感' }),
        U.el('div', { class: 'tag-row', style: 'margin-top:8px' }, (it.categories && it.categories.length ? it.categories : []).map(c => U.el('span', { class: 'badge pink', text: c }))),
        it.note ? U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:8px;line-height:1.6', text: it.note }) : null,
        compN ? U.el('div', { class: 'muted', style: 'font-size:12.5px;margin-top:8px', text: '🔗 对标视频：' + compN + ' 条（已同步到对标拆解）' }) : null,
        U.el('div', { class: 'foot' }, [
          U.el('span', { class: 'link', text: '✎ 编辑', onclick: (e) => { e.stopPropagation(); editIdea(it); } }),
          U.el('span', { class: 'link danger', text: '🗑 删除', onclick: async (e) => { e.stopPropagation(); if (await U.confirm('删除该灵感？', true)) { await DB.removeQuiet('inspiration', it.id); const card = e.target.closest('.card'); if (card) card.remove(); U.toast('已删除', 'success'); } } }),
        ]),
      ]);
      grid.appendChild(card);
    });
    dyn.appendChild(grid);
  }

  function editIdea(it) {
    const isNew = !it;
    const form = U.el('form', { class: 'script-form' });

    // 1 · 选题标题
    const w1 = U.el('div', { class: 'field' });
    w1.appendChild(U.el('label', { text: '选题标题' }));
    const titleI = U.el('input', { name: 'title', placeholder: '例如：Y2K碎钻妆容', value: (it && it.title) || '' });
    w1.appendChild(titleI); form.appendChild(w1);

    // 2 · 分类（多选下拉）
    const w2 = U.el('div', { class: 'field' });
    w2.appendChild(U.el('label', { text: '分类（可多选）' }));
    const ms = U.multiSelect(CATEGORIES, it && it.categories ? it.categories.slice() : []);
    w2.appendChild(ms.el); form.appendChild(w2);

    // 3 · 备注
    const w3 = U.el('div', { class: 'field' });
    w3.appendChild(U.el('label', { text: '# 备注' }));
    const noteTa = U.el('textarea', { name: 'note', placeholder: '补充说明、拍摄要点…' });
    if (it && it.note) noteTa.value = it.note;
    w3.appendChild(noteTa); form.appendChild(w3);

    // 4 · 对标（多个链接，同步到对标拆解）
    const w4 = U.el('div', { class: 'field' });
    w4.appendChild(U.el('label', { text: '# 对标（可分别粘贴多个链接，保存后自动同步到对标拆解）' }));
    const links = U.linkList(it && it.competitors, '粘贴对标视频链接，如 https://...');
    w4.appendChild(links.el); form.appendChild(w4);

    U.modal({
      title: isNew ? '新建灵感' : '编辑灵感', body: form, width: 620,
      actions: [
        { label: '取消', value: false },
        { label: '保存', value: true, primary: true, onclick: async () => {
          const obj = {
            title: (titleI.value || '').trim(),
            categories: ms.get(),
            note: (noteTa.value || '').trim(),
            competitors: links.get(),
          };
          if (!obj.title) { U.toast('请填写选题标题', 'error'); return false; }
          if (isNew) await DB.insert('inspiration', obj);
          else await DB.update('inspiration', it.id, obj);
          // 同步对标链接到「对标拆解」
          const synced = await syncToCompetitor(obj.competitors);
          U.toast('已保存' + (synced ? '，' + synced + ' 条对标已同步到对标拆解' : ''), 'success');
          return true;
        } }
      ]
    });
  }

  /* 将灵感中的对标链接同步到 competitor 集合（跳过已存在的链接） */
  async function syncToCompetitor(urls) {
    if (!urls || !urls.length) return 0;
    const existing = await DB.list('competitor');
    const known = new Set(existing.map(c => (c.url || '').trim()).filter(Boolean));
    let n = 0;
    for (const url of urls) {
      if (known.has(url)) continue;
      await DB.insert('competitor', { url, platform: guessPlatform(url) });
      n++;
    }
    return n;
  }
  function guessPlatform(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('xiaohongshu') || u.includes('xhslink')) return '小红书';
    if (u.includes('douyin') || u.includes('iesdouyin')) return '抖音';
    if (u.includes('bilibili') || u.includes('b23.tv')) return 'B站';
    if (u.includes('weibo')) return '微博';
    return '其他';
  }

  /* ---------------- 对标视频拆解（视频链接 + 平台 + #标签） ---------------- */
  async function paintComp(dyn) {
    const list = await DB.list('competitor');

    /* 汇总所有标签及计数，生成筛选栏 */
    const tagCount = {};
    list.forEach(it => (it.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    const allTags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a]);
    if (state.compTag && !allTags.includes(state.compTag)) state.compTag = '';

    const filterRow = U.el('div', { class: 'tag-filter' });
    filterRow.appendChild(U.el('span', { class: 'tf-label', text: '🏷 按标签筛选：' }));
    filterRow.appendChild(U.el('span', {
      class: 'tf-chip' + (!state.compTag ? ' on' : ''), text: '全部 ' + list.length,
      onclick: () => { state.compTag = ''; App.render(); }
    }));
    allTags.forEach(t => {
      filterRow.appendChild(U.el('span', {
        class: 'tf-chip' + (state.compTag === t ? ' on' : ''),
        html: U.esc(t) + '<span class="tf-count">' + tagCount[t] + '</span>',
        onclick: () => { state.compTag = (state.compTag === t ? '' : t); App.render(); }
      }));
    });

    dyn.appendChild(U.el('div', { class: 'page-head', style: 'margin-bottom:14px' }, [
      U.el('div', { class: 'sub', text: '记录对标视频链接、平台与 #标签；灵感中的对标链接也会自动同步到这里。' }),
      U.el('div', { class: 'spacer' }),
      U.el('button', { class: 'btn btn-primary', text: '＋ 新建拆解', onclick: () => editComp(null) }),
    ]));
    dyn.appendChild(filterRow);

    const shown = state.compTag ? list.filter(it => (it.tags || []).includes(state.compTag)) : list;
    if (!shown.length) {
      dyn.appendChild(U.el('div', { class: 'empty', text: state.compTag ? '「' + state.compTag + '」下暂无对标记录。' : '暂无对标记录，点「新建拆解」或从创作灵感中同步。' }));
      return;
    }
    const grid = U.el('div', { class: 'grid cols-2' });
    shown.forEach(it => {
      const tags = it.tags || [];
      const card = U.el('div', { class: 'card', onclick: () => editComp(it) }, [
        U.el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
          U.el('div', { style: 'font-weight:800;font-size:15px', text: '对标视频' }),
          U.el('span', { class: 'badge pink', text: it.platform || '其他' }),
        ]),
        it.url ? U.el('a', { class: 'link', href: it.url, target: '_blank', text: '🔗 ' + it.url, style: 'word-break:break-all;display:block;margin-top:6px;font-size:13px', onclick: (e) => e.stopPropagation() }) : null,
        tags.length ? U.el('div', { class: 'tag-row', style: 'margin-top:8px' }, tags.map(t => U.el('span', {
          class: 'badge pink', style: 'cursor:pointer', text: t,
          onclick: (e) => { e.stopPropagation(); state.compTag = t; App.render(); }
        }))) : null,
        U.el('div', { class: 'foot', style: 'margin-top:10px' }, [
          U.el('span', { class: 'link', text: '✎ 编辑', onclick: (e) => { e.stopPropagation(); editComp(it); } }),
          U.el('span', { class: 'link danger', text: '🗑 删除', onclick: async (e) => { e.stopPropagation(); if (await U.confirm('删除该对标记录？', true)) { await DB.removeQuiet('competitor', it.id); const card = e.target.closest('.card'); if (card) card.remove(); U.toast('已删除', 'success'); } } }),
        ]),
      ]);
      grid.appendChild(card);
    });
    dyn.appendChild(grid);
  }
  async function editComp(it) {
    const form = U.el('form', { class: 'script-form' });

    /* 历史标签（记忆）：从全部对标记录中汇总 */
    const all = await DB.list('competitor');
    const usedTags = [];
    all.forEach(c => (c.tags || []).forEach(t => { if (!usedTags.includes(t)) usedTags.push(t); }));

    // 1 · 视频链接
    const w1 = U.el('div', { class: 'field' });
    w1.appendChild(U.el('label', { text: '1 · 视频链接' }));
    const urlI = U.el('input', { name: 'url', placeholder: 'https://...', value: (it && it.url) || '' });
    w1.appendChild(urlI); form.appendChild(w1);

    // 2 · 平台
    const w2 = U.el('div', { class: 'field' });
    w2.appendChild(U.el('label', { text: '2 · 平台' }));
    const platSel = U.el('select', { name: 'platform' });
    ['小红书', '抖音', 'B站', '微博', '其他'].forEach(p => platSel.appendChild(U.el('option', { value: p, text: p })));
    platSel.value = (it && it.platform) || guessPlatform((it && it.url) || '');
    w2.appendChild(platSel); form.appendChild(w2);

    // 3 · 标签（#标签 · 记忆快捷添加）
    const w3 = U.el('div', { class: 'field' });
    w3.appendChild(U.el('label', { text: '3 · #标签（输入后回车添加；点击「记忆标签」可快捷添加，保存后自动记忆）' }));
    const tagIn = U.tagInput(usedTags, it && it.tags);
    w3.appendChild(tagIn.el); form.appendChild(w3);

    U.modal({
      title: it ? '编辑对标拆解' : '新建对标拆解', body: form, width: 560,
      actions: [
        { label: '取消', value: false },
        { label: '保存', value: true, primary: true, onclick: async () => {
          const obj = { url: (urlI.value || '').trim(), platform: platSel.value, tags: tagIn.get() };
          if (!obj.url) { U.toast('请填写视频链接', 'error'); return false; }
          if (it) await DB.update('competitor', it.id, obj);
          else await DB.insert('competitor', obj);
          U.toast('已保存' + (obj.tags.length ? '，标签：' + obj.tags.join(' ') : ''), 'success');
          return true;
        } },
      ].concat(it ? [{ label: '🗑 删除', value: 'del', danger: true, onclick: async () => { if (await U.confirm('删除该对标记录？', true)) { await DB.removeQuiet('competitor', it.id); U.toast('已删除', 'success'); } return 'del'; } }] : [])
    });
  }
})();
