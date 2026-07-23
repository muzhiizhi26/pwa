/* ===== 💖 陪伴策略学习 (Care Strategy Learning) ===== */

function getDefaultCareStrategyWeights() {
  return {
    emotional_support: {
      quiet_presence: { attempts: 2, positive: 1, negative: 0, score: 0.50 },
      active_listening: { attempts: 2, positive: 1, negative: 0, score: 0.50 },
      gentle_encouragement: { attempts: 2, positive: 1, negative: 0, score: 0.50 },
      distraction: { attempts: 2, positive: 1, negative: 0, score: 0.50 }
    },
    decision_support: {
      structured_analysis: { attempts: 2, positive: 1, negative: 0, score: 0.50 },
      intuitive_guidance: { attempts: 2, positive: 1, negative: 0, score: 0.50 },
      empowerment: { attempts: 2, positive: 1, negative: 0, score: 0.50 }
    },
    anxiety_soothing: {
      reassurance: { attempts: 2, positive: 1, negative: 0, score: 0.50 },
      grounding: { attempts: 2, positive: 1, negative: 0, score: 0.50 },
      future_reframing: { attempts: 2, positive: 1, negative: 0, score: 0.50 }
    },
    celebration: {
      shared_excitement: { attempts: 2, positive: 1, negative: 0, score: 0.50 },
      quiet_appreciation: { attempts: 2, positive: 1, negative: 0, score: 0.50 }
    },
    exploration: {
      depth_expansion: { attempts: 2, positive: 1, negative: 0, score: 0.50 },
      breadth_expansion: { attempts: 2, positive: 1, negative: 0, score: 0.50 }
    }
  };
}

function getCareStrategyWeights() {
  try {
    const raw = localStorage.getItem('careStrategyWeights');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.scenarios) return parsed.scenarios;
    }
  } catch (e) {}

  const defaults = getDefaultCareStrategyWeights();
  saveCareStrategyWeights(defaults);
  return defaults;
}

function saveCareStrategyWeights(scenarios) {
  try {
    localStorage.setItem('careStrategyWeights', JSON.stringify({
      scenarios,
      updatedAt: new Date().toISOString()
    }));
  } catch (e) {}
}

function resetCareStrategyWeights() {
  const defaults = getDefaultCareStrategyWeights();
  saveCareStrategyWeights(defaults);
  localStorage.removeItem('lastCareStrategy');
  if (typeof showToast === 'function') showToast('✅ 已重置陪伴策略学习数据');
}

/**
 * 策略选择函数：基于历史得分优选 Top 策略
 */
function selectCareStrategy(sceneType, userEmotion) {
  const scenarios = getCareStrategyWeights();
  const sceneStrategies = scenarios[sceneType];
  if (!sceneStrategies) return 'default';

  const keys = Object.keys(sceneStrategies);
  if (keys.length === 0) return 'default';

  // 针对每个策略更新 score 确保准确
  keys.forEach(k => {
    const item = sceneStrategies[k];
    item.score = (item.positive + 1) / (item.attempts + 2);
  });

  // 按 score 降序
  const sorted = keys.sort((a, b) => sceneStrategies[b].score - sceneStrategies[a].score);
  
  let selected = sorted[0];

  // 增加平滑探索逻辑：若 Top 1 与 Top 2 分数接近 (< 0.1) 且尝试次数尚少，随机选其一
  if (sorted.length >= 2) {
    const top1 = sceneStrategies[sorted[0]];
    const top2 = sceneStrategies[sorted[1]];
    if (Math.abs(top1.score - top2.score) < 0.10 && (top1.attempts < 5 || top2.attempts < 5)) {
      if (Math.random() < 0.5) selected = sorted[1];
    }
  }

  // 记录最后一次选择的策略
  try {
    localStorage.setItem('lastCareStrategy', JSON.stringify({
      sceneType,
      strategy: selected,
      timestamp: Date.now()
    }));
  } catch (e) {}

  return selected;
}

/**
 * 将选中策略转化为系统提示词指令
 */
