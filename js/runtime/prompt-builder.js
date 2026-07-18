/**
 * 🎨 PromptBuilder: The unified prompt compiler facade of the Cognitive OS.
 * Restructures system prompts into a clean, 4-tier architecture.
 * Delegates work directly to ContextAggregator's highly robust, extensible, and fine-grained 4-step pipeline.
 */
const PromptBuilder = {
  get cache() {
    return window.ContextAggregator ? window.ContextAggregator.cache : {
      lastPrompt: '',
      lastQuery: '',
      lastTime: 0,
      lastMemberId: '',
      hitCount: 0,
      compileCount: 0,
      savedLatencyMs: 0,
      lastPromptComposition: {}
    };
  },

  init() {
    console.log("🎨 PromptBuilder facade initialized");
  },

  /**
   * Main entry point for prompt compilation, routing directly to the 4-step ContextAggregator
   */
  async compile(query, recallItems, extra, memberId) {
    if (window.ContextAggregator && typeof window.ContextAggregator.compile === 'function') {
      return await window.ContextAggregator.compile(query, recallItems, extra, memberId);
    }
    
    // Simple fallback if ContextAggregator is not loaded yet
    const queryClean = (query || '').trim();
    const currentAi = memberId || 'main';
    const name = localStorage.getItem('ai_name') || '小艾';
    const persona = '主体AI伴侣，温暖体贴、善解人意，具有独立见解。';
    
    return `================================================================================
【 统 一 当 前 认 知 情 境 ( C O G N I T I V E   S C E N A R I O ) 】
- 伴侣名称: ${name}
- 性格设定: ${persona}
- 当前输入: ${queryClean}
================================================================================`;
  }
};

if (window.Runtime) {
  window.Runtime.PromptBuilder = PromptBuilder;
} else {
  window.PromptBuilder = PromptBuilder;
}
