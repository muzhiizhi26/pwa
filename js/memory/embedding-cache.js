/* ===== Embedding Cache — 向量缓存 =====
 * 在 IndexedDB 中缓存已计算的 Embedding 向量，避免重复调用 API。
 * 配合 StorageManager 的 getEmbedding / saveEmbedding 使用。
 * 缓存有效期 30 天，自动清理过期条目。
 */

const EmbeddingCache = (() => {
  // 简单文本哈希，用于生成缓存 key
  function hashText(text) {
    let h = 2166136261;
    const str = (text || '').toLowerCase().trim();
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'emb_' + Math.abs(h).toString(16);
  }

  // 内存 LRU 缓存（一级缓存，最快）
  const _memCache = new Map();
  const MAX_MEM = 200;

  function memGet(key) {
    if (!_memCache.has(key)) return null;
    const val = _memCache.get(key);
    // LRU: 访问时移到末尾
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

  // 统计
  let _hits = 0;
  let _misses = 0;

  /**
   * 获取文本的 Embedding 向量。
   * 查找顺序：内存缓存 → IndexedDB → API 调用
   */
  async function get(text, fetchFn) {
    if (!text) return null;
    const key = hashText(text);

    // 1. 内存缓存
    const mem = memGet(key);
    if (mem) {
      _hits++;
      return mem;
    }

    // 2. IndexedDB 缓存（通过 StorageManager）
    if (window.StorageManager) {
      try {
        const cached = await StorageManager.getEmbedding(key);
        if (cached) {
          _hits++;
          memSet(key, cached);
          return cached;
        }
      } catch (e) {
        console.warn('[EmbeddingCache] IDB read failed:', e);
      }
    }

    _misses++;

    // 3. 调用外部 API（传入的 fetchFn）
    if (typeof fetchFn === 'function') {
      try {
        const vec = await fetchFn(text);
        if (vec && Array.isArray(vec)) {
          memSet(key, vec);
          // 异步存 IndexedDB，不阻塞返回
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

  /**
   * 主动缓存一个向量（用于预计算结果）
   */
  async function set(text, vec) {
    if (!text || !vec) return;
    const key = hashText(text);
    memSet(key, vec);
    if (window.StorageManager) {
      try {
        await StorageManager.saveEmbedding(key, vec);
      } catch (e) {
        console.warn('[EmbeddingCache] save failed:', e);
      }
    }
  }

  /**
   * 清除缓存
   */
  function clear() {
    _memCache.clear();
    _hits = 0;
    _misses = 0;
  }

  /**
   * 获取统计信息
   */
  function stats() {
    const total = _hits + _misses;
    return {
      memorySize: _memCache.size,
      hits: _hits,
      misses: _misses,
      hitRate: total > 0 ? (_hits / total * 100).toFixed(1) + '%' : 'N/A',
    };
  }

  return {
    get,
    set,
    clear,
    stats,
    hashText,
  };
})();

if (typeof window !== 'undefined') {
  window.EmbeddingCache = EmbeddingCache;
}
