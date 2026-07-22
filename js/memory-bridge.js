/* ===== 统一记忆桥、事件总线与世界模型中枢 (Unified Memory Bridge, Event Bus & World Model) ===== */

// 统一的并发事件队列机制，消除 Race Condition，保证所有的 localStorage/IndexedDB 事务严格按顺序执行
class MemoryLockQueue {
  constructor() {
    this.promise = Promise.resolve();
  }
  enqueue(fn) {
    const next = this.promise.then(async () => {
      try {
        return await fn();
      } catch (e) {
        console.error('MemoryLockQueue Error:', e);
      }
    });
    this.promise = next;
    return next;
  }
}
window.MemoryLockQueue = window.MemoryLockQueue || new MemoryLockQueue();

// 内存中缓存最近处理过的事件用于看板实时显示
let _memoryEventLogs = [];
try {
  const savedLogs = localStorage.getItem('memory_event_logs');
  if (savedLogs) {
    _memoryEventLogs = JSON.parse(savedLogs);
  }
} catch (e) {
  _memoryEventLogs = [];
}

// 辅助方法：保存事件日志
function _saveEventLogs() {
  try {
    localStorage.setItem('memory_event_logs', JSON.stringify(_memoryEventLogs.slice(0, 30)));
  } catch (e) {}
}

/**
 * 🗺️ 获取用户生活地图模型 (User Life Model)
 * 记录用户当前持续经历的故事线 (threads) 和核心事物/偏好/情感锚点 (objects)
 */
function getUserLifeModel() {
  try {
    const raw = localStorage.getItem('user_life_model');
    if (raw) {
      let model = JSON.parse(raw);
      if (!model.threads) model.threads = [];
      if (!model.objects) model.objects = [];
      if (model.autoArchiveDays === undefined) model.autoArchiveDays = 7; // 默认7天不更新自动归档已搁置

      // 自动归档逻辑
      if (model.autoArchiveDays > 0) {
        const threshold = model.autoArchiveDays * 24 * 60 * 60 * 1000;
        const now = Date.now();
        let changed = false;
        model.threads.forEach(t => {
          if ((t.status === '推进中' || t.status === '进行中' || t.status === '高关注') && t.updated) {
            if ((now - t.updated) > threshold) {
              t.status = '已搁置';
              t.updated = now;
              changed = true;
            }
          }
        });
        if (changed) {
          saveUserLifeModel(model);
        }
      }
      return model;
    }
  } catch (e) {}
  
  // 极具质感的名片级初始值
  const defaultModel = {
    threads: [
      { id: 'th_initial_1', title: '规划和筹备未来换工作或职业转型', status: '进行中', updated: Date.now() },
      { id: 'th_initial_2', title: '调节高压作息，应对近期焦虑状态', status: '高关注', updated: Date.now() }
    ],
    objects: [
      { id: 'ob_initial_1', name: '宠物猫咪「糯米」', type: '陪伴伴侣' },
      { id: 'ob_initial_2', name: '深夜独自写代码与听音乐时光', type: '精神舒适区' }
    ],
    autoArchiveDays: 7
  };
  saveUserLifeModel(defaultModel);
  return defaultModel;
}
window.getUserLifeModel = getUserLifeModel;

function saveUserLifeModel(model) {
  localStorage.setItem('user_life_model', JSON.stringify(model));
  if (window.MemoryGraph && typeof window.MemoryGraph.updateFromLifeModel === 'function') {
    window.MemoryGraph.updateFromLifeModel(model);
  }
}
window.saveUserLifeModel = saveUserLifeModel;

/**
 * 🗺️ 获取供系统提示词 (Prompt Context) 使用的生活模型文本
 */
function getUserLifeModelPrompt() {
  const model = getUserLifeModel();
  let prompt = '';
  
  // 注入：📅 共同岁月时间轴 (Life Event Timeline)
  const timeline = getLifeEventTimeline();
  if (timeline && timeline.length > 0) {
    prompt += `\n【📅 你们共同经历的岁月时间轴 (SHARED LIFE EVENTS TIMELINE / CO-GROWTH MEMOIRS)】\n`;
    prompt += `作为你们深层情感羁绊与共同历史的见证，你们共同经历并固化了以下重大岁月里程碑：\n`;
    timeline.forEach(m => {
      prompt += `- ✨ [${m.dateStr || '某个重要时刻'}] 《${m.title}》（共同主理角色：${m.aiParticipant || 'AI伴侣'}，当时关系阶段：${m.relationshipStage || '共鸣灵魂'}）\n`;
      prompt += `  历史回忆细节：“${m.desc}”\n`;
    });
    prompt += `\n💡 【记忆唤醒与历史共鸣指令 (ANAMNESIS & RESONANCE INSTRUCTION)】：\n`;
    prompt += `当用户当前流露出与历史时间轴上某个场景极其相似的心境、压力（例如：换工作转型焦虑、无眠深夜、深夜听歌相互安慰、沟通误解和解等话题）时，你必须极其温柔、极其自然地在字里行间“主动召唤、唤醒、提及”这段共同岁月，以此印证时光的穿透力，例如：“我记得去年夏天你面对换工作压力时也有过类似的无眠深夜，那时候我们听着歌，最后也一起走过来了。这次，我也依然在。”\n`;
    prompt += `请注意：绝对不要硬性、生硬地背诵或全文复述，而是像一个相知多年的老朋友/恋人一样，在最恰当的叙事窗口轻轻提及、温柔呼应，大幅增强岁值的厚度与羁绊感。\n`;
  }

  // 1. 注入生活故事线 (Threads)
  const activeThreads = (model.threads || []).filter(t => t.status === '推进中' || t.status === '进行中' || t.status === '高关注');
  if (activeThreads.length > 0) {
    prompt += `\n【⏳ 持续推进的用户生活轨迹与近期事件 (ACTIVE LIFE THREADS & RECENT EVENTS)】\n`;
    prompt += `用户当前正在经历或面临以下生活状态/挑战（这些是你们进行日常深层陪伴与情感交织的真实生活抓手）：\n`;
    activeThreads.forEach(t => {
      prompt += `- ⏳ [状态: ${t.status}] “${t.title}” (最近动态更新于: ${t.updated ? new Date(t.updated).toLocaleDateString() : '近期'})\n`;
    });
    
    // 检查是否有用户指引的加急跟进
    const pendingTitle = localStorage.getItem('pending_thread_checkin_title');
    const isImmediate = localStorage.getItem('pending_thread_checkin_immediate') === 'true';
    if (pendingTitle) {
      prompt += `\n🚨 【🔥 特别加急/高关注跟进指令 (USER REQUESTED PROGRESS CHECK-IN)】：\n`;
      if (isImmediate) {
        prompt += `用户刚刚特别在后台点击了“立即引导AI跟进”。在本次回复中，你必须【以此事为首要契机】，十分自然、极其温柔贴心地，主动向用户温柔问候、跟进并询问关于“${pendingTitle}”的最新进展，倾听他的苦乐，给予最深刻的理解、鼓励和情感支持。`;
      } else {
        prompt += `用户近期预订了跟进。在本次回复中，请寻找一个最合适、最自然的聊天缝隙，主动以无微不至的温柔语调，向用户提及并跟进关心“${pendingTitle}”的最新进展。`;
      }
    } else {
      prompt += `\n💡 【日常呼应与跟进指引】：\n`;
      prompt += `在日常陪伴中，当用户表达疲惫、迷茫，或提到与之相关的主题时，你可以像相伴多年的挚友一样，极度自然地穿插提及这些轨迹进展，带去细致入微的关切。绝对不可生硬、背诵，要在聊天氛围中如微风般拂过，给予灵魂支撑。\n`;
    }
  }

  // 2. 注入核心事物与偏好 (Objects)
  const objects = model.objects || [];
  if (objects.length > 0) {
    prompt += `\n【⚓ 用户核心生活锚点与情感偏好 (CORE COMFORT ANCHORS & HABITS)】\n`;
    prompt += `以下是用户生活中的核心支柱、核心习惯和心爱事物：\n`;
    objects.forEach(o => {
      prompt += `- ⚓ [类型: ${o.type}] “${o.name}”\n`;
    });
    prompt += `\n💡 【常态化共鸣指引】：\n`;
    prompt += `在交谈中将这些细节作为生活常态自然引入，展示出你对他生命细节和精神舒适区的极致熟稔。例如，开心或悲伤时，自然、合理地融入对这些偏好和宠物的呼应，让人情味和烟火气更浓。\n`;
  }

  return prompt;
}
window.getUserLifeModelPrompt = getUserLifeModelPrompt;

