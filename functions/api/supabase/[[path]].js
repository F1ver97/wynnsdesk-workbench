/* Supabase 反向代理：挂在 wynnsdesk-workbench.pages.dev/api/supabase 下，
   浏览器访问 pages.dev（国内可达），由 Cloudflare 边缘后端去请求 supabase.co，
   绕开直连 supabase.co / workers.dev 的网络限制。 */
const SUPABASE_URL = 'https://jpafgmwrdywlvpmbvztb.supabase.co';
const PREFIX = '/api/supabase';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version, range, prefer',
    'Access-Control-Expose-Headers': 'content-range, content-length, x-supabase-api-version',
  };
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  // 直接用 URL 路径切前缀重构目标，不依赖 params（catch-all 返回的是数组）
  let path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname;
  if (!path.startsWith('/')) path = '/' + path;
  const target = SUPABASE_URL + path + url.search;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const headers = new Headers(request.headers);
  headers.delete('host');

  try {
    const resp = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    const out = new Headers(resp.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => out.set(k, v));
    out.set('Cache-Control', 'no-store');
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: out,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Proxy error: ' + e.message }), {
      status: 502,
      headers: Object.assign({ 'content-type': 'application/json' }, corsHeaders()),
    });
  }
}
