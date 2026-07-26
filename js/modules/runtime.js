/* ===== 运行时 Module ===== */
import { ctxSlice } from '../utils.js';
import { VDB } from '../chat/memory-core.js';

export function getActiveProvider() {
  if (typeof window.getCurrentProvider === 'function') return window.getCurrentProvider();
  return null;
}

export function getActiveModel() {
  if (typeof window.selectedModelName !== 'undefined') return window.selectedModelName;
  return null;
}

// 导出到 window
if (typeof window !== 'undefined') {
  window.getActiveProvider = getActiveProvider;
  window.getActiveModel = getActiveModel;
}

export default { getActiveProvider, getActiveModel };
