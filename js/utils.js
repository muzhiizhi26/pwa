/* ===== 通用工具 / 音频 / 偏好 ===== */
function stripForSpeech(text){if(text==null)return '';let s=String(text),prev;do{prev=s;s=s.replace(/（[^（）]*）/g,'').replace(/\([^()]*\)/g,'');}while(s!==prev);return s.replace(/[ \t]{2,}/g,' ').replace(/\s+([，。！？、；：])/g,'$1').trim();}

/* Wake Lock + 音频上下文（被 voice/call 共用） */
let wakeLock=null,keepAliveOsc=null,unlockedAudio=null,audioCtx=null;
async function requestWakeLock(){try{if('wakeLock' in navigator){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{});}}catch(e){}}
async function releaseWakeLock(){try{if(wakeLock){await wakeLock.release();wakeLock=null;}}catch(e){}}
function startKeepAlive(){try{if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(keepAliveOsc)return;keepAliveOsc=audioCtx.createOscillator();const g=audioCtx.createGain();g.gain.value=0.0001;keepAliveOsc.connect(g);g.connect(audioCtx.destination);keepAliveOsc.start();}catch(e){}}
function stopKeepAlive(){try{if(keepAliveOsc){keepAliveOsc.stop();keepAliveOsc.disconnect();keepAliveOsc=null;}}catch(e){}}
function unlockAudioOnGesture(){try{if(!unlockedAudio){unlockedAudio=new Audio();unlockedAudio.setAttribute('playsinline','');}unlockedAudio.src='data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQxAAAAAAAAAAAAAAAAAAAAAAAW2luZwAAAA8AAAACAAACcQCA';const pr=unlockedAudio.play();if(pr&&pr.catch)pr.catch(()=>{});if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(typeof callActive!=='undefined'&&callActive){requestWakeLock();if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();}if(typeof checkProactive==='function')checkProactive();}});

/* PWA 主屏图标 */
let caManifestUrl = null;
function setupAppIcon(){
  const cv=document.createElement('canvas');cv.width=cv.height=512;const x=cv.getContext('2d');
  x.fillStyle='#F7E3E8';x.fillRect(0,0,512,512);const cx=256,cy=256;x.fillStyle='#E89AAC';
  for(let i=0;i<6;i++){const a=i*Math.PI/3;x.beginPath();x.ellipse(cx+Math.cos(a)*108,cy+Math.sin(a)*108,72,46,a,0,Math.PI*2);x.fill();}
  x.fillStyle='#F6CE5B';x.beginPath();x.arc(cx,cy,60,0,Math.PI*2);x.fill();
  const png=cv.toDataURL('image/png');
  let at=document.querySelector('link[rel="apple-touch-icon"]');if(!at){at=document.createElement('link');at.rel='apple-touch-icon';document.head.appendChild(at);}at.href=png;
  let fav=document.querySelector('link[rel="icon"]');if(!fav){fav=document.createElement('link');fav.rel='icon';document.head.appendChild(fav);}fav.href=png;
  try{const mani={name:'AI聊天',short_name:'AI聊天',start_url:'.',display:'standalone',theme_color:'#E6DCD0',background_color:'#F5F0F0',icons:[{src:png,sizes:'192x192',type:'image/png'},{src:png,sizes:'512x512',type:'image/png'}]};
    if(caManifestUrl){
      try{ URL.revokeObjectURL(caManifestUrl); }catch(e){}
    }
    caManifestUrl=URL.createObjectURL(new Blob([JSON.stringify(mani)],{type:'application/manifest+json'}));
    let ml=document.querySelector('link[rel="manifest"]');if(!ml){ml=document.createElement('link');ml.rel='manifest';document.head.appendChild(ml);}ml.href=caManifestUrl;}catch(e){}
}

/* 图片压缩 / 生图尺寸 */
function getImageCompressDim(){
  const v = localStorage.getItem('image_compress_dim');
  if(v === 'raw') return 99999;
  return parseInt(v || '768');
}
function compressImage(dataUrl,maxDim=768,quality=0.7){
  if(maxDim === 99999 || maxDim === 'raw') return Promise.resolve(dataUrl);
  return new Promise(res=>{const img=new Image();img.onload=()=>{let{width,height}=img;const scale=Math.min(1,maxDim/Math.max(width,height));const w=Math.round(width*scale),h=Math.round(height*scale);const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h);try{res(cv.toDataURL('image/jpeg',quality));}catch(e){res(dataUrl);}};img.onerror=()=>res(dataUrl);img.src=dataUrl;});}
function getImgWH(){const base=parseInt(localStorage.getItem('img_res')||getImgResList()[0]||'1024');const ratio=localStorage.getItem('img_ratio')||'1:1';const[rw,rh]=ratio.split(':').map(Number);if(rw>=rh)return{w:base,h:Math.round(base*rh/rw)};return{w:Math.round(base*rw/rh),h:base};}

/* 上下文裁剪 */
function getContextLimit(){const v=localStorage.getItem('context_limit');if(v==null)return 12;if(v==='unlimited')return Infinity;const n=parseInt(v);return isNaN(n)?12:n;}
function ctxSlice(arr){const l=getContextLimit();if(l===Infinity)return arr.slice();if(l<=0)return [];return arr.slice(-l);}

/* 偏好开关 */
function streamEnabled(){return localStorage.getItem('stream_output')!=='false';}
function showThinkingEnabled(){return localStorage.getItem('show_thinking')!=='false';}
function timeAwareEnabledFn(){return localStorage.getItem('time_aware')!=='false';}
function autoSpeakEnabled(){return localStorage.getItem('auto_speak')==='true';}
function voiceEnabled(){return localStorage.getItem('voice_enabled')==='true';}
function autoBackupEnabled(){return localStorage.getItem('auto_backup')==='true';}
function webSearchEnabled(){return localStorage.getItem('web_search')==='true';}
function imgEnabled(){return localStorage.getItem('img_enabled')==='true';}
function renderGenImgMenu(){const btn=document.getElementById('genImgMenuBtn');if(btn)btn.style.display=imgEnabled()?'block':'none';}
function applyFontSize(){document.documentElement.style.setProperty('--chat-font-size',(localStorage.getItem('font_size')||'15')+'px');}
function applyBackground(){const bg=localStorage.getItem('chat_bg');const el=document.getElementById('chatMessages');if(bg){el.style.backgroundImage=`url(${bg})`;el.style.backgroundSize='cover';el.style.backgroundPosition='center';}else el.style.backgroundImage='';}

