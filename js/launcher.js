/* ===== 桌面启动器 UI ===== */
/* 图标配置：icon 支持 emoji 或本地图片(dataURL)，action 决定点击行为 */
const LAUNCHER_DEFAULT=[
  // 网格 第一行
  {id:'worldbook',label:'世界书',icon:'📖',action:'worldbook'},
  {id:'theater',label:'小剧场',icon:'🎭',action:'group'},
  {id:'clear',label:'清空上下文',icon:'🧹',action:'clear'},
  {id:'settings',label:'设置',icon:'⚙️',action:'settings'},
  // 网格 第二行
  {id:'image',label:'生成图片',icon:'🎨',action:'image'},
  {id:'video',label:'生成视频',icon:'🎬',action:'video'},
  {id:'song',label:'生成歌曲',icon:'🎼',action:'song'},
  {id:'export',label:'导出记录',icon:'📤',action:'backup'},
  {id:'codeanalyzer',label:'代码分析',icon:'📦',action:'codeanalyzer'},
  // 网格 第三行
  {id:'reading',label:'陪伴阅读',icon:'📚',action:'ebook'},
  {id:'netease',label:'网易云',icon:'🎧',action:'music'},
  {id:'diarybook',label:'日记',icon:'📔',action:'diary'},
  {id:'moments',label:'朋友圈',icon:'🌸',action:'moments'},
  // 底部 Dock
  {id:'chat',label:'聊天',icon:'💬',action:'chat'},
  {id:'group',label:'群聊',icon:'👥',action:'group'},
  {id:'create',label:'创造',icon:'🎨',action:'create'},
  {id:'memory',label:'记忆',icon:'🧠',action:'memory'}
];
function getLauncherIcons(){
  try{
    let l=JSON.parse(localStorage.getItem('launcher_icons'));
    if(Array.isArray(l)&&l.length) {
      l = l.filter(i=>i.id!=='memo');
      const hasCreate = l.some(i => i.id === 'create');
      const hasMemory = l.some(i => i.id === 'memory');
      const hasMoments = l.some(i => i.id === 'moments');
      if (!hasCreate || !hasMemory || !hasMoments) {
        localStorage.removeItem('launcher_icons');
        return JSON.parse(JSON.stringify(LAUNCHER_DEFAULT));
      }
      l.forEach(it => {
        if (it.id === 'worldbook' && it.action === 'memory') {
          it.action = 'worldbook';
        }
      });
      return l;
    }
  }catch(e){}
  return JSON.parse(JSON.stringify(LAUNCHER_DEFAULT));
}
function saveLauncherIcons(l){localStorage.setItem('launcher_icons',JSON.stringify(l));}
function launcherBg(){return localStorage.getItem('launcher_bg')||'';}
function launcherShowConfig(){return localStorage.getItem('launcher_show_config')!=='false';}