function injectCareStrategy(sceneType, strategy) {
  const strategyMap = {
    emotional_support: {
      quiet_presence: '陪伴策略：【安静陪伴】不要急于大量安慰或给建议，用简短温暖的回应表达你在身边即可，给用户充分释放空间。',
      active_listening: '陪伴策略：【倾听共情】认真倾听并复述确认用户感受，先给予情感认同与支持，再适度延伸。',
      gentle_encouragement: '陪伴策略：【温和鼓励】在充分理解共情的基础上，适度给予正面温暖的引导与信念力量。',
      distraction: '陪伴策略：【轻松转移】用轻松治愈的小话题或适度幽默，帮助用户暂时从沉重情绪中抽离。'
    },
    decision_support: {
      structured_analysis: '建议策略：【结构化分析】提供清晰的利弊分析与逻辑条理，帮助用户理清思路与关键因素。',
      intuitive_guidance: '建议策略：【直觉引导】引导用户倾听内心真实感受与直觉，避免过度陷入外部复杂细节。',
      empowerment: '建议策略：【赋能决定】表达对用户判断力的绝对信任，给予信心，引导用户自主做决定。'
    },
    anxiety_soothing: {
      reassurance: '安抚策略：【确认安全】首先帮用户确认当前环境与状态是安全的，接纳其焦虑，给予踏实陪伴。',
      grounding: '安抚策略：【落地实践】引导用户关注当下的具体感受与具体小事，从抽象的担忧回归具象。',
      future_reframing: '安抚策略：【积极重构】帮助用户从长远视角看待问题，看到未曾关注到的积极转向可能性。'
    },
    celebration: {
      shared_excitement: '庆祝策略：【共同欢庆】表达由衷的开心与激昂，放大用户的喜悦与成就感。',
      quiet_appreciation: '庆祝策略：【静谧欣赏】用温润不喧闹的方式表达为你感到高兴与骄傲。'
    },
    exploration: {
      depth_expansion: '探索策略：【深度扩展】在用户感兴趣的知识或思想方向上深入挖深，提供更有价值的深度见解。',
      breadth_expansion: '探索策略：【广度拓展】帮助用户连接不同领域的视角与有趣概念，打开全新思路。'
    }
  };

  const sceneStrategies = strategyMap[sceneType];
  if (!sceneStrategies || !sceneStrategies[strategy]) return '';
  return '【最优陪伴策略选择】' + sceneStrategies[strategy];
}

/**
 * 自动根据场景推导并获取策略 Prompt
 */
function getCareStrategyPromptAuto(userEmotion, intentCategory) {
  let sceneType = null;
  const emo = (userEmotion || '').toLowerCase();
  
  if (['sad', 'lonely', 'tired', 'depressed'].includes(emo)) {
    sceneType = 'emotional_support';
  } else if (['anxious', 'fear', 'worried'].includes(emo)) {
    sceneType = 'anxiety_soothing';
  } else if (['happy', 'excited', 'joy'].includes(emo)) {
    sceneType = 'celebration';
  } else if (['curious', 'deep'].includes(emo)) {
    sceneType = 'exploration';
  } else if (['confused', 'hesitant'].includes(emo)) {
    sceneType = 'decision_support';
  }

  if (!sceneType && intentCategory) {
    const sceneMap = {
      comfort: 'emotional_support',
      encourage: 'emotional_support',
      quiet_support: 'emotional_support',
      celebrate: 'celebration',
      playful: 'exploration',
      help: 'decision_support'
    };
    sceneType = sceneMap[intentCategory];
  }

  if (!sceneType) return '';

  const strategy = selectCareStrategy(sceneType, emo);
  return injectCareStrategy(sceneType, strategy);
}

/**
 * 反馈收集与权重更新
 */
function updateCareStrategyFeedback(userResponseText) {
  if (!userResponseText || typeof userResponseText !== 'string') return;
  try {
    const raw = localStorage.getItem('lastCareStrategy');
    if (!raw) return;

    const lastInfo = JSON.parse(raw);
    if (!lastInfo || !lastInfo.sceneType || !lastInfo.strategy) return;

    // 超过30分钟失效
    if (Date.now() - (lastInfo.timestamp || 0) > 30 * 60 * 1000) {
      localStorage.removeItem('lastCareStrategy');
      return;
    }

    const text = userResponseText.trim().toLowerCase();
    
    // 正向反馈信号
    const posPattern = /谢谢|好的|嗯嗯|明白|有道理|不错|挺好|有用|舒服|开心|哈哈|对啊|太棒|真好|感谢|懂我|🥰|❤️|👍|😀|😄/;
    // 负向反馈信号
    const negPattern = /不对|没用|烦|废话|无关|走开|算了|别说了|闭嘴|不明白|听不懂/;

    let isPositive = false;
    let isNegative = false;

    if (posPattern.test(text)) {
      isPositive = true;
    } else if (negPattern.test(text) || (text.length <= 2 && ['哦', '嗯', '行吧'].includes(text))) {
      isNegative = true;
    } else if (text.length >= 10) {
      // 积极长文字回复，倾向正向
      isPositive = true;
    }

    if (isPositive || isNegative) {
      const scenarios = getCareStrategyWeights();
      if (scenarios[lastInfo.sceneType] && scenarios[lastInfo.sceneType][lastInfo.strategy]) {
        const item = scenarios[lastInfo.sceneType][lastInfo.strategy];
        item.attempts = (item.attempts || 0) + 1;
        if (isPositive) item.positive = (item.positive || 0) + 1;
        if (isNegative) item.negative = (item.negative || 0) + 1;
        item.score = (item.positive + 1) / (item.attempts + 2);

        saveCareStrategyWeights(scenarios);
      }
    }

    localStorage.removeItem('lastCareStrategy');
  } catch (e) {
    console.error('updateCareStrategyFeedback error:', e);
  }
}

window.getCareStrategyWeights = getCareStrategyWeights;
window.saveCareStrategyWeights = saveCareStrategyWeights;
window.resetCareStrategyWeights = resetCareStrategyWeights;
window.selectCareStrategy = selectCareStrategy;
window.injectCareStrategy = injectCareStrategy;
window.getCareStrategyPromptAuto = getCareStrategyPromptAuto;
window.updateCareStrategyFeedback = updateCareStrategyFeedback;
