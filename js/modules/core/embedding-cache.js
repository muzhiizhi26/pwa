/* ===== Embedding Cache (Module) — 向量缓存 =====
 * 在 IndexedDB 中缓存已计算的 Embedding 向量，避免重复调用 API。
 * 配合 StorageManager 的 getEmbedding / saveEmbedding 使用。
 * 缓存有效期 30 天，自动清理过期条目。
 */

const EmbeddingCache = (() => {
  function hashText(text) {
    let h = 2166136261;
    const str = (text || '').toLowerCase().trim();
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'emb_' + Math.abs(h).toString(16);
  }

  const _memCache = new Map();
  const MAX_MEM = 200;

  function memGet(key) {
    if (!_memCache.has(key)) return null;
    const val = _memCache.get(key);
    _memCache.delete(key);
    _memCache.set(key, val);
    return val;
  }

  function memSet(key, vec) {
    if (_memCache.size >= MAX_MEM) {
      const first = _memCache.keys().next().value;
      _memCache.delete(first);
    }
    _memCache.set(key, vec);
  }

  let _hits = 0;
  let _misses = 0;

  async function get(text, fetchFn) {
    if (!text) return null;
    const key = hashText(text);

    const mem = memGet(key);
    if (mem) { _hits++; return mem; }

    if (window.StorageManager) {
      try {
        const cached = await StorageManager.getEmbedding(key);
        if (cached) { _hits++; memSet(key, cached); return cached; }
      } catch (e) {
        console.warn('[EmbeddingCache] IDB read failed:', e);
      }
    }

    _misses++;

    if (typeof fetchFn === 'function') {
      try {
        const vec = await fetchFn(text);
        if (vec && Array.isArray(vec)) {
          memSet(key, vec);
          if (window.StorageManager) {
            StorageManager.saveEmbedding(key, vec).catch(() => {});
          }
        }
        return vec;
      } catch (e) {
        console.warn('[EmbeddingCache] fetchFn failed:', e);
        return null;
      }
    }

    return null;
  }

  async function set(text, vec) {
    if (!text || !vec) return;
    const key = hashText(text);
    memSet(key, vec);
    if (window.StorageManager) {
      try { await StorageManager.saveEmbedding(key, vec); } catch (e) {
        console.warn('[EmbeddingCache] save failed:', e);
      }
    }
  }

  function clear() {
    _memCache.clear();
    _hits = 0;
    _misses = 0;
  }

  function stats() {
    const total = _hits + _misses;
    return {
      memorySize: _memCache.size,
      hits: _hits,
      misses: _misses,
      hitRate: total > 0 ? (_hits / total * 100).toFixed(1) + '%' : 'N/A',
    };
  }

  const api = { get, set, clear, stats, hashText };
  return api;
})();

export default EmbeddingCache;
