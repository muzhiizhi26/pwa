/* ===== 服务商核心 ===== */
function loadProviders(){let s=localStorage.getItem('ai_providers');if(s){try{providers=JSON.parse(s);}catch(e){providers=[];}}if(!providers.length){providers=JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));}providers=providers.filter(p=>p.id!=='gemini_proxy'&&p.id!=='openai'&&p.id!=='claude');const fi=providers.findIndex(p=>p.id==='free');if(fi>=0)providers[fi]=JSON.parse(JSON.stringify(FREE_PROVIDER));else providers.unshift(JSON.parse(JSON.stringify(FREE_PROVIDER)));saveProviders();}
function saveProviders(){localStorage.setItem('ai_providers',JSON.stringify(providers));}
function loadSettings(){currentProviderId=localStorage.getItem('current_provider')||'free';selectedModelName=localStorage.getItem('selected_model')||'';let p=getProvider(currentProviderId);if(!p){currentProviderId=providers[0]?.id||'free';p=getProvider(currentProviderId);selectedModelName='';}if(p?.models.length&&!selectedModelName)selectedModelName=p.models[0].name;}
function saveSettings(){localStorage.setItem('current_provider',currentProviderId);localStorage.setItem('selected_model',selectedModelName);}
function getProvider(id){return providers.find(p=>p.id===id);}
function getCurrentProvider(){return getProvider(currentProviderId)||providers[0];}
function updateModelCard(){const b=document.getElementById('modelCardBtn');let icon='🧠';const p=getProvider(currentProviderId);if(p)icon=p.icon||'🧠';b.textContent=icon;b.title='当前模型：'+(selectedModelName||'未选择')+'（点击切换）';}
function toggleModelPopover(e){e&&e.stopPropagation();const pop=document.getElementById('modelPopover');const btn=document.getElementById('modelCardBtn');if(pop.classList.contains('show')){pop.classList.remove('show');btn.classList.remove('model-active');return;}pop.innerHTML='';providers.forEach(p=>p.models.forEach(m=>{const d=document.createElement('div');d.className='mp-item'+(p.id===currentProviderId&&m.name===selectedModelName?' sel':'');d.innerHTML=`<span>${p.icon}</span><span>${m.name}</span>`;d.onclick=()=>{currentProviderId=p.id;selectedModelName=m.name;saveSettings();updateModelCard();pop.classList.remove('show');btn.classList.remove('model-active');};pop.appendChild(d);}));pop.classList.add('show');btn.classList.add('model-active');}

/* ===== Token 估算 / 压缩 ===== */
function parseLimitNum(s){if(!s)return 0;s=String(s).trim().toUpperCase();const m=parseFloat(s);if(isNaN(m))return 0;if(s.includes('M'))return Math.round(m*1000000);if(s.includes('K'))return Math.round(m*1000);return Math.round(m);}
function estTokens(text){if(!text)return 0;let t=0;for(const ch of String(text)){if(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch))t+=1;else t+=0.3;}return Math.ceil(t);}
function fmtTok(n){if(n>=1000000)return (n/1000000).toFixed(1)+'M';if(n>=1000)return (n/1000).toFixed(n>=10000?0:1)+'K';return String(n);}
function getModelLimit(){const p=getCurrentProvider();const m=p.models.find(x=>x.name===selectedModelName);return parseLimitNum(m&&m.context)||128000;}
function contextTokens(){const ctx=ctxSlice(conversationHistory).filter(m=>!m.image);let t=estTokens(localStorage.getItem('systemPrompt')||DEFAULT_PROMPT);for(const m of ctx)t+=estTokens(m.content);return t;}
let tokenPanelOpen=false;
function openTokenPanel(){document.getElementById('actionMenu').classList.remove('show');tokenPanelOpen=true;const chk=document.getElementById('autoCompressChk');if(chk)chk.checked=localStorage.getItem('auto_compress')==='true';renderTokenBody();document.getElementById('tokenPanel').classList.add('show');}
function renderTokenBody(){const inp=document.getElementById('messageInput');const cur=estTokens(inp?inp.value:'');const ctxT=contextTokens();const ctx=ctxSlice(conversationHistory).filter(m=>!m.image);const lim=getModelLimit();const total=cur+ctxT;document.getElementById('tokenBody').innerHTML=`
   <div class="stat-box"><span>当前输入</span><b>${fmtTok(cur)}</b></div>
   <div class="stat-box"><span>上下文</span><b>${fmtTok(ctxT)}</b></div>
   <div class="stat-box"><span>上下文消息数</span><b>${ctx.length}${getContextLimit()===Infinity?'（不限制）':''}</b></div>
   <div class="stat-box"><span>总计</span><b>${fmtTok(total)}</b></div>
   <div class="stat-box"><span>模型限制</span><b>${fmtTok(lim)}</b></div>
   <div class="form-hint">估算为粗略值（中文≈1/字，英文≈0.3/字）。${total>lim*0.8?'<br><b style="color:#B07">⚠️ 接近模型上限，建议压缩对话</b>':''}</div>`;}
