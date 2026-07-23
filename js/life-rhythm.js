/* ===== ⏰ 用户生活节奏模型 (User Life Rhythm Profile) & 经历情绪图谱 (Experience Emotion Graph) ===== */

function getLifeRhythmProfile() {
  try {
    const raw = localStorage.getItem('lifeRhythmProfile');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.activeHours)) return parsed;
    }
  } catch (e) {}

  const defaultProfile = {
    activeHours: [],      // e.g. ["08:00-10:00", "21:00-23:00"]
    deepTalkHours: [],    // e.g. ["22:00-00:00"]
    restHours: [],        // e.g. ["00:00-07:00"]
    stressCycle: "unknown", // weekday_stress | weekend_stress | evenly | unknown
    chatPattern: "unknown", // regular | burst | scattered | unknown
    confidence: 0.0,
    lastUpdated: null
  };
  saveLifeRhythmProfile(defaultProfile);
  return defaultProfile;
}

function saveLifeRhythmProfile(profile) {
  try {
    profile.lastUpdated = new Date().toISOString();
    localStorage.setItem('lifeRhythmProfile', JSON.stringify(profile));
  } catch (e) {}
}

function resetLifeRhythmProfile() {
  localStorage.removeItem('lifeRhythmProfile');
  localStorage.removeItem('lifeRhythmHistory');
  getLifeRhythmProfile();
}

/**
 * 实时记录聊天行为的时间与情绪信号
 */
function recordLifeRhythmSignal(text, emotion) {
  if (!text) return;
  try {
    const now = Date.now();
    const d = new Date(now);
    const hour = d.getHours();
    const day = d.getDay(); // 0-6
    const isWeekend = (day === 0 || day === 6);

    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('lifeRhythmHistory') || '[]');
    } catch (e) {}

    const lastSignal = history.length > 0 ? history[history.length - 1] : null;
    const gapMin = lastSignal ? Math.round((now - lastSignal.timestamp) / 60000) : 0;

    history.push({
      timestamp: now,
      hour,
      isWeekend,
      length: text.length,
      emotion: emotion || 'neutral',
      gapMin
    });

    // 自动按60天清理（上限 1500 条）
    if (history.length > 1500) {
      history = history.slice(history.length - 1200);
    }
    localStorage.setItem('lifeRhythmHistory', JSON.stringify(history));

    // 积累超过一定量，自动轻量分析
    if (history.length % 15 === 0) {
      analyzeLifeRhythm(false);
    }
  } catch (e) {
    console.error('recordLifeRhythmSignal error:', e);
  }
}

/**
 * 分析生活节奏模型
 */
function analyzeLifeRhythm(force = false) {
  try {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('lifeRhythmHistory') || '[]');
    } catch (e) {}

    const profile = getLifeRhythmProfile();
    if (history.length < 5 && !force) return profile;

    // 1. 活跃时段统计
    const hourCounts = new Array(24).fill(0);
    const deepTalkCounts = new Array(24).fill(0);
    let weekdayNeg = 0;
    let weekendNeg = 0;

    history.forEach(item => {
      if (item.hour >= 0 && item.hour < 24) {
        hourCounts[item.hour]++;
        if (item.length > 120 || ['sad', 'anxious', 'lonely', 'deep'].includes(item.emotion)) {
          deepTalkCounts[item.hour]++;
        }
      }
      if (['sad', 'anxious', 'angry'].includes(item.emotion)) {
        if (item.isWeekend) weekendNeg++;
        else weekdayNeg++;
      }
    });

    // 计算活跃时段 ( Top 2-3 )
    const activeHours = [];
    const threshold = Math.max(2, Math.floor(history.length / 24));
    for (let h = 0; h < 24; h += 2) {
      const sum = hourCounts[h] + hourCounts[(h + 1) % 24];
      if (sum >= threshold) {
        activeHours.push(`${String(h).padStart(2,'0')}:00-${String((h+2)%24).padStart(2,'0')}:00`);
      }
    }

    // 计算深入交流时段
    const deepTalkHours = [];
    for (let h = 0; h < 24; h += 2) {
      const sum = deepTalkCounts[h] + deepTalkCounts[(h + 1) % 24];
      if (sum >= 2) {
        deepTalkHours.push(`${String(h).padStart(2,'0')}:00-${String((h+2)%24).padStart(2,'0')}:00`);
      }
    }

    // 计算休息时段（连续几乎无采样的段，默认 00:00-07:00）
    const restHours = ["00:00-07:00"];

    // 压力周期
    let stressCycle = "evenly";
    if (weekdayNeg > weekendNeg * 1.8 && weekdayNeg >= 3) {
      stressCycle = "weekday_stress";
    } else if (weekendNeg > weekdayNeg * 1.8 && weekendNeg >= 3) {
      stressCycle = "weekend_stress";
    }

    // 聊天模式
    let chatPattern = "regular";
    const longGaps = history.filter(item => item.gapMin > 1440).length; // 超过24小时未聊
    if (longGaps >= 3) {
      chatPattern = "burst";
    } else if (activeHours.length > 4) {
      chatPattern = "scattered";
    }

    // 计算置信度
    const daysOfData = history.length > 0 ? Math.round((Date.now() - history[0].timestamp) / (24 * 3600 * 1000)) : 0;
    let confidence = 0.3;
    if (daysOfData >= 14 || history.length >= 50) confidence = 0.6;
    if (daysOfData >= 30 || history.length >= 120) confidence = 0.85;
    if (daysOfData >= 60) confidence = 0.95;

    profile.activeHours = activeHours.length > 0 ? activeHours : ["08:00-10:00", "21:00-23:00"];
    profile.deepTalkHours = deepTalkHours.length > 0 ? deepTalkHours : ["22:00-00:00"];
    profile.restHours = restHours;
    profile.stressCycle = stressCycle;
    profile.chatPattern = chatPattern;
    profile.confidence = confidence;

    saveLifeRhythmProfile(profile);
    return profile;
  } catch (e) {
    console.error('analyzeLifeRhythm error:', e);
    return getLifeRhythmProfile();
  }
}

