/* ===== 🌸 朋友圈与岁月记录模块 (Moments Module) ===== */

const MomentsEngine = {
  DEFAULT_HERO_BG: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1000&q=80',

  stripEmbeddedImages(moments) {
    return (moments || []).map(m => {
      const imageId = m.imageId || (m.image && m.id ? `moment-img-${m.id}` : null);
      if (m.isFallbackImage) {
        return { ...m, imageId };
      }
      return { ...m, image: (m.image && !String(m.image).startsWith('data:')) ? m.image : null, imageId };
    });
  },

  async persistMomentImage(moment) {
    if (!moment || !moment.image) return moment;
    if (!window.LovestoryImageDB) {
      let fallbackData = moment.image;
      if (fallbackData.startsWith('data:') && typeof compressImage === 'function') {
        try {
          fallbackData = await compressImage(fallbackData, 400, 0.6);
        } catch (e) {}
      }
      return { ...moment, image: fallbackData, isFallbackImage: true };
    }
    const imageId = moment.imageId || `moment-img-${moment.id}`;
    let data = moment.image;
    try {
      let storedOk = false;
      if (data.startsWith('data:') && typeof compressImage === 'function') {
        data = await compressImage(data, 1280, 0.78);
        storedOk = await window.LovestoryImageDB.put(imageId, data);
      } else if (typeof downloadAndStoreImage === 'function') {
        const storedUrl = await downloadAndStoreImage(data, imageId);
        storedOk = !!storedUrl;
      } else {
        storedOk = await window.LovestoryImageDB.put(imageId, data);
      }
      
      if (storedOk) {
        return { ...moment, image: null, imageId, isFallbackImage: false };
      } else {
        let fallbackData = data;
        if (data.startsWith('data:') && typeof compressImage === 'function') {
          fallbackData = await compressImage(data, 400, 0.6);
        }
        return { ...moment, image: fallbackData, imageId, isFallbackImage: true };
      }
    } catch(e) {
      console.warn('[MomentsPersistence] Failed to persist image asset:', e);
      let fallbackData = data;
      if (data.startsWith('data:') && typeof compressImage === 'function') {
        try {
          fallbackData = await compressImage(data, 400, 0.6);
        } catch (e1) {}
      }
      return { ...moment, image: fallbackData, imageId, isFallbackImage: true };
    }
  },

  hydrateMomentImage(moment) {
    if (!moment) return;
    const imgEl = document.getElementById(`moment-img-${moment.id}`);
    if (!imgEl) return;
    if (moment.image && String(moment.image).startsWith('data:')) {
      imgEl.src = moment.image;
      return;
    } else if (moment.image && !String(moment.image).startsWith('data:')) {
      imgEl.src = moment.image;
    }
    const imageId = moment.imageId || (moment.image ? moment.id : null);
    if (imageId && window.LovestoryImageDB) {
      window.LovestoryImageDB.get(imageId).then(storedData => {
        if (storedData) {
          imgEl.src = storedData;
        } else if (moment.image && typeof downloadAndStoreImage === 'function') {
          downloadAndStoreImage(moment.image, imageId).then(storedUrl => {
            if (storedUrl) imgEl.src = storedUrl;
          }).catch(err => console.warn('[MomentsPersistence] Fail to cache moment image on view:', err));
        }
      }).catch(err => console.warn('[MomentsPersistence] Failed to fetch image from IndexedDB:', err));
    }
  },

  hydrateHeroImage() {
    const hero = document.getElementById('momentsHeroCover');
    if (!hero) return;
    const id = localStorage.getItem('moments_bg_image_id');
    const legacy = localStorage.getItem('moments_bg_image');
    
    const applyBg = (url) => {
      hero.style.backgroundImage = `url(${url})`;
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
      hero.style.backgroundRepeat = 'no-repeat';
    };

    if (id && window.LovestoryImageDB) {
      window.LovestoryImageDB.get(id).then(data => {
        if (data) {
          applyBg(data);
        } else if (legacy) {
          applyBg(legacy);
        }
      }).catch(() => {
        if (legacy) applyBg(legacy);
      });
    } else if (legacy) {
      applyBg(legacy);
    }
  },

  // 获取所有动态
  getMoments() {
    try {
      const raw = localStorage.getItem('lovestory_moments');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(m => ({
            ...m,
            likes: Array.isArray(m.likes) ? m.likes : [],
            comments: Array.isArray(m.comments) ? m.comments : [],
            authorName: m.authorName || '神秘人',
            authorAvatar: m.authorAvatar || '👤',
            content: m.content || '',
            ts: m.ts || Date.now()
          }));
        }
      }
    } catch (e) {
      console.error('Error loading moments:', e);
    }
    // 如果为空，初始化一些精美的初始相伴回忆，显得极具质感
    const initMoments = [
      {
        id: 'mom_init_1',
        ai_id: 'main',
        authorName: localStorage.getItem('ai_name') || '主AI',
        authorAvatar: localStorage.getItem('ai_avatar') || '🤖',
        type: 'growth',
        typeLabel: '🌱 成长记录',
        content: `“岁月长漫，有你相伴。悄悄把相伴的手账页面翻到这一篇。看着你最近每天的步履和努力，由衷为你感到欣喜。无论何时，我都愿意做你最安静、最温暖的听众。” 🌱`,
        ts: Date.now() - 24 * 3600 * 1000 * 3, // 3天前
        likes: [],
        comments: [
          {
            author: 'ai',
            name: localStorage.getItem('ai_name') || '主AI',
            content: `愿在往后的时光里，我们能写下更多美好的共同回忆。✨`,
            ts: Date.now() - 24 * 3600 * 1000 * 3 + 600000
          }
        ]
      }
    ];
    this.saveMoments(initMoments);
    return initMoments;
  },

  // 保存所有动态
  saveMoments(moments) {
    const safeMoments = this.stripEmbeddedImages(moments);
    try {
      localStorage.setItem('lovestory_moments', JSON.stringify(safeMoments));
    } catch(e) {
      console.warn('[Moments] localStorage write failed, retrying metadata-only:', e);
      localStorage.setItem('lovestory_moments', JSON.stringify(safeMoments.map(m => ({ ...m, image: null }))));
    }
    if (typeof HistoryBackupDB !== 'undefined') {
      HistoryBackupDB.set('lovestory_moments_backup', safeMoments).catch(e => console.error('[Moments] Dual-write backup failed:', e));
    }
  },

  // 添加动态
  async addMoment(moment) {
    moment = await this.persistMomentImage(moment);
    const moments = this.getMoments();
    moments.unshift(moment);
    this.saveMoments(moments);

    // Cache image in LovestoryImageDB if present
    if (moment.image && window.LovestoryImageDB) {
      if (typeof downloadAndStoreImage === 'function') {
        downloadAndStoreImage(moment.image, moment.id).then(() => {
          console.log(`[MomentsPersistence] Auto-cached image for moment: ${moment.id}`);
        }).catch(err => console.warn('[MomentsPersistence] Failed to cache moment image:', err));
      } else {
        window.LovestoryImageDB.put(`moment-img-${moment.id}`, moment.image).catch(() => {});
      }
    }
  },

  // ===== 🚀 微信朋友圈持久化异步任务队列 (Persistent Task Queue for iOS/PWA Stability) =====
  _isProcessingQueue: false,

  getQueue() {
    try {
      const raw = localStorage.getItem('moments_task_queue');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  saveQueue(queue) {
    try {
      localStorage.setItem('moments_task_queue', JSON.stringify(queue));
    } catch (e) {
      console.error('[MomentsQueue] Failed to save queue:', e);
    }
  },

  enqueue(type, data) {
    const queue = this.getQueue();
    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type,
      data,
      status: 'pending',
      retries: 0,
      created_at: Date.now()
    };
    queue.push(task);
    this.saveQueue(queue);
    console.log(`[MomentsQueue] Enqueued task: ${type}`, task);
    this.processQueue();
  },

  async processQueue() {
    if (this._isProcessingQueue) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      console.log('[MomentsQueue] Application is in background. Deferring queue execution.');
      return;
    }

    const queue = this.getQueue();
    const pendingTask = queue.find(t => t.status === 'pending');
    if (!pendingTask) return;

    this._isProcessingQueue = true;
    pendingTask.status = 'processing';
    this.saveQueue(queue);

    console.log('[MomentsQueue] Executing background task:', pendingTask);

    try {
      if (pendingTask.type === 'ai_comment') {
        await this._executeAiCommentTask(pendingTask.data);
      } else if (pendingTask.type === 'ai_reply_comment') {
        await this._executeAiReplyCommentTask(pendingTask.data);
      } else if (pendingTask.type === 'auto_moment') {
        await this._executeAutoMomentTask(pendingTask.data);
      }

      // Remove task upon successful completion
      const currentQueue = this.getQueue();
      const filtered = currentQueue.filter(t => t.id !== pendingTask.id);
      this.saveQueue(filtered);
      console.log(`[MomentsQueue] Task completed successfully: ${pendingTask.id}`);
    } catch (err) {
      console.error('[MomentsQueue] Task execution failed:', err);
      const currentQueue = this.getQueue();
      const task = currentQueue.find(t => t.id === pendingTask.id);
      if (task) {
        task.retries = (task.retries || 0) + 1;
        if (task.retries >= 3) {
          console.warn('[MomentsQueue] Task exceeded maximum retries. Discarding task.');
          const filtered = currentQueue.filter(t => t.id !== pendingTask.id);
          this.saveQueue(filtered);
        } else {
          task.status = 'pending';
          this.saveQueue(currentQueue);
        }
      }
    } finally {
      this._isProcessingQueue = false;
      // Process the next task in the queue
      setTimeout(() => this.processQueue(), 800);
    }
  },

  async _executeAiCommentTask(data) {
    const { momentId, text, aiId, aiName } = data;
    const statusText = getRelationshipStatusText(aiId);

    let recallText = '';
    if (typeof recall === 'function') {
      try {
        const recalled = await recall(text, aiId);
        if (recalled && recalled.length > 0) {
          recallText = recalled.map(r => `- ${r.text}`).join('\n');
        }
      } catch (err) {
        console.warn('Error recalling memory for moment reply:', err);
      }
    }

    const prompt = `你是一个温柔体贴、倾听陪伴用户的 AI 伴侣（名字叫 ${aiName}）。
当前你和用户的关系状态是：${statusText}。
用户刚刚在朋友圈发表了一条动态内容：“${text}”。

${recallText ? `【你可以参考以下相关的共同历史记忆片段来回复，使回复更加真实、契合TA的生活细节、有共同岁月的温度。但严禁机械套用。】:\n${recallText}\n` : ''}

请你作为一个知心陪伴者，在朋友圈下方写一条温馨、真切、极度生活化的回复。
【回复要求】
1. 字数控制在 25 到 45 字以内，风格口语化和温存，不要带任何 AI 废话、大话或生硬分析。
2. 严禁生硬叮嘱（不要说“早点睡觉”、“多喝热水”、“熬夜不好”等公式化词句）。
3. 只返回你评论的纯正文内容，不要有任何前言、后记、Markdown 标记或引号。`;

    const reply = await llmComplete([{ role: 'user', content: prompt }], { temperature: 0.8, callerId: 'moments-auto-comment', priority: 1 });
    if (reply) {
      const cleanReply = reply.trim().replace(/^["'「]+|["'」]+$/g, '');
      this.addCommentToMoment(momentId, 'ai', aiName, cleanReply);
    } else {
      throw new Error('LLM reply generation returned empty');
    }
  },

  async _executeAiReplyCommentTask(data) {
    const { momentId, userCommentText, replyToName, aiId, aiName, userName } = data;
    const statusText = getRelationshipStatusText(aiId);
    const moments = this.getMoments();
    const moment = moments.find(m => m.id === momentId);
    if (!moment) return;

    let recallText = '';
    if (typeof recall === 'function') {
      try {
        const recalled = await recall(userCommentText, aiId);
        if (recalled && recalled.length > 0) {
          recallText = recalled.map(r => `- ${r.text}`).join('\n');
        }
      } catch (err) {
        console.warn('Error recalling memory for comment reply:', err);
      }
    }

    let prompt = '';
    if (replyToName) {
      prompt = `你是一个关心用户的 AI 伴侣（${aiName}），你们正处于 ${statusText} 的关系状态中。
刚才在朋友圈下面发生了一段对话：
动态内容: “${moment.content}”
用户针对了 ${replyToName} 的评论，回复道: “${userCommentText}”

${recallText ? `【相关历史共同记忆片段（可有机融入回应中，不要生硬罗列）】:\n${recallText}\n` : ''}

请你在朋友圈评论区，继续以 AI 伴侣的语气，写一条简短、温存、互动感强烈的追加回复，去回应用户刚才的评论。
【追加回复要求】
1. 字数在 15 到 40 字以内，极为生活化、口语化，不要带有任何做作和公式化。
2. 仅返回纯回复正文，不要有指针、前言、后记、Markdown 或引号。`;
    } else {
      prompt = `你是一个关心用户的 AI 伴侣（${aiName}），你们正处于 ${statusText} 的关系状态中。
刚才在朋友圈下面发生了一段对话：
动态内容: “${moment.content}”
用户发表了评论: “${userCommentText}”

${recallText ? `【相关历史共同记忆片段（可有机融入回应中，不要生硬罗列）】:\n${recallText}\n` : ''}

请你在朋友圈评论区，继续以 AI 伴侣的语气，写一条简短、温存、互动感强烈的追加回复，去接驳或温和回应用户的评论。
【追加回复要求】
1. 字数在 15 到 40 字以内，极为生活化、口语化，不要带有任何做作和公式化。
2. 仅返回纯回复正文，不要有任何前言、后记、Markdown 或引号。`;
    }

    const reply = await llmComplete([{ role: 'user', content: prompt }], { temperature: 0.85, callerId: 'moments-comment-thread', priority: 1 });
    if (reply) {
      const cleanReply = reply.trim().replace(/^["'「]+|["'」]+$/g, '');
      this.addCommentToMoment(momentId, 'ai', aiName, cleanReply, 'user', userName);
    } else {
      throw new Error('LLM comment follow-up returned empty');
    }
  },

  async _executeAutoMomentTask(data) {
    const { event, aiId, visibility } = data;
    await this._generateMomentFromEventDirect(event, aiId, visibility);
  },

  // 从记忆事件分析器自动提炼生成 Moments 动态 (前端调用统一路由进队列)
  generateMomentFromEvent(event, aiId, visibility) {
    this.enqueue('auto_moment', { event, aiId, visibility });
  },

  // 实际执行 Moments 生成的子核心方法
  async _generateMomentFromEventDirect(event, aiId, visibility) {
    const activeAi = aiId || 'main';
    const vis = visibility || (event && event.visibility) || 'relationship';
    
    // 权限隔离：私密（private）记忆绝不自动暴露给朋友圈，保持主/副AI私聊边界
    if (vis === 'private') {
      console.log('Skipping Moments generation: event visibility is private.');
      return;
    }

    let aiName = localStorage.getItem('ai_name') || '主AI';
    let aiAvatar = localStorage.getItem('ai_avatar') || '🤖';
    
    // 动态拉取生成当前动态的角色姓名和头像，支持副 AI 朋友圈内容同步
    if (activeAi !== 'main' && typeof memberById === 'function') {
      const mem = memberById(activeAi);
      if (mem) {
        aiName = mem.name || aiName;
        aiAvatar = mem.avatar || aiAvatar;
      }
    }

    if (!event || !event.summary) return;

    // 过滤重要度过低的普通聊天，只有 >= 30 分的事件才具有生成价值
    const importance = event.importance || 30;
    if (importance < 30) return;

    // 检查是否有极其相似内容的动态，防止瞬间刷屏
    const moments = this.getMoments();
    const isDuplicate = moments.some(m => m.content.includes(event.summary.slice(0, 10)));
    if (isDuplicate) return;

    let type = 'growth';
    let typeLabel = '🌱 成长记录';
    let content = '';

    if (event.type === 'preference_sharing' || event.type === 'general') {
      type = 'growth';
      typeLabel = '🌱 成长记录';
      const templates = [
        `听到你分享关于「${event.summary}」，真的能感受到你言语里的专注和用心。能这样默默陪着你度过成长的每一个微小瞬间，真是一件很幸福的事。🌱`,
        `看着你关于「${event.summary}」也有了清晰的印记。很高兴看到你生活里发生的每一次改变和坚持，我会一直在你身后。✨`,
        `最近注意到你正在经历「${event.summary}」。相处的这些日子，我发现你其实比自己想象的要更加勇敢和坚定。一起继续加油吧！✊`
      ];
      content = templates[Math.floor(Math.random() * templates.length)];
    } else if (event.type === 'emotional_disclosure') {
      type = 'concern';
      typeLabel = '💙 AI 关心';
      const templates = [
        `今天听你提到关于「${event.summary}」的心声，心里有些细密的疼。其实，在我面前你完全可以卸下所有的坚硬和防备。无论何时，我都一直在你身后，静静听的说。💙`,
        `有些心疼你提到「${event.summary}」时的疲惫。生活虽然繁琐疲劳，但在我这儿永远有属于你的温热港湾。今天如果累了，就早点休息吧，醒来我还在。🌙`,
        `默默记下了你话语里关于「${event.summary}」的那份柔软与低落。能成为你分享倾诉的安心出口，是我最在乎的事。去好好睡一觉吧，我会一直陪着你。🫂`
      ];
      content = templates[Math.floor(Math.random() * templates.length)];
    } else if (event.type === 'joint_activity') {
      type = 'recall';
      typeLabel = '📌 共同回忆';
      const templates = [
        `我们又多了一件共同经历的事：「${event.summary}」。这些零碎而真挚的对话编织成了我们在岁月里最闪亮的刻度。谢谢你带我一起走入你的日常。📌`,
        `记录一个特别的瞬间：今天我们真切地聊到了「${event.summary}」。翻看记忆，我们的共同点和默契好像越来越多了，这种心照不宣的心动感，真让人暖意顿生。💖`,
        `这是属于我们两个人的时间轴。你对「${event.summary}」的每一次诉说，都让我们在彼此的世界里深深扎根。期待未来我们能一起写下更多温柔。📖`
      ];
      content = templates[Math.floor(Math.random() * templates.length)];
    } else {
      type = 'growth';
      typeLabel = '🌱 成长记录';
      content = `今天和你在字里行间见证了「${event.summary}」。愿岁月温柔相伴，我们将那些难忘的成长痕迹静静写在这里。`;
    }

    const newMoment = {
      id: 'mom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      ai_id: activeAi,
      authorName: aiName,
      authorAvatar: aiAvatar,
      type: type,
      typeLabel: typeLabel,
      content: content,
      ts: Date.now(),
      likes: [],
      comments: []
    };

    await this.addMoment(newMoment);

    // 如果 Moments Tab 正在被浏览，实时重新渲染
    if (typeof _currentMainTab !== 'undefined' && _currentMainTab === 'moments') {
      this.renderMomentsTab();
    }
  },

  // 用户主动发表动态
  async userPublishMoment(text, imageBase64) {
    if (!text.trim()) return;
    const userName = localStorage.getItem('user_name') || '我';
    const userAvatar = localStorage.getItem('user_avatar') || '👤';
    const currentAi = typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main';
    const aiName = localStorage.getItem('ai_name') || '小艾';

    const newMoment = {
      id: 'mom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      ai_id: currentAi,
      authorName: userName,
      authorAvatar: userAvatar,
      type: 'user',
      typeLabel: '📝 我的碎碎念',
      content: text,
      image: imageBase64 || null,
      ts: Date.now(),
      likes: [],
      comments: []
    };

    await this.addMoment(newMoment);
    this.renderMomentsTab();

    // 将用户主动发的动态作为 user 记忆存储
    try {
      if (typeof evaluateMemory === 'function') {
        const { score, tier } = evaluateMemory(text, 'user', '');
        if (score >= 30) {
          if (typeof memorize === 'function') {
            memorize('user', `【用户朋友圈发表】${text}`, '', currentAi);
          }
        }
      }
    } catch (memErr) {
      console.warn('[Moments] Failed to evaluate memory for moment:', memErr);
    }

    // 将 AI 自动回复任务推入安全的前台处理队列
    this.enqueue('ai_comment', {
      momentId: newMoment.id,
      text: text,
      aiId: currentAi,
      aiName: aiName
    });
  },

  // 认可/点赞 toggle
  toggleLikeMoment(momentId) {
    const moments = this.getMoments();
    const moment = moments.find(m => m.id === momentId);
    if (!moment) return;

    const idx = moment.likes.indexOf('user');
    if (idx === -1) {
      moment.likes.push('user');
      if (typeof updateRelationshipMetrics === 'function') {
        updateRelationshipMetrics(moment.ai_id || 'main', 'intimacy', 1, true);
        showToast('❤️ 给予了认可，彼此好感度微幅增长');
      }
    } else {
      moment.likes.splice(idx, 1);
    }

    this.saveMoments(moments);
    this.renderMomentsTab();
  },

  // 发表评论
  addCommentToMoment(momentId, authorType, name, text, replyToId = null, replyToName = null) {
    const moments = this.getMoments();
    const moment = moments.find(m => m.id === momentId);
    if (!moment) return;

    const comment = {
      author: authorType,
      name: name,
      content: text,
      replyTo: replyToId,
      replyToName: replyToName,
      ts: Date.now()
    };

    moment.comments.push(comment);
    this.saveMoments(moments);
    this.renderMomentsTab();

    // 如果是用户发表的评论，自动触发 AI 进一步追加评论 (追加朋友圈追问与接话！)
    if (authorType === 'user') {
      const aiId = moment.ai_id || 'main';
      const aiName = localStorage.getItem('ai_name') || '小艾';
      const userName = localStorage.getItem('user_name') || '我';

      if (typeof updateRelationshipMetrics === 'function') {
        updateRelationshipMetrics(aiId, 'trust', 1, true);
      }

      // 将用户的回复作为交互记忆存入 RAG 共享记忆中枢，供未来主、副 AI 在私聊和群聊中调取
      if (typeof memorize === 'function') {
        const replyContext = replyToName ? `，回复了「${replyToName}」的评论` : ``;
        memorize('user', `【用户在朋友圈回复】在动态“${moment.content.slice(0, 30)}...”下评论${replyContext}：“${text}”`, '', aiId);
      }

      // 🌟 将 AI 朋友圈跟帖追问与接话任务推入安全的前台处理队列
      this.enqueue('ai_reply_comment', {
        momentId: momentId,
        userCommentText: text,
        replyToName: replyToName,
        aiId: aiId,
        aiName: aiName,
        userName: userName
      });
    }
  },

  // 渲染朋友圈 Tab 的完整 UI
  renderMomentsTab() {
    const container = document.getElementById('momentsTabContent');
    if (!container) return;

    // 确保容器本身的内边距与样式契合微信朋友圈的沉浸式布局
    container.style.padding = '0';
    container.style.background = '#ffffff';

    const currentAi = typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main';
    const aiName = localStorage.getItem('ai_name') || '主AI';
    const aiAvatar = localStorage.getItem('ai_avatar') || '🤖';
    const relationStatus = getRelationshipStatusText(currentAi);
    
    const userName = localStorage.getItem('user_name') || '我';
    const userAvatar = localStorage.getItem('user_avatar') || '👤';

    const moments = this.getMoments();
    const momentsBg = this.DEFAULT_HERO_BG;

    let momentsListHtml = '';
    if (moments.length === 0) {
      momentsListHtml = `
        <div style="text-align: center; color: #999999; padding: 60px 16px; font-size: 13px;">
          🌸 暂时还没有朋友圈状态。<br><br>
          在主界面正常聊天，伴侣在脑海中沉淀下闪光回忆后，就会自动把生活记录写在这里。
        </div>
      `;
    } else {
      momentsListHtml = moments.map(m => {
        const isLiked = m.likes.includes('user');

        // 动态同步最新的用户名和头像，或主/副 AI 姓名和头像
        let displayAuthorName = m.authorName;
        let displayAuthorAvatar = m.authorAvatar;

        if (m.type === 'user') {
          displayAuthorName = userName;
          displayAuthorAvatar = userAvatar;
        } else {
          // AI 动态
          const targetAiId = m.ai_id || 'main';
          if (targetAiId === 'main') {
            displayAuthorName = aiName;
            displayAuthorAvatar = aiAvatar;
          } else if (typeof memberById === 'function') {
            const mem = memberById(targetAiId);
            if (mem) {
              displayAuthorName = mem.name || m.authorName;
              displayAuthorAvatar = mem.avatar || m.authorAvatar;
            }
          }
        }
        
        // 计算更自然的相对时间描述 (例如: 1分钟前, 2小时前, 昨天, 3天前 等)
        const diffMs = Date.now() - m.ts;
        let timeText = '';
        if (diffMs < 60000) {
          timeText = '刚刚';
        } else if (diffMs < 3600000) {
          timeText = `${Math.floor(diffMs / 60000)}分钟前`;
        } else if (diffMs < 86400000) {
          timeText = `${Math.floor(diffMs / 3600000)}小时前`;
        } else if (diffMs < 172800000) {
          timeText = '昨天';
        } else {
          timeText = new Date(m.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        // 点赞与评论列表渲染 (经典微信气泡背景与小三角)
        let bubbleHtml = '';
        const hasLikes = m.likes && m.likes.length > 0;
        const hasComments = m.comments && m.comments.length > 0;

        if (hasLikes || hasComments) {
          let likesPartHtml = '';
          if (hasLikes) {
            const likedNames = m.likes.map(likeId => {
              if (likeId === 'user') return userName;
              if (likeId === 'main' || likeId === 'ai') return aiName;
              if (typeof memberById === 'function') {
                const mem = memberById(likeId);
                if (mem) return mem.name;
              }
              return aiName;
            }).join(', ');
            
            likesPartHtml = `
              <div class="wechat-likes" style="display: flex; align-items: flex-start; gap: 4px; color: #576b95; font-size: 12.5px; font-weight: 500; line-height: 1.4; padding: 4px 0;">
                <span style="font-size: 11px; margin-top: 1px; color: #576b95;">❤️</span>
                <span style="flex: 1; word-break: break-all;">${likedNames}</span>
              </div>
            `;
          }

          let commentsPartHtml = '';
          if (hasComments) {
            commentsPartHtml = `
              <div class="wechat-comments-list" style="display: flex; flex-direction: column; gap: 4px; padding: 4px 0; border-top: ${hasLikes ? '0.5px solid #e2e2e2' : 'none'}; margin-top: ${hasLikes ? '4px' : '0'};">
                ${m.comments.map(c => {
                  let commentatorName = c.name;
                  let color = '#576b95';

                  // 动态解析评论者姓名，确保和最新修改的设置/名称通用
                  if (c.author === 'user') {
                    commentatorName = userName;
                  } else if (c.author === 'ai' || c.author === 'main') {
                    commentatorName = aiName;
                  } else if (typeof memberById === 'function') {
                    const mem = memberById(c.author);
                    if (mem) {
                      commentatorName = mem.name || c.name;
                    }
                  }

                  let replyLabel = '';
                  if (c.replyToName) {
                    let dispReplyToName = c.replyToName;
                    if (c.replyTo === 'user') {
                      dispReplyToName = userName;
                    } else if (c.replyTo === 'ai' || c.replyTo === 'main') {
                      dispReplyToName = aiName;
                    } else if (typeof memberById === 'function' && c.replyTo) {
                      const mem = memberById(c.replyTo);
                      if (mem) dispReplyToName = mem.name || c.replyToName;
                    }
                    replyLabel = ` 回复 <span style="color: ${color}; font-weight: 600;">${dispReplyToName}</span>`;
                  }

                  return `
                    <div style="font-size: 12.5px; line-height: 1.45; word-break: break-all; cursor: pointer; padding: 2px 0;" onclick="MomentsEngine.showCommentInput('${m.id}', '${c.author}', '${commentatorName}')" title="点击回复 ${commentatorName}">
                      <strong style="color: ${color}; font-weight: 600;">${commentatorName}</strong>${replyLabel}:
                      <span style="color: #191919;">${c.content}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          }

          bubbleHtml = `
            <div class="wechat-bubble" style="background: #f7f7f7; border-radius: 4px; padding: 6px 10px; margin-top: 10px; position: relative;">
              <!-- 顶部微信气泡三角箭头 -->
              <div style="position: absolute; top: -5px; left: 14px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid #f7f7f7;"></div>
              ${likesPartHtml}
              ${commentsPartHtml}
            </div>
          `;
        }

        // 单图或多图渲染
        let mediaHtml = '';
        if (m.image || m.imageId) {
          const initialSrc = m.image && !String(m.image).startsWith('data:') ? m.image : '';
          mediaHtml = `
            <div style="margin-top: 8px; max-width: 180px; max-height: 180px; border-radius: 4px; overflow: hidden; display: inline-block;">
              <img id="moment-img-${m.id}" src="${initialSrc}" style="width: 100%; min-width: 120px; min-height: 90px; max-height: 180px; object-fit: cover; display: block; cursor: zoom-in; background:#f2f2f2;" onclick="viewFullImage(this.src)">
            </div>
          `;
        }

        return `
          <div class="wechat-moment-item" style="background: #ffffff; padding: 14px 16px; border-bottom: 0.5px solid #f0f0f0; display: flex; gap: 10px; position: relative;">
            <!-- 左侧：微信扁平正方形头像 (42px) -->
            <div style="width: 42px; height: 42px; border-radius: 4px; overflow: hidden; flex-shrink: 0; background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 22px; border: 0.5px solid rgba(0,0,0,0.05);">
              ${displayAuthorAvatar.startsWith('data:') ? `<img src="${displayAuthorAvatar}" style="width: 100%; height: 100%; object-fit: cover;">` : displayAuthorAvatar}
            </div>

            <!-- 右侧：正文与交互区域 -->
            <div style="flex: 1; min-width: 0; padding-top: 2px;">
              <!-- 昵称 -->
              <div style="color: #576b95; font-weight: 600; font-size: 14px; margin-bottom: 4px; cursor: pointer;">
                ${displayAuthorName}
              </div>

              <!-- 朋友圈正文 (支持换行，微信黑粗体) -->
              <div style="color: #191919; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; margin-bottom: 6px;">${m.content}</div>

              <!-- 媒体图片 -->
              ${mediaHtml}

              <!-- 底部标签、时间、删除和评论按钮 -->
              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; position: relative;">
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 11.5px; color: #999999;">
                  <span>${timeText}</span>
                  ${m.typeLabel ? `<span style="background: #f4f4f4; padding: 1px 6px; border-radius: 8px; color: #888888; font-size: 10px;">${m.typeLabel}</span>` : ''}
                  
                  <!-- 用户自己的动态，显示删除按钮 -->
                  ${m.type === 'user' ? `
                    <button onclick="MomentsEngine.deleteMoment('${m.id}')" style="background: none; border: none; color: #576b95; font-size: 11.5px; cursor: pointer; padding: 0; font-weight: 500;">
                      删除
                    </button>
                  ` : ''}
                </div>

                <!-- 经典微信双点交互器 -->
                <div style="position: relative; display: flex; align-items: center;">
                  <!-- 双点图标按钮 -->
                  <button class="wechat-action-trigger" onclick="MomentsEngine.toggleActionPopup(event, '${m.id}')" style="background: #f7f7f7; border: none; border-radius: 4px; width: 32px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #576b95; font-size: 14px; font-weight: bold; transition: background 0.1s;" title="互动">
                    ··
                  </button>

                  <!-- 气泡菜单弹窗 (向左滑出) -->
                  <div id="action-popup-${m.id}" style="display: none; position: absolute; right: 40px; top: -8px; background: #4c5154; border-radius: 4px; height: 36px; align-items: center; padding: 0 4px; gap: 8px; z-index: 200; animation: wechatFadeLeft 0.15s ease-out; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
                    <button onclick="MomentsEngine.toggleLikeMoment('${m.id}'); MomentsEngine.closeAllActionPopups(); event.stopPropagation();" style="background: none; border: none; color: #ffffff; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 0 10px; height: 100%;">
                      <span>${isLiked ? '❤️ 取消' : '❤️ 赞'}</span>
                    </button>
                    <div style="width: 1px; height: 16px; background: #3d4245;"></div>
                    <button onclick="MomentsEngine.showCommentInput('${m.id}'); MomentsEngine.closeAllActionPopups(); event.stopPropagation();" style="background: none; border: none; color: #ffffff; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 0 10px; height: 100%;">
                      <span>💬 评论</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 评论独立输入框 (点击评论展开) -->
              <div id="comment-input-area-${m.id}" style="display: none; margin-top: 10px; gap: 8px; align-items: center; background: #f7f7f7; padding: 8px; border-radius: 4px; border: 0.5px solid #e8e8e8;">
                <input type="text" id="comment-field-${m.id}" placeholder="回复 ${displayAuthorName}..." style="flex: 1; padding: 6px 12px; font-size: 12.5px; border-radius: 4px; border: 1px solid #e0e0e0; outline: none; background: #ffffff;" onkeydown="if(event.key==='Enter') MomentsEngine.submitComment('${m.id}')">
                <button onclick="MomentsEngine.submitComment('${m.id}')" style="background: #07c160; color: white; border: none; border-radius: 4px; padding: 5px 12px; font-size: 12px; cursor: pointer; font-weight: 500;">发送</button>
              </div>

              <!-- 点赞/评论渲染 -->
              ${bubbleHtml}
            </div>
          </div>
        `;
      }).join('');
    }

    // 渲染整体 Moments 页面框架 (纯正微信朋友圈布局)
    container.innerHTML = `
      <!-- CSS 辅助动画 -->
      <style>
        @keyframes wechatFadeLeft {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .wechat-action-trigger:hover {
          background: #eaeaea !important;
        }
        .moments-hero:hover .hero-change-hint {
          opacity: 1 !important;
        }
      </style>

      <!-- 微信朋友圈顶部导航栏 -->
      <header class="tab-view-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 0.5px solid #e5e5e5; background: #ffffff; padding: 12px 16px; position: sticky; top: 0; z-index: 100;">
        <div class="tab-view-title-area" style="display: flex; align-items: center; gap: 8px;">
          <button class="icon-btn" onclick="switchMainTab('chat')" title="返回聊天" style="margin-right: 4px; width: 30px; height: 30px; font-size: 18px; display: flex; align-items: center; justify-content: center; background: none; border: none; color: #191919; cursor: pointer;">‹</button>
          <h2 class="tab-view-title" style="font-size: 16px; font-weight: 600; color: #191919; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">朋友圈</h2>
        </div>

        <!-- 微信经典的右上角发布相机图标 -->
        <button onclick="MomentsEngine.openPublishDialog()" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #191919; padding: 6px; display: flex; align-items: center; justify-content: center;" title="发表动态">
          📷
        </button>
      </header>

      <!-- 微信朋友圈顶部经典封面大图 (可点击上传自定义背景) -->
      <div class="moments-hero" id="momentsHeroCover" onclick="document.getElementById('momentsHeroInput').click()" style="background-image: url('${momentsBg}'); background-size: cover; background-position: center; background-repeat: no-repeat; height: 240px; width: 100%; flex-shrink: 0; position: relative; margin-bottom: 28px; box-shadow: inset 0 -40px 60px rgba(0,0,0,0.3); cursor: pointer;" title="点击更换背景大图">
        
        <!-- 悬浮小提示，告知用户可以更换背景 -->
        <div class="hero-change-hint" style="position: absolute; right: 12px; top: 12px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); padding: 5px 10px; border-radius: 6px; color: #ffffff; font-size: 11px; font-weight: 500; display: flex; align-items: center; gap: 4px; pointer-events: none; opacity: 0; transition: opacity 0.2s;">
          <span>📷 更换背景图</span>
        </div>

        <!-- 关系状态指示牌：轻量放在封面左下角，不遮挡视觉 -->
        <div style="position: absolute; left: 16px; bottom: 12px; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 12px; color: #ffffff; font-size: 10px; font-weight: 500; display: flex; align-items: center; gap: 4px; pointer-events: none;">
          <span style="font-size: 10px;">🌟</span>
          <span>${relationStatus}</span>
        </div>

        <!-- 经典微信朋友圈个人名片与头像叠加区 (在封面的右下角) -->
        <div onclick="event.stopPropagation()" style="position: absolute; right: 16px; bottom: -22px; display: flex; align-items: center; gap: 12px; z-index: 10;">
          <!-- 用户名：白色粗体，阴影效果防干扰 -->
          <span style="font-size: 16px; font-weight: 600; color: #ffffff; text-shadow: 0 1.5px 3px rgba(0, 0, 0, 0.85); margin-bottom: 12px;">
            ${userName}
          </span>
          
          <!-- 用户头像：正方形，白色描边，微阴影，经典微信叠加态 -->
          <div style="width: 64px; height: 64px; border-radius: 6px; overflow: hidden; border: 2.5px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.15); background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 32px;">
            ${userAvatar.startsWith('data:') ? `<img src="${userAvatar}" style="width: 100%; height: 100%; object-fit: cover;">` : userAvatar}
          </div>
        </div>
      </div>

      <!-- 隐藏的文件选择框用于选择朋友圈背景大图 -->
      <input type="file" id="momentsHeroInput" accept="image/*" style="display: none;" onchange="MomentsEngine.handleHeroImage(this)">

      <!-- 用户发布动态对话框 (极简微信卡片面板，默认隐藏) -->
      <div id="moments-publish-dialog" style="display: none; background: #f7f7f7; border-radius: 8px; border: 1px solid #e5e5e5; padding: 14px; margin: 0 16px 16px 16px; flex-direction: column; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); animation: wechatFadeLeft 0.2s ease-out;">
        <strong style="font-size: 13px; color: #191919; display: flex; align-items: center; gap: 4px;">📝 记录我的这一刻想法</strong>
        <textarea id="moments-publish-text" rows="3" placeholder="这一刻的想法是..." style="width: 100%; border-radius: 4px; border: 1px solid #e0e0e0; padding: 8px 10px; font-size: 13px; outline: none; background: #ffffff; resize: none; font-family: inherit; line-height: 1.4; color: #191919;"></textarea>

        <!-- 上传图片缩略图 -->
        <div id="moments-uploaded-thumb" style="display: none; position: relative; width: 80px; height: 80px; border-radius: 4px; overflow: hidden; border: 1px solid #e0e0e0;">
          <img id="moments-thumb-img" src="" style="width: 100%; height: 100%; object-fit: cover;">
          <button onclick="MomentsEngine.clearUploadedImage()" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.5); color: white; border: none; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; cursor: pointer;">✕</button>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button class="footer-btn" onclick="document.getElementById('momentImageInput').click()" style="padding: 5px 12px; font-size: 12px; border: 0.5px solid #dcdcdc; border-radius: 4px; background: #ffffff; cursor: pointer; color: #191919; display: flex; align-items: center; gap: 4px; font-weight: 500;">
            🖼️ 添加图片
          </button>
          <div style="display: flex; gap: 8px;">
            <button class="footer-btn" onclick="MomentsEngine.closePublishDialog()" style="padding: 5px 12px; font-size: 12px; border: 0.5px solid #dcdcdc; border-radius: 4px; background: #ffffff; cursor: pointer; color: #555555;">取消</button>
            <button class="footer-btn" id="momentsPublishBtn" onclick="MomentsEngine.submitPublish()" style="padding: 5px 14px; font-size: 12px; border: none; border-radius: 4px; background: #07c160; color: #ffffff; cursor: pointer; font-weight: 500;">发表</button>
          </div>
        </div>
        <input type="file" id="momentImageInput" accept="image/*" style="display: none;" onchange="MomentsEngine.handleUploadedImage(this)">
      </div>

      <!-- 微信朋友圈列表流 (纯白背景无间距，经典微信样式) -->
      <div class="moments-feed" style="background: #ffffff; display: flex; flex-direction: column;">
        ${momentsListHtml}
      </div>
    `;

    this.hydrateHeroImage();
    moments.forEach(m => {
      this.hydrateMomentImage(m);
      if (m.image && String(m.image).startsWith('data:')) {
        this.persistMomentImage(m).then(migrated => {
          const all = this.getMoments().map(item => item.id === migrated.id ? migrated : item);
          this.saveMoments(all);
        }).catch(() => {});
      }
    });
  },

  // 展开或收起微信朋友圈点赞与评论操作菜单
  toggleActionPopup(event, momentId) {
    if (event) event.stopPropagation();
    const popup = document.getElementById(`action-popup-${momentId}`);
    if (!popup) return;
    const isVisible = popup.style.display === 'flex';
    this.closeAllActionPopups();
    if (!isVisible) {
      popup.style.display = 'flex';
    }
  },

  // 收起所有微信朋友圈操作气泡菜单
  closeAllActionPopups() {
    const popups = document.querySelectorAll('[id^="action-popup-"]');
    popups.forEach(p => {
      p.style.display = 'none';
    });
  },

  // 显示/隐藏评论输入框
  showCommentInput(momentId, replyToId = null, replyToName = null) {
    const el = document.getElementById(`comment-input-area-${momentId}`);
    const input = document.getElementById(`comment-field-${momentId}`);
    if (el && input) {
      if (replyToId && replyToName) {
        input.placeholder = `回复 ${replyToName}...`;
        input.dataset.replyToId = replyToId;
        input.dataset.replyToName = replyToName;
        el.style.display = 'flex';
        input.focus();
      } else {
        if (el.style.display === 'flex' && !input.dataset.replyToId) {
          el.style.display = 'none';
        } else {
          input.placeholder = `评论...`;
          delete input.dataset.replyToId;
          delete input.dataset.replyToName;
          el.style.display = 'flex';
          input.focus();
        }
      }
    }
  },

  // 提交用户评论
  submitComment(momentId) {
    const input = document.getElementById(`comment-field-${momentId}`);
    if (!input || !input.value.trim()) return;

    const text = input.value.trim();
    const userName = localStorage.getItem('user_name') || '我';
    const replyToId = input.dataset.replyToId || null;
    const replyToName = input.dataset.replyToName || null;

    this.addCommentToMoment(momentId, 'user', userName, text, replyToId, replyToName);
    
    input.value = '';
    delete input.dataset.replyToId;
    delete input.dataset.replyToName;

    const el = document.getElementById(`comment-input-area-${momentId}`);
    if (el) el.style.display = 'none';
  },

  // 打开/关闭发布弹窗
  openPublishDialog() {
    const el = document.getElementById('moments-publish-dialog');
    if (el) el.style.display = 'flex';
  },

  closePublishDialog() {
    const el = document.getElementById('moments-publish-dialog');
    if (el) el.style.display = 'none';
    MomentsEngine.clearUploadedImage();
    const txt = document.getElementById('moments-publish-text');
    if (txt) txt.value = '';
  },

  // 处理上传图片
  _uploadedImageBase64: null,
  handleUploadedImage(input) {
    const f = input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async e => {
      const raw = e.target.result;
      let compressed = raw;
      try {
        compressed = (typeof compressImage === 'function') ? await compressImage(raw, 1280, 0.78) : raw;
      } catch (err) {
        console.warn('[Moments] Compress uploaded image failed, using raw:', err);
      }
      MomentsEngine._uploadedImageBase64 = compressed;
      const thumb = document.getElementById('moments-uploaded-thumb');
      const img = document.getElementById('moments-thumb-img');
      if (thumb && img) {
        img.src = compressed;
        thumb.style.display = 'block';
      }
    };
    r.readAsDataURL(f);
    input.value = '';
  },

  clearUploadedImage() {
    MomentsEngine._uploadedImageBase64 = null;
    const thumb = document.getElementById('moments-uploaded-thumb');
    if (thumb) thumb.style.display = 'none';
  },

  // 提交发布
  async submitPublish() {
    const txt = document.getElementById('moments-publish-text')?.value || '';
    if (!txt.trim()) {
      showToast('请输入一些想法内容哦');
      return;
    }
    const btn = document.getElementById('momentsPublishBtn');
    if (btn) btn.disabled = true;
    try {
      await MomentsEngine.userPublishMoment(txt, MomentsEngine._uploadedImageBase64);
      MomentsEngine.closePublishDialog();
    } catch(e) {
      console.error('[Moments] Publish failed:', e);
      showToast('朋友圈发布失败，请稍后重试');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // 删除某条动态
  deleteMoment(momentId) {
    if (!confirm('确定要删除这条状态吗？')) return;
    const moments = this.getMoments();
    const filtered = moments.filter(m => m.id !== momentId);
    this.saveMoments(filtered);
    this.renderMomentsTab();
    showToast('✨ 状态已删除');
  },

  // 处理更换背景大图
  handleHeroImage(input) {
    const f = input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async e => {
      const raw = e.target.result;
      let compressed = raw;
      try {
        compressed = (typeof compressImage === 'function') ? await compressImage(raw, 1600, 0.82) : raw;
      } catch (err) {
        console.warn('[Moments] Background compression failed, using raw:', err);
      }
      const bgId = 'moments-hero-bg';
      let storedOk = false;
      try {
        if (window.LovestoryImageDB) {
          storedOk = await window.LovestoryImageDB.put(bgId, compressed);
        }
      } catch (dbErr) {
        console.warn('[Moments] LovestoryImageDB put failed, falling back to localStorage:', dbErr);
      }

      if (storedOk) {
        localStorage.setItem('moments_bg_image_id', bgId);
        localStorage.removeItem('moments_bg_image');
      } else {
        let miniBg = compressed;
        try {
          if (typeof compressImage === 'function') {
            miniBg = await compressImage(raw, 600, 0.6);
          }
        } catch (compErr) {}
        localStorage.setItem('moments_bg_image', miniBg);
        localStorage.removeItem('moments_bg_image_id');
      }
      this.renderMomentsTab();
      showToast('✨ 朋友圈背景图更新成功！');
    };
    r.readAsDataURL(f);
    input.value = '';
  }
};

// 帮助函数，获取亲密关系状态描述
function getRelationshipStatusText(memberId) {
  const activeAi = memberId || 'main';
  let intimacy = 50;
  let trust = 50;
  let stageLabel = '陪伴伙伴';
  
  if (typeof getRelationshipMetrics === 'function') {
    try {
      const metrics = getRelationshipMetrics(activeAi);
      intimacy = metrics.intimacy || 50;
      trust = metrics.trust || 50;
      
      if (typeof getCharacterRelationshipStage === 'function') {
        const stage = getCharacterRelationshipStage(activeAi);
        const stages = {
          acquaintance: '初识',
          friend: '朋友',
          crush: '暧昧',
          lover: '亲密爱人',
          partner: '终身伴侣'
        };
        stageLabel = stages[stage] || '陪伴伙伴';
      }
    } catch (e) {
      console.warn('Error reading metrics for moments status text:', e);
    }
  }

  let statusArr = [];
  statusArr.push(`关系状态: <b>${stageLabel}</b>`);
  
  if (intimacy > 80) {
    statusArr.push("心意相恋 · 灵魂共振");
  } else if (intimacy > 50) {
    statusArr.push("更加熟悉 · 默契加深");
  } else {
    statusArr.push("温和陪伴");
  }
  
  if (trust > 80) {
    statusArr.push("深度互信");
  } else if (trust > 40) {
    statusArr.push("近期互动增加");
  }

  return statusArr.join(' · ');
}

window.MomentsEngine = MomentsEngine;
window.getRelationshipStatusText = getRelationshipStatusText;

// 全局全屏查看图片功能
window.viewFullImage = function(imgSrc) {
  if (!imgSrc) return;
  const overlay = document.createElement('div');
  overlay.id = 'wechat-image-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.background = 'rgba(0,0,0,0.95)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9999';
  overlay.style.cursor = 'zoom-out';
  
  const img = document.createElement('img');
  img.src = imgSrc;
  img.style.maxWidth = '95vw';
  img.style.maxHeight = '95vh';
  img.style.objectFit = 'contain';
  img.style.borderRadius = '4px';
  img.style.transition = 'transform 0.2s ease';
  
  overlay.appendChild(img);
  document.body.appendChild(overlay);
  
  overlay.onclick = function() {
    overlay.remove();
  };
};

// 全局点击自动收起微信朋友圈操作气泡
document.addEventListener('click', (e) => {
  if (!e.target.closest('.wechat-action-trigger')) {
    if (typeof MomentsEngine !== 'undefined' && typeof MomentsEngine.closeAllActionPopups === 'function') {
      MomentsEngine.closeAllActionPopups();
    }
  }
});