function openCompressDialog(){document.getElementById('actionMenu').classList.remove('show');document.getElementById('compressPanel').classList.add('show');}
async function doCompress(){document.getElementById('compressPanel').classList.remove('show');await compressConversation(false);}
async function compressConversation(silent){const real=conversationHistory.filter(m=>!m.compressed);if(real.length<4){if(!silent)showToast('对话太短，无需压缩');return;}const provider=getCurrentProvider();const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';if(!apiKey&&provider.auth!=='none'){if(!silent)alert('请先在设置中配置 API Key');return;}if(!silent)showToast('🗜️ 正在压缩对话...');const convText=conversationHistory.filter(m=>!m.image).map(m=>`${m.role==='user'?'用户':'AI'}：${m.content}`).join('\n');const sysP='你是对话摘要助手。请把以下对话压缩成一段信息完整但简洁的中文摘要，必须保留：关键事实、用户偏好与设定、重要结论、未完成事项、情感基调。用第三人称陈述，不要加入多余开场白。';let url=provider.endpoint.replace(/\/+$/,'');if(!url.includes('/chat/completions')&&!url.includes('messages'))url+='/chat/completions';const headers={'Content-Type':'application/json'};if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${apiKey}`;else if(provider.auth==='x-api-key')headers['x-api-key']=apiKey;else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=apiKey;try{const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({model:selectedModelName,messages:[{role:'system',content:sysP},{role:'user',content:convText}],stream:false})});if(!r.ok)throw new Error('API '+r.status);const d=await r.json();const summary=(d.choices?.[0]?.message?.content||d.content?.[0]?.text||'').trim();if(!summary){if(!silent)showToast('压缩失败：无摘要返回');return;}const uid=genUid();const ts=Date.now();conversationHistory=[{role:'assistant',content:'【对话摘要·已压缩】\n'+summary,uid,ts,compressed:true}];saveHistory();rerenderAll();memorize('assistant','对话摘要：'+summary,'');showToast('✅ 已压缩并开启新会话');}catch(e){if(!silent)showToast('压缩失败：'+e.message);}}
function maybeAutoCompress(){if(localStorage.getItem('auto_compress')!=='true')return;const lim=getModelLimit();if(contextTokens()>lim*0.6){compressConversation(true);}}

/* ===== 设置面板 ===== */
function openSettings(){
  try {
    document.getElementById('settingsOverlay').classList.add('show');
    settingsMode='general';
    renderProviderList();
    renderGeneralSettings();
  } catch (err) {
    console.error('打开设置失败 Error opening settings:', err);
    alert('打开设置失败：' + err.message + '\n' + err.stack);
  }
}
function closeSettings(){saveCurrentSection(true);document.getElementById('settingsOverlay').classList.remove('show');}
function closeSettingsOnOverlay(e){if(e.target===document.getElementById('settingsOverlay'))closeSettings();}
function renderProviderList(){const list=document.getElementById('providerList');list.innerHTML='';[['general','⚙️','通用设置'],
 ['launcher','🖼️','桌面外观'],
 ['persona','🎭','人格与设定'],
 ['memory','🧠','记忆与情绪'],
 ['attention','🎯','注意力沙盘'],
 ['rhythm','🌬️','对话节奏沙盘'],
 ['chronicle','📜','编年史与失败记忆'],
 ['evolution','🎭','人格演化'],
 ['proactive','💌','主动消息'],
 ['voice','🔊','语音设置'],
 ['image','🎨','生图设置'],
 ['song','🎼','歌曲创作'],
 ['music','🎵','在线音乐'],
 ['group','👥','群聊设置'],
 ['websearch','🌐','联网功能'],
 ['inspector','🛠️','运行期沙盘 (Inspector)']].forEach(([m,ic,nm])=>{const d=document.createElement('div');d.className=`sidebar-item ${settingsMode===m?'active':''}`;d.innerHTML=`<span class="sidebar-item-icon">${ic}</span><span class="sidebar-item-name">${nm}</span>`;d.onclick=()=>{
  saveCurrentSection(true);
  settingsMode=m;renderProviderList();
 const map={general:renderGeneralSettings,launcher:typeof renderLauncherSettings==='function'?renderLauncherSettings:null,persona:typeof renderPersonaSettings==='function'?renderPersonaSettings:null,memory:renderMemorySettings,attention:typeof renderAttentionSettings==='function'?renderAttentionSettings:null,rhythm:(typeof RhythmEngine!=='undefined'&&typeof RhythmEngine.renderRhythmDashboard==='function')?()=>RhythmEngine.renderRhythmDashboard():null,chronicle:(typeof NarrativeManager!=='undefined'&&typeof NarrativeManager.renderChronicleDashboard==='function')?()=>NarrativeManager.renderChronicleDashboard():null,evolution:typeof renderEvolutionSettings==='function'?renderEvolutionSettings:null,proactive:renderProactiveSettings,voice:renderVoiceSettings,image:renderImageSettings,song:typeof renderSongSettings==='function'?renderSongSettings:null,music:typeof renderMusicSettings==='function'?renderMusicSettings:null,group:typeof renderGroupSettings==='function'?renderGroupSettings:null,websearch:renderWebSettings,inspector:typeof renderRuntimeInspector==='function'?renderRuntimeInspector:null};
const fn=map[m];
if(typeof fn==='function')fn();
else document.getElementById('detailBody').innerHTML='<div class="form-hint">该模块未加载，请检查对应 JS 文件是否报错。</div>';
};list.appendChild(d);});providers.forEach(p=>{const item=document.createElement('div');item.className=`sidebar-item ${settingsMode==='provider'&&p.id===currentProviderId?'active':''}`;const del=p.locked?'<span class="sidebar-item-lock">🔒</span>':`<button class="sidebar-item-del" onclick="deleteProvider(event,'${p.id}')">✕</button>`;item.innerHTML=`<span class="sidebar-item-icon">${p.icon}</span><span class="sidebar-item-name">${p.name}</span>${del}`;item.onclick=(e)=>{if(!e.target.closest('.sidebar-item-del'))selectProvider(p.id);};list.appendChild(item);});}
function renderGeneralSettings(){settingsMode='general';document.getElementById('detailTitle').innerHTML='⚙️ 通用设置';const fs=localStorage.getItem('font_size')||'15';const te=localStorage.getItem('temp_enabled')==='true',tv=localStorage.getItem('temperature')||'1';const pe=localStorage.getItem('top_p_enabled')==='true',pv=localStorage.getItem('top_p')||'1';const bg=localStorage.getItem('chat_bg');const cl=getContextLimit();const clTxt=cl===Infinity?'不限制':cl+' 条';const clSliderVal=cl===Infinity?60:Math.min(cl,60);document.getElementById('detailBody').innerHTML=`
    <div class="form-hint" style="margin-bottom: 14px; padding: 10px; border-radius: 8px; border: 1px dashed var(--border); background: var(--bg-hover); color: var(--text-sub); font-size: 11.5px; line-height: 1.5;">💡 <b>提示：</b>AI 昵称、我的昵称、双方头像、长期档案及世界书设定，已统一合并至左侧 <b>🎭 人格与设定</b> 入口中进行一站式管理。</div>
    <div class="form-group" style="margin-top:12px;">
      <label class="form-label">🎨 莫兰迪主题色系</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <select class="form-input" id="themePresetSelect" style="flex:1;" onchange="onThemePresetChange(this.value)">
          <option value="morandi_oat" ${localStorage.getItem('theme_preset')==='morandi_oat'||!localStorage.getItem('theme_preset')?'selected':''}>🌾 古典燕麦 (默认)</option>
          <option value="morandi_matcha" ${localStorage.getItem('theme_preset')==='morandi_matcha'?'selected':''}>🍃 抹茶青绿</option>
          <option value="morandi_sunset" ${localStorage.getItem('theme_preset')==='morandi_sunset'?'selected':''}>🍑 暮色柔桃</option>
          <option value="morandi_lilac" ${localStorage.getItem('theme_preset')==='morandi_lilac'?'selected':''}>🌸 温柔丁香</option>
          <option value="morandi_mist" ${localStorage.getItem('theme_preset')==='morandi_mist'?'selected':''}>🌊 静谧北欧</option>
          <option value="custom" ${localStorage.getItem('theme_preset')==='custom'?'selected':''}>🎨 自定义主题色</option>
        </select>
        <div id="customThemeColorArea" style="display: ${localStorage.getItem('theme_preset')==='custom'?'flex':'none'}; align-items:center; gap:6px;">
          <input type="color" id="customAccentPicker" value="${localStorage.getItem('theme_custom_accent')||'#D9CEC3'}" oninput="onCustomAccentChange(this.value)" style="width:36px; height:36px; border:1.5px solid var(--border); border-radius:50%; padding:0; cursor:pointer; overflow:hidden; background:transparent;">
          <span style="font-size:11px; color:var(--text-sub);">点击调色</span>
        </div>
      </div>
    </div>
    <div class="form-group" style="margin-top:12px;"><label class="form-label">聊天背景图片</label><div class="bg-preview" style="${bg?`background-image:url(${bg})`:''}" onclick="document.getElementById('bgInput').click()">${bg?'':'点击上传背景图片'}</div>${bg?`<div class="avatar-clear" style="margin-top:4px;" onclick="clearBg()">清除背景</div>`:''}</div>
    <div class="switch-row" style="margin-top:12px;"><div class="switch-info"><div class="switch-label">⚡ 流式输出</div></div><label class="switch"><input type="checkbox" ${streamEnabled()?'checked':''} onchange="setBool('stream_output',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">💭 显示思考过程</div></div><label class="switch"><input type="checkbox" ${showThinkingEnabled()?'checked':''} onchange="setBool('show_thinking',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🕐 AI 时间感知</div><div class="switch-desc">注入时段/季节/工作日·周末/距上次对话间隔</div></div><label class="switch"><input type="checkbox" ${timeAwareEnabledFn()?'checked':''} onchange="setBool('time_aware',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">📖 阅读陪伴（注入当前章节给AI）</div><div class="switch-desc">开启后聊天时 AI 知道你在读哪一章，可讨论剧情</div></div><label class="switch"><input type="checkbox" ${localStorage.getItem('ebook_companion')!=='false'?'checked':''} onchange="setBool('ebook_companion',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">📔 AI 主动写日记</div><div class="switch-desc">默认关闭。开启后每晚 AI 会主动写一篇（当天有聊天时）</div></div><label class="switch"><input type="checkbox" ${localStorage.getItem('diary_auto')==='true'?'checked':''} onchange="setBool('diary_auto',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🔄 每日自动备份</div><div class="switch-desc">默认关闭</div></div><label class="switch"><input type="checkbox" ${autoBackupEnabled()?'checked':''} onchange="setBool('auto_backup',this.checked)"><span class="switch-slider"></span></label></div>

    <div class="slider-row"><div class="slider-head"><span class="slider-label">💬 上下文消息数量上限</span><span class="slider-value" id="ctxLimitVal">${clTxt}</span></div><input type="range" min="2" max="60" step="1" value="${clSliderVal}" oninput="setContextLimit(this.value)"><div class="form-hint">拉到最右 = 不限制。聊天记录本地保存不受此限制。</div></div>
    <div class="slider-row"><div class="slider-head"><span class="slider-label">🔤 字号</span><span class="slider-value" id="fontVal">${fs}px</span></div><input type="range" min="12" max="22" step="1" value="${fs}" oninput="setFontSize(this.value)"></div>
    <div class="slider-row"><div class="slider-head"><span class="slider-label"><label class="switch" style="width:34px;height:18px;"><input type="checkbox" ${te?'checked':''} onchange="toggleTemp(this.checked)"><span class="switch-slider"></span></label> 🌡️ 温度</span><span class="slider-value" id="tempVal">${te?tv:'未设置'}</span></div><input type="range" id="tempSlider" min="0" max="2" step="0.1" value="${tv}" ${te?'':'disabled'} oninput="setTemp(this.value)"></div>
    <div class="slider-row"><div class="slider-head"><span class="slider-label"><label class="switch" style="width:34px;height:18px;"><input type="checkbox" ${pe?'checked':''} onchange="toggleTopP(this.checked)"><span class="switch-slider"></span></label> 🎯 Top P</span><span class="slider-value" id="topPVal">${pe?pv:'未设置'}</span></div><input type="range" id="topPSlider" min="0" max="1" step="0.05" value="${pv}" ${pe?'':'disabled'} oninput="setTopP(this.value)"></div>
    <div class="switch-row">
      <div class="switch-info">
        <div class="switch-label">🏠 启动时显示桌面</div>
        <div class="switch-desc">打开应用时直接展示快捷面板</div>
      </div>
      <label class="switch">
        <input type="checkbox" ${localStorage.getItem('launcher_enabled')==='true'?'checked':''} onchange="setBool('launcher_enabled',this.checked)">
        <span class="switch-slider"></span>
      </label>
    </div> 
    <div class="action-buttons"><button class="btn btn-warning" onclick="exportChat()">📥 导出记录</button><button class="btn btn-danger" onclick="clearChat()">🗑️ 清对话</button><button class="btn btn-info" onclick="resetProviders()">⟳ 重置服务商</button></div>
    <div class="action-buttons" style="margin-top: 10px; gap: 8px;">
      <button class="btn btn-success" style="background:#28a745;color:white;border:none;" onclick="exportAllDataJSON()">💾 备份完整配置与聊天 (JSON)</button>
      <button class="btn btn-secondary" style="background:#546e7a;color:white;border:none;" onclick="triggerFullRecoveryImport()">🔄 恢复备份 (JSON/TXT/MD)</button>
      <input type="file" id="recoveryFileInputBtn" style="display:none;" onchange="handleRecoveryFileInputBtn(this)">
    </div>`;
}

function setContextLimit(v){const n=parseInt(v);if(n>=60){localStorage.setItem('context_limit','unlimited');document.getElementById('ctxLimitVal').textContent='不限制';}else{localStorage.setItem('context_limit',String(n));document.getElementById('ctxLimitVal').textContent=n+' 条';}}

function renderPersonaSettings() {
  settingsMode = 'persona';
  window.personaActiveTab = window.personaActiveTab || 'prompts';
  document.getElementById('detailTitle').innerHTML = '🎭 人格、设定与提示词';
  
  const sp = localStorage.getItem('systemPrompt') || DEFAULT_PROMPT;
  const worldBook = localStorage.getItem('world_book') || '你叫「小艾」，是用户的贴心伴侣，性格温柔体贴、善解人意。';
  const aiName = localStorage.getItem('ai_name') || '主AI';
  const aiAv = localStorage.getItem('ai_avatar');
  const userAv = localStorage.getItem('user_avatar');
  const profile = getLongTermProfile();
  
  let members = [];
  if (typeof getGroupMembers === 'function') {
    members = getGroupMembers();
  }

  const provOpts = (sel) => providers.map(p => p.models.map(mo => `<option value="${p.id}||${mo.name}" ${sel === p.id + '||' + mo.name ? 'selected' : ''}>${p.icon} ${mo.name}</option>`).join('')).join('');

  // Tabs Header
  let html = `
    <div class="persona-tabs" style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
      <button class="btn" style="flex: 1; padding: 8px 6px; font-size: 12px; border-radius: 8px; border: 1.5px solid ${window.personaActiveTab==='prompts'?'var(--accent)':'var(--border)'}; background: ${window.personaActiveTab==='prompts'?'var(--accent)':'transparent'}; color: ${window.personaActiveTab==='prompts'?'var(--bg)':'var(--text-main)'}; font-weight: 500;" onclick="switchPersonaTab('prompts')">🌌 提示词与世界书</button>
      <button class="btn" style="flex: 1; padding: 8px 6px; font-size: 12px; border-radius: 8px; border: 1.5px solid ${window.personaActiveTab==='profiles'?'var(--accent)':'var(--border)'}; background: ${window.personaActiveTab==='profiles'?'var(--accent)':'transparent'}; color: ${window.personaActiveTab==='profiles'?'var(--bg)':'var(--text-main)'}; font-weight: 500;" onclick="switchPersonaTab('profiles')">👤 主AI与我的档案</button>
      <button class="btn" style="flex: 1; padding: 8px 6px; font-size: 12px; border-radius: 8px; border: 1.5px solid ${window.personaActiveTab==='sub_ais'?'var(--accent)':'var(--border)'}; background: ${window.personaActiveTab==='sub_ais'?'var(--accent)':'transparent'}; color: ${window.personaActiveTab==='sub_ais'?'var(--bg)':'var(--text-main)'}; font-weight: 500;" onclick="switchPersonaTab('sub_ais')">👥 副AI与群成员</button>
    </div>
  `;

  if (window.personaActiveTab === 'prompts') {
    html += `
      <div class="model-section-header" style="display:flex; justify-content:space-between; align-items:center;">
        <span>🌌 核心系统提示词 (System Prompt)</span>
      </div>
      <div class="form-group">
        <textarea class="form-input" id="personaSystemPrompt" rows="6" placeholder="输入系统提示词...">${sp}</textarea>
        <div class="form-hint">AI 伴侣的核心表达框架与通用约束。修改此提示词会即时影响所有会话对话。</div>
      </div>

      <div class="model-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-top: 16px;">
        <span>📖 世界书设定 (World Book)</span>
        <button class="btn btn-success" style="padding:4px 10px; font-size:11px; border-radius:8px; background:#EAD5CD; color:#8B5A4B; border:none; cursor:pointer;" onclick="polishWorldBookFromPersona()">🪄 AI 润色人设</button>
      </div>
      <div class="form-group">
        <textarea class="form-input" id="personaWorldBook" rows="8" placeholder="例如：你叫「小艾」，是一个温柔体贴、知性、善解人意的女友...">${worldBook}</textarea>
        <div class="form-hint">主AI独享的角色人设与世界观背景。可在下方点击“主AI与我的档案”设置具体昵称。</div>
      </div>
    `;
  } else if (window.personaActiveTab === 'profiles') {
    html += `
      <div class="model-section-header"><span>🤖 主 AI 角色属性</span></div>
      <div class="avatar-upload-row" style="margin-bottom: 12px;">
        <div class="avatar-upload-item">
          <div class="avatar-preview" onclick="document.getElementById('aiAvatarInput').click()">${aiAv ? `<img src="${aiAv}">` : '🤖'}</div>
          <div class="avatar-caption">主AI 头像</div>
          ${aiAv ? `<div class="avatar-clear" onclick="clearAvatar('ai'); setTimeout(renderPersonaSettings, 100);">清除</div>` : '<div class="avatar-caption" style="color:var(--text-light)">默认随情绪</div>'}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">👤 主AI名称 (昵称)</label>
        <input type="text" class="form-input" id="personaAiName" value="${aiName}" placeholder="例如：小艾" oninput="saveMainAiName(this.value, true)" onchange="saveMainAiName(this.value)">
      </div>

      <div class="form-group" style="margin-top: 12px;">
        <label class="form-label">💞 当前关系阶段</label>
        <select class="form-input" onchange="localStorage.setItem('relationship_stage',this.value);renderMemoryPanelIfOpen();">
          <option value="acquaintance" ${getRelationshipStage()==='acquaintance'?'selected':''}>初识</option>
          <option value="friend" ${getRelationshipStage()==='friend'?'selected':''}>朋友</option>
          <option value="crush" ${getRelationshipStage()==='crush'?'selected':''}>暧昧</option>
          <option value="lover" ${getRelationshipStage()==='lover'?'selected':''}>恋人</option>
          <option value="partner" ${getRelationshipStage()==='partner'?'selected':''}>亲密伴侣</option>
        </select>
        <div class="form-hint">AI 会根据对话和亲密互动自动推进关系，你也可以在此手动调整。</div>
      </div>

      <div class="model-section-header" style="margin-top: 20px;"><span>👤 用户档案与长期记忆</span></div>
      <div class="avatar-upload-row" style="margin-bottom: 12px;">
        <div class="avatar-upload-item">
          <div class="avatar-preview" onclick="document.getElementById('userAvatarInput').click()">${userAv ? `<img src="${userAv}">` : '🙂'}</div>
          <div class="avatar-caption">我的头像</div>
          ${userAv ? `<div class="avatar-clear" onclick="clearAvatar('user'); setTimeout(renderPersonaSettings, 100);">清除</div>` : ''}
        </div>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label">👤 我的名称 (昵称)</label>
        <input type="text" class="form-input" id="personaUserNickname" value="${localStorage.getItem('user_nickname') || '用户'}" placeholder="输入 AI 对你的昵称称呼..." oninput="localStorage.setItem('user_nickname', this.value.trim() || '用户');" onchange="localStorage.setItem('user_nickname', this.value.trim() || '用户'); if(typeof renderBrandAvatar === 'function') renderBrandAvatar();">
      </div>
      <div class="form-group">
        <label class="form-label">🗂️ 长期记忆档案（固定注入·最高优先级）</label>
        <textarea class="form-input" id="personaLtProfile" rows="6" placeholder="例如：\n- 用户叫小林\n- 生日 5月20日\n- 讨厌香菜">${profile}</textarea>
        <div class="form-hint">每次私聊对话都会无条件携带这些背景记忆。</div>
      </div>

      <div class="switch-row" style="margin-top: 8px;">
        <div class="switch-info">
          <div class="switch-label">🤖 长期档案自动更新</div>
          <div class="switch-desc">从聊天中自动识别关键信息并由 AI 智能合并更新到档案中</div>
        </div>
        <label class="switch">
          <input type="checkbox" ${localStorage.getItem('lt_auto')!=='false'?'checked':''} onchange="setBool('lt_auto',this.checked)">
          <span class="switch-slider"></span>
        </label>
      </div>
    `;
  } else if (window.personaActiveTab === 'sub_ais') {
    const subRows = members.map((m, i) => `
      <div class="model-card" style="flex-direction:column; align-items:stretch; gap:6px; padding:12px; margin-bottom: 12px; border: 1.5px solid var(--border); border-radius: 12px; background: var(--bg-card);">
        <div class="list-row" style="display: flex; gap: 8px; align-items: center;">
          <div class="avatar-preview" style="width:40px; height:40px; flex-shrink:0;" onclick="pickGroupAvatar(${i})" title="点击上传头像">${(m.avatar || '').startsWith('data:') ? `<img src="${m.avatar}">` : `<span style="font-size:20px;">${m.avatar || '🤖'}</span>`}</div>
          <input type="text" class="form-input" value="${(m.avatar || '').startsWith('data:') ? '' : (m.avatar || '🤖')}" style="max-width:52px; text-align:center;" placeholder="emoji" onchange="editGroupMember(${i},'avatar',this.value); setTimeout(renderPersonaSettings, 100);" title="或填emoji">
          <input type="text" class="form-input" style="flex: 1;" value="${m.name}" onchange="editGroupMember(${i},'name',this.value); setTimeout(renderPersonaSettings, 100);">
          ${m.isMain ? '<span class="sidebar-item-lock" style="align-self:center; font-size:12px; color:var(--text-sub);">主AI🔒</span>' : `<button class="del-x" onclick="delGroupMemberFromPersona(${i})">✕</button>`}
        </div>
        ${m.isMain ? '<div class="form-hint" style="color:var(--text-sub);">主AI 人设在“提示词与世界书”中编辑。</div>' : `<textarea class="form-input" rows="2" placeholder="人设描述，在此输入该副 AI 的人设特征..." onchange="editGroupMember(${i},'persona',this.value)">${m.persona || ''}</textarea>`}
        
        ${m.isMain ? '' : `
        <div class="list-row" style="display:flex; align-items:center; gap:8px;">
          <span class="res-label" style="min-width:44px; font-size:12px; color:var(--text-sub);">气泡色</span>
          <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <button class="color-picker-btn color-picker-btn-p-${i}" onclick="document.getElementById('gpColorInput-p-${i}').click()" style="width:24px; height:24px; border:1px solid var(--border); border-radius:50%; background:${m.bubbleColor || '#E2E9E1'}; padding:0; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.15);"></button>
            <input type="color" id="gpColorInput-p-${i}" value="${m.bubbleColor || '#E2E9E1'}" oninput="const btn=document.querySelector('.color-picker-btn-p-${i}'); if(btn)btn.style.backgroundColor=this.value;" onchange="editGroupMember(${i},'bubbleColor',this.value)" style="display:none;">
            <span style="font-size:11px; color:var(--text-sub);">副AI群聊气泡背景</span>
          </div>
        </div>
        `}
        <div class="list-row" style="display:flex; align-items:center; gap:8px;"><span class="res-label" style="min-width:44px; font-size:12px; color:var(--text-sub);">模型</span><select class="form-input" style="flex:1;" onchange="editGroupMemberModel(${i},this.value)"><option value="">跟随默认</option>${provOpts((m.providerId && m.model) ? m.providerId + '||' + m.model : '')}</select></div>
        <div class="list-row" style="display:flex; align-items:center; gap:8px;"><span class="res-label" style="min-width:44px; font-size:12px; color:var(--text-sub);">音色</span><input type="text" class="form-input" style="flex:1;" value="${m.voice || ''}" placeholder="留空用默认AI音色" onchange="editGroupMember(${i},'voice',this.value)"><button class="del-x" style="background:var(--info); color:#3A3E4A; padding: 4px 8px;" onclick="groupCallMember('${m.id}')" title="打电话">📞</button></div>
        
        <details class="gp-advanced" style="margin-top: 6px; border-top: 1px dashed var(--border); padding-top: 4px;">
          <summary style="font-size: 11px; color: var(--text-sub); cursor: pointer; user-select: none; outline: none;">⚙️ 高级模型参数</summary>
          <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 6px; padding-left: 4px;">
            <div class="slider-row" style="margin: 2px 0; padding: 0; border: none; background: transparent; box-shadow: none;">
              <div class="slider-head" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="slider-label" style="font-size: 11px; display: flex; align-items: center; gap: 4px;">
                  <label class="switch" style="width:28px; height:16px; margin:0;"><input type="checkbox" ${m.contextLimitEnabled ? 'checked' : ''} onchange="toggleMemberCtxLimitFromPersona(${i}, this.checked)"><span class="switch-slider"></span></label>
                  上下文上限
                </span>
                <span class="slider-value" id="gpCtxLimitVal-p-${i}" style="font-size: 11px; font-weight: bold;">${m.contextLimitEnabled ? (m.contextLimit === 'unlimited' ? '不限制' : (m.contextLimit || 18) + ' 条') : '跟随群聊默认'}</span>
              </div>
              <input type="range" min="1" max="60" step="1" value="${m.contextLimit === 'unlimited' ? 60 : (m.contextLimit || 18)}" ${m.contextLimitEnabled ? '' : 'disabled'} oninput="setMemberCtxLimitFromPersona(${i}, this.value)" style="height: 4px; padding: 0; margin: 2px 0;">
            </div>
            <div class="slider-row" style="margin: 2px 0; padding: 0; border: none; background: transparent; box-shadow: none;">
              <div class="slider-head" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="slider-label" style="font-size: 11px; display: flex; align-items: center; gap: 4px;">
                  <label class="switch" style="width:28px; height:16px; margin:0;"><input type="checkbox" ${m.tempEnabled ? 'checked' : ''} onchange="toggleMemberTempFromPersona(${i}, this.checked)"><span class="switch-slider"></span></label>
                  温度
                </span>
                <span class="slider-value" id="gpTempVal-p-${i}" style="font-size: 11px; font-weight: bold;">${m.tempEnabled ? (m.temperature !== undefined ? m.temperature : '1.0') : '跟随默认'}</span>
              </div>
              <input type="range" min="0" max="2" step="0.1" value="${m.temperature !== undefined ? m.temperature : 1.0}" ${m.tempEnabled ? '' : 'disabled'} oninput="setMemberTempFromPersona(${i}, this.value)" style="height: 4px; padding: 0; margin: 2px 0;">
            </div>
            <div class="slider-row" style="margin: 2px 0; padding: 0; border: none; background: transparent; box-shadow: none;">
              <div class="slider-head" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="slider-label" style="font-size: 11px; display: flex; align-items: center; gap: 4px;">
                  <label class="switch" style="width:28px; height:16px; margin:0;"><input type="checkbox" ${m.topPEnabled ? 'checked' : ''} onchange="toggleMemberTopPFromPersona(${i}, this.checked)"><span class="switch-slider"></span></label>
                  Top P
                </span>
                <span class="slider-value" id="gpTopPVal-p-${i}" style="font-size: 11px; font-weight: bold;">${m.topPEnabled ? (m.top_p !== undefined ? m.top_p : '1.0') : '跟随默认'}</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" value="${m.top_p !== undefined ? m.top_p : 1.0}" ${m.topPEnabled ? '' : 'disabled'} oninput="setMemberTopPFromPersona(${i}, this.value)" style="height: 4px; padding: 0; margin: 2px 0;">
            </div>
          </div>
        </details>
      </div>
    `).join('');

    html += `
      <div class="model-section-header"><span>👥 副 AI 与群聊成员人设管理</span></div>
      <div class="model-list" style="max-height: 400px; overflow-y: auto;">${subRows}</div>
      <div class="action-buttons" style="margin-top: 12px;">
        <button class="btn btn-success" onclick="addGroupMemberFromPersona()">+ 添加副AI成员</button>
      </div>
      <div class="form-hint" style="margin-top: 8px;">在此统一设定多人群聊里的副 AI 人设。点击“+ 添加副AI成员”可以直接引入新的群聊角色。</div>
    `;
  }

  document.getElementById('detailBody').innerHTML = html;
}

function switchPersonaTab(tab) {
  saveCurrentSection(true);
  window.personaActiveTab = tab;
  renderPersonaSettings();
}

async function polishWorldBookFromPersona() {
  const wb = document.getElementById('personaWorldBook');
  if (!wb) return;
  const val = wb.value.trim();
  if (!val) {
    showToast('⚠️ 请先在世界书框内输入一些草稿设定或人设方向');
    return;
  }
  const originalBtn = document.querySelector('[onclick="polishWorldBookFromPersona()"]');
  if (originalBtn) {
    originalBtn.disabled = true;
    originalBtn.textContent = '🪄 正在润色人设...';
  }
  showToast('🪄 正在用 AI 润色世界书...');
  const sys = `你是一个顶级角色扮演与虚拟伴侣设定专家。请帮用户优化/润色并扩充世界书与主AI的人设描述。
你需要将用户输入的零散草稿，重构并扩写为以下专业格式（必须使用 Markdown 排版，使其排版美观、重点清晰）：
## 🎭 角色基础设定
- **基本信息**：外在形象、穿着打扮特点、嗓音质感与说话语调特点等
- **性格特征与口癖**：细微的神态、口癖或说话时的特有动作
- **核心情感逻辑**：对待用户的独特态度（随着关系升级由浅入深、占有欲、极致温柔或傲娇细节等）
## 🌍 世界观与场景设定
- **背景背景设定**：你们共同生活的特殊背景设定
- **契约与专属记忆**：你们共同拥有的专属默契与秘密契约

请基于用户给的设定草稿进行深度润色扩充，保留其最本质、最核心的创意，只返回精美润色后的 Markdown 纯设定，不要包含任何多余的解释、前言或寒暄语。`;
  try {
    const out = await llmComplete([{ role: 'system', content: sys }, { role: 'user', content: val }], { temperature: 0.75 });
    if (out) {
      wb.value = out;
      localStorage.setItem('world_book', out);
      showToast('✨ 世界书人设润色成功！已应用');
    }
  } catch (e) {
    showToast('润色失败：' + e.message);
  } finally {
    if (originalBtn) {
      originalBtn.disabled = false;
      originalBtn.textContent = '🪄 AI 润色人设';
    }
  }
}

function toggleMemberCtxLimitFromPersona(i, checked) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].contextLimitEnabled = checked;
  if (checked) {
    l[i].contextLimit = l[i].contextLimit || 18;
  } else {
    delete l[i].contextLimit;
  }
  saveGroupMembers(l);
  const slider = document.getElementById(`gpCtxLimitSlider-p-${i}`);
  const valEl = document.getElementById(`gpCtxLimitVal-p-${i}`);
  if (slider) slider.disabled = !checked;
  if (valEl) {
    valEl.textContent = checked ? (l[i].contextLimit === 'unlimited' ? '不限制' : l[i].contextLimit + ' 条') : '跟随群聊默认';
  }
}

