/* ===== 语音 Module：TTS / STT / 按住录音 ===== */
import { stripForSpeech, unlockAudioOnGesture, voiceEnabled, autoSpeakEnabled, showToast } from '../utils.js';

export function voiceKey() { return (localStorage.getItem('voice_key') || '').trim(); }
export function voiceForRole(role) { return role === 'user' ? (localStorage.getItem('tts_voice_user') || '') : (localStorage.getItem('tts_voice_ai') || ''); }

export function renderAutoSpeakToggle() {
  const b = document.getElementById('autoSpeakToggleBtn');
  if (!b) return;
  const on = autoSpeakEnabled();
  b.title = on ? '自动朗读 AI 回复：已开启' : '自动朗读 AI 回复：已关闭';
  b.classList.toggle('voice-off', !on);
  const icon = b.querySelector('span');
  if (icon) icon.textContent = on ? '🔈' : '🔕';
  const label = b.querySelector('b');
  if (label) label.textContent = '自动朗读';
}
export function setAutoSpeak(on) { localStorage.setItem('auto_speak', on ? 'true' : 'false'); renderAutoSpeakToggle(); }
export function toggleAutoSpeakFromHeader() { setAutoSpeak(!autoSpeakEnabled()); showToast(autoSpeakEnabled() ? '🔈 自动朗读 AI 回复已开启' : '🔕 自动朗读 AI 回复已关闭'); }
export function renderVoiceToggle() {
  const b = document.getElementById('voiceToggleBtn');
  if (voiceEnabled()) { b.textContent = '🔊'; b.classList.remove('voice-off'); }
  else { b.textContent = '🔇'; b.classList.add('voice-off'); }
  renderAutoSpeakToggle();
}
export function toggleVoiceMaster() {
  localStorage.setItem('voice_enabled', voiceEnabled() ? 'false' : 'true');
  renderVoiceToggle();
  showToast(voiceEnabled() ? '🔊 语音已开启' : '🔇 语音已关闭');
}
export function setVoiceMaster(on) { localStorage.setItem('voice_enabled', on ? 'true' : 'false'); renderVoiceToggle(); }

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mpeg'];
  for (const t of types) { if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; }
  return '';
}
export function extForMime(mime) {
  if (!mime) return 'm4a';
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('webm')) return 'webm';
  return 'm4a';
}

/* PTT */
export let mediaRecorder = null, recChunks = [], recording = false, pttActive = false, pttStart = 0;
export let audioStream = null;
export let pttRecordCount = 0;
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export async function ensureAudioStream() {
  if (isSafari && pttRecordCount > 0 && pttRecordCount % 5 === 0 && audioStream) {
    try { audioStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    audioStream = null;
  }
  if (audioStream) {
    const tracks = audioStream.getAudioTracks();
    if (tracks.length > 0 && tracks.every(t => t.readyState === 'ended')) {
      try { audioStream.getTracks().forEach(t => t.stop()); } catch (e) {}
      audioStream = null;
    } else {
      return audioStream;
    }
  }
  audioStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  return audioStream;
}

export async function startPTT(isGroup = false) {
  if (pttActive) return;
  if (!voiceEnabled()) { showToast('🔇 语音已关闭，请先开启'); return; }
  if (!navigator.mediaDevices?.getUserMedia) { alert('当前环境不支持录音（需 HTTPS）'); return; }
  unlockAudioOnGesture();
  try {
    const stream = await ensureAudioStream();
    const mime = pickMimeType();
    mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const micBtn = isGroup ? document.getElementById('groupHoldToTalkBtn') : document.getElementById('holdToTalkBtn');
      if (micBtn) micBtn.classList.remove('recording');
      const dur = Date.now() - pttStart;
      const mimeType = mediaRecorder.mimeType || mime || 'audio/webm';
      const blob = new Blob(recChunks, { type: mimeType });
      if (dur < 300 || blob.size < 1500) { showToast('录音太短'); return; }
      showToast('🎤 发送语音中...');
      const base64Data = await new Promise(resolve => {
        try {
          const reader = new FileReader();
          reader.onloadend = () => { const d = reader.result || ''; resolve(d.includes(',') ? d.split(',')[1] : ''); };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        } catch (e) { console.warn('[PTT] FileReader failed:', e); resolve(''); }
      });
      let transcript = '';
      try { transcript = await sttTranscribe(blob); } catch (e) { console.warn('[PTT] STT skipped:', e); }
      const durSec = Math.max(1, Math.round(dur / 1000));
      const displayText = transcript ? transcript.trim() : '语音消息';
      if (isGroup) {
        if (typeof window.sendGroupAudioMessage === 'function') window.sendGroupAudioMessage(displayText, base64Data, mimeType, transcript, durSec);
      } else {
        if (typeof window.sendAudioMessage === 'function') window.sendAudioMessage(displayText, base64Data, mimeType, transcript, durSec);
      }
    };
    mediaRecorder.start();
    recording = true; pttActive = true; pttStart = Date.now(); pttRecordCount++;
    const micBtn = isGroup ? document.getElementById('groupHoldToTalkBtn') : document.getElementById('holdToTalkBtn');
    if (micBtn) micBtn.classList.add('recording');
    showToast('🎤 松开发送');
  } catch (e) {
    if (audioStream) { try { audioStream.getTracks().forEach(t => t.stop()); } catch (se) {} }
    audioStream = null;
    alert('无法访问麦克风：' + e.message);
    pttActive = false;
  }
}

