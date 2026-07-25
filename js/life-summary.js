/* ===== 🧠 语义人生摘要 (Semantic Life Summary) & 偏好演变系统 ===== */

function getLifeSummary() {
  try {
    const raw = localStorage.getItem('lifeSummary');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}

  return {
    coreTraits: "",
    longTermPreferences: "",
    relationshipPattern: "",
    growthTrajectory: "",
    evolutionTrends: "",
    generatedAt: null,
    memoryCountAtGeneration: 0,
    version: 1
  };
}

function saveLifeSummary(summary) {
  try {
    summary.updatedAt = new Date().toISOString();
    localStorage.setItem('lifeSummary', JSON.stringify(summary));
  } catch (e) {}
}

function resetLifeSummary() {
  localStorage.removeItem('lifeSummary');
  showToast('✅ 已清空语义人生摘要');
}

/**
 * 聚合全图谱信息，生成对用户的全局宏观语义人生摘要
 */
async function generateLifeSummary(force = false) {
  try {
    let allMems = [];
    if (typeof VDB !== 'undefined' && typeof VDB.all === 'function') {
      try { allMems = await VDB.all(); } catch(e) {}
    }
    const totalCount = allMems.length;

    // 1. 核心性格特征 (coreTraits)
    const cog = (typeof getUserCognitiveProfile === 'function') ? getUserCognitiveProfile() : {};
    const decMap = { analytical: "偏理性分析", intuitive: "偏直觉感知", mixed: "分析与直觉均衡" };
    const strMap = { sharing: "面对压力倾向倾诉表达", solo: "面对压力倾向先独处消化", mixed: "面对压力倾诉与独处并存" };
    const leaMap = { principle_first: "学习时喜欢先理解底层原理", practice_first: "学习时注重实践探索", mixed: "原理与实践结合" };
    const socMap = { outgoing: "热衷社交分享", private: "注重私密与个人边界", mixed: "兼顾社交与专注" };

    const decStr = decMap[cog.decisionStyle] || "思维全面且理性";
    const strStr = strMap[cog.stressResponse] || "面对情绪有自我调适能力";
    const leaStr = leaMap[cog.learningPreference] || "条理清晰";
    const socStr = socMap[cog.socialTendency] || "重视个人空间";

    const coreTraits = `${decStr}，${strStr}，${leaStr}，${socStr}。`;

    // 2. 长期稳定偏好 (longTermPreferences)
    const tagFreq = {};
    allMems.forEach(m => {
      const tags = m.topicTags || [];
      tags.forEach(t => {
        if (t && t.length >= 2) tagFreq[t] = (tagFreq[t] || 0) + 1;
      });
    });

    const sortedTags = Object.keys(tagFreq)
      .sort((a, b) => tagFreq[b] - tagFreq[a])
      .slice(0, 5);

    let longTermPreferences = sortedTags.length > 0
      ? `对 ${sortedTags.join('、')} 等领域保持持续关注与兴趣，偏好深度有建设性的探讨。`
      : "偏好有温度、有深度的交流，对生活细节与共同话题保持关注。";

    // 3. 关系互动模式 (relationshipPattern)
    const rhythm = (typeof getLifeRhythmProfile === 'function') ? getLifeRhythmProfile() : {};
    const patternMap = { regular: "互动规律而稳定", burst: "习惯长时间沉寂后集中爆发倾诉", scattered: "交流随心分散", unknown: "交流自然平实" };
    const patStr = patternMap[rhythm.chatPattern] || "交流自然平实";
    
    let relationshipPattern = `在陪伴互动中${patStr}，重视真诚理解与长期信任的建立。`;

    // 4. 共同成长轨迹 (growthTrajectory)
    let timeline = [];
    try {
      timeline = JSON.parse(localStorage.getItem('life_event_timeline') || '[]');
    } catch(e) {}

    let milestoneCount = timeline.filter(t => t.type === 'milestone' || t.importance >= 70).length;
    let growthTrajectory = milestoneCount > 0
      ? `已共同经历 ${milestoneCount} 个重要里程碑事件，从日常交流逐步深化为深度陪伴与共同思考。`
      : "从日常对话逐渐建立起默契与专属陪伴氛围，共同积累生活的点滴理解。";

    // 5. 偏好演变趋势 (evolutionTrends)
    const supersededMems = allMems.filter(m => m.supersedes || m.status === 'superseded');
    let evolutionTrends = supersededMems.length > 0
      ? `在陪伴过程中记录到 ${supersededMems.length} 次偏好演变，体现出随时间发展的认知丰富化与动态调整。`
      : "偏好与生活状态保持稳定演变，展现出健康自然的成长节奏。";

    const summary = {
      coreTraits,
      longTermPreferences,
      relationshipPattern,
      growthTrajectory,
      evolutionTrends,
      generatedAt: new Date().toISOString(),
      memoryCountAtGeneration: totalCount,
      version: 1
    };

    saveLifeSummary(summary);
    return summary;
  } catch (e) {
    console.error('generateLifeSummary error:', e);
    return getLifeSummary();
  }
}