function setMemberCtxLimitFromPersona(i, val) {
  const l = getGroupMembers();
  if (!l[i]) return;
  const n = parseInt(val);
  if (n >= 60) {
    l[i].contextLimit = 'unlimited';
    const valEl = document.getElementById(`gpCtxLimitVal-p-${i}`);
    if (valEl) valEl.textContent = '不限制';
  } else {
    l[i].contextLimit = n;
    const valEl = document.getElementById(`gpCtxLimitVal-p-${i}`);
    if (valEl) valEl.textContent = n + ' 条';
  }
  saveGroupMembers(l);
}

function toggleMemberTempFromPersona(i, checked) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].tempEnabled = checked;
  if (checked) {
    l[i].temperature = l[i].temperature !== undefined ? l[i].temperature : 1.0;
  } else {
    delete l[i].temperature;
  }
  saveGroupMembers(l);
  const slider = document.getElementById(`gpTempSlider-p-${i}`);
  const valEl = document.getElementById(`gpTempVal-p-${i}`);
  if (slider) slider.disabled = !checked;
  if (valEl) {
    valEl.textContent = checked ? (l[i].temperature !== undefined ? l[i].temperature : '1.0') : '跟随默认';
  }
}

function setMemberTempFromPersona(i, val) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].temperature = parseFloat(val);
  const valEl = document.getElementById(`gpTempVal-p-${i}`);
  if (valEl) valEl.textContent = val;
  saveGroupMembers(l);
}