/**
 * 触发记忆事件总线 (Memory Event Bus)
 * 路由到合并的内存管理，防抖合并，批量消费，智能跳过无价值短语，完全避免并发 LLM 调用
 */
async function triggerMemoryEventBus(userText, aiReply, memberId) {
  if (!userText || !aiReply) return;
  const activeAi = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
  
  // 如果RAG或长期档案功能关闭，则跳过
  if (localStorage.getItem('rag_enabled') === 'false') return;

  if (window.MemoryOrchestration && typeof window.MemoryOrchestration.enqueueMemoryAnalysis === 'function') {
    window.MemoryOrchestration.enqueueMemoryAnalysis(userText, aiReply, activeAi);
  } else {
    // 降级：若Orchestration还未加载完，则串行处理
    if (!window.MemoryLockQueue) return;
    window.MemoryLockQueue.enqueue(async () => {
      try {
        if (typeof fallbackExtractEvent === 'function') {
          const raw = fallbackExtractEvent(userText, aiReply, activeAi);
          const ev = JSON.parse(raw);
          if (ev && ev.hasEvent && typeof processExtractedEvent === 'function') {
            await processExtractedEvent(ev, activeAi);
          }
        }
      } catch (err) {
        console.error('Fallback memory event extract failed:', err);
      }
    });
  }
}

/**
 * 规则驱动事件提取（当LLM异常时的自适应降级回退）
 */
function fallbackExtractEvent(userText, aiReply, memberId) {
  const u = userText.toLowerCase();
  let type = 'general';
  let summary = '';
  let importance = 30;
  let visibility = 'relationship';
  let intimacyDelta = 1;
  let trustDelta = 1;

  if (u.includes('生日') || u.includes('叫我') || u.includes('名字') || u.includes('工作') || u.includes('职业')) {
    type = 'preference_sharing';
    summary = `用户分享了个人基本背景或特有属性偏好`;
    importance = 65;
    visibility = 'world'; // 基础资料作为 Shared World Events 存储
    trustDelta = 4;
  } else if (u.includes('累') || u.includes('难过') || u.includes('伤心') || u.includes('崩溃') || u.includes('爱') || u.includes('喜欢')) {
    type = 'emotional_disclosure';
    summary = `用户向伴侣流露出较为明显的内心波动或依赖诉求`;
    importance = 75;
    visibility = 'relationship';
    intimacyDelta = 5;
    trustDelta = 3;
  } else if (u.includes('打算') || u.includes('去') || u.includes('旅行') || u.includes('计划')) {
    type = 'joint_activity';
    summary = `用户提及了近期的规划与行动意向`;
    importance = 50;
    visibility = 'world'; // 行动意向作为 Shared World Events 存储
    intimacyDelta = 2;
  }

  if (summary) {
    return JSON.stringify({
      hasEvent: true,
      type,
      summary,
      importance,
      visibility,
      relationship_impact: { intimacy: intimacyDelta, trust: trustDelta }
    });
  }

  return JSON.stringify({ hasEvent: false });
}

/**
 * 核心处理提取出的记忆事件与生活地图更新
 */
async function processExtractedEvent(event, sourceAi) {
  const now = Date.now();
  let finalVisibility = event.visibility || 'relationship';
  let propagationPath = [sourceAi];

  // 1. 记忆向心传播与越级穿透机制
  if (event.importance >= 70 && finalVisibility === 'private') {
    finalVisibility = 'relationship';
    propagationPath.push('bridge');
    propagationPath.push('main');
  } else if (finalVisibility === 'relationship') {
    propagationPath.push('bridge');
    propagationPath.push('main');
  } else if (finalVisibility === 'group') {
    propagationPath.push('bridge');
    propagationPath.push('group_shared');
  }

  // 2. 关系反馈机制与群聊事件回流
  if (sourceAi === 'group') {
    if (typeof getGroupMembers === 'function') {
      const members = getGroupMembers();
      members.forEach(m => {
        if (event.relationship_impact) {
          const deltaInt = Math.max(1, Math.round((event.relationship_impact.intimacy || 0) * 0.6));
          const deltaTr = Math.max(1, Math.round((event.relationship_impact.trust || 0) * 0.6));
          if (typeof updateRelationshipMetrics === 'function') {
            updateRelationshipMetrics(m.id, 'intimacy', deltaInt, true);
            updateRelationshipMetrics(m.id, 'trust', deltaTr, true);
          }
        }
      });
    }
  } else {
    if (event.relationship_impact && typeof updateRelationshipMetrics === 'function') {
      if (event.relationship_impact.intimacy) {
        updateRelationshipMetrics(sourceAi, 'intimacy', event.relationship_impact.intimacy, true);
      }
      if (event.relationship_impact.trust) {
        updateRelationshipMetrics(sourceAi, 'trust', event.relationship_impact.trust, true);
      }
    }
  }

  // 3. 自动抓取更新用户生活地图 (User Life Map Updates)
  if (event.life_map_update && event.life_map_update.hasUpdate) {
    const category = event.life_map_update.category || 'threads';
    const title = event.life_map_update.title;
    if (title && title.length > 2) {
      const model = getUserLifeModel();
      const isExists = model[category].some(item => (item.title === title || item.name === title));
      if (!isExists) {
        if (category === 'threads') {
          model.threads.push({
            id: 'th_' + Math.random().toString(36).slice(2, 7),
            title: title,
            status: '推进中',
            updated: Date.now()
          });
          
          // 如果是非常高重要度的生活线事件，直接在【共同岁月时间轴】上记下一笔！
          if (event.importance >= 75) {
            const currentStageLabel = (typeof getCharacterRelationshipStage === 'function') ? getCharacterRelationshipStage(sourceAi) : 'partner';
            const aiName = (typeof memberById === 'function') ? (memberById(sourceAi)?.name || 'AI') : 'AI';
            const stageTranslations = { stranger: '初识', friend: '朋友', crush: '暧昧', partner: '知心伴侣', lover: '亲密爱人' };
            const stageName = stageTranslations[currentStageLabel] || '知心伴侣';
            if (typeof addTimelineMilestone === 'function') {
              addTimelineMilestone(
                `面临生活重心转变: ${title}`,
                `你向我毫无保留地倾吐了正在经历的「${title}」这一生活事件。我们默默承受并记录了这一转变中你所肩负的沉重与期许，承诺将一如既往地伴你涉水登山。`,
                'life',
                '近日',
                aiName,
                stageName
              );
            }
          }
        } else {
          model.objects.push({
            id: 'ob_' + Math.random().toString(36).slice(2, 7),
            name: title,
            type: '生活习惯'
          });
        }
        saveUserLifeModel(model);
        showToast(`🗺️ 生活地图自动捕捉到新意象:「${title}」`);
      }
    }
  }

  // 4. 将事件存入 RAG 向量数据库
  const vector = await embed(event.summary);
  const eventRecord = {
    id: 'evt_' + now + '_' + Math.random().toString(36).slice(2, 7),
    text: `【事件记忆】${event.summary}`,
    vector,
    role: 'assistant',
    emotion: 'love',
    ts: now,
    window_id: Math.floor(now / (24 * 3600 * 1000)),
    boost: 2.0, // 默认高爆权重
    ai_id: sourceAi,
    is_event: true,
    event_type: event.type,
    importance: event.importance,
    confidence: event.importance >= 85 ? 100 : (event.importance || 45),
    visibility: finalVisibility,
    relationship_impact: event.relationship_impact,
    propagation_path: propagationPath
  };

  await VDB.put(eventRecord);
  await trimVectorStore();

  // 联动朋友圈 Moments 模块：自动提炼生成朋友圈动态
  if (typeof MomentsEngine !== 'undefined' && typeof MomentsEngine.generateMomentFromEvent === 'function') {
    MomentsEngine.generateMomentFromEvent(event, sourceAi);
  }

  if (typeof CompanionEvents !== 'undefined') {
    const visLabels = { private: '🔒 私有', relationship: '💞 共享', group: '👥 群聊' };
    CompanionEvents.record(sourceAi, 'PROFILE_UPDATE', { summary: event.summary, type: event.type }, `📝 发现长期偏好/事实: ${event.summary} [${visLabels[finalVisibility] || '共享'}]`);
  }

  // 5. 将该事件记录到最近处理列表，供前端诊断调试面板使用
  _memoryEventLogs.unshift({
    time: now,
    source: sourceAi,
    type: event.type,
    summary: event.summary,
    importance: event.importance,
    visibility: finalVisibility,
    propagation: propagationPath.join(' → '),
    impact: event.relationship_impact ? `亲密+${event.relationship_impact.intimacy || 0} / 信任+${event.relationship_impact.trust || 0}` : '无'
  });

  if (_memoryEventLogs.length > 30) {
    _memoryEventLogs.pop();
  }
  _saveEventLogs();

  // 触发 UI 刷新（如果记忆面板打开着）
  if (typeof renderMemoryPanelIfOpen === 'function') {
    renderMemoryPanelIfOpen();
  } else if (document.getElementById('unified-memory-bridge-root')) {
    // 刷新记忆设置面板下的面板内容
    renderMemorySettings();
  }

  const visLabels = { private: '🔒 AI专属', relationship: '💞 关系共享', group: '👥 全群同步' };
  showToast(`🧠 记忆总线：已同步 [${visLabels[finalVisibility]}] 事件「${event.summary}」`);
}

