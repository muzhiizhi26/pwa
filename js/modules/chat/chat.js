/* ===== 聊天核心 Module =====
 * 封装关键聊天函数，全量迁移后取代旧 script
 * 注意：conversationHistory 使用 window 上的全局数组（旧代码维护），模块不持有自己的一份
 */

import { showToast, genUid, scrollBottom, ctxSlice, voiceEnabled, autoSpeakEnabled } from '../utils.js';

function getHistory() { return window.conversationHistory || []; }

/* 全局状态（模块内部） */
export let selectMode = false;
export let selectedUids = new Set();
export let searchMatches = [], searchIdx = -1;

/* 历史持久化 */
export function currentPrivateAiId() { return localStorage.getItem('current_private_ai') || 'main'; }
export function saveHistory() {
  const history = getHistory();
  const id = currentPrivateAiId();
  const key = id === 'main' ? 'chatHistory' : `chatHistory_${id}`;
  const cleanHistory = history.map(m => {
    if (m.audio) { const { base64, ...lightAudio } = m.audio; return { ...m, audio: lightAudio }; }
    return m;
  });
  try {
    localStorage.setItem(key, JSON.stringify(cleanHistory.slice(-200)));
    if (typeof HistoryBackupDB !== 'undefined') HistoryBackupDB.set(key, cleanHistory);
  } catch (e) {
    console.warn('[SaveHistory] localStorage overflow:', e.name);
    if (history.length > 10 && !window._savingHistoryRetry) {
      window._savingHistoryRetry = true;
      history.splice(0, Math.ceil(history.length * 0.3));
      saveHistory();
      window._savingHistoryRetry = false;
    } else if (typeof HistoryBackupDB !== 'undefined') {
      try { HistoryBackupDB.set(key, cleanHistory.slice(-200)); } catch (ee) {}
    }
  }
}
export function loadHistory() {
  const id = currentPrivateAiId();
  const key = id === 'main' ? 'chatHistory' : `chatHistory_${id}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) { window.conversationHistory = JSON.parse(raw) || []; return; }
  } catch (e) { window.conversationHistory = []; }
  if (typeof HistoryBackupDB !== 'undefined') {
    HistoryBackupDB.get(key).then(d => { if (d && Array.isArray(d)) window.conversationHistory = d; }).catch(() => {});
  }
}
export function getMsg(uid) { return getHistory().find(m => m.uid === uid); }
export function getMsgDiv(uid) { return document.querySelector(`.message[data-uid="${uid}"]`); }

/* 消息操作 */
export function msgCopy(uid) { const m = getMsg(uid); if (m) navigator.clipboard.writeText(m.content).then(() => showToast('✅ 已复制')); }
export function msgSpeak(uid) {
  if (!voiceEnabled()) { showToast('🔇 语音已关闭，请先点顶部🔊开启'); return; }
  const m = getMsg(uid); if (!m) return;
  const ua = window.unlockedAudio || (() => { const a = new Audio(); a.setAttribute('playsinline', ''); window.unlockedAudio = a; return a; })();
  if (window.unlockAudioOnGesture) window.unlockAudioOnGesture();
  showToast('🔊 朗读中...');
  const voice = window.getActiveTtsVoice ? window.getActiveTtsVoice() : '';
  if (window.playTTS) window.playTTS(m.content, voice).catch(e => showToast('朗读失败：' + e.message));
}
export function msgEdit(uid) {
  const m = getMsg(uid), div = getMsgDiv(uid); if (!m || !div) return;
  const b = document.createElement('div'); b.className = 'bubble editing'; b.contentEditable = 'true';
  b.innerText = m.content;
  div.innerHTML = ''; div.appendChild(b); b.focus();
  b.addEventListener('blur', () => {
    b.contentEditable = 'false'; m.content = b.innerText.trim() || m.content;
    saveHistory(); showToast('✅ 已修改');
  }, { once: true });
}
export function msgDelete(uid) {
  if (!confirm('删除该消息？')) return;
  const hist = getHistory();
  const idx = hist.findIndex(m => m.uid === uid);
  if (idx !== -1) { hist.splice(idx, 1); saveHistory(); }
  const d = getMsgDiv(uid); if (d) d.remove();
}

/* 多选 */
export function enterSelectMode() { selectMode = true; selectedUids.clear(); document.getElementById('chatMessages').classList.add('select-mode'); document.getElementById('selectBar').classList.add('show'); updateSelInfo(); }
export function exitSelectMode() { selectMode = false; selectedUids.clear(); document.getElementById('chatMessages').classList.remove('select-mode'); document.getElementById('selectBar').classList.remove('show'); document.querySelectorAll('.msg-check').forEach(c => c.checked = false); }
export function onCheck(uid, checked) { if (checked) selectedUids.add(uid); else selectedUids.delete(uid); updateSelInfo(); }
export function updateSelInfo() { const el = document.getElementById('selInfo'); if (el) el.textContent = '已选 ' + selectedUids.size + ' 条'; }
export function selectAllMsgs() { const all = document.querySelectorAll('.message[data-uid]'); const allSelected = selectedUids.size === all.length; selectedUids.clear(); document.querySelectorAll('.msg-check').forEach(c => { c.checked = !allSelected; if (!allSelected) selectedUids.add(c.closest('.message').dataset.uid); }); updateSelInfo(); }
export function copySelected() {
  if (!selectedUids.size) { showToast('未选择'); return; }
  const txt = getHistory().filter(m => selectedUids.has(m.uid)).map(m => `【${m.role === 'user' ? '我' : 'AI'}】${m.content}`).join('\n\n');
  navigator.clipboard.writeText(txt).then(() => showToast('✅ 已复制 ' + selectedUids.size + ' 条'));
}
export function deleteSelected() {
  if (!selectedUids.size) { showToast('未选择'); return; }
  if (!confirm(`删除选中的 ${selectedUids.size} 条消息？`)) return;
  const hist = getHistory();
  const remaining = hist.filter(m => !selectedUids.has(m.uid));
  hist.length = 0; hist.push(...remaining);
  selectedUids.forEach(uid => { const d = getMsgDiv(uid); if (d) d.remove(); });
  saveHistory(); exitSelectMode(); showToast('✅ 已删除');
}

/* 搜索 */
export function toggleSearch() {
  const b = document.getElementById('searchBar');
  b.classList.toggle('show');
  if (b.classList.contains('show')) document.getElementById('searchInput').focus();
  else clearSearch();
}
export function clearSearch() {
  document.getElementById('searchInput').value = '';
  searchMatches = []; searchIdx = -1;
  const nav = document.getElementById('searchNav'); if (nav) nav.textContent = '0/0';
  const list = document.getElementById('searchResults');
  if (list) { list.classList.remove('show'); list.innerHTML = ''; }
  document.querySelectorAll('.bubble').forEach(b => { if (b.dataset.raw !== undefined) { b.innerText = b.dataset.raw; delete b.dataset.raw; } b.classList.remove('hl-current'); });
}
export function runSearch() {
  const q = document.getElementById('searchInput').value.trim();
  document.querySelectorAll('.bubble').forEach(b => { if (b.dataset.raw !== undefined) { b.innerText = b.dataset.raw; delete b.dataset.raw; } b.classList.remove('hl-current'); });
  searchMatches = []; searchIdx = -1;
  const list = document.getElementById('searchResults');
  if (list) { list.innerHTML = ''; list.classList.remove('show'); }
  if (!q) { document.getElementById('searchNav').textContent = '0/0'; return; }
  const ql = q.toLowerCase();
  document.querySelectorAll('.chat-messages .bubble').forEach(b => {
    if (b.innerText.toLowerCase().includes(ql)) searchMatches.push(b);
  });
  if (searchMatches.length) { searchIdx = 0; searchStep(1); }
  document.getElementById('searchNav').textContent = searchMatches.length + '/' + searchMatches.length;
}
export function searchStep(dir) {
  searchMatches.forEach(b => b.classList.remove('hl-current'));
  if (!searchMatches.length) return;
  searchIdx = (searchIdx + dir + searchMatches.length) % searchMatches.length;
  const el = searchMatches[searchIdx];
  el.classList.add('hl-current'); el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  document.getElementById('searchNav').textContent = (searchIdx + 1) + '/' + searchMatches.length;
}

/* 备份 */
export function initAutoBackup() {
  if (!localStorage.getItem('auto_backup')) return;
  const t = (typeof getLocalDateString === 'function') ? getLocalDateString() : new Date().toLocaleDateString('sv-SE');
  if (localStorage.getItem('last_backup_date') !== t && getHistory().length > 0) setTimeout(performAutoBackup, 5000);
}
export function performAutoBackup() {
  if (!localStorage.getItem('auto_backup')) return;
  const t = (typeof getLocalDateString === 'function') ? getLocalDateString() : new Date().toLocaleDateString('sv-SE');
  if (localStorage.getItem('last_backup_date') === t || !getHistory().length) return;
  try {
    const b = new Blob(['\uFEFF' + generateBackupContent()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `AI备份_${t}.txt`; a.click();
    localStorage.setItem('last_backup_date', t); showToast('✅ 自动备份完成');
  } catch (e) {}
}
export function generateBackupContent() {
  const hist = getHistory();
  let c = `AI 聊天备份\n📅 ${new Date().toLocaleString('zh-CN')}\n💬 ${hist.length} 条\n\n`;
  hist.forEach(m => c += `【${m.role === 'user' ? '我' : 'AI'}】 ${m.ts ? new Date(m.ts).toLocaleString('zh-CN') : ''}\n${m.content}\n\n`);
  return c;
}
export function manualBackup() {
  if (!getHistory().length) { alert('暂无记录'); return; }
  const b = new Blob(['\uFEFF' + generateBackupContent()], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `AI备份_${Date.now()}.txt`; a.click();
  showToast('✅ 备份完成'); if (window.toggleActionMenu) window.toggleActionMenu();
}

// 导出到 window（全量迁移后供 onclick 使用）
// 注意：conversationHistory 不导出——由旧代码的全局变量维护
if (typeof window !== 'undefined') {
  Object.assign(window, {
    saveHistory, loadHistory, getMsg, getMsgDiv,
    msgCopy, msgSpeak, msgEdit, msgDelete,
    enterSelectMode, exitSelectMode, onCheck, updateSelInfo,
    selectAllMsgs, copySelected, deleteSelected,
    toggleSearch, clearSearch, runSearch, searchStep,
    initAutoBackup, performAutoBackup, generateBackupContent, manualBackup,
  });
}

export default { saveHistory, loadHistory };