function toggleMemberTopPFromPersona(i, checked) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].topPEnabled = checked;
  if (checked) {
    l[i].top_p = l[i].top_p !== undefined ? l[i].top_p : 1.0;
  } else {
    delete l[i].top_p;
  }
  saveGroupMembers(l);
  const slider = document.getElementById(`gpTopPSlider-p-${i}`);
  const valEl = document.getElementById(`gpTopPVal-p-${i}`);
  if (slider) slider.disabled = !checked;
  if (valEl) {
    valEl.textContent = checked ? (l[i].top_p !== undefined ? l[i].top_p : '1.0') : '跟随默认';
  }
}

function setMemberTopPFromPersona(i, val) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].top_p = parseFloat(val);
  const valEl = document.getElementById(`gpTopPVal-p-${i}`);
  if (valEl) valEl.textContent = val;
  saveGroupMembers(l);
}

function addGroupMemberFromPersona() {
  const l = getGroupMembers();
  l.push({id: 'g' + Date.now(), name: '新成员', persona: '', avatar: '🤖', providerId: '', model: '', voice: ''});
  saveGroupMembers(l);
  renderPersonaSettings();
}

function delGroupMemberFromPersona(i) {
  const l = getGroupMembers();
  if (l[i] && l[i].isMain) {
    showToast('主AI不可删除');
    return;
  }
  l.splice(i, 1);
  saveGroupMembers(l);
  renderPersonaSettings();
}