export function endPTT() {
  if (!pttActive) return;
  pttActive = false; recording = false;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch (e) { console.warn('[PTT] stop failed:', e); } }
}

// window 上的函数由本模块提供（全量迁移后旧 script 将被移除）
export async function fetchVoiceList() {
  const keyInput = document.getElementById('voiceKey')?.value;
  const key = (keyInput !== undefined ? keyInput.trim() : voiceKey());
  if (!key) { alert('请先填入 API Key'); return; }
  const r = await fetch(window.VOICE_LIST_URL, { headers: { 'Authorization': `Bearer ${key}` } });
  if (!r.ok) throw new Error('获取失败 ' + r.status);
  const d = await r.json(); const list = (d.result || d.data || d.voices || []).map(v => v.uri || v.id || v.name || v).filter(Boolean);
  localStorage.setItem('voice_list', JSON.stringify(list)); localStorage.setItem('voice_key', key);
  showToast(`✅ 获取 ${list.length} 个音色`); if (typeof window.renderVoiceSettings === 'function') window.renderVoiceSettings();
}
export async function ttsSpeak(text, voice) {
  const key = voiceKey();
  if (!key) { showToast('请先在语音设置填入 API Key'); return null; }
  const spoken = stripForSpeech(text); if (!spoken) return null;
  const body = { model: localStorage.getItem('tts_model') || (Array.isArray(window.getTtsModels) ? window.getTtsModels()[0] : 'tts-1'), input: spoken, response_format: 'mp3' };
  const v = voice || localStorage.getItem('tts_voice_ai'); if (v) body.voice = v;
  const r = await fetch((typeof window.getTtsUrl === 'function' ? window.getTtsUrl() : '/v1/audio/speech'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('TTS ' + r.status); return await r.blob();
}
export async function playTTS(text, voice) {
  if (!voiceEnabled()) { showToast('🔇 语音已关闭'); return; }
  try {
    const blob = await ttsSpeak(text, voice); if (!blob) return;
    const ua = window.unlockedAudio || (() => { const a = new Audio(); a.setAttribute('playsinline', ''); window.unlockedAudio = a; return a; })();
    if (ua.src && ua.src.startsWith('blob:')) { const oldUrl = ua.src; ua.src = ''; try { URL.revokeObjectURL(oldUrl); } catch (e) {} }
    ua.onended = null; ua.onerror = null;
    if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
    const objUrl = URL.createObjectURL(blob); ua.src = objUrl;
    ua.onended = () => { ua.onended = null; ua.onerror = null; try { URL.revokeObjectURL(objUrl); } catch (e) {} };
    ua.onerror = () => { ua.onended = null; ua.onerror = null; try { URL.revokeObjectURL(objUrl); } catch (e) {} };
    const pr = ua.play(); if (pr && pr.catch) { const ok = await pr.then(() => true).catch(() => { showToast('点击屏幕后可播放'); return false; }); if (!ok) return; }
  } catch (e) { showToast('朗读失败：' + e.message); }
}
export async function testTTS() {
  localStorage.setItem('voice_key', document.getElementById('voiceKey').value);
  localStorage.setItem('tts_url', document.getElementById('ttsUrl').value);
  localStorage.setItem('tts_voice_ai', document.getElementById('voiceAi').value);
  localStorage.setItem('tts_voice_user', document.getElementById('voiceUser').value);
  if (!voiceEnabled()) { showToast('🔇 请先打开语音总开关'); return; }
  unlockAudioOnGesture();
  await playTTS('你好，这是 AI 音色测试。（这句括号内容不会被朗读）', document.getElementById('voiceAi').value);
}
export async function sttTranscribe(blob) {
  const key = voiceKey(); if (!key) return '';
  const ext = extForMime(blob.type);
  const fd = new FormData();
  fd.append('model', localStorage.getItem('stt_model') || 'FunAudioLLM/SenseVoiceSmall');
  fd.append('file', blob, 'audio.' + ext);
  const headers = {}; if (key) headers['Authorization'] = `Bearer ${key}`;
  const r = await fetch(window.STT_URL, { method: 'POST', headers, body: fd });
  if (!r.ok) throw new Error('STT ' + r.status);
  const d = await r.json(); return d.text || '';
}

export {};

// 导出到 window（全量迁移后供 onclick 使用）
const voiceWindow = {
  voiceKey, voiceForRole, renderAutoSpeakToggle, setAutoSpeak, toggleAutoSpeakFromHeader,
  renderVoiceToggle, toggleVoiceMaster, setVoiceMaster, pickMimeType, extForMime,
  fetchVoiceList, ttsSpeak, playTTS, testTTS, sttTranscribe,
  ensureAudioStream, startPTT, endPTT
};
if (typeof window !== 'undefined') Object.assign(window, voiceWindow);
