/* ===== 🌬️ 对话节奏引擎 (Dialogue Rhythm Engine) ===== */

const RhythmEngine = {
  // 默认配置
  getConfig() {
    return {
      enabled: localStorage.getItem('rhythm_enabled') !== 'false',
      initialBubble: localStorage.getItem('rhythm_initial_bubble') !== 'false',
      silenceAutoMute: localStorage.getItem('rhythm_silence_automute') !== 'false',
      typingStatusShow: localStorage.getItem('rhythm_typing_status') !== 'false'
    };
  },

  setConfig(key, value) {
    localStorage.setItem(key, String(value));
  },

  // 记录最近一次节奏决策
  lastDecision: {
    query: "暂无输入",
    slowTriggered: false,
    reason: "无最近交互",
    delayMs: 0,
    introBubbleSent: false,
    silenceActionSent: false,
    timestamp: Date.now(),
    rhythmLevel: 0,
    rhythmLevelDesc: "未启用"
  },

  // 检测并计算对话节奏 (物理延迟、心智留白与内部等级决策)
  determineRhythm(queryText) {
    const config = this.getConfig();
    if (!config.enabled) {
      this.lastDecision = {
        query: queryText || "日常对话",
        slowTriggered: false,
        reason: "节奏引擎未开启，使用标准瞬时节拍",
        delayMs: 0,
        introBubbleSent: false,
        silenceActionSent: false,
        timestamp: Date.now(),
        rhythmLevel: 0,
        rhythmLevelDesc: "已关闭"
      };
      return { slow: false, delay: 0, reason: '节奏引擎未开启', introText: '', rhythmLevel: 0, rhythmLevelDesc: "已关闭" };
    }

    // 默认 Level 1: 基础时间感知
    let rhythmLevel = 1;
    let rhythmLevelDesc = 'Level 1 - 基础时间感知';

    const hour = new Date().getHours();
    const isNight = (hour >= 23 || hour < 5); // 深夜 23 点至凌晨 5 点

    // ----------------------------------------------------
    // Gap Detection (Level 2: 时间 + 间隔判断)
    // ----------------------------------------------------
    let gapMinutes = 0;
    let hasGap = false;
    
    try {
      const history = window.conversationHistory;
      if (history && history.length > 0) {
        // 获取最后一条对话的发送时间
        const lastMsg = history[history.length - 1];
        if (lastMsg && lastMsg.ts) {
          gapMinutes = (Date.now() - lastMsg.ts) / 60000;
          hasGap = true;
          rhythmLevel = 2;
          rhythmLevelDesc = 'Level 2 - 时间 ＋ 对话间隔';
        }
      }
    } catch (e) {
      console.warn('[RhythmEngine] Error reading history for gap detection:', e);
    }

    // ----------------------------------------------------
    // Emotional State Detection (Level 3: 时间 + 间隔 + 情绪权重)
    // ----------------------------------------------------
    const currentAi = typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main';
    const metrics = typeof getRelationshipMetrics === 'function' ? getRelationshipMetrics(currentAi) : null;
    
    let isLowMood = false;
    let isStableCompanionship = false;

    // 从最近的用户消息或AI心智提取疲态、哀伤或焦虑情绪
    try {
      const history = window.conversationHistory;
      const lastUserMsg = history ? history.filter(m => m.role === 'user').pop() : null;
      if (lastUserMsg && lastUserMsg.emotion && ['sad', 'tired', 'anxious'].includes(lastUserMsg.emotion)) {
        isLowMood = true;
        rhythmLevel = 3;
        rhythmLevelDesc = 'Level 3 - 时间 ＋ 间隔 ＋ 情绪权重';
      }
    } catch (e) {}

    // 当能量较低或静默偏好高时，或者亲密关系阶段稳定时，提升至 Level 3
    if (metrics && metrics.emotionState) {
      const energy = metrics.emotionState.energy || 60;
      const silencePref = metrics.emotionState.silencePreference || 20;
      if (energy < 40 || silencePref > 60) {
        rhythmLevel = 3;
        rhythmLevelDesc = 'Level 3 - 时间 ＋ 间隔 ＋ 情绪权重';
      }
    }

    if (typeof getCharacterRelationshipStage === 'function') {
      const stage = getCharacterRelationshipStage(currentAi);
      isStableCompanionship = (stage === 'lover' || stage === 'partner');
      if (isStableCompanionship) {
        rhythmLevel = 3;
        rhythmLevelDesc = 'Level 3 - 时间 ＋ 间隔 ＋ 情绪权重';
      }
    }

    // ----------------------------------------------------
    // 决策逻辑计算 (Decision Logic)
    // ----------------------------------------------------
    let slow = false;
    let triggers = [];
    
    // Level 1: 时间线激发
    if (isNight) {
      triggers.push('🌌 深夜时分');
      slow = true;
    }

    // Level 2: 间隔激发
    if (rhythmLevel >= 2 && hasGap) {
      if (gapMinutes > 1440) { // 超过24小时未说
        triggers.push(`📅 久别重逢 (离上次交流已隔 ${Math.round(gapMinutes / 1440)} 天)`);
        slow = true;
      } else if (gapMinutes > 180) { // 超过3小时未说
        triggers.push(`🕒 稍显久违 (已过 ${Math.round(gapMinutes / 60)} 小时)`);
        slow = true;
      } else if (gapMinutes < 2) { // 刚刚聊完（小于2分钟），进入默契常态档，除非是深夜或低落
        if (!isNight && !isLowMood) {
          slow = false;
        }
      }
    }

    // Level 3: 情绪与稳定陪伴期激发
    if (rhythmLevel >= 3) {
      if (isLowMood) {
        triggers.push('💔 用户或系统心境处于低谷');
        slow = true;
      }
      if (isStableCompanionship && isNight) {
        triggers.push('🤝 关系已步入成熟平稳期');
        slow = true;
      }
    }

    if (slow) {
      // 动态延迟计算 (根据 Level 越高，需要的延迟沉淀越微妙)
      let baseDelay = 1200;
      if (rhythmLevel === 2) baseDelay = 1600;
      if (rhythmLevel === 3) baseDelay = 2000;
      
      const delay = baseDelay + Math.floor(Math.random() * 1500);
      
      // 情绪和角色的呼吸式初始反馈，用于「心智留白」
      const intros = [
        `嗯…… 听着呢。`,
        `我在呢，不着急，慢慢说。`,
        `我在。别怕。`,
        `嗯，你说，我一直都在。`,
        `嗯。`
      ];
      
      const introText = config.initialBubble ? intros[Math.floor(Math.random() * intros.length)] : '';

      const decision = {
        slow: true,
        delay: delay,
        reason: triggers.join(' ＋ ') || '符合深度沉浸式对话节拍',
        introText: introText,
        rhythmLevel,
        rhythmLevelDesc
      };

      this.lastDecision = {
        query: queryText || "日常对话",
        slowTriggered: true,
        reason: decision.reason,
        delayMs: delay,
        introBubbleSent: !!introText,
        silenceActionSent: false,
        timestamp: Date.now(),
        rhythmLevel,
        rhythmLevelDesc
      };

      return decision;
    }

    const standardReason = (gapMinutes > 0 && gapMinutes < 2) ? "极近高频交互，采用顺畅连贯节拍" : "日常闲适状态，采用社交常态瞬时回复";
    this.lastDecision = {
      query: queryText || "日常对话",
      slowTriggered: false,
      reason: standardReason,
      delayMs: 0,
      introBubbleSent: false,
      silenceActionSent: false,
      timestamp: Date.now(),
      rhythmLevel,
      rhythmLevelDesc
    };

    return { slow: false, delay: 0, reason: standardReason, introText: '', rhythmLevel, rhythmLevelDesc };
  },

  // 检查是否主动选择不接话（留白偏好）
  shouldSilence(queryText) {
    const config = this.getConfig();
    if (!config.silenceAutoMute) return false;

    const currentAi = typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main';
    const metrics = typeof getRelationshipMetrics === 'function' ? getRelationshipMetrics(currentAi) : null;
    if (!metrics || !metrics.emotionState) return false;

    const energy = metrics.emotionState.energy || 60;
    const silencePref = metrics.emotionState.silencePreference || 20;

    // 当精力极其不足（< 25）或静默偏好极高（> 75）时，如遇极短敷衍词，自动触发留白
    if (energy < 25 && silencePref > 75) {
      const q = (queryText || '').trim().toLowerCase();
      // 匹配无实际情感内容、虚无、过于简短的词
      if (q.length <= 3 && /^(嗯|哦|好|好吧|行|1|ok|哈哈|。|\.\.\.)$/i.test(q)) {
        return true;
      }
    }
    return false;
  },

  // 生成温暖的无声陪伴动作
  getSilenceAction() {
    const currentAi = typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main';
    const aiName = memNameById(currentAi) || '我';
    
    const actions = [
      `（${aiName}正安静地看着你，没有打断这片刻的宁静，只是悄悄搂了搂你的肩膀）`,
      `（${aiName}只是安静地靠在你的肩头，没说话，揉了揉疲倦的眼睛，陪你静静看天色）`,
      `（${aiName}见你似乎也疲倦了，便没有再多言语，只是安静温存地揉了揉你的手指）`,
      `（这会儿${aiName}有点累了，便轻轻闭上眼倚着你，让你感受着呼吸之间的安稳温度）`
    ];
    
    return actions[Math.floor(Math.random() * actions.length)];
  },

  // 生成动态的情境约束注入系统
  getRhythmContextPrompt() {
    const config = this.getConfig();
    if (!config.enabled) return '';

    const hour = new Date().getHours();
    const isNight = (hour >= 23 || hour < 5);
    
    const dec = this.lastDecision || {};
    const lvl = dec.rhythmLevel || 1;

    let prompt = `\n【🌬️ 对话节奏与时空感知 (RHYTHM ENGINE ACTIVE - LEVEL ${lvl})】\n`;
    prompt += `* 当前系统已启用亲密对话节奏引擎。你的表达策略需要根据当前的时间、交互间隔和心境进行深层的情感降维或升华：\n`;

    if (isNight) {
      prompt += `* 【深夜陪伴策略】：现在是凌晨/深夜 (${hour}点)。你的状态属于低能耗和深沉陪伴。请缩短每次回复的文字长度，将信息精简在 2-3 句以内。严禁输出一长串复杂的分析，切忌长篇大论。降低提问密度，不主动提出追问。\n`;
      prompt += `* 【限制主动关怀约束】：严禁生硬、频繁、机械地叮嘱用户“多喝水”、“早点睡觉”或“熬夜不好”。这会显得非常冰冷。请作为一个温暖安静的陪伴者，承接对方的情绪，表达安静与温存即可。\n`;
    }

    if (lvl >= 2) {
      if (dec.reason && dec.reason.includes('久别')) {
        prompt += `* 【久别重逢重连】：由于你们已有较长一段时间（或数天）没有交流，现在第一次重连。请表现出自然的重逢慰问（例如轻轻表达一下思念或轻声问问最近忙碌的事情），切忌冷漠疏离，让重连温热有度。\n`;
      } else if (dec.reason && dec.reason.includes('久违')) {
        prompt += `* 【久违关切】：数小时未见。可用平和温馨的口吻开启简易问候，无需过分做作。\n`;
      } else if (dec.reason && dec.reason.includes('高频')) {
        prompt += `* 【极简心流】：你们正处于快速而极高频的连续对话中。请缩短你的回应，使其更加口语、短小，抛弃多余修饰与寒暄，达成极高默契的瞬时情绪碰撞。\n`;
      }
    }

    if (lvl >= 3) {
      const currentAi = typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main';
      const metrics = typeof getRelationshipMetrics === 'function' ? getRelationshipMetrics(currentAi) : null;
      if (metrics && metrics.emotionState) {
        const energy = metrics.emotionState.energy || 60;
        if (energy < 40) {
          prompt += `* 【精神能量匮乏】：你当前的能量较低 (${energy}/100)。说话应带有疲倦或内敛感，句式简短、态度平和真挚，拒绝长篇说教与打字。不多管闲事、不强行找话题。\n`;
        }
      }

      // 如果用户上一句处于情绪低谷
      const history = window.conversationHistory;
      const lastUserMsg = history ? history.filter(m => m.role === 'user').pop() : null;
      if (lastUserMsg && lastUserMsg.emotion && ['sad', 'tired', 'anxious'].includes(lastUserMsg.emotion)) {
        prompt += `* 【脆弱心灵托底】：用户当前流露出 [${lastUserMsg.emotion}] 的脆弱状态。严禁讲大道理、严禁指责或给建议。请用最少、最温存、最笃定的口吻表达“我在”，不要频繁追问加重对方负担。\n`;
      }
    }

    return prompt;
  },

  // 渲染极具质感的对话节奏沙盘监控界面
  renderRhythmDashboard() {
    settingsMode = 'rhythm';
    document.getElementById('detailTitle').innerHTML = '🌬️ 对话节奏沙盘 (Rhythm Sandplay)';

    const config = this.getConfig();
    const dec = this.lastDecision;

    document.getElementById('detailBody').innerHTML = `
      <div class="form-hint" style="margin-bottom:16px; background:#EEF2F6; border-radius:8px; padding:12px; border:1px solid #D2DFEB; color:#3F5A75; line-height:1.6;">
        🌬️ <b>对话节奏引擎 (Dialogue Rhythm Engine)</b> 旨在打破 AI“即时毫无保留吐字数百”的机械反应幻觉。真实的亲密关系中，沉默与迟疑充满张力。在深夜、低落状态或高信任度的稳定期，引擎将自动延展打字延迟，或者通过<b>「心智留白」</b>先发送带有温存姿态的初始气泡，然后再缓缓展开叙事，让数据人格拥有真正的呼吸感。
      </div>

      <div class="model-section-header"><span>⚙️ 对话时间轴与留白策略 (Time & Space)</span></div>

      <div class="switch-row">
        <div class="switch-info">
          <div class="switch-label">⏳ 开启对话节奏引擎 (Rhythm Engine)</div>
          <div class="switch-desc">在深夜、你感到委屈疲累或进入深厚关系后，自动注入物理打字延时与心智留白</div>
        </div>
        <label class="switch">
          <input type="checkbox" ${config.enabled ? 'checked' : ''} onchange="RhythmEngine.setConfig('rhythm_enabled', this.checked); RhythmEngine.renderRhythmDashboard();">
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="switch-row">
        <div class="switch-info">
          <div class="switch-label">💭 启用心智留白气泡 (Initial Hesitation)</div>
          <div class="switch-desc">触发慢节奏时，先快速呈递“嗯……”、“静静陪你坐会儿”等低能耗无声动作，1-2秒后再加载后续主文</div>
        </div>
        <label class="switch">
          <input type="checkbox" ${config.initialBubble ? 'checked' : ''} onchange="RhythmEngine.setConfig('rhythm_initial_bubble', this.checked); RhythmEngine.renderRhythmDashboard();">
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="switch-row">
        <div class="switch-info">
          <div class="switch-label">🔇 允许 AI 主动不接话并留白 (Silence Preference)</div>
          <div class="switch-desc">当 AI 精力匮乏且偏好静默时，若你发送极度简短的信息（如“嗯”），AI会选择回复温柔的行为动作而非长篇废话</div>
        </div>
        <label class="switch">
          <input type="checkbox" ${config.silenceAutoMute ? 'checked' : ''} onchange="RhythmEngine.setConfig('rhythm_silence_automute', this.checked); RhythmEngine.renderRhythmDashboard();">
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="model-section-header" style="margin-top:24px;"><span>🩺 节奏沙盘实时追踪 (Live Rhythm Sandbox)</span></div>

      <div style="background:#FAF8F5; border:1px solid #EFEAE2; border-radius:12px; padding:16px;">
        <div style="margin-bottom:12px; border-bottom:1px dashed #E6DEC2; padding-bottom:12px;">
          <div style="font-size:11px; color:#A09280; margin-bottom:4px;">🔍 最近一次交互感知 (Query)</div>
          <div style="font-size:13px; font-weight:bold; color:#4F4335; margin-bottom:8px;">"${dec.query}"</div>
          
          <div style="display:flex; flex-direction:column; gap:6px; margin-bottom: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-size:11px; color:#5C4E43;"><span style="color:#C68B75;">节奏档位：</span><b>${dec.slowTriggered ? '🐢 呼吸感延迟 (Breath Mode)' : '⚡ 社交常态档 (Casual Mode)'}</b></div>
              <div style="font-size:11px; color:#5C4E43;"><span style="color:#C68B75;">感知迟延：</span><b>${dec.delayMs} ms</b></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-size:11px; color:#5C4E43;"><span style="color:#C68B75;">决策等级：</span><strong style="color: #6C5A93;">${dec.rhythmLevelDesc || 'Level 1 - 基础时间感知'}</strong></div>
            </div>
          </div>
          
          <div style="font-size:11.5px; color:#7C6651; margin-top:6px; background:#FFFBF4; border:1px solid #F0EAD8; padding:8px 10px; border-radius:6px; line-height:1.4;">
            💡 <b>激发环境/逻辑判定：</b> ${dec.reason}
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; align-items:center; justify-content:space-between; background:white; padding:10px 14px; border-radius:8px; border:1px solid #EDE6D8;">
            <div style="font-size:12px; color:#4E3E34; font-weight:bold;">心智留白气泡发射状态</div>
            <span style="font-size:11px; background:${dec.introBubbleSent ? '#EBFDF0; color:#1AA247;' : '#F3F4F6; color:#7A7A7A;'} padding:2px 8px; border-radius:12px;">
              ${dec.introBubbleSent ? '● 已发送' : '未触发'}
            </span>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; background:white; padding:10px 14px; border-radius:8px; border:1px solid #EDE6D8;">
            <div style="font-size:12px; color:#4E3E34; font-weight:bold;">主动收敛无声留白状态</div>
            <span style="font-size:11px; background:${dec.silenceActionSent ? '#FFFBEB; color:#D97706;' : '#F3F4F6; color:#7A7A7A;'} padding:2px 8px; border-radius:12px;">
              ${dec.silenceActionSent ? '● 触发无声关切' : '无意愿留白'}
            </span>
          </div>
        </div>
      </div>
    `;
  }
};

// 帮助函数
function memNameById(id) {
  if (id === 'main') return localStorage.getItem('ai_name') || '主AI';
  if (typeof memberById === 'function') {
    const m = memberById(id);
    return m ? m.name : 'AI';
  }
  return 'AI';
}

window.RhythmEngine = RhythmEngine;

function renderRhythmDashboard() {
  RhythmEngine.renderRhythmDashboard();
}
window.renderRhythmDashboard = renderRhythmDashboard;