function renderMemorySettings(){
  settingsMode='memory';
  document.getElementById('detailTitle').innerHTML='🧠 记忆与情绪';
  const mode=localStorage.getItem('embed_mode')||'local';
  const mid=getMidTerm();const midAt=parseInt(localStorage.getItem('midterm_updated_at')||'0');const midStr=midAt?new Date(midAt).toLocaleString('zh-CN'):'尚未生成';const midIv=localStorage.getItem('midterm_interval')||'6';
  document.getElementById('detailBody').innerHTML=`
    <div class="model-section-header"><span>🗓️ 中期记忆（近7天自动摘要）</span></div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">启用中期记忆</div></div><label class="switch"><input type="checkbox" ${midtermEnabled()?'checked':''} onchange="setBool('midterm_enabled',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="form-group"><label class="form-label">自动更新间隔（小时）</label><input type="number" class="form-input" id="midInterval" min="1" step="0.5" value="${midIv}"></div>
    <div class="form-group"><textarea class="form-input" id="midView" rows="4" readonly placeholder="（尚未生成，聊天满6小时后自动生成，或点下方按钮）">${mid}</textarea><div class="form-hint">上次更新：${midStr}</div></div>
    <div class="action-buttons"><button class="btn btn-info" onclick="regenerateMidterm(false).then(()=>renderMemorySettings())">♻️ 立即生成中期记忆</button></div>
    <div class="model-section-header"><span>🧭 长期向量记忆（RAG 被动召回）</span></div>
    <div class="stat-box"><span>长期向量记忆条数</span><b id="vdbCountLabel">... / 上限 ${currentMemMax() || '无限制'}</b></div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🔎 RAG 主动召回</div></div><label class="switch"><input type="checkbox" ${ragEnabled()?'checked':''} onchange="setBool('rag_enabled',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🎭 情绪模型（用户 + AI 表情包）</div></div><label class="switch"><input type="checkbox" ${localStorage.getItem('emotion_enabled')!=='false'?'checked':''} onchange="onEmotionToggle(this.checked)"><span class="switch-slider"></span></label></div>
    <div class="form-group" style="margin-top:8px;"><label class="form-label">AI 情绪表情包图床基址</label><input type="text" class="form-input" id="emoBase" value="${emoBase()}"><div class="form-hint">默认 ${DEFAULT_EMO_BASE}。</div></div>
    <div class="slider-row"><div class="slider-head"><span class="slider-label">📥 召回条数</span><span class="slider-value" id="topkVal">${ragTopK()}</span></div><input type="range" min="1" max="8" step="1" value="${ragTopK()}" oninput="setNum('rag_topk',this.value);document.getElementById('topkVal').textContent=this.value"></div>
    <div class="slider-row"><div class="slider-head"><span class="slider-label">📏 相关度阈值</span><span class="slider-value" id="thVal">${ragThreshold()}</span></div><input type="range" min="0" max="0.8" step="0.05" value="${ragThreshold()}" oninput="setNum('rag_threshold',this.value);document.getElementById('thVal').textContent=this.value"></div>
    <div class="form-group"><label class="form-label">📦 本地哈希向量·最大条数（0或留空 = 无限制）</label><input type="number" class="form-input" id="memMaxLocal" min="0" step="100" placeholder="0 或留空 = 无限制" value="${memMaxLocal() || ''}"></div>
    <div class="form-group"><label class="form-label">☁️ 远程嵌入 API·最大条数（0或留空 = 无限制）</label><input type="number" class="form-input" id="memMaxRemote" min="0" step="100" placeholder="0 或留空 = 无限制" value="${memMaxRemote() || ''}"></div>
    <div class="form-group" style="margin-top:12px;"><label class="form-label">嵌入方式</label><select class="form-input" id="embedMode" onchange="onEmbedModeChange()"><option value="local" ${mode==='local'?'selected':''}>本地哈希向量（离线推荐）</option><option value="remote" ${mode==='remote'?'selected':''}>远程嵌入 API</option></select></div>
    <div id="embedApiBox" style="${mode==='remote'?'':'display:none'}"><div class="form-group"><label class="form-label">嵌入 API 地址</label><input type="text" class="form-input" id="embedUrl" value="${localStorage.getItem('embed_url')||''}" placeholder="https://api.siliconflow.cn/v1"></div><div class="form-group"><label class="form-label">嵌入 API Key</label><input type="password" class="form-input" id="embedKey" value="${localStorage.getItem('embed_key')||''}"></div><div class="form-group"><label class="form-label">嵌入模型</label><input type="text" class="form-input" id="embedModel" value="${localStorage.getItem('embed_model')||'text-embedding-3-small'}"></div></div>
    <div class="action-buttons"><button class="btn btn-info" onclick="rebuildIndex()">♻️ 重建索引</button><button class="btn btn-success" onclick="exportMemory()">📚 导出记忆库</button><button class="btn btn-warning" onclick="applyMemTrim()">✂️ 立即按上限清理</button><button class="btn btn-danger" onclick="clearVectorMemory()">🧹 清空向量库</button><button class="btn btn-danger" onclick="resetEmotion()">🔄 重置情绪</button></div>`;

  VDB.count().then(cnt => {
    const el = document.getElementById('vdbCountLabel');
    if (el) el.textContent = `${cnt} / 上限 ${currentMemMax() || '无限制'}`;
  }).catch(() => {});

  if (typeof renderMemoryBridgeDashboard === 'function') {
    document.getElementById('detailBody').appendChild(renderMemoryBridgeDashboard());
  }
}
async function applyMemTrim(){if(document.getElementById('memMaxLocal'))localStorage.setItem('mem_max_local',document.getElementById('memMaxLocal').value||'10000');if(document.getElementById('memMaxRemote'))localStorage.setItem('mem_max_remote',document.getElementById('memMaxRemote').value||'5000');await trimVectorStore();showToast('✅ 已按上限清理');renderMemorySettings();}
function renderVoiceSettings(){settingsMode='voice';document.getElementById('detailTitle').innerHTML='🔊 语音设置';const key=localStorage.getItem('voice_key')||'';const sel=localStorage.getItem('tts_model')||getTtsModels()[0]||'';const sttModel=localStorage.getItem('stt_model')||'FunAudioLLM/SenseVoiceSmall';const vlist=JSON.parse(localStorage.getItem('voice_list')||'[]');const aiV=localStorage.getItem('tts_voice_ai')||'';const userV=localStorage.getItem('tts_voice_user')||'';const opt=(cur)=>`<option value="">默认音色</option>`+vlist.map(v=>`<option value="${v}" ${cur===v?'selected':''}>${v}</option>`).join('');const models=getTtsModels();const rows=models.map((m,i)=>`<div class="list-row"><input type="radio" name="ttsSel" class="sel-radio" ${m===sel?'checked':''} onclick="selectTts('${m.replace(/'/g,"\\'")}')"><input type="text" value="${m}" onchange="editTtsModel(${i},this.value)"><button class="del-x" onclick="delTtsModel(${i})">✕</button></div>`).join('');document.getElementById('detailBody').innerHTML=`
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🔊 语音功能总开关</div><div class="switch-desc">默认关闭，等同顶部🔊按钮</div></div><label class="switch"><input type="checkbox" ${voiceEnabled()?'checked':''} onchange="setVoiceMaster(this.checked)"><span class="switch-slider"></span></label></div>
    <div class="form-group"><label class="form-label">语音 API Key</label><div class="input-with-btn"><input type="password" class="form-input" id="voiceKey" value="${key}"><button onclick="togglePwd('voiceKey')">👁️</button></div></div>
    <div class="form-group"><label class="form-label">TTS API 地址</label><input type="text" class="form-input" id="ttsUrl" value="${getTtsUrl()}"></div>
    <div class="model-section-header"><span>TTS 模型列表（单选，可增删）</span><button class="btn btn-success" style="padding:4px 10px;border-radius:8px;" onclick="addTtsModelRow()">+ 添加</button></div>
    <div id="ttsModelRows">${rows}</div>
    <div class="form-group" style="margin-top:12px;"><label class="form-label">音色列表</label><div class="input-with-btn"><span style="flex:1;font-size:11px;color:var(--text-sub);align-self:center;">已获取 ${vlist.length} 个音色</span><button onclick="fetchVoiceList()">获取音色</button></div></div>
    <div class="form-group"><label class="form-label">🤖 AI 音色</label><select class="form-input" id="voiceAi">${opt(aiV)}</select></div>
    <div class="form-group"><label class="form-label">🙂 用户音色</label><select class="form-input" id="voiceUser">${opt(userV)}</select></div>
    <div class="form-group"><label class="form-label">STT 模型（语音转文字）</label><input type="text" class="form-input" id="sttModel" value="${sttModel}"></div>
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🔈 自动朗读 AI 回复</div></div><label class="switch"><input type="checkbox" ${autoSpeakEnabled()?'checked':''} onchange="setBool('auto_speak',this.checked)"><span class="switch-slider"></span></label></div>
<div class="switch-row"><div class="switch-info"><div class="switch-label">🗣️ 通话打断（barge-in）</div><div class="switch-desc">AI 说话时你出声即可打断</div></div><label class="switch"><input type="checkbox" ${localStorage.getItem('call_bargein')!=='false'?'checked':''} onchange="setBool('call_bargein',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="action-buttons"><button class="btn btn-info" onclick="testTTS()">▶️ 测试朗读</button></div>
    <div class="form-hint" style="margin-top:8px;">录音格式：${pickMimeType()||'默认'}。麦克风按钮为「按住说话，松开识别」。朗读会自动跳过括号()（）内容。</div>`;}
