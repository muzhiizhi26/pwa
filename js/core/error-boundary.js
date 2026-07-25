/* ===== Global Error Boundary — 全局异常保护 =====
 * 三层捕获机制：模块层 → 调度层 → 全局层
 * 任何模块异常不影响整体系统运行。
 */

const ErrorBoundary = (() => {
  /* ─── 降级策略配置 ─── */
  const FALLBACKS = {
    voice: {
      stt: '语音识别失败，请尝试文字输入',
      tts: '朗读暂时不可用',
      default: '语音功能暂时不可用'
    },
    image: {
      generate: '图片生成暂时不可用',
      default: '图片功能暂时不可用'
    },
    memory: {
      recall: '', // 静默降级：跳过 RAG
      save: '',
      default: ''
    },
    api: {
      timeout: '请求超时，请稍后重试',
      rate_limit: '请求过于频繁，请稍后重试',
      auth: 'API 认证失败，请检查配置',
      default: '服务暂时不可用'
    },
    storage: {
      quota: '存储空间不足',
      default: '存储操作失败'
    },
    proactive: {
      default: '' // 静默降级
    }
  };

  /* ─── 统计 ─── */
  let _errorCount = 0;
  let _recentErrors = [];

  /* ─── 核心 API ─── */

  /**
   * 安全执行函数，带降级
   * @param {string} module - 模块名 (voice/image/memory/api/storage/proactive)
   * @param {string} operation - 操作名 (stt/tts/generate/recall/save/timeout)
   * @param {function} fn - 要执行的函数
   * @param {any} fallbackValue - 降级返回值（可选）
   * @returns {any} 函数结果或降级值
   */
  async function safeExecute(module, operation, fn, fallbackValue) {
    try {
      return await fn();
    } catch (err) {
      return handleError(module, operation, err, fallbackValue);
    }
  }

  /**
   * 同步版本的安全执行
   */
  function safeExecuteSync(module, operation, fn, fallbackValue) {
    try {
      return fn();
    } catch (err) {
      return handleError(module, operation, err, fallbackValue);
    }
  }

  /**
   * 统一错误处理
   */
  function handleError(module, operation, err, fallbackValue) {
    _errorCount++;
    const error = {
      module,
      operation,
      message: err?.message || String(err),
      ts: Date.now(),
      id: 'err_' + Date.now().toString(36)
    };
    _recentErrors.unshift(error);
    if (_recentErrors.length > 50) _recentErrors.pop();

    // 记录到 Trace Center
    if (typeof TraceCenter !== 'undefined') {
      TraceCenter.log('', `ErrorBoundary`, `[${module}:${operation}] ${error.message}`, 'error');
    }

    // 控制台输出
    console.warn(`[ErrorBoundary] ${module}.${operation} failed:`, err?.message || err);

    // 确定降级值
    if (fallbackValue !== undefined) return fallbackValue;
    
    const moduleFallbacks = FALLBACKS[module];
    if (moduleFallbacks) {
      const specific = moduleFallbacks[operation];
      if (specific !== undefined) return specific;
      return moduleFallbacks.default !== undefined ? moduleFallbacks.default : null;
    }

    return null;
  }

  /**
   * 获取最近的错误列表
   */
  function getRecentErrors(limit = 10) {
    return _recentErrors.slice(0, limit);
  }

  /**
   * 获取错误统计
   */
  function getStats() {
    const modules = {};
    _recentErrors.forEach(e => {
      modules[e.module] = (modules[e.module] || 0) + 1;
    });
    return {
      total: _errorCount,
      recent24h: _recentErrors.length,
      byModule: modules
    };
  }

  /**
   * 清除错误历史
   */
  function clearErrors() {
    _recentErrors = [];
    _errorCount = 0;
  }

  function init() {
    console.log('[ErrorBoundary] Initialized.');
  }

  return {
    safeExecute,
    safeExecuteSync,
    handleError,
    getRecentErrors,
    getStats,
    clearErrors,
    init
  };
})();

if (typeof window !== 'undefined') {
  window.ErrorBoundary = ErrorBoundary;
}
