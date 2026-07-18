/* ===== AI Orchestrator & Context Manager & Event Bus ===== */

// 1. EventBus (事件总线)
window.EventBus = {
  _listeners: {},
  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  },
  emit(event, data) {
    console.log(`[EventBus] Emitting event: ${event}`, data);
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => {
        try { cb(data); } catch(e) { console.error(`[EventBus] Error in listener for ${event}:`, e); }
      });
    }
  }
};

// 2. ContextManager (统一上下文快照引擎)
window.ContextManager = {
  _cache: {},
  _cacheTime: {},
  _ttl: 8000, // 8 seconds TTL for fast-repeated snapshots

  getSnapshot(memberId) {
    const now = Date.now();
    const id = memberId || 'main';
    if (this._cache[id] && (now - this._cacheTime[id] < this._ttl)) {
      console.log(`[ContextManager] Returning cached snapshot for: ${id}`);
      return this._cache[id];
    }

    console.log(`[ContextManager] Generating new snapshot for: ${id}`);
    const snapshot = {
      ai_name: localStorage.getItem('ai_name') || '主AI',
      ai_avatar: localStorage.getItem('ai_avatar') || '🤖',
      longterm_profile: (localStorage.getItem('longterm_profile') || '').trim(),
      relationship_stage: localStorage.getItem('relationship_stage') || 'acquaintance',
      relationship_metrics: (typeof getRelationshipMetrics === 'function') ? getRelationshipMetrics(id) : {},
      emotion_state: localStorage.getItem('emotion_state') || 'calm',
      user_memo: localStorage.getItem('user_memo') || '',
      timestamp: now
    };

    this._cache[id] = snapshot;
    this._cacheTime[id] = now;
    return snapshot;
  },

  clear(memberId) {
    if (memberId) {
      delete this._cache[memberId];
      delete this._cacheTime[memberId];
    } else {
      this._cache = {};
      this._cacheTime = {};
    }
  }
};

// 3. AIOrchestrator (AI 调度中枢)
window.AIOrchestrator = {
  _activeRequests: new Map(), // Keep track of ongoing requests to prevent duplicates
  _agentRoles: {}, // memberId -> { response_generation: boolean, description: string }

  // Set permissions for an agent
  setAgentRole(memberId, canGenerateResponse, description = '') {
    this._agentRoles[memberId] = {
      response_generation: canGenerateResponse,
      description
    };
  },

  getAgentRole(memberId) {
    return this._agentRoles[memberId] || { response_generation: true, description: 'Default AI Partner' };
  },

  // Central LLM caller that handles deduplication and role restrictions
  async requestCompletion(messages, { temperature, callerId = 'unknown', force = false, provider, model } = {}) {
    const role = this.getAgentRole(callerId);
    if (!role.response_generation && !force) {
      console.log(`[AIOrchestrator] Request rejected: Agent ${callerId} does not have response generation capability.`);
      return '（分析就绪，不进行主动生成）';
    }

    // Deduplicate identical prompt sequences including model/provider to be safe
    const promptFingerprint = JSON.stringify(messages) + 
                              (temperature != null ? `_t_${temperature}` : '') + 
                              (provider ? `_p_${provider.id}` : '') + 
                              (model ? `_m_${model}` : '');
    if (this._activeRequests.has(promptFingerprint)) {
      console.log(`[AIOrchestrator] Duplicate request intercepted for ${callerId}. Returning active promise.`);
      return this._activeRequests.get(promptFingerprint);
    }

    console.log(`[AIOrchestrator] Dispatching LLM Request for: ${callerId}`);
    const promise = (async () => {
      try {
        if (typeof llmCompleteRaw === 'function') {
          return await llmCompleteRaw(messages, { temperature, provider, model });
        } else if (typeof llmComplete === 'function') {
          return await llmComplete(messages, { temperature, provider, model });
        } else {
          throw new Error('Global llmComplete/llmCompleteRaw function not found.');
        }
      } finally {
        this._activeRequests.delete(promptFingerprint);
      }
    })();

    this._activeRequests.set(promptFingerprint, promise);
    return promise;
  }
};