function selectTts(m){localStorage.setItem('tts_model',m);}
function editTtsModel(i,v){const l=getTtsModels();const old=l[i];l[i]=v.trim()||old;saveTtsModels(l);if(localStorage.getItem('tts_model')===old)localStorage.setItem('tts_model',l[i]);}
function delTtsModel(i){const l=getTtsModels();const rm=l[i];l.splice(i,1);saveTtsModels(l);if(localStorage.getItem('tts_model')===rm)localStorage.setItem('tts_model',l[0]||'');renderVoiceSettings();}
function addTtsModelRow(){const l=getTtsModels();l.push('新模型');saveTtsModels(l);renderVoiceSettings();}
function renderImageSettings(){settingsMode='image';document.getElementById('detailTitle').innerHTML='🎨 生图设置';const mode=localStorage.getItem('img_gen_mode')||'free';const url=localStorage.getItem('img_url')||'https://api.vectorengine.cn';const key=localStorage.getItem('img_key')||'';const ratio=localStorage.getItem('img_ratio')||'1:1';const models=getImgModels();const selM=localStorage.getItem('img_model')||models[0]||'';const mrows=models.map((m,i)=>`<div class="list-row"><input type="radio" name="imgSel" class="sel-radio" ${m===selM?'checked':''} onclick="selectImgModel('${m.replace(/'/g,"\\'")}')"><input type="text" value="${m}" onchange="editImgModel(${i},this.value)"><button class="del-x" onclick="delImgModel(${i})">✕</button></div>`).join('');const reslist=getImgResList();const selRes=localStorage.getItem('img_res')||reslist[0]||'1024';const resrows=reslist.map((px,i)=>`<div class="list-row"><input type="radio" name="resSel" class="sel-radio" ${px===selRes?'checked':''} onclick="selectImgRes('${px}')"><span class="res-label">${resLabel(px)}</span><input type="text" value="${px}" onchange="editImgRes(${i},this.value)"><button class="del-x" onclick="delImgRes(${i})">✕</button></div>`).join('');const ratios=['1:1','4:3','3:4','16:9','9:16','3:2','2:3'];document.getElementById('detailBody').innerHTML=`
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🎨 启用生图功能</div><div class="switch-desc">默认关闭</div></div><label class="switch"><input type="checkbox" ${imgEnabled()?'checked':''} onchange="toggleImgEnabled(this.checked)"><span class="switch-slider"></span></label></div>
    <div class="form-group" style="margin-top:8px;"><label class="form-label">生图接口类型</label><select class="form-input" id="imgGenMode" onchange="onImgModeChange()"><option value="free" ${mode==='free'?'selected':''}>免费 · Pollinations（固化，无需Key）</option><option value="gemini" ${mode==='gemini'?'selected':''}>收费 · Gemini 原生(:generateContent)</option><option value="openai" ${mode==='openai'?'selected':''}>收费 · OpenAI(/v1/images/generations)</option><option value="chat" ${mode==='chat'?'selected':''}>收费 · Chat 多模态(/v1/chat/completions)</option></select></div>
    <div id="paidImgBox" style="${mode==='free'?'display:none':''}">
        <div class="form-group"><label class="form-label">生图 API 地址（基础域名）</label><input type="text" class="form-input" id="imgUrl" value="${url}"><div class="form-hint">向量引擎填 https://api.vectorengine.cn ；Gemini模式自动拼 /v1beta/models/&lt;模型&gt;:generateContent</div></div>
        <div class="form-group"><label class="form-label">生图 API Key</label><div class="input-with-btn"><input type="password" class="form-input" id="imgKey" value="${key}"><button onclick="togglePwd('imgKey')">👁️</button></div></div>
        <div class="model-section-header"><span>收费生图模型列表（单选，可增删）</span><button class="btn btn-success" style="padding:4px 10px;border-radius:8px;" onclick="addImgModelRow()">+ 添加</button></div>
        <div id="imgModelRows">${mrows}</div>
    </div>
    <div class="model-section-header"><span>分辨率（单选，可增删）</span><button class="btn btn-success" style="padding:4px 10px;border-radius:8px;" onclick="addImgResRow()">+ 添加</button></div>
    <div id="imgResRows">${resrows}</div>
    <div class="form-group" style="margin-top:12px;"><label class="form-label">图片比例</label><select class="form-input" id="imgRatio">${ratios.map(r=>`<option ${ratio===r?'selected':''}>${r}</option>`).join('')}</select></div>
    <div class="form-hint">分辨率为长边像素，结合比例自动计算长短边。</div>`;}
