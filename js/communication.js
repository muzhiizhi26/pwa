/* ===== 💬 交流风格自动学习 (Communication Profile) & 多角色认知边界 (Character Cognitive Boundary) ===== */

function getCommunicationProfile() {
  try {
    const raw = localStorage.getItem('communicationProfile');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.replyLength) return parsed;
    }
  } catch (e) {}

  const defaultProfile = {
    replyLength: "medium",
    emoji: "medium",
    humor: "medium",
    explanationDepth: "medium",
    adviceMode: "ask_first",
    tone: "warm",
    replyLengthScore: 0.50,
    emojiScore: 0.50,
    humorScore: 0.50,
    explanationDepthScore: 0.50,
    toneScore: 0.50,
    lastUpdated: new Date().toISOString()
  };
  saveCommunicationProfile(defaultProfile);
  return defaultProfile;
}

function saveCommunicationProfile(profile) {
  try {
    profile.lastUpdated = new Date().toISOString();
    localStorage.setItem('communicationProfile', JSON.stringify(profile));
  } catch (e) {}
}

/**
 * 根据用户发送的消息行为信号进行风格权重调整
 */
function updateCommunicationProfile(signals) {
  if (!signals || !signals.text) return;
  const text = signals.text.trim();
  if (!text) return;

  const profile = getCommunicationProfile();

  let rlScore = profile.replyLengthScore != null ? profile.replyLengthScore : 0.50;
  let emScore = profile.emojiScore != null ? profile.emojiScore : 0.50;
  let huScore = profile.humorScore != null ? profile.humorScore : 0.50;
  let edScore = profile.explanationDepthScore != null ? profile.explanationDepthScore : 0.50;
  let tnScore = profile.toneScore != null ? profile.toneScore : 0.50;

  // 1. 回复长度 (replyLength)
  const userAskedForMore = /继续|详细说|多说说|展开讲讲|再说说|多讲讲|详细解释|详细分析/i.test(text);
  const userAskedShort = /简短|长话短说|一句话|别太长|太长了/i.test(text);
  if (userAskedForMore) rlScore += 0.05;
  if (userAskedShort) rlScore -= 0.05;
  if (signals.userSkippedLongReply) rlScore -= 0.05;
  if (text.length > 80) rlScore += 0.02;

  // 2. Emoji 使用率 (emoji)
  const emojiMatches = text.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
  const emojiCount = emojiMatches.length;
  if (emojiCount >= 2) emScore += 0.05;
  else if (emojiCount === 1) emScore += 0.02;
  else if (text.length > 15) emScore -= 0.01;

  // 3. 幽默度 (humor)
  const userLaughed = /😂|🤣|😅|😆|哈哈哈|哈哈|噗|笑死|太逗/i.test(text);
  if (userLaughed) huScore += 0.05;

  // 4. 解释深度 (explanationDepth)
  const userAskedWhy = /为什么|啥意思|什么意思|怎么解释|分析一下|深度|原理/i.test(text);
  const userAskedStop = /知道了|不用解释|懂了|明白|直接说结论|说重点/i.test(text);
  if (userAskedWhy) edScore += 0.05;
  if (userAskedStop) edScore -= 0.05;

  // 5. 语气称呼 (tone)
  const userUsedNickname = /宝贝|亲爱的|笨蛋|老公|老婆|达令|小家伙|小可爱|猪猪|宝儿/i.test(text);
  if (userUsedNickname) tnScore += 0.05;

  // Clamp limits (10% to 90%)
  const clamp = (val) => Math.min(0.90, Math.max(0.10, Math.round(val * 100) / 100));
  profile.replyLengthScore = clamp(rlScore);
  profile.emojiScore = clamp(emScore);
  profile.humorScore = clamp(huScore);
  profile.explanationDepthScore = clamp(edScore);
  profile.toneScore = clamp(tnScore);

  // Categorical mappings
  profile.replyLength = profile.replyLengthScore < 0.38 ? "short" : (profile.replyLengthScore > 0.62 ? "long" : "medium");
  profile.emoji = profile.emojiScore < 0.38 ? "low" : (profile.emojiScore > 0.62 ? "high" : "medium");
  profile.humor = profile.humorScore < 0.38 ? "low" : (profile.humorScore > 0.62 ? "high" : "medium");
  profile.explanationDepth = profile.explanationDepthScore < 0.38 ? "shallow" : (profile.explanationDepthScore > 0.62 ? "deep" : "medium");
  profile.tone = profile.toneScore > 0.55 ? "intimate" : "warm";

  saveCommunicationProfile(profile);
}

