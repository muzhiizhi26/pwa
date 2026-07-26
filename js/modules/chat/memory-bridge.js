/* ===== Memory Bridge Module =====
 * 记忆管理层：生命周期、睡眠整合、长期档案
 */

import { memorize, recall, VDB, trimVectorStore } from './memory-core.js';
import { showToast } from '../utils.js';

/* ── 睡眠记忆整合 ── */
export async function triggerSleepConsolidation() {
  showToast('🌌 伴侣系统正在进行睡眠状态记忆深度整合与压缩...');
  setTimeout(async () => {
    try {
      const store = await VDB.all();
      let consolidatedCount = 0, forgottenCount = 0;
      const unlocked = store.filter(r => !(r.boost && r.boost >= 3.0));
      const now = Date.now();

      // 自然衰减
      for (const item of unlocked) {
        const ageDays = (now - (item.ts || now)) / (24 * 3600 * 1000);
        if (ageDays > 3) {
          const oldBoost = item.boost || 1.0;
          item.boost = parseFloat((oldBoost * 0.82).toFixed(2));
          if (item.boost < 0.22) { await VDB.del(item.id); forgottenCount++; continue; }
          await VDB.put(item);
        }
      }

      // 去重（复用已加载的 store）
      const unlockedFresh = unlocked.filter(r => !(r.boost && r.boost < 0.22));
      const deletedIds = new Set();
      const cosine = (a, b) => {
        const n = Math.min(a.length, b.length);
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
        return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
      };
      for (let i = 0; i < unlockedFresh.length; i++) {
        const a = unlockedFresh[i]; if (deletedIds.has(a.id)) continue;
        for (let j = i + 1; j < unlockedFresh.length; j++) {
          const b = unlockedFresh[j]; if (deletedIds.has(b.id)) continue;
          if (cosine(a.vector, b.vector) > 0.8) {
            const keep = (a.importance || 0) >= (b.importance || 0) ? a : b;
            const remove = keep === a ? b : a;
            await VDB.del(remove.id); deletedIds.add(remove.id); consolidatedCount++;
          }
        }
      }
      showToast(`✨ 睡眠沉淀圆满完成：合并 ${consolidatedCount} 条冗余记忆，自然淡化遗忘 ${forgottenCount} 条细枝末节碎片。`);
    } catch (e) {
      console.error('[SleepConsolidation] Error:', e);
      showToast('❌ 睡眠记忆沉淀过程中发生错误');
    }
  }, 1000);
}

/* ── 长期记忆管理 ── */
export function getLongTermProfile() { return (localStorage.getItem('longterm_profile') || '').trim(); }
export function setLongTermProfile(v, source) {
  const old = getLongTermProfile();
  const nv = (v || '').trim();
  if (nv !== old) {
    const log = JSON.parse(localStorage.getItem('longterm_changelog') || '[]');
    log.unshift({ time: Date.now(), old, new: nv, source: source || 'user' });
    localStorage.setItem('longterm_changelog', JSON.stringify(log.slice(0, 50)));
  }
  localStorage.setItem('longterm_profile', nv);
  if (window.MemoryGraph && typeof window.MemoryGraph.updateFromProfileText === 'function') {
    window.MemoryGraph.updateFromProfileText(nv);
  }
}

export function getMidTerm() { return (localStorage.getItem('midterm_memory') || '').trim(); }

// 不覆盖 window——旧脚本已提供
export default { triggerSleepConsolidation, getLongTermProfile, setLongTermProfile, getMidTerm };
