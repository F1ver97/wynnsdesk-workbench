/* =====================================================================
 *  ai.js —— AI 接入层：自定义 Gemini 接口（Cloudflare Worker 代理）
 *  接口约定：
 *    请求：POST JSON { "message": "用户输入的文本内容" }
 *    响应：JSON { "reply": "AI回复内容", "status": "success" }
 * ===================================================================== */
(function (global) {
  'use strict';

  // ★ 你的自定义 Gemini 接口地址（Cloudflare Worker）
  const AI_PROXY_URL = "https://wynnsdesk.1249501093.workers.dev";

  /**
   * 全局异步 AI 调用函数
   * @param {string} promptText  提示词 / 指令文本
   * @param {object} [opts]      可选：{ timeout, files: [{name, mime, dataUrl}] }
   *   files 中 dataUrl 为完整 base64 data URI（含前缀），支持图片/Word/Excel/PDF/视频等
   * @returns {Promise<string>}  AI 回复文本
   */
  async function askGeminiAI(promptText, opts) {
    opts = opts || {};
    if (!AI_PROXY_URL || /^YOUR_/i.test(AI_PROXY_URL)) {
      throw new Error('AI 接口尚未配置：请编辑 assets/js/ai.js，将顶部 AI_PROXY_URL 替换为你的接口地址');
    }
    // 自定义接口要求 { "message": "...", "files": [...] } 作为请求体
    const payload = {
      message: String(promptText || ''),
      files: Array.isArray(opts.files) ? opts.files.map(f => ({
        name: f.name || 'file',
        mime: f.mime || (f.dataUrl || '').split(';')[0].replace('data:', '') || 'application/octet-stream',
        data: (f.dataUrl || '').indexOf(',') >= 0 ? f.dataUrl.split(',')[1] : (f.dataUrl || '')
      })) : []
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 180000);
    try {
      const res = await fetch(AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
        mode: 'cors',
      });
      if (!res.ok) throw new Error('AI 接口返回 HTTP ' + res.status);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let data;
      if (ct.indexOf('json') >= 0) data = await res.json();
      else data = { reply: (await res.text()).trim() };
      // 优先取 reply 字段；兼容 text / result / message 兜底
      const out = (data.reply || data.text || data.result || data.message || '').toString().trim();
      if (!out) throw new Error('AI 接口返回了空内容');
      return out;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('AI 请求超时，请稍后重试');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 从 AI 回复中提取 JSON（容忍 ```json 代码块与前后缀文字） */
  function aiExtractJSON(text) {
    const s = String(text || '');
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fence ? fence[1] : s;
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('AI 未返回可解析的数据，请重试或换个描述');
    return JSON.parse(raw.slice(a, b + 1));
  }

  global.askGeminiAI = askGeminiAI;
  global.aiExtractJSON = aiExtractJSON;
  global.AI_PROXY_CONFIGURED = function () { return AI_PROXY_URL && !/^YOUR_/i.test(AI_PROXY_URL); };
})(window);