function buildLauncher(){
  const root=document.getElementById('launcher');if(!root)return;
  const bg=launcherBg();
  root.style.backgroundImage=bg?`url(${bg})`:'linear-gradient(170deg,#B8B0D8,#9FB4D8 45%,#C9BBD6)';
  const now=new Date();
  const time=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
  const wd=['日','一','二','三','四','五','六'][now.getDay()];
  const date=`${now.getMonth()+1}月${now.getDate()}日 星期${wd}`;
  const icons=getLauncherIcons();
  const dockIds=['chat','group','create','memory'];
  const grid=icons.filter(i=>!dockIds.includes(i.id));
  const dock=dockIds.map(id=>icons.find(i=>i.id===id)).filter(Boolean);
  
  const gradients = {
    worldbook: 'linear-gradient(135deg, #F5EBE6, #E4D5C9)', // Morandi sand
    theater: 'linear-gradient(135deg, #F2E4EC, #DEC5D4)', // Morandi mauve
    clear: 'linear-gradient(135deg, #E4EFE9, #B9D1C4)', // Morandi soft mint
    settings: 'linear-gradient(135deg, #ECEFF1, #CFD8DC)', // Morandi blue grey
    image: 'linear-gradient(135deg, #FDECE6, #F1CDBE)', // Morandi peach
    video: 'linear-gradient(135deg, #FDE8E8, #E2B6B6)', // Morandi coral pink
    song: 'linear-gradient(135deg, #EBF3F9, #C1D5E5)', // Morandi powder blue
    export: 'linear-gradient(135deg, #FAF2E3, #E6D0B0)', // Morandi warm beige
    reading: 'linear-gradient(135deg, #EFF4EF, #C3D5C0)', // Morandi pale green
    netease: 'linear-gradient(135deg, #FAECEC, #DEB8B8)', // Morandi red
    diarybook: 'linear-gradient(135deg, #F2EBF9, #CDBCDF)', // Morandi lavender
    chat: 'linear-gradient(135deg, #EBF7F2, #B3DCBE)', // Morandi sage green
    group: 'linear-gradient(135deg, #EAF3F9, #ADCDE1)', // Morandi steel blue
    model: 'linear-gradient(135deg, #F4EDFA, #CCB9DE)', // Morandi iris violet
    backup: 'linear-gradient(135deg, #FAF5ED, #E6D5BD)', // Morandi clay
    codeanalyzer: 'linear-gradient(135deg, #E6EEF4, #B0C4DE)', // Morandi soft steel blue
    create: 'linear-gradient(135deg, #FDECE6, #F1CDBE)', // Morandi peach
    memory: 'linear-gradient(135deg, #F4EDFA, #CCB9DE)', // Morandi iris violet
    moments: 'linear-gradient(135deg, #FFF0F5, #FFD1DC)', // Morandi soft pink
  };

  const iconHtml=it=>{
    const inner=(it.icon||'').startsWith('data:')?`<img src="${it.icon}">`:`<span>${it.icon||'📦'}</span>`;
    const grad = gradients[it.id] || 'linear-gradient(135deg, #FFFFFF, #EBEBEB)';
    return `<div class="lc-item" onclick="launcherOpen('${it.action}')" oncontextmenu="launcherEditIcon(event,'${it.id}')"><div class="lc-ico" style="background: ${grad}">${inner}</div><div class="lc-label">${it.label}</div></div>`;
  };
  const cfg=launcherShowConfig()?`
    <div class="lc-config" id="lcConfig">
      <button class="lc-config-close" onclick="launcherHideConfig()" title="隐藏（可在设置重新调出）">◈</button>
      <div class="lc-config-title">当前配置</div>
      <div class="lc-config-row">模型：${(typeof selectedModelName!=='undefined'&&selectedModelName)||'未选择'}</div>
      <div class="lc-config-row">上下文：${getContextLimit()===Infinity?'不限制':'最近 '+getContextLimit()+' 条'}</div>
      <div class="lc-config-row">流式输出：${streamEnabled()?'开启':'关闭'}</div>
      <div class="lc-config-row">字号：${localStorage.getItem('font_size')||'15'}px</div>
    </div>`:'';
  root.innerHTML=`
    <div class="lc-top">
      <div class="lc-time">${time}</div>
      <div class="lc-date">${date}</div>
      <div class="lc-searchbox" onclick="launcherOpen('search')">🔍 搜索聊天记录</div>
    </div>
    <div class="lc-grid">${grid.map(iconHtml).join('')}</div>
    ${cfg}
    <div class="lc-dock">${dock.map(iconHtml).join('')}</div>`;
}

/* 打开/隐藏启动器 */
function showLauncher(){buildLauncher();document.getElementById('launcher').classList.add('show');document.querySelector('.chat-app').classList.add('behind');}
function hideLauncher(){document.getElementById('launcher').classList.remove('show');document.querySelector('.chat-app').classList.remove('behind');}
function launcherHideConfig(){localStorage.setItem('launcher_show_config','false');const c=document.getElementById('lcConfig');if(c)c.remove();}

