/* ===== Memory 系统 Module ===== */
import { showToast } from '../utils.js';

export const EMBED_DIM = 128;

export function memMaxLocal() {
  const s = localStorage.getItem('mem_max_local');
  if (s === null || s === '') return 0;
  const v = parseInt(s);
  return isNaN(v) ? 10000 : v;
}
export function memMaxRemote() {
  const s = localStorage.getItem('mem_max_remote');
  if (s === null || s === '') return 0;
  const v = parseInt(s);
  return isNaN(v) ? 5000 : v;
}
export function currentMemMax() {
  return (localStorage.getItem('embed_mode') || 'local') === 'remote' ? memMaxRemote() : memMaxLocal();
}

export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export function ragEnabled() { return localStorage.getItem('rag_enabled') !== 'false'; }
export function ragTopK() { return parseInt(localStorage.getItem('rag_topk') || '3'); }
export function ragThreshold() { return parseFloat(localStorage.getItem('rag_threshold') || '0.25'); }
export function forgetLambda() { const v = parseFloat(localStorage.getItem('forget_lambda')); return isNaN(v) ? 0.05 : v; }

export function dayBucket(ts) { return Math.floor((ts || Date.now()) / (24 * 3600 * 1000)); }

export function extractTopicTags(content) {
  if (!content) return [];
  const tags = new Set();
  const text = content.toLowerCase();
  // 日常
  if (/吃|喝|饭|菜|美食|早餐|午餐|晚餐|外卖/.test(text)) tags.add('日常杂记');
  if (/睡|醒|起床|熬夜|困|梦/.test(text)) tags.add('日常杂记');
  if (/工作|上班|加班|项目|会议|老板|同事/.test(text)) tags.add('工作');
  if (/累|疲|撑不住|病|痛苦|绝望|难受/.test(text)) tags.add('情绪低落');
  if (/开心|高兴|太棒了|哈哈|爱|期待|喜欢/.test(text)) tags.add('开心');
  if (/难过|伤心|哭|委屈|遗憾|失落/.test(text)) tags.add('情绪低落');
  if (/家|回家|妈妈|爸爸|家人/.test(text)) tags.add('家庭');
  if (/朋友|闺蜜|兄弟|约/.test(text)) tags.add('社交');
  if (/学习|考试|看书|课程|老师/.test(text)) tags.add('学习');
  if (/旅行|旅游|出门|机票|酒店/.test(text)) tags.add('旅行');
  if (/钱|工资|花费|省钱|贵|便宜/.test(text)) tags.add('财务');
  return Array.from(tags);
}

export function formatTimeWindow(ts) {
  const h = new Date(ts || Date.now()).getHours();
  if (h < 6) return '深夜';
  if (h < 9) return '清晨';
  if (h < 12) return '上午';
  if (h < 14) return '中午';
  if (h < 18) return '下午';
  if (h < 22) return '晚上';
  return '深夜';
}

export function formatRecall(items) {
  if (!items || !items.length) return '';
  const main = items.filter(i => !i.assoc), rel = items.filter(i => i.assoc);
  const fmt = items =>
    items.map(i => {
      const emoji = { happy: '😊', sad: '😢', excited: '⚡', love: '💖', angry: '😤', gentle: '🌸', calm: '🍃', tired: '🥱', anxious: '😟', thinking: '💭' };
      const e = emoji[i.emotion] || '';
      const simPct = i.sim ? Math.round(i.sim * 100) + '%' : '';
      return `· ${e || ''}${i.text || ''}${simPct ? ' (匹配度' + simPct + ')' : ''}`;
    }).join('\n');
  let out = '';
  if (main.length) out += '【相关记忆】\n' + fmt(main);
  if (rel.length) out += '\n【关联扩散】\n' + fmt(rel);
  return out;
}

export default {
  memMaxLocal, memMaxRemote, currentMemMax,
  cosine, ragEnabled, ragTopK, ragThreshold, forgetLambda,
  dayBucket, extractTopicTags, formatTimeWindow, formatRecall,
};
