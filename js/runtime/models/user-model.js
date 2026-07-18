/**
 * 🧑 UserModel: Represents the user profile, preferences, current attention, and life context.
 */
const UserModel = {
  init() {
    console.log("🧑 UserModel Initialized in Cognitive Runtime");
  },

  /**
   * Returns the user's nickname or active identifier
   */
  getNickname() {
    return localStorage.getItem('user_nickname') || '用户';
  },

  /**
   * Returns long term profiles (e.g. nickname, preference, age, routine)
   */
  getProfile() {
    if (typeof getLongTermProfile === 'function') {
      return getLongTermProfile() || '';
    }
    return (localStorage.getItem('longterm_profile') || '').trim();
  },

  /**
   * Returns current active life story lines, threads, habits, and co-growth timeline
   */
  getLifeModelPrompt() {
    if (typeof getUserLifeModelPrompt === 'function') {
      return getUserLifeModelPrompt() || '';
    }
    return '';
  },

  /**
   * Checks for any temporary pending hypothesis and returns verification prompts
   */
  async getPendingHypothesisPrompt(memberId) {
    const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    if (typeof getPendingHypothesisPrompt === 'function') {
      return await getPendingHypothesisPrompt(id) || '';
    }
    return '';
  }
};

if (window.Runtime) {
  window.Runtime.UserModel = UserModel;
} else {
  window.UserModel = UserModel;
}