/* 图标动作分发 */
function launcherOpen(action){
  if (typeof triggerHaptic === 'function') triggerHaptic('light');
  hideLauncher();
  switch(action){
    case 'chat':
      if (typeof switchMainTab === 'function') {
        switchMainTab('chat');
      }
      break;
    case 'create':
      if (typeof switchMainTab === 'function') {
        switchMainTab('create');
      }
      break;
    case 'memory':
      if (typeof switchMainTab === 'function') {
        switchMainTab('memory');
      }
      break;
    case 'moments':
      if (typeof switchMainTab === 'function') {
        switchMainTab('moments');
      }
      break;
    case 'group':
      if(typeof openGroupChat==='function') {
        openGroupChat();
      } else {
        showToast('正在加载群聊及群模型模块...');
        Promise.all([
          window.LazyLoader.load('js/group.js?v=20260708'),
          window.Runtime.ensureGroupModel()
        ]).then(() => {
          if (typeof openGroupChat === 'function') openGroupChat();
        }).catch(err => showToast('加载群聊模块失败', 'error'));
      }
      break;
    case 'diary':
      if(typeof openDiary==='function') {
        openDiary();
      } else {
        showToast('正在加载本地日记模块...');
        window.LazyLoader.load('js/diary.js?v=20260708').then(() => {
          if (typeof openDiary === 'function') openDiary();
        }).catch(err => showToast('加载日记模块失败', 'error'));
      }
      break;
    case 'song':
      if(typeof openSongCraft==='function' && songEnabled()) {
        openSongCraft();
      } else {
        showToast('正在加载音乐及歌曲创作模块...');
        Promise.all([
          window.LazyLoader.load('js/music.js?v=20260708'),
          window.LazyLoader.load('js/songcraft.js?v=20260708')
        ]).then(() => {
          if (songEnabled()) {
            if (typeof openSongCraft === 'function') openSongCraft();
          } else {
            showToast('请先在设置开启歌曲创作');
            openSettings();
            settingsMode='song';
            renderProviderList();
            if(typeof renderSongSettings==='function') renderSongSettings();
          }
        }).catch(err => showToast('加载音乐模块失败', 'error'));
      }
      break;
    case 'ebook':
      if(typeof openEbook==='function') {
        openEbook();
      } else {
        showToast('正在加载陪伴阅读模块...');
        window.LazyLoader.load('js/ebook.js?v=20260708').then(() => {
          if (typeof openEbook === 'function') openEbook();
        }).catch(err => showToast('加载阅读模块失败', 'error'));
      }
      break;
    case 'video':showToast('生成视频功能暂未开放');break;
    case 'model':openSettings();settingsMode='provider';selectProvider(currentProviderId);break;
    case 'memo':openMemo();break;
    case 'image':
      if(imgEnabled()) {
        if (typeof openImgGen === 'function') openImgGen();
        else {
          showToast('正在加载AI生图模块...');
          window.LazyLoader.load('js/imagegen.js?v=20260708').then(() => {
            if (typeof openImgGen === 'function') openImgGen();
          });
        }
      } else {
        showToast('正在加载AI生图模块...');
        window.LazyLoader.load('js/imagegen.js?v=20260708').then(() => {
          showToast('生图未开启');
          openSettings();
          settingsMode='image';
          renderProviderList();
          renderImageSettings();
        }).catch(err => showToast('加载生图模块失败', 'error'));
      }
      break;
    case 'music':
      if (typeof renderMusicSettings === 'function') {
        openSettings();
        settingsMode='music';
        renderProviderList();
        renderMusicSettings();
      } else {
        showToast('正在加载音乐播放模块...');
        window.LazyLoader.load('js/music.js?v=20260708').then(() => {
          openSettings();
          settingsMode='music';
          renderProviderList();
          if (typeof renderMusicSettings === 'function') renderMusicSettings();
        }).catch(err => showToast('加载音乐模块失败', 'error'));
      }
      break;
    case 'search':toggleSearch();break;
    case 'call':startCall();break;
    case 'memory':openSettings();settingsMode='memory';renderProviderList();renderMemorySettings();break;
    case 'worldbook':
      showToast('正在加载世界设定与世界书...');
      window.Runtime.ensureWorldModel().then(() => {
        openSettings();
        settingsMode='persona';
        window.personaActiveTab='prompts';
        renderProviderList();
        if(typeof renderPersonaSettings==='function') renderPersonaSettings();
      }).catch(err => showToast('加载世界书失败', 'error'));
      break;
    case 'backup':exportChat();break;
    case 'clear':clearChat();break;
    case 'settings':openSettings();break;
    case 'codeanalyzer':
      if(typeof openCodeAnalyzer==='function') {
        openCodeAnalyzer();
      } else {
        showToast('正在加载代码库分析与项目关联模块...');
        Promise.all([
          window.LazyLoader.load('js/project-context.js?v=20260714'),
          window.LazyLoader.load('js/code-analyzer.js?v=20260714')
        ]).then(() => {
          if (typeof openCodeAnalyzer === 'function') openCodeAnalyzer();
        }).catch(err => showToast('加载代码分析模块失败', 'error'));
      }
      break;
    default:break;
  }
}

