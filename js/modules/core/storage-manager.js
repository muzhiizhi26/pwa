/* ===== Storage Manager (Module) — 统一存储管理 =====
 * 封装 localStorage + IndexedDB，提供统一读写接口。
 * 配置类数据 → localStorage，大容量数据 → IndexedDB。
 * 自动监测容量，超过 80% 告警。
 */

const StorageManager = (() => {
  const DB_NAME = 'LovestoryStorage';
  const DB_VERSION = 1;

  /* ─── IndexedDB 底层操作 ─── */
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('audio')) {
          db.createObjectStore('audio', { keyPath: 'audioId' });
        }
        if (!db.objectStoreNames.contains('embedding')) {
          const store = db.createObjectStore('embedding', { keyPath: 'textHash' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbOperation(storeName, mode, callback) {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = callback(store);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Transaction aborted'));
      }).finally(() => db.close());
    });
  }

  const STORAGE_WARN_THRESHOLD = 0.8;
  let _storageWarned = false;

  function checkStorageCapacity() {
    try {
      let used = 0;
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length * 2;
        }
      }
      const limit = 5 * 1024 * 1024;
      const ratio = used / limit;
      if (ratio > STORAGE_WARN_THRESHOLD && !_storageWarned) {
        _storageWarned = true;
        console.warn(`[StorageManager] localStorage 使用量已达 ${(ratio * 100).toFixed(0)}%，建议清理或迁移大容量数据到 IndexedDB。`);
        if (typeof showToast === 'function') {
          showToast(`⚠️ 本地存储即将满 (${(ratio * 100).toFixed(0)}%)，语音/图片可能无法保存`);
        }
      }
      return ratio;
    } catch (e) {
      return 0;
    }
  }

  const LS_PREFIX = 'ls_';

  async function get(key, type = 'config') {
    if (type === 'config') {
      try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn(`[StorageManager] localStorage get "${key}" failed:`, e);
        return null;
      }
    }
    try {
      return await idbOperation('kv', 'readonly', store => {
        const req = store.get(key);
        return new Promise((res, rej) => {
          req.onsuccess = () => res(req.result ? req.result.value : null);
          req.onerror = () => rej(req.error);
        });
      });
    } catch (e) {
      console.warn(`[StorageManager] IDB get "${key}" failed:`, e);
      return null;
    }
  }

  async function set(key, value, type = 'config') {
    if (type === 'config') {
      try {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
        checkStorageCapacity();
        return true;
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.error('[StorageManager] localStorage 配额已满，请清理或迁移数据。');
          if (typeof showToast === 'function') showToast('❌ 本地存储已满，请清理旧数据');
        }
        return false;
      }
    }
    try {
      await idbOperation('kv', 'readwrite', store => {
        store.put({ key, value });
      });
      return true;
    } catch (e) {
      console.warn(`[StorageManager] IDB set "${key}" failed:`, e);
      return false;
    }
  }

  async function remove(key, type = 'config') {
    if (type === 'config') {
      localStorage.removeItem(LS_PREFIX + key);
      return true;
    }
    try {
      await idbOperation('kv', 'readwrite', store => {
        store.delete(key);
      });
      return true;
    } catch (e) {
      console.warn(`[StorageManager] IDB remove "${key}" failed:`, e);
      return false;
    }
  }

  async function saveAudio(audioId, data) {
    try {
      await idbOperation('audio', 'readwrite', store => {
        store.put({ audioId, ...data, timestamp: Date.now() });
      });
      return true;
    } catch (e) {
      console.error('[StorageManager] saveAudio failed:', e);
      return false;
    }
  }

  async function getAudio(audioId) {
    try {
      return await idbOperation('audio', 'readonly', store => {
        const req = store.get(audioId);
        return new Promise((res, rej) => {
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => rej(req.error);
        });
      });
    } catch (e) {
      console.warn('[StorageManager] getAudio failed:', e);
      return null;
    }
  }

  async function deleteAudio(audioId) {
    try {
      await idbOperation('audio', 'readwrite', store => {
        store.delete(audioId);
      });
      return true;
    } catch (e) {
      console.warn('[StorageManager] deleteAudio failed:', e);
      return false;
    }
  }

  async function cleanAudio(ttl = 7 * 24 * 60 * 60 * 1000) {
    try {
      const db = await openDB();
      const tx = db.transaction('audio', 'readwrite');
      const store = tx.objectStore('audio');
      const req = store.getAll();
      req.onsuccess = () => {
        const now = Date.now();
        req.result.forEach(item => {
          if (now - (item.timestamp || 0) > ttl) {
            store.delete(item.audioId);
          }
        });
      };
      await new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
      return true;
    } catch (e) {
      console.warn('[StorageManager] cleanAudio failed:', e);
      return false;
    }
  }

  async function getEmbedding(textHash) {
    try {
      return await idbOperation('embedding', 'readonly', store => {
        const req = store.get(textHash);
        return new Promise((res, rej) => {
          req.onsuccess = () => {
            const record = req.result;
            if (record && Date.now() - record.timestamp > 30 * 24 * 60 * 60 * 1000) {
              store.delete(textHash);
              res(null);
            } else {
              res(record ? record.embedding : null);
            }
          };
          req.onerror = () => rej(req.error);
        });
      });
    } catch (e) {
      console.warn('[StorageManager] getEmbedding failed:', e);
      return null;
    }
  }

  async function saveEmbedding(textHash, embedding) {
    try {
      await idbOperation('embedding', 'readwrite', store => {
        store.put({ textHash, embedding, timestamp: Date.now() });
      });
      return true;
    } catch (e) {
      console.warn('[StorageManager] saveEmbedding failed:', e);
      return false;
    }
  }

  async function migrateToIDB(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return false;
      const value = JSON.parse(raw);
      await set(key, value, 'idb');
      localStorage.removeItem(key);
      console.log(`[StorageManager] Migrated "${key}" from localStorage to IndexedDB.`);
      return true;
    } catch (e) {
      console.warn(`[StorageManager] Migration failed for "${key}":`, e);
      return false;
    }
  }

  let _initDone = false;
  async function init() {
    if (_initDone) return;
    _initDone = true;
    checkStorageCapacity();
    setInterval(() => cleanAudio(), 24 * 60 * 60 * 1000);
    console.log('[StorageManager] Initialized.');
  }

  const api = {
    get, set, remove,
    saveAudio, getAudio, deleteAudio, cleanAudio,
    getEmbedding, saveEmbedding,
    migrateToIDB, init, checkStorageCapacity,
  };

  return api;
})();

export default StorageManager;
