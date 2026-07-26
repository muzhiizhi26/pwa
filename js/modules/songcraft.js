/* ===== 歌曲创作 Module ===== */
import { showToast, genUid } from '../utils.js';

export function songEnabled() { return localStorage.getItem('song_enabled') === 'true'; }
export function songProxy() { return (localStorage.getItem('song_proxy') || '').replace(/\/+$/, ''); }
export function songKey() { return (localStorage.getItem('song_key') || '').trim(); }
export function songModel() { return localStorage.getItem('song_model') || 'music-2.6'; }

export let lastLyrics = '';

export function openSongCraft() {
  document.getElementById('songPanel').classList.add('show');
  const ta = document.getElementById('songLyrics');
  if (ta) ta.value = lastLyrics;
}
export function closeSongCraft() {
  document.getElementById('songPanel').classList.remove('show');
  if (window.launchedFromLauncher) {
    window.launchedFromLauncher = false;
    if (typeof window.showLauncher === 'function') window.showLauncher();
  }
}

export async function aiWriteLyrics() {
  const theme = document.getElementById('songTheme').value.trim();
  if (!theme) { showToast('先填主题/要求'); return; }
  showToast('✍️ AI 正在写词...');
  const cur = document.getElementById('songLyrics').value.trim();
  const sys = '你是专业作词人。请根据用户要求创作中文歌词，结构包含[主歌][副歌]等段落标签，语言优美有画面感，押韵自然。只输出歌词本身。';
  const userMsg = cur ? `现有歌词：\n${cur}\n\n修改要求：${theme}` : `创作要求：${theme}`;
  try {
    const out = await window.llmComplete([{ role: 'system', content: sys }, { role: 'user', content: userMsg }], { temperature: 0.85 });
    if (out) { document.getElementById('songLyrics').value = out; lastLyrics = out; showToast('✅ 歌词已生成'); }
  } catch (e) { showToast('写词失败：' + e.message); }
}

export async function generateSong() {
  const lyrics = document.getElementById('songLyrics').value.trim();
  if (!lyrics) { showToast('请先写歌词'); return; }
  lastLyrics = lyrics;
  const style = document.getElementById('songStyle').value.trim() || '流行 温暖 抒情';
  const proxy = songProxy();
  if (!proxy) {
    showToast('未配置音乐生成代理，仅保存歌词');
    if (window.addMessage) window.addMessage('assistant', '🎵 已生成歌词（未配置生成代理，无法出旋律）：\n\n' + lyrics, genUid());
    closeSongCraft(); return;
  }
  const btn = document.getElementById('songGenBtn');
  if (btn) { btn.disabled = true; btn.textContent = '提交中...'; }
  showToast('🎧 任务已提交，等待生成...');
  try {
    const submitController = new AbortController();
    const submitTimeout = setTimeout(() => submitController.abort(), 30000);
    let resp = await fetch(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lyrics, style, key: songKey(), model: songModel() }), signal: submitController.signal });
    clearTimeout(submitTimeout);
    let data = await resp.json();
    let attempts = 0;
    while (data.pending && attempts < 200) {
      await new Promise(r => setTimeout(r, 3000));
      const pollController = new AbortController();
      const pollTimeout = setTimeout(() => pollController.abort(), 15000);
      resp = await fetch(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lyrics, style, key: songKey(), model: songModel(), taskId: data.taskId }), signal: pollController.signal });
      clearTimeout(pollTimeout);
      data = await resp.json();
      attempts++;
    }
    if (data.pending) throw new Error('生成超时');
    if (data.error) throw new Error(data.error);
    let audioUrl = data.audio_url || data.url || (data.data && (data.data.audio_url || data.data.audio));
    if (!audioUrl && data.audio) audioUrl = data.audio.startsWith('data:') ? data.audio : ('data:audio/mp3;base64,' + data.audio);
    if (!audioUrl) throw new Error('代理未返回音频');
    closeSongCraft();
    if (window.addMessage) window.addMessage('assistant', '🎵 我们的原创歌曲完成啦！歌词：\n\n' + lyrics, genUid());
    showToast('✅ 生成完成');
  } catch (e) {
    showToast('生成失败：' + e.message);
    if (window.addMessage) window.addMessage('assistant', '❌ 旋律生成失败：' + e.message + '\n\n歌词已保留：\n' + lyrics, genUid());
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🎼 生成旋律'; }
  }
}

// 导出到 window
if (typeof window !== 'undefined') {
  Object.assign(window, {
    songEnabled, songProxy, songKey, songModel,
    openSongCraft, closeSongCraft, aiWriteLyrics, generateSong,
    songInstruction: () => songEnabled() ? '\n【歌曲创作能力】用户想创作歌曲时，你可以帮忙写歌词、改词、定曲风。写好后提示用户点击「＋ → 创作歌曲」用 AI 作曲。' : '',
  });
}

export default { songEnabled, openSongCraft, closeSongCraft, aiWriteLyrics, generateSong };