/* 右键/长按编辑单个图标（改 emoji 或上传图片） */
let _editIconId=null;
function launcherEditIcon(e,id){
  e.preventDefault();
  _editIconId=id;
  const choice=prompt('自定义图标：输入一个 emoji 直接用；输入 img 则上传本地图片；留空取消','');
  if(choice===null||choice==='')return;
  if(choice.trim().toLowerCase()==='img'){document.getElementById('launcherIconInput').click();return;}
  const list=getLauncherIcons();const it=list.find(x=>x.id===id);if(it){it.icon=choice.trim();saveLauncherIcons(list);buildLauncher();}
}
function handleLauncherIcon(input){
  const f=input.files[0];if(!f||!_editIconId)return;
  const r=new FileReader();
  r.onload=async e=>{const small=await compressImage(e.target.result,128,0.85);const list=getLauncherIcons();const it=list.find(x=>x.id===_editIconId);if(it){it.icon=small;saveLauncherIcons(list);buildLauncher();showToast('✅ 图标已更新');}};
  r.readAsDataURL(f);input.value='';
}

/* 设置页：启动器外观 */
function renderLauncherSettings(){settingsMode='launcher';document.getElementById('detailTitle').innerHTML='🖼️ 桌面外观';const bg=launcherBg();document.getElementById('detailBody').innerHTML=`
    <div class="form-group"><label class="form-label">桌面背景图片</label><div class="bg-preview" style="${bg?`background-image:url(${bg})`:''}" onclick="document.getElementById('launcherBgInput').click()">${bg?'':'点击上传桌面背景'}</div>${bg?`<div class="avatar-clear" style="margin-top:4px;" onclick="clearLauncherBg()">清除背景</div>`:''}</div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">📋 显示「当前配置」卡片</div></div><label class="switch"><input type="checkbox" ${launcherShowConfig()?'checked':''} onchange="setBool('launcher_show_config',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="form-hint" style="margin-top:8px;line-height:1.7;">桌面图标：在桌面上长按（手机）或右键（电脑）某个图标即可换成 emoji 或本地图片。</div>
    <div class="action-buttons"><button class="btn btn-info" onclick="closeSettings();showLauncher();">🏠 预览桌面</button><button class="btn btn-warning" onclick="resetLauncher()">↺ 重置图标</button></div>`;}
function handleLauncherBg(input){const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=async e=>{const small=await compressImage(e.target.result,1280,0.82);try{localStorage.setItem('launcher_bg',small);renderLauncherSettings();showToast('✅ 桌面背景已更新');}catch(err){alert('图片太大');}};r.readAsDataURL(f);input.value='';}
function clearLauncherBg(){localStorage.removeItem('launcher_bg');renderLauncherSettings();}
function resetLauncher(){if(confirm('重置桌面图标为默认？')){localStorage.removeItem('launcher_icons');showToast('✅ 已重置');}}
