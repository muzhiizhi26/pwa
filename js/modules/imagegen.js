/* ===== 生图 Module ===== */
import { showToast } from '../utils.js';

export function imgPermissionMode() { return localStorage.getItem('img_permission_mode') || 'none'; }

// 导出到 window
if (typeof window !== 'undefined') {
  Object.assign(window, {
    imgPermissionMode,
  });
}

export default { imgPermissionMode };