/**
 * 在 composeSystemPrompt 中调用的动态风格注入指令
 */
function injectCommunicationStyle() {
  const profile = getCommunicationProfile();
  if (!profile || !profile.replyLength) return '';

  const styleMap = {
    replyLength: {
      short: '回复尽量简短凝练，不要展开过多篇幅。',
      medium: '',
      long: '可以适当展开分析与贴心抚慰，提供丰富细节。'
    },
    emoji: {
      low: '尽量少用 emoji。',
      medium: '',
      high: '可以适当使用 emoji 来生动表达情绪。'
    },
    humor: {
      low: '保持认真、温存的语气。',
      medium: '',
      high: '可以适当幽默、开玩笑或俏皮打趣。'
    },
    explanationDepth: {
      shallow: '不需要深入解释复杂背景，点到为止。',
      medium: '',
      deep: '可以深入剖析原因和背后逻辑。'
    },
    tone: {
      warm: '语气温暖友好。',
      intimate: '可以适当使用亲昵称呼，语气更亲密依恋。'
    }
  };

  const parts = [];
  for (const [key, value] of Object.entries(profile)) {
    if (styleMap[key] && styleMap[key][value]) {
      parts.push(styleMap[key][value]);
    }
  }

  return parts.length > 0 ? '【用户个性化交流风格适配】' + parts.join(' ') : '';
}

/* ===== 🎭 多角色认知边界 (Character Cognitive Boundary) ===== */

function getCharacterMemoryMatrix() {
  try {
    const raw = localStorage.getItem('characterMemoryMatrix');
    if (raw) return JSON.parse(raw);
  } catch (e) {}

  const defaultMatrix = {
    "main": { id: "main", name: "主AI", memoryScope: "all", sharedMemoryKeys: ["preferences", "topics", "facts"], isMain: true },
    "group_ai_default": { id: "group_ai_default", name: "群聊AI", memoryScope: "public_only", sharedMemoryKeys: [], isMain: false }
  };
  saveCharacterMemoryMatrix(defaultMatrix);
  return defaultMatrix;
}

function saveCharacterMemoryMatrix(matrix) {
  try {
    localStorage.setItem('characterMemoryMatrix', JSON.stringify(matrix));
  } catch (e) {}
}

function getCharacterMemoryScope(characterId) {
  if (!characterId || characterId === 'main') return { scope: 'all', sharedKeys: [] };
  const matrix = getCharacterMemoryMatrix();
  if (matrix[characterId]) {
    return {
      scope: matrix[characterId].memoryScope || 'public_only',
      sharedKeys: matrix[characterId].sharedMemoryKeys || ['preferences', 'topics', 'facts']
    };
  }
  if (typeof getGroupMembers === 'function') {
    const members = getGroupMembers();
    const mem = members.find(m => m.id === characterId);
    if (mem) {
      if (mem.isMain) return { scope: 'all', sharedKeys: [] };
      return {
        scope: mem.memoryScope || 'shared',
        sharedKeys: mem.sharedMemoryKeys || ['preferences', 'topics', 'facts']
      };
    }
  }
  return { scope: 'public_only', sharedKeys: [] };
}

window.getCommunicationProfile = getCommunicationProfile;
window.updateCommunicationProfile = updateCommunicationProfile;
window.injectCommunicationStyle = injectCommunicationStyle;
window.getCharacterMemoryMatrix = getCharacterMemoryMatrix;
window.saveCharacterMemoryMatrix = saveCharacterMemoryMatrix;
window.getCharacterMemoryScope = getCharacterMemoryScope;

/* ===== 🧠 用户认知画像 (User Cognitive Profile) ===== */

