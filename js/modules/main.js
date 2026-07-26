/* ===== 主入口 Module =====
 * 负责：按正确顺序导入所有模块、初始化、挂全局兼容接口
 * 不修改原始 .js 文件，通过 import 建立清晰依赖链
 */

// 1. 核心基础层（无依赖）
import './core/storage-manager.js';
import './core/embedding-cache.js';

// 2. 工具层（依赖 core）
import '../utils.js';

// 3. 语音层（依赖 utils）
import '../voice/voice.js';

// 4. 记忆层（依赖 utils）
import '../chat/memory-utils.js';
import '../chat/memory-core.js';
import '../chat/memory-bridge.js';

// 5. 初始化
import StorageManager from '../core/storage-manager.js';
import { unlockAudioOnGesture } from '../utils.js';

// DOM 就绪后初始化
document.addEventListener('DOMContentLoaded', () => {
  StorageManager.init().catch(e => console.warn('[Main] StorageManager init:', e));
});
