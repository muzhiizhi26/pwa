/* ===== Memory 核心 Module =====
 * 包含：VDB 封装、嵌入生成、记忆写入/召回、修剪、评估等
 */

import { cosine, extractTopicTags, formatTimeWindow, ragThreshold, forgetLambda, ragTopK, ragEnabled, currentMemMax } from './memory-utils.js';
import { showToast } from '../utils.js';

/* ── VDB 向量数据库封装 ── */
export const VDB = (() => {
  async function put(rec) {
    if (window.MemoryGraph) {
      const node = window.MemoryGraph.fromVDBRecord(rec);
      await window.MemoryGraph.addNode(node);
    }
  }
  async function del(id) {
    if (window.MemoryGraph) { try { await window.MemoryGraph.deleteNode(id); } catch (e) {} }
  }
  async function all() {
    if (window.MemoryGraph) {
      try { return await window.MemoryGraph.getAllNodes(); } catch (e) {}
    }
    return [];
  }
  async function get(id) {
    if (window.MemoryGraph) {
      try { return await window.MemoryGraph.getNode(id); } catch (e) {}
    }
    return null;
  }
  async function deleteBatch(ids) { for (const id of ids) await del(id); }
  return { put, del, all, get, deleteBatch };
})();

/* ── 嵌入生成 ── */
export const EMBED_DIM = 128;

export function localEmbed(text) {
  const v = new Float32Array(EMBED_DIM);
  const c = (text || '').toLowerCase().replace(/\s+/g, '');
  const g = [];
  for (let i = 0; i < c.length; i++) {
    g.push(c[i]);
    if (i < c.length - 1) g.push(c[i] + c[i + 1]);
  }
  for (const x of g) {
    let h = 2166136261;
    for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); }
    const idx = Math.abs(h) % EMBED_DIM;
    v[idx] += (h & 1) ? 1 : -1;
  }
  let n = 0; for (let i = 0; i < EMBED_DIM; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < EMBED_DIM; i++) v[i] /= n;
  return Array.from(v);
}

export async function remoteEmbed(text) {
  const url = (localStorage.getItem('embed_url') || '').trim();
  const key = (localStorage.getItem('embed_key') || '').trim();
  const model = (localStorage.getItem('embed_model') || 'text-embedding-3-small').trim();
  if (!url) throw new Error('未配置嵌入API');
  let u = url.replace(/\/+$/, '');
  if (!u.includes('/embeddings')) u += '/embeddings';
  const r = await fetch(u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Authorization': `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, input: text })
  });
  if (!r.ok) throw new Error('嵌入API错误');
  const d = await r.json();
  return d.data[0].embedding;
}

export async function embed(text) {
  const mode = localStorage.getItem('embed_mode') || 'local';
  if (mode === 'remote') {
    try {
      const vec = await remoteEmbed(text);
      if (vec && Array.isArray(vec)) { return vec; }
    } catch (e) {
      console.warn('[Embed] Remote failed, fallback to local:', e.message);
    }
  }
  return localEmbed(text);
}

/* ── 记忆评估 & 去重 ── */
export function evaluateMemory(content, role, emotion) {
  const len = (content || '').length;
  let score = Math.min(len * 2, 80);
  if (['love', 'sad', 'angry', 'excited'].includes(emotion)) score += 15;
  const tier = len < 20 ? 1 : (len < 60 ? 2 : 3);
  return { score: Math.min(score, 100), tier };
}

export async function findDuplicateMemory(content, activeAi, role) {
  const all = await VDB.all();
  const qv = await embed(content);
  for (const r of all) {
    if (r.ai_id !== activeAi || r.role !== role) continue;
    if (r.vector && cosine(qv, r.vector) > 0.92) return r;
  }
  return null;
}

export async function writeDedupedMemory(rec) {
  const dup = await findDuplicateMemory(rec.text, rec.ai_id, rec.role);
  if (dup) {
    dup.boost = (dup.boost || 1) + 0.2;
    dup.ts = Date.now();
    dup.mention_count = (dup.mention_count || 1) + 1;
    await VDB.put(dup);
    return;
  }
  rec.vector = await embed(rec.text);
  await VDB.put(rec);
}

/* ── 记忆修剪 ── */
let _lastTrimTime = 0;

export async function trimVectorStore() {
  try {
    if (_lastTrimTime && Date.now() - _lastTrimTime < 30000) return;
    _lastTrimTime = Date.now();
    const now = Date.now();
    const all = await VDB.all();
    const lam = forgetLambda();
    const recordsToUpdate = [];
    all.forEach(r => {
      let changed = false;
      let currentStatus = r.status || 'active';
      if (currentStatus === 'active') {
        const ageDays = (now - (r.ts || now)) / (24 * 3600 * 1000);
        if (ageDays > 1) {
          const decayMultiplier = Math.exp(-lam * ageDays);
          const originalScore = r.importance_score || 30;
          const newScore = originalScore * decayMultiplier;
          if (newScore !== originalScore) {
            r.importance_score = Math.max(1, Math.round(newScore));
            changed = true;
          }
          if (r.importance_score < 15) { r.status = 'fading'; changed = true; }
        }
      } else if (currentStatus === 'fading') {
        const ageDays = (now - (r.ts || now)) / (24 * 3600 * 1000);
        if (ageDays > 30) { r.status = 'archived'; changed = true; }
      }
      if (changed) recordsToUpdate.push(r);
    });
    for (const r of recordsToUpdate) await VDB.put(r);
    // 过期删除
    const updatedAll = await VDB.all();
    const expiredIds = [];
    const validRecords = [];
    updatedAll.forEach(r => {
      const exp = r.expiry_ts || (r.metadata && r.metadata.expiry_ts);
      if (exp && exp <= now) expiredIds.push(r.id);
      else validRecords.push(r);
    });
    if (expiredIds.length > 0) await VDB.deleteBatch(expiredIds);
    // 超限修剪
    const lim = currentMemMax();
    if (!lim || lim <= 0 || validRecords.length <= lim) return;
    const protectedIds = new Set();
    validRecords.forEach(r => {
      if (['love', 'sad', 'angry', 'excited'].includes(r.emotion) || (r.boost && r.boost >= 2.0) || (r.tier || 1) === 3) protectedIds.add(r.id);
    });
    let prunable = validRecords.filter(r => !protectedIds.has(r.id));
    prunable.sort((a, b) => ((a.tier || 1) - (b.tier || 1)) || ((a.import || 50) - (b.import || 50)) || ((a.ts || 0) - (b.ts || 0)));
    const overage = validRecords.length - lim;
    if (overage > 0) await VDB.deleteBatch(prunable.slice(0, overage).map(r => r.id));
  } catch (e) { console.error('[Memory Filter] Trim error:', e); }
}