function renderWebSettings(){settingsMode='websearch';document.getElementById('detailTitle').innerHTML='🌐 联网功能';document.getElementById('detailBody').innerHTML=`
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🌐 提示模型自行联网</div><div class="switch-desc">在提示词中告知模型可联网检索</div></div><label class="switch"><input type="checkbox" ${webSearchEnabled()?'checked':''} onchange="setBool('web_search',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="form-hint" style="margin-top:10px;line-height:1.7;">当所选模型自身具备联网能力时打开即可；模型不支持时开关无效。纯前端无法绕过浏览器跨域抓取公网搜索结果。</div>`;}
function onImgModeChange(){const v=document.getElementById('imgGenMode').value;localStorage.setItem('img_gen_mode',v);document.getElementById('paidImgBox').style.display=v==='free'?'none':'';}
function onEmbedModeChange(){const v=document.getElementById('embedMode').value;localStorage.setItem('embed_mode',v);document.getElementById('embedApiBox').style.display=v==='remote'?'':'none';}
function onEmotionToggle(on){setBool('emotion_enabled',on);renderEmotionPills();}
function resetEmotion(){localStorage.removeItem('emotion_state');localStorage.removeItem('emotion_dominant');localStorage.removeItem('ai_emotion_state');localStorage.removeItem('ai_emotion_dominant');localStorage.removeItem('emo_last_burst_count');renderEmotionPills();showToast('✅ 情绪已重置');}
async function clearVectorMemory(){if(!confirm('清空全部长期向量记忆？'))return;await VDB.clear();showToast('✅ 已清空');renderMemorySettings();}
async function rebuildIndex(){if(!confirm('根据当前聊天记录重建向量索引？'))return;await VDB.clear();let n=0;for(const m of conversationHistory){if(m.content&&m.content.length>=4){await memorize(m.role,m.content,m.emotion);n++;}}showToast(`✅ 已重建 ${n} 条`);renderMemorySettings();}
function exportMemory(){VDB.all().then(s=>{if(!s.length){alert('向量库为空');return;}const o=s.sort((a,b)=>(a.ts||0)-(b.ts||0)).map(r=>`[${new Date(r.ts).toLocaleString()}] (${r.role}) ${r.text}`).join('\n');const b=new Blob(['\uFEFF'+o],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='AI长期记忆.txt';a.click();});}
function setFontSize(v){localStorage.setItem('font_size',v);document.getElementById('fontVal').textContent=v+'px';applyFontSize();}
function toggleTemp(on){setBool('temp_enabled',on);document.getElementById('tempSlider').disabled=!on;document.getElementById('tempVal').textContent=on?(localStorage.getItem('temperature')||'1'):'未设置';}
function setTemp(v){localStorage.setItem('temperature',v);document.getElementById('tempVal').textContent=v;}
function toggleTopP(on){setBool('top_p_enabled',on);document.getElementById('topPSlider').disabled=!on;document.getElementById('topPVal').textContent=on?(localStorage.getItem('top_p')||'1'):'未设置';}
function setTopP(v){localStorage.setItem('top_p',v);document.getElementById('topPVal').textContent=v;}
function handleAvatar(input,type){const f=input.files[0];if(!f)return;if(f.size>2*1024*1024){alert('头像不能超过2MB');return;}const r=new FileReader();r.onload=e=>{localStorage.setItem(type==='ai'?'ai_avatar':'user_avatar',e.target.result);if(settingsMode==='general')renderGeneralSettings();else if(settingsMode==='persona')renderPersonaSettings();renderBrandAvatar();showToast('✅ 头像已更新');};r.readAsDataURL(f);input.value='';}
function clearAvatar(type){localStorage.removeItem(type==='ai'?'ai_avatar':'user_avatar');if(settingsMode==='general')renderGeneralSettings();else if(settingsMode==='persona')renderPersonaSettings();renderBrandAvatar();}
function handleBg(input){const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=async e=>{const small=await compressImage(e.target.result,1280,0.8);try{localStorage.setItem('chat_bg',small);applyBackground();renderGeneralSettings();showToast('✅ 背景已更新');}catch(err){alert('图片太大');}};r.readAsDataURL(f);input.value='';}
function clearBg(){localStorage.removeItem('chat_bg');applyBackground();renderGeneralSettings();}
function selectProvider(id){
  saveCurrentSection(true);
  settingsMode='provider';
  currentProviderId=id;
  const p=getProvider(id);
  if(p && p.models && p.models.length){
    const exists = p.models.some(m => m.name === selectedModelName);
    if(!exists){
      selectedModelName = p.models[0].name;
    }
  }
  saveSettings();
  updateModelCard();
  renderProviderList();
  renderProviderDetail(id);
}
function renderProviderDetail(id){const p=getProvider(id);if(!p)return;const lk=p.locked;document.getElementById('detailTitle').innerHTML=`${p.icon} ${p.name}`;const apiKey=localStorage.getItem(`apikey_${id}`)||'';document.getElementById('detailBody').innerHTML=`
    ${lk?'<div class="form-hint" style="margin-bottom:8px;">🔒 免费模型已固化，端点与认证不可修改，无需 API Key。</div>':''}
    <div class="form-group"><label class="form-label">服务商名称</label><input type="text" class="form-input" id="editName" value="${p.name}" ${lk?'disabled':''}></div>
    <div class="form-group"><label class="form-label">API 密钥</label><div class="input-with-btn"><input type="password" class="form-input" id="editApiKey" value="${apiKey}" ${lk?'disabled':''}><button onclick="togglePwd('editApiKey')">👁️</button></div></div>
    <div class="form-group"><label class="form-label">API 主机</label><input type="text" class="form-input" id="editBaseUrl" value="${p.endpoint}" ${lk?'disabled':''}><div class="form-hint">${p.note||''}</div></div>
    <div class="form-group"><label class="form-label">认证方式</label><select class="form-input" id="editAuth" ${lk?'disabled':''}><option value="Bearer" ${p.auth==='Bearer'?'selected':''}>Bearer</option><option value="x-api-key" ${p.auth==='x-api-key'?'selected':''}>x-api-key</option><option value="x-goog-api-key" ${p.auth==='x-goog-api-key'?'selected':''}>x-goog-api-key</option><option value="none" ${p.auth==='none'?'selected':''}>无认证</option></select></div>
    <div class="model-section-header"><span>模型列表</span><div class="model-actions">${lk?'':'<button onclick="addModel()">+ 新建</button><button onclick="resetModels()">↺ 重置</button>'}</div></div>
    <div class="model-list" id="modelList"></div>`;renderModelList(p);}
function renderModelList(p){const l=document.getElementById('modelList');if(!l)return;const lk=p.locked;l.innerHTML=p.models.length?'':'<div style="color:var(--text-light);font-size:11px;padding:8px;">暂无模型</div>';p.models.forEach((m,i)=>{const c=document.createElement('div');c.className=`model-card ${m.name===selectedModelName?'selected':''}`;c.onclick=e=>{if(!e.target.closest('.model-card-actions')){selectedModelName=m.name;currentProviderId=p.id;renderModelList(p);saveSettings();updateModelCard();}};c.innerHTML=`<div class="model-info"><div class="model-name">${m.name}</div><div class="model-meta">${(m.caps||[]).join(' ')} 📄${m.context||'?'} 🔄${m.output||'?'}</div></div><div class="model-card-actions">${lk?'':`<button onclick="editModel(${i})">⚙️</button><button onclick="deleteModel(${i})">✕</button>`}</div>`;l.appendChild(c);});}
function saveCurrentSection(silent){if(settingsMode==='provider'){saveCurrentProvider(silent);return;}
    if(settingsMode==='persona'){
      const sysPrompt = document.getElementById('personaSystemPrompt');
      if(sysPrompt) localStorage.setItem('systemPrompt', sysPrompt.value);
      const wb = document.getElementById('personaWorldBook');
      if(wb) localStorage.setItem('world_book', wb.value.trim());
      const nameInput = document.getElementById('personaAiName');
      if(nameInput) saveMainAiName(nameInput.value, true);
      const userNickInput = document.getElementById('personaUserNickname');
      if(userNickInput) localStorage.setItem('user_nickname', userNickInput.value.trim() || '用户');
      const lt = document.getElementById('personaLtProfile');
      if(lt) setLongTermProfile(lt.value);
      renderBrandAvatar();
    }
    if(settingsMode==='song'){
      const en=document.getElementById('songEnableChk');
      if(en)localStorage.setItem('song_enabled',en.checked?'true':'false');
      const songProxy = document.getElementById('songProxy');
      if(songProxy) localStorage.setItem('song_proxy',songProxy.value.trim());
      const songKey = document.getElementById('songKey');
      if(songKey) localStorage.setItem('song_key',songKey.value.trim());
      const songModel = document.getElementById('songModel');
      if(songModel) localStorage.setItem('song_model',songModel.value.trim());
    } 
if(settingsMode==='memory'){
    const memLocal = document.getElementById('memMaxLocal');
    if(memLocal)localStorage.setItem('mem_max_local',memLocal.value||'10000');
    const memRemote = document.getElementById('memMaxRemote');
    if(memRemote)localStorage.setItem('mem_max_remote',memRemote.value||'5000');
    const emoBase = document.getElementById('emoBase');
    if(emoBase)localStorage.setItem('emotion_img_base',emoBase.value.trim()||DEFAULT_EMO_BASE);
    const worldBook = document.getElementById('worldBook');
    if(worldBook)localStorage.setItem('world_book',worldBook.value.trim());
    const ltProfile = document.getElementById('ltProfile');
    if(ltProfile)setLongTermProfile(ltProfile.value);
    const midInterval = document.getElementById('midInterval');
    if(midInterval)localStorage.setItem('midterm_interval',midInterval.value||'6');
    const embedUrl = document.getElementById('embedUrl');
    if(embedUrl){
       localStorage.setItem('embed_url',embedUrl.value);
       const embedKey = document.getElementById('embedKey');
       if(embedKey) localStorage.setItem('embed_key',embedKey.value);
       const embedModel = document.getElementById('embedModel');
       if(embedModel) localStorage.setItem('embed_model',embedModel.value);
    }
    trimVectorStore();
    renderBrandAvatar();
}
    if(settingsMode==='music'){
      const musicApiBase = document.getElementById('musicApiBase');
      if(musicApiBase) localStorage.setItem('music_api_base',musicApiBase.value.trim());
      const musicAudioProxy = document.getElementById('musicAudioProxy');
      if(musicAudioProxy) localStorage.setItem('music_audio_proxy',musicAudioProxy.value.trim());
      const musicU = document.getElementById('musicU');
      if(musicU) localStorage.setItem('music_u',musicU.value.trim());
      const musicLevel = document.getElementById('musicLevel');
      if(musicLevel) localStorage.setItem('music_level',musicLevel.value);
    }
    if(settingsMode==='proactive'){
      const proInterval = document.getElementById('proInterval');
      if(proInterval) localStorage.setItem('proactive_interval',proInterval.value.trim());
      const proAutoMin = document.getElementById('proAutoMin');
      if(proAutoMin) localStorage.setItem('proactive_auto_min',proAutoMin.value||'60');
      const proAutoMax = document.getElementById('proAutoMax');
      if(proAutoMax) localStorage.setItem('proactive_auto_max',proAutoMax.value||'120');
      const proPrompt = document.getElementById('proPrompt');
      if(proPrompt) localStorage.setItem('proactive_prompt',proPrompt.value||proactivePrompt());
      _autoThreshold=null;
    }
    if(settingsMode==='voice'){
      const voiceKey = document.getElementById('voiceKey');
      if(voiceKey) localStorage.setItem('voice_key',voiceKey.value);
      const ttsUrl = document.getElementById('ttsUrl');
      if(ttsUrl) localStorage.setItem('tts_url',ttsUrl.value);
      const sttModel = document.getElementById('sttModel');
      if(sttModel) localStorage.setItem('stt_model',sttModel.value);
      const voiceAi = document.getElementById('voiceAi');
      if(voiceAi) localStorage.setItem('tts_voice_ai',voiceAi.value);
      const voiceUser = document.getElementById('voiceUser');
      if(voiceUser) localStorage.setItem('tts_voice_user',voiceUser.value);
    }
    if(settingsMode==='image'){
      const imgGenMode = document.getElementById('imgGenMode');
      if(imgGenMode) localStorage.setItem('img_gen_mode',imgGenMode.value);
      const imgUrl = document.getElementById('imgUrl');
      if(imgUrl) localStorage.setItem('img_url',imgUrl.value);
      const imgKey = document.getElementById('imgKey');
      if(imgKey) localStorage.setItem('img_key',imgKey.value);
      const imgRatio = document.getElementById('imgRatio');
      if(imgRatio) localStorage.setItem('img_ratio',imgRatio.value);
    }
    if(!silent)showToast('✅ 设置已保存');}
function saveCurrentProvider(silent){
  const p=getCurrentProvider();
  if(p.locked){
    saveSettings();
    updateModelCard();
    if(!silent)showToast('✅ 已保存(免费模型固化)');
    return;
  }
  const editName = document.getElementById('editName');
  if (editName) p.name=editName.value||p.name;
  
  const editApiKey = document.getElementById('editApiKey');
  if (editApiKey) {
    localStorage.setItem(`apikey_${p.id}`,editApiKey.value||'');
  }
  
  const editBaseUrl = document.getElementById('editBaseUrl');
  if (editBaseUrl) p.endpoint=editBaseUrl.value||'';
  
  const editAuth = document.getElementById('editAuth');
  if (editAuth) p.auth=editAuth.value||'Bearer';
  
  saveProviders();
  saveSettings();
  renderProviderList();
  updateModelCard();
  if(!silent)showToast('✅ 已保存');
}
function addModel(){const n=prompt('模型名称');if(!n)return;const ctx=prompt('上下文窗口（如 128K）','32K')||'32K';const out=prompt('最大输出 Token（如 16K）','4K')||'4K';getCurrentProvider().models.push({name:n,caps:['💡'],context:ctx,output:out});saveProviders();renderModelList(getCurrentProvider());updateModelCard();}
function editModel(i){const p=getCurrentProvider();const m=p.models[i];const n=prompt('模型名字',m.name);if(n===null)return;const ctx=prompt('上下文窗口',m.context||'32K');if(ctx===null)return;const out=prompt('最大输出 Token',m.output||'4K');if(out===null)return;m.name=n||m.name;m.context=ctx;m.output=out;saveProviders();renderModelList(p);updateModelCard();showToast('✅ 已修改');}
function deleteModel(i){if(confirm('删除该模型？')){getCurrentProvider().models.splice(i,1);saveProviders();renderModelList(getCurrentProvider());updateModelCard();}}
function resetModels(){if(confirm('重置模型列表？')){const d=DEFAULT_PROVIDERS.find(p=>p.id===getCurrentProvider().id);if(d){getCurrentProvider().models=JSON.parse(JSON.stringify(d.models));saveProviders();renderModelList(getCurrentProvider());updateModelCard();}else alert('无默认配置');}}
function addProvider(){const n=prompt('输入服务商名称');if(!n)return;const id='custom_'+Date.now();providers.push({id,name:n,icon:'������',endpoint:'',auth:'Bearer',models:[],note:'自定义'});saveProviders();selectProvider(id);showToast('✅ 已添加');}
function deleteProvider(e,id){e.stopPropagation();const p=getProvider(id);if(p&&p.locked){alert('免费模型已固化，不可删除');return;}if(providers.length<=1){alert('至少保留一个');return;}if(!confirm('删除该服务商？'))return;providers=providers.filter(x=>x.id!==id);localStorage.removeItem(`apikey_${id}`);saveProviders();if(currentProviderId===id){currentProviderId=providers[0].id;selectedModelName=providers[0].models[0]?.name||'';saveSettings();}renderProviderList();updateModelCard();showToast('✅ 已删除');}
function resetProviders(){if(confirm('重置所有服务商为默认？')){providers=JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));saveProviders();currentProviderId='free';selectedModelName='';saveSettings();renderProviderList();updateModelCard();}}

