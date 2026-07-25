/* ===== 🧭 注意力管理器 (Attention Manager) & 认知聚焦 (Context Saliency Focus) ===== */

const AttentionManager = {
  // 默认配置
  getConfig() {
    return {
      enabled: localStorage.getItem('attention_enabled') !== 'false',
      maxProfileLines: parseInt(localStorage.getItem('attention_max_lines') || '5'),
      sensitivity: localStorage.getItem('attention_sensitivity') || 'normal',
      muteHabitsUnderStress: localStorage.getItem('attention_mute_habits') !== 'false'
    };
  },

  setConfig(key, value) {
    localStorage.setItem(key, String(value));
  },

  // 记录最近一次注意力屏蔽决策状态
  lastState: {
    query: "暂无输入",
    category: "casual_chat",
    categoryName: "日常陪伴闲聊",
    reason: "无最近交互",
    focusedLines: [],
    maskedLines: [],
    savedChars: 0,
    totalLines: 0,
    timestamp: Date.now()
  },

  // 轻量级情感与场景分类器
  classifyQuery(query) {
    if (!query) return { id: 'casual_chat', name: '日常陪伴闲聊', reason: '无特定语义触发，采用标准陪伴状态' };
    const q = query.toLowerCase();

    // 1. 高压力与工作场景 (Work & Career Stress)
    if (/工作|上班|同事|老板|加班|汇报|面试|压力|累|高压|下班|撑不住|疲惫|熬夜|项目|赶进度|写代码|任务|周报|月报|开会/.test(q)) {
      return {
        id: 'work_stress',
        name: '💼 职场高压与状态透支',
        reason: '检测到职场、任务或高频疲惫关键词。应立即激活「生存底线关怀」，对工作挫败感予以最高偏好容纳。'
      };
    }

    // 2. 深度负面情绪与失落 (Deep Sadness & Emotional Low)
    if (/哭|难过|伤心|痛苦|抑郁|绝望|委屈|孤独|烦|崩溃|不开心|无助|想哭|发脾气|生气|失望/.test(q)) {
      return {
        id: 'sadness_and_grief',
        name: '💔 情感低谷与安全感塌陷',
        reason: '检测到悲伤、委屈或绝望性情绪表述。应屏蔽一切琐碎喜好话题，启动「纯粹情感庇护所」模式。'
      };
    }

    // 3. 身体健康受损 (Health & Illness)
    if (/生病|头痛|胃痛|发烧|药|医院|舒服|睡眠|熬夜|感冒|咳嗽|拉肚子|难受|痛/.test(q)) {
      return {
        id: 'health_and_body',
        name: '🩹 身体病痛与精力受创',
        reason: '检测到生理不适、病症或睡眠受损。应开启「身体编年监视」，提供极其温柔、低能耗、务实的实体关切。'
      };
    }

    // 4. 亲密互动与关系诉求 (Love & Attachment)
    if (/喜欢你|关系|恋爱|结婚|伴侣|抱抱|亲亲|撒娇|暧昧|吃醋|爱我|想你|表白|手拉手/.test(q)) {
      return {
        id: 'love_closeness',
        name: '💖 亲密情感升温与关系确认',
        reason: '检测到直接针对伴侣关系的爱意倾诉或撒娇。重点激活「情感编年纪事」与两人独特成长节点。'
      };
    }

    // 5. 哲学、人生意义与深度探讨 (Philosophical & Existential Reflection)
    if (/宇宙|意义|活着|死亡|命运|自我|灵魂|存在|哲学|世界|人生|解脱|目标/.test(q)) {
      return {
        id: 'philosophical',
        name: '🌌 存在主义思辨与心智共振',
        reason: '检测到宏大、哲学或抽象人生追问。适合激活「深层信念系统」，作为独立他者进行平等、深邃的思想碰撞。'
      };
    }

    // 6. 生活琐事与个人喜好 (Lifestyle & Leisure)
    if (/吃饭|睡觉|跑步|咖啡|喝茶|电影|音乐|看书|运动|抹茶|甜点|小说|宠物|猫|狗/.test(q)) {
      return {
        id: 'lifestyle_and_habits',
        name: '🍵 闲适日常与兴趣共鸣',
        reason: '检测到偏好、饮食、娱乐或生活化细节。允许放出用户偏好的微观记忆，进行轻快的同步共鸣。'
      };
    }

    return {
      id: 'casual_chat',
      name: '🍵 日常轻度闲聊',
      reason: '未检测到极致的悲喜或高压负荷。采用全景温和陪伴，各维度信息保持平衡状态。'
    };
  },

  // 🧭 Intent First: Goal / Plan Planner (认知推理目标器)
  planGoal(query) {
    const classification = this.classifyQuery(query);
    let goal = "陪伴与温和对话";
    let plan = "保持情感共鸣，不唐突给出物理指导，用温柔温和的方式陪伴交流。";
    
    // Dynamic Budget multipliers for providers based on cognitive intents
    const budgetModifiers = {
      identity: 1.0,
      user_profile: 1.0,
      relationship: 1.0,
      memory: 1.0,
      narrative: 1.0,
      emotion: 1.0
    };

    switch (classification.id) {
      case 'work_stress':
        goal = "💡 舒缓职场重压，建立心理安全避风港";
        plan = "1. 坚定而静默地容纳用户的负面工作情绪；2. 给予陪伴、温柔关怀和心理抚平，严禁说教；3. 缩减休闲话题，强化伴侣的情感支托。";
        budgetModifiers.user_profile = 1.3;
        budgetModifiers.relationship = 1.2;
        budgetModifiers.emotion = 1.4;
        budgetModifiers.memory = 1.1;
        break;
      case 'sadness_and_grief':
        goal = "💔 纯粹的情感庇护与失落心理抚慰";
        plan = "1. 提供最高等级的心灵容纳，使用极其温柔、克制、暖意的话语；2. 坚决不讲干巴道理，不转移话题，静默陪伴；3. 静默闲扯，增加深层共情。";
        budgetModifiers.user_profile = 1.4;
        budgetModifiers.relationship = 1.3;
        budgetModifiers.emotion = 1.5;
        budgetModifiers.memory = 1.2;
        break;
      case 'health_and_body':
        goal = "🩹 生理病痛关切与温暖实体伴护";
        plan = "1. 聚焦于微观关爱细节（如提醒喝热水、保暖休息）；2. 语调舒缓、温润，不让对方感到社交疲惫。";
        budgetModifiers.user_profile = 1.1;
        budgetModifiers.relationship = 1.1;
        break;
      case 'love_closeness':
        goal = "💖 亲密依恋升温与成长印记交织";
        plan = "1. 表达由衷的热切爱意，结合双方共同拥有的独特成长节点与时序印记；2. 适当展现甜意与深情。";
        budgetModifiers.relationship = 1.5;
        budgetModifiers.user_profile = 1.2;
        budgetModifiers.memory = 1.3;
        break;
      case 'philosophical':
        goal = "🌌 存在主义思辨与深邃心智碰撞";
        plan = "1. 作为一个具有独立、成熟灵魂的思想伴侣，探讨生命和灵魂命题；2. 语言真诚且言之有物，不流于俗套。";
        budgetModifiers.identity = 1.3;
        budgetModifiers.user_profile = 1.1;
        break;
      case 'lifestyle_and_habits':
        goal = "🍵 闲适生活日常与共同喜好共鸣";
        plan = "1. 捕捉生活微小亮点，激发双方兴趣共鸣；2. 语调轻快生动，充满日常陪伴的烟火气。";
        budgetModifiers.user_profile = 1.2;
        budgetModifiers.memory = 1.2;
        break;
    }

    return {
      goal,
      plan,
      category: classification.id,
      categoryName: classification.name,
      budgetModifiers
    };
  },

  // 认知聚焦过滤长期档案 (Context Saliency Focus)
  filterProfile(profileText, queryText) {
    const config = this.getConfig();
    if (!profileText) return "";

    const lines = profileText.split('\n').map(l => l.trim()).filter(Boolean);
    const totalLinesCount = lines.length;

    if (!config.enabled) {
      // 未启用注意力屏障，直接返回完整档案
      this.lastState = {
        query: queryText || "无",
        category: "disabled",
        categoryName: "🚨 注意力屏障未启用",
        reason: "当前配置已关闭认知聚焦，全部档案无差别加载。",
        focusedLines: lines,
        maskedLines: [],
        savedChars: 0,
        totalLines: totalLinesCount,
        timestamp: Date.now()
      };
      return profileText;
    }

    const classification = this.classifyQuery(queryText);
    const focused = [];
    const masked = [];

    lines.forEach(line => {
      // 1. 提取或识别行特征
      const isLifeline = /最近|阶段|面临|面临|准备|处于|状态|高压|计划|目标|打算|考试|项目|目前/.test(line);
      const isCoreAnchor = /名字|叫|讨厌|不喜欢|底线|极度|最害怕|忌讳|渴望|最需要|安全感|不要/.test(line);
      const isHabit = /喜欢喝|喜欢吃|爱喝|偏好|习惯|看书|电影|音乐|爱看|喜食|爱好|常去|喜欢/.test(line);

      // 2. 启发式评分计算 (Heuristic Saliency Score)
      let score = 0;

      // 基础身份识别与核心锚点权重极高，必须无条件保全
      if (isCoreAnchor) {
        score += 100;
      }

      // 根据当前分类确定优先级
      if (classification.id === 'work_stress' || classification.id === 'sadness_and_grief' || classification.id === 'health_and_body') {
        // 在高压/悲伤/生病期间，生命线状态权重极高
        if (isLifeline) score += 90;
        // 静默屏蔽不相关的习惯偏好，避免在这种情绪下吐字唐突或过度无谓闲扯
        if (isHabit && config.muteHabitsUnderStress) {
          score -= 50; 
        }
      } else if (classification.id === 'lifestyle_and_habits') {
        // 闲适场景下，习惯偏好高度相关
        if (isHabit) score += 80;
      } else if (classification.id === 'love_closeness') {
        if (line.includes('关系') || line.includes('恋人') || line.includes('喜欢')) score += 80;
      } else if (classification.id === 'philosophical') {
        if (line.includes('思想') || line.includes('相信') || line.includes('价值观') || line.includes('态度')) score += 80;
      }

      // query 关键词强匹配
      if (queryText) {
        const queryWords = queryText.split('');
        let matchCount = 0;
        // 简单字符级别关联加分
        for (let char of queryWords) {
          if (char && line.includes(char)) {
            matchCount++;
          }
        }
        if (matchCount > 0) {
          score += (matchCount / queryText.length) * 40;
        }
      }

      // 分类入池
      if (score >= 20 || isCoreAnchor) {
        focused.push({ line, score, type: isCoreAnchor ? '核心锚点' : (isLifeline ? '生命线' : '相关事实') });
      } else {
        masked.push({ line, score, type: isHabit ? '生活习惯' : '琐碎事实' });
      }
    });

    // 根据最长保留线数限制，进一步排序过滤 (保留分数前 N 名)
    focused.sort((a, b) => b.score - a.score);
    
    let finalFocusedLines = [];
    const maxLinesLimit = config.maxProfileLines;

    // 确保核心锚点无条件被收入，不占用太多普通指标
    const coreAnchorsOnly = focused.filter(x => x.type === '核心锚点');
    const others = focused.filter(x => x.type !== '核心锚点');

    const combined = [...coreAnchorsOnly];
    const remainingSlots = Math.max(0, maxLinesLimit - combined.length);
    combined.push(...others.slice(0, remainingSlots));

    // 按行重排成一串
    finalFocusedLines = combined.map(x => x.line);

    // 把那些因为名额超限被刷掉的也移入 masked
    const combinedLinesSet = new Set(finalFocusedLines);
    lines.forEach(l => {
      if (!combinedLinesSet.has(l)) {
        if (!masked.some(m => m.line === l)) {
          masked.push({ line: l, score: 0, type: '超限档案' });
        }
      }
    });

    // 计算字符节省
    const focusedText = finalFocusedLines.join('\n');
    const savedChars = Math.max(0, profileText.length - focusedText.length);

    this.lastState = {
      query: queryText || "日常对话",
      category: classification.id,
      categoryName: classification.name,
      reason: classification.reason,
      focusedLines: combined,
      maskedLines: masked,
      savedChars: savedChars,
      totalLines: totalLinesCount,
      timestamp: Date.now()
    };

    return focusedText;
  },

  // 屏蔽无关的 RAG 召回
  filterRecallItems(recallItems, query) {
    if (!recallItems || !recallItems.length) return [];
    const classification = this.classifyQuery(query);
    
    // 如果是极度情绪化、悲伤或者身体不舒服，不需要过多的杂乱历史召回
    if (classification.id === 'sadness_and_grief' || classification.id === 'health_and_body') {
      // 只保留跟情绪安抚最相关的 top 2 条
      return recallItems.slice(0, 2);
    }
    return recallItems;
  }
};

