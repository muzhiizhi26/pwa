/* ===== 初始化与全局事件绑定 ===== */
window.onload=async()=>{
  // 初始化 🧠 Cognitive OS Runtime (仅核心，次核心后台预加载)
  if (window.Runtime && typeof window.Runtime.init === 'function') {
    await window.Runtime.init();
  }
  // 1. 容灾恢复：同步热备中的关键配置
  if (typeof syncLocalStorageAndIndexedDB === 'function') {
    await syncLocalStorageAndIndexedDB();
  }
  // 2. 存储健康检测：提示空间过低或浏览器强制逐出
  if (typeof checkStorageQuota === 'function') {
    await checkStorageQuota();
  }
  if (typeof detectStorageEvictionAndPrompt === 'function') {
    await detectStorageEvictionAndPrompt();
  }

  try { initTheme(); } catch (e) { console.error('initTheme failed', e); }
  try { setupAppIcon(); } catch (e) { console.error('setupAppIcon failed', e); }
  try { applyFontSize(); } catch (e) { console.error('applyFontSize failed', e); }
  try { loadProviders(); } catch (e) { console.error('loadProviders failed', e); }
  try { loadSettings(); } catch (e) { console.error('loadSettings failed', e); }
  try { applyBackground(); } catch (e) { console.error('applyBackground failed', e); }
  try { loadHistory(); } catch (e) { console.error('loadHistory failed', e); }
  try { updateModelCard(); } catch (e) { console.error('updateModelCard failed', e); }
  try { renderVoiceToggle(); } catch (e) { console.error('renderVoiceToggle failed', e); }
  try { renderGenImgMenu(); } catch (e) { console.error('renderGenImgMenu failed', e); }
  
  try {
    const sb=document.getElementById('songMenuBtn');
    if(sb) sb.style.display=(typeof songEnabled==='function'&&songEnabled())?'block':'none';
  } catch (e) { console.error('songMenuBtn setup failed', e); }

  try { initAutoBackup(); } catch (e) { console.error('initAutoBackup failed', e); }
  try { renderEmotionPills(); } catch (e) { console.error('renderEmotionPills failed', e); }
  try { markActivity(); } catch (e) { console.error('markActivity failed', e); }
  try { scheduleProactive(); } catch (e) { console.error('scheduleProactive failed', e); }
  try { checkProactive(); } catch (e) { console.error('checkProactive failed', e); }
  try { bindMicPushToTalk(); } catch (e) { console.error('bindMicPushToTalk failed', e); }
  
  if(location.hash.startsWith('#msg-')){
    const uid=location.hash.slice(5);
    setTimeout(()=>jumpToMessage(uid),400);
  } else if(location.hash === '#group'){
    setTimeout(()=>{
      if(typeof showLauncher === 'function') showLauncher();
      // 如果需要进入群聊，直接通过动态加载打开
      if (typeof LazyLoader !== 'undefined') {
        Promise.all([
          window.LazyLoader.load('js/group.js?v=20260708'),
          window.Runtime.ensureGroupModel()
        ]).then(() => {
          if(typeof openGroupChat === 'function') openGroupChat();
        });
      }
    }, 500);
  } else if(location.hash === '#diary'){
    setTimeout(()=>{
      if(typeof showLauncher === 'function') showLauncher();
      if (typeof LazyLoader !== 'undefined') {
        window.LazyLoader.load('js/diary.js?v=20260708').then(() => {
          if(typeof openDiary === 'function') openDiary();
        });
      }
    }, 500);
  }

  // 3. 混合延迟预加载低频大模块：延迟 3.5 秒在后台预加载，不占用首屏首包带宽和计算资源
  setTimeout(() => {
    if (typeof LazyLoader !== 'undefined') {
      console.log('⏰ Starting deferred background loading of low-frequency modules...');
      const modules = [
        'js/diary.js?v=20260708',
        'js/music.js?v=20260708',
        'js/songcraft.js?v=20260708',
        'js/ebook.js?v=20260708',
        'js/imagegen.js?v=20260708',
        'js/group.js?v=20260708',
        'js/project-context.js?v=20260714',
        'js/code-analyzer.js?v=20260714'
      ];
      // 串行依次平滑加载，避免瞬时大量网络请求/解析阻塞主线程
      let p = Promise.resolve();
      modules.forEach(m => {
        p = p.then(() => window.LazyLoader.load(m))
             .then(() => {
                // 如果是群聊或世界书相关，顺带保证其 Runtime Model 也被后台初始化
                if (m.includes('group.js')) window.Runtime.ensureGroupModel();
             })
             .catch(e => console.warn(`Deferred load failed for ${m}:`, e));
      });
      p.then(() => {
        console.log('✅ All deferred low-frequency modules preloaded successfully in background.');
      });
    }
  }, 3500);

  // Offline/Online detection
  window.addEventListener('online', () => {
    if (typeof showToast === 'function') showToast('✨ 重新连接：AI 实时对话与联网功能已恢复', 'double');
  });
  window.addEventListener('offline', () => {
    if (typeof showToast === 'function') showToast('🔌 离线状态：部分云端功能受限，本地日记与记忆依然可用', 'error');
  });

  // Register PWA Service Worker for offline support and faster loading
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered successfully with scope:', registration.scope);
        
        // Listen for updates and automatically reload to activate them
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('New Service Worker version available. Reloading...');
                  if (typeof showToast === 'function') {
                    showToast('🚀 系统已升级到最新版本，正在刷新页面...', 'success');
                  }
                  setTimeout(() => {
                    window.location.reload();
                  }, 1500);
                }
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  }
};

