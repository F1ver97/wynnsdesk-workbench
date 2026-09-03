/* =====================================================================
 *  app.js —— 应用核心：侧栏导航、路由、首屏隐私提醒、初始数据预填充
 * ===================================================================== */
(function (global) {
  'use strict';

  const App = {
    modules: {},
    current: null,
    register(route, def) { this.modules[route] = def; },
    go(route) { if (location.hash !== '#/' + route) location.hash = '#/' + route; else this.render(); },
    render() {
      const route = (location.hash.replace('#/', '') || 'dashboard').split('/')[0];
      const def = this.modules[route] || this.modules['dashboard'];
      this.current = route;
      const titleEl = document.getElementById('pageTitle');
      const view = document.getElementById('view');
      if (!def || !view) return;
      try {
        if (titleEl) titleEl.innerHTML = def.title || route;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === route));
        toggleTopHub(route);
        view.innerHTML = '';
        def.render(view);
      } catch (e) {
        console.error('模块渲染出错', route, e);
        if (view) view.innerHTML = '<div class="empty">该模块加载出错：' + (e && e.message ? e.message : e) + '</div>';
      }
      if (view) view.scrollTop = 0;
    }
  };

  /* 顶部常驻 AI 中枢：在 AI助手 独立页面隐藏，避免重复；其他页面保持常驻收起状态 */
  function toggleTopHub(route) {
    const hub = document.getElementById('aiHub');
    if (!hub) return;
    if (route === 'ai') {
      hub.style.display = 'none';
    } else {
      hub.style.display = '';
      paintHub();
    }
  }
  global.App = App;

  /* ----------------------------- AI 工具调用（写入工作台数据） ----------------------------- */
  const AI_TOOLS = {
    createSchedule: async (p) => {
      if (!p.title || !p.date) throw new Error('缺少标题或日期');
      await DB.insert('schedule', {
        title: String(p.title),
        type: p.type || 'content',
        platform: p.platform || '',
        date: String(p.date),
        duration: Math.max(1, Number(p.duration) || 1),
        status: p.status || 'plan',
        note: p.note || ''
      });
      return '已写入「档期」：' + p.title + '（' + p.date + '）';
    },
    createTodo: async (p) => {
      const text = p.text || p.title;
      if (!text) throw new Error('缺少待办内容');
      await DB.insert('todos', { text: String(text), done: false, createdAt: Date.now() });
      return '已写入「待办」：' + text;
    },
    createIdea: async (p) => {
      if (!p.title) throw new Error('缺少灵感标题');
      await DB.insert('inspiration', {
        title: String(p.title),
        category: p.category || '',
        stage: p.stage || 'idea',
        tags: p.tags || '',
        headline: p.headline || '',
        style: p.style || '',
        bgm: p.bgm || '',
        hook: p.hook || '',
        status: p.status || 'idea'
      });
      return '已写入「灵感库」：' + p.title;
    },
    createScript: async (p) => {
      if (!p.title) throw new Error('缺少脚本标题');
      await DB.insert('scripts', {
        title: String(p.title),
        scene: p.scene || '',
        duration: p.duration || '',
        lines: Array.isArray(p.lines) ? p.lines : [String(p.content || p.title)],
        tags: p.tags || '',
        status: p.status || 'draft'
      });
      return '已写入「脚本库」：' + p.title;
    },
    // 删除任意模块条目
    deleteItem: async (p) => {
      const col = p.collection;
      if (!col) throw new Error('缺少 collection');
      const id = p.id || (p.title ? (await findIdByTitle(col, p.title)) : null);
      if (!id) throw new Error('未找到要删除的记录：' + (p.title || p.id));
      await DB.removeQuiet(col, id);
      return '已从「' + col + '」删除：' + (p.title || id);
    },
    // 列出某模块条目（用于查询/统计）
    listItems: async (p) => {
      const col = p.collection;
      if (!col) throw new Error('缺少 collection');
      const items = await DB.list(col);
      return '「' + col + '」共 ' + items.length + ' 条：\n' + summarize(col, items, p.limit || 20);
    },
    // 更新某条目字段
    updateItem: async (p) => {
      const col = p.collection;
      if (!col || !p.patch) throw new Error('缺少 collection 或 patch');
      const id = p.id || (p.title ? (await findIdByTitle(col, p.title)) : null);
      if (!id) throw new Error('未找到要更新的记录：' + (p.title || p.id));
      await DB.update(col, id, p.patch);
      return '已更新「' + col + '」：' + (p.title || id);
    },
    // 统计某模块数量
    countItems: async (p) => {
      const col = p.collection;
      if (!col) throw new Error('缺少 collection');
      const items = await DB.list(col);
      return '「' + col + '」当前共 ' + items.length + ' 条记录。';
    }
  };

  // 按标题模糊查找某模块记录的 id
  async function findIdByTitle(col, title) {
    const items = await DB.list(col);
    const t = String(title || '').trim().toLowerCase();
    const hit = items.find(x => (x.title || x.brand || x.name || '').toString().toLowerCase().includes(t));
    return hit ? hit.id : null;
  }
  function summarize(col, items, limit) {
    return items.slice(0, limit).map((x, i) => {
      const label = x.title || x.brand || x.name || x.date || ('#' + (i + 1));
      return (i + 1) + '. ' + label + (x.date ? '（' + x.date + '）' : '');
    }).join('\n');
  }

  async function executeToolCall(raw) {
    let json = raw;
    if (typeof raw === 'string') {
      try { json = JSON.parse(raw); } catch (e) { throw new Error('工具调用 JSON 解析失败'); }
    }
    const fn = AI_TOOLS[json.tool];
    if (!fn) throw new Error('未知工具：' + json.tool);
    return await fn(json.params || {});
  }

  function extractToolCalls(text) {
    const out = [];
    const re = /\[TOOL_CALL\]\s*([\s\S]*?)\s*\[\/TOOL_CALL\]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push(m[1].trim());
    }
    return out;
  }

  function stripToolCalls(text) {
    return text.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '').trim();
  }

  function buildSystemPrompt(text) {
    const base = '你是 Gemini，由 Google 开发的通用人工智能助手。你可以像完整的 Gemini 一样，自由回答任何领域的问题、对话、分析、写作、编程、翻译、创意生成、查资料等，不受任何特定角色限制。用自然、直接的中文回复。';
    const toolGuide = '\n\n【工作方式】\n' +
      '1. 直接、克制地回答用户。不要主动给用户没要求的内容：不要列准备清单、不要加提醒、不要给工作总结、不要把"你应该做X"塞进回复。用户没问，就别主动给。\n' +
      '2. 用户只是聊天或提问时，就正常像 Gemini 一样回复，不要强行关联工作台，也不要硬塞运营/拍摄建议。\n' +
      '3. 你被授权操作「工作台」应用的数据，但仅在用户明确要求写入/查询/更新/删除时才使用下方工具。\n' +
      '4. 严禁主动调用 createTodo / createIdea / createScript 等「写入」类工具。用户没说"加入待办""记到灵感""存为脚本"，就只回复，不往任何模块塞东西。\n' +
      '5. 用户让你"整理到档期/排期"时，只调用 createSchedule；不要顺手把"准备工作"也写成待办。\n' +
      '6. 删除/查询/更新同理：仅在用户明确要求时调用 deleteItem / updateItem / listItems / countItems。\n';
    const toolList = '\n\n可用工具示例（仅在用户明确要求时输出）：\n' +
      '[TOOL_CALL]{"tool":"createSchedule","params":{"title":"标题","date":"2026-08-29","type":"content","platform":"小红书","duration":1,"status":"plan","note":"备注"}}[/TOOL_CALL]\n' +
      '[TOOL_CALL]{"tool":"createTodo","params":{"text":"待办内容"}}[/TOOL_CALL]\n' +
      '[TOOL_CALL]{"tool":"createIdea","params":{"title":"灵感标题","category":"美妆","stage":"选题"}}[/TOOL_CALL]\n' +
      '[TOOL_CALL]{"tool":"createScript","params":{"title":"脚本标题","lines":["分镜1","分镜2"]}}[/TOOL_CALL]\n' +
      '[TOOL_CALL]{"tool":"listItems","params":{"collection":"schedule","limit":20}}[/TOOL_CALL]  （查询某模块条目，collection 可为 metrics/inspiration/collage/competitor/orders/schedule/scripts/todos）\n' +
      '[TOOL_CALL]{"tool":"countItems","params":{"collection":"orders"}}[/TOOL_CALL]  （统计数量）\n' +
      '[TOOL_CALL]{"tool":"updateItem","params":{"collection":"schedule","title":"旧标题","patch":{"status":"published"}}}[/TOOL_CALL]  （更新字段，patch 为要改的字段）\n' +
      '[TOOL_CALL]{"tool":"deleteItem","params":{"collection":"schedule","title":"要删除的标题"}}[/TOOL_CALL]  （删除条目，可传 title 或 id）\n' +
      '注意：删除前如果用户明确要求删除，才调用 deleteItem；查询类指令优先用 listItems/countItems 并在回复中展示结果。';
    return base + toolGuide + toolList + '\n\n用户指令：' + text;
  }

  /* ----------------------------- 导航配置 ----------------------------- */
  const NAV = [
    { group: '智能', items: [{ route: 'ai', icon: '🤖', label: 'AI助手' }] },
    { group: '数据', items: [{ route: 'dashboard', icon: '📊', label: '数据分析' }] },
    { group: '创作', items: [
      { route: 'inspiration', icon: '💡', label: '灵感与素材库' },
      { route: 'scripts', icon: '📝', label: '脚本库' },
      { route: 'briefs', icon: '📋', label: 'Brief 归档库' },
    ] },
    { group: '商业', items: [
      { route: 'orders', icon: '💼', label: 'PR对接' },
      { route: 'schedule', icon: '📅', label: '档期' },
    ] },
    { group: '系统', items: [{ route: 'settings', icon: '⚙️', label: '设置与备份' }] },
  ];

  function buildNav() {
    const nav = document.getElementById('nav');
    NAV.forEach(g => {
      nav.appendChild(U.el('div', { class: 'nav-group-title', text: g.group }));
      g.items.forEach(it => {
        nav.appendChild(U.el('div', {
          class: 'nav-item', dataset: { route: it.route },
          onclick: () => { App.go(it.route); closeSidebarMobile(); }
        }, [U.el('span', { class: 'ico', text: it.icon }), U.el('span', { text: it.label })]));
      });
    });
    // 管理员专属入口
    if (DB.auth.isEnabled() && DB.auth.isAdmin()) {
      nav.appendChild(U.el('div', { class: 'nav-group-title', text: '管理员' }));
      nav.appendChild(U.el('div', {
        class: 'nav-item', dataset: { route: 'admin' },
        onclick: () => { App.go('admin'); closeSidebarMobile(); }
      }, [U.el('span', { class: 'ico', text: '🛡️' }), U.el('span', { text: '管理后台' })]));
    }
  }

  /* ----------------------------- 侧栏移动端 ----------------------------- */
  function openSidebarMobile() { document.getElementById('sidebar').classList.add('open'); document.getElementById('scrim').classList.add('show'); }
  function closeSidebarMobile() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('scrim').classList.remove('show'); }

  /* ----------------------------- 初始数据预填充 ----------------------------- */
  function rnd(a, b) { return Math.round(a + Math.random() * (b - a)); }
  function genMetrics() {
    const platforms = [
      { key: 'xhs', base: 5200, g: 1.035, v: 90000, i: 0.085 },
      { key: 'dy', base: 18000, g: 1.05, v: 320000, i: 0.11 },
      { key: 'all', base: 24000, g: 1.045, v: 420000, i: 0.095 },
    ];
    const out = [];
    const today = new Date();
    platforms.forEach(p => {
      let fans = p.base, views = p.v, inter = p.i;
      for (let d = 29; d >= 0; d--) {
        const dt = new Date(today); dt.setDate(today.getDate() - d);
        const wobble = 1 + (Math.sin(d / 3) * 0.08) + (Math.random() - 0.5) * 0.06;
        fans = Math.round(fans * p.g * wobble);
        const dayViews = Math.round(views * wobble * (0.8 + Math.random() * 0.5));
        const rate = +(inter * (0.9 + Math.random() * 0.25)).toFixed(4);
        const conv = +((dayViews * rate * (0.01 + Math.random() * 0.02)) / 100).toFixed(1);
        out.push({
          id: 'm_' + p.key + '_' + d, platform: p.key, date: U.fmtDate(dt),
          fans, views: dayViews, rate, conversions: conv,
          interactions: Math.round(dayViews * rate)
        });
      }
    });
    return out;
  }

  async function seedIfEmpty() {
    const need = await Promise.all([
      DB.list('metrics'), DB.list('inspiration'),
      DB.list('orders'), DB.list('schedule'), DB.list('scripts'), DB.list('competitor'), DB.list('collage')
    ]).then(r => r.every(x => x.length === 0));
    if (!need) return;

    const today = new Date();
    const iso = n => { const d = new Date(today); d.setDate(today.getDate() + n); return U.fmtDate(d); };

    for (const m of genMetrics()) await DB.insert('metrics', m);

    const inspiration = [
      { title: 'Y2K碎钻妆容教程', categories: ['#美妆'], note: '素颜vs碎钻妆反差，3步拿捏卧蚕。', competitors: ['https://www.xiaohongshu.com/example/123'] },
      { title: '平价好物开箱：百元内氛围感', categories: ['#好物分享'], note: '学生党闭眼入清单，钱包刺客vs真香。', competitors: [] },
      { title: '一周穿搭不重样·辣妹篇', categories: ['#穿搭', '#plog'], note: '7套显瘦公式，微胖也能穿。', competitors: ['https://www.douyin.com/example/456'] },
      { title: '我的秋日治愈 vlog', categories: ['#vlog'], note: '咖啡店+夜景街拍，治愈系节奏。', competitors: [] },
    ];
    for (const i of inspiration) await DB.insert('inspiration', i);

    const competitors = [
      { url: 'https://www.xiaohongshu.com/example/123', platform: '小红书' },
      { url: 'https://www.douyin.com/example/456', platform: '抖音' },
    ];
    for (const c of competitors) await DB.insert('competitor', c);

    const orders = [
      { brand: 'Aesthetic护肤', pr: 'wx: lily_pr', contact: '图文种草', budget: 18000, month: iso(0).slice(0, 7), stage: 'inquiry', platform: '小红书', decision: '', due: iso(12), paid: false, note: '询问 9 月种草档期。' },
      { brand: 'Neon潮牌', pr: 'wx: azhe88', contact: '视频植入', budget: 35000, month: iso(0).slice(0, 7), stage: 'sample', platform: '抖音', decision: '接', due: iso(20), paid: false, note: '寄品已发出，等收货试妆。' },
      { brand: 'Glitter彩妆', pr: 'wx: coco_glitter', contact: '全妆跟练定制', budget: 26000, month: iso(0).slice(0, 7), stage: 'script', platform: '小红书', decision: '接', due: iso(8), paid: false, note: '脚本已交，等二审。' },
      { brand: 'Star生活馆', pr: 'wx: zhou_mgr', contact: '好物分享', budget: 12000, month: iso(-1).slice(0, 7), stage: 'prepub', platform: '抖音', decision: '接', due: iso(-3), paid: false, note: '成片过审，约下周发布。' },
      { brand: 'Pastel香氛', pr: 'wx: mia_p', contact: '香水测评', budget: 9000, month: iso(-2).slice(0, 7), stage: 'done', platform: '小红书', decision: '接', due: iso(-20), paid: true, doneAt: Date.now(), note: '已发布并结清尾款。' },
    ];
    for (const o of orders) await DB.insert('orders', o);

    const schedule = [
      { title: '碎钻妆教程发布', type: 'content', platform: '小红书', date: iso(2), duration: 1, status: 'plan' },
      { title: 'Neon潮牌脚本对接', type: 'biz', platform: '抖音', date: iso(5), duration: 2, status: 'plan' },
      { title: '平价好物开箱', type: 'content', platform: '抖音', date: iso(9), duration: 1, status: 'plan' },
      { title: 'Glitter彩妆发布', type: 'biz', platform: '小红书', date: iso(8), duration: 1, status: 'plan' },
      { title: '一周穿搭合集', type: 'content', platform: '小红书', date: iso(14), duration: 1, status: 'plan' },
    ];
    for (const s of schedule) await DB.insert('schedule', s);

    await DB.insert('scripts', {
      brand: '星耀持妆粉底液', competitors: ['https://www.xiaohongshu.com/example/789'],
      formats: ['#全妆跟练'], scriptDate: iso(3), publishDate: iso(7), attachment: null, brief: null,
      note: '碎钻妆系列第一条商单脚本。',
      versions: [{ v: 1, ts: Date.now(), brand: '星耀持妆粉底液', competitors: ['https://www.xiaohongshu.com/example/789'], formats: ['#全妆跟练'], scriptDate: iso(3), publishDate: iso(7), scriptFileName: null, briefName: null, note: '碎钻妆系列第一条商单脚本。' }]
    });
  }

  /* ----------------------------- 隐私提醒 ----------------------------- */
  function showPrivacy() {
    return new Promise((resolve) => {
      const body = U.el('div', { class: 'privacy' }, [
        U.el('div', { class: 'big', text: '🔒' }),
        U.el('h2', { text: '欢迎来到你的星耀工作台' }),
        U.el('p', { html: '所有数据均<b>仅保存在你的本地设备</b>（优先连接 Node.js + SQLite 后端；无后端时自动使用浏览器 IndexedDB / LocalStorage）。<br>我们不会上传任何内容，刷新或重开页面数据都不会丢失。<br><br>点击「开始使用」即表示你已了解：本工作台将为你预填充一套示例数据，你可以随时在「设置」中导出 / 导入备份或清空。' }),
      ]);
      U.modal({
        title: '隐私与数据说明', body, width: 460,
        actions: [
          { label: '开始使用 ✦', value: true, primary: true },
          { label: '仅浏览', value: false, onclick: () => {} }
        ]
      }).then(v => resolve(!!v));
    });
  }

  /* ----------------------------- 引导搜索（轻量） ----------------------------- */
  function bindSearch() {
    const inp = document.getElementById('globalSearch');
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = inp.value.trim().toLowerCase();
      if (!q) return;
      // 简单跨集合搜索并提示跳转
      Promise.all([DB.list('inspiration'), DB.list('orders'), DB.list('scripts')]).then(([ins, ord, scr]) => {
        const hit = (arr, f) => arr.filter(x => f(x).toLowerCase().includes(q)).length;
        const counts = {
          inspiration: hit(ins, x => (x.title || '') + ((x.categories || []).join(' ')) + (x.note || '')),
          orders: hit(ord, x => (x.brand || '') + (x.pr || '') + (x.note || '')),
          scripts: hit(scr, x => (x.brand || '') + (x.note || '')),
        };
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total === 0) return U.toast('未找到匹配「' + inp.value + '」的内容', 'info');
        const lines = Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => '· ' + ({ inspiration: '灵感', orders: '商单', scripts: '脚本' }[k]) + '：' + c + ' 条').join('<br>');
        U.modal({ title: '🔍 搜索结果', body: '<p>共找到 <b>' + total + '</b> 条相关结果：</p><div style="margin-top:8px;line-height:1.9">' + lines + '</div>', actions: [{ label: '好的', value: true, primary: true }] });
      });
    });
  }

  /* ----------------------------- AI 中枢（顶部常驻，可折叠） ----------------------------- */
  // 对话记录持久化：Supabase 模式下按账号隔离云端同步，否则回退 localStorage（最多保留 200 条）
  const HUB_CHAT_MAX = 200;
  let hubChat = [];
  try { hubChat = JSON.parse(localStorage.getItem('cw_aihub_chat') || '[]') || []; } catch (_) { hubChat = []; }
  let hubChatLoaded = false; // 防止重复加载覆盖未保存消息
  // 异步从云端拉取（仅 Supabase 模式生效，本地模式直接用上面的 localStorage）
  async function loadHubChat() {
    if (hubChatLoaded) return;
    try {
      const cloud = await DB.getChat();
      if (Array.isArray(cloud) && cloud.length) { hubChat = cloud; }
      hubChatLoaded = true;
    } catch (_) { hubChatLoaded = true; }
  }
  function saveHubChat() {
    let capped = hubChat;
    if (hubChat.length > HUB_CHAT_MAX) { capped = hubChat.slice(hubChat.length - HUB_CHAT_MAX); hubChat = capped; }
    // 本地兜底立即写；云端异步写（不阻塞 UI）
    try { localStorage.setItem('cw_aihub_chat', JSON.stringify(capped)); } catch (_) {}
    if (DB && DB.saveChat) { DB.saveChat(capped).catch(() => {}); }
  }
  // 默认收起：仅当用户曾经主动展开过（存过 '1'）才展开
  function hubOpen() { return localStorage.getItem('cw_aihub_open') === '1'; }

  async function paintHub() {
    const box = document.getElementById('aiHub');
    if (!box) return;
    try {
      const open = hubOpen();
      // 不整体清空重建，避免切换菜单/展开收起时整块重排闪烁
      let card = box.querySelector('.ai-hub-card');
      if (!card) {
        card = U.el('div', { class: 'ai-hub-card' });
        box.appendChild(card);
      }
      card.className = 'ai-hub-card' + (open ? '' : ' collapsed');
      // 仅重建 head（含展开/收起按钮），body 状态用 class 控制显隐
      let head = card.querySelector('.ai-hub-head');
      if (!head) {
        head = U.el('div', { class: 'ai-hub-head' });
        card.appendChild(head);
      }
      head.innerHTML = '';
      head.appendChild(U.el('div', { class: 'ai-hub-title', html: '<span class="em">✦</span> AI 中枢 <small>AI HUB · GEMINI READY</small>' }));
      head.appendChild(U.el('div', { class: 'spacer' }));
      head.appendChild(U.el('button', {
        class: 'btn btn-ghost', style: 'font-size:12px;padding:5px 12px',
        text: open ? '收起 ▲' : '展开 ▼',
        onclick: () => { localStorage.setItem('cw_aihub_open', open ? '0' : '1'); paintHub(); }
      }));

      // body：仅在展开且尚未构建时才插入，折叠时保留 DOM（用 CSS 隐藏）避免反复重建抖动
      let body = card.querySelector('.ai-hub-body');
      if (open && !body) {
        body = U.el('div', { class: 'ai-hub-body' });
        body.appendChild(await hubTodoPanel());
        body.appendChild(hubChatPanel());
        card.appendChild(body);
      }
    } catch (e) {
      console.error('AI 中枢渲染出错', e);
    }
  }

  /* 今日日程 Todolist：固定打卡 + 档期/商单自动扫描 + 手动待办 */
  async function hubTodoPanel() {
    const today = U.fmtDate(new Date());
    const metrics = await DB.list('metrics');
    const schedules = await DB.list('schedule');
    const orders = await DB.list('orders');
    const todos = await DB.list('todos');

    const panel = U.el('div', { class: 'hub-panel' });
    panel.appendChild(U.el('div', { class: 'hub-panel-title', text: '📆 今日日程 Todolist · ' + today }));

    const list = U.el('div', { class: 'todo-list' });
    panel.appendChild(list);

    // 局部重绘待办列表（不再整页 paintHub，避免手机卡顿）
    function renderTodoList() {
      const rows = [];
      rows.push({ fixed: true, done: metrics.some(m => m.date === today), text: '统计账号数据' });
      schedules.filter(s => s.date === today && !s.done).forEach(s => {
        rows.push({ text: (s.type === 'biz' ? '商单档期：' : '发布：') + (s.title || '未命名') + (s.platform ? ' · ' + s.platform : ''), schedule: s });
      });
      orders.filter(o => o.due === today && o.stage !== 'done' && !o.paid).forEach(o => {
        rows.push({ text: '商单截止：' + (o.brand || '未命名'), order: true });
      });
      todos.slice().sort((a, b) => (a.done - b.done) || ((b.createdAt || 0) - (a.createdAt || 0))).forEach(t => {
        rows.push({ text: t.text, done: !!t.done, todo: t });
      });

      list.innerHTML = '';
      rows.forEach(r => {
        const item = U.el('div', { class: 'todo-item' + (r.done ? ' done' : '') });
        const cb = U.el('input', { type: 'checkbox' });
        cb.checked = !!r.done;
        if (r.fixed) {
          cb.disabled = true;
          cb.title = '在「数据分析」录入 / AI 解析今日数据后自动完成';
        } else if (r.todo) {
          cb.title = '勾选完成';
          cb.addEventListener('change', () => {
            r.todo.done = cb.checked;
            DB.update('todos', r.todo.id, { done: cb.checked }).then(() => renderTodoList());
          });
        } else if (r.schedule) {
          cb.title = '勾选 = 标记该档期为已发布';
          cb.addEventListener('change', () => {
            const patch = { done: cb.checked, published: cb.checked };
            if (cb.checked) patch.doneAt = Date.now();
            DB.update('schedule', r.schedule.id, patch).then(() => renderTodoList());
          });
        } else {
          cb.disabled = true;
          cb.title = '到「PR对接」中推进该商单';
        }
        item.appendChild(cb);
        item.appendChild(U.el('span', { class: 'todo-text', text: r.text }));
        if (r.fixed) item.appendChild(U.el('span', { class: 'badge ' + (r.done ? 'ok' : 'warn'), style: 'font-size:10px;padding:2px 8px;flex:none', text: r.done ? '已打卡' : '待录入' }));
        if (r.todo) item.appendChild(U.el('span', { class: 'todo-del', text: '✕', title: '删除该待办', onclick: () => {
          const idx = todos.findIndex(x => x.id === r.todo.id);
          if (idx >= 0) todos.splice(idx, 1);
          DB.remove('todos', r.todo.id).then(() => renderTodoList());
        } }));
        list.appendChild(item);
      });
    }
    renderTodoList();

    // 手动新增待办：明确的「添加」按钮 + 回车（手机友好）
    const addWrap = U.el('div', { class: 'hub-add' });
    const addI = U.el('input', { placeholder: '＋ 输入待办内容…' });
    const addBtn = U.el('button', { class: 'btn btn-primary hub-add-btn', type: 'button', text: '添加' });
    function submitAdd() {
      const v = addI.value.trim();
      if (!v) return;
      DB.insert('todos', { text: v, done: false, createdAt: Date.now() }).then(async () => {
        addI.value = '';
        const latest = await DB.list('todos');
        todos.length = 0; latest.forEach(t => todos.push(t));
        renderTodoList();
        try { addI.focus(); } catch (e) {}
      });
    }
    addBtn.addEventListener('click', submitAdd);
    addI.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } });
    addWrap.appendChild(addI);
    addWrap.appendChild(addBtn);
    panel.appendChild(addWrap);
    return panel;
  }

  /* 让任意输入框支持粘贴图片/文件（读取剪贴板 item） */
  function bindPasteFiles(inputEl, onFile) {
    inputEl.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      let hasFile = false;
      for (const item of items) {
        if (item.kind === 'file') {
          hasFile = true;
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => onFile({ name: file.name || ('粘贴文件.' + (item.type || '').split('/')[1] || 'bin'), mime: file.type || item.type || '', dataUrl: reader.result });
            reader.readAsDataURL(file);
          }
        }
      }
    });
  }

  /* 语音转文字：基于浏览器原生 Web Speech API（SpeechRecognition）。
     用法：createVoiceButton(inp) 返回一个麦克风按钮 DOM，点击开始/停止识别，
     识别结果实时追加到输入框。不支持的浏览器（如 Firefox 桌面版）按钮自动隐藏并提示。 */
  function createVoiceButton(inp, resizeFn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = U.el('button', { class: 'ai-gemini-att', html: '🎤', title: '语音输入（点击开始/停止）' });
    if (!SR) {
      btn.style.display = 'none';
      btn.title = '当前浏览器不支持语音输入，请用 Chrome / Edge';
      return btn;
    }
    let recog = null;
    let active = false;
    function setUI(on) {
      btn.classList.toggle('recording', on);
      btn.innerHTML = on ? '⏹' : '🎤';
      btn.title = on ? '停止语音输入' : '语音输入（点击开始/停止）';
    }
    function ensureRecog() {
      if (recog) return recog;
      recog = new SR();
      recog.lang = 'zh-CN';
      recog.continuous = true;
      recog.interimResults = true;
      recog.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          U.toast('麦克风权限被拒绝，请在浏览器地址栏允许麦克风', 'error');
        }
        if (ev.error === 'aborted') return; // 主动停止，忽略
        stop();
      };
      recog.onend = () => { active = false; setUI(false); };
      return recog;
    }
    function start() {
      if (active) return;
      const r = ensureRecog();
      r._base = inp.value;
      r.onresult = (ev) => {
        let txt = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          txt += ev.results[i][0].transcript;
        }
        inp.value = (r._base || '') + txt;
        if (resizeFn) resizeFn();
      };
      try {
        r.start();
        active = true; setUI(true);
      } catch (e) {
        U.toast('无法启动语音识别：' + e.message, 'error');
        active = false; setUI(false);
      }
    }
    function stop() {
      active = false; setUI(false);
      if (recog) {
        try { recog.stop(); } catch (e) {}
        try { recog.abort(); } catch (e) {} // 强制终止，确保真正关闭
      }
    }
    btn.addEventListener('click', () => { if (active) stop(); else start(); });
    return btn;
  }

  /* 全局 AI 对话框：向 AI 下达工作台指令。full=true 时用于左侧「AI助手」大画幅页面 */
  function hubChatPanel(full) {
    const panel = U.el('div', { class: 'hub-panel' + (full ? ' full' : '') });
    panel.appendChild(U.el('div', { class: 'hub-panel-title', text: full ? '💬 AI 长对话' : '💬 全局 AI 助手' }));

    const log = U.el('div', { class: 'chat-log' });
    function renderLog() {
      log.innerHTML = '';
      if (!hubChat.length) {
        log.appendChild(U.el('div', { class: 'chat-hint muted', html: '向 AI 下达工作台指令，例如：<br>「分析我近 7 天的粉丝增长并给建议」<br>「帮我规划下周的更新排期」<br>也可点 📎 附上图片 / Word / Excel / PDF / 视频 让 AI 分析；输入「同步数据」可手动备份到云端。' }));
      }
      hubChat.forEach(m => log.appendChild(U.el('div', { class: 'chat-msg ' + m.role, html: escapeHtml(m.text) })));
      log.scrollTop = log.scrollHeight;
    }
    renderLog();
    panel.appendChild(log);

    // 待发送文件列表（支持多类型、多选）
    let pendingFiles = [];
    function escapeHtml(s) {
      return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    }
    function fileIcon(mime) {
      if (!mime) return '📄';
      if (mime.indexOf('image') >= 0) return '🖼';
      if (mime.indexOf('pdf') >= 0) return '📕';
      if (mime.indexOf('word') >= 0 || /\.docx?$/.test(mime)) return '📘';
      if (mime.indexOf('excel') >= 0 || /\.xlsx?$/.test(mime) || mime.indexOf('sheet') >= 0) return '📗';
      if (mime.indexOf('video') >= 0) return '🎬';
      if (mime.indexOf('audio') >= 0) return '🎵';
      return '📄';
    }
    function renderPreview() {
      previewBox.innerHTML = '';
      if (!pendingFiles.length) { previewBox.style.display = 'none'; return; }
      previewBox.style.display = 'flex';
      pendingFiles.forEach((f, i) => {
        const chip = U.el('div', { class: 'ai-att-chip' });
        const isImg = (f.mime || '').indexOf('image') >= 0;
        if (isImg) chip.appendChild(U.el('img', { src: f.dataUrl, class: 'ai-att-thumb' }));
        else chip.appendChild(U.el('span', { class: 'ai-att-ico', text: fileIcon(f.mime) }));
        chip.appendChild(U.el('span', { class: 'ai-att-name', text: f.name || ('文件' + (i + 1)) }));
        chip.appendChild(U.el('span', { class: 'ai-att-remove', text: '✕', title: '移除', onclick: () => { pendingFiles.splice(i, 1); renderPreview(); } }));
        previewBox.appendChild(chip);
      });
    }

    const send = async () => {
      const q = inp.value.trim();
      if (!q && !pendingFiles.length) return;
      const files = pendingFiles.slice();
      const text = q || '（请分析这些文件）';
      inp.value = '';
      const fileDesc = files.length ? ('📎 ' + files.length + ' 个文件 ') : '';
      hubChat.push({ role: 'user', text: fileDesc + text });
      hubChat.push({ role: 'ai', text: '⏳ AI 思考中…' });
      saveHubChat();
      pendingFiles = [];
      renderPreview();
      renderLog();
      const idx = hubChat.length - 1;

      // AI 同步权限：识别同步/备份指令，触发云端双向同步（三重保险之一）
      if (/^\s*(同步|备份|上传云端|sync|backup)/i.test(text)) {
        try {
          const r = await DB.syncNow();
          hubChat[idx] = { role: 'ai', text: '✅ 已手动同步到云端：本地上传 ' + r.up + ' 条，云端拉取 ' + r.down + ' 条，清理残留 ' + r.killed + ' 条。' };
        } catch (err) {
          hubChat[idx] = { role: 'ai', text: '⚠ 同步失败：' + (err && err.message || err) };
        }
        saveHubChat();
        renderLog();
        return;
      }

      try {
        const reply = await askGeminiAI(buildSystemPrompt(text), files.length ? { files } : undefined);
        const toolCalls = extractToolCalls(reply);
        let cleanText = stripToolCalls(reply);
        let toolResult = '';
        if (toolCalls.length) {
          const results = [];
          for (const raw of toolCalls) {
            try { results.push(await executeToolCall(raw)); }
            catch (e) { results.push('⚠ 写入失败：' + e.message); }
          }
          toolResult = '\n\n─── 执行结果 ───\n' + results.join('\n');
        }
        hubChat[idx] = { role: 'ai', text: (cleanText || '已按你的要求整理。') + toolResult };
      } catch (err) {
        hubChat[idx] = { role: 'ai', text: '⚠ ' + (err && err.message || 'AI 调用失败') };
      }
      saveHubChat();
      renderLog();
    };

    const previewBox = U.el('div', { class: 'ai-att-preview', style: 'display:none' });
    const row = U.el('div', { class: 'chat-row' });
    const inp = U.el('input', { class: 'chat-input', placeholder: '🤖 给 AI 下达工作台指令…或点 📎 / 粘贴图片' });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    bindPasteFiles(inp, (f) => { pendingFiles.push(f); renderPreview(); });
    const fileInput = U.el('input', { type: 'file', accept: 'image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,video/*,audio/*', multiple: true, style: 'display:none' });
    fileInput.addEventListener('change', () => {
      const fs = fileInput.files;
      if (!fs || !fs.length) return;
      Array.from(fs).forEach(f => {
        const reader = new FileReader();
        reader.onload = () => {
          pendingFiles.push({ name: f.name, mime: f.type || '', dataUrl: reader.result });
          renderPreview();
        };
        reader.readAsDataURL(f);
      });
      fileInput.value = '';
    });
    const attBtn = U.el('button', { class: 'btn btn-ghost', style: 'flex:none;padding:6px 10px', html: '📎', title: '附上图片/文档/表格/PDF/视频', onclick: () => fileInput.click() });
    const micBtn = createVoiceButton(inp, null);
    row.appendChild(micBtn);
    row.appendChild(attBtn);
    row.appendChild(inp);
    row.appendChild(U.el('button', { class: 'btn btn-primary', style: 'flex:none', text: '发送', onclick: send }));
    panel.appendChild(previewBox);
    panel.appendChild(row);
    return panel;
  }

  /* ----------------------------- 登录门禁 ----------------------------- */
  // 渲染登录页，返回是否放行（已登录 / 邀请注册 / 关闭登录）
  async function authGate() {
    const cfg = global.SUPABASE_CONFIG || {};
    if (!DB.auth.isEnabled()) return true; // 未开启登录，直接进

    // 先初始化数据层，确保 supabase client 已创建，否则登录/注册会报 null.auth
    try { await DB.init(); } catch (_) {}

    // 处理邀请注册链接 ?invite=email
    const params = new URLSearchParams(location.search);
    const inviteEmail = params.get('invite');

    const app = document.querySelector('.app');
    return await new Promise((resolve) => {
      function renderLogin(prefillEmail, mode) {
        const wrap = U.el('div', { class: 'auth-screen' });
        const card = U.el('div', { class: 'auth-card' });
        card.appendChild(U.el('div', { class: 'auth-logo', html: '工作台<br><small>Wynn</small>' }));
        if (inviteEmail && mode !== 'login') {
          card.appendChild(U.el('div', { class: 'auth-badge', text: '📩 受邀请注册：' + inviteEmail }));
        }
        card.appendChild(U.el('div', { class: 'auth-title', text: mode === 'signup' ? '创建账号' : '登录工作台' }));

        const form = U.el('form', { class: 'auth-form' });
        const emailI = U.el('input', { type: 'email', placeholder: '邮箱', value: prefillEmail || (inviteEmail || ''), required: true });
        const nameI = U.el('input', { type: 'text', placeholder: '昵称（如 Wynn）', required: true });
        const pwdI = U.el('input', { type: 'password', placeholder: '密码（至少 6 位）', minLength: 6, required: true });
        form.appendChild(U.el('label', { text: '邮箱' })); form.appendChild(emailI);
        if (mode === 'signup') { form.appendChild(U.el('label', { text: '昵称' })); form.appendChild(nameI); }
        form.appendChild(U.el('label', { text: '密码' })); form.appendChild(pwdI);

        const errBox = U.el('div', { class: 'auth-err' });
        form.appendChild(errBox);

        const submit = U.el('button', { class: 'btn btn-primary', style: 'width:100%;margin-top:6px', text: mode === 'signup' ? '注册并进入' : '登录' });
        form.appendChild(submit);

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          errBox.textContent = ''; submit.disabled = true; submit.textContent = '处理中…';
          try {
            if (mode === 'signup') {
              const displayName = nameI.value.trim();
              await DB.auth.signup(emailI.value.trim(), pwdI.value);
              // 若未开启邮箱验证，直接登录并写入昵称
              try {
                DB.auth.setLocalName(displayName);
                await DB.auth.login(emailI.value.trim(), pwdI.value);
                const u = DB.auth.currentUser();
                if (u) await DB.update('user_profiles', u.id, { display_name: displayName }).catch(() => {});
                cleanup(); resolve(true);
                return;
              } catch (loginErr) {
                errBox.className = 'auth-ok';
                errBox.textContent = '✓ 注册成功！请查收激活邮件并登录，昵称「' + displayName + '」将在首次登录时生效。';
                setTimeout(() => renderLogin(emailI.value.trim(), 'login'), 1800);
                return;
              }
            } else {
              await DB.auth.login(emailI.value.trim(), pwdI.value);
              // 登录成功后把云端昵称同步回本地，避免下次进来又要求重填
              try {
                const p = await DB.auth.profile(true);
                if (p && p.display_name) localStorage.setItem('cw_display_name', p.display_name);
              } catch (_) {}
              cleanup(); resolve(true);
            }
          } catch (err) {
            errBox.className = 'auth-err';
            errBox.textContent = '⚠ ' + (err && err.message ? err.message : '操作失败');
          } finally {
            submit.disabled = false; submit.textContent = mode === 'signup' ? '注册并进入' : '登录';
          }
        });
        card.appendChild(form);

        const toggle = U.el('div', { class: 'auth-toggle' });
        if (mode === 'login') {
          toggle.appendChild(U.el('a', { text: '没有账号？注册', onclick: () => { cleanup(); renderLogin(emailI.value.trim(), 'signup'); } }));
        } else {
          toggle.appendChild(U.el('a', { text: '已有账号？登录', onclick: () => { cleanup(); renderLogin(emailI.value.trim(), 'login'); } }));
        }
        card.appendChild(toggle);
        wrap.appendChild(card);

        const old = document.getElementById('authScreen');
        if (old) old.remove();
        wrap.id = 'authScreen';
        document.body.appendChild(wrap);
      }
      function cleanup() { const o = document.getElementById('authScreen'); if (o) o.remove(); }

      if (DB.auth.isLoggedIn()) { resolve(true); return; }
      renderLogin('', inviteEmail ? 'signup' : 'login');
    });
  }

  /* ----------------------------- 用户昵称与品牌署名 ----------------------------- */
  // 同步兜底：本地优先 → auth user_metadata → 邮箱前缀 → Wynn
  function userName() {
    const localName = localStorage.getItem('cw_display_name');
    if (localName) return localName;
    if (DB.auth.isEnabled() && DB.auth.isLoggedIn()) {
      const u = DB.auth.currentUser();
      if (u && u.user_metadata && u.user_metadata.display_name) return u.user_metadata.display_name;
      if (u && u.email) return u.email.split('@')[0];
    }
    return 'Wynn';
  }

  // 异步读取权威昵称（云端 profile > 本地 > 邮箱前缀）
  async function displayName() {
    const localName = localStorage.getItem('cw_display_name');
    if (localName) return localName;
    if (DB.auth.isEnabled() && DB.auth.isLoggedIn()) {
      try {
        const p = await DB.auth.profile();
        if (p && p.display_name) return p.display_name;
      } catch (_) {}
      const u = DB.auth.currentUser();
      if (u && u.email) return u.email.split('@')[0];
    }
    return 'Wynn';
  }

  // 更新侧边栏 logo 下方署名：管理员显示 Admin · Wynn，成员显示 User · xxx
  async function updateBrandSubtitle() {
    const logoSmall = document.querySelector('.brand .logo small');
    if (!logoSmall) return;
    const isAdmin = DB.auth.isEnabled() && DB.auth.isAdmin();
    const prefix = isAdmin ? 'Admin' : (DB.auth.isEnabled() && DB.auth.isLoggedIn() ? 'User' : '');
    const name = await displayName();
    logoSmall.textContent = prefix ? (prefix + ' · ' + name) : name;
  }

  function saveUserName(name) {
    const n = (name || '').trim();
    if (!n) return;
    localStorage.setItem('cw_display_name', n);
    // 若已登录，同步到 Supabase user_profiles
    if (DB.auth.isEnabled() && DB.auth.isLoggedIn()) {
      const u = DB.auth.currentUser();
      if (u) DB.update('user_profiles', u.id, { display_name: n }).catch(() => {});
    }
    updateBrandSubtitle();
  }

  function editUserName() {
    const current = userName();
    const inp = U.el('input', { style: 'width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,105,180,.45);background:rgba(18,18,18,.7);color:var(--text);', value: current === 'Wynn' ? '' : current, placeholder: '例如：Wynn' });
    U.modal({
      title: '设置昵称',
      body: U.el('div', {}, [
        U.el('p', { class: 'muted', style: 'margin-bottom:10px;font-size:13px', text: '设置后会在 AI 助手欢迎语、顶部用户徽章与侧边栏署名等处显示。' }),
        inp
      ]),
      actions: [
        { label: '取消', value: false },
        { label: '保存', value: true, primary: true, onclick: () => {
          const v = inp.value.trim();
          if (!v) return false;
          saveUserName(v);
          App.render();
          return true;
        } }
      ]
    });
  }
  App.editUserName = editUserName;

  /* ----------------------------- 左侧「AI助手」Gemini 风格全屏模块 ----------------------------- */

  App.register('ai', {
    title: '🤖 AI助手',
    async render(view) {
      const wrap = U.el('div', { class: 'ai-gemini' });
      // 顶部快捷小卡片
      const quickBar = U.el('div', { class: 'ai-gemini-quickbar' });
      const quickPanelSlot = U.el('div', { class: 'ai-gemini-panel-slot' });
      const panelChips = [
        { key: 'todo', icon: '📆', label: '今日日程' },
        { key: 'checkin', icon: '✅', label: '今日打卡' },
        { key: 'todos', icon: '📝', label: '待办管理' }
      ];
      let activeChip = null;
      panelChips.forEach(chip => {
        const btn = U.el('button', { class: 'ai-chip', html: '<span>' + chip.icon + '</span><span>' + chip.label + '</span>', onclick: () => {
          if (activeChip === chip.key) {
            activeChip = null;
            quickPanelSlot.innerHTML = '';
            quickPanelSlot.style.display = 'none';
            btn.classList.remove('active');
            return;
          }
          quickPanelSlot.style.display = 'block';
          Array.from(quickBar.children).forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeChip = chip.key;
          openQuickPanel(quickPanelSlot, chip.key);
        } });
        quickBar.appendChild(btn);
      });
      wrap.appendChild(quickBar);

      // 中间内容区
      const center = U.el('div', { class: 'ai-gemini-center' });
      const log = U.el('div', { class: 'ai-gemini-log' });
      // 清空对话按钮（持久化后支持手动重置）
      const clearBtn = U.el('button', { class: 'ai-gemini-clear', html: '🗑 清空对话', title: '清空当前 AI 对话记录', onclick: async () => {
        if (!(await U.confirm('确定清空当前 AI 对话记录？此操作不可恢复。', true))) return;
        hubChat = [];
        saveHubChat();
        renderLog();
      } });
      center.appendChild(clearBtn);
      function renderLog() {
        log.innerHTML = '';
        if (!hubChat.length) {
          log.classList.add('empty');
          center.classList.remove('has-chat');
          const currentName = userName();
          const looksLikeEmailPrefix = /^\d+$/.test(currentName);
          const hero = U.el('div', { class: 'ai-gemini-hero' }, [
            U.el('h1', { html: '<span class="em">✦</span> ' + currentName + '，你好！想聊点什么？' }),
            U.el('p', { class: 'muted', text: '我可以帮你分析数据、规划排期、拆解爆款、优化脚本。' })
          ]);
          const nameLink = U.el('a', { class: 'ai-name-edit', text: looksLikeEmailPrefix ? '数字不好看？设置昵称' : '设置昵称', onclick: (e) => { e.preventDefault(); editUserName(); } });
          hero.appendChild(nameLink);
          log.appendChild(hero);
        } else {
          log.classList.remove('empty');
          center.classList.add('has-chat');
          hubChat.forEach(m => log.appendChild(U.el('div', { class: 'chat-msg gemini ' + m.role, text: m.text })));
          log.scrollTop = log.scrollHeight;
        }
      }
      renderLog();
      center.appendChild(log);
      center.appendChild(quickPanelSlot);

      // 底部大输入框（支持多类型附件/图片/文档/表格/视频）
      let pendingFiles = [];
      function fileIcon(mime) {
        if (!mime) return '📄';
        if (mime.indexOf('image') >= 0) return '🖼';
        if (mime.indexOf('pdf') >= 0) return '📕';
        if (mime.indexOf('word') >= 0 || /\.docx?$/.test(mime)) return '📘';
        if (mime.indexOf('excel') >= 0 || /\.xlsx?$/.test(mime) || mime.indexOf('sheet') >= 0) return '📗';
        if (mime.indexOf('video') >= 0) return '🎬';
        if (mime.indexOf('audio') >= 0) return '🎵';
        return '📄';
      }
      function renderPreview() {
        previewBox.innerHTML = '';
        if (!pendingFiles.length) { previewBox.style.display = 'none'; return; }
        previewBox.style.display = 'flex';
        pendingFiles.forEach((f, i) => {
          const chip = U.el('div', { class: 'ai-att-chip' });
          const isImg = (f.mime || '').indexOf('image') >= 0;
          if (isImg) chip.appendChild(U.el('img', { src: f.dataUrl, class: 'ai-att-thumb' }));
          else chip.appendChild(U.el('span', { class: 'ai-att-ico', text: fileIcon(f.mime) }));
          chip.appendChild(U.el('span', { class: 'ai-att-name', text: f.name || ('文件' + (i + 1)) }));
          chip.appendChild(U.el('span', { class: 'ai-att-remove', text: '✕', title: '移除', onclick: () => { pendingFiles.splice(i, 1); renderPreview(); } }));
          previewBox.appendChild(chip);
        });
      }
      const send = async () => {
        const q = inp.value.trim();
        if (!q && !pendingFiles.length) return;
        const files = pendingFiles.slice();
        const text = q || '（请分析这些文件）';
        inp.value = '';
        inp.style.height = 'auto';
        const fileDesc = files.length ? ('📎 ' + files.length + ' 个文件 ') : '';
        hubChat.push({ role: 'user', text: fileDesc + text });
        hubChat.push({ role: 'ai', text: '⏳ AI 思考中…' });
        saveHubChat();
        pendingFiles = [];
        renderPreview();
        renderLog();
        const idx = hubChat.length - 1;

        // AI 同步权限：识别同步/备份指令
        if (/^\s*(同步|备份|上传云端|sync|backup)/i.test(text)) {
          try {
            const r = await DB.syncNow();
            hubChat[idx] = { role: 'ai', text: '✅ 已手动同步到云端：本地上传 ' + r.up + ' 条，云端拉取 ' + r.down + ' 条，清理残留 ' + r.killed + ' 条。' };
          } catch (err) {
            hubChat[idx] = { role: 'ai', text: '⚠ 同步失败：' + (err && err.message || err) };
          }
          saveHubChat();
          renderLog();
          return;
        }

        try {
          const reply = await askGeminiAI(buildSystemPrompt(text), files.length ? { files } : undefined);
          const toolCalls = extractToolCalls(reply);
          let cleanText = stripToolCalls(reply);
          let toolResult = '';
          if (toolCalls.length) {
            const results = [];
            for (const raw of toolCalls) {
              try { results.push(await executeToolCall(raw)); }
              catch (e) { results.push('⚠ 写入失败：' + e.message); }
            }
            toolResult = '\n\n─── 执行结果 ───\n' + results.join('\n');
          }
          hubChat[idx] = { role: 'ai', text: (cleanText || '已按你的要求整理。') + toolResult };
        } catch (err) {
          hubChat[idx] = { role: 'ai', text: '⚠ ' + (err && err.message || 'AI 调用失败') };
        }
        saveHubChat();
        renderLog();
      };

      const inputWrap = U.el('div', { class: 'ai-gemini-inputwrap' });
      // 附件预览区
      const previewBox = U.el('div', { class: 'ai-att-preview', style: 'display:none' });
      // 文本输入（textarea 支持多行）
      const inp = U.el('textarea', { class: 'ai-gemini-input', rows: 1, placeholder: '给 AI 下达工作台指令…或附上图片 / Word / Excel / PDF / 视频（也可直接粘贴）' });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      bindPasteFiles(inp, (f) => { pendingFiles.push(f); renderPreview(); });
      // 自动撑高
      inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 160) + 'px'; });
      // 附件按钮（多类型、多选）
      const fileInput = U.el('input', { type: 'file', accept: 'image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,video/*,audio/*', multiple: true, style: 'display:none' });
      fileInput.addEventListener('change', () => {
        const fs = fileInput.files;
        if (!fs || !fs.length) return;
        Array.from(fs).forEach(f => {
          const reader = new FileReader();
          reader.onload = () => {
            pendingFiles.push({ name: f.name, mime: f.type || '', dataUrl: reader.result });
            renderPreview();
          };
          reader.readAsDataURL(f);
        });
        fileInput.value = '';
      });
      const attBtn = U.el('button', { class: 'ai-gemini-att', html: '📎', title: '附上图片/文档/表格/PDF/视频', onclick: () => fileInput.click() });
      const micBtn = createVoiceButton(inp, () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 160) + 'px'; });
      inputWrap.appendChild(micBtn);
      inputWrap.appendChild(attBtn);
      inputWrap.appendChild(inp);
      inputWrap.appendChild(U.el('button', { class: 'ai-gemini-send', html: '➤', onclick: send }));
      center.appendChild(previewBox);
      center.appendChild(inputWrap);
      wrap.appendChild(center);
      view.appendChild(wrap);

      // 初始加载今日日程小面板（默认收起，不自动展开；这里只预加载一次数据避免点击时等待）
      quickPanelSlot.style.display = 'none';
    }
  });

  // 打开快捷小卡片面板
  async function openQuickPanel(slot, key) {
    slot.innerHTML = '<div class="muted" style="padding:20px">加载中…</div>';
    try {
      if (key === 'checkin') {
        const today = U.fmtDate(new Date());
        const metrics = await DB.list('metrics');
        const done = metrics.some(m => m.date === today);
        slot.innerHTML = '';
        const card = U.el('div', { class: 'ai-quick-card' }, [
          U.el('h4', { text: '✅ 今日打卡' }),
          U.el('div', { class: 'muted', style: 'margin:10px 0', text: done ? '今日已录入账号数据，打卡完成 ✓' : '今日尚未录入账号数据，打卡未完成。' }),
          U.el('button', { class: 'btn ' + (done ? 'btn-ghost' : 'btn-primary'), text: done ? '去数据管理查看' : '去录入今日数据', onclick: () => { App.go('dashboard'); } })
        ]);
        slot.appendChild(card);
      } else {
        // todo / todos 都展示完整今日日程面板
        const panel = await hubTodoPanel();
        slot.innerHTML = '';
        slot.appendChild(panel);
      }
    } catch (e) {
      slot.innerHTML = '<div class="muted" style="padding:20px">加载失败</div>';
      console.error('快捷面板加载失败', e);
    }
  }

  /* ----------------------------- 全局错误兜底（避免白屏） ----------------------------- */
  window.addEventListener('error', (e) => {
    console.error('全局错误', e.error || e.message);
  });

  /* ----------------------------- 启动 ----------------------------- */
  async function boot() {
    // 启动兜底：若 6 秒仍卡在「正在唤醒」，提示刷新/检查网络，避免无限白等
    const stuckTimer = setTimeout(() => {
      const v = document.getElementById('view');
      if (v && v.querySelector('.loader')) {
        v.innerHTML = '<div class="loader"><div style="max-width:320px;line-height:1.8">⏳ 加载较慢…<br><span class="muted" style="font-size:13px">若 10 秒后仍无反应，请强刷页面（电脑 Ctrl+F5 / 手机划掉标签页重开），或检查网络是否连通。</span></div></div>';
      }
    }, 6000);

    // 登录门禁（内部已 await DB.init，确保 supabase client 就绪）
    const passed = await authGate();
    if (!passed) return; // 登录页已渲染，等待用户操作

    buildNav();
    // 登录态下从云端拉取本账号 AI 对话（按 user_id 隔离，同事不可见）
    loadHubChat().then(() => { try { paintHub(); } catch (_) {} });
    document.getElementById('hamburger').addEventListener('click', () => {
      const sb = document.getElementById('sidebar');
      sb.classList.contains('open') ? closeSidebarMobile() : openSidebarMobile();
    });
    document.getElementById('scrim').addEventListener('click', closeSidebarMobile);
    bindSearch();

    try {
      const kind = DB.getKind();
      const labelMap = { sqlite: 'SQLite 后端', json: 'JSON 后端', indexeddb: 'IndexedDB 本地', local: 'LocalStorage 本地', supabase: '云端同步' };
      const colorMap = { indexeddb: 'var(--pink)', local: 'var(--pink)', sqlite: '#6ff0b0', json: '#6ff0b0', supabase: '#6ff0b0' };
      const label = labelMap[kind] || '本地存储';
      const color = colorMap[kind] || '#6ff0b0';
      document.getElementById('storageMode').textContent = label;
      document.getElementById('storageMode').parentElement.querySelector('.dot').style.background = color;

      // 顶栏右侧：登录态显示 + 登出（仅开启登录时）
      const topbar = document.querySelector('.topbar .spacer');
      if (DB.auth.isEnabled() && DB.auth.isLoggedIn()) {
        const u = DB.auth.currentUser();
        const badge = U.el('span', { class: 'user-badge', title: '点击修改昵称（' + (u.email || '') + '）', text: (DB.auth.isAdmin() ? '🛡️ ' : '') + userName(), onclick: () => editUserName() });
        const out = U.el('button', { class: 'btn btn-ghost', style: 'font-size:12px;padding:5px 12px;margin-left:8px', text: '退出', onclick: async () => {
          await DB.auth.logout(); location.reload();
        } });
        topbar.parentElement.insertBefore(badge, topbar.nextSibling);
        topbar.parentElement.insertBefore(out, badge.nextSibling);
        updateBrandSubtitle();
        // 首次进入若还没设过真昵称，自动弹一次设置（用标记避免反复弹）
        const nm = await displayName();
        const emailPrefix = u.email ? u.email.split('@')[0] : '';
        if (!localStorage.getItem('cw_name_prompted') && (nm === 'Wynn' || nm === emailPrefix)) {
          localStorage.setItem('cw_name_prompted', '1');
          setTimeout(() => editUserName(), 600);
        }
      }

      const accepted = localStorage.getItem('cw_privacy_ok');
      // 仅本地模式补种示例数据；云端（supabase）模式跳过，避免大量写入卡死且数据已在云端
      if (DB.getKind() !== 'supabase') {
        if (!accepted) {
          const ok = await showPrivacy();
          if (ok) { await seedIfEmpty(); localStorage.setItem('cw_privacy_ok', '1'); }
        } else {
          await seedIfEmpty();
        }
      } else {
        localStorage.setItem('cw_privacy_ok', '1');
      }
    } catch (e) {
      console.error('初始化过程中出错（已兜底渲染）', e);
    }

    window.addEventListener('hashchange', () => App.render());
    // 数据变更时自动刷新当前视图与顶部 AI 中枢：弹窗挂在 body 上是独立浮层，重渲染不影响其表单内容；
    // 加 60ms 防抖，避免批量更新（如重排期顺延）时反复重绘。
    let renderTimer = null;
    DB.onChange(() => { clearTimeout(renderTimer); renderTimer = setTimeout(() => { App.render(); paintHub(); }, 60); });

    try { paintHub(); } catch (_) {}
    if (!location.hash) location.hash = '#/dashboard'; else App.render();
    clearTimeout(stuckTimer); // 首屏已渲染，取消"加载较慢"兜底提示
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