function getUserCognitiveProfile() {
  try {
    const raw = localStorage.getItem('userCognitiveProfile');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.decisionStyle) return parsed;
    }
  } catch (e) {}

  const defaultProfile = {
    decisionStyle: "mixed",      // analytical | intuitive | mixed
    stressResponse: "mixed",     // sharing | solo | mixed
    learningPreference: "mixed", // principle_first | practice_first | mixed
    socialTendency: "mixed",     // outgoing | private | mixed
    analyticalCount: 0,
    intuitiveCount: 0,
    sharingCount: 0,
    soloCount: 0,
    principleCount: 0,
    practiceCount: 0,
    outgoingCount: 0,
    privateCount: 0,
    signalCount: 0,
    confidence: 0.30,
    lastUpdated: new Date().toISOString()
  };
  saveUserCognitiveProfile(defaultProfile);
  return defaultProfile;
}

function saveUserCognitiveProfile(profile) {
  try {
    profile.lastUpdated = new Date().toISOString();
    localStorage.setItem('userCognitiveProfile', JSON.stringify(profile));
  } catch (e) {}
}

function resetUserCognitiveProfile() {
  localStorage.removeItem('userCognitiveProfile');
  getUserCognitiveProfile();
}

function updateCognitiveProfile(signals) {
  if (!signals || !signals.text) return;
  const text = signals.text.trim();
  if (!text || text.length < 3) return;

  const profile = getUserCognitiveProfile();

  let detected = false;

  // 1. 决策风格 (decisionStyle)
  if (/分析|利弊|数据|逻辑|理由|依据|对比|指标|评估|权衡/i.test(text)) {
    profile.analyticalCount = (profile.analyticalCount || 0) + 1;
    detected = true;
  }
  if (/感觉|直觉|随便|凭感觉|随缘|无所谓|看心情|第六感/i.test(text)) {
    profile.intuitiveCount = (profile.intuitiveCount || 0) + 1;
    detected = true;
  }

  // 2. 压力反应 (stressResponse)
  if (/陪我聊聊|难过|想找人说话|好累|想哭|委屈|求安慰|倾诉|心里堵/i.test(text)) {
    profile.sharingCount = (profile.sharingCount || 0) + 1;
    detected = true;
  }
  if (/我想静静|让我自己待会|别烦我|不想说话|独处|安静一会儿|过会再说/i.test(text)) {
    profile.soloCount = (profile.soloCount || 0) + 1;
    detected = true;
  }

  // 3. 学习偏好 (learningPreference)
  if (/为什么|原理|背景|底层逻辑|怎么来的|原因/i.test(text)) {
    profile.principleCount = (profile.principleCount || 0) + 1;
    detected = true;
  }
  if (/怎么做|步骤|操作|简单方法|实操|直接给方案|手把手/i.test(text)) {
    profile.practiceCount = (profile.practiceCount || 0) + 1;
    detected = true;
  }

  // 4. 社交倾向 (socialTendency)
  if (/朋友|聚会|出去玩|活动|趴体|同学|同事|旅游|打卡/i.test(text)) {
    profile.outgoingCount = (profile.outgoingCount || 0) + 1;
    detected = true;
  }
  if (/宅|自己一个|不爱出门|个人社恐|隐秘|不爱社交/i.test(text)) {
    profile.privateCount = (profile.privateCount || 0) + 1;
    detected = true;
  }

  if (detected) {
    profile.signalCount = (profile.signalCount || 0) + 1;
    profile.confidence = Math.min(0.95, Math.round((0.30 + profile.signalCount * 0.015) * 100) / 100);

    // Compute categories if counts exceed threshold
    if ((profile.analyticalCount || 0) + (profile.intuitiveCount || 0) >= 3) {
      profile.decisionStyle = profile.analyticalCount > profile.intuitiveCount ? "analytical" : "intuitive";
    }
    if ((profile.sharingCount || 0) + (profile.soloCount || 0) >= 3) {
      profile.stressResponse = profile.sharingCount > profile.soloCount ? "sharing" : "solo";
    }
    if ((profile.principleCount || 0) + (profile.practiceCount || 0) >= 3) {
      profile.learningPreference = profile.principleCount > profile.practiceCount ? "principle_first" : "practice_first";
    }
    if ((profile.outgoingCount || 0) + (profile.privateCount || 0) >= 3) {
      profile.socialTendency = profile.outgoingCount > profile.privateCount ? "outgoing" : "private";
    }

    saveUserCognitiveProfile(profile);
  }
}

