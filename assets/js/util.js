/* =====================================================================
 *  util.js —— 通用工具：toast、模态框、确认框、格式化、DOM 辅助
 * ===================================================================== */
(function (global) {
  'use strict';

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'dataset') Object.assign(e.dataset, attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function fmtNum(n) { if (n == null || isNaN(n)) return '0'; n = Number(n); if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(1) + '亿'; if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + '万'; return String(n); }
  function fmtDate(d) { const x = new Date(d); if (isNaN(x)) return ''; const p = n => (n < 10 ? '0' : '') + n; return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()); }
  function fmtDateTime(d) { const x = new Date(d); if (isNaN(x)) return ''; const p = n => (n < 10 ? '0' : '') + n; return fmtDate(x) + ' ' + p(x.getHours()) + ':' + p(x.getMinutes()); }
  function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return fmtDate(d); }
  function uid() { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ----------------------------- Toast ----------------------------- */
  let toastBox;
  function toast(msg, type) {
    if (!toastBox) { toastBox = el('div', { class: 'toast-box' }); document.body.appendChild(toastBox); }
    const t = el('div', { class: 'toast ' + (type || 'info'), html: esc(msg) });
    toastBox.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  /* --------------------------- 复制文本到剪贴板（含降级兼容） --------------------------- */
  function copyText(text) {
    text = String(text || '').trim();
    if (!text) { toast('没有可复制的内容', 'error'); return; }
    const done = () => toast('已复制链接', 'success');
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) done(); else toast('复制失败，请手动复制', 'error');
      } catch (e) { toast('复制失败，请手动复制', 'error'); }
    };
    try {
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  /* 通用复制按钮：返回「📋 复制」span，点击复制 text */
  function copyBtn(text) {
    return U.el('span', { class: 'link', text: '📋 复制', style: 'flex:none;font-size:11px;cursor:pointer;white-space:nowrap', onclick: (e) => { if (e) e.stopPropagation(); U.copyText(text); } });
  }

  /* --------------------------- 模态框 --------------------------- */
  function modal({ title, body, actions, width, dismissable }) {
    if (dismissable === undefined) dismissable = true;
    return new Promise((resolve) => {
      const overlay = el('div', { class: 'modal-overlay' });
      const box = el('div', { class: 'modal-box', style: width ? 'max-width:' + width + 'px' : '' });
      const head = el('div', { class: 'modal-head' });
      head.appendChild(el('h3', { text: title }));
      if (dismissable) head.appendChild(el('button', { class: 'modal-close', html: '&times;', onclick: () => close(null) }));
      box.appendChild(head);
      const bodyEl = el('div', { class: 'modal-body' }); box.appendChild(bodyEl);
      if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
      const foot = el('div', { class: 'modal-foot' }); box.appendChild(foot);
      overlay.appendChild(box); document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));

      let closing = false;
      function close(val) { if (closing) return; closing = true; overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 220); resolve(val); }
      if (!actions) actions = [{ label: '关闭', value: true }];
      const btns = [];
      actions.forEach(a => {
        const btn = el('button', { class: 'btn ' + (a.primary ? 'btn-primary' : '') + (a.danger ? ' btn-danger' : ''), text: a.label });
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          if (a.onclick) {
            const r = a.onclick(btn);
            if (r && r.then) {
              const original = btn.textContent;
              btn.disabled = true;
              btn.textContent = a.loadingText || '⏳ 处理中…';
              const others = btns.filter(b => b !== btn);
              const disabledMap = others.map(b => b.disabled);
              if (!a.keepOthersEnabled) others.forEach(b => { b.disabled = true; });
              r.then(v => {
                btn.disabled = false; btn.textContent = original;
                others.forEach((b, i) => { b.disabled = a.keepOthersEnabled ? disabledMap[i] : false; });
                if (v !== false) close(a.value);
              }).catch(e => {
                btn.disabled = false; btn.textContent = original;
                others.forEach((b, i) => { b.disabled = a.keepOthersEnabled ? disabledMap[i] : false; });
                U.toast(e && e.message || '操作失败，请重试', 'error');
              });
            } else if (r !== false) {
              close(a.value);
            }
          } else {
            close(a.value);
          }
        });
        foot.appendChild(btn); btns.push(btn);
      });
      overlay.addEventListener('click', e => { if (e.target === overlay && dismissable) close(null); });
    });
  }

  /* 确认框 */
  function confirm(msg, danger) {
    return new Promise((resolve) => {
      modal({
        title: '确认操作',
        body: '<p style="line-height:1.6">' + esc(msg) + '</p>',
        actions: [
          { label: '取消', value: false },
          { label: danger ? '删除' : '确定', value: true, primary: !danger, danger: !!danger, onclick: () => { } }
        ]
      }).then(v => resolve(!!v));
    });
  }

  /* 通用表单读取 */
  function readForm(formEl) {
    const obj = {};
    new FormData(formEl).forEach((v, k) => { obj[k] = v; });
    return obj;
  }

  /* --------------------- 日历点选日期选择器（全站统一） --------------------- */
  function calendarPicker(value, onChange) {
    const fmt = (dt) => fmtDate(dt);
    let cur = value ? new Date(value + 'T00:00:00') : new Date();
    let selected = value || '';
    const trigger = el('div', { class: 'cal-trigger' });
    const pop = el('div', { class: 'cal-pop' });
    const wrap = el('div', { class: 'cal-wrap' }, [trigger, pop]);
    function fire() { if (typeof onChange === 'function') onChange(selected); }
    function renderTrigger() { trigger.textContent = selected || '📅 点击选择日期（年-月-日）'; }
    function renderPop() {
      pop.innerHTML = '';
      const y = cur.getFullYear(), m = cur.getMonth();
      const head = el('div', { class: 'cal-head' });
      const prev = el('button', { class: 'cal-nav', type: 'button', text: '‹' });
      const next = el('button', { class: 'cal-nav', type: 'button', text: '›' });
      const title = el('div', { class: 'cal-title', text: y + ' 年 ' + (m + 1) + ' 月' });
      prev.addEventListener('click', (e) => { e.stopPropagation(); cur = new Date(y, m - 1, 1); renderPop(); });
      next.addEventListener('click', (e) => { e.stopPropagation(); cur = new Date(y, m + 1, 1); renderPop(); });
      head.appendChild(prev); head.appendChild(title); head.appendChild(next);
      pop.appendChild(head);
      const grid = el('div', { class: 'cal-grid' });
      ['日', '一', '二', '三', '四', '五', '六'].forEach(d => grid.appendChild(el('div', { class: 'cal-dow', text: d })));
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      const todayStr = fmt(new Date());
      for (let i = 0; i < first; i++) grid.appendChild(el('div', { class: 'cal-cell empty' }));
      for (let d = 1; d <= days; d++) {
        const ds = fmt(new Date(y, m, d));
        const cell = el('div', { class: 'cal-cell' + (ds === todayStr ? ' today' : '') + (ds === selected ? ' sel' : ''), text: String(d) });
        cell.addEventListener('click', (e) => { e.stopPropagation(); selected = ds; renderTrigger(); wrap.classList.remove('open'); fire(); });
        grid.appendChild(cell);
      }
      pop.appendChild(grid);
    }
    renderTrigger(); renderPop();
    trigger.addEventListener('click', (e) => { e.stopPropagation(); wrap.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
    return { el: wrap, get: () => selected, set: (v) => { selected = v || ''; if (v) cur = new Date(v + 'T00:00:00'); renderTrigger(); renderPop(); } };
  }

  /* --------------------- 多选下拉（标签芯片展示） --------------------- */
  function multiSelect(options, selected) {
    const set = new Set(selected || []);
    const trigger = el('div', { class: 'ms-trigger', tabindex: 0 });
    const panel = el('div', { class: 'ms-panel' });
    options.forEach(opt => {
      const chk = el('input', { type: 'checkbox' }); chk.checked = set.has(opt);
      const row = el('label', { class: 'ms-opt' }, [chk, document.createTextNode(' ' + opt)]);
      chk.addEventListener('change', () => { if (chk.checked) set.add(opt); else set.delete(opt); updateTrigger(); });
      panel.appendChild(row);
    });
    const wrap = el('div', { class: 'ms-wrap' }, [trigger, panel]);
    function updateTrigger() {
      trigger.innerHTML = '';
      if (set.size === 0) trigger.appendChild(el('span', { class: 'ms-ph', text: '请选择（可多选）' }));
      else Array.from(set).forEach(v => trigger.appendChild(el('span', { class: 'chip', text: v })));
    }
    updateTrigger();
    trigger.addEventListener('click', (e) => { e.stopPropagation(); wrap.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
    return { el: wrap, get: () => Array.from(set) };
  }

  /* --------------------- 多链接输入（动态增删行） --------------------- */
  function linkList(initial, placeholder) {
    const arr = (initial && initial.length) ? initial.slice() : [''];
    const box = el('div', { class: 'link-list' });
    function render() {
      box.innerHTML = '';
      arr.forEach((val, idx) => {
        const row = el('div', { class: 'link-row' });
        const inp = el('input', { type: 'text', placeholder: placeholder || '粘贴链接，如 https://...', value: val });
        inp.addEventListener('input', () => { arr[idx] = inp.value; });
        const del = el('span', { class: 'link danger', text: '✕', style: 'cursor:pointer' });
        del.addEventListener('click', () => { arr.splice(idx, 1); if (arr.length === 0) arr.push(''); render(); });
        row.appendChild(inp); row.appendChild(del);
        if (val && val.trim()) {
          const cp = el('span', { class: 'link', text: '📋', title: '复制该链接', style: 'cursor:pointer;flex:none' });
          cp.addEventListener('click', () => U.copyText(inp.value));
          row.appendChild(cp);
        }
        box.appendChild(row);
      });
      const add = el('button', { class: 'btn btn-sm', type: 'button', text: '＋ 添加链接' });
      add.addEventListener('click', () => { arr.push(''); render(); });
      box.appendChild(add);
    }
    render();
    return { el: box, get: () => arr.map(s => (s || '').trim()).filter(Boolean) };
  }

  /* --------------------- 标签输入（#标签 · 支持记忆快捷添加） --------------------- */
  function tagInput(suggestions, selected) {
    const tags = [];
    (selected || []).forEach(t => addTag(t, true));
    const sug = Array.from(new Set((suggestions || []).map(t => normTag(t)).filter(Boolean)));
    const box = el('div', { class: 'ti-box' });
    const chipsRow = el('div', { class: 'ti-chips' });
    const input = el('input', { type: 'text', placeholder: '输入标签后回车添加，如：转场 / #爆点', class: 'ti-input' });
    const sugRow = el('div', { class: 'ti-sug-row' });

    function normTag(t) {
      t = String(t || '').trim().replace(/^[#＃\s]+/, '').replace(/[#,，、\s]+$/, '');
      return t ? '#' + t : '';
    }
    function addTag(t, silent) {
      const n = normTag(t);
      if (!n || tags.includes(n)) return false;
      tags.push(n);
      if (!silent) render();
      return true;
    }
    function commit() {
      input.value.split(/[,，、#＃\s]+/).forEach(seg => { if (seg.trim()) addTag(seg); });
      input.value = ''; render();
    }
    function render() {
      /* 已选标签 chips */
      chipsRow.innerHTML = '';
      if (!tags.length) chipsRow.appendChild(el('span', { class: 'ms-ph', text: '还没有标签，输入后回车，或点击下方记忆标签快捷添加' }));
      tags.forEach(t => {
        const chip = el('span', { class: 'chip ti-chip' }, [
          document.createTextNode(t),
          el('span', { class: 'ti-x', text: '✕', onclick: () => { const i = tags.indexOf(t); if (i > -1) { tags.splice(i, 1); render(); } } }),
        ]);
        chipsRow.appendChild(chip);
      });
      /* 记忆标签（快捷添加 / 取消） */
      sugRow.innerHTML = '';
      const rest = sug.filter(t => !tags.includes(t));
      if (sug.length) {
        sugRow.appendChild(el('span', { class: 'ti-sug-label', text: '记忆标签：' }));
        sug.forEach(t => {
          const on = tags.includes(t);
          sugRow.appendChild(el('span', { class: 'ti-sug' + (on ? ' on' : ''), text: t, onclick: () => {
            if (on) { const i = tags.indexOf(t); if (i > -1) tags.splice(i, 1); }
            else tags.push(t);
            render();
          } }));
        });
      } else {
        sugRow.appendChild(el('span', { class: 'ti-sug-label', text: '暂无历史标签' }));
      }
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',' || e.key === '，') { e.preventDefault(); commit(); }
      else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); render(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) commit(); });

    box.appendChild(chipsRow);
    box.appendChild(input);
    box.appendChild(sugRow);
    render();
    return { el: box, get: () => tags.slice() };
  }

  /* --------------------- 文件查看 / 下载（Blob 方案，兼容手机） --------------------- */
  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',');
    const m = (parts[0] || '').match(/^data:([^;,]+)/);
    const mime = (m && m[1]) || 'application/octet-stream';
    const bin = atob(parts[1] || '');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /* 新窗口查看（PDF / 图片可直接预览；兼容微信 / iOS） */
  function openFile(file) {
    if (!file || !file.data) { toast('文件不存在或已损坏', 'error'); return; }
    try {
      const url = URL.createObjectURL(dataUrlToBlob(file.data));
      const a = el('a', { href: url, target: '_blank', rel: 'noopener', style: 'display:none' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast('已在新窗口打开，若被拦截请点击「下载」', 'info');
    } catch (e) { console.error(e); toast('打开失败，请尝试下载', 'error'); }
  }

  /* 强制下载（Blob + download 属性） */
  function downloadFile(file) {
    if (!file || !file.data) { toast('文件不存在或已损坏', 'error'); return; }
    try {
      const url = URL.createObjectURL(dataUrlToBlob(file.data));
      const a = el('a', { href: url, download: file.name || '下载文件', style: 'display:none' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast('已开始下载 ' + (file.name || ''), 'success');
    } catch (e) { console.error(e); toast('下载失败', 'error'); }
  }

  /* 文件操作弹窗：预览（图片）+ 查看 + 下载 */
  function fileModal(file) {
    if (!file) return;
    const body = el('div');
    const isImg = /^image\//.test(file.type || '') || /\.(png|jpe?g|gif|webp)$/i.test(file.name || '');
    if (isImg && file.data) {
      body.appendChild(el('img', { src: file.data, style: 'width:100%;border-radius:10px;display:block' }));
    } else {
      body.appendChild(el('div', { class: 'muted', style: 'font-size:13px;line-height:1.7', html: '📄 <b>' + esc(file.name || '未命名') + '</b><br>点击下方「新窗口查看」可在线预览（PDF / 图片可直接显示）；<br>或「下载文件」保存到本地。' }));
    }
    modal({
      title: '附件 · ' + (file.name || '未命名'),
      body, width: 560,
      actions: [
        { label: '⬇ 下载文件', value: 'dl', onclick: () => { downloadFile(file); return false; } },
        { label: '👁 新窗口查看', value: 'view', primary: true, onclick: () => { openFile(file); return false; } },
      ]
    });
  }

  /* --------------------- 文件上传（Excel/Word/PDF/图片等，统一组件） --------------------- */
  function buildFileUpload(state, opts) {
    const box = el('div', { class: 'file-upload' });
    const inp = el('input', { type: 'file', accept: opts.accept, style: 'display:none' });
    const btn = el('button', { class: 'btn', type: 'button', text: '📎 选择文件' });
    const row = el('div', { class: 'file-row' });
    function valid(name, type) {
      const ext = (name.split('.').pop() || '').toLowerCase();
      if (opts.exts.indexOf(ext) !== -1) return true;
      if (opts.allowImage && type && type.indexOf('image/') === 0) return true;
      return false;
    }
    function renderRow() {
      row.innerHTML = '';
      if (state.file) {
        if (/^image\//.test(state.file.type)) row.appendChild(el('img', { src: state.file.data, class: 'file-thumb', onclick: (e) => { e.stopPropagation(); U.fileModal(state.file); } }));
        row.appendChild(el('span', { class: 'file-link', text: '📄 ' + state.file.name, style: 'cursor:pointer', title: '点击查看 / 下载', onclick: (e) => { e.stopPropagation(); U.fileModal(state.file); } }));
        row.appendChild(el('span', { class: 'link', text: '👁 查看', style: 'margin-left:10px;cursor:pointer', onclick: (e) => { e.stopPropagation(); U.openFile(state.file); } }));
        row.appendChild(el('span', { class: 'link', text: '⬇ 下载', style: 'margin-left:10px;cursor:pointer', onclick: (e) => { e.stopPropagation(); U.downloadFile(state.file); } }));
        const del = el('span', { class: 'link danger', text: '✕ 移除', style: 'margin-left:10px' });
        del.addEventListener('click', (e) => { e.stopPropagation(); state.file = null; renderRow(); });
        row.appendChild(del);
      } else { row.appendChild(el('span', { class: 'muted', text: opts.hint || '未上传文件' })); }
    }
    btn.addEventListener('click', () => inp.click());
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      if (!valid(f.name, f.type)) { toast('文件格式不支持', 'error'); inp.value = ''; return; }
      const r = new FileReader();
      r.onload = () => { state.file = { name: f.name, type: f.type, data: r.result }; renderRow(); toast('已附加文件', 'success'); };
      r.readAsDataURL(f);
    });
    renderRow();
    box.appendChild(btn); box.appendChild(inp); box.appendChild(row);
    return box;
  }

  global.U = { el, esc, fmtNum, fmtDate, fmtDateTime, daysFromNow, uid, toast, modal, confirm, readForm, calendarPicker, multiSelect, linkList, tagInput, dataUrlToBlob, openFile, downloadFile, fileModal, buildFileUpload, copyText, copyBtn };
})(window);
