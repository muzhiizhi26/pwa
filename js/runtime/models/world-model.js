/**
 * 📖 WorldModel: Represents the shared virtual environment, rules, and lore (World Book).
 */
const WorldModel = {
  init() {
    console.log("📖 WorldModel Initialized in Cognitive Runtime");
  },

  /**
   * Gets the global World Book text (configured by user settings)
   */
  getWorldBook() {
    return localStorage.getItem('world_book') || '';
  },

  /**
   * Formats a clean section containing world rules and settings if available
   */
  getWorldPrompt(memberId) {
    const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    const book = this.getWorldBook();
    
    // If it's the main AI, we should inject the World Book settings
    if (id === 'main' && book) {
      return `【📖 共享世界书设定与背景事实 (WORLD LORE & BACKGROUND)】\n${book}`;
    }
    return '';
  }
};

if (window.Runtime) {
  window.Runtime.WorldModel = WorldModel;
} else {
  window.WorldModel = WorldModel;
}