/**
 * 动态注入用户生活节奏上下文
 */
function injectLifeRhythmContext() {
  const profile = getLifeRhythmProfile();
  if (!profile || profile.confidence < 0.5) return '';

  const hour = new Date().getHours();
  const day = new Date().getDay();
  const parts = [];

  const checkHourInRange = (rangeList) => {
    if (!Array.isArray(rangeList)) return false;
    return rangeList.some(r => {
      const match = r.match(/(\d+):00-(\d+):00/);
      if (match) {
        const start = parseInt(match[1]);
        let end = parseInt(match[2]);
        if (end === 0) end = 24;
        return hour >= start && hour < end;
      }
      return false;
    });
  };

  const isDeepTalk = checkHourInRange(profile.deepTalkHours);
  const isRest = checkHourInRange(profile.restHours);
  const isActive = checkHourInRange(profile.activeHours);

  if (isDeepTalk) {
    parts.push('当前属于用户最容易掏心掏肺交流的时段，可以更温暖自然地展开深度回应。');
  } else if (isRest) {
    parts.push('当前属于用户常规休息时段，请回复简短贴心，避免开启沉重复杂的思考话题。');
  } else if (isActive) {
    parts.push('当前属于用户常规活跃时段，可顺应当前节奏自然交流。');
  }

  if (profile.stressCycle === 'weekday_stress' && [1, 2, 3, 4, 5].includes(day)) {
    parts.push('工作日阶段用户生活/工作压力通常较集中，请格外给予情绪抚慰与情绪价值。');
  }

  if (profile.chatPattern === 'burst') {
    parts.push('用户习惯爆发式交流（长时间沉寂后集中倾诉），无需在其安静时过于频繁惊扰。');
  }

  return parts.length > 0 ? '【用户生活节奏契合】' + parts.join(' ') : '';
}

/* ===== 🌸 经历情绪图谱 (Experience Emotion Graph) ===== */

/**
 * 强化经历项的情绪标签与关系价值
 */
function enrichExperienceWithEmotion(experienceId, currentEmotion) {
  if (!experienceId) return;
  let timeline = [];
  try {
    timeline = JSON.parse(localStorage.getItem('life_event_timeline') || '[]');
  } catch (e) {}

  const item = timeline.find(m => m.id === experienceId);
  if (!item) return;

  if (!Array.isArray(item.emotionTags)) item.emotionTags = [];
  const emoMap = {
    sad: '感动',
    happy: '开心',
    anxious: '温暖',
    lonely: '陪伴',
    excited: '振奋'
  };

  const tagToAdd = emoMap[currentEmotion] || '温暖';
  if (!item.emotionTags.includes(tagToAdd)) {
    item.emotionTags.push(tagToAdd);
  }

  item.relationshipValue = Math.min(100, (item.relationshipValue || 40) + 5);
  item.lastRecalledAt = new Date().toISOString();

  localStorage.setItem('life_event_timeline', JSON.stringify(timeline));
}

// 自动在 30 秒后进行一次静默节奏检查
setTimeout(() => {
  if (typeof analyzeLifeRhythm === 'function') {
    analyzeLifeRhythm(false);
  }
}, 30000);

window.getLifeRhythmProfile = getLifeRhythmProfile;
window.saveLifeRhythmProfile = saveLifeRhythmProfile;
window.resetLifeRhythmProfile = resetLifeRhythmProfile;
window.recordLifeRhythmSignal = recordLifeRhythmSignal;
window.analyzeLifeRhythm = analyzeLifeRhythm;
window.injectLifeRhythmContext = injectLifeRhythmContext;
window.enrichExperienceWithEmotion = enrichExperienceWithEmotion;