// 4. Memory Event Extraction - Throttle and Consolidation (防抖、合并消费)
window.MemoryOrchestration = {
  _buffer: [],
  _timeoutId: null,
  _processing: false,

  shouldRunLLM(userText, aiReply) {
    const u = (userText || '').trim();
    const r = (aiReply || '').trim();
    
    // Low value / extremely short input
    if (u.length < 5) return false;

    // Common non-substantive words
    const noiseWords = ['嗯', '哦', '啊', '哈', '对', '错', '行', '好的', '是的', '没有', '好吧', '原来如此', '没事', '差不多', '不知道', '随便', '1', '2', 'ok', 'no', 'yes'];
    if (noiseWords.includes(u.toLowerCase())) return false;

    // Core keyword filters
    const keywords = ['记住', '忘记', '生日', '名字', '叫我', '职业', '工作', '宠物', '喜欢', '讨厌', '爱', '恨', '打算', '计划', '下周', '明天', '今天', '旅行', '准备', '考试', '累', '难过', '伤心', '开心', '生病', '秘密', '我们', '家庭', '朋友', '以前', '最近', '目前', '发现', '其实我'];
    
    // Substantially long user inputs (indicating a narrative/story) or very long AI replies likely contain core memory nodes
    if (u.length > 45 || r.length > 120) return true;
    
    return keywords.some(kw => u.includes(kw) || r.includes(kw));
  },

  async enqueueMemoryAnalysis(userText, aiReply, memberId) {
    if (!userText || !aiReply) return;
    const activeAi = memberId || 'main';

    this._buffer.push({ userText, aiReply, activeAi, ts: Date.now() });
    console.log(`[MemoryOrchestration] Enqueued dialogue chunk (size: ${this._buffer.length})`);

    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
    }

    // Debounce: Wait 7 seconds after the last message to consolidate and update memories
    this._timeoutId = setTimeout(async () => {
      this._timeoutId = null;
      await this.processConsolidatedBuffer();
    }, 7000);
  },

  async processConsolidatedBuffer() {
    if (this._processing || this._buffer.length === 0) return;
    this._processing = true;

    const currentBuffer = [...this._buffer];
    this._buffer = []; // Reset the buffer

    console.log(`[MemoryOrchestration] Executing consolidated memory extraction on ${currentBuffer.length} exchanges.`);

    try {
      // Step 1: Detect if any message in the batch warrants high-fidelity LLM extraction
      let deservesLLM = false;
      for (const item of currentBuffer) {
        if (this.shouldRunLLM(item.userText, item.aiReply)) {
          deservesLLM = true;
          break;
        }
      }

      const lastItem = currentBuffer[currentBuffer.length - 1];
      const combinedUserText = currentBuffer.map(item => item.userText).join('\n');
      const combinedAiReply = currentBuffer.map(item => item.aiReply).join('\n');

      if (!deservesLLM) {
        console.log(`[MemoryOrchestration] Dialogue block classified as routine chit-chat. Running fast local rule extraction.`);
        // Fallback locally to update relationship metrics dynamically
        if (typeof fallbackExtractEvent === 'function') {
          const rawFallback = fallbackExtractEvent(lastItem.userText, lastItem.aiReply, lastItem.activeAi);
          try {
            const eventData = JSON.parse(rawFallback);
            if (eventData && eventData.hasEvent && typeof processExtractedEvent === 'function') {
              await processExtractedEvent(eventData, lastItem.activeAi);
            }
          } catch(e) {}
        }
        this._processing = false;
        return;
      }

      // Step 2: Use a single consolidated LLM call to process the entire dialogue block
      console.log(`[MemoryOrchestration] Running high-fidelity LLM extraction for consolidated dialogue.`);
      const aiName = (typeof memberById === 'function') ? (memberById(lastItem.activeAi)?.name || 'AI') : 'AI';
      const isGroupChat = document.getElementById('groupPanel')?.classList.contains('show') || lastItem.activeAi === 'group';

      const systemPrompt = `你是一个高精度的认知记忆、生活轨迹与世界事实捕获器 (Memory & Life Map Extractor)。
分析最近发生的一段连续对话内容。
判断其中是否包含值得长期记住的重要【事件】、【用户稳定偏好/特质】、或【深层情感波动】。

【🌌 共享世界记忆能见度规则 (Visibility Policy)】
根据对话内容的性质，将记忆精确归类到以下 5 个能见度级别（visibility）之一：
1. "world"：100% 同步的【共享世界/生活事件与偏好】。包含：
   - 用户的稳定偏好、日常核心习惯（例如：每天喝冰美式、深夜写代码、喜欢去健身房、讨厌吃香菜）。
   - 人生重大事件：工作/求职转型、搬家/房产变迁、恋爱、考试、旅行规划、宠物健康、作息等。
   - 【关键规则】：所有 AI 伴侣都应当共同知晓这些世界事件，以使其生活在“同一个世界中”。
2. "chronicle"：【岁月年鉴里程碑】。具有极其重大、可作为长期成长印记的共同经历（如克服特大困难，表白成功等）。
3. "relationship"：【关系专属记忆】。用户与特定 AI【${aiName}】之间的专属互动、撒娇、私密倾诉。仅【${aiName}】和【主AI】可共同检索（其他副AI不可见）。
4. "private"：【绝对私密秘密】。当用户明确声称“这只是我们俩的秘密”或“这事不要告诉别人”时，仅【${aiName}】可见。
5. "archive"：【长期备用归档】。

另外，请顺便抓取用户当前的【生活地图与意向锚点 (Active Life Map)】更新：
1. 持续经历的生活事件/近期推进的故事线 (如：准备期末物理考试、计划10月日本游)
2. 重要核心事物/偏好/情感锚点 (如：养了一只叫糯米的猫、每天必须喝冰美式)

请严格返回如下 JSON 格式数据，不得包含任何 Markdown 标记或多余文字。
若没有发现任何具有记录价值的事实，请直接返回 {"hasEvent": false}。

JSON 格式要求：
{
  "hasEvent": true,
  "type": "preference_sharing" | "emotional_disclosure" | "joint_activity" | "general",
  "summary": "一句高度提炼且拟真的人性化中文陈述（不超过35字）",
  "importance": 0到100之间的整数 (情感越深、事实越稳定、分数越高),
  "visibility": "private" | "relationship" | "world" | "chronicle" | "archive",
  "relationship_impact": {
    "intimacy": -10到15之间的整数,
    "trust": -10到15之间的整数
  },
  "life_map_update": {
    "hasUpdate": true,
    "category": "threads" (近期生活故事线) | "objects" (情感与偏好锚点),
    "title": "极简名片级描述（不超过18字，如：正准备秋季日本旅行 / 深夜独自写代码）"
  }
}`;

      const conversationText = `【合并对话段落 (共 ${currentBuffer.length} 次往返)】\n${currentBuffer.map(item => {
        const itemAiName = (typeof memberById === 'function') ? (memberById(item.activeAi)?.name || 'AI') : 'AI';
        return `用户: "${item.userText}"\n${itemAiName}: "${item.aiReply}"`;
      }).join('\n')}`;

      let rawResponse = '';
      try {
        rawResponse = await llmComplete([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationText }
        ], { temperature: 0.1 });
      } catch (e) {
        console.warn('[MemoryOrchestration] Consolidated LLM failed, using fallback', e);
        if (typeof fallbackExtractEvent === 'function') {
          rawResponse = fallbackExtractEvent(lastItem.userText, lastItem.aiReply, lastItem.activeAi);
        }
      }

      let eventData = null;
      try {
        let cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        eventData = JSON.parse(cleanJson);
      } catch (e) {
        try {
          if (typeof fallbackExtractEvent === 'function') {
            eventData = JSON.parse(fallbackExtractEvent(lastItem.userText, lastItem.aiReply, lastItem.activeAi));
          }
        } catch(fallbackErr) {
          eventData = { hasEvent: false };
        }
      }

      if (eventData && eventData.hasEvent) {
        if (isGroupChat && eventData.visibility !== 'chronicle' && eventData.visibility !== 'archive') {
          eventData.visibility = 'world';
        }
        if (typeof processExtractedEvent === 'function') {
          await processExtractedEvent(eventData, lastItem.activeAi);
          console.log(`[MemoryOrchestration] Successfully processed event: ${eventData.summary}`);
        }
      }
    } catch (err) {
      console.error('[MemoryOrchestration] Consolidated buffer execution error:', err);
    } finally {
      this._processing = false;
    }
  }
};