/**
 * 动态注入全局语义人生摘要上下文
 */
function injectLifeSummary() {
  const summary = getLifeSummary();
  if (!summary || !summary.coreTraits) return '';

  const parts = [];
  if (summary.coreTraits) {
    parts.push(`【对用户的长期理解】${summary.coreTraits}`);
  }
  if (summary.longTermPreferences) {
    parts.push(`【用户长期偏好】${summary.longTermPreferences}`);
  }
  if (summary.relationshipPattern) {
    parts.push(`【关系互动模式】${summary.relationshipPattern}`);
  }
  if (summary.growthTrajectory) {
    parts.push(`【共同成长轨迹】${summary.growthTrajectory}`);
  }
  if (summary.evolutionTrends) {
    parts.push(`【偏好演变趋势】${summary.evolutionTrends}`);
  }

  return parts.length ? parts.join('\n') : '';
}

/**
 * 冲突检测与偏好演变标记
 */
async function detectSemanticContradiction(newRec, store) {
  if (!newRec || !newRec.text || !store || !store.length) return false;
  try {
    const newText = newRec.text.toLowerCase();
    const newTags = newRec.topicTags || [];

    // 检查是否含有否定/更替意图
    const isContradictionIntent = /更喜欢|不喜欢|改喜欢|不喝|换成|不是|纠正|记错了|讨厌|不要/.test(newText);
    if (!isContradictionIntent && !newTags.length) return false;

    for (const record of store) {
      if (record.id === newRec.id) continue;
      if (record.status === 'superseded') continue;
      if ((record.ai_id || 'main') !== (newRec.ai_id || 'main')) continue;

      const recordText = record.text.toLowerCase();
      const recTags = record.topicTags || [];
      const hasOverlap = newTags.some(t => recTags.includes(t));

      let isContradictory = false;
      if (hasOverlap || isContradictionIntent) {
        if ((newText.includes('更喜欢') && recordText.includes('喜欢')) ||
            (newText.includes('不喜欢') && recordText.includes('喜欢') && !recordText.includes('不喜欢')) ||
            (newText.includes('不喝') && recordText.includes('喜欢喝')) ||
            (newText.includes('讨厌') && recordText.includes('喜欢'))) {
          isContradictory = true;
        }
      }

      if (isContradictory) {
        // 标记旧记忆被取代
        record.status = 'superseded';
        record.supersededBy = newRec.id;
        record.supersededAt = new Date().toISOString();
        if (typeof VDB !== 'undefined' && typeof VDB.put === 'function') {
          await VDB.put(record);
        }

        // 标记新记忆取代了旧记忆
        newRec.supersedes = record.id;
        newRec.importance_score = Math.max(newRec.importance_score || 70, 70);

        // 写入 UnifiedEventStore 的偏好演变事件
        if (typeof UnifiedEventStore !== 'undefined' && typeof UnifiedEventStore.addEvent === 'function') {
          try {
            UnifiedEventStore.addEvent({
              type: 'preference_change',
              title: '偏好演变与更新',
              desc: `偏好更新：原先为「${record.text}」，现更新为「${newRec.text}」`,
              metadata: { oldId: record.id, newId: newRec.id }
            });
          } catch(e) {}
        }

        if (typeof showToast === 'function') {
          showToast(`🧠 已记录偏好演变: "${record.text.slice(0, 10)}..." → "${newRec.text.slice(0, 10)}..."`);
        }
        return true;
      }
    }
  } catch (e) {
    console.error('detectSemanticContradiction error:', e);
  }
  return false;
}

/**
 * 自动定时检查与润色更新摘要
 */
async function checkAndAutoGenerateLifeSummary() {
  try {
    const summary = getLifeSummary();
    let totalCount = 0;
    if (typeof VDB !== 'undefined' && typeof VDB.all === 'function') {
      const all = await VDB.all();
      totalCount = all.length;
    }

    if (!summary.generatedAt && totalCount >= 5) {
      await generateLifeSummary(true);
      return;
    }

    if (summary.generatedAt) {
      const days = (Date.now() - new Date(summary.generatedAt).getTime()) / (86400 * 1000);
      if (days >= 30 && totalCount > (summary.memoryCountAtGeneration || 0) * 1.2) {
        await generateLifeSummary(true);
      }
    }
  } catch (e) {}
}

// 启动后延迟 45 秒进行静默检查
setTimeout(() => {
  checkAndAutoGenerateLifeSummary();
}, 45000);

window.getLifeSummary = getLifeSummary;
window.saveLifeSummary = saveLifeSummary;
window.resetLifeSummary = resetLifeSummary;
window.generateLifeSummary = generateLifeSummary;
window.injectLifeSummary = injectLifeSummary;
window.detectSemanticContradiction = detectSemanticContradiction;
window.checkAndAutoGenerateLifeSummary = checkAndAutoGenerateLifeSummary;
