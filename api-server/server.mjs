/* ===== 本地网易云音乐 API 代理服务 =====
 * 在本地运行，PWA 通过局域网连接使用
 */

const PRESET = '0CoJUm6Qyw8W8jud';
const IV = '0102030405060708';
const PUBKEY = '010001';
const MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';

import { createServer } from 'http';
import { networkInterfaces } from 'os';

function getIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

const PORT = 3456;

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const sp = url.searchParams;

  if (path.endsWith('/proxy')) {
    const u = sp.get('u'); if (!u) return json(res, { error: 'missing u' }, 400);
    const real = decodeURIComponent(u).replace(/^http:/, 'https:');
    try {
      const up = await fetch(real, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' } });
      const buf = Buffer.from(await up.arrayBuffer());
      res.setHeader('Content-Type', up.headers.get('content-type') || 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(buf);
    } catch { return json(res, { error: 'proxy failed' }, 502); }
    return;
  }

  if (path.endsWith('/cloudsearch') || path.endsWith('/search')) {
    const kw = sp.get('keywords') || '';
    if (!kw) return json(res, { result: { songs: [] } });
    try {
      const r = await fetch('https://music.163.com/api/search/pc?s=' + encodeURIComponent(kw) + '&type=1&limit=10&offset=0', {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' }
      });
      if (!r.ok) throw new Error('search failed');
      const d = await r.json();
      const songs = (d.result && d.result.songs || []).map(s => ({ id: s.id, name: s.name, ar: (s.artists || []).map(a => ({ name: a.name })) }));
      return json(res, { result: { songs } });
    } catch (e) { return json(res, { result: { songs: [] }, error: e.message }); }
  }

  return json(res, { error: 'not found' }, 404);
}).listen(PORT, () => {
  console.log('🎵 网易云音乐 API 服务已启动');
  console.log('   地址: http://localhost:' + PORT);
  console.log('   局域网: http://' + getIP() + ':' + PORT);
});

function json(res, data, status = 200) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}
