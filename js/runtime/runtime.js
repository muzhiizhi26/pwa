/**
 * 🧠 Cognitive Runtime Core (Cognitive OS)
 * Coordinates AIModel, UserModel, WorldModel, GroupModel, RelationshipModel, and PromptBuilder with lazy loading.
 */
const Runtime = {
  version: "1.0.0-cognitive-os-lazy",
  get AIModel() { return window.AIModel; },
  get UserModel() { return window.UserModel; },
  get WorldModel() { return window.WorldModel; },
  get GroupModel() { return window.GroupModel; },
  get RelationshipModel() { return window.RelationshipModel; },
  get Context() { return window.Context; },
  get PromptBuilder() { return window.PromptBuilder; },
  get MemoryGraph() { return window.MemoryGraph; },

  async init() {
    console.log("🧠 Cognitive Runtime Core (Cognitive OS) initializing...");
    // 1. 初始化核心认知和长期关系模型 (首屏和基础对话必须)
    if (this.MemoryGraph && typeof this.MemoryGraph.init === 'function') {
      await this.MemoryGraph.init();
    }
    if (this.UserModel && typeof this.UserModel.init === 'function') {
      this.UserModel.init();
    }
    if (this.RelationshipModel && typeof this.RelationshipModel.init === 'function') {
      this.RelationshipModel.init();
    }

    // 2. 异步后台预加载次核心模块，不阻塞首屏与用户主线程渲染
    this.preloadNonCoreModules();
    console.log("🧠 Cognitive Runtime (Cognitive OS) core initialized successfully.");
  },

  async preloadNonCoreModules() {
    try {
      // 预加载 AIModel, Context, PromptBuilder (常规聊天必需模块)
      await Promise.all([
        window.LazyLoader.load("js/runtime/models/ai-model.js?v=20260716"),
        window.LazyLoader.load("js/runtime/context.js?v=20260716"),
        window.LazyLoader.load("js/runtime/prompt-builder.js?v=20260716")
      ]);
      
      if (window.AIModel && typeof window.AIModel.init === 'function') window.AIModel.init();
      if (window.Context && typeof window.Context.init === 'function') window.Context.init();
      if (window.PromptBuilder && typeof window.PromptBuilder.init === 'function') window.PromptBuilder.init();
      console.log("🧠 Cognitive Runtime: Chat submodels background-loaded and initialized.");
    } catch (e) {
      console.error("Failed to preload non-core runtime submodules:", e);
    }
  },

  async ensureGroupModel() {
    if (!window.GroupModel) {
      console.log("👥 Lazy-loading GroupModel on demand...");
      await window.LazyLoader.load("js/runtime/models/group-model.js?v=20260716");
      if (window.GroupModel && typeof window.GroupModel.init === 'function') {
        window.GroupModel.init();
      }
    }
    return window.GroupModel;
  },

  async ensureWorldModel() {
    if (!window.WorldModel) {
      console.log("📖 Lazy-loading WorldModel on demand...");
      await window.LazyLoader.load("js/runtime/models/world-model.js?v=20260716");
      if (window.WorldModel && typeof window.WorldModel.init === 'function') {
        window.WorldModel.init();
      }
    }
    return window.WorldModel;
  }
};

window.Runtime = Runtime;