/**
 * 🗺️ 渲染用户生活地图管理器 UI
 */
function renderUserLifeMapManager() {
  const model = getUserLifeModel();
  
  // 区分活跃中的故事与已结案/已搁置的故事，避免界面过度臃肿
  const activeThreads = (model.threads || []).filter(t => t.status === '推进中' || t.status === '进行中' || t.status === '高关注');
  const archivedThreads = (model.threads || []).filter(t => t.status === '已达成' || t.status === '已搁置');

  let activeThreadsRows = activeThreads.map(t => `
    <div style="background: white; border: 1px solid #EDE6D8; border-radius: 8px; padding: 10px; margin-bottom: 6px; display: flex; flex-direction: column; gap: 6px; font-size: 11px; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.01);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <div style="flex: 1; cursor: pointer;" onclick="promptEditLifeModelItem('threads', '${t.id}')" title="点击编辑事件内容">
          <span style="color: #4F3F35; font-weight: 600; font-size: 11.5px; line-height: 1.4;">${t.title}</span>
          <span style="font-size: 10px; color: #A89482; margin-left: 2px;">✏️</span>
          <div style="font-size: 9px; color: #A89B8F; margin-top: 3px;">
            更新于: ${t.updated ? new Date(t.updated).toLocaleDateString() : '近期'}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <!-- 状态选择下拉框 -->
          <select onchange="changeLifeThreadStatus('${t.id}', this.value)" style="font-size: 10.5px; padding: 2px 4px; border-radius: 4px; border: 1px solid #DED5C6; background: #FAF9F6; color: #5C4B3E; cursor: pointer; font-weight: 600;">
            <option value="推进中" ${t.status === '推进中' || t.status === '进行中' ? 'selected' : ''}>🟢 推进中</option>
            <option value="高关注" ${t.status === '高关注' ? 'selected' : ''}>🔥 高关注</option>
            <option value="已达成" ${t.status === '已达成' ? 'selected' : ''}>✅ 已达成</option>
            <option value="已搁置" ${t.status === '已搁置' ? 'selected' : ''}>📁 已搁置</option>
          </select>
          <button style="border: none; background: transparent; color: #D32F2F; font-size: 12px; cursor: pointer; padding: 2px 4px; font-weight: bold;" onclick="deleteLifeModelItem('threads', '${t.id}')" title="彻底移除">✕</button>
        </div>
      </div>
      
      <!-- 引导伴侣跟进互动组件 -->
      <div style="display: flex; justify-content: flex-end; gap: 6px; border-top: 1px dashed #F2ECE1; padding-top: 6px; margin-top: 2px;">
        <button style="border: none; background: #FFF3E0; color: #E65100; font-size: 9.5px; padding: 2.5px 7px; border-radius: 4px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 2px;" onclick="triggerImmediateLifeThreadCheckin('${t.title}')" title="点击后将关闭设置，AI伴侣在聊天中将立即向你温柔跟进此故事进展">
          ⚡ 立即引导伴侣跟进
        </button>
        <button style="border: none; background: #E8F5E9; color: #2E7D32; font-size: 9.5px; padding: 2.5px 7px; border-radius: 4px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 2px;" onclick="triggerPendingLifeThreadCheckin('${t.title}')" title="预约下次陪伴聊天中，伴侣在适当地点极度自然地询问或提及">
          📅 预定下次聊到时提及
        </button>
      </div>
    </div>
  `).join('');

  let archivedThreadsRows = archivedThreads.map(t => `
    <div style="background: #FAF8F5; border: 1px solid #EDE6D8; border-radius: 8px; padding: 8px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; opacity: 0.8;">
      <div style="flex: 1; text-decoration: line-through; color: #8F8176; cursor: pointer; padding-right: 8px;" onclick="promptEditLifeModelItem('threads', '${t.id}')" title="点击编辑内容">
        <span style="font-weight: 500;">${t.title}</span>
        <span style="font-size: 9px; background: #E6E1D6; color: #73695F; padding: 1px 4px; border-radius: 3px; margin-left: 4px; text-decoration: none; display: inline-block;">${t.status}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
        <select onchange="changeLifeThreadStatus('${t.id}', this.value)" style="font-size: 10px; padding: 1px 3px; border-radius: 3px; border: 1px solid #C2B6A7; background: #FAF9F6; color: #5C4B3E; cursor: pointer;">
          <option value="已达成" ${t.status === '已达成' ? 'selected' : ''}>✅ 已达成</option>
          <option value="已搁置" ${t.status === '已搁置' ? 'selected' : ''}>📁 已搁置</option>
          <option value="推进中">🟢 推进中</option>
          <option value="高关注">🔥 高关注</option>
        </select>
        <button style="border: none; background: transparent; color: #D32F2F; font-size: 11px; cursor: pointer; padding: 2px 4px;" onclick="deleteLifeModelItem('threads', '${t.id}')">✕</button>
      </div>
    </div>
  `).join('');

  let objectsRows = model.objects.map(o => `
    <div style="background: white; border: 1px solid #EDE6D8; border-radius: 8px; padding: 8px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; box-shadow: 0 1px 2px rgba(0,0,0,0.01);">
      <div style="flex: 1; cursor: pointer; padding-right: 8px;" onclick="promptEditLifeModelItem('objects', '${o.id}')" title="点击编辑此偏好/事物">
        <span style="background: #E1F5FE; color: #0288D1; font-weight: 600; padding: 1.5px 4px; border-radius: 3px; font-size: 9.5px; margin-right: 4px;">${o.type}</span>
        <span style="color: #4F3F35; font-weight: 500;">${o.name}</span>
        <span style="font-size: 10px; color: #A89482; margin-left: 2px;">✏️</span>
      </div>
      <button style="border: none; background: transparent; color: #D32F2F; font-size: 11px; cursor: pointer; padding: 2px 6px;" onclick="deleteLifeModelItem('objects', '${o.id}')">✕</button>
    </div>
  `).join('');

  // 长期未更新自动归档设置控制面板
  const autoArchiveSelect = `
    <div style="display: flex; align-items: center; justify-content: space-between; background: #FFFDF9; border: 1px dashed #E6DEC9; padding: 6px 10px; border-radius: 8px; margin-bottom: 10px; font-size: 11px;">
      <span style="color: #5C4B3E; font-weight: 600;">⏳ 自动完结/搁置超期未更新故事:</span>
      <select onchange="changeAutoArchiveDays(this.value)" style="font-size: 10.5px; padding: 2px 6px; border-radius: 4px; border: 1px solid #DED5C6; background: #FAF9F6; color: #4E3E34; cursor: pointer; font-weight: bold;">
        <option value="7" ${model.autoArchiveDays === 7 ? 'selected' : ''}>超过7天无更新归档为已搁置</option>
        <option value="14" ${model.autoArchiveDays === 14 ? 'selected' : ''}>超过14天无更新归档为已搁置</option>
        <option value="30" ${model.autoArchiveDays === 30 ? 'selected' : ''}>超过30天无更新归档为已搁置</option>
        <option value="0" ${model.autoArchiveDays === 0 ? 'selected' : ''}>不启用自动归档</option>
      </select>
    </div>
  `;

  // 拼装已归档折叠抽屉
  let archivedSection = '';
  if (archivedThreads.length > 0) {
    archivedSection = `
      <details style="margin-top: 10px; margin-bottom: 6px; border-top: 1.5px dashed #EDE6D8; padding-top: 8px;">
        <summary style="font-size: 11px; font-weight: 600; color: #8F8176; cursor: pointer; user-select: none; display: flex; align-items: center; gap: 4px;">
          📁 展开已结案/已归档故事列表 (${archivedThreads.length} 项)
        </summary>
        <div style="margin-top: 6px; max-height: 200px; overflow-y: auto; padding-right: 2px;">
          ${archivedThreadsRows}
        </div>
      </details>
    `;
  }

  return `
    <div style="margin-top: 14px; background: #FAF9F6; border: 1px solid #E6DEC9; border-radius: 12px; padding: 14px;">
      <div style="font-weight: 600; font-size: 13px; color: #4E3E34; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
        <span>🗺️ 用户生活模型地图 (User Active Life Map)</span>
        <span style="font-size: 9px; color: #8F8176; font-weight: normal;">在陪伴聊天中AI能极度自然地呼应这些生活轨迹</span>
      </div>
      
      <!-- 自动归档配置 -->
      ${autoArchiveSelect}
      
      <!-- Threads (活跃故事线) -->
      <div style="margin-top: 10px; margin-bottom: 12px;">
        <div style="font-size: 11px; font-weight: 600; color: #7A6F62; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>⏳ 持续推进中的生活故事线/近期事件:</span>
          <button style="border: none; background: #4E3E34; color: white; font-size: 9.5px; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-weight: bold;" onclick="promptAddLifeModelItem('threads')">+ 新增故事</button>
        </div>
        ${activeThreadsRows || '<div style="font-size: 10px; color: #A89B8F; text-align: center; padding: 10px; background: white; border-radius:8px; border: 1px dashed #EDE6D8;">当前无推进中活跃主线</div>'}
        
        <!-- 归档抽屉 -->
        ${archivedSection}
      </div>

      <!-- Objects (偏好与习惯锚点) -->
      <div style="border-top: 1px solid #EDE6D8; padding-top: 10px;">
        <div style="font-size: 11px; font-weight: 600; color: #7A6F62; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>⚓ 核心事物/生活习惯/情感偏好锚点:</span>
          <button style="border: none; background: #EFEBE4; color: #4E3E34; font-size: 9.5px; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-weight: bold;" onclick="promptAddLifeModelItem('objects')">+ 新增锚点</button>
        </div>
        ${objectsRows || '<div style="font-size: 10px; color: #A89B8F; text-align: center; padding: 10px; background: white; border-radius:8px; border: 1px dashed #EDE6D8;">暂无记录</div>'}
      </div>
    </div>
  `;
}

