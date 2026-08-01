/**
 * 🕸️ MemoryGraph: The unified memory database and management layer of the Cognitive OS.
 * Operates on the unified MemoryNode schema.
 */
const MemoryGraph = {
  DB_NAME: 'cognitive_memory_db',
  STORE_NAME: 'memory_nodes',
  VERSION: 1,
  _db: null,
  _initialized: false,

  async init() {
    if (this._initialized) return;
    console.log("🕸️ MemoryGraph initializing...");
    try {
      this._db = await this._openDB();
      this._initialized = true;
      console.log("🕸️ MemoryGraph DB opened successfully.");
      
      // Perform automatic bi-directional migration & synchronization
      await this.syncFromLegacy();
    } catch (e) {
      console.error("🕸️ MemoryGraph initialization failed:", e);
    }
  },

  _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('owner', 'owner', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Puts a MemoryNode into the database
   */
  async addNode(nodeData) {
    await this.init();
    const node = nodeData instanceof MemoryNode ? nodeData : new MemoryNode(nodeData);
    const json = node.toJSON();

    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const req = store.put(json);
      tx.oncomplete = async () => {
        // Automatically sync back to keep UI perfectly consistent
        await this.syncToLegacy();
        resolve(node);
      };
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Batch adds multiple MemoryNodes
   */
  async addNodesBatch(nodesArray) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      for (const nodeData of nodesArray) {
        const node = nodeData instanceof MemoryNode ? nodeData : new MemoryNode(nodeData);
        store.put(node.toJSON());
      }
      tx.oncomplete = async () => {
        await this.syncToLegacy();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Retrieves a MemoryNode by ID
   */
  async getNode(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) resolve(new MemoryNode(req.result));
        else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Deletes a MemoryNode by ID
   */
  async deleteNode(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      store.delete(id);
      tx.oncomplete = async () => {
        await this.syncToLegacy();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Gets all MemoryNodes in the database
   */
  async getAllNodes() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = (req.result || []).map(d => new MemoryNode(d));
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Queries and filters MemoryNodes
   */
  async queryNodes(filterFn) {
    const all = await this.getAllNodes();
    if (typeof filterFn === 'function') {
      return all.filter(filterFn);
    }
    return all;
  },

  /**
   * Clears all MemoryNodes
   */
  async clear() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
      tx.objectStore(this.STORE_NAME).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * 🔄 Legacy Import Sync: Runs once to ingest old distinct structures into unified MemoryNodes
   */
  async syncFromLegacy() {
    // Check if initial ingestion has already been performed
    const alreadyIngested = localStorage.getItem('memory_graph_ingested_legacy') === 'true';
    if (alreadyIngested) return;

    console.log("🔄 MemoryGraph: Ingesting legacy profiles & life models into unified MemoryNodes...");
    const batch = [];

    // 1. Convert long-term profile facts into semantic MemoryNodes
    const profileText = localStorage.getItem('longterm_profile') || '';
    if (profileText.trim()) {
      const lines = profileText.split('\n').map(l => l.trim()).filter(l => l && l.startsWith('-'));
      lines.forEach(line => {
        const fact = line.replace(/^-\s*/, '').trim();
        if (fact) {
          batch.push(new MemoryNode({
            owner: 'user',
            scope: 'relationship',
            type: 'semantic',
            importance: 4,
            summary: fact,
            metadata: { legacyKey: 'longterm_profile', tag: 'profile_fact' }
          }));
        }
      });
    }

    // 2. Convert user life model (threads & objects) into story / semantic MemoryNodes
    try {
      const rawLifeModel = localStorage.getItem('user_life_model');
      if (rawLifeModel) {
        const model = JSON.parse(rawLifeModel);
        if (model.threads && Array.isArray(model.threads)) {
          model.threads.forEach(t => {
            batch.push(new MemoryNode({
              id: t.id || undefined,
              owner: 'user',
              scope: 'relationship',
              type: 'story',
              importance: t.status === '高关注' ? 5 : 3,
              summary: t.title,
              timestamp: t.updated || Date.now(),
              metadata: { legacyKey: 'user_life_model_thread', status: t.status }
            }));
          });
        }
        if (model.objects && Array.isArray(model.objects)) {
          model.objects.forEach(o => {
            batch.push(new MemoryNode({
              id: o.id || undefined,
              owner: 'user',
              scope: 'relationship',
              type: 'semantic',
              importance: 4,
              summary: `${o.name} [类型: ${o.type}]`,
              metadata: { legacyKey: 'user_life_model_object', objectType: o.type, name: o.name }
            }));
          });
        }
      }
    } catch (e) {
      console.error("Failed to parse user life model in legacy ingest:", e);
    }

    // 3. Convert life event timeline milestone logs into episodic MemoryNodes
    try {
      const rawTimeline = localStorage.getItem('life_event_timeline');
      if (rawTimeline) {
        const timeline = JSON.parse(rawTimeline);
        if (Array.isArray(timeline)) {
          timeline.forEach(m => {
            batch.push(new MemoryNode({
              id: m.id || undefined,
              owner: 'main',
              scope: 'relationship',
              type: 'episodic',
              importance: 5,
              summary: `共同经历：《${m.title}》- ${m.desc}`,
              timestamp: m.ts || Date.now(),
              metadata: { 
                legacyKey: 'life_event_timeline', 
                title: m.title, 
                desc: m.desc, 
                dateStr: m.dateStr, 
                aiParticipant: m.aiParticipant, 
                relationshipStage: m.relationshipStage 
              }
            }));
          });
        }
      }
    } catch (e) {
      console.error("Failed to parse life event timeline in legacy ingest:", e);
    }

    if (batch.length > 0) {
      await this.addNodesBatch(batch);
      console.log(`🔄 MemoryGraph: Ingested ${batch.length} legacy data points safely.`);
    }

    localStorage.setItem('memory_graph_ingested_legacy', 'true');
  },

  /**
   * 🔄 Legacy Outward Sync: Compiles MemoryNode graph BACK into standard legacy keys
   * to guarantee zero breaking changes to existing UI panels, diary, settings and chat flows.
   */
  async syncToLegacy() {
    try {
      const all = await this.getAllNodes();

      // 1. Sync back to longterm_profile
      const semanticFacts = all.filter(n => n.type === 'semantic' && n.metadata.tag === 'profile_fact');
      if (semanticFacts.length > 0) {
        const profileStr = semanticFacts.map(n => `- ${n.summary}`).join('\n');
        // Prevent infinite loops by silently storing
        localStorage.setItem('longterm_profile', profileStr);
      }

      // 2. Sync back to user_life_model
      const threadNodes = all.filter(n => n.type === 'story' && n.metadata.legacyKey === 'user_life_model_thread');
      const objectNodes = all.filter(n => n.type === 'semantic' && n.metadata.legacyKey === 'user_life_model_object');
      
      const userLifeModel = {
        threads: threadNodes.map(n => ({
          id: n.id,
          title: n.summary,
          status: n.metadata.status || '进行中',
          updated: n.timestamp
        })),
        objects: objectNodes.map(n => ({
          id: n.id,
          name: n.metadata.name || n.summary.split(' [')[0],
          type: n.metadata.objectType || '锚点'
        }))
      };

      if (threadNodes.length > 0 || objectNodes.length > 0) {
        localStorage.setItem('user_life_model', JSON.stringify(userLifeModel));
      }

      // 3. Sync back to life_event_timeline
      const timelineNodes = all.filter(n => n.type === 'episodic' && n.metadata.legacyKey === 'life_event_timeline');
      if (timelineNodes.length > 0) {
        const timeline = timelineNodes.map(n => ({
          id: n.id,
          title: n.metadata.title || '重要时刻',
          desc: n.metadata.desc || n.summary.replace(/^共同经历：《[^》]+》-\s*/, ''),
          dateStr: n.metadata.dateStr || new Date(n.timestamp).toLocaleDateString('zh-CN'),
          ts: n.timestamp,
          aiParticipant: n.metadata.aiParticipant || 'AI伴侣',
          relationshipStage: n.metadata.relationshipStage || '灵魂共鸣'
        }));
        localStorage.setItem('life_event_timeline', JSON.stringify(timeline));
      }

      // Dispatch a dynamic storage event to notify UI panels to re-render in real-time
      window.dispatchEvent(new Event('storage'));
      if (typeof renderMemoryPanelIfOpen === 'function') {
        renderMemoryPanelIfOpen();
      }
    } catch (e) {
      console.error("Error in syncToLegacy:", e);
    }
  },

  /**
   * Sync custom long-term profile edit text back to MemoryNodes
   */
  async updateFromProfileText(text) {
    await this.init();
    const cleanText = (text || '').trim();
    const newFacts = cleanText.split('\n').map(l => l.trim()).filter(l => l && l.startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
    
    // Get existing semantic profile facts
    const existing = await this.queryNodes(n => n.type === 'semantic' && n.metadata.tag === 'profile_fact');
    const existingSummaries = existing.map(n => n.summary);
    
    const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
    const store = tx.objectStore(this.STORE_NAME);
    
    // Add new ones
    for (const fact of newFacts) {
      if (!existingSummaries.includes(fact)) {
        const node = new MemoryNode({
          owner: 'user',
          scope: 'relationship',
          type: 'semantic',
          importance: 4,
          summary: fact,
          metadata: { legacyKey: 'longterm_profile', tag: 'profile_fact' }
        });
        store.put(node.toJSON());
      }
    }
    
    // Delete removed ones
    for (const node of existing) {
      if (!newFacts.includes(node.summary)) {
        store.delete(node.id);
      }
    }
    
    tx.oncomplete = () => {
      if (typeof renderMemoryPanelIfOpen === 'function') {
        renderMemoryPanelIfOpen();
      }
    };
  },

  /**
   * Sync custom Life Model (threads/objects) edits back to MemoryNodes
   */
  async updateFromLifeModel(model) {
    await this.init();
    if (!model) return;
    
    const existingThreads = await this.queryNodes(n => n.type === 'story' && n.metadata.legacyKey === 'user_life_model_thread');
    const existingObjects = await this.queryNodes(n => n.type === 'semantic' && n.metadata.legacyKey === 'user_life_model_object');
    
    const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
    const store = tx.objectStore(this.STORE_NAME);
    
    // Sync threads
    if (model.threads && Array.isArray(model.threads)) {
      model.threads.forEach(t => {
        const id = t.id || 'mem_story_' + Math.random().toString(36).slice(2, 9);
        const node = new MemoryNode({
          id,
          owner: 'user',
          scope: 'relationship',
          type: 'story',
          importance: t.status === '高关注' ? 5 : 3,
          summary: t.title,
          timestamp: t.updated || Date.now(),
          metadata: { legacyKey: 'user_life_model_thread', status: t.status }
        });
        store.put(node.toJSON());
      });
      // Delete missing threads
      existingThreads.forEach(node => {
        const match = model.threads.find(t => t.id === node.id || t.title === node.summary);
        if (!match) {
          store.delete(node.id);
        }
      });
    }
    
    // Sync objects
    if (model.objects && Array.isArray(model.objects)) {
      model.objects.forEach(o => {
        const id = o.id || 'mem_obj_' + Math.random().toString(36).slice(2, 9);
        const node = new MemoryNode({
          id,
          owner: 'user',
          scope: 'relationship',
          type: 'semantic',
          importance: 4,
          summary: `${o.name} [类型: ${o.type}]`,
          metadata: { legacyKey: 'user_life_model_object', objectType: o.type, name: o.name }
        });
        store.put(node.toJSON());
      });
      // Delete missing objects
      existingObjects.forEach(node => {
        const match = model.objects.find(o => o.id === node.id || o.name === node.metadata.name);
        if (!match) {
          store.delete(node.id);
        }
      });
    }
    
    tx.oncomplete = () => {
      if (typeof renderMemoryPanelIfOpen === 'function') {
        renderMemoryPanelIfOpen();
      }
    };
  },

  /**
   * Sync timeline edits back to MemoryNodes
   */
  async updateFromTimeline(timeline) {
    await this.init();
    if (!Array.isArray(timeline)) return;
    
    const existing = await this.queryNodes(n => n.type === 'episodic' && n.metadata.legacyKey === 'life_event_timeline');
    const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
    const store = tx.objectStore(this.STORE_NAME);
    
    timeline.forEach(m => {
      const id = m.id || 'mem_evt_' + Math.random().toString(36).slice(2, 9);
      const node = new MemoryNode({
        id,
        owner: m.aiParticipant || 'main',
        scope: 'relationship',
        type: 'episodic',
        importance: 5,
        summary: `共同经历：《${m.title}》- ${m.desc}`,
        timestamp: m.ts || Date.now(),
        metadata: { 
          legacyKey: 'life_event_timeline', 
          title: m.title, 
          desc: m.desc, 
          dateStr: m.dateStr, 
          aiParticipant: m.aiParticipant, 
          relationshipStage: m.relationshipStage 
        }
      });
      store.put(node.toJSON());
    });
    
    // Delete missing
    existing.forEach(node => {
      const match = timeline.find(m => m.id === node.id || m.title === node.metadata.title);
      if (!match) {
        store.delete(node.id);
      }
    });
    
    tx.oncomplete = () => {
      if (typeof renderMemoryPanelIfOpen === 'function') {
        renderMemoryPanelIfOpen();
      }
    };
  },

  /**
   * Helper to convert flat legacy VDB record to normalized MemoryNode
   */
  fromVDBRecord(rec) {
    if (!rec) return null;
    const importance = typeof rec.importance === 'number' 
      ? Math.max(1, Math.min(5, Math.round(rec.importance / 20))) 
      : (rec.boost && rec.boost >= 2 ? 4 : 3);
      
    const scope = rec.visibility || 'relationship';
    const type = rec.is_event ? 'semantic' : 'episodic';
    
    const metadata = {
      ...(rec.metadata || {}),
      vector: rec.vector,
      role: rec.role,
      emotion: rec.emotion || '',
      window_id: rec.window_id,
      boost: rec.boost !== undefined ? rec.boost : 1.0,
      is_event: rec.is_event || false,
      event_type: rec.event_type || '',
      visibility: rec.visibility || 'relationship',
      relationship_impact: rec.relationship_impact || null,
      propagation_path: rec.propagation_path || null,
      importance: rec.importance,
      tier: rec.tier !== undefined ? rec.tier : (rec.metadata && rec.metadata.tier),
      importance_score: rec.importance_score !== undefined ? rec.importance_score : (rec.metadata && rec.metadata.importance_score),
      expiry_ts: rec.expiry_ts !== undefined ? rec.expiry_ts : (rec.metadata && rec.metadata.expiry_ts),
      // Graph 2.0 fields
      topicTags: rec.topicTags || (rec.metadata && rec.metadata.topicTags) || [],
      relatedIds: rec.relatedIds || (rec.metadata && rec.metadata.relatedIds) || [],
      timeWindowTag: rec.timeWindowTag || (rec.metadata && rec.metadata.timeWindowTag) || ''
    };

    return new MemoryNode({
      id: rec.id,
      owner: rec.ai_id || rec.role || 'main',
      scope: scope,
      type: type,
      importance: importance,
      confidence: rec.confidence !== undefined ? rec.confidence : 1.0,
      summary: rec.text || '',
      timestamp: rec.ts || Date.now(),
      metadata: metadata
    });
  },

  /**
   * Helper to convert normalized MemoryNode to flat legacy VDB record
   */
  toVDBRecord(node) {
    if (!node) return null;
    const meta = node.metadata || {};
    return {
      id: node.id,
      text: node.summary,
      vector: meta.vector,
      role: meta.role || (node.owner === 'user' ? 'user' : 'assistant'),
      emotion: meta.emotion || '',
      ts: node.timestamp,
      window_id: meta.window_id || Math.floor(node.timestamp / (24 * 3600 * 1000)),
      boost: meta.boost !== undefined ? meta.boost : 1.0,
      ai_id: node.owner,
      is_event: meta.is_event || (node.type === 'semantic' && node.id.startsWith('evt_')),
      event_type: meta.event_type || '',
      importance: meta.importance !== undefined ? meta.importance : (node.importance * 20),
      confidence: node.confidence,
      visibility: node.scope || meta.visibility || 'relationship',
      relationship_impact: meta.relationship_impact || null,
      propagation_path: meta.propagation_path || null,
      tier: meta.tier !== undefined ? meta.tier : 1,
      importance_score: meta.importance_score !== undefined ? meta.importance_score : 50,
      expiry_ts: meta.expiry_ts !== undefined ? meta.expiry_ts : Infinity,
      // Graph 2.0 fields
      topicTags: meta.topicTags || [],
      relatedIds: meta.relatedIds || [],
      timeWindowTag: meta.timeWindowTag || '',
      metadata: meta
    };
  }
};

if (typeof window !== 'undefined') {
  window.MemoryGraph = MemoryGraph;
  if (window.Runtime) {
    window.Runtime.MemoryGraph = MemoryGraph;
  }
} else if (typeof module !== 'undefined') {
  module.exports = MemoryGraph;
}
