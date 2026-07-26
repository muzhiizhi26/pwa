/* ===== 通用工具 (Module) ===== */

/* 文本清洗 */
export function stripForSpeech(text) {
  if (text == null) return '';
  let s = String(text), prev;
  do { prev = s; s = s.replace(/（[^（）]*）/g, '').replace(/\([^()]*\)/g, ''); } while (s !== prev);
  return s.replace(/[ \t]{2,}/g, ' ').replace(/\s+([，。！？、；：])/g, '$1').trim();
}

/* Wake Lock + 音频上下文 */
export let wakeLock = null, keepAliveOsc = null, unlockedAudio = null, audioCtx = null;

export async function requestWakeLock() {
  try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => {}); } }
  catch (e) { console.warn('[WakeLock] request failed:', e); }
}
export async function releaseWakeLock() {
  try { if (wakeLock) { await wakeLock.release(); wakeLock = null; } }
  catch (e) { console.warn('[WakeLock] release failed:', e); }
}
export function startKeepAlive() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (keepAliveOsc) return;
    keepAliveOsc = audioCtx.createOscillator();
    const g = audioCtx.createGain(); g.gain.value = 0.0001;
    keepAliveOsc.connect(g); g.connect(audioCtx.destination);
    keepAliveOsc.start();
  } catch (e) { console.warn('[KeepAlive] start failed:', e); }
}
export function stopKeepAlive() {
  try { if (keepAliveOsc) { keepAliveOsc.stop(); keepAliveOsc.disconnect(); keepAliveOsc = null; } }
  catch (e) { console.warn('[KeepAlive] stop failed:', e); }
}
export function unlockAudioOnGesture() {
  try {
    if (!unlockedAudio) { unlockedAudio = new Audio(); unlockedAudio.setAttribute('playsinline', ''); }
    unlockedAudio.src = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQxAAAAAAAAAAAAAAAAAAAAAAAW2luZwAAAA8AAAACAAACcQCA';
    const pr = unlockedAudio.play(); if (pr && pr.catch) pr.catch(() => {});
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { console.warn('[Audio] unlockAudioOnGesture failed:', e); }
}

export function getContextLimit() {
  const v = localStorage.getItem('context_limit');
  if (v == null) return 12;
  if (v === 'unlimited') return Infinity;
  const n = parseInt(v);
  return isNaN(n) ? 12 : n;
}
export function ctxSlice(arr) {
  const l = getContextLimit();
  if (l === Infinity) return arr.slice();
  if (l <= 0) return [];
  return arr.slice(-l);
}

export function streamEnabled() { return localStorage.getItem('stream_output') !== 'false'; }
export function showThinkingEnabled() { return localStorage.getItem('show_thinking') !== 'false'; }
export function autoSpeakEnabled() { return localStorage.getItem('auto_speak') === 'true'; }
export function voiceEnabled() { return localStorage.getItem('voice_enabled') === 'true'; }
export function autoBackupEnabled() { return localStorage.getItem('auto_backup') === 'true'; }
export function webSearchEnabled() { return localStorage.getItem('web_search') === 'true'; }
export function imgEnabled() { return localStorage.getItem('img_enabled') === 'true'; }

export function genUid() { return 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
export function nowTime(ts) { return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
export function scrollBottom() { const c = document.getElementById('chatMessages'); if (c) c.scrollTop = c.scrollHeight; }

export function showToast(msg) {
  try {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._hide); t._hide = setTimeout(() => t.classList.remove('show'), 2000);
  } catch (e) {}
}

// 模块内部用，不覆盖 window——旧脚本已提供全局函数
export {};