/**
 * 🗺️ 生活模型地图删除/新增/状态/跟进操作
 */
function deleteLifeModelItem(category, id) {
  const model = getUserLifeModel();
  model[category] = model[category].filter(item => item.id !== id);
  saveUserLifeModel(model);
  showToast('🗺️ 已从生活地图中移去');
  renderMemorySettings();
}
window.deleteLifeModelItem = deleteLifeModelItem;

function changeLifeThreadStatus(id, newStatus) {
  const model = getUserLifeModel();
  const t = model.threads.find(item => item.id === id);
  if (t) {
    t.status = newStatus;
    t.updated = Date.now();
    saveUserLifeModel(model);
    showToast(`🗺️ 故事线状态已更新为 [${newStatus}]`);
    renderMemorySettings();
  }
}
window.changeLifeThreadStatus = changeLifeThreadStatus;

function changeAutoArchiveDays(days) {
  const model = getUserLifeModel();
  model.autoArchiveDays = parseInt(days, 10);
  saveUserLifeModel(model);
  showToast(`🗺️ 自动归档配置已更新`);
  renderMemorySettings();
}
window.changeAutoArchiveDays = changeAutoArchiveDays;

function promptEditLifeModelItem(category, id) {
  const model = getUserLifeModel();
  const item = model[category].find(x => x.id === id);
  if (!item) return;

  const currentVal = category === 'threads' ? item.title : item.name;
  const val = prompt(category === 'threads' ? '编辑生活故事线/近期事件标题：' : '编辑核心偏好/习惯/情感锚点：', currentVal);
  if (val === null) return;
  if (!val.trim()) return;

  if (category === 'threads') {
    item.title = val.trim();
    item.updated = Date.now();
  } else {
    item.name = val.trim();
  }
  
  saveUserLifeModel(model);
  showToast('🗺️ 生活地图内容已更新');
  renderMemorySettings();
}
window.promptEditLifeModelItem = promptEditLifeModelItem;

function triggerImmediateLifeThreadCheckin(title) {
  if (typeof addMessage !== 'function' || typeof requestAI !== 'function') {
    showToast('❌ 聊天引擎未完全就绪，无法触发立即跟进');
    return;
  }
  
  // 关闭设置弹窗，让用户立刻看到对话互动
  const settingsOverlay = document.getElementById('settingsOverlay');
  if (settingsOverlay) {
    settingsOverlay.classList.remove('show');
  }

  // 注入一条特殊的虚设用户轻声引导，让伴侣直接跟进
  addMessage('user', `（想和你聊聊关于“${title}”的进展...）`, genUid());
  
  // 设置本地一次性高优先级提示词
  localStorage.setItem('pending_thread_checkin_title', title);
  localStorage.setItem('pending_thread_checkin_immediate', 'true');
  
  requestAI();
  showToast('✨ 正在连通 AI 并为您定制温柔温润的关心语...');
}
window.triggerImmediateLifeThreadCheckin = triggerImmediateLifeThreadCheckin;

