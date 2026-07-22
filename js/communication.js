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