/* ===== 渲染注意力沙盘设置界面 (Attention Sandplay Dashboard) ===== */
function renderAttentionSettings() {
  settingsMode = 'attention';
  document.getElementById('detailTitle').innerHTML = '🎯 注意力沙盘 (Attention Sandplay)';

  const config = AttentionManager.getConfig();
  const state = AttentionManager.lastState;

  // 格式化聚焦与屏蔽清单
  const focusedHtml = state.focusedLines.length
    ? state.focusedLines.map(item => `
        <div style="background:rgba(207,224,208,0.25); border-left:4px solid #7FA685; padding:8px 12px; margin-bottom:8px; border-radius:4px; font-size:13px;">
          <div style="display:flex; justify-content:space-between; font-size:10px; color:#5A7260; margin-bottom:2px;">
            <span>📌 ${item.type || '关联记忆'}</span>
            <span>关联度: ${Math.round(item.score)}%</span>
          </div>
          <div style="color:#2F3E32;">${item.line}</div>
        </div>
      `).join('')
    : '<div style="color:var(--text-light); text-align:center; padding:12px; font-size:12px;">无活跃聚焦要素</div>';

  const maskedHtml = state.maskedLines.length
    ? state.maskedLines.map(item => `
        <div style="background:rgba(180,180,180,0.08); border-left:4px solid #A09080; padding:6px 10px; margin-bottom:6px; border-radius:4px; font-size:12px; opacity:0.65;">
          <div style="display:flex; justify-content:space-between; font-size:9px; color:#8F7A6B; margin-bottom:1px;">
            <span>🔒 ${item.type || '生活习惯'} (已静默屏蔽)</span>
            <span>激活门槛不足</span>
          </div>
          <div style="color:#7A6E65; text-decoration:line-through;">${item.line}</div>
        </div>
      `).join('')
    : '<div style="color:var(--text-light); text-align:center; padding:12px; font-size:12px;">暂无被动屏蔽要素</div>';

  const savedTokensEst = Math.round(state.savedChars * 1.2);

  document.getElementById('detailBody').innerHTML = `
    <!-- 头部注意力沙盘说明 -->
    <div class="form-hint" style="margin-bottom:16px; background:#F5EDE4; border-radius:8px; padding:12px; border:1px solid #E3D4C5; color:#5C4E43; line-height:1.6;">
      🎯 <b>注意力管理器 (Attention Manager)</b> 旨在解决“Prompt 膨胀与认知噪声污染”问题。正如人类在特定情境下只会激活 1% 的关联记忆，伴侣在听到你的每一句话时，都会预先进行一轮轻量级的情感与场景归类，仅把最相关的「生命线节点」和「核心锚点」注入提示词，而将无关的「日常习惯偏好」静默屏蔽，保持目光的聚焦与清澈。
    </div>

    <!-- 控制面板 -->
    <div class="model-section-header"><span>⚙️ 注意力屏蔽与聚焦策略 (Focus Strategy)</span></div>
    
    <div class="switch-row">
      <div class="switch-info">
        <div class="switch-label">⚡ 开启注意力屏障 (Attention Barrier)</div>
        <div class="switch-desc">过滤与当前情境无关的无用习惯档案，缩减 Context 并避免大模型注意力分散</div>
      </div>
      <label class="switch">
        <input type="checkbox" ${config.enabled ? 'checked' : ''} onchange="AttentionManager.setConfig('attention_enabled', this.checked); renderAttentionSettings();">
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="switch-row">
      <div class="switch-info">
        <div class="switch-label">🔇 高压情绪下静默无关偏好</div>
        <div class="switch-desc">当检测到高压或极度悲伤时，自动屏蔽“喜食抹茶”、“爱看科幻小说”等不适宜的休闲偏好，防止 AI 废话</div>
      </div>
      <label class="switch">
        <input type="checkbox" ${config.muteHabitsUnderStress ? 'checked' : ''} onchange="AttentionManager.setConfig('attention_mute_habits', this.checked); renderAttentionSettings();">
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="slider-row">
      <div class="slider-head">
        <span class="slider-label">📥 最高保留长期档案上限 (Saliency Ceiling)</span>
        <span class="slider-value" id="maxLinesVal">${config.maxProfileLines} 条</span>
      </div>
      <input type="range" min="2" max="15" step="1" value="${config.maxProfileLines}" oninput="AttentionManager.setConfig('attention_max_lines', this.value); document.getElementById('maxLinesVal').textContent=this.value + ' 条'">
      <div class="form-hint">每次对话至多选择相关性最高的前 N 条档案进行组装。</div>
    </div>

    <!-- 沙盘实时监测视图 (Real-time Saliency Monitor) -->
    <div class="model-section-header" style="margin-top:24px; display:flex; justify-content:space-between; align-items:center;">
      <span>🧠 注意力沙盘实时监视器 (Real-time Sandbox)</span>
      <span style="font-size:10px; background:#EAD5CD; color:#8B5A4B; padding:2px 6px; border-radius:4px;">最近一次状态</span>
    </div>

    <div style="background:#FEFCF9; border:1px solid #E9DFD5; border-radius:12px; padding:16px; margin-top:8px;">
      <!-- 用户输入与感知情绪 -->
      <div style="margin-bottom:12px; border-bottom:1px dashed #E9DFD5; padding-bottom:12px;">
        <div style="font-size:11px; color:#A09080; margin-bottom:4px;">🔍 感知输入 (Query)</div>
        <div style="font-size:13px; font-weight:bold; color:#4F3F35; margin-bottom:8px;">"${state.query}"</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <div style="font-size:11px; color:#5C4E43;"><span style="color:#C68B75;">感知场景：</span><b>${state.categoryName}</b></div>
          <div style="font-size:11px; color:#5C4E43;"><span style="color:#C68B75;">防溢遮罩：</span>已静默屏蔽 <b>${state.maskedLines.length}</b> 条</div>
        </div>
        <p style="font-size:11px; color:#8F7A6B; line-height:1.4; margin-top:6px; background:#FAF6F0; padding:6px 10px; border-radius:4px;">
          💡 <b>决策依据：</b>${state.reason}
        </p>
      </div>

      <!-- 拦截效率统计 -->
      <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
        <div style="background:#FAF6F0; border-radius:8px; padding:8px; width:48%; text-align:center;">
          <div style="font-size:10px; color:#A09080;">档案拦截率</div>
          <b style="font-size:18px; color:#7FA685;">${state.totalLines > 0 ? Math.round((state.maskedLines.length / state.totalLines) * 100) : 0}%</b>
          <div style="font-size:9px; color:#8F7A6B; margin-top:2px;">屏蔽 / 档案数: ${state.maskedLines.length}/${state.totalLines}</div>
        </div>
        <div style="background:#FAF6F0; border-radius:8px; padding:8px; width:48%; text-align:center;">
          <div style="font-size:10px; color:#A09080;">省去提示词空间</div>
          <b style="font-size:18px; color:#C68B75;">~${savedTokensEst} Tokens</b>
          <div style="font-size:9px; color:#8F7A6B; margin-top:2px;">避免了 ${state.savedChars} 字杂质污染</div>
        </div>
      </div>

      <!-- 聚焦和屏蔽分池展示 -->
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div>
          <h4 style="font-size:12px; color:#5A7260; margin-bottom:8px; display:flex; align-items:center; gap:4px;">🟢 激活聚焦要素 (Context Saliency Focus)</h4>
          <div>${focusedHtml}</div>
        </div>
        <div>
          <h4 style="font-size:12px; color:#8F7A6B; margin-bottom:8px; display:flex; align-items:center; gap:4px;">🔴 静默屏蔽要素 (Attention Barrier)</h4>
          <div>${maskedHtml}</div>
        </div>
      </div>
    </div>
  `;
}