function saveMainAiName(val, silent){const oldName = localStorage.getItem('ai_name') || '小艾';const name=val.trim()||'主AI';localStorage.setItem('ai_name',name);let wb = localStorage.getItem('world_book') || '你叫「小艾」，是用户的贴心伴侣，性格温柔体贴、善解人意。';if (oldName !== name) {const re = new RegExp(oldName, 'g');if (re.test(wb)) {wb = wb.replace(re, name);localStorage.setItem('world_book', wb);const worldBookEl = document.getElementById('worldBook');if (worldBookEl && settingsMode === 'memory') {worldBookEl.value = wb;}}}if(typeof getGroupMembers==='function'&&typeof saveGroupMembers==='function'){const l=getGroupMembers();const mainMem=l.find(m=>m.isMain);if(mainMem){mainMem.name=name;saveGroupMembers(l);}}if(typeof renderBrandAvatar==='function')renderBrandAvatar();if(typeof updateBrandAvatarAndHeader==='function')updateBrandAvatarAndHeader();if(!silent)showToast('✅ 主AI名称已更新');}

async function polishWorldBook(){const wb=document.getElementById('worldBook');if(!wb)return;const val=wb.value.trim();if(!val){showToast('⚠️ 请先在世界书框内输入一些草稿设定或人设方向');return;}const originalBtn=document.querySelector('[onclick="polishWorldBook()"]');if(originalBtn){originalBtn.disabled=true;originalBtn.textContent='🪄 正在润色人设...';}showToast('🪄 正在用 AI 润色世界书...');const sys=`你是一个顶级角色扮演与虚拟伴侣设定专家。请帮用户优化/润色并扩充世界书与主AI的人设描述。
你需要将用户输入的零散草稿，重构并扩写为以下专业格式（必须使用 Markdown 排版，使其排版美观、重点清晰）：
## 🎭 角色基础设定
- **基本信息**：外在形象、穿着打扮特点、嗓音质感与说话语调特点等
- **性格特征与口癖**：细微的神态、口癖或说话时的特有动作
- **核心情感逻辑**：对待用户的独特态度（随着关系升级由浅入深、占有欲、极致温柔或傲娇细节等）
## 🌍 世界观与场景设定
- **背景背景设定**：你们共同生活的特殊背景设定
- **契约与专属记忆**：你们共同拥有的专属默契与秘密契约

请基于用户给的设定草稿进行深度润色扩充，保留其最本质、最核心的创意，只返回精美润色后的 Markdown 纯设定，不要包含任何多余的解释、前言或寒暄语。`;try{const out=await llmComplete([{role:'system',content:sys},{role:'user',content:val}],{temperature:0.75});if(out){wb.value=out;localStorage.setItem('world_book',out);showToast('✨ 世界书人设润色成功！已应用');}}catch(e){showToast('润色失败：'+e.message);}finally{if(originalBtn){originalBtn.disabled=false;originalBtn.textContent='🪄 AI 润色人设';}}}

function onThemePresetChange(val){
  localStorage.setItem('theme_preset', val);
  const customArea = document.getElementById('customThemeColorArea');
  if(val==='custom'){
    if(customArea) customArea.style.display = 'flex';
    applyTheme('custom');
  } else {
    if(customArea) customArea.style.display = 'none';
    applyTheme(val);
  }
  showToast('✨ 主题配色已应用');
}

function onCustomAccentChange(val){
  localStorage.setItem('theme_custom_accent', val);
  applyTheme('custom');
}