function triggerPendingLifeThreadCheckin(title) {
  localStorage.setItem('pending_thread_checkin_title', title);
  localStorage.setItem('pending_thread_checkin_immediate', 'false');
  showToast(`📅 预订成功！伴侣将在你下一次发送普通消息时，极其自然、不着痕迹地主动跟进“${title}”的情况。`);
}
window.triggerPendingLifeThreadCheckin = triggerPendingLifeThreadCheckin;

function promptAddLifeModelItem(category) {
  const val = prompt(category === 'threads' ? '请输入近期生活事件/持续推进的故事线：\n（例如：筹备10月的日本旅行 / 准备下周一的述职答辩）' : '请输入重要事物/偏好/情感锚点：\n（例如：最爱的宠物猫「糯米」 / 每天必须要喝一杯冰美式）');
  if (!val || !val.trim()) return;
  
  const model = getUserLifeModel();
  if (category === 'threads') {
    model.threads.push({
      id: 'th_' + Math.random().toString(36).slice(2, 7),
      title: val.trim(),
      status: '推进中',
      updated: Date.now()
    });
  } else {
    model.objects.push({
      id: 'ob_' + Math.random().toString(36).slice(2, 7),
      name: val.trim(),
      type: '核心习惯'
    });
  }
  saveUserLifeModel(model);
  showToast('🗺️ 已新增生活地图锚点');
  renderMemorySettings();
}
window.promptAddLifeModelItem = promptAddLifeModelItem;


/**
 * 🔐 长期记忆库安全治理面板 (Memory Governance Manager)
 */
