/* ===== Trace Center — 全链路日志 =====
 * 每次请求生成唯一 Trace ID，完整记录从进入到输出的全过程。
 * 存储到 IndexedDB（通过 StorageManager），支持查询和导出。
 * 内存保留最近 50 条，IndexedDB 保留最近 7 天。
 */

const TraceCenter = (() => {
  const MAX_MEMORY = 50;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

  let _traces = [];
  let _currentTrace = null;
  let _enabled = true;

  /* ─── 工具函数 ─── */

  function genTraceId() {
    return 'trc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function now() {
    return Date.now();
  }

  function iso() {
    return new Date().toISOString();
  }

  /* ─── 核心 API ─── */

  /**
   * 开始一个新 Trace
   * @param {string} actionType - Action 类型 (chat/voice/image/diary/moment/group/proactive)
   * @param {object} payload - 请求内容摘要
   * @returns {string} traceId
   */
  function begin(actionType, payload = {}) {
    if (!_enabled) return '';

    const traceId = genTraceId();
    _currentTrace = {
      traceId,
      timestamp: iso(),
      action: { type: actionType, payload: summarizePayload(payload) },
      steps: [],
      status: 'running',
      totalTime: 0
    };
    _traces.unshift(_currentTrace);

    // 限制内存数量
    if (_traces.length > MAX_MEMORY) _traces.pop();

    log(traceId, 'Entry', `dispatch() 收到 Action: ${actionType}`, 'info');
    return traceId;
  }

  /**
   * 记录一个步骤
   * @param {string} traceId
   * @param {string} phase - 阶段名 (Context/LLM/Response/Storage)
   * @param {string} message - 描述
   * @param {string} level - info/warn/error
   * @param {object} data - 附加数据
   */
  function log(traceId, phase, message, level = 'info', data = null) {
    if (!_enabled || !traceId) return;

    const trace = findTrace(traceId);
    if (!trace) {
      // 允许无 trace 的日志（降级）
      if (typeof console !== 'undefined') {
        console[level] || console.log(`[Trace] ${phase}: ${message}`);
      }
      return;
    }

    const step = {
      phase,
      message,
      level,
      ts: now(),
      data: data ? safeStringify(data) : null
    };
    trace.steps.push(step);

    // 控制台输出
    if (typeof console !== 'undefined') {
      const prefix = `[Trace:${traceId.slice(-8)}]`;
      const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[method](`${prefix} [${phase}] ${message}`);
    }
  }

  /**
   * 标记 Trace 完成
   */
  function end(traceId, status = 'success') {
    if (!_enabled || !traceId) return;

    const trace = findTrace(traceId);
    if (!trace) return;

    trace.status = status;
    trace.totalTime = now() - new Date(trace.timestamp).getTime();
    log(traceId, 'Exit', `✅ 完成 (total: ${trace.totalTime}ms)`, status === 'success' ? 'info' : 'error');
  }

  /**
   * 标记 Trace 失败
   */
  function fail(traceId, error) {
    if (!_enabled || !traceId) return;

    const trace = findTrace(traceId);
    if (!trace) return;

    trace.status = 'error';
    trace.totalTime = now() - new Date(trace.timestamp).getTime();
    log(traceId, 'Error', `❌ 失败: ${error?.message || error || '未知错误'}`, 'error', { error: error?.message || error });
  }

  /* ─── 查询 ─── */

  function findTrace(traceId) {
    return _traces.find(t => t.traceId === traceId) || null;
  }

  function getRecent(count = 20) {
    return _traces.slice(0, count);
  }

  function getByStatus(status) {
    return _traces.filter(t => t.status === status);
  }

  function getErrors(limit = 10) {
    return _traces.filter(t => t.status === 'error').slice(0, limit);
  }

  /* ─── 辅助函数 ─── */

  function summarizePayload(payload) {
    if (!payload) return {};
    const summary = {};
    for (const key of Object.keys(payload).slice(0, 5)) {
      const val = payload[key];
      if (typeof val === 'string') {
        summary[key] = val.length > 60 ? val.slice(0, 60) + '...' : val;
      } else if (typeof val === 'object' && val !== null) {
        summary[key] = `{${Object.keys(val).join(', ')}}`;
      } else {
        summary[key] = val;
      }
    }
    return summary;
  }

  function safeStringify(obj) {
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return String(obj);
    }
  }

  /* ─── 启用/禁用 ─── */

  function enable() { _enabled = true; }
  function disable() { _enabled = false; }
  function isEnabled() { return _enabled; }

  /* ─── 持久化（可选，依赖 StorageManager） ─── */

  async function persistErrors() {
    if (typeof StorageManager === 'undefined') return;
    const errors = getErrors(20);
    try {
      await StorageManager.set('trace_errors', errors, 'idb');
    } catch (e) {
      console.warn('[TraceCenter] persist failed:', e);
    }
  }

  /* ─── 初始化 ─── */

  function init() {
    console.log('[TraceCenter] Initialized.');
  }

  return {
    begin,
    log,
    end,
    fail,
    findTrace,
    getRecent,
    getByStatus,
    getErrors,
    enable,
    disable,
    isEnabled,
    persistErrors,
    init,
    get currentTrace() { return _currentTrace; }
  };
})();

if (typeof window !== 'undefined') {
  window.TraceCenter = TraceCenter;
}
