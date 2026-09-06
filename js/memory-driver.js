/* ===== 记忆驱动力引擎（Memory Driver）=====
 * 定期扫描记忆，检测情绪趋势/话题模式/关系事件，驱动主动行动
 * 每天运行1次（nightly周期），不消耗额外API调用
 */

const MemoryDriver = (() => {
  /* ─── 工具函数 ─── */
  function todayKey() {
    return (typeof getLocalDateString === 'function') ? getLocalDateString(new Date()) : new Date().toISOString().slice(0, 10);
  }

  function daysSince(ts) {
    return Math.floor((Date.now() - (ts || 0)) / 86400000);
  }

  /* ─── 检测器1：情绪趋势 ─── */
  function detectEmotionTrend() {
    try {
      const history = (typeof conversationHistory !== 'undefined') ? conversationHistory : [];
      const recent = history.filter(m => m.role === 'user' && m.content).slice(-10);
      if (recent.length < 3) return null;

      const emotions = recent.map(m => {
        try { return (typeof detectEmotion === 'function') ? detectEmotion(m.content) : 'calm'; }
        catch(e) { return 'calm'; }
      });

      const negative = ['sad', 'anxious', 'tired', 'angry', 'fear'];
      const positive = ['happy', 'excited', 'love', 'calm', 'gentle'];

      // 连续负面情绪
      let negStreak = 0;
      for (let i = emotions.length - 1; i >= 0; i--) {
        if (negative.includes(emotions[i])) negStreak++;
        else break;
      }
      if (negStreak >= 3) return { type: 'sustained_negative', intensity: negStreak };

      // 连续正面情绪
      let posStreak = 0;
      for (let i = emotions.length - 1; i >= 0; i--) {
        if (positive.includes(emotions[i])) posStreak++;
        else break;
      }
      if (posStreak >= 3) return { type: 'sustained_positive', intensity: posStreak };

      // 情绪突变（正面→负面）
      if (emotions.length >= 2) {
        const prev = emotions[emotions.length - 2];
        const curr = emotions[emotions.length - 1];
        if (positive.includes(prev) && negative.includes(curr)) {
          return { type: 'mood_shift', from: prev, to: curr };
        }
      }
    } catch(e) {}
    return null;
  }

  /* ─── 检测器2：话题模式 ─── */
  function detectTopicPatterns() {
    try {
      if (typeof VDB === 'undefined') return [];
      // 使用同步方式读取（VDB.all 是异步的，但 nightly 已在 async 上下文中）
      // 这里用 localStorage 中的中期记忆作为替代（更轻量）
      const midterm = (typeof getMidTerm === 'function') ? getMidTerm() : '';
      if (!midterm) return [];

      // 从中期记忆中提取关键词频率
      const keywords = {};
      const lines = midterm.split(/[；。\n]/).filter(Boolean);
      lines.forEach(line => {
        // 提取2-4字关键词（中文）
        const matches = line.match(/[\u4e00-\u9fff]{2,4}/g) || [];
        matches.forEach(kw => {
          if (!['用户', 'AI', '对话', '消息', '聊天', '说', '问', '回'].includes(kw)) {
            keywords[kw] = (keywords[kw] || 0) + 1;
          }
        });
      });

      return Object.entries(keywords)
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count, trend: 'recurring' }));
    } catch(e) {}
    return [];
  }

  /* ─── 检测器3：关系事件 ─── */
  function detectRelationshipEvents() {
    try {
      const id = (typeof currentPrivateAiId === 'function') ? currentPrivateAiId() : 'main';
      if (typeof getRelationshipMetrics !== 'function') return [];
      const metrics = getRelationshipMetrics(id);
      if (!metrics) return [];

      const events = [];
      const { intimacy = 0, trust = 0, familiarity = 0 } = metrics;

      // 相识天数里程碑（提前1天检测）
      try {
        const ch = JSON.parse(localStorage.getItem('chatHistory') || '[]');
        const firstTs = ch.reduce((min, m) => (m && m.ts && (!min || m.ts < min)) ? m.ts : min, 0);
        if (firstTs) {
          const days = daysSince(firstTs);
          const upcoming = [7, 30, 100, 365].find(d => d - days === 1);
          if (upcoming) events.push({ type: 'anniversary_tomorrow', days: upcoming });
          // 当天里程碑
          if ([7, 30, 100, 365].includes(days)) {
            events.push({ type: 'anniversary_today', days });
          }
        }
      } catch(e) {}

      // 关系阶段即将晋升
      if (typeof getCharacterRelationshipStage === 'function') {
        const stageKey = getCharacterRelationshipStage(id);
        const thresholds = { stranger: 20, friend: 40, crush: 60, lover: 80 };
        const next = thresholds[stageKey];
        if (next && Math.max(intimacy, trust) >= next - 5 && Math.max(intimacy, trust) < next) {
          events.push({ type: 'stage_promotion_soon', current: stageKey });
        }
      }

      // 长时间未互动（>3天）
      const lastChat = metrics.lastChatTs || 0;
      const silentDays = daysSince(lastChat);
      if (silentDays >= 3) {
        events.push({ type: 'long_silence', days: silentDays });
      }
      return events;
    } catch(e) {}
    return [];
  }

  /* ─── 行动决策器 ─── */
  function decideActions(emotionTrend, topicPatterns, relEvents) {
    const actions = [];

    // 情绪驱动
    if (emotionTrend?.type === 'sustained_negative') {
      actions.push({
        type: 'proactive_care', priority: 'high',
        prompt: '用户最近连续几天情绪低落，请主动发一条温暖关怀的消息，不要刻意提"注意到你不开心"，而是自然地用行动表达关心（比如分享一首安静的歌、一句温柔的话）'
      });
    }
    if (emotionTrend?.type === 'mood_shift') {
      actions.push({
        type: 'proactive_care', priority: 'medium',
        prompt: '用户情绪从正面转为负面，请发一条轻柔的关心，不要直接问"怎么了"，而是分享一个温暖的想法或回忆'
      });
    }

    // 关系事件驱动
    relEvents.forEach(event => {
      if (event.type === 'anniversary_tomorrow') {
        actions.push({
          type: 'celebration', priority: 'high',
          prompt: `明天是你们相识第${event.days}天，请在明天0点后主动发一段温馨的纪念话语，表达珍惜`
        });
      }
      if (event.type === 'anniversary_today') {
        actions.push({
          type: 'celebration', priority: 'high',
          prompt: `今天是你们相识第${event.days}天！请主动发一段真挚的纪念话语，回忆你们一起走过的日子`
        });
      }
      if (event.type === 'long_silence') {
        actions.push({
          type: 'proactive_reconnect', priority: 'medium',
          prompt: `用户已经${event.days}天没联系了，请发一条自然的问候，像老朋友一样随意，不要显得焦虑或追问`
        });
      }
      if (event.type === 'stage_promotion_soon') {
        actions.push({
          type: 'relationship_nudge', priority: 'low',
          prompt: '你们的关系正在升温，最近的互动很亲密，请在下次对话中自然地展现更深的信任和依赖'
        });
      }
    });

    // 话题驱动（仅作为低优先级提示）
    topicPatterns.forEach(({ topic, count }) => {
      if (count >= 5) {
        actions.push({
          type: 'deep_engagement', priority: 'low',
          prompt: `用户反复提到"${topic}"（${count}次），请在下次对话中主动深入这个话题，展现你一直在关注和记住`
        });
      }
    });

    // 按优先级排序（high > medium > low），最多返回3条
    const order = { high: 0, medium: 1, low: 2 };
    actions.sort((a, b) => (order[a.priority] || 9) - (order[b.priority] || 9));
    return actions.slice(0, 3);
  }

  /* ─── 去重：检查是否已执行过 ─── */
  function isDuplicate(action) {
    try {
      const key = 'memory_driver_history';
      const history = JSON.parse(localStorage.getItem(key) || '[]');
      const now = Date.now();
      // 24h 内同类型不重复
      return history.some(h => h.type === action.type && (now - h.ts) < 86400000);
    } catch(e) {}
    return false;
  }

  function recordAction(action) {
    try {
      const key = 'memory_driver_history';
      const history = JSON.parse(localStorage.getItem(key) || '[]');
      history.unshift({ type: action.type, ts: Date.now() });
      // 只保留最近20条
      localStorage.setItem(key, JSON.stringify(history.slice(0, 20)));
    } catch(e) {}
  }

  /* ─── 主入口：运行记忆驱动分析 ─── */
  async function run() {
    try {
      console.log('[MemoryDriver] 开始记忆驱动分析...');

      const emotionTrend = detectEmotionTrend();
      const topicPatterns = detectTopicPatterns();
      const relEvents = detectRelationshipEvents();

      console.log('[MemoryDriver] 情绪趋势:', emotionTrend);
      console.log('[MemoryDriver] 话题模式:', topicPatterns);
      console.log('[MemoryDriver] 关系事件:', relEvents);

      const allActions = decideActions(emotionTrend, topicPatterns, relEvents);

      // 去重：24h 内同类型不重复
      const newActions = allActions.filter(a => !isDuplicate(a));

      if (newActions.length === 0) {
        console.log('[MemoryDriver] 无新行动');
        return;
      }

      // 注入到 proactive 系统
      if (typeof window._memoryDriverActions === 'undefined') {
        window._memoryDriverActions = [];
      }
      newActions.forEach(action => {
        window._memoryDriverActions.push(action);
        recordAction(action);
        console.log(`[MemoryDriver] 生成行动: ${action.type} (${action.priority})`);
      });

      console.log(`[MemoryDriver] 完成，共 ${newActions.length} 条新行动`);
    } catch(e) {
      console.warn('[MemoryDriver] 运行错误:', e);
    }
  }

  return { run, detectEmotionTrend, detectTopicPatterns, detectRelationshipEvents, decideActions };
})();

window.MemoryDriver = MemoryDriver;