/* 麦克风按住录音（鼠标 + 触屏） */
function bindMicPushToTalk(){
  const bind = (id, isGroup) => {
    const mic = document.getElementById(id);
    if(!mic) return;
    mic.addEventListener('touchstart', e=>{e.preventDefault(); startPTT(isGroup);}, {passive:false});
    mic.addEventListener('touchend', e=>{e.preventDefault(); endPTT();}, {passive:false});
    mic.addEventListener('touchcancel', e=>{e.preventDefault(); endPTT();}, {passive:false});
    mic.addEventListener('mousedown', e=>{e.preventDefault(); startPTT(isGroup);});
    mic.addEventListener('mouseleave', ()=>{if(pttActive) endPTT();});
  };
  bind('micBtn', false);
  bind('groupMicBtn', true);
  document.addEventListener('mouseup', ()=>{if(pttActive) endPTT();});
}

/* 全局点击：关闭右键菜单 / 模型弹层 / 动作菜单 / 切换弹层 */
document.addEventListener('click',e=>{
  if(!e.target.closest('.context-menu'))hideContextMenu();
  if(!e.target.closest('.bubble') && !e.target.closest('.msg-actions')){
    document.querySelectorAll('.msg-actions.show-mobile').forEach(el=>el.classList.remove('show-mobile'));
  }
  if(!e.target.closest('#modelPopover')&&!e.target.closest('#modelCardBtn')){
    document.getElementById('modelPopover').classList.remove('show');
    document.getElementById('modelCardBtn').classList.remove('model-active');
  }
  if(!e.target.closest('#aiSwitcherPopover')&&!e.target.closest('#headerTitleArea')){
    const as = document.getElementById('aiSwitcherPopover');
    if(as) as.classList.remove('show');
  }
});
document.body.addEventListener('click',e=>{
  if(!document.getElementById('actionMenu').contains(e.target)&&!e.target.closest('.icon-btn')) {
    document.getElementById('actionMenu').classList.remove('show');
  }
});

/* 回车发送 */
document.getElementById('messageInput').addEventListener('keypress',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();
    sendMessage();
  }
});

// Default to starting on the Companion Chat tab (launcher start is false by default)
if(localStorage.getItem('launcher_start')==='true')showLauncher();

document.getElementById('groupInput')?.addEventListener('keypress',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();
    sendGroupMessage();
  }
});
