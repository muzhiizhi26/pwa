/* ===== API Scheduler — 调用调度器 =====
 * 统一管理 AI 调用：去重、合并、优先级排序、Token 预算控制。
 * Chat > Image > Voice > Diary > Moment
 */

const ApiScheduler = (() => {
  const QUEUE_KEY = 'api_scheduler_queue';
  const MAX_RETRIES = 3;
  const DEDUP_WINDOW_MS = 5000; // 5秒内去重

  let _processing = false;
  let _queue = [];
  let _running = null;
  let _history = [];
  let _enabled = true;

  /* ─── 优先级定义 ─── */
  const PRIORITY = {
    chat: 100,
    image: 80,
    voice: 70,
    diary: 40,
    moment: 30,
    proactive: 20,
    system: 10
  };

  /* ─── 任务结构 ─── */
  function createTask(action) {
    return {
      id: 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      action,
      priority: PRIORITY[action.type] || 50,
      status: 'pending', // pending | processing | completed | failed
      retries: 0,
      createdAt: Date.now(),
      dedupKey: action.type + ':' + (action.payload?.content || '').slice(0, 50)
    };
  }

  /* ─── 内部方法 ─── */

  function loadQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (raw) _queue = JSON.parse(raw);
    } catch (e) {
      _queue = [];
    }
  }

  function saveQueue() {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(_queue.slice(0, 50)));
    } catch (e) {
      // 存储满时不阻塞
    }
  }

  /**
   * 检测并合并重复任务
   */
  function dedup(task) {
    const now = Date.now();
    const duplicates = _queue.filter(t =>
      t.status === 'pending' &&
      t.dedupKey === task.dedupKey &&
      (now - t.createdAt) < DEDUP_WINDOW_MS
    );
    if (duplicates.length > 0) {
      // 合并：更新已存在的任务时间戳
      duplicates.forEach(t => { t.createdAt = now; });
      return true; // 已合并，不添加新任务
    }
    return false;
  }

  /**
   * 获取下一个待执行的任务（按优先级排序）
   */
  function nextTask() {
    const pending = _queue
      .filter(t => t.status === 'pending')
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    return pending[0] || null;
  }

  /* ─── 公开 API ─── */

  /**
   * 提交一个 Action 到调度队列
   * @param {object} action - { type: 'chat'|'voice'|... , payload: {...} }
   * @param {function} processor - 实际执行该 Action 的函数
   * @returns {string} taskId
   */
  function enqueue(action, processor) {
    if (!_enabled) return '';

    const task = createTask(action);

    // 去重
    if (dedup(task)) {
      if (typeof TraceCenter !== 'undefined') {
        TraceCenter.log('', 'Scheduler', `去重合并: ${task.dedupKey}`, 'info');
      }
      return task.id;
    }

    task._processor = processor;
    _queue.push(task);
    saveQueue();

    if (typeof TraceCenter !== 'undefined') {
      TraceCenter.log('', 'Scheduler', `入队: ${action.type} (优先级 ${task.priority})`, 'info');
    }

    // 如果当前没有正在处理的任务，启动处理
    if (!_processing) {
      processNext();
    }

    return task.id;
  }

  /**
   * 处理队列中的下一个任务
   */
  async function processNext() {
    if (_processing) return;
    const task = nextTask();
    if (!task) {
      _processing = false;
      return;
    }

    _processing = true;
    _running = task;
    task.status = 'processing';
    saveQueue();

    try {
      if (typeof task._processor === 'function') {
        await task._processor(task.action);
      }
      task.status = 'completed';
      if (typeof TraceCenter !== 'undefined') {
        TraceCenter.log('', 'Scheduler', `完成: ${task.action.type}`, 'info');
      }
    } catch (err) {
      task.retries++;
      if (task.retries >= MAX_RETRIES) {
        task.status = 'failed';
        if (typeof TraceCenter !== 'undefined') {
          TraceCenter.log('', 'Scheduler', `失败(已放弃): ${task.action.type}`, 'error', { error: err.message });
        }
      } else {
        task.status = 'pending'; // 重新排队
        if (typeof TraceCenter !== 'undefined') {
          TraceCenter.log('', 'Scheduler', `失败(重试 ${task.retries}/${MAX_RETRIES}): ${task.action.type}`, 'warn');
        }
      }
    } finally {
      _running = null;
      _processing = false;
      saveQueue();
      // 处理下一个
      setTimeout(() => processNext(), 100);
    }
  }

  /**
   * 检查是否有重复任务
   */
  function isDuplicate(action) {
    const key = action.type + ':' + (action.payload?.content || '').slice(0, 50);
    return _queue.some(t =>
      t.status === 'pending' &&
      t.dedupKey === key &&
      (Date.now() - t.createdAt) < DEDUP_WINDOW_MS
    );
  }

  /**
   * 获取队列状态
   */
  function getStatus() {
    return {
      pending: _queue.filter(t => t.status === 'pending').length,
      processing: _processing,
      running: _running?.id || null,
      completed: _queue.filter(t => t.status === 'completed').length,
      failed: _queue.filter(t => t.status === 'failed').length,
      total: _queue.length
    };
  }

  /**
   * 清除已完成/失败的历史任务
   */
  function cleanHistory(maxAgeMs = 3600000) {
    const cutoff = Date.now() - maxAgeMs;
    _queue = _queue.filter(t => {
      if (t.status === 'completed' || t.status === 'failed') {
        return (t.createdAt || 0) > cutoff;
      }
      return true;
    });
    saveQueue();
  }

  function enable() { _enabled = true; }
  function disable() { _enabled = false; }
  function isEnabled() { return _enabled; }

  function init() {
    loadQueue();
    cleanHistory();
    setInterval(() => cleanHistory(), 60000);
    console.log('[ApiScheduler] Initialized.');
  }

  return {
    enqueue,
    isDuplicate,
    getStatus,
    cleanHistory,
    enable,
    disable,
    isEnabled,
    init
  };
})();

if (typeof window !== 'undefined') {
  window.ApiScheduler = ApiScheduler;
}
