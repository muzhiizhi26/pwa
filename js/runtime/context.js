/**
 * 🧭 Context: Compiles current conversation's instant indicators (attention, time, environment).
 */
const Context = {
  init() {
    console.log("🧭 Context Object Initialized in Cognitive Runtime");
  },

  /**
   * Generates real-time sensing data (Time, Emotional state, ebook, song instructions etc.)
   */
  getEnvironmentalSensing() {
    const timeCtx = (typeof generateTimeContext === 'function') ? generateTimeContext() : '未知时间';
    const emoCtx = (typeof emotionContext === 'function') ? emotionContext() : '平静';
    return {
      time: timeCtx,
      emotion: emoCtx
    };
  },

  /**
   * Retrieves mid-term dialogue summary
   */
  getMidtermSummary() {
    if (typeof getMidTerm === 'function') {
      return getMidTerm() || '';
    }
    return '';
  },

  /**
   * Resolves active story lines or imperfections
   */
  getNarrativeImperfections(query, memberId) {
    if (typeof NarrativeManager !== 'undefined') {
      return NarrativeManager.injectNarrativeAndImperfections(query, memberId) || '';
    }
    return '';
  }
};

if (window.Runtime) {
  window.Runtime.Context = Context;
} else {
  window.Context = Context;
}
