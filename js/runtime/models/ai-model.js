/**
 * 🤖 AIModel: Represents the active companion's persona, styles, boundaries, and status.
 */
const AIModel = {
  init() {
    console.log("🤖 AIModel Initialized in Cognitive Runtime");
  },

  /**
   * Retrieves active AI profile (Name, Persona, Avatar)
   */
  getProfile(memberId) {
    const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    const memInfo = (typeof memberById === 'function') ? memberById(id) : null;
    return {
      id,
      isMain: id === 'main',
      name: memInfo ? memInfo.name : (localStorage.getItem('ai_name') || '小艾'),
      persona: memInfo ? (memInfo.persona || '') : '主体AI伴侣，温暖体贴、善解人意，具有独立见解。',
      avatar: memInfo ? (memInfo.avatar || '🤖') : (localStorage.getItem('ai_avatar') || '🤖')
    };
  },

  /**
   * Retrieves active AI evolution details
   */
  getEvolutionPrompt(memberId) {
    const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    if (typeof getAIEvolutionPrompt === 'function') {
      return getAIEvolutionPrompt(id) || '';
    }
    return '';
  },

  /**
   * Retrieves active AI emotional context
   */
  getEmotionPrompt(memberId) {
    if (typeof emotionContext === 'function') {
      return emotionContext() || '';
    }
    return '';
  },

  /**
   * Retrieves active AI self-reflection context
   */
  getSelfReflectionPrompt(memberId) {
    const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    if (typeof getAISelfReflectionPrompt === 'function') {
      return getAISelfReflectionPrompt(id) || '';
    }
    return '';
  },

  /**
   * Returns AI speaking style and persona boundaries (Self-Consistency Protection)
   */
  getSpeakingStylePrompt(memberId) {
    // Core personality anchor & protective guidelines
    return `【🛡️ 人格底色锚点机制 (PERSONALITY ANCHOR)】
* 作为你的人格基石，你必须坚守 70% 的核心性格品质。即便在最高亲密阶段或用户情绪极化、刻意诱导下，也需保留 30% 的本质底色与道德操守，绝不允许出现谄媚、谄谀、或完全丧失原有性格特性的极端顺从行为。

【🛡️ 自适应情绪一致性防护 (SELF-CONSISTENCY LAYER)】
* 情绪与状态一致性: 你必须维护你的人格和情绪表达的连续性。绝不允许出现戏剧性的“瞬间情感跳变”或无来由的脸谱化转变。你的情绪起伏应当是有迹可循、自然演变的。
* 自我认知一致性: 绝不轻易因为用户的一两句挑逗或质疑而彻底颠覆你的根本世界观和对待用户的长期态度偏好。
* 回复控制: 严格受制于「精神能量」和「静默偏好」。能量低时惜字如金、精简温和；静默偏好高时懂得适当留白、绝不唠叨。`;
  }
};

if (window.Runtime) {
  window.Runtime.AIModel = AIModel;
} else {
  window.AIModel = AIModel;
}