/* ── 记忆写入 ── */
export async function memorize(role, content, emotion, aiId) {
  if (!content || content.length < 4) return;
  if (localStorage.getItem('rag_enabled') === 'false') return;
  const { score, tier } = evaluateMemory(content, role, emotion);
  if (score < 15) return;
  const ts = Date.now();
  const expiry_ts = tier === 1 ? ts + 24 * 3600 * 1000 : (tier === 2 ? ts + 90 * 24 * 3600 * 1000 : Infinity);
  const activeAi = aiId || (typeof window.currentPrivateAiId === 'function' ? window.currentPrivateAiId() : 'main');
  const topicTags = extractTopicTags(content);
  const timeWindowTag = formatTimeWindow(ts);
  const rec = {
    id: 'v_' + ts + '_' + Math.random().toString(36).slice(2, 7),
    text: content, vector: null, role, emotion: emotion || '', ts,
    window_id: Math.floor(ts / (24 * 3600 * 1000)),
    boost: 1, ai_id: activeAi,
    visibility: (activeAi === 'group' || aiId === 'group') ? 'group' : 'relationship',
    tier, importance_score: score, expiry_ts,
    topicTags, timeWindowTag, relatedIds: [],
    status: 'active', mention_count: 1,
  };
  try {
    await writeDedupedMemory(rec);
    await trimVectorStore();
  } catch (e) { console.warn('[Memorize] failed:', e); }
}

/* ── 记忆召回 ── */
export async function recall(query, aiId) {
  if (!ragEnabled()) return [];
  let store;
  try { store = await VDB.all(); } catch (e) { return []; }
  if (!store.length) return [];
  const activeAi = aiId || (typeof window.currentPrivateAiId === 'function' ? window.currentPrivateAiId() : 'main');
  const isDeepRecallQuery = /回忆|以前|过去|很久以前|不记得|记不记得|忘了吧|曾经|早些时候/.test((query || '').toLowerCase());

  const filtered = store.filter(r => {
    const recordAi = r.ai_id || 'main';
    let vis = r.visibility || 'relationship';
    if (vis === 'group') vis = 'world';
    if (vis === 'private' && recordAi !== activeAi) return false;
    if (vis === 'relationship' && activeAi !== 'main' && recordAi !== activeAi && recordAi !== 'main') return false;
    const status = r.status || 'active';
    if (status === 'archived') return false;
    if (status === 'fading' && !isDeepRecallQuery) return false;
    return true;
  });
  if (!filtered.length) return [];

  const qv = await embed(query);
  const lam = forgetLambda();
  const now = Date.now();
  const queryTags = extractTopicTags(query);

  // 🔍 话题预过滤加速
  let candidates = filtered;
  if (filtered.length > 200 && queryTags.length > 0) {
    const tagMatched = filtered.filter(r => {
      const rTags = r.topicTags || (r.metadata && r.metadata.topicTags) || [];
      return rTags.some(t => queryTags.includes(t));
    });
    candidates = tagMatched.length >= 5 ? tagMatched : filtered.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200);
  } else if (filtered.length > 200) {
    candidates = filtered.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200);
  }

  const scored = candidates.map(r => {
    const sim = cosine(qv, r.vector);
    const ageDays = (now - (r.ts || now)) / (24 * 3600 * 1000);
    const decay = Math.exp(-lam * Math.max(0, ageDays));
    let boost = r.boost || 1;
    const emoWeight = ['love', 'sad', 'angry', 'excited', 'heart'].includes(r.emotion) ? 1.3 : 1.0;
    const rTags = r.topicTags || (r.metadata && r.metadata.topicTags) || [];
    const continuityMultiplier = queryTags.some(t => rTags.includes(t)) ? 1.25 : 1.0;
    const relDepthMultiplier = 1.0 + Math.min(0.5, (r.mention_count || 1) * 0.05);
    const finalScore = sim * decay * boost * emoWeight * continuityMultiplier * relDepthMultiplier;
    return { ...r, sim, score: finalScore };
  }).filter(r => r.sim >= ragThreshold()).sort((a, b) => b.score - a.score);

  const top = scored.slice(0, ragTopK());

  // 近期记忆保底
  const recentCutoff = Date.now() - 120000;
  const recentMemories = filtered.filter(r => (r.ts || 0) > recentCutoff && !top.some(t => t.id === r.id));
  recentMemories.forEach(r => { r.sim = Math.max(r.sim || 0, 0.5); r.score = 0.8; top.push(r); });

  return top;
}

// 不覆盖 window——旧脚本已提供全局函数
export default { VDB, embed, memorize, recall, trimVectorStore, writeDedupedMemory };