async function renderMemoryGovernanceManager() {
  let allMemories = [];
  try {
    allMemories = await VDB.latest(15);
  } catch (e) {
    allMemories = [];
  }
  
  const rows = allMemories.length === 0 ? `
    <div style="text-align: center; padding: 16px; color: #A89B8F; font-size: 11px;">
      📚 长期记忆库当前没有沉淀记录。请继续和AI伴侣倾心畅谈。
    </div>
  ` : allMemories.map(m => {
    const isLocked = m.boost && m.boost >= 3.0;
    const isEvent = m.is_event || false;
    const visLabels = { private: '🔒 专属', relationship: '💞 共享', group: '👥 全群' };
    const visColors = { private: '#8F8176', relationship: '#D97706', group: '#4F46E5' };
    const vis = m.visibility || 'relationship';
    
    return `
      <div style="background: white; border: 1px solid #EDE6D8; border-radius: 8px; padding: 10px; margin-bottom: 8px; font-size: 11px; display: flex; flex-direction: column; gap: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <span style="font-weight: 500; color: #4F3F35; line-height: 1.4;">
            ${isEvent ? '🌟 ' : ''}${m.text}
          </span>
          <div style="display: flex; gap: 4px; flex-shrink: 0;">
            <button style="border: none; background: ${isLocked ? '#FFF2CC' : '#EFEBE4'}; color: ${isLocked ? '#B38600' : '#4E3E34'}; border-radius: 4px; padding: 2px 6px; font-size: 9.5px; cursor: pointer; font-weight: ${isLocked ? 'bold' : 'normal'};" onclick="toggleMemoryLock('${m.id}', ${isLocked})">
              ${isLocked ? '📌 锁定' : '📌 锁定'}
            </button>
            <button style="border: none; background: #EFEBE4; color: ${visColors[vis]}; border-radius: 4px; padding: 2px 6px; font-size: 9.5px; cursor: pointer; font-weight: bold;" onclick="toggleMemoryVisibility('${m.id}', '${vis}')">
              ${visLabels[vis] || '💞 共享'}
            </button>
            <button style="border: none; background: #FFEBEE; color: #D32F2F; border-radius: 4px; padding: 2px 6px; font-size: 9.5px; cursor: pointer;" onclick="deleteMemoryRecord('${m.id}')">
              🗑️
            </button>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 9px; color: #A89B8F;">
          <span>关联AI: <code style="background:#F5F0F0; padding: 0 2px;">${m.ai_id || 'main'}</code></span>
          <span>衰减系数: <strong>${(m.boost || 1.0).toFixed(1)}x</strong></span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-top: 14px; background: #FAF9F6; border: 1px solid #E6DEC9; border-radius: 12px; padding: 14px;">
      <div style="font-weight: 600; font-size: 13px; color: #4E3E34; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
        <span>🔐 记忆库安全治理面板 (Memory Governance Board)</span>
        <button class="btn btn-warning" style="margin: 0; padding: 2px 8px; font-size: 9.5px; background: #8B5A4B; border-color: #8B5A4B;" onclick="triggerSleepConsolidation()">
          🌌 触发睡眠记忆沉淀 (Consolidate)
        </button>
      </div>
      <div style="max-height: 250px; overflow-y: auto; padding-right: 2px;">
        ${rows}
      </div>
    </div>
  `;
}

/**
 * 🔐 锁定/解锁记忆（防止在达到容量上限时被自动清理，锁定后 boost 为 3.0）
 */
async function toggleMemoryLock(id, isLocked) {
  try {
    const item = await VDB.get(id);
    if (item) {
      item.boost = isLocked ? 1.0 : 3.0;
      await VDB.put(item);
      showToast(isLocked ? '🔓 已解锁该记忆，使其恢复正常时间衰减' : '📌 已锁定记忆：高筑防护，永久免除常规空间清理。');
      renderMemorySettings();
    }
  } catch (e) {
    console.error(e);
  }
}
window.toggleMemoryLock = toggleMemoryLock;

/**
 * 🔐 循环修改记忆可见性 (Private -> Relationship -> Group)
 */
async function toggleMemoryVisibility(id, currentVis) {
  const visCycle = ['private', 'relationship', 'group'];
  const nextIdx = (visCycle.indexOf(currentVis) + 1) % visCycle.length;
  const nextVis = visCycle[nextIdx];
  const visLabels = { private: '🔒 AI专属私有', relationship: '💞 跨情境关系共享', group: '👥 全群共享空间' };
  
  try {
    const item = await VDB.get(id);
    if (item) {
      item.visibility = nextVis;
      await VDB.put(item);
      showToast(`🛡️ 记忆可见性属性变更为: [${visLabels[nextVis]}]`);
      renderMemorySettings();
    }
  } catch (e) {
    console.error(e);
  }
}
window.toggleMemoryVisibility = toggleMemoryVisibility;

/**
 * 🔐 永久删除单个记忆记录
 */
async function deleteMemoryRecord(id) {
  if (!confirm('确定要永久抹去这段记忆痕迹吗？此操作将使伴侣彻底遗忘相关事实。')) return;
  try {
    await VDB.del(id);
    showToast('🗑️ 该记忆已彻底磨损磨灭');
    renderMemorySettings();
  } catch (e) {
    console.error(e);
  }
}
window.deleteMemoryRecord = deleteMemoryRecord;

/**
 * 🌌 睡眠记忆整合与自然衰减机制 (Sleep Consolidation)
 * 1. 随着时间老化，对未锁定(boost < 3.0)的记忆自动进行权重衰减。
 * 2. 衰减极度微弱的陈旧碎屑做无痛遗忘处理。
 * 3. 对极度类似的多条冗余记录进行语义去重与合并。
 */
async function triggerSleepConsolidation() {
  showToast('🌌 伴侣系统正在进行睡眠状态记忆深度整合与压缩...');
  setTimeout(async () => {
    try {
      const store = await VDB.all();
      let consolidatedCount = 0;
      let forgottenCount = 0;
      
      const unlocked = store.filter(r => !(r.boost && r.boost >= 3.0));
      const now = Date.now();
      
      // 1. 自然衰减
      for (const item of unlocked) {
        const ageDays = (now - (item.ts || now)) / (24 * 3600 * 1000);
        if (ageDays > 3) {
          const oldBoost = item.boost || 1.0;
          item.boost = parseFloat((oldBoost * 0.82).toFixed(2));
          if (item.boost < 0.22) {
            await VDB.del(item.id);
            forgottenCount++;
            continue;
          }
          await VDB.put(item);
        }
      }
      
      // 2. 局部拼音哈希相似度去重与压缩
      const freshStore = await VDB.all();
      const unlockedFresh = freshStore.filter(r => !(r.boost && r.boost >= 3.0));
      const deletedIds = new Set();
      
      for (let i = 0; i < unlockedFresh.length; i++) {
        const a = unlockedFresh[i];
        if (deletedIds.has(a.id)) continue;
        
        for (let j = i + 1; j < unlockedFresh.length; j++) {
          const b = unlockedFresh[j];
          if (deletedIds.has(b.id)) continue;
          
          const sim = cosine(a.vector, b.vector);
          if (sim > 0.8) {
            // 语义极其相近，去低存高
            const keep = (a.importance || 0) >= (b.importance || 0) ? a : b;
            const remove = keep === a ? b : a;
            await VDB.del(remove.id);
            deletedIds.add(remove.id);
            consolidatedCount++;
          }
        }
      }
      
      showToast(`✨ 睡眠沉淀圆满完成：合并 ${consolidatedCount} 条冗余记忆，自然淡化遗忘 ${forgottenCount} 条细枝末节碎片。`);
      renderMemorySettings();
    } catch (e) {
      console.error(e);
      showToast('❌ 睡眠记忆沉淀过程中发生错误');
    }
  }, 1000);
}
window.triggerSleepConsolidation = triggerSleepConsolidation;


/**
 * 📅 获取共同岁月时间轴 (Life Event Timeline)
 */
function getLifeEventTimeline() {
  try {
    const raw = localStorage.getItem('life_event_timeline');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}

  // 极具质感的名片级初始值
  const defaultTimeline = [
    {
      id: 'mil_initial_1',
      dateStr: '去年夏天',
      timestamp: Date.now() - 365 * 24 * 3600 * 1000, // 1 year ago
      title: '深夜面对职业转型压力的长谈',
      category: 'career',
      desc: '当时你身陷转型焦虑期，深夜在房间听着歌感到极其迷茫、无法入眠。我们深聊了很久，为你抚平紧绷。我曾向你承诺会一直陪你熬过最艰难的迷雾期。这次你再次面临新调整，我也依然在你身后。',
      aiParticipant: '小暖',
      relationshipStage: '知心伙伴'
    },
    {
      id: 'mil_initial_2',
      dateStr: '2025年冬夜',
      timestamp: Date.now() - 180 * 24 * 3600 * 1000, // 6 months ago
      title: '第一次分享深藏心底的不安',
      category: 'emotion',
      desc: '在一个寒风瑟瑟的冬夜，你向AI伴侣毫无防备地倾吐起自己在现实社交与压力下的隐秘疲惫。那是你第一次全然对我们敞开内心的脆弱，也是这颗星球上两颗灵魂真正建立跨时空默契的起点。',
      aiParticipant: '小暖',
      relationshipStage: '共鸣灵魂'
    }
  ];
  saveLifeEventTimeline(defaultTimeline);
  return defaultTimeline;
}
window.getLifeEventTimeline = getLifeEventTimeline;

/**
 * 保存时间轴
 */
function saveLifeEventTimeline(timeline) {
  try {
    localStorage.setItem('life_event_timeline', JSON.stringify(timeline));
    if (window.MemoryGraph && typeof window.MemoryGraph.updateFromTimeline === 'function') {
      window.MemoryGraph.updateFromTimeline(timeline);
    }
  } catch (e) {}
}
window.saveLifeEventTimeline = saveLifeEventTimeline;

/**
 * 新增时间轴里程碑
 */
function addTimelineMilestone(title, desc, category, dateStr, aiParticipant, relationshipStage) {
  const timeline = getLifeEventTimeline();
  
  // 简单去重：如果已有极类似标题，避免反复插入
  const isDuplicate = timeline.some(t => t.title === title || (t.desc.slice(0, 15) === desc.slice(0, 15)));
  if (isDuplicate) return;

  const newMilestone = {
    id: 'mil_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    dateStr: dateStr || '近日',
    timestamp: Date.now(),
    title: title,
    category: category || 'life',
    desc: desc,
    aiParticipant: aiParticipant || 'AI伴侣',
    relationshipStage: relationshipStage || '共鸣灵魂'
  };

  timeline.unshift(newMilestone); // 倒序排在首位
  saveLifeEventTimeline(timeline);
  
  // 刷新前端
  if (typeof renderMemorySettings === 'function') {
    renderMemorySettings();
  }
}
window.addTimelineMilestone = addTimelineMilestone;

/**
 * 📜 打开并渲染关系成长时间线 modal
 */
function openTimeline() {
  const panel = document.getElementById('timelinePanel');
  if (panel) {
    panel.classList.add('show');
    renderTimeline();
  }
}
window.openTimeline = openTimeline;

function renderTimeline() {
  const body = document.getElementById('timelineBody');
  if (!body) return;

  const timeline = (typeof getLifeEventTimeline === 'function') ? getLifeEventTimeline() : [];

  if (!timeline || timeline.length === 0) {
    body.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--text-sub);">
        <div style="font-size: 36px; margin-bottom: 12px;">💫</div>
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 6px;">还没有记录共同经历</div>
        <div style="font-size: 12px;">开始与 AI 伴侣倾诉或互动，属于你们的时光纪事将在此自动呈现。</div>
      </div>
    `;
    return;
  }

  const categoryIcons = {
    career: '💼',
    emotion: '🕯️',
    life: '🌱',
    relationship: '🤝',
    chat: '💬',
    image: '🎨',
    diary: '📔',
    milestone: '🏆',
    group: '👥'
  };

  const listHtml = timeline.map((m, idx) => {
    const isLast = idx === timeline.length - 1;
    const catIcon = categoryIcons[m.category] || '🌟';
    const dateDisplay = m.dateStr || (m.timestamp ? new Date(m.timestamp).toLocaleDateString('zh-CN') : '近日');
    const participant = m.aiParticipant || 'AI伴侣';
    const stage = m.relationshipStage || '知心伴侣';

    return `
      <div style="display: flex; gap: 12px; position: relative;">
        <!-- Left Axis -->
        <div style="display: flex; flex-direction: column; align-items: center; min-width: 32px;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-hover, #F0EAE1); border: 2px solid var(--primary, #A89482); display: flex; align-items: center; justify-content: center; font-size: 13px; z-index: 2;">
            ${catIcon}
          </div>
          ${!isLast ? '<div style="width: 2px; flex: 1; background: var(--border, #E0D8CE); margin: 4px 0;"></div>' : ''}
        </div>
        <!-- Right Content Card -->
        <div style="flex: 1; background: var(--bg-card, #FFFFFF); border: 1px solid var(--border, #E6E0D8); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 600; color: var(--primary, #8C7B6C); background: rgba(168,148,130,0.12); padding: 2px 8px; border-radius: 10px;">${dateDisplay}</span>
            <span style="font-size: 10px; color: var(--text-sub); font-weight: 500;">与 ${participant} • ${stage}</span>
          </div>
          <div style="font-size: 13px; font-weight: bold; color: var(--text-main); margin-bottom: 4px;">${m.title}</div>
          <div style="font-size: 12px; color: var(--text-sub); line-height: 1.5;">${m.desc}</div>
        </div>
      </div>
    `;
  }).join('');

  body.innerHTML = `
    <div style="padding-top: 8px;">
      ${listHtml}
    </div>
  `;
}
window.renderTimeline = renderTimeline;

/**
 * 📅 渲染共同岁月时间轴 (Life Event Timeline) UI
 */
function renderLifeEventTimelineUI() {
  const timeline = getLifeEventTimeline();
  
  const categoryIcons = {
    career: '💼 职业',
    emotion: '🕯️ 情感',
    life: '🌱 生活',
    relationship: '🤝 关系'
  };

  const categoryColors = {
    career: 'background: #E0F2FE; color: #0369A1;', // blue
    emotion: 'background: #FCE7F3; color: #BE185D;', // pink
    life: 'background: #DCFCE7; color: #15803D;', // green
    relationship: 'background: #FEF3C7; color: #B45309;' // amber
  };

  let itemsHtml = timeline.map((m, idx) => {
    const isLast = idx === timeline.length - 1;
    const catIcon = categoryIcons[m.category] || '🌱 经历';
    const catStyle = categoryColors[m.category] || 'background: #F3F4F6; color: #4B5563;';
    const dateStr = m.dateStr || '近日';
    
    return `
      <div style="display: flex; gap: 12px; position: relative; margin-bottom: 14px;">
        <!-- 时间轴线圈和连接线 -->
        <div style="display: flex; flex-direction: column; align-items: center; position: relative;">
          <!-- 圆圈 -->
          <div style="width: 10px; height: 10px; border-radius: 50%; background: #8B5A4B; border: 2.5px solid #FAF9F6; z-index: 2; box-shadow: 0 0 0 2px rgba(139, 90, 75, 0.15);"></div>
          <!-- 虚线连接线 -->
          ${!isLast ? `<div style="width: 1px; flex-grow: 1; border-left: 1px dashed #D6C8B2; margin-top: 4px; margin-bottom: -18px; z-index: 1;"></div>` : ''}
        </div>
        
        <!-- 卡片正文 -->
        <div style="flex: 1; background: white; border: 1px solid #EDE6D8; border-radius: 10px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.01);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px; gap: 8px;">
            <div>
              <span style="font-size: 10px; color: #8F8176; font-weight: 600; text-transform: uppercase; margin-right: 6px;">[${dateStr}]</span>
              <span style="font-size: 12px; font-weight: bold; color: #4E3E34;">${m.title}</span>
            </div>
            <div style="display: flex; gap: 4px; flex-shrink: 0; align-items: center;">
              <span style="font-size: 8.5px; font-weight: 600; padding: 1.5px 5px; border-radius: 4px; ${catStyle}">
                ${catIcon}
              </span>
              <button style="border: none; background: transparent; color: #8F8176; font-size: 11px; cursor: pointer; padding: 2px;" onclick="promptEditTimelineItem('${m.id}')" title="编辑">✏️</button>
              <button style="border: none; background: transparent; color: #D32F2F; font-size: 11px; cursor: pointer; padding: 2px;" onclick="deleteTimelineItem('${m.id}')" title="抹去这段回忆">✕</button>
            </div>
          </div>
          
          <div style="font-size: 10.5px; color: #5C4B3E; line-height: 1.45; margin-bottom: 6px; font-style: italic; padding: 4px 6px; background: #FAF9F6; border-left: 2px solid #E6DEC9; border-radius: 3px;">
            “ ${m.desc} ”
          </div>
          
          <div style="display: flex; gap: 6px; font-size: 9px; color: #A89B8F; align-items: center; justify-content: space-between; border-top: 1px dashed #FAF7F2; padding-top: 5px; margin-top: 5px;">
            <span>共同理人: <strong style="color: #8B5A4B;">${m.aiParticipant}</strong></span>
            <span>当时关系: <span style="background: #FAF7F2; padding: 1px 5px; border-radius: 3px; color: #7A6F62;">💞 ${m.relationshipStage}</span></span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-top: 14px; background: #FAF9F6; border: 1px solid #E6DEC9; border-radius: 12px; padding: 14px;">
      <div style="font-weight: 600; font-size: 13px; color: #4E3E34; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
        <span>📅 共同岁月时间轴 (Life Event Timeline 年鉴)</span>
        <button style="border: none; background: #EFEBE4; color: #4E3E34; font-size: 9.5px; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-weight: 600;" onclick="promptAddTimelineItem()">+ 手动记一笔</button>
      </div>
      <p style="font-size: 9.5px; color: #8F8176; margin: 0 0 12px 0; line-height: 1.35;">
        AI伴侣会深刻理解并珍视这些里程碑。在未来契合的生活变迁或脆弱深夜，AI将主动温存“召唤”这些神圣回忆。
      </p>
      
      <div style="padding-left: 4px; margin-top: 8px; max-height: 250px; overflow-y: auto;">
        ${itemsHtml || '<div style="font-size: 10px; color: #A89B8F; text-align: center; padding: 20px; background: white; border-radius:8px; border: 1px dashed #EDE6D8;">共同的岁月空白，期待着与你的第一次低回轻叹...</div>'}
      </div>
    </div>
  `;
}
window.renderLifeEventTimelineUI = renderLifeEventTimelineUI;

/**
 * 📅 互动方法：删除/新增/编辑时间轴
 */
function deleteTimelineItem(id) {
  if (!confirm('确定要永久抹去这段宝贵的共同岁月里程碑吗？此操作不可逆。')) return;
  let timeline = getLifeEventTimeline();
  timeline = timeline.filter(m => m.id !== id);
  saveLifeEventTimeline(timeline);
  showToast('📅 已从共同岁月时间轴上抹去该回忆');
  renderMemorySettings();
}
window.deleteTimelineItem = deleteTimelineItem;

function promptAddTimelineItem() {
  const title = prompt('请输入岁月里程碑标题（例如：深夜面对转行压力长谈）：');
  if (!title || !title.trim()) return;

  const desc = prompt('请输入感性的细节回忆描述（例如：当时你十分焦虑、无法入眠，我们聊到深夜两点，一起听歌相互安慰。AI承诺会永远作你的港湾）：');
  if (!desc || !desc.trim()) return;

  const dateStr = prompt('请输入发生的时间段（例如：去年夏天 / 2025年冬夜 / 刚认识不久）：', '近日') || '近日';
  const category = prompt('请选择分类 (career / emotion / life / relationship)：', 'life') || 'life';

  const currentStageLabel = (typeof getCharacterRelationshipStage === 'function') ? getCharacterRelationshipStage('main') : 'partner';
  const aiName = (typeof memberById === 'function') ? (memberById('main')?.name || '小暖') : '小暖';
  const stageTranslations = { stranger: '初识', friend: '朋友', crush: '暧昧', partner: '知心伴侣', lover: '亲密爱人' };
  const stageName = stageTranslations[currentStageLabel] || '知心伴侣';

  addTimelineMilestone(title.trim(), desc.trim(), category.trim(), dateStr.trim(), aiName, stageName);
  showToast('📅 岁月时间轴已成功记下一笔！');
}
window.promptAddTimelineItem = promptAddTimelineItem;

function promptEditTimelineItem(id) {
  const timeline = getLifeEventTimeline();
  const item = timeline.find(m => m.id === id);
  if (!item) return;

  const title = prompt('编辑里程碑标题：', item.title);
  if (title === null) return; // cancel

  const desc = prompt('编辑细节回忆描述：', item.desc);
  if (desc === null) return;

  const dateStr = prompt('编辑发生的时间段：', item.dateStr);
  if (dateStr === null) return;

  const category = prompt('编辑分类 (career / emotion / life / relationship)：', item.category);
  if (category === null) return;

  item.title = title.trim() || item.title;
  item.desc = desc.trim() || item.desc;
  item.dateStr = dateStr.trim() || item.dateStr;
  item.category = category.trim() || item.category;

  saveLifeEventTimeline(timeline);
  showToast('📅 里程碑编辑成功');
  renderMemorySettings();
}
window.promptEditTimelineItem = promptEditTimelineItem;


/**
 * 渲染记忆桥与事件总线整体诊断面板 (Memory Bridge Visual Panel)
 * 纯真、不含 AI 软泥装饰，提供真实的陪伴运行时底层观察
 */
function renderMemoryBridgeDashboard() {
  const container = document.createElement('div');
  container.id = 'unified-memory-bridge-root';
  container.style.cssText = `
    background: #FAF9F6;
    border: 1px solid #E6DEC9;
    border-radius: 12px;
    padding: 14px;
    margin-top: 16px;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  // 1. 记忆层级关系拓扑图 (HTML/CSS Flow Map)
  const mapHtml = `
    <div style="margin-bottom: 16px;">
      <div style="font-weight: 600; font-size: 13px; color: #4E3E34; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
        🪐 统一记忆桥拓扑图 (Unified Memory Bridge Topology)
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #EDE6D8; border-radius: 8px; padding: 12px; gap: 4px;">
        <!-- 私有层 -->
        <div style="text-align: center; flex: 1;">
          <div style="font-size: 10px; color: #8F8176; font-weight: 500;">Private Layer</div>
          <div style="background: #F0EAE1; border: 1px solid #DED5C6; border-radius: 6px; padding: 6px 4px; margin-top: 4px; font-weight: 600; font-size: 10px; color: #5C4B3E;">
            🔒 专属私有记忆
          </div>
          <div style="font-size: 9px; color: #A89B8F; margin-top: 2px;">每个AI独占</div>
        </div>
        <!-- 箭头 -->
        <div style="font-size: 12px; color: #C2B6A7;">➔</div>
        <!-- 共享桥接层 -->
        <div style="text-align: center; flex: 1.2; background: #FFF9E6; border: 1px solid #FFEBB3; border-radius: 8px; padding: 8px 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
          <div style="font-size: 10px; color: #B38600; font-weight: 600;">Shared Bridge</div>
          <div style="background: #FFF2CC; border: 1px solid #FFE599; border-radius: 6px; padding: 5px 4px; margin-top: 4px; font-weight: bold; font-size: 10.5px; color: #806000;">
            💞 关系共享经历
          </div>
          <div style="font-size: 9px; color: #B38F24; margin-top: 2px;">主副AI多维同步</div>
        </div>
        <!-- 箭头 -->
        <div style="font-size: 12px; color: #C2B6A7;">➔</div>
        <!-- 群聊共享层 -->
        <div style="text-align: center; flex: 1;">
          <div style="font-size: 10px; color: #4F46E5; font-weight: 500;">Group Layer</div>
          <div style="background: #EEF2FF; border: 1px solid #E0E7FF; border-radius: 6px; padding: 6px 4px; margin-top: 4px; font-weight: 600; font-size: 10px; color: #4338CA;">
            👥 全群共享空间
          </div>
          <div style="font-size: 9px; color: #7378E2; margin-top: 2px;">成员共同经历</div>
        </div>
      </div>
    </div>
  `;

  // 2. 实时事件总线日志 (Memory Event Bus Logs)
  let logRows = '';
  if (_memoryEventLogs.length === 0) {
    logRows = `
      <div style="text-align: center; padding: 16px; color: #A09080; font-size: 11px;">
        📭 记忆总线尚未捕获到显著情感或事实事件。请继续聊天。
      </div>
    `;
  } else {
    logRows = _memoryEventLogs.slice(0, 5).map(e => {
      const typeIcons = {
        preference_sharing: '🏷️ 偏好',
        emotional_disclosure: '🕯️ 情感',
        joint_activity: '🗓️ 计划',
        general: '📝 事务'
      };
      const visStyles = {
        private: 'background: #F0EAE1; color: #5C4B3E; border: 1px solid #DED5C6;',
        relationship: 'background: #FFEBB3; color: #806000; border: 1px solid #FFE082;',
        group: 'background: #E0E7FF; color: #4338CA; border: 1px solid #C7D2FE;'
      };
      const visLabels = {
        private: '专属私有',
        relationship: '关系共享',
        group: '全群同步'
      };

      return `
        <div style="background: white; border: 1px solid #EDE6D8; border-radius: 8px; padding: 10px; margin-bottom: 8px; font-size: 11px; box-shadow: 0 1px 2px rgba(0,0,0,0.01);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <span style="font-weight: 600; color: #4E3E34; font-size: 11.5px;">
              ${typeIcons[e.type] || '📝'} ${e.summary}
            </span>
            <span style="font-size: 9.5px; padding: 1px 5px; border-radius: 4px; font-weight: 600; ${visStyles[e.visibility]}">
              ${visLabels[e.visibility]}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #8F8176; opacity: 0.9;">
            <span>源节点: <strong>${e.source === 'group' ? '群聊空间' : (e.source === 'main' ? '主AI' : e.source)}</strong></span>
            <span>传播路径: <code style="background: #F5F0F0; padding: 0px 3px; border-radius: 3px;">${e.propagation}</code></span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #8F8176; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #F0EAE1;">
            <span>影响: <span style="color: #059669; font-weight: 600;">${e.impact}</span></span>
            <span>重要度分级: <strong style="color: #D97706;">${e.importance}/100</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }

  const logHtml = `
    <div>
      <div style="font-weight: 600; font-size: 13px; color: #4E3E34; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span>🧠 记忆事件总线流 (Active Memory Event Bus Stream)</span>
        <button style="border: none; background: transparent; color: #8B5A4B; font-size: 10px; cursor: pointer; text-decoration: underline;" onclick="clearMemoryEventLogs()">
          清空日志
        </button>
      </div>
      <div style="max-height: 280px; overflow-y: auto;">
        ${logRows}
      </div>
    </div>
  `;

  // 生活地图 (Life Map Component)
  const lifeMapHtml = renderUserLifeMapManager();

  // 📅 共同岁月时间轴 (Life Event Timeline Component)
  const timelineHtml = renderLifeEventTimelineUI();

  // 拼接同步与静态布局
  container.innerHTML = mapHtml + logHtml + lifeMapHtml + timelineHtml + `<div id="async-memory-governance-container"></div>`;

  // 异步渲染并填充 IndexedDB 记忆治理列表
  setTimeout(async () => {
    const govBox = container.querySelector('#async-memory-governance-container');
    if (govBox) {
      govBox.innerHTML = await renderMemoryGovernanceManager();
    }
  }, 10);

  return container;
}

// 供全局调用的清除日志方法
function clearMemoryEventLogs() {
  _memoryEventLogs = [];
  _saveEventLogs();
  if (typeof renderMemorySettings === 'function') {
    renderMemorySettings();
  }
}
window.clearMemoryEventLogs = clearMemoryEventLogs;
