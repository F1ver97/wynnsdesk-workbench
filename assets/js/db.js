/* =====================================================================
 *  db.js —— 统一数据层
 *  优先级：Supabase 云端（若配置且可用）> 后端 server > IndexedDB > localStorage
 *  暴露全局 DB 对象，所有模块通过它进行 CRUD，无需关心底层存储。
 *  设计：云端为权威源；本地 IndexedDB 作为离线缓存/兜底；启动时双向合并。
 * ===================================================================== */
(function (global) {
  'use strict';

  const COLLECTIONS = ['metrics', 'inspiration', 'collage', 'competitor', 'hotspots', 'orders', 'schedule', 'scripts', 'briefs', 'todos'];
  const DB_NAME = 'creator_workbench';
  const DB_VERSION = 1;
  const TOMBSTONE_KEY = 'cw_tombstones'; // 本地删除记录，防止同步把已删数据复活

  let mode = 'detecting';      // 'supabase' | 'server' | 'indexeddb' | 'local'
  let serverKind = 'sqlite';
  let idb = null;              // IndexedDB 连接
  const listeners = [];
  let sb = null;               // supabase client
  let sbReady = false;
  let currentUser = null;      // 当前登录用户 {id, email}
  let authReady = false;

  /* 墓碑：记录已删除的 id，同步时清理云端残留，避免已删数据复活 */
  function addTombstone(col, id) {
    try {
      const map = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '{}');
      map[col] = map[col] || [];
      if (!map[col].includes(id)) map[col].push(id);
      localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(map));
    } catch (_) {}
  }
  function getTombstones(col) {
    try { return JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '{}')[col] || []; } catch (_) { return []; }
  }
  function clearTombstone(col, id) {
    try {
      const map = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '{}');
      if (map[col]) { map[col] = map[col].filter(x => x !== id); localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(map)); }
    } catch (_) {}
  }

  /* ============================ Auth ============================ */
  const Auth = {
    isEnabled: () => !!(global.SUPABASE_CONFIG && global.SUPABASE_CONFIG.authRequired),
    isLoggedIn: () => !!currentUser,
    currentUser: () => currentUser,
    isAdmin: () => {
      const cfg = global.SUPABASE_CONFIG || {};
      const list = Array.isArray(cfg.adminEmails) ? cfg.adminEmails : [];
      return !!(currentUser && currentUser.email && list.includes(currentUser.email.toLowerCase()));
    },
    async login(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user ? { id: data.user.id, email: (data.user.email || '').toLowerCase() } : null;
      if (currentUser) await ensureProfile(currentUser).catch(() => {});
      return currentUser;
    },
    async signup(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },
    async logout() {
      await sb.auth.signOut();
      currentUser = null;
      profileCache = null;
      localStorage.removeItem('cw_display_name');
    },
    async profile(refresh) {
      if (!currentUser) return null;
      return await fetchProfile(currentUser.id, refresh);
    },
    setLocalName(name) {
      const n = (name || '').trim();
      if (n) localStorage.setItem('cw_display_name', n);
    },
    // 管理员生成邀请链接（同事点开自助注册，预填邮箱）
    inviteLink(email) {
      const cfg = global.SUPABASE_CONFIG || {};
      const base = (cfg.invite && cfg.invite.baseUrl) || (location.origin + location.pathname);
      return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'invite=' + encodeURIComponent(email || '');
    },
  };

  // 首次登录写 profile；自动禁用检查在 authGate 前由 app.js 调 ensureProfile 完成
  async function ensureProfile(user) {
    if (!sb || !user) return;
    const { data, error } = await sb.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
    if (error && error.code !== 'PGRST116') return;
    const localName = localStorage.getItem('cw_display_name');
    if (!data) {
      await sb.from('user_profiles').insert({
        id: user.id, email: user.email,
        display_name: localName || user.email.split('@')[0],
        role: (global.SUPABASE_CONFIG.adminEmails || []).includes(user.email) ? 'admin' : 'member',
        disabled: false, created_at: Date.now()
      });
    } else {
      if (data.disabled) throw new Error('该账号已被管理员禁用，请联系管理员');
      // 如果本地已有昵称但云端没有，回写云端
      if (localName && !data.display_name) {
        await sb.from('user_profiles').update({ display_name: localName }).eq('id', user.id);
      }
    }
  }

  // 读取当前用户 profile（优先缓存，带 refresh 参数强制重查）
  async function fetchProfile(userId, refresh) {
    if (!sb || !userId) return null;
    if (!refresh && profileCache && profileCache.id === userId) return profileCache;
    const { data, error } = await sb.from('user_profiles').select('*').eq('id', userId).maybeSingle();
    if (error) return null;
    profileCache = data || null;
    return profileCache;
  }
  let profileCache = null;

  /* ----------------------- 事件通知（刷新视图） ----------------------- */
  function emit() { listeners.forEach(fn => { try { fn(); } catch (e) {} }); }
  function onChange(fn) { listeners.push(fn); }

  /* ============================ 后端模式 ============================ */
  async function api(method, path, body) {
    const opt = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opt);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  const serverStore = {
    async list(col) { return api('GET', '/' + col); },
    async get(col, id) { return api('GET', '/' + col + '/' + id); },
    async insert(col, rec) { return api('POST', '/' + col, rec); },
    async update(col, id, patch) { return api('PUT', '/' + col + '/' + id, patch); },
    async remove(col, id) { return api('DELETE', '/' + col + '/' + id); },
    async exportAll() { const r = await api('GET', '/export'); return r.data; },
    async importAll(data) { return api('POST', '/import', { data }); },
  };

  /* ========================== IndexedDB 模式 ========================== */
  function openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        COLLECTIONS.forEach(c => { if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' }); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function tx(db, col, mode) { return db.transaction(col, mode).objectStore(col); }
  function idbReq(request) { return new Promise((res, rej) => { request.onsuccess = () => res(request.result); request.onerror = () => rej(request.error); }); }

  const idbStore = {
    async list(col) {
      const db = await idb; const all = await idbReq(tx(db, col, 'readonly').getAll());
      return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async get(col, id) { const db = await idb; return idbReq(tx(db, col, 'readonly').get(id)); },
    async insert(col, rec) {
      const db = await idb;
      const id = rec.id || ('id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      const now = Date.now();
      const obj = { ...rec, id, createdAt: rec.createdAt || now, updatedAt: now };
      await idbReq(tx(db, col, 'readwrite').put(obj));
      return obj;
    },
    async update(col, id, patch) {
      const db = await idb;
      const cur = await idbReq(tx(db, col, 'readonly').get(id));
      if (!cur) return null;
      const obj = { ...cur, ...patch, id, updatedAt: Date.now() };
      await idbReq(tx(db, col, 'readwrite').put(obj));
      return obj;
    },
    async remove(col, id) { const db = await idb; await idbReq(tx(db, col, 'readwrite').delete(id)); return true; },
    async upsert(col, rec) {
      const db = await idb;
      const id = rec.id || ('id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      const cur = await idbReq(tx(db, col, 'readonly').get(id));
      const obj = { ...(cur || {}), ...rec, id, updatedAt: rec.updatedAt || Date.now() };
      await idbReq(tx(db, col, 'readwrite').put(obj));
      return obj;
    },
    async exportAll() {
      const db = await idb; const out = {};
      for (const col of COLLECTIONS) out[col] = await idbReq(tx(db, col, 'readonly').getAll());
      return out;
    },
    async importAll(data) {
      const db = await idb;
      for (const col of COLLECTIONS) {
        if (!data[col]) continue;
        const store = tx(db, col, 'readwrite');
        await idbReq(store.clear());
        for (const rec of data[col]) await idbReq(store.put(rec));
      }
    },
  };

  /* ========================== Supabase 模式 ========================== */
  // 把前端对象写入/读取 Supabase：列名用 snake_case，JSON 字段用 JSONB。
  function toRow(col, rec) {
    const r = { ...rec };
    if ('createdAt' in r) { r.created_at = r.createdAt; delete r.createdAt; }
    if ('updatedAt' in r) { r.updated_at = r.updatedAt; delete r.updatedAt; }
    if ('scriptDate' in r) { r.script_date = r.scriptDate; delete r.scriptDate; }
    if ('publishDate' in r) { r.publish_date = r.publishDate; delete r.publishDate; }
    if ('pubDate' in r) { r.pub_date = r.pubDate; delete r.pubDate; }
    if ('scriptFile' in r) { r.script_file = r.scriptFile; delete r.scriptFile; }
    if ('briefFile' in r) { r.brief_file = r.briefFile; delete r.briefFile; }
    if ('dataUrl' in r) { r.data_url = r.dataUrl; delete r.dataUrl; }
    if ('remindedAt' in r) { r.reminded_at = r.remindedAt; delete r.remindedAt; }
    if ('doneAt' in r) { r.done_at = r.doneAt; delete r.doneAt; }
    return r;
  }
  function fromRow(col, row) {
    const r = { ...row };
    if ('created_at' in r) { r.createdAt = r.created_at; delete r.created_at; }
    if ('updated_at' in r) { r.updatedAt = r.updated_at; delete r.updated_at; }
    if ('script_date' in r) { r.scriptDate = r.script_date; delete r.script_date; }
    if ('publish_date' in r) { r.publishDate = r.publish_date; delete r.publish_date; }
    if ('pub_date' in r) { r.pubDate = r.pub_date; delete r.pub_date; }
    if ('script_file' in r) { r.scriptFile = r.script_file; delete r.script_file; }
    if ('brief_file' in r) { r.briefFile = r.brief_file; delete r.brief_file; }
    if ('data_url' in r) { r.dataUrl = r.data_url; delete r.data_url; }
    if ('reminded_at' in r) { r.remindedAt = r.reminded_at; delete r.reminded_at; }
    if ('done_at' in r) { r.doneAt = r.done_at; delete r.done_at; }
    return r;
  }

  const supabaseStore = {
    async list(col) {
      const { data, error } = await sb.from(col).select('*');
      if (error) {
        // 表尚未创建（relation does not exist）时不抛错，返回空集合，避免整页白屏
        if (/does not exist|relation|42P01|404/i.test(String(error.message || error.code || error.hint || ''))) return [];
        throw error;
      }
      return (data || []).map(r => fromRow(col, r));
    },
    async get(col, id) {
      const { data, error } = await sb.from(col).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? fromRow(col, data) : null;
    },
    async insert(col, rec) {
      const now = Date.now();
      const base = col === 'user_profiles'
        ? { id: rec.id }
        : { id: rec.id || ('id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)), createdAt: rec.createdAt || now, updatedAt: now };
      // 业务表写入自动带上当前用户 ID，供 RLS 按账号隔离
      const owner = (col !== 'user_profiles' && currentUser && currentUser.id) ? { user_id: currentUser.id } : {};
      const obj = { ...base, ...rec, ...owner };
      const { data, error } = await sb.from(col).insert(toRow(col, obj)).select().maybeSingle();
      if (error) throw error;
      // 本地缓存兜底（user_profiles 不参与业务集合缓存）
      try { if (col !== 'user_profiles' && idb) await idbStore.insert(col, data ? fromRow(col, data) : obj); } catch (_) {}
      return data ? fromRow(col, data) : obj;
    },
    async update(col, id, patch) {
      const owner = (col !== 'user_profiles' && currentUser && currentUser.id) ? { user_id: currentUser.id } : {};
      const obj = col === 'user_profiles'
        ? { ...patch, id }
        : { ...patch, id, updatedAt: Date.now(), ...owner };
      const { data, error } = await sb.from(col).update(toRow(col, obj)).eq('id', id).select().maybeSingle();
      if (error) throw error;
      try { if (col !== 'user_profiles' && idb) await idbStore.update(col, id, data ? fromRow(col, data) : obj); } catch (_) {}
      return data ? fromRow(col, data) : obj;
    },
    async remove(col, id) {
      const { error } = await sb.from(col).delete().eq('id', id);
      if (error) throw error;
      try { idb && await idbStore.remove(col, id); } catch (_) {}
      addTombstone(col, id); // 标记已删，阻止同步复活
      return true;
    },
    async exportAll() {
      const out = {};
      for (const col of COLLECTIONS) out[col] = await this.list(col);
      return out;
    },
    async importAll() { /* 云端为权威源，无需导入 */ },
  };

  /* ============================ 初始化 ============================ */
  async function detect() {
    // 0) 优先 Supabase
    try {
      if (global.SUPABASE_CONFIG && global.SUPABASE_CONFIG.enabled && global.supabase) {
        const cfg = global.SUPABASE_CONFIG;
        const sbUrl = cfg.proxyUrl || cfg.url;
        sb = global.supabase.createClient(sbUrl, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
        // 探活：随机挑一张表做轻量查询
        const { error } = await sb.from('metrics').select('id', { count: 'exact', head: true });
        if (!error) {
          sbReady = true; mode = 'supabase';
          global.SUPABASE_CLIENT = sb; // 暴露给管理后台等需要直接调用 supabase client 的模块
          idb = await openIDB().catch(() => null);
          // 恢复已有登录会话
          const { data: ses } = await sb.auth.getSession();
          if (ses && ses.session && ses.session.user) {
            currentUser = { id: ses.session.user.id, email: (ses.session.user.email || '').toLowerCase() };
          }
          return;
        }
      }
    } catch (e) { console.warn('Supabase 不可用，回退', e); }

    // 1) 后端 server
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch('/api/health', { signal: ctrl.signal });
      clearTimeout(t);
      const j = await res.json();
      if (j && j.ok) { mode = 'server'; serverKind = j.kind || 'sqlite'; return; }
    } catch (e) { /* 后端不可用 */ }

    // 2) IndexedDB
    try { idb = await openIDB(); mode = 'indexeddb'; }
    catch (e) {
      try { if (typeof localStorage !== 'undefined') { mode = 'local'; return; } } catch (_) {}
      console.error('本地存储均不可用', e); mode = 'local';
    }
  }

  /* 启动后单向补推：把云端不存在的本地记录上传，并清理云端已被本地删除（墓碑）的残留 */
  async function syncLocalToCloud() {
    if (mode !== 'supabase' || !idb) return;
    for (const col of COLLECTIONS) {
      if (col === 'hotspots') continue;
      const tombs = getTombstones(col);
      // 同步删除云端副本（解决「本地删了、云端还在、登录后假数据复活」）
      for (const tid of tombs) {
        try { const ex = await supabaseStore.get(col, tid); if (ex) { await supabaseStore.remove(col, tid); clearTombstone(col, tid); } } catch (_) {}
      }
      const local = await idbStore.list(col);
      for (const rec of local) {
        if (tombs.includes(rec.id)) continue; // 墓碑残留不推
        try {
          const exists = await supabaseStore.get(col, rec.id);
          if (!exists) await supabaseStore.insert(col, rec); // 仅补齐云端缺失，不 update
        } catch (_) {}
      }
    }
  }

  /* 导出本地全部数据（IndexedDB + localStorage 兜底，合并去重），供手动合并到云端 */
  async function exportLocalAll() {
    const out = {};
    let idbData = {};
    if (idb) { try { idbData = await idbStore.exportAll(); } catch (_) {} }
    let lsData = {};
    try { lsData = await localStore.exportAll(); } catch (_) {}
    for (const col of COLLECTIONS) {
      const byId = {};
      (idbData[col] || []).forEach(r => { if (r && r.id) byId[r.id] = r; });
      (lsData[col] || []).forEach(r => { if (r && r.id && !byId[r.id]) byId[r.id] = r; });
      out[col] = Object.values(byId);
    }
    return out;
  }

  /* 手动把本地缓存（含 IndexedDB 与 localStorage 兜底）合并进云端：
     ① 本地有、云端没有的 → 上传（找回离线写的待办等）；② 本地已删除（墓碑）→ 云端同步删除；
     绝不覆盖云端已有记录。返回 {up, killed, skip}。 */
  async function mergeLocalToCloud() {
    if (mode !== 'supabase') throw new Error('请先登录云端账号');
    const local = await exportLocalAll();
    let up = 0, killed = 0, skip = 0;
    for (const col of COLLECTIONS) {
      if (col === 'hotspots' || col === 'user_profiles') continue;
      const tombs = getTombstones(col);
      for (const rec of (local[col] || [])) {
        if (!rec || !rec.id) continue;
        if (tombs.includes(rec.id)) {
          try { const ex = await supabaseStore.get(col, rec.id); if (ex) { await supabaseStore.remove(col, rec.id); killed++; clearTombstone(col, rec.id); } } catch (_) {}
          continue;
        }
        try {
          const exists = await supabaseStore.get(col, rec.id);
          if (!exists) { await supabaseStore.insert(col, rec); up++; }
          else skip++;
        } catch (_) {}
      }
    }
    // 回拉云端到本地缓存，保持两端一致（失败不影响上传结果）
    try {
      for (const col of COLLECTIONS) {
        if (col === 'hotspots' || col === 'user_profiles') continue;
        const cloud = await supabaseStore.list(col).catch(() => []);
        for (const r of (cloud || [])) { try { await idbStore.upsert(col, r); } catch (_) {} }
      }
    } catch (_) {}
    emit();
    return { up, killed, skip };
  }

  /* 手动同步（双向保险）：本地缺失的补推云端 + 墓碑清理云端残留 + 云端最新拉回本地 */
  async function syncNow() {
    if (mode !== 'supabase') throw new Error('当前未连接云端，无法同步');
    if (!idb) throw new Error('本地存储不可用');
    let up = 0, down = 0, killed = 0;
    for (const col of COLLECTIONS) {
      if (col === 'hotspots') continue;
      const tombs = getTombstones(col);
      // 1) 云端 → 本地（拉取最新）
      const cloud = await supabaseStore.list(col).catch(() => []);
      for (const rec of (cloud || [])) {
        // 若云端记录属于本地已删除的墓碑，则删除云端，避免复活
        if (tombs.includes(rec.id)) {
          try { await supabaseStore.remove(col, rec.id); killed++; clearTombstone(col, rec.id); } catch (_) {}
          continue;
        }
        try { await idbStore.upsert(col, rec); down++; } catch (_) {}
      }
      // 2) 本地 → 云端（仅补推云端不存在的，绝不 update 覆盖）
      const local = await idbStore.list(col);
      for (const rec of local) {
        if (tombs.includes(rec.id)) continue; // 本地墓碑残留不推
        try {
          const exists = await supabaseStore.get(col, rec.id);
          if (!exists) { await supabaseStore.insert(col, rec); up++; }
        } catch (_) {}
      }
    }
    emit();
    return { up, down, killed };
  }

  /* ===================== localStorage 兜底（file:// 且 IndexedDB 不可用） ===================== */
  const LS_PREFIX = 'cw_db_';
  const localStore = {
    _key: (col) => LS_PREFIX + col,
    async list(col) { try { return JSON.parse(localStorage.getItem(this._key(col)) || '[]'); } catch { return []; } },
    async get(col, id) { const a = await this.list(col); return a.find(x => x.id === id) || null; },
    async insert(col, rec) {
      const a = await this.list(col);
      const id = rec.id || ('id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      const now = Date.now();
      const obj = { ...rec, id, createdAt: rec.createdAt || now, updatedAt: now };
      a.push(obj); localStorage.setItem(this._key(col), JSON.stringify(a)); return obj;
    },
    async update(col, id, patch) {
      const a = await this.list(col); const i = a.findIndex(x => x.id === id); if (i < 0) return null;
      a[i] = { ...a[i], ...patch, id, updatedAt: Date.now() }; localStorage.setItem(this._key(col), JSON.stringify(a)); return a[i];
    },
    async remove(col, id) { const a = await this.list(col); const f = a.filter(x => x.id !== id); localStorage.setItem(this._key(col), JSON.stringify(f)); return true; },
    async exportAll() { const out = {}; for (const c of COLLECTIONS) out[c] = await this.list(c); return out; },
    async importAll(data) { for (const c of COLLECTIONS) { if (data[c]) localStorage.setItem(this._key(c), JSON.stringify(data[c])); } },
  };

  const store = () => (mode === 'supabase' ? supabaseStore : mode === 'server' ? serverStore : mode === 'local' ? localStore : idbStore);

  const DB = {
    COLLECTIONS,
    onChange,
    auth: Auth,
    getMode: () => mode,
    getKind: () => (mode === 'supabase' ? 'supabase' : mode === 'server' ? serverKind : 'indexeddb'),
    init: async () => { await detect(); authReady = true; if (mode === 'supabase') await syncLocalToCloud().catch(() => {}); return mode; },

    list: (col) => store().list(col),
    get: (col, id) => store().get(col, id),
    insert: async (col, rec) => { const r = await store().insert(col, rec); emit(); return r; },
    update: async (col, id, patch) => { const r = await store().update(col, id, patch); emit(); return r; },
    remove: async (col, id) => { const r = await store().remove(col, id); emit(); return r; },
    // 安静删除：用于 UI 删除行（避免 emit 触发整页重绘闪动），调用方自行就地移除 DOM 行
    removeQuiet: async (col, id) => { return await store().remove(col, id); },
    exportAll: () => store().exportAll(),
    importAll: (data) => store().importAll(data),
    syncNow: async () => { const r = await syncNow(); emit(); return r; },

    /* AI 对话记录：按账号隔离的云端同步（每账号一条记录，存全量数组） */
    getChat: async () => {
      const uid = currentUser && currentUser.id;
      if (mode === 'supabase' && uid) {
        try {
          const { data, error } = await sb.from('ai_chat').select('messages').eq('user_id', uid).maybeSingle();
          if (error && error.code !== 'PGRST116') throw error;
          return (data && data.messages) || [];
        } catch (e) { console.warn('读取云端对话失败，回退本地', e); }
      }
      // 本地兜底（indexeddb / local / supabase 不可达）
      try { return JSON.parse(localStorage.getItem('cw_aihub_chat') || '[]') || []; } catch (_) { return []; }
    },
    saveChat: async (messages) => {
      const uid = currentUser && currentUser.id;
      // 始终写本地兜底（实时、断网可用）
      try {
        const capped = messages.length > 200 ? messages.slice(messages.length - 200) : messages;
        localStorage.setItem('cw_aihub_chat', JSON.stringify(capped));
      } catch (_) {}
      if (mode === 'supabase' && uid) {
        try {
          const capped = messages.length > 200 ? messages.slice(messages.length - 200) : messages;
          const { data, error } = await sb.from('ai_chat').upsert(
            { user_id: uid, messages: capped, updated_at: Date.now() },
            { onConflict: 'user_id' }
          ).select('messages').maybeSingle();
          if (error) throw error;
          return (data && data.messages) || capped;
        } catch (e) { console.warn('云端对话写入失败', e); }
      }
      return messages;
    },

    syncLocalToCloud: async () => { await syncLocalToCloud(); },
    mergeLocalToCloud: async () => { return await mergeLocalToCloud(); },

    /* 跨集合便捷方法 */
    async all() {
      const out = {};
      for (const c of COLLECTIONS) {
        try { out[c] = await store().list(c); }
        catch (e) { console.warn('[DB] all() 跳过集合', c, (e && e.message) || e); out[c] = []; }
      }
      return out;
    },
    async clearAll() {
      for (const c of COLLECTIONS) {
        const items = await store().list(c);
        for (const it of items) await store().remove(c, it.id);
      }
      emit();
    },
  };

  global.DB = DB;
})(window);
