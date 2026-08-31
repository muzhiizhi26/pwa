/**
 * Cloudflare Worker：Bark 推送中转（AI 主动消息 → Bark → APNs → iPhone → 华为手环）
 *
 * 部署方式：
 *   1. 登录 Cloudflare Dashboard → Workers & Pages → 创建 Worker
 *   2. 把本文件内容粘贴到 Worker 代码编辑器
 *   3. 部署，得到 Worker URL，如 https://your-relay.workers.dev
 *   4. 在 PWA 设置面板的「Bark 推送」填 Worker URL（可选）与 Bark Key
 *
 * 调用方式（PWA 侧）：
 *   GET https://your-relay.workers.dev/?key=你的BarkKey&title=标题&body=内容
 *   或 POST JSON: { key, title, body }
 *
 * 说明：
 *   - Cloudflare Worker 是"出站请求方"，主动访问 api.day.app（Bark 官方接口），
 *     不会被拦截；Bark 无 IP 风控（与网易云的封锁不同）。
 *   - 用 Worker 中转的好处：统一入口、Bark Key 不暴露在前端代码里
 *     （key 存 Worker 环境变量 BARK_KEY 时，前端可不传 key）。
 */

// 可选：把 Bark Key 写死在 Worker 环境变量（更安全），前端调用时就不必传 key
// 在 Worker 设置 → 变量 中添加：BARK_KEY = 你的BarkKey
const ENV_BARK_KEY = typeof BARK_KEY !== 'undefined' ? BARK_KEY : '';

const BARK_API = 'https://api.day.app';

export default {
  async fetch(request, env, ctx) {
    // 跨域允许（PWA 前端调用）
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    let key, title = '', body = '';
    try {
      if (request.method === 'POST') {
        const data = await request.json();
        key = data.key || ENV_BARK_KEY || '';
        title = data.title || '';
        body = data.body || '';
      } else {
        const url = new URL(request.url);
        key = url.searchParams.get('key') || ENV_BARK_KEY || '';
        title = url.searchParams.get('title') || '';
        body = url.searchParams.get('body') || '';
      }
    } catch (e) {
      return new Response(JSON.stringify({ code: 400, message: '参数解析失败' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!key) {
      return new Response(JSON.stringify({ code: 400, message: '缺少 Bark Key（?key= 或环境变量 BARK_KEY）' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 转发到 Bark 官方接口（Bark 是"推送发送方"，无 IP 风控）
    const barkUrl = `${BARK_API}/${encodeURIComponent(key)}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
    try {
      const resp = await fetch(barkUrl, { method: 'GET' });
      const data = await resp.json().catch(() => ({}));
      return new Response(JSON.stringify(data), {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ code: 500, message: 'Bark API 请求失败: ' + e.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },
};