function injectCognitiveProfile() {
  const profile = getUserCognitiveProfile();
  if (!profile || profile.confidence < 0.50) return '';

  const map = {
    decisionStyle: {
      analytical: '用户在决策时偏理性分析，请提供逻辑清晰、有依据的深度建议。',
      intuitive: '用户更倾向凭直觉决策，请提供感性层面的共鸣和贴心支持。'
    },
    stressResponse: {
      sharing: '用户在压力下愿意倾诉，请多倾听、共情，不要急于给机械解决方案。',
      solo: '用户在压力下倾向独处，请给予适度空间，简短温暖陪伴即可，不要过度追问。'
    },
    learningPreference: {
      principle_first: '用户喜欢先理解原理，请先解释背景和原因再给具体步骤。',
      practice_first: '用户喜欢直接上手实践，请给简洁的操作指南，减少冗长理论铺垫。'
    },
    socialTendency: {
      outgoing: '用户性格向外分享，可适当顺应扩展丰富的人际社交与活动话题。',
      private: '用户偏向内敛私密，请尊重边界，保持适度专注的亲密感，不过多探寻无关私人圈子。'
    }
  };

  const parts = [];
  for (const [key, value] of Object.entries(profile)) {
    if (map[key] && map[key][value]) {
      parts.push(map[key][value]);
    }
  }

  return parts.length > 0 ? '【用户认知特征画像】' + parts.join(' ') : '';
}

/* ===== 🌟 经历推荐引擎 (Experience Recommendation Engine) ===== */

function getExperienceRecommendations(currentEmotion, currentTopics, maxCount = 3) {
  let timeline = [];
  if (typeof getLifeEventTimeline === 'function') {
    timeline = getLifeEventTimeline();
  } else {
    try {
      timeline = JSON.parse(localStorage.getItem('life_event_timeline') || '[]');
    } catch (e) {}
  }

  if (!Array.isArray(timeline) || timeline.length === 0) return [];

  const now = Date.now();
  const topicsStr = Array.isArray(currentTopics) ? currentTopics.join(' ') : (currentTopics || '');

  const scored = timeline.map(m => {
    let score = 0;
    const cat = m.category || '';
    const title = (m.title || '').toLowerCase();
    const desc = (m.desc || '').toLowerCase();

    // 1. 情绪匹配
    if (currentEmotion === 'sad' || currentEmotion === 'anxious' || currentEmotion === 'lonely') {
      if (cat === 'life' || cat === 'emotion' || cat === 'relationship' || title.includes('克服') || title.includes('建立')) score += 25;
    } else if (currentEmotion === 'happy' || currentEmotion === 'excited') {
      if (cat === 'milestone' || cat === 'shared_event' || cat === 'achievement' || title.includes('第一次') || title.includes('庆祝')) score += 20;
    }

    // 2. 话题关联
    if (topicsStr) {
      const topicArr = topicsStr.split(/[\s,，、]+/);
      topicArr.forEach(t => {
        if (t.length >= 2 && (title.includes(t.toLowerCase()) || desc.includes(t.toLowerCase()))) {
          score += 30;
        }
      });
    }

    // 3. 时间新鲜度 (避免过于频繁重复近7天的，对30天以上的经典记忆赋予怀旧分)
    const ageDays = (now - (m.timestamp || now)) / (24 * 3600 * 1000);
    if (ageDays > 7 && ageDays < 180) score += 10;

    return { ...m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCount);
}

function injectExperienceRecommendation(currentEmotion, currentTopics) {
  const recs = getExperienceRecommendations(currentEmotion, currentTopics, 2);
  if (!recs || recs.length === 0) return '';

  const recLines = recs.map(r => `· ${r.dateStr || '过往岁月'}: ${r.title} (${r.desc.slice(0, 40)}...)`).join('\n');
  return `【可引用的共同经历参考】\n在适当且自然的时机，你可以自然提及以下某条你们共同经历的回忆作为温暖呼应：\n${recLines}`;
}

window.getUserCognitiveProfile = getUserCognitiveProfile;
window.saveUserCognitiveProfile = saveUserCognitiveProfile;
window.resetUserCognitiveProfile = resetUserCognitiveProfile;
window.updateCognitiveProfile = updateCognitiveProfile;
window.injectCognitiveProfile = injectCognitiveProfile;
window.getExperienceRecommendations = getExperienceRecommendations;
window.injectExperienceRecommendation = injectExperienceRecommendation;

