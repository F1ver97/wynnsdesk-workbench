/* =====================================================================
 *  supabase-config.js —— 云端存储配置
 *  把工作台连接到 Supabase，实现多端同步 + 不再依赖临时页面。
 *  ⚠️ 安全提示：anon key 暴露在前端，当前表策略为 allow_all（临时调试）。
 *     正式长期使用前，请改为按 user_id 隔离或开启登录（见 README）。
 * ===================================================================== */
(function (global) {
  'use strict';
  global.SUPABASE_CONFIG = {
    // Supabase 项目原始地址
    url: 'https://jpafgmwrdywlvpmbvztb.supabase.co',
    // ★ 反向代理地址（可选）：当部分地区直连 supabase.co 出现 Failed to fetch 时，
    //   在 Cloudflare 新建一个【独立】Worker，粘贴项目根目录的
    //   cloudflare-worker-supabase-proxy.js 并部署，然后把 proxyUrl 改成该 Worker
    //   的【根域名】（不带路径），例如：
    //     https://wynnsdesk-sb.1249501093.workers.dev
    //   填好后前端所有 Supabase 请求（含登录）都走 Worker，无需再开 VPN。
    proxyUrl: 'https://wynnsdesk-workbench.pages.dev/api/supabase',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwYWZnbXdyZHl3bHZwbWJ2enRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NTM2NTMsImV4cCI6MjEwMzAyOTY1M30.7tZmLd27od59BDJLP3pnDShy1JuQGgeDuHNf7T9XHEA',
    // 是否启用云端（改 false 可切回本地 IndexedDB）
    enabled: true,
    // 是否启用登录（Supabase Auth）。开启后未登录者看不到工作台。
    authRequired: true,
    // 管理员邮箱白名单：这些账号登录后拥有最高权限（管理后台/账号/云端数据）。
    // 把你的邮箱加进数组即可，多个用逗号分隔。
    adminEmails: ['1249501093@qq.com'],
    // 邀请注册：管理员在工作台生成邀请链接，同事点开自助设密码注册（无需 service_role）。
    invite: { enabled: true, baseUrl: location.origin + location.pathname },
  };
})(window);