/* 时间感知 / 联网提示 */
function fmtGap(ms){const s=Math.floor(ms/1000);if(s<60)return '刚刚';const m=Math.floor(s/60);if(m<60)return m+' 分钟';const h=Math.floor(m/60);if(h<24)return h+' 小时'+(m%60?(m%60)+' 分钟':'');const day=Math.floor(h/24);return day+' 天'+(h%24?(h%24)+' 小时':'');}
function generateTimeContext(){if(!timeAwareEnabledFn())return'';const n=new Date();const wd=['日','一','二','三','四','五','六'][n.getDay()];const h=n.getHours();const period=h<5?'凌晨':h<8?'清晨':h<11?'上午':h<13?'中午':h<17?'下午':h<19?'傍晚':h<23?'晚上':'深夜';const season=['冬','冬','春','春','春','夏','夏','夏','秋','秋','秋','冬'][n.getMonth()];const isWeekend=n.getDay()===0||n.getDay()===6;const dateStr=`${n.getFullYear()}年${n.getMonth()+1}月${n.getDate()}日 星期${wd} ${h}:${String(n.getMinutes()).padStart(2,'0')}`;let gapStr='';try{const lu=[...conversationHistory].reverse().find(m=>m.role==='user'&&m.ts);if(lu){const gap=Date.now()-lu.ts;if(gap>30*60*1000)gapStr=`距用户上次说话已过 ${fmtGap(gap)}，可自然表达久违或关心。`;}}catch(e){}let care='';if(h>=23||h<5)care='现在已是深夜，若用户还醒着可适度提醒早点休息。';else if(h>=5&&h<8)care='清晨时分，可送上早安。';else if(h>=11&&h<13)care='临近/正值午餐时间，可关心是否吃饭。';else if(h>=18&&h<20)care='临近晚餐时间，可关心用餐。';else if(h>=20&&h<23)care='夜晚时段，语气可放轻松。';const wkStr=isWeekend?'今天是周末，氛围可更放松。':'今天是工作日，可适度关心工作/学习状态。';return `\n【时间感知】当前 ${dateStr}（${period}·${season}季·${isWeekend?'周末':'工作日'}）。${wkStr}${care}${gapStr}请让回应自然贴合此刻情境，但不要每句都强调时间。`;}
function webSearchInstruction(){if(!webSearchEnabled())return'';return '\n【联网提示】你可以联网检索最新信息。若问题涉及实时或最新内容，请使用你的联网/搜索能力获取并引用最新结果作答。';}

/* 小工具 */
function triggerHaptic(type = 'light') {
  if (!('vibrate' in navigator)) return;
  try {
    if (type === 'light') {
      navigator.vibrate(12);
    } else if (type === 'medium') {
      navigator.vibrate(25);
    } else if (type === 'double') {
      navigator.vibrate([15, 40, 15]);
    } else if (type === 'error') {
      navigator.vibrate([50, 60, 50]);
    }
  } catch (e) {}
}

