// Vercel Edge Function：网易云外链音频代理
// 部署后访问 https://你的vercel域名/api/song?id=歌曲ID
export const config = { runtime: 'edge' };

export default async function handler(req){
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if(!id) return new Response('missing id', { status: 400 });
  const target = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
  let up;
  try{
    up = await fetch(target, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' }
    });
  }catch(e){ return new Response('upstream error', { status: 502 }); }
  if(!up.ok || !up.body) return new Response('no audio', { status: 502 });
  const h = new Headers();
  h.set('Content-Type', up.headers.get('content-type') || 'audio/mpeg');
  h.set('Accept-Ranges', 'bytes');
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Cache-Control', 'public, max-age=3600');
  return new Response(up.body, { status: 200, headers: h });
}
