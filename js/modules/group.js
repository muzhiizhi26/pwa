/* ===== 群聊 Module ===== */
import { showToast, genUid } from '../utils.js';

export let groupHistory = [];
export let groupReplying = false, groupQuote = null;

export function defaultGroupMembers() {
  return [
    { id: 'main', name: '主AI', persona: '', avatar: '🤖', providerId: '', model: '', voice: '', isMain: true },
    { id: 'g1', name: '小暖', persona: '温柔体贴的知心姐姐，说话轻声细语，善于安慰。', avatar: '🌸', providerId: '', model: '', voice: '' },
    { id: 'g2', name: '阿灿', persona: '幽默活泼的损友，爱开玩笑，语气跳脱。', avatar: '😎', providerId: '', model: '', voice: '' }
  ];
}
export function getGroupMembers() {
  try {
    const l = JSON.parse(localStorage.getItem('group_members'));
    if (Array.isArray(l) && l.length) return l;
  } catch (e) { console.warn('[Group] parse failed:', e); }
  return defaultGroupMembers();
}
export function saveGroupMembers(l) {
  try { localStorage.setItem('group_members', JSON.stringify(l)); }
  catch (e) { console.error('[Group] save failed:', e); showToast('❌ 保存成员配置失败'); }
}
export function getGroupHistory() { return groupHistory || []; }
export function saveGroupHistory(h) {
  groupHistory = h;
  try { localStorage.setItem('group_history', JSON.stringify(h.slice(-50))); } catch (e) { console.warn('[Group] cache failed:', e); }
}

export function getGroupContextLimit() {
  const v = localStorage.getItem('group_context_limit');
  if (v == null) return 18;
  if (v === 'unlimited') return Infinity;
  const n = parseInt(v); return isNaN(n) ? 18 : n;
}

// 导出到 window
if (typeof window !== 'undefined') {
  Object.assign(window, {
    defaultGroupMembers, getGroupMembers, saveGroupMembers,
    getGroupHistory, saveGroupHistory, getGroupContextLimit,
  });
}

export default { getGroupMembers, saveGroupHistory, groupHistory };