function showToast(msg, hapticType = 'light'){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  if (hapticType) triggerHaptic(hapticType);
  setTimeout(()=>t.classList.remove('show'),2500);
}
function togglePwd(id){const el=document.getElementById(id);el.type=el.type==='password'?'text':'password';}
function setBool(k,v){
  localStorage.setItem(k,v?'true':'false');
  if(k==='auto_speak' && typeof renderAutoSpeakToggle === 'function'){
    renderAutoSpeakToggle();
  }
}
function setNum(k,v){localStorage.setItem(k,v);}
function openImageViewer(src){document.getElementById('viewerImg').src=src;document.getElementById('imageViewer').classList.add('show');}
function closeImageViewer(){document.getElementById('imageViewer').classList.remove('show');}
function genUid(){return 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);}
function nowTime(ts){return new Date(ts||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function scrollBottom(){const c=document.getElementById('chatMessages');c.scrollTop=c.scrollHeight;}
/* 优化9：滚动到指定消息并短暂高亮 */
function jumpToMessage(uid){
  const el=document.getElementById('msg-'+uid)||document.querySelector(`.message[data-uid="${uid}"]`);
  if(!el)return false;
  el.scrollIntoView({block:'center',behavior:'smooth'});
  el.classList.remove('msg-flash');void el.offsetWidth;el.classList.add('msg-flash');
  setTimeout(()=>el.classList.remove('msg-flash'),1600);
  return true;
}
/* 优化9：复制该消息锚点链接 */
function copyAnchor(uid){
  const base=location.origin+location.pathname;
  const link=base+'#msg-'+uid;
  navigator.clipboard.writeText(link).then(()=>showToast('🔗 已复制锚点链接')).catch(()=>showToast('复制失败'));
}
/* 优化10：Markdown 转义 */
function mdEscape(t){return String(t==null?'':t).replace(/\\/g,'\\\\');}

/* ===== 莫兰迪色系主题支持 ===== */
const THEME_PRESETS = {
  morandi_oat: {
    name: '莫兰迪·古典燕麦 (默认)',
    colors: {
      '--bg-main': '#E8E8E5',
      '--bg-card': '#F5F0F0',
      '--bg-white': '#FEFCF9',
      '--text-main': '#4F3F35',
      '--text-sub': '#8F7A6B',
      '--accent': '#D9CEC3',
      '--border': '#E9DFD5'
    }
  },
  morandi_matcha: {
    name: '莫兰迪·抹茶青绿',
    colors: {
      '--bg-main': '#D4D9D2',
      '--bg-card': '#E5EAE3',
      '--bg-white': '#F7FAF5',
      '--text-main': '#3C433B',
      '--text-sub': '#747F72',
      '--accent': '#C3D2C1',
      '--border': '#DCE4DA'
    }
  },
  morandi_sunset: {
    name: '莫兰迪·暮色柔桃',
    colors: {
      '--bg-main': '#E8DDD2',
      '--bg-card': '#F5ECE3',
      '--bg-white': '#FFF9F4',
      '--text-main': '#55453B',
      '--text-sub': '#967F71',
      '--accent': '#E4D2C3',
      '--border': '#EFE0D4'
    }
  },
  morandi_lilac: {
    name: '莫兰迪·温柔丁香',
    colors: {
      '--bg-main': '#DFDCE3',
      '--bg-card': '#ECEAF0',
      '--bg-white': '#FAF9FC',
      '--text-main': '#433E4F',
      '--text-sub': '#7F778F',
      '--accent': '#D3CBE0',
      '--border': '#E4DFED'
    }
  },
  morandi_mist: {
    name: '莫兰迪·静谧北欧',
    colors: {
      '--bg-main': '#D1DCE2',
      '--bg-card': '#DFE9EF',
      '--bg-white': '#F4F9FC',
      '--text-main': '#33414A',
      '--text-sub': '#697A86',
      '--accent': '#C3D7E4',
      '--border': '#DBE6EC'
    }
  }
};

function initTheme(){
  const theme = localStorage.getItem('theme_preset') || 'morandi_oat';
  applyTheme(theme);
}

function applyTheme(themeKey){
  localStorage.setItem('theme_preset', themeKey);
  if (themeKey === 'custom') {
    const customAccent = localStorage.getItem('theme_custom_accent') || '#D9CEC3';
    // We can derive other colors gracefully from the accent color, or let users adjust
    document.documentElement.style.setProperty('--accent', customAccent);
    // Derive body bg desaturated and lighter
    const customBg = adjustSaturationAndBrightness(customAccent, 0.4, 1.12);
    const customCard = adjustSaturationAndBrightness(customAccent, 0.3, 1.18);
    const customBorder = adjustSaturationAndBrightness(customAccent, 0.6, 1.08);
    
    document.documentElement.style.setProperty('--bg-main', customBg);
    document.documentElement.style.setProperty('--bg-card', customCard);
    document.documentElement.style.setProperty('--bg-white', '#FEFCF9');
    document.documentElement.style.setProperty('--border', customBorder);
    
    // Check if the custom color is too light or too dark, adjust text color
    const isDark = getLuminance(customAccent) < 0.5;
    document.documentElement.style.setProperty('--text-main', isDark ? '#FFF9F4' : '#4F3F35');
    document.documentElement.style.setProperty('--text-sub', isDark ? '#D9CEC3' : '#8F7A6B');
    return;
  }
  
  const preset = THEME_PRESETS[themeKey] || THEME_PRESETS['morandi_oat'];
  for (const [key, val] of Object.entries(preset.colors)) {
    document.documentElement.style.setProperty(key, val);
  }
}

function getLuminance(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function adjustSaturationAndBrightness(hex, satFactor, valFactor) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  
  // RGB to HSL
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  // Adjust saturation and luminance
  s = Math.min(1, Math.max(0, s * satFactor));
  l = Math.min(0.98, Math.max(0.05, l * valFactor));
  
  // HSL to RGB
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    let p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  const toHex = (c) => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/* ===== IndexedDB 兜底备份，防止手机 PWA / iOS 自动擦除 localStorage 聊天记录 ===== */
const HistoryBackupDB = (() => {
  const DB = 'morandi_history_backup_db', S = 'backups', V = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.reject(new Error('IndexedDB not supported'));
    }
    dbp = new Promise((res, rej) => {
      try {
        const r = window.indexedDB.open(DB, V);
        r.onupgradeneeded = e => {
          const d = e.target.result;
          if (!d.objectStoreNames.contains(S)) {
            d.createObjectStore(S);
          }
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) {
        rej(e);
      }
    });
    return dbp;
  }
  async function get(key) {
    try {
      const d = await open();
      return new Promise((res, rej) => {
        const tx = d.transaction(S, 'readonly');
        const rq = tx.objectStore(S).get(key);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    } catch(e) {
      console.error('HistoryBackupDB get error:', e);
      return null;
    }
  }
  async function set(key, val) {
    try {
      const d = await open();
      return new Promise((res, rej) => {
        const tx = d.transaction(S, 'readwrite');
        tx.objectStore(S).put(val, key);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch(e) {
      console.error('HistoryBackupDB set error:', e);
    }
  }
  return { get, set };
})();

/* ===== IndexedDB 配置双写热备 (防止小体积 API 密钥、设定被 iOS 驱逐) ===== */
const ConfigBackupDB = (() => {
  const DB = 'morandi_config_backup_db', S = 'configs', V = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.reject(new Error('IndexedDB not supported'));
    }
    dbp = new Promise((res, rej) => {
      try {
        const r = window.indexedDB.open(DB, V);
        r.onupgradeneeded = e => {
          const d = e.target.result;
          if (!d.objectStoreNames.contains(S)) {
            d.createObjectStore(S);
          }
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) {
        rej(e);
      }
    });
    return dbp;
  }
  async function get(key) {
    try {
      const d = await open();
      return new Promise((res, rej) => {
        const tx = d.transaction(S, 'readonly');
        const rq = tx.objectStore(S).get(key);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    } catch(e) {
      console.error('ConfigBackupDB get error:', e);
      return null;
    }
  }
  async function set(key, val) {
    try {
      const d = await open();
      return new Promise((res, rej) => {
        const tx = d.transaction(S, 'readwrite');
        tx.objectStore(S).put(val, key);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch(e) {
      console.error('ConfigBackupDB set error:', e);
    }
  }
  async function del(key) {
    try {
      const d = await open();
      return new Promise((res, rej) => {
        const tx = d.transaction(S, 'readwrite');
        tx.objectStore(S).delete(key);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch(e) {
      console.error('ConfigBackupDB del error:', e);
    }
  }
  async function all() {
    try {
      const d = await open();
      return new Promise((res, rej) => {
        const tx = d.transaction(S, 'readonly');
        const store = tx.objectStore(S);
        const rq = store.openCursor();
        const results = [];
        rq.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) {
            results.push({ key: cursor.key, value: cursor.value });
            cursor.continue();
          } else {
            res(results);
          }
        };
        rq.onerror = () => rej(rq.error);
      });
    } catch(e) {
      console.error('ConfigBackupDB all error:', e);
      return [];
    }
  }
  return { get, set, del, all };
})();

// 判断是否为大体积历史数据键
function isHistoryKey(key) {
  return key === 'chatHistory' || key === 'group_history' || key.startsWith('chatHistory_') || key.startsWith('morandi_history_');
}

// 拦截 localStorage 写入以进行双写备份（不阻塞主线程）
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
  originalSetItem.call(localStorage, key, value);
  if (!isHistoryKey(key)) {
    ConfigBackupDB.set(key, value);
  } else {
    // 如果写入了聊天记录，自动标记 has_previous_chat
    originalSetItem.call(localStorage, 'has_previous_chat', 'true');
    ConfigBackupDB.set('has_previous_chat', 'true');
  }
};

const originalRemoveItem = localStorage.removeItem;
localStorage.removeItem = function(key) {
  originalRemoveItem.call(localStorage, key);
  if (!isHistoryKey(key)) {
    ConfigBackupDB.del(key);
  }
};

// 启动时进行 localStorage 与 IndexedDB (配置数据库) 的双向热备恢复
async function syncLocalStorageAndIndexedDB() {
  try {
    const dbConfigs = await ConfigBackupDB.all();
    const dbKeys = new Set(dbConfigs.map(item => item.key));

    const lsKeys = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !isHistoryKey(key)) {
        lsKeys.add(key);
      }
    }

    let restoredCount = 0;
    let backupCount = 0;

    // 1. 双写备份：若 localStorage 有且与 IndexedDB 备份不一致，备份最新值到 DB
    for (const key of lsKeys) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        const dbItem = dbConfigs.find(item => item.key === key);
        if (!dbItem || dbItem.value !== val) {
          await ConfigBackupDB.set(key, val);
          backupCount++;
        }
      }
    }

    // 2. 容灾恢复：若 IndexedDB 有但 localStorage 丢失或损坏，恢复至 localStorage
    for (const item of dbConfigs) {
      const lsVal = localStorage.getItem(item.key);
      const hasKey = lsKeys.has(item.key);
      const isCorrupted = !lsVal || lsVal === 'null' || lsVal === 'undefined';

      if (!hasKey || isCorrupted) {
        // 如果 localStorage 大面积缺失 (元素少于等于2)，说明极可能被 iOS 驱逐清理，此时需要恢复所有备份
        // 如果 localStorage 健全，则仅恢复关键缺失项 (例如 ai_providers 或已存在的 provider 的 apikey_)
        const isEvicted = lsKeys.size <= 2;
        let shouldRestore = isEvicted || isCorrupted || item.key === 'ai_providers' || item.key === 'has_previous_chat';

        if (!shouldRestore && item.key.startsWith('apikey_')) {
          const providerId = item.key.slice(7);
          const providersStr = localStorage.getItem('ai_providers');
          if (providersStr) {
            try {
              const list = JSON.parse(providersStr);
              if (list.some(p => p.id === providerId)) {
                shouldRestore = true;
              }
            } catch (e) {}
          }
        }

        if (shouldRestore) {
          originalSetItem.call(localStorage, item.key, item.value);
          restoredCount++;
        }
      }
    }

    if (restoredCount > 0) {
      console.log(`[StorageSync] Restored ${restoredCount} critical config keys from IndexedDB.`);
    }

    // === 🌟 朋友圈动态 (Moments) 交叉舱容灾恢复与双写对齐 ===
    if (typeof HistoryBackupDB !== 'undefined') {
      const localMomentsRaw = localStorage.getItem('lovestory_moments');
      const dbMomentsBackup = await HistoryBackupDB.get('lovestory_moments_backup');
      
      let localMoments = [];
      try {
        if (localMomentsRaw) localMoments = JSON.parse(localMomentsRaw);
      } catch(e) {}

      const hasLocalMoments = Array.isArray(localMoments) && localMoments.length > 0 && localMoments[0].id !== 'mom_init_1';
      const hasDbMoments = Array.isArray(dbMomentsBackup) && dbMomentsBackup.length > 0;

      if (!hasLocalMoments && hasDbMoments) {
        localStorage.setItem('lovestory_moments', JSON.stringify(dbMomentsBackup));
        console.log(`[StorageSync] 🩺 朋友圈容灾：成功从 IndexedDB 备份舱恢复了 ${dbMomentsBackup.length} 条朋友圈动态。`);
      } else if (hasLocalMoments && !hasDbMoments) {
        await HistoryBackupDB.set('lovestory_moments_backup', localMoments);
      } else if (hasLocalMoments && hasDbMoments && localMoments.length !== dbMomentsBackup.length) {
        if (localMoments.length > dbMomentsBackup.length) {
          await HistoryBackupDB.set('lovestory_moments_backup', localMoments);
        } else {
          localStorage.setItem('lovestory_moments', JSON.stringify(dbMomentsBackup));
        }
      }
    }

    // === 📔 日记 (Diaries) 交叉舱容灾恢复与双写对齐 ===
    if (typeof DIARY_DB !== 'undefined') {
      let dbDiaries = [];
      try {
        dbDiaries = await DIARY_DB.all();
      } catch(e) {}

      let localDiaries = [];
      try {
        const localDiariesRaw = localStorage.getItem('diary_backup');
        if (localDiariesRaw) localDiaries = JSON.parse(localDiariesRaw);
      } catch(e) {}

      const hasDbDiaries = Array.isArray(dbDiaries) && dbDiaries.length > 0;
      const hasLocalDiaries = Array.isArray(localDiaries) && localDiaries.length > 0;

      if (!hasDbDiaries && hasLocalDiaries) {
        for (const d of localDiaries) {
          await DIARY_DB.put(d);
        }
        console.log(`[StorageSync] 🩺 日记容灾：成功从 localStorage 备份舱恢复了 ${localDiaries.length} 篇日记。`);
      } else if (hasDbDiaries && !hasLocalDiaries) {
        localStorage.setItem('diary_backup', JSON.stringify(dbDiaries));
      } else if (hasDbDiaries && hasLocalDiaries && dbDiaries.length !== localDiaries.length) {
        if (dbDiaries.length >= localDiaries.length) {
          localStorage.setItem('diary_backup', JSON.stringify(dbDiaries));
        } else {
          for (const d of localDiaries) {
            await DIARY_DB.put(d);
          }
        }
      }
    }

  } catch (e) {
    console.error('[StorageSync] Error during mutual config sync:', e);
  }
}

// 主动检测存储空间不足
async function checkStorageQuota() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const remaining = quota - usage;
      const remainingMB = remaining / (1024 * 1024);
      console.log(`[StorageQuota] Usage: ${(usage/(1024*1024)).toFixed(2)} MB, Quota: ${(quota/(1024*1024)).toFixed(2)} MB, Remaining: ${remainingMB.toFixed(2)} MB`);
      
      if (remainingMB > 0 && remainingMB < 100) {
        // 创建全局美化预警弹窗
        const alertDiv = document.createElement('div');
        alertDiv.id = 'storage-warning-banner';
        alertDiv.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100000;width:90%;max-width:420px;background:#FFF3CD;color:#856404;border:1px solid #FFEEBA;padding:16px;border-radius:12px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,0.15);display:flex;flex-direction:column;gap:10px;backdrop-filter:blur(8px);font-family:sans-serif;line-height:1.5;";
        alertDiv.innerHTML = `
          <div style="font-weight:bold;display:flex;align-items:center;gap:8px;font-size:15px;color:#A17A00;">
            <span>⚠️</span> 存储空间极度不足 (仅剩 ${remainingMB.toFixed(1)}MB)
          </div>
          <div style="color:#66511A;font-size:13px;">
            您的系统剩余存储过低。iOS/Safari 等浏览器可能在无提示的情况下<b>强制清空您的聊天历史记录</b>。建议立即清理手机空间或通过侧边栏导出备份！
          </div>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
            <button id="btn-export-backup-now" style="background:#856404;color:#FFF;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;transition:opacity 0.2s;" onmouseover="this.style.opacity=0.9" onmouseout="this.style.opacity=1">立即导出备份</button>
            <button onclick="this.parentElement.parentElement.remove();" style="background:transparent;color:#856404;border:1px solid #856404;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;transition:background 0.2s;" onmouseover="this.style.background='rgba(133,100,4,0.1)'" onmouseout="this.style.background='transparent'">知道了</button>
          </div>
        `;
        document.body.appendChild(alertDiv);
        
        document.getElementById('btn-export-backup-now').onclick = () => {
          if (typeof exportChat === 'function') {
            exportChat();
          } else {
            showToast('请在聊天页右上角或侧边栏导出备份');
          }
          alertDiv.remove();
        };
      }
    } catch (e) {
      console.error('[StorageQuota] Error checking quota:', e);
    }
  }
}

// 导出完整备份为 JSON (含所有 localStorage 配置 + 各角色聊天历史 + 群聊历史)
function exportAllDataJSON() {
  try {
    const backupData = {
      version: '1.0',
      timestamp: Date.now(),
      localStorageConfigs: {},
      chatHistory: localStorage.getItem('chatHistory') || '[]',
      groupHistory: localStorage.getItem('group_history') || '[]'
    };

    // 导出各独立角色的 chatHistory_xxx
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        if (!isHistoryKey(key)) {
          backupData.localStorageConfigs[key] = localStorage.getItem(key);
        } else if (key.startsWith('chatHistory_')) {
          backupData['history_' + key] = localStorage.getItem(key);
        }
      }
    }

    const jsonStr = JSON.stringify(backupData, null, 2);
    const b = new Blob([jsonStr], {type: 'application/json;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `Morandi_全舱备份_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    showToast('✅ 完整备份 JSON 已下载！');
  } catch (e) {
    console.error('exportAllDataJSON error:', e);
    alert('备份导出失败: ' + e.message);
  }
}

// 触发通用恢复导入（显示一个漂亮的弹窗，包含文件导入和文本粘贴恢复，支持 iOS / iPadOS 备份恢复）
function triggerFullRecoveryImport() {
  if (document.getElementById('restoreBackupPanel')) return;

  const panel = document.createElement('div');
  panel.id = 'restoreBackupPanel';
  panel.className = 'memo-panel show';
  panel.style.zIndex = '100100';

  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosWarning = isiOS ? `
    <div style="background: #FFF3CD; color: #856404; padding: 10px; border-radius: 8px; border: 1px solid #FFEBAF; margin-bottom: 12px; font-size: 12px; line-height: 1.5;">
      <b>📱 iOS 设备检测：</b>由于 iOS PWA (添加到主屏幕) 模式的系统限制，点击“选择文件”有时会引起应用重新加载。推荐直接将备份文件中的文本内容复制并粘贴到下方文本框中，导入可 100% 成功！
    </div>
  ` : '';

  panel.innerHTML = `
    <div class="memo-container" style="max-width: 460px; width: 92%; margin: auto;">
      <div class="memo-header">
        <h3 style="display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px;">🔄 恢复备份 / 导入数据</h3>
        <button class="icon-btn" style="width:30px;height:30px;font-size:14px;" onclick="document.getElementById('restoreBackupPanel').remove()">✕</button>
      </div>
      <div class="memo-body" style="font-size: 13px; line-height: 1.6; color: var(--text-main); display: flex; flex-direction: column; gap: 12px; padding: 15px 0;">
        ${iosWarning}
        
        <div style="background: var(--bg-hover, #f8f9fa); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
          <div style="font-weight: bold; margin-bottom: 6px;">📂 方式一：选择本地备份文件导入</div>
          <p style="margin: 0 0 10px 0; font-size: 12px; color: var(--text-muted, #666);">支持 .json (完整备份) 或 .txt/.md (聊天记录文本)</p>
          <button id="btn-select-file-restore" class="footer-btn footer-btn-secondary" style="justify-content: center; width: 100%; padding: 8px; font-weight: bold; font-size: 13px;">📁 选择备份文件...</button>
          <input type="file" id="restoreFileHiddenInput" style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; opacity: 0.01; z-index: -1;">
        </div>

        <div style="background: var(--bg-hover, #f8f9fa); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
          <div style="font-weight: bold; margin-bottom: 6px;">✍️ 方式二：粘贴备份文本恢复 (iOS 推荐)</div>
          <p style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-muted, #666);">将备份文件用记事本打开，复制全部文本并粘贴在下方：</p>
          <textarea id="pastedBackupText" placeholder="在此粘贴导出的备份 JSON，或纯文本/Markdown 聊天记录..." style="width: 100%; height: 120px; border-radius: 8px; border: 1px solid var(--border); padding: 8px; font-family: monospace; font-size: 11px; resize: vertical; background: var(--bg-main, #fff); color: var(--text-main);"></textarea>
          <button id="btn-submit-pasted-restore" class="footer-btn footer-btn-primary" style="justify-content: center; width: 100%; border: none; padding: 10px; font-weight: bold; margin-top: 8px; font-size: 13px;">📥 确认解析并恢复</button>
        </div>
      </div>
      <div class="memo-footer" style="justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border, #eee); padding-top: 10px;">
        <button class="footer-btn footer-btn-secondary" onclick="document.getElementById('restoreBackupPanel').remove()" style="padding: 6px 12px;">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const fileInput = document.getElementById('restoreFileHiddenInput');
  
  // 方式一：文件导入
  document.getElementById('btn-select-file-restore').onclick = () => {
    fileInput.accept = 'application/json,text/plain,.json,.txt,.md';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target.result;
          await handlePastedBackupRestore(text);
          const modal = document.getElementById('restoreBackupPanel');
          if (modal) modal.remove();
        } catch (err) {
          console.error('File import error:', err);
          alert('读取文件失败，请重试');
        }
      };
      reader.readAsText(file, 'UTF-8');
      e.target.value = ''; // 重置
    };
    fileInput.click();
  };

  // 方式二：粘贴文本导入
  document.getElementById('btn-submit-pasted-restore').onclick = async () => {
    const text = document.getElementById('pastedBackupText').value;
    if (!text.trim()) {
      alert('请粘贴备份文本！');
      return;
    }
    const btn = document.getElementById('btn-submit-pasted-restore');
    const origText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '正在恢复中...';
    try {
      await handlePastedBackupRestore(text);
      const modal = document.getElementById('restoreBackupPanel');
      if (modal) modal.remove();
    } catch (e) {
      alert('解析失败: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.innerText = origText;
    }
  };
}

// 统一处理设置界面的恢复文件输入 (保留向下兼容)
function handleRecoveryFileInputBtn(input) {
  const file = input.files[0];
  if (!file) return;

  const mockEvent = { target: { files: [file] } };
  if (file.name.toLowerCase().endsWith('.json')) {
    handleRecoveryFileImport(mockEvent);
  } else {
    handleTextFileImport(mockEvent);
  }
  input.value = ''; // 重置以允许重复导入同名文件
}

// 统一解析备份入口 (支持 JSON 和 文本格式)
async function handlePastedBackupRestore(text) {
  text = text.trim();
  if (!text) return;

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const data = JSON.parse(text);
      await restoreFromJsonData(data);
    } catch (err) {
      console.error('Restore JSON error:', err);
      alert('恢复失败，请确保您粘贴的是有效的 JSON 备份结构！');
    }
  } else {
    try {
      await restoreFromTextLines(text);
    } catch (err) {
      console.error('Import text error:', err);
      alert('解析失败，请确保该文本是有效的聊天记录。');
    }
  }
}

// 基础恢复函数：从解析出的 JSON 对象中恢复所有仓位数据
async function restoreFromJsonData(data) {
  let chatHistoryStr = null;
  let parsedHistory = null;
  let groupHistoryStr = null;
  let parsedGroup = null;
  let configs = null;
  let charactersHistory = {};
  let isAnyDataValid = false;

  // 1. 自动适配多种 JSON 格式 (直接消息数组 / 带有 messages/history 字段的 JSON / 完整的 Morandi 全仓备份结构)
  if (Array.isArray(data)) {
    parsedHistory = data;
    chatHistoryStr = JSON.stringify(data);
    isAnyDataValid = true;
  } else if (data && typeof data === 'object') {
    if (data.chatHistory) {
      chatHistoryStr = typeof data.chatHistory === 'string' ? data.chatHistory : JSON.stringify(data.chatHistory);
      parsedHistory = typeof data.chatHistory === 'string' ? JSON.parse(data.chatHistory) : data.chatHistory;
      isAnyDataValid = true;
    } else if (Array.isArray(data.messages)) {
      parsedHistory = data.messages;
      chatHistoryStr = JSON.stringify(data.messages);
      isAnyDataValid = true;
    } else if (Array.isArray(data.history)) {
      parsedHistory = data.history;
      chatHistoryStr = JSON.stringify(data.history);
      isAnyDataValid = true;
    }

    if (data.groupHistory) {
      groupHistoryStr = typeof data.groupHistory === 'string' ? data.groupHistory : JSON.stringify(data.groupHistory);
      parsedGroup = typeof data.groupHistory === 'string' ? JSON.parse(data.groupHistory) : data.groupHistory;
      isAnyDataValid = true;
    } else if (data.group_history) {
      groupHistoryStr = typeof data.group_history === 'string' ? data.group_history : JSON.stringify(data.group_history);
      parsedGroup = typeof data.group_history === 'string' ? JSON.parse(data.group_history) : data.group_history;
      isAnyDataValid = true;
    }

    if (data.localStorageConfigs && typeof data.localStorageConfigs === 'object') {
      configs = data.localStorageConfigs;
      isAnyDataValid = true;
    }

    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith('history_chatHistory_')) {
        const actualKey = key.slice(8); // 去除 history_ 前缀
        charactersHistory[actualKey] = val;
        isAnyDataValid = true;
      } else if (key.startsWith('chatHistory_') && key !== 'chatHistory') {
        charactersHistory[key] = val;
        isAnyDataValid = true;
      }
    }
  }

  if (isAnyDataValid) {
    // 恢复 localStorage 里的普通配置
    if (configs) {
      for (const [key, val] of Object.entries(configs)) {
        const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (typeof originalSetItem === 'function') {
          originalSetItem.call(localStorage, key, stringVal);
        } else {
          localStorage.setItem(key, stringVal);
        }
        await ConfigBackupDB.set(key, stringVal);
      }
    }
    
    // 恢复主私聊历史
    if (parsedHistory) {
      localStorage.setItem('chatHistory', chatHistoryStr);
      if (typeof HistoryBackupDB !== 'undefined') {
        await HistoryBackupDB.set('chatHistory', parsedHistory);
      }
    }

    // 恢复各角色专属私聊历史
    for (const [actualKey, val] of Object.entries(charactersHistory)) {
      const valStr = typeof val === 'string' ? val : JSON.stringify(val);
      const valParsed = typeof val === 'string' ? JSON.parse(val) : val;
      localStorage.setItem(actualKey, valStr);
      if (typeof HistoryBackupDB !== 'undefined') {
        await HistoryBackupDB.set(actualKey, valParsed);
      }
    }

    // 恢复群聊历史
    if (parsedGroup) {
      localStorage.setItem('group_history', groupHistoryStr);
      if (typeof HistoryBackupDB !== 'undefined') {
        await HistoryBackupDB.set('group_history', parsedGroup);
      }
    }

    localStorage.setItem('has_previous_chat', 'true');
    await ConfigBackupDB.set('has_previous_chat', 'true');

    showToast('🎉 备份恢复成功！正在重新加载应用...');
    setTimeout(() => location.reload(), 1500);
  } else {
    alert('格式错误：未能在该数据中识别出任何有效的备份或聊天历史。');
  }
}

// 基础恢复函数：从原始文本中解析出聊天历史并恢复
async function restoreFromTextLines(text) {
  const lines = text.split('\n');
  const messages = [];
  let currentMsg = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // 匹配 TXT/MD 导出格式: 【我】 2026/07/08 或 #### 我 (2026/07/08)
    const txtMatch = line.match(/^【(我|AI|AI助手|assistant|user)】\s*(.*)$/);
    const mdMatch = line.match(/^####\s*(我|AI|AI助手|user|assistant|assistant|AI助手)\s*(.*)$/);

    if (txtMatch || mdMatch) {
      if (currentMsg) {
        messages.push(currentMsg);
      }
      const roleLabel = txtMatch ? txtMatch[1] : mdMatch[1];
      const rawTime = txtMatch ? txtMatch[2] : mdMatch[2];
      
      let role = 'assistant';
      if (roleLabel === '我' || roleLabel === 'user') role = 'user';

      let ts = Date.now();
      if (rawTime) {
        const cleanedTime = rawTime.replace(/[()\[\]]/g, '').trim();
        const parsedTs = Date.parse(cleanedTime);
        if (!isNaN(parsedTs)) {
          ts = parsedTs;
        }
      }

      currentMsg = {
        role,
        content: '',
        uid: genUid(),
        ts
      };
    } else {
      if (currentMsg) {
        if (currentMsg.content) currentMsg.content += '\n';
        currentMsg.content += line;
      }
    }
  }

  if (currentMsg) {
    messages.push(currentMsg);
  }

  if (messages.length > 0) {
    const importConfirmed = confirm(`成功解析出 ${messages.length} 条聊天记录。是否将其恢复至当前会话中？`);
    if (importConfirmed) {
      const id = (typeof currentPrivateAiId === 'function') ? currentPrivateAiId() : 'main';
      const key = (id === 'main') ? 'chatHistory' : `chatHistory_${id}`;
      
      localStorage.setItem(key, JSON.stringify(messages));
      if (typeof HistoryBackupDB !== 'undefined') {
        await HistoryBackupDB.set(key, messages);
      }
      
      localStorage.setItem('has_previous_chat', 'true');
      await ConfigBackupDB.set('has_previous_chat', 'true');

      showToast('🎉 聊天历史恢复成功！正在重新加载...');
      setTimeout(() => location.reload(), 1500);
    }
  } else {
    alert('解析失败：未能在该文本中识别出有效的聊天记录格式。');
  }
}

// 解析并恢复 JSON 完整备份 (用于文件选择事件回调)
async function handleRecoveryFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const text = event.target.result;
      await handlePastedBackupRestore(text);
    } catch (err) {
      console.error('Restore JSON error:', err);
      alert('恢复失败，请确保该文件是有效的 Morandi JSON 备份文件。');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// 解析并恢复 文本 / Markdown 格式聊天记录 (用于文件选择事件回调)
function handleTextFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const text = event.target.result;
      await restoreFromTextLines(text);
    } catch (err) {
      console.error('Import text error:', err);
      alert('解析失败，请确保文件是有效的聊天记录。');
    }
  };
  reader.readAsText(file);
}

// 弹出容灾引导界面
function showRecoveryDialog() {
  if (document.getElementById('recoveryPanel')) return;

  const panel = document.createElement('div');
  panel.id = 'recoveryPanel';
  panel.className = 'memo-panel show';
  panel.style.zIndex = '100100';

  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosWarning = isiOS ? `
    <div style="background: #FFF3CD; color: #856404; padding: 10px; border-radius: 8px; border: 1px solid #FFEBAF; font-size: 11px; line-height: 1.5; margin-bottom: 8px;">
      <b>📱 iOS PWA 提示：</b>由于苹果系统的 standalone 模式限制，选择文件导入可能导致应用重载。建议直接复制备份文件中的文本，粘贴到下方文本框中导入！
    </div>
  ` : '';
  
  panel.innerHTML = `
    <div class="memo-container" style="max-width: 440px; width: 92%; margin: auto;">
      <div class="memo-header">
        <h3 style="color: #c82333; display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px;">🔄 聊天记录容灾恢复</h3>
        <button class="icon-btn" style="width:30px;height:30px;font-size:14px;" onclick="document.getElementById('recoveryPanel').remove()">✕</button>
      </div>
      <div class="memo-body" style="font-size: 13px; line-height: 1.6; color: var(--text-main); display: flex; flex-direction: column; gap: 10px; padding: 15px 0;">
        <div style="background: #F8D7DA; color: #721C24; padding: 10px; border-radius: 8px; font-weight: bold; border: 1px solid #F5C6CB; font-size: 12px;">
          检测到您的聊天历史记录已被浏览器强制清空！
        </div>
        <p style="margin: 0; font-size: 12px;">这通常是由于手机存储空间不足时，iOS WebKit 触发了<b>强制清空（Evict 逐出）</b>机制造成的。</p>
        <p style="margin: 0; color: #155724; background: #D4EDDA; border: 1px solid #C3E6CB; padding: 8px; border-radius: 8px; font-size: 12px;">
          <b>🎉 隔离舱完好：</b> 核心配置（API Key、人设、音色等）已成功锁定并安全保留。
        </p>
        
        ${iosWarning}

        <!-- 方式一：文件选择 -->
        <div style="border-top: 1px solid var(--border, #eee); padding-top: 10px; display: flex; flex-direction: column; gap: 6px;">
          <div style="font-weight: bold; font-size: 12px;">📂 方式一：选择备份文件导入</div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-recovery-json" class="footer-btn footer-btn-primary" style="justify-content: center; flex: 1; padding: 8px; font-size: 12px;">📥 导入 JSON 备份</button>
            <button id="btn-recovery-txt" class="footer-btn footer-btn-secondary" style="justify-content: center; flex: 1; padding: 8px; font-size: 12px;">📄 导入 TXT/MD 记录</button>
          </div>
          <input type="file" id="recoveryFileInput" style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; opacity: 0.01; z-index: -1;">
        </div>

        <!-- 方式二：粘贴恢复 -->
        <div style="border-top: 1px solid var(--border, #eee); padding-top: 10px; display: flex; flex-direction: column; gap: 6px;">
          <div style="font-weight: bold; font-size: 12px;">✍️ 方式二：粘贴备份文本恢复</div>
          <textarea id="recoveryPasteText" placeholder="在此粘贴导出的备份 JSON，或纯文本聊天历史内容..." style="width: 100%; height: 90px; border-radius: 8px; border: 1px solid var(--border); padding: 6px; font-family: monospace; font-size: 11px; resize: vertical; background: var(--bg-main, #fff); color: var(--text-main);"></textarea>
          <button id="btn-recovery-paste-submit" class="footer-btn footer-btn-primary" style="justify-content: center; width: 100%; border: none; padding: 8px; font-weight: bold; font-size: 12px;">⚡ 立即解析并恢复</button>
        </div>
      </div>
      <div class="memo-footer" style="justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border, #eee); padding-top: 10px;">
        <button class="footer-btn footer-btn-secondary" onclick="document.getElementById('recoveryPanel').remove()" style="padding: 6px 12px; font-size: 12px;">直接开启新对话</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const fileInput = document.getElementById('recoveryFileInput');
  
  document.getElementById('btn-recovery-json').onclick = () => {
    fileInput.accept = 'application/json,.json';
    fileInput.onchange = handleRecoveryFileImport;
    fileInput.click();
  };

  document.getElementById('btn-recovery-txt').onclick = () => {
    fileInput.accept = 'text/plain,.txt,.md';
    fileInput.onchange = handleTextFileImport;
    fileInput.click();
  };

  document.getElementById('btn-recovery-paste-submit').onclick = async () => {
    const text = document.getElementById('recoveryPasteText').value;
    if (!text.trim()) {
      alert('请先粘贴备份内容！');
      return;
    }
    await handlePastedBackupRestore(text);
    const modal = document.getElementById('recoveryPanel');
    if (modal) modal.remove();
  };
}

// 检查是否发生数据清除并运行容灾提示
async function detectStorageEvictionAndPrompt() {
  const hadPreviousChat = localStorage.getItem('has_previous_chat') === 'true';
  const currentChatHistoryEmpty = !localStorage.getItem('chatHistory') || localStorage.getItem('chatHistory') === '[]';
  const currentGroupHistoryEmpty = !localStorage.getItem('group_history') || localStorage.getItem('group_history') === '[]';

  if (hadPreviousChat && currentChatHistoryEmpty && currentGroupHistoryEmpty) {
    try {
      const backupPrivate = await HistoryBackupDB.get('chatHistory');
      const backupGroup = await HistoryBackupDB.get('group_history');
      if ((!backupPrivate || backupPrivate.length === 0) && (!backupGroup || backupGroup.length === 0)) {
        setTimeout(() => {
          if (typeof showRecoveryDialog === 'function') {
            showRecoveryDialog();
          }
        }, 1500);
      }
    } catch (e) {
      console.error('[EvictionCheck] Error checking history backup:', e);
    }
  }
}

// 统一的时区安全本地日期字符串获取函数 (YYYY-MM-DD)
function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 统一的异步动态模块/脚本加载器
window.LazyLoader = {
  loaded: new Set(),
  loadingPromises: {},
  load(src) {
    if (this.loaded.has(src)) return Promise.resolve();
    if (this.loadingPromises[src]) return this.loadingPromises[src];

    this.loadingPromises[src] = new Promise((resolve, reject) => {
      // 检查DOM中是否已存在该script，防止第三方库静态载入造成的重复
      const scripts = Array.from(document.querySelectorAll('script'));
      const isExisting = scripts.some(s => s.src && s.src.includes(src.split('?')[0]));
      if (isExisting) {
        this.loaded.add(src);
        delete this.loadingPromises[src];
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        this.loaded.add(src);
        delete this.loadingPromises[src];
        resolve();
      };
      script.onerror = (err) => {
        console.error(`[LazyLoader] Failed to load script: ${src}`, err);
        delete this.loadingPromises[src];
        reject(err);
      };
      document.head.appendChild(script);
    });
    return this.loadingPromises[src];
  }
};

