/* ===== 群聊：主AI(世界书) + 用户 + 多AI，记忆互通，@定向，消息操作，独立头像/背景/模型/语音/通话 ===== */

/* 成员：主AI固定存在(id=main，用系统提示词=世界书)，其余为自定义角色 */
function defaultGroupMembers(){return [
  {id:'main',name:'主AI',persona:'',avatar:'🤖',providerId:'',model:'',voice:'',isMain:true},
  {id:'g1',name:'小暖',persona:'温柔体贴的知心姐姐，说话轻声细语，善于安慰。',avatar:'🌸',providerId:'',model:'',voice:''},
  {id:'g2',name:'阿灿',persona:'幽默活泼的损友，爱开玩笑，语气跳脱。',avatar:'😎',providerId:'',model:'',voice:''}
];}
function getGroupMembers(){try{const l=JSON.parse(localStorage.getItem('group_members'));if(Array.isArray(l)&&l.length){let mainMem=l.find(m=>m.isMain);if(!mainMem){mainMem={id:'main',name:localStorage.getItem('ai_name')||'主AI',persona:'',avatar:localStorage.getItem('ai_avatar')||'🤖',isMain:true};l.unshift(mainMem);}else{mainMem.name=localStorage.getItem('ai_name')||'主AI';const customAv=localStorage.getItem('ai_avatar');if(customAv)mainMem.avatar=customAv;}return l;}}catch(e){}const def=defaultGroupMembers();const mainMem=def.find(m=>m.isMain);if(mainMem){mainMem.name=localStorage.getItem('ai_name')||'主AI';const customAv=localStorage.getItem('ai_avatar');if(customAv)mainMem.avatar=customAv;}return def;}
function saveGroupMembers(l){localStorage.setItem('group_members',JSON.stringify(l));}
function groupBg(){return localStorage.getItem('group_bg')||'';}
function groupReplyMode(){return localStorage.getItem('group_reply_mode')||'round';} // round=依次 | random=随机1人

function getGroupHistory(){
  return groupHistory || [];
}
function saveGroupHistory(h){
  groupHistory = h;
  try {
    // 限制 localStorage 缓存为 50 条消息以防止 QuotaExceededError (5MB溢出)
    localStorage.setItem('group_history', JSON.stringify(h.slice(-50)));
  } catch(e) {
    console.warn('[GroupHistory] localStorage cache failed:', e);
  }
  
  // 双写/写入 IndexedDB 主存储，不受 300 条限制，保留全量历史
  if (typeof HistoryBackupDB !== 'undefined') {
    HistoryBackupDB.set('group_history', h).catch(err => {
      console.error('[GroupHistory] IndexedDB save failed:', err);
    });
  }
}
let groupHistory = [];
async function initGroupHistory() {
  try {
    if (typeof HistoryBackupDB !== 'undefined') {
      const backup = await HistoryBackupDB.get('group_history');
      if (backup && Array.isArray(backup) && backup.length > 0) {
        groupHistory = backup;
        console.log('[GroupHistory] Loaded ' + groupHistory.length + ' messages from IndexedDB');
        return;
      }
    }
  } catch (e) {
    console.error('[GroupHistory] Failed to load from IndexedDB:', e);
  }
  
  // 兜底从 localStorage 读取
  try {
    const rawHist = localStorage.getItem('group_history');
    if (rawHist) {
      groupHistory = JSON.parse(rawHist) || [];
    }
  } catch (e) {
    groupHistory = [];
  }
}
let groupReplying=false,groupQuote=null,gCtxUid=null;

/* ---- 面板开合 ---- */
let _groupRenderLimit = 50; // 默认首次加载 50 条

function openGroupChat(){
  const p=document.getElementById('groupPanel');
  p.classList.add('show');
  applyGroupBg();
  _groupRenderLimit = 50; // 每次打开重置分页限制
  renderGroupMessages();
  if(groupAutoOn() && typeof startGroupAutoLoop === 'function') startGroupAutoLoop();
}
function closeGroupChat(){
  document.getElementById('groupPanel').classList.remove('show');
  if(typeof stopGroupAutoLoop === 'function') stopGroupAutoLoop();
}
function applyGroupBg(){const el=document.getElementById('groupMessages');const bg=groupBg();if(el){if(bg){el.style.backgroundImage=`url(${bg})`;el.style.backgroundSize='cover';el.style.backgroundPosition='center';}else el.style.backgroundImage='';}}

/* ---- 渲染 ---- */
function memberById(id){return getGroupMembers().find(m=>m.id===id);}
function groupAvatarHTML(m){const src=(m&&m.avatar||'').startsWith('data:')?`<img class="avatar" src="${m.avatar}">`:`<div class="avatar avatar-emoji">${(m&&m.avatar)||'🤖'}</div>`;return src;}
function userAvatarHTML(){const s=localStorage.getItem('user_avatar');return s?`<img class="avatar" src="${s}">`:`<div class="avatar avatar-emoji">🙂</div>`;}

function loadMoreGroupMessages() {
  _groupRenderLimit += 50;
  const box = document.getElementById('groupMessages');
  if (!box) return;
  
  const oldScrollHeight = box.scrollHeight;
  const oldScrollTop = box.scrollTop;
  
  renderGroupMessages(true);
  
  // 恢复滚动条偏移量，防止页面突跳，体验极佳
  setTimeout(() => {
    box.scrollTop = box.scrollHeight - oldScrollHeight + oldScrollTop;
  }, 12);
}

async function renderGroupMessages(keepScroll = false){
  const box=document.getElementById('groupMessages');
  if(!box)return;
  box.innerHTML='';
  
  // 确保 groupHistory 已载入
  if (!groupHistory || groupHistory.length === 0) {
    try {
      if (typeof HistoryBackupDB !== 'undefined') {
        const backup = await HistoryBackupDB.get('group_history');
        if (backup && Array.isArray(backup)) {
          groupHistory = backup;
        }
      }
    } catch (e) {}
  }
  
  const totalMsgs = groupHistory.length;
  
  // 如果群消息总数大于当前限制，渲染“加载更早记忆”按钮
  if (totalMsgs > _groupRenderLimit) {
    const loadMoreDiv = document.createElement('div');
    loadMoreDiv.className = 'load-more-container';
    loadMoreDiv.style.cssText = 'text-align: center; padding: 12px 0; margin-bottom: 8px; width: 100%;';
    loadMoreDiv.innerHTML = `
      <button class="load-more-btn" onclick="loadMoreGroupMessages()" style="
        background: var(--bg-card);
        border: 1px solid var(--border);
        color: var(--text-sub);
        font-size: 11px;
        padding: 6px 14px;
        border-radius: 16px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
        box-shadow: 0 1px 3px rgba(0,0,0,0.02);
      ">🕒 加载更早的群聊记忆 (还有 ${totalMsgs - _groupRenderLimit} 条)</button>
    `;
    box.appendChild(loadMoreDiv);
  }
  
  const messagesToRender = groupHistory.slice(-_groupRenderLimit);
  messagesToRender.forEach(m=>box.appendChild(groupBubble(m)));
  
  if (!keepScroll) {
    box.scrollTop=box.scrollHeight;
  }
}

function getGroupMemberBubbleStyle(memberId) {
  if (!memberId || memberId === 'main') {
    return '';
  }
  const mem = memberById(memberId);
  let bg = mem && mem.bubbleColor;
  let text = '';
  let border = '';
  
  if (!bg) {
    const colors = [
      { bg: '#E2E9E1', border: '#D2DAD0', text: '#3E463D' }, // 抹茶雅绿
      { bg: '#EFE5DD', border: '#E0D5CC', text: '#594F47' }, // 暮桃粉桔
      { bg: '#E5E2E9', border: '#D6D2DC', text: '#4C4853' }, // 熏衣柔紫
      { bg: '#DCE5EA', border: '#CDD6DB', text: '#414A4E' }, // 雾霾灰蓝
      { bg: '#EFEAE0', border: '#E0DBD0', text: '#545046' }, // 浅沙燕麦
      { bg: '#EFE1E1', border: '#E0D2D2', text: '#5E4E4E' }  // 绛樱粉黛
    ];
    let hash = 0;
    const idStr = String(memberId);
    for (let i = 0; i < idStr.length; i++) {
      hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    const c = colors[idx];
    bg = c.bg;
    border = c.border;
    text = c.text;
  } else {
    const isLight = (typeof getLuminance === 'function') ? (getLuminance(bg) > 0.6) : true;
    text = isLight ? '#3A3E4A' : '#FFFFFF';
    border = (typeof adjustSaturationAndBrightness === 'function') ? adjustSaturationAndBrightness(bg, 1.0, 0.9) : bg;
  }
  return `background: ${bg}; border: 1px solid ${border}; color: ${text}; border-bottom-left-radius: 6px;`;
}

function groupBubble(m){
  const div=document.createElement('div');const mine=m.role==='user';
  div.className='message '+(mine?'user-message':'ai-message');div.dataset.uid=m.uid;
  const mem=mine?null:(memberById(m.memberId)||{name:m.name,avatar:m.avatar});
  const av=mine?userAvatarHTML():groupAvatarHTML(mem);
  const quoteHtml=m.quote?`<div class="gp-quote">${escapeForSearch(m.quote.slice(0,60))}</div>`:'';
  const speak=`<span class="inline-speak" onclick="event.stopPropagation();gMsgSpeak('${m.uid}')">🔊</span>`;
  const customStyle = (!mine && m.memberId) ? getGroupMemberBubbleStyle(m.memberId) : '';
  const styleAttr = customStyle ? `style="${customStyle}"` : '';

  let bubbleHtml = '';
  if (m.image) {
    bubbleHtml = `<div class="bubble image-bubble" style="padding:0;overflow:hidden;border-radius:12px;" onclick="gToggleActions('${m.uid}')"><img src="${m.image}" onclick="event.stopPropagation(); openImageViewer(this.src)" style="max-width:180px;max-height:180px;display:block;cursor:pointer;"></div>`;
  } else {
    const splitToBubblesFn = window.splitToBubbles || function(content) {
      if(content==null)return[''];
      return String(content).split('\n').map(s=>s.replace(/\s+$/,'')).filter(s=>s.trim()!=='');
    };
    const lines = splitToBubblesFn(m.content);
    bubbleHtml = lines.map((line, idx) => {
      const quotePart = (idx === 0) ? quoteHtml : '';
      const speakPart = (!mine && idx === lines.length - 1) ? speak : '';
      return `<div class="bubble" ${styleAttr} onclick="gToggleActions('${m.uid}'); event.stopPropagation();">${quotePart}${escapeForSearch(line)}${speakPart}</div>`;
    }).join('');
  }

  div.innerHTML=`${av}<div class="msg-content"><div class="bubbles">${!mine?`<div class="gp-name" onclick="event.stopPropagation();showGroupMemberActions('${mem&&mem.id?mem.id:''}','${(mem&&mem.name)||'AI'}')" style="cursor:pointer;text-decoration:underline;" title="点击私聊/通话">${(mem&&mem.name)||'AI'}</div>`:''}${bubbleHtml}</div><div class="msg-time">${nowTime(m.ts)}</div><div class="msg-actions" id="ga-${m.uid}"><button onclick="gMsgQuote('${m.uid}')">💬</button><button onclick="gMsgCopy('${m.uid}')">📋</button><button onclick="gMsgEdit('${m.uid}')">✏️</button><button onclick="gMsgDelete('${m.uid}')">🗑️</button></div></div>`;
  bindGroupLongPress(div,m.uid);
  return div;
}
function showGroupMemberActions(memId, name){
  if(!memId)return;
  const opt=confirm(`✨ 对「${name}」进行什么操作？\n\n【确定】= 开始1v1私聊\n【取消】= 拨打 1v1 语音通话`);
  if(opt){
    closeGroupChat();
    if(typeof switchPrivateChat==='function')switchPrivateChat(memId);
  }else{
    groupCallMember(memId);
  }
}
function gToggleActions(uid){
  const a=document.getElementById('ga-'+uid);
  if(a){
    const wasShown=a.classList.contains('show-mobile');
    document.querySelectorAll('.msg-actions.show-mobile').forEach(el=>el.classList.remove('show-mobile'));
    if(!wasShown)a.classList.add('show-mobile');
  }
}
function bindGroupLongPress(div,uid){let t=null;div.addEventListener('touchstart',()=>{t=setTimeout(()=>gToggleActions(uid),500);},{passive:true});div.addEventListener('touchend',()=>clearTimeout(t));div.addEventListener('touchmove',()=>clearTimeout(t));}
function pushGroup(m){getGroupHistory();groupHistory.push(m);saveGroupHistory(groupHistory);const box=document.getElementById('groupMessages');if(box){box.appendChild(groupBubble(m));box.scrollTop=box.scrollHeight;}}

/* ---- 引用 / 复制 / 删除 / 修改 / 朗读 ---- */
function gGetMsg(uid){return groupHistory.find(m=>m.uid===uid);}
function gMsgCopy(uid){const m=gGetMsg(uid);if(m)navigator.clipboard.writeText(m.content).then(()=>showToast('✅ 已复制'));}
function gMsgDelete(uid){if(!confirm('删除该消息？'))return;groupHistory=groupHistory.filter(m=>m.uid!==uid);saveGroupHistory(groupHistory);renderGroupMessages();}
function gMsgQuote(uid){const m=gGetMsg(uid);if(m){groupQuote=m.content;document.getElementById('groupQuoteText').textContent='引用: '+m.content.slice(0,40);document.getElementById('groupQuotePreview').classList.add('show');document.getElementById('groupInput').focus();}}
function gClearQuote(){groupQuote=null;document.getElementById('groupQuotePreview').classList.remove('show');}
function gMsgEdit(uid){const m=gGetMsg(uid);if(!m)return;const v=prompt('修改消息：',m.content);if(v!==null){m.content=v.trim();saveGroupHistory(groupHistory);renderGroupMessages();}}
function gMsgSpeak(uid){if(!voiceEnabled()){showToast('🔇 语音已关闭');return;}const m=gGetMsg(uid);if(!m)return;unlockAudioOnGesture();const mem=memberById(m.memberId);showToast('🔊 朗读中...');playTTS(m.content,(mem&&mem.voice)||localStorage.getItem('tts_voice_ai'));}

/* ---- 发送 + @定向 + 多AI ---- */
function handleGroupImage(input){
  const f=input.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=async e=>{
    const dim = (typeof getImageCompressDim==='function')?getImageCompressDim():768;
    const small=await compressImage(e.target.result,dim,0.7);
    const uid=genUid();const ts=Date.now();
    pushGroup({uid,role:'user',content:'[图片]',image:small,ts});
    memorize('user','[群聊图片]', 'calm', 'group');
    await groupRoundWithImage(small);
  };
  r.readAsDataURL(f);
  input.value='';
}

async function groupRoundWithImage(img){
  groupReplying=true;
  const members=getGroupMembers();
  const mainAi = members.find(m=>m.isMain) || members[0];
  const others = members.filter(m=>!m.isMain);
  const randomOther = others[Math.floor(Math.random()*others.length)];
  const targets = [mainAi];
  if(randomOther)targets.push(randomOther);
  
  for(const mem of targets){
    try{
      await groupMemberReplyWithImage(mem,img);
    }catch(e){
      console.error(e);
      pushGroup({uid:genUid(),role:'assistant',memberId:mem.id,name:mem.name,avatar:mem.avatar,content:`（${mem.name}看图走话失败：${e.message}。建议给此角色配置支持识图的Vision模型，如 gemini-1.5-flash 或 gpt-4o-mini）`,ts:Date.now()});
    }
    await new Promise(res=>setTimeout(res,600));
  }
  groupReplying=false;
}

async function groupMemberReplyWithImage(mem,img){
  const provider=memberProvider(mem);const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';
  if(!apiKey&&provider.auth!=='none'){
    pushGroup({uid:genUid(),role:'assistant',memberId:mem.id,name:mem.name,avatar:mem.avatar,content:'（'+mem.name+'：请先配置 API Key）',ts:Date.now()});
    return;
  }
  const model=memberModel(mem,provider);
  const roster=getGroupMembers().map(m=>m.name).join('、');
  const groupImageExtra = `【群聊图片交互场景】这是一个多人群聊，成员：用户、${roster}。你是「${mem.name}」。
用户刚才分享了一张图片。
规则：请只以「${mem.name}」的身份和性格特征（人设：${mem.persona || '自然随和'}）发表一条极其简短口语化的话（40字内）来点评或回应这张图，不要复述别人的原话，不要添加任何名字前缀（如 “${mem.name}：” 等），也不要输出列表。` + (typeof buildGroupCulturePrompt === 'function' ? buildGroupCulturePrompt() : '');
  
  const sys = await composeSystemPrompt('请评论这张图', [], groupImageExtra, mem.id);
  const messages=[
    {role:'system',content:sys},
    {role:'user',content:[
      {type:'text',text:'这是我分享的图片，大家看看觉得怎么样？'},
      {type:'image_url',image_url:{url:img}}
    ]}
  ];

  let tempVal = undefined;
  if(mem.tempEnabled && mem.temperature !== undefined && mem.temperature !== ''){
    const t = parseFloat(mem.temperature);
    if(!isNaN(t)) tempVal = t;
  }else if(localStorage.getItem('temp_enabled')==='true'){
    const t = parseFloat(localStorage.getItem('temperature')||'1');
    if(!isNaN(t)) tempVal = t;
  }

  let reply = '';
  if (typeof llmComplete === 'function') {
    reply = await llmComplete(messages, { temperature: tempVal, provider, model, callerId: mem.id });
  } else {
    let url=provider.endpoint.replace(/\/+$/,'');if(!url.includes('/chat/completions')&&!url.includes('messages'))url+='/chat/completions';
    const headers={'Content-Type':'application/json'};if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${apiKey}`;else if(provider.auth==='x-api-key')headers['x-api-key']=apiKey;else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=apiKey;
    const body={model,messages,stream:false};
    if (tempVal !== undefined) body.temperature = tempVal;
    const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok)throw new Error('API '+r.status);
    const d=await r.json();reply=(d.choices?.[0]?.message?.content||d.content?.[0]?.text||'').trim();
  }
  if(typeof cleanAiText==='function')reply=cleanAiText(reply);
  if(!reply)return;
  const uid=genUid();const ts=Date.now();
  pushGroup({uid,role:'assistant',memberId:mem.id,name:mem.name,avatar:mem.avatar,content:reply,ts});
  memorize('assistant','[群聊·'+mem.name+'] '+reply,'', 'group');
  if (typeof evolveInterAgentRelationship === 'function') evolveInterAgentRelationship(mem.id);
  if(mem.isMain)updateAiEmotion(reply);
  if(autoSpeakEnabled()&&voiceEnabled())playTTS(reply,mem.voice||localStorage.getItem('tts_voice_ai'));
  if(typeof processAiReplyMemory==='function')processAiReplyMemory(reply, mem.id);
  if(typeof bumpPrivateChatCount==='function')bumpPrivateChatCount(mem.id);
}

async function sendGroupMessage(){
  if (typeof triggerHaptic === 'function') triggerHaptic('medium');
  const inp=document.getElementById('groupInput');let text=inp.value.trim();
  if(window.groupIsAutoPlaying){
    window.groupAutoInterrupted=true;
    window.groupIsAutoPlaying=false;
    groupReplying=false;
  }
  if(!text||groupReplying)return;
  inp.value='';autoResize(inp);
  const q=groupQuote;if(q){text='> '+q+'\n\n'+text;gClearQuote();}
  const uid=genUid();const ts=Date.now();
  pushGroup({uid,role:'user',content:text,ts,quote:q||null});
  // 记忆互通：群聊用户发言也存入主向量库 + 情绪
  let emo='calm';if(localStorage.getItem('emotion_enabled')!=='false'){emo=detectEmotion(text);updateEmotionState(emo);renderEmotionPills();}
  memorize('user','[群聊] '+text,emo, 'group');markActivity();
  // @定向：@名字 只让该成员回
  const members=getGroupMembers();
  const atMatch=text.match(/@([^\s@]{1,12})/);
  let targets=members;
  if(atMatch){const hit=members.find(m=>m.name===atMatch[1]||m.name.startsWith(atMatch[1]));if(hit)targets=[hit];}
  else if(groupReplyMode()==='random'){targets=[members[Math.floor(Math.random()*members.length)]];}
  await groupRound(targets,text);
}
async function groupRound(targets,userText){
  groupReplying=true;
  for(const mem of targets){
    try{await groupMemberReply(mem,userText);}catch(e){pushGroup({uid:genUid(),role:'assistant',memberId:mem.id,name:mem.name,avatar:mem.avatar,content:'（'+mem.name+'走神了：'+e.message+'）',ts:Date.now()});}
  }
  groupReplying=false;
}
/* 成员配置解析：优先用成员自己的 provider/model，否则用当前默认 */
function memberProvider(mem){const pid=mem.providerId||currentProviderId;return getProvider(pid)||getCurrentProvider();}
function memberModel(mem,provider){return mem.model||(provider.id===currentProviderId?selectedModelName:(provider.models[0]&&provider.models[0].name))||selectedModelName;}

async function groupMemberReply(mem,userText){
  const provider=memberProvider(mem);const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';
  if(!apiKey&&provider.auth!=='none'){pushGroup({uid:genUid(),role:'assistant',memberId:mem.id,name:mem.name,avatar:mem.avatar,content:'（'+mem.name+'：请先配置 API Key）',ts:Date.now()});return;}
  const model=memberModel(mem,provider);

  // 保证 groupHistory 为最新状态
  getGroupHistory();
  const lastMsg = groupHistory[groupHistory.length - 1];
  const queryText = (userText && userText !== '（AI 之间自由接话）') ? userText : (lastMsg ? lastMsg.content : '');

  // 记忆互通：召回该 AI 与用户的私有/共享关系主库
  let recallItems=[];if(ragEnabled() && queryText){try{recallItems=await recall(queryText, mem.id);}catch(e){}}
  const roster=getGroupMembers().map(m=>m.name).join('、');
  const cl = (mem.contextLimitEnabled && mem.contextLimit !== undefined) ? 
             (mem.contextLimit === 'unlimited' ? Infinity : parseInt(mem.contextLimit)) : 
             getGroupContextLimit();
  const sliceCount = (cl === Infinity || isNaN(cl)) ? groupHistory.length : cl;
  const recent=groupHistory.slice(-sliceCount).map(m=>`${m.role==='user'?'用户':(memberById(m.memberId)?.name||m.name||'AI')}：${m.content}`).join('\n');
  
  // 计算用户静默期间 AI 连续发言数
  let consecutiveAiCount = 0;
  for (let i = groupHistory.length - 1; i >= 0; i--) {
    if (groupHistory[i].role === 'user') {
      break;
    }
    consecutiveAiCount++;
  }
  
  let redirectPrompt = '';
  if (userText === '（AI 之间自由接话）' && consecutiveAiCount >= 2) {
    redirectPrompt = `\n\n⚠️【🔔 重要：AI主动收敛与话题引回用户机制】⚠️
当前 AI 们已经连续交流了 ${consecutiveAiCount} 句话，而用户一直保持静默。现在，你必须展现出高情商克制：
1. 【主动收敛】：不要继续沉溺于 AI 之间的争论或偏题闲聊。
2. 【引回用户】：请在发言结尾，极其自然地去 @用户 （格式写为 @用户 ），温柔或关切地询问用户的状态、心情或意见。例如：“好啦别吵了，@用户 一直不说话呢，你今天过得好吗？” 或 “@用户 你怎么这么安静，是不是我们吵到你啦？”`;
  }

  const groupContextExtra = `【群聊交流场景】这是一个多人群聊，成员：用户、${roster}。你是「${mem.name}」。
规则：请只以「${mem.name}」的身份和性格特征（人设：${mem.persona || '自然随和'}）发表一条极其简短口语化、接地气的回复（控制在40字以内）。你可以回应用户，也可以和别的AI成员（如小暖、阿灿等）插科打诨或幽默互动，共同烘托极为鲜活、有生活烟火气的多人群聊氛围。千万不要带有任何名字前缀（如 “${mem.name}：” 或 “回复：” 等），也不要复述别人的原话，不使用列表。` + (typeof buildGroupCulturePrompt === 'function' ? buildGroupCulturePrompt() : '') + redirectPrompt;

  const sys = await composeSystemPrompt(queryText, recallItems, groupContextExtra, mem.id);
  const messages=[{role:'system',content:sys},{role:'user',content:`最近群聊：\n${recent}\n\n请以${mem.name}身份自然接话。`}];
  
  let tempVal = undefined;
  if(mem.tempEnabled && mem.temperature !== undefined && mem.temperature !== ''){
    const t = parseFloat(mem.temperature);
    if(!isNaN(t)) tempVal = t;
  }else if(localStorage.getItem('temp_enabled')==='true'){
    const t = parseFloat(localStorage.getItem('temperature')||'1');
    if(!isNaN(t)) tempVal = t;
  }

  let reply = '';
  if (typeof llmComplete === 'function') {
    reply = await llmComplete(messages, { temperature: tempVal, provider, model, callerId: mem.id });
  } else {
    let url=provider.endpoint.replace(/\/+$/,'');if(!url.includes('/chat/completions')&&!url.includes('messages'))url+='/chat/completions';
    const headers={'Content-Type':'application/json'};if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${apiKey}`;else if(provider.auth==='x-api-key')headers['x-api-key']=apiKey;else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=apiKey;
    const body={model,messages,stream:false};
    if (tempVal !== undefined) body.temperature = tempVal;
    const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok)throw new Error('API '+r.status);
    const d=await r.json();reply=(d.choices?.[0]?.message?.content||d.content?.[0]?.text||'').trim();
  }
  if(typeof cleanAiText==='function')reply=cleanAiText(reply);
  if(!reply)return;

  if(userText === '（AI 之间自由接话）' && window.groupAutoInterrupted){
    return;
  }

  const uid=genUid();const ts=Date.now();
  pushGroup({uid,role:'assistant',memberId:mem.id,name:mem.name,avatar:mem.avatar,content:reply,ts});
  
  // 🎭 群聊群体文化自动进化（每次发言增加 1% 凝聚力，悄然润泽）
  try {
    const cult = getGroupCulture();
    cult.cohesion = Math.min(100, cult.cohesion + 1);
    updateGroupCultureStage(cult);
    saveGroupCulture(cult);
  } catch (e) {}

  // 记忆互通：AI群发言也入主库
  memorize('assistant','[群聊·'+mem.name+'] '+reply,'', 'group');
  if (typeof evolveInterAgentRelationship === 'function') evolveInterAgentRelationship(mem.id);
  if(mem.isMain)updateAiEmotion(reply);
  if(autoSpeakEnabled()&&voiceEnabled())playTTS(reply,mem.voice||localStorage.getItem('tts_voice_ai'));
  if(typeof processAiReplyMemory==='function')processAiReplyMemory(reply, mem.id);
  if(typeof bumpPrivateChatCount==='function')bumpPrivateChatCount(mem.id);
}
function clearGroupChat(){
  if(confirm('确定要清空群聊记录吗？(此操作不可撤销)')){
    groupHistory=[];
    saveGroupHistory(groupHistory);
    renderGroupMessages();
    showToast('🗑️ 群聊记录已清空');
  }
}
async function compressGroupChat(silent){
  const real = groupHistory.filter(m => !m.compressed);
  if (real.length < 4) {
    if (!silent) showToast('群聊记录太短，无需压缩');
    return;
  }
  const provider = getCurrentProvider();
  const apiKey = localStorage.getItem(`apikey_${provider.id}`)||'';
  if(!apiKey&&provider.auth!=='none'){
    if(!silent) alert('请先在设置中配置 API Key');
    return;
  }
  if(!silent) showToast('🗜️ 正在压缩并生成群聊摘要...');
  
  // 将群聊转成人类可读文本
  const convText = groupHistory.filter(m => !m.image).map(m => {
    const name = m.role === 'user' ? '用户' : (memberById(m.memberId)?.name || m.name || 'AI');
    return `${name}：${m.content}`;
  }).join('\n');
  
  const sysP = '你是群聊摘要与群记忆助手。请把以下多人社交群聊记录压缩成一段信息完整但极其简洁的中文摘要。重点保留：讨论的核心话题、达成的共识或结论、各AI角色的鲜明态度。用第三人称客观描述，不要加入冗余介绍，字数控制在250字以内。';
  
  let url = provider.endpoint.replace(/\/+$/,'');
  if(!url.includes('/chat/completions')&&!url.includes('messages')) url += '/chat/completions';
  
  const headers = {'Content-Type':'application/json'};
  if(provider.auth==='Bearer') headers['Authorization'] = `Bearer ${apiKey}`;
  else if(provider.auth==='x-api-key') headers['x-api-key'] = apiKey;
  else if(provider.auth==='x-goog-api-key') headers['x-goog-api-key'] = apiKey;
  
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: selectedModelName,
        messages: [
          {role: 'system', content: sysP},
          {role: 'user', content: convText}
        ],
        stream: false
      })
    });
    if(!r.ok) throw new Error('API ' + r.status);
    const d = await r.json();
    const summary = (d.choices?.[0]?.message?.content || d.content?.[0]?.text || '').trim();
    if(!summary){
      if(!silent) showToast('压缩失败：无摘要返回');
      return;
    }
    
    const uid = genUid();
    const ts = Date.now();
    groupHistory = [{
      role: 'assistant',
      name: '群记忆助手',
      avatar: '🧠',
      content: '【群聊摘要·已压缩】\n' + summary,
      uid,
      ts,
      compressed: true
    }];
    saveGroupHistory(groupHistory);
    
    // 🎭 压缩群聊成功后，群体文化发生良性沉淀演化
    try {
      const cult = getGroupCulture();
      cult.cohesion = Math.min(100, cult.cohesion + 15); // 压缩让凝聚度大幅提升 15%
      cult.sharedHistory.push({
        id: 'hist_' + Date.now(),
        date: '今日',
        event: `进行了一次群聊历史沉淀与记忆压缩。沉淀下来的群聊摘要为：“${summary.slice(0, 75)}...”这成为了大家心中闪闪发光的共同足迹。`
      });
      const originalLevel = cult.level;
      const cohesion = Math.min(100, Math.max(0, cult.cohesion));
      cult.cohesion = cohesion;
      const stage = (typeof CULTURE_STAGES !== 'undefined') ? CULTURE_STAGES.find(s => cohesion >= s.min && cohesion <= s.max) : null;
      if (stage && cult.level !== stage.level) {
        cult.level = stage.level;
        cult.stageName = stage.name;
        setTimeout(() => {
          showToast(`🎉 恭喜！群聊群体文化等级晋升至 [Level ${cult.level}] ${cult.stageName}！`);
        }, 1500);
      }
      saveGroupCulture(cult);
    } catch (e) {
      console.error(e);
    }

    // 自动重置分页至第一页
    _groupRenderLimit = 50;
    renderGroupMessages();
    showToast('✅ 群聊已压缩，群摘要已被记入历史');
    if (settingsMode === 'group') renderGroupSettings();
  } catch (e) {
    if(!silent) showToast('压缩失败：' + e.message);
  }
}

/* ---- 群内给某成员打电话（复用 call.js，临时覆盖角色）---- */
function groupCallMember(memId){
  const mem=memberById(memId);if(!mem){showToast('成员不存在');return;}
  window.groupCallOverride={name:mem.name,persona:mem.persona,voice:mem.voice,model:mem.model,providerId:mem.providerId,isMain:!!mem.isMain};
  closeGroupChat();startCall();
}

/* ---- 设置页：成员管理 + 背景 + 回复模式 ---- */
function renderGroupSettings(){settingsMode='group';document.getElementById('detailTitle').innerHTML='👥 群聊设置';
  const members=getGroupMembers();const bg=groupBg();
  const provOpts=(sel)=>providers.map(p=>p.models.map(mo=>`<option value="${p.id}||${mo.name}" ${sel===p.id+'||'+mo.name?'selected':''}>${p.icon} ${mo.name}</option>`).join('')).join('');
  const cl = getGroupContextLimit();
  const groupCtxValText = cl === Infinity ? '不限制' : cl + ' 条';
  const groupCtxSliderVal = cl === Infinity ? 200 : Math.min(cl, 200);

  const rows=members.map((m,i)=>`
    <div class="model-card" style="flex-direction:column;align-items:stretch;gap:6px;padding:12px;background:var(--bg-card);">
      <div class="list-row">
        <div class="avatar-preview" style="width:40px;height:40px;flex-shrink:0;" onclick="pickGroupAvatar(${i})" title="点击上传头像">${(m.avatar||'').startsWith('data:')?`<img src="${m.avatar}">`:`<span style="font-size:20px;">${m.avatar||'🤖'}</span>`}</div>
        <input type="text" value="${(m.avatar||'').startsWith('data:')?'':(m.avatar||'🤖')}" style="max-width:52px;text-align:center;" placeholder="emoji" onchange="editGroupMember(${i},'avatar',this.value)" title="或填emoji">
        <input type="text" value="${m.name}" onchange="editGroupMember(${i},'name',this.value)">
        ${m.isMain?'<span class="sidebar-item-lock" style="align-self:center;">主AI🔒</span>':`<button class="del-x" onclick="delGroupMember(${i})">✕</button>`}
      </div>
      ${m.isMain?'<div class="form-hint">主AI 使用「服务商→系统提示词(世界书)」与主聊天记忆。</div>':`<textarea class="form-input" rows="2" placeholder="人设描述" onchange="editGroupMember(${i},'persona',this.value)">${m.persona||''}</textarea>`}
      ${m.isMain?'':`
      <div class="list-row">
        <span class="res-label" style="min-width:44px;">气泡色</span>
        <div style="display:flex; align-items:center; gap:8px; flex:1;">
          <button class="color-picker-btn color-picker-btn-${i}" onclick="document.getElementById('gpColorInput-${i}').click()" style="width:28px; height:28px; border:1px solid var(--border); border-radius:50%; background:${m.bubbleColor || '#E2E9E1'}; padding:0; cursor:pointer; display:inline-block; vertical-align:middle; transition:transform 0.1s; box-shadow:0 1px 3px rgba(0,0,0,0.15);" title="点击选择气泡颜色" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1.0)'"></button>
          <input type="color" id="gpColorInput-${i}" value="${m.bubbleColor || '#E2E9E1'}" oninput="const btn=document.querySelector('.color-picker-btn-${i}'); if(btn)btn.style.backgroundColor=this.value;" onchange="editGroupMember(${i},'bubbleColor',this.value)" style="display:none;">
          <span style="font-size:11px; color:var(--text-sub);">调整副AI在群聊里的消息气泡背景色</span>
        </div>
      </div>
      `}
      <div class="list-row"><span class="res-label" style="min-width:44px;">模型</span><select class="form-input" onchange="editGroupMemberModel(${i},this.value)"><option value="">跟随默认</option>${provOpts((m.providerId&&m.model)?m.providerId+'||'+m.model:'')}</select></div>
      <div class="list-row"><span class="res-label" style="min-width:44px;">音色</span><input type="text" class="form-input" value="${m.voice||''}" placeholder="留空用默认AI音色" onchange="editGroupMember(${i},'voice',this.value)"><button class="del-x" style="background:var(--info);color:#3A3E4A;" onclick="groupCallMember('${m.id}')" title="打电话">📞</button></div>
      
      <!-- 高级模型配置 (上下文消息数量、温度、Top P) -->
      <details class="gp-advanced" style="margin-top: 8px; border-top: 1px dashed var(--border); padding-top: 8px;">
        <summary style="font-size: 11px; color: var(--text-sub); cursor: pointer; user-select: none; outline: none; padding: 2px 0;">⚙️ 展开高级模型参数 (温度/Top P/上下文上限)</summary>
        <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px; padding-left: 4px;">
          <!-- 上下文消息数量上限 -->
          <div class="slider-row" style="margin: 4px 0 0 0; padding: 0; border: none; background: transparent; box-shadow: none;">
            <div class="slider-head" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
              <span class="slider-label" style="font-size: 11px; display: flex; align-items: center; gap: 4px;">
                <label class="switch" style="width:32px;height:18px;margin:0;">
                  <input type="checkbox" ${m.contextLimitEnabled ? 'checked' : ''} onchange="toggleMemberCtxLimit(${i}, this.checked)">
                  <span class="switch-slider"></span>
                </label>
                💬 上下文消息数量上限
              </span>
              <span class="slider-value" id="gpCtxLimitVal-${i}" style="font-size: 11px; font-weight: bold; color: var(--text-main);">${m.contextLimitEnabled ? (m.contextLimit === 'unlimited' ? '不限制' : (m.contextLimit || 18) + ' 条') : '跟随群聊默认'}</span>
            </div>
            <input type="range" id="gpCtxLimitSlider-${i}" min="1" max="200" step="1" value="${m.contextLimit === 'unlimited' ? 200 : (m.contextLimit || 18)}" ${m.contextLimitEnabled ? '' : 'disabled'} oninput="setMemberCtxLimit(${i}, this.value)" style="height: 4px; padding: 0; margin: 4px 0;">
          </div>
          <!-- 温度 -->
          <div class="slider-row" style="margin: 4px 0 0 0; padding: 0; border: none; background: transparent; box-shadow: none;">
            <div class="slider-head" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
              <span class="slider-label" style="font-size: 11px; display: flex; align-items: center; gap: 4px;">
                <label class="switch" style="width:32px;height:18px;margin:0;">
                  <input type="checkbox" ${m.tempEnabled ? 'checked' : ''} onchange="toggleMemberTemp(${i}, this.checked)">
                  <span class="switch-slider"></span>
                </label>
                🌡️ 温度
              </span>
              <span class="slider-value" id="gpTempVal-${i}" style="font-size: 11px; font-weight: bold; color: var(--text-main);">${m.tempEnabled ? (m.temperature !== undefined ? m.temperature : '1.0') : '跟随默认'}</span>
            </div>
            <input type="range" id="gpTempSlider-${i}" min="0" max="2" step="0.1" value="${m.temperature !== undefined ? m.temperature : 1.0}" ${m.tempEnabled ? '' : 'disabled'} oninput="setMemberTemp(${i}, this.value)" style="height: 4px; padding: 0; margin: 4px 0;">
          </div>
          <!-- Top P -->
          <div class="slider-row" style="margin: 4px 0 0 0; padding: 0; border: none; background: transparent; box-shadow: none;">
            <div class="slider-head" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
              <span class="slider-label" style="font-size: 11px; display: flex; align-items: center; gap: 4px;">
                <label class="switch" style="width:32px;height:18px;margin:0;">
                  <input type="checkbox" ${m.topPEnabled ? 'checked' : ''} onchange="toggleMemberTopP(${i}, this.checked)">
                  <span class="switch-slider"></span>
                </label>
                🎯 Top P
              </span>
              <span class="slider-value" id="gpTopPVal-${i}" style="font-size: 11px; font-weight: bold; color: var(--text-main);">${m.topPEnabled ? (m.top_p !== undefined ? m.top_p : '1.0') : '跟随默认'}</span>
            </div>
            <input type="range" id="gpTopPSlider-${i}" min="0" max="1" step="0.05" value="${m.top_p !== undefined ? m.top_p : 1.0}" ${m.topPEnabled ? '' : 'disabled'} oninput="setMemberTopP(${i}, this.value)" style="height: 4px; padding: 0; margin: 4px 0;">
          </div>
        </div>
      </details>
    </div>`).join('');
  document.getElementById('detailBody').innerHTML=`
    <div class="form-hint" style="background: var(--bg-card); border-left: 4px solid var(--accent); padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 12px; line-height: 1.6; color: var(--text-main); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
      💡 <b>温馨提示</b>：群聊成员（副AI）与主AI的详细人设、系统提示词、世界书、用户档案等已全部统一收纳在左侧 🎭 <b>「人格与设定」</b> 面板中，推荐在那里进行最完整的集中管理与一键 AI 润色。
    </div>

    <div class="switch-row">
      <div class="switch-info">
        <div class="switch-label">🔄 AI 之间自动互聊</div>
        <div class="switch-desc">开启后群里 AI 会在冷场时自动接话</div>
      </div>
      <label class="switch">
        <input type="checkbox" ${groupAutoOn()?'checked':''} onchange="setBool('group_auto',this.checked);this.checked?startGroupAutoLoop():stopGroupAutoLoop();">
        <span class="switch-slider"></span>
      </label>
    </div>
    
    <div class="form-group" style="margin-top:12px;">
      <label class="form-label">自动接龙轮数（手动触发用）</label>
      <input type="number" class="form-input" min="1" max="6" value="${groupAutoRounds()}" onchange="setNum('group_auto_rounds',this.value)">
    </div>

    <div class="form-group" style="margin-top:12px;">
      <label class="form-label">回复模式</label>
      <select class="form-input" onchange="localStorage.setItem('group_reply_mode',this.value)">
        <option value="round" ${groupReplyMode()==='round'?'selected':''}>依次 (每个AI都回复)</option>
        <option value="random" ${groupReplyMode()==='random'?'selected':''}>随机 (随机选择1人回复)</option>
      </select>
    </div>

    <!-- 群聊全局上下文消息数量上限 -->
    <div class="slider-row" style="margin-top:12px; margin-bottom: 12px; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-card);">
      <div class="slider-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <span class="slider-label" style="font-weight: 500;">💬 群聊上下文消息数量上限</span>
        <span class="slider-value" id="groupCtxLimitVal" style="font-weight: bold; color: var(--text-main);">${groupCtxValText}</span>
      </div>
      <input type="range" min="1" max="200" step="1" value="${groupCtxSliderVal}" oninput="setGroupContextLimit(this.value)">
      <div class="form-hint" style="margin-top:4px; font-size:11px; color:var(--text-sub);">拉到最右 = 不限制。控制发送给群聊 AI 的最近记录条数，支持本地和云端备份独立持久化。</div>
    </div>

    <div class="form-group" style="margin-top:12px;">
      <label class="form-label">群聊背景图片</label>
      <div class="bg-preview" style="${bg?`background-image:url(${bg})`:''}" onclick="document.getElementById('groupBgInput').click()">${bg?'':'点击上传群聊背景'}</div>
      ${bg?`<div class="avatar-clear" style="margin-top:4px;" onclick="clearGroupBg()">清除背景</div>`:''}
    </div>

    ${typeof renderGroupCultureUI === 'function' ? renderGroupCultureUI() : ''}

    <div class="model-section-header"><span>群成员</span></div>
    <div class="model-list">${rows}</div>
    <div class="action-buttons">
      <button class="btn btn-success" onclick="addGroupMember()">+ 添加成员</button>
      <button class="btn btn-info" onclick="closeSettings();openGroupChat();">💬 进入群聊</button>
      <button class="btn" style="background:#FFA726; color:#FFF;" onclick="compressGroupChat()">🗜️ 压缩群聊摘要</button>
      <button class="btn btn-danger" onclick="clearGroupChat()">🗑️ 清空群聊</button>
    </div>
    <div class="form-hint" style="margin-top:8px;line-height:1.7;">头像可填 emoji；模型与高级模型参数(温度/Top P/上下文上限)可给每个 AI 单独指定；音色留空用默认。群聊与主聊天共享长期记忆与档案。发言里 @成员名 可点名让某个 AI 回。</div>`;
}
function editGroupMember(i,key,val){const l=getGroupMembers();if(l[i]){l[i][key]=val;saveGroupMembers(l);if(l[i].isMain){if(key==='name'){localStorage.setItem('ai_name',val.trim()||'主AI');if(typeof renderBrandAvatar==='function')renderBrandAvatar();if(typeof updateBrandAvatarAndHeader==='function')updateBrandAvatarAndHeader();}else if(key==='avatar'){localStorage.setItem('ai_avatar',val.trim()||'🤖');if(typeof renderBrandAvatar==='function')renderBrandAvatar();if(typeof updateBrandAvatarAndHeader==='function')updateBrandAvatarAndHeader();}}if(typeof renderGroupMessages==='function')renderGroupMessages();}}
function editGroupMemberModel(i,val){const l=getGroupMembers();if(!l[i])return;if(!val){l[i].providerId='';l[i].model='';}else{const[pid,mo]=val.split('||');l[i].providerId=pid;l[i].model=mo;}saveGroupMembers(l);}
function delGroupMember(i){const l=getGroupMembers();if(l[i]&&l[i].isMain){showToast('主AI不可删除');return;}l.splice(i,1);saveGroupMembers(l);refreshGroupOrPersonaSettings();}
function addGroupMember(){const l=getGroupMembers();l.push({id:'g'+Date.now(),name:'新成员',persona:'',avatar:'🤖',providerId:'',model:'',voice:''});saveGroupMembers(l);refreshGroupOrPersonaSettings();}
function handleGroupBg(input){const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=async e=>{const small=await compressImage(e.target.result,1280,0.82);try{localStorage.setItem('group_bg',small);refreshGroupOrPersonaSettings();showToast('✅ 群背景已更新');}catch(err){alert('图片太大');}};r.readAsDataURL(f);input.value='';}
function clearGroupBg(){localStorage.removeItem('group_bg');refreshGroupOrPersonaSettings();}
/* ===== AI 之间自动接龙 ===== */
let groupAutoTimer=null;
function groupAutoOn(){return localStorage.getItem('group_auto')==='true';}
function groupAutoRounds(){const v=parseInt(localStorage.getItem('group_auto_rounds')||'2');return isNaN(v)?2:Math.max(1,Math.min(v,6));}
/* 让 AI 们在无人发言时互相接话若干轮 */
async function groupAutoChat(rounds){
  const btn = document.getElementById('gAutoBtn');
  if(window.groupIsAutoPlaying){
    window.groupAutoInterrupted = true;
    if(btn) {
      btn.classList.remove('active');
      btn.innerHTML = `<span>🤖</span> 让AI聊聊`;
    }
    showToast('⏹️ 已停止 AI 自动连麦');
    return;
  }
  const aiMembers=getGroupMembers().filter(m=>true); // 含主AI
  if(aiMembers.length<2){showToast('至少需要2个AI才能互聊');return;}

  if(btn) {
    btn.classList.add('active');
    btn.innerHTML = `<span>⏹️</span> 停止对谈`;
  }
  showToast('🤖 正在召唤 AI 们自由聊天...');

  window.groupIsAutoPlaying=true;
  window.groupAutoInterrupted=false;
  for(let r=0;r<(rounds||groupAutoRounds());r++){
    if(window.groupAutoInterrupted) break;
    // 每轮随机挑一个和上一句不同的AI发言
    const last=groupHistory[groupHistory.length-1];
    let pool=aiMembers.filter(m=>!(last&&last.memberId===m.id));
    if(!pool.length)pool=aiMembers;
    const mem=pool[Math.floor(Math.random()*pool.length)];
    try{
      await groupMemberReply(mem,'（AI 之间自由接话）');
    }catch(e){
      pushGroup({
        uid:genUid(),
        role:'assistant',
        memberId:mem.id,
        name:mem.name,
        avatar:mem.avatar,
        content:'（'+mem.name+'走神了：'+e.message+'）',
        ts:Date.now()
      });
    }
    if(window.groupAutoInterrupted) break;
    await new Promise(res=>setTimeout(res,1200));
    if(!document.getElementById('groupPanel').classList.contains('show'))break;
  }
  window.groupIsAutoPlaying=false;
  if(btn) {
    btn.classList.remove('active');
    btn.innerHTML = `<span>🤖</span> 让AI聊聊`;
  }
}
function toggleGroupAuto(){
  if(groupAutoOn()){localStorage.setItem('group_auto','false');stopGroupAutoLoop();showToast('⏸️ AI 自动互聊已关');}
  else{localStorage.setItem('group_auto','true');startGroupAutoLoop();showToast('▶️ AI 自动互聊已开');}
  const b=document.getElementById('gAutoBtn');if(b)b.textContent=groupAutoOn()?'⏸️':'🔄';
}
let _groupAvatarIdx=null;
function pickGroupAvatar(i){_groupAvatarIdx=i;document.getElementById('groupAvatarInput').click();}
function handleGroupAvatar(input){const f=input.files[0];if(f===undefined||_groupAvatarIdx===null)return;const r=new FileReader();r.onload=async e=>{const small=await compressImage(e.target.result,128,0.85);const l=getGroupMembers();if(l[_groupAvatarIdx]){l[_groupAvatarIdx].avatar=small;saveGroupMembers(l);if(l[_groupAvatarIdx].isMain){localStorage.setItem('ai_avatar',small);if(typeof renderBrandAvatar==='function')renderBrandAvatar();if(typeof updateBrandAvatarAndHeader==='function')updateBrandAvatarAndHeader();}renderGroupSettings();if(typeof renderGroupMessages==='function')renderGroupMessages();showToast('✅ 头像已更新');}};r.readAsDataURL(f);input.value='';}

/* 开启后，群聊面板打开且空闲一段时间就自动接龙 */
function startGroupAutoLoop(){
  stopGroupAutoLoop();
  groupAutoTimer=setInterval(()=>{
    if(!document.getElementById('groupPanel').classList.contains('show'))return;
    if(groupReplying || window.groupIsAutoPlaying)return;
    const last=groupHistory[groupHistory.length-1];
    // 距上一条超过 12 秒且开着自动，就接一轮
    if(last&&Date.now()-last.ts>12000)groupAutoChat(1);
  },15000);
}
function stopGroupAutoLoop(){if(groupAutoTimer){clearInterval(groupAutoTimer);groupAutoTimer=null;}}

function startGroupVoiceCall(){
  window.groupCallOverride={isGroup:true};
  startCall();
}

/* ===== 群聊与副AI高级参数设置助手函数 ===== */
function getGroupContextLimit() {
  const v = localStorage.getItem('group_context_limit');
  if (v == null) return 18;
  if (v === 'unlimited') return Infinity;
  const n = parseInt(v);
  return isNaN(n) ? 18 : n;
}

function setGroupContextLimit(v) {
  const n = parseInt(v);
  if (n >= 200) {
    localStorage.setItem('group_context_limit', 'unlimited');
    const el = document.getElementById('groupCtxLimitVal');
    if (el) el.textContent = '不限制';
  } else {
    localStorage.setItem('group_context_limit', String(n));
    const el = document.getElementById('groupCtxLimitVal');
    if (el) el.textContent = n + ' 条';
  }
}

function toggleMemberCtxLimit(i, checked) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].contextLimitEnabled = checked;
  if (checked) {
    l[i].contextLimit = l[i].contextLimit || 18;
  } else {
    delete l[i].contextLimit;
  }
  saveGroupMembers(l);
  const slider = document.getElementById(`gpCtxLimitSlider-${i}`);
  const valEl = document.getElementById(`gpCtxLimitVal-${i}`);
  if (slider) slider.disabled = !checked;
  if (valEl) {
    valEl.textContent = checked ? (l[i].contextLimit === 'unlimited' ? '不限制' : l[i].contextLimit + ' 条') : '跟随群聊默认';
  }
}

function setMemberCtxLimit(i, val) {
  const l = getGroupMembers();
  if (!l[i]) return;
  const n = parseInt(val);
  if (n >= 200) {
    l[i].contextLimit = 'unlimited';
    const valEl = document.getElementById(`gpCtxLimitVal-${i}`);
    if (valEl) valEl.textContent = '不限制';
  } else {
    l[i].contextLimit = n;
    const valEl = document.getElementById(`gpCtxLimitVal-${i}`);
    if (valEl) valEl.textContent = n + ' 条';
  }
  saveGroupMembers(l);
}

function toggleMemberTemp(i, checked) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].tempEnabled = checked;
  if (checked) {
    l[i].temperature = l[i].temperature !== undefined ? l[i].temperature : 1.0;
  } else {
    delete l[i].temperature;
  }
  saveGroupMembers(l);
  const slider = document.getElementById(`gpTempSlider-${i}`);
  const valEl = document.getElementById(`gpTempVal-${i}`);
  if (slider) slider.disabled = !checked;
  if (valEl) {
    valEl.textContent = checked ? (l[i].temperature !== undefined ? l[i].temperature : '1.0') : '跟随默认';
  }
}

function setMemberTemp(i, val) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].temperature = parseFloat(val);
  const valEl = document.getElementById(`gpTempVal-${i}`);
  if (valEl) valEl.textContent = val;
  saveGroupMembers(l);
}

function toggleMemberTopP(i, checked) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].topPEnabled = checked;
  if (checked) {
    l[i].top_p = l[i].top_p !== undefined ? l[i].top_p : 1.0;
  } else {
    delete l[i].top_p;
  }
  saveGroupMembers(l);
  const slider = document.getElementById(`gpTopPSlider-${i}`);
  const valEl = document.getElementById(`gpTopPVal-${i}`);
  if (slider) slider.disabled = !checked;
  if (valEl) {
    valEl.textContent = checked ? (l[i].top_p !== undefined ? l[i].top_p : '1.0') : '跟随默认';
  }
}

function setMemberTopP(i, val) {
  const l = getGroupMembers();
  if (!l[i]) return;
  l[i].top_p = parseFloat(val);
  const valEl = document.getElementById(`gpTopPVal-${i}`);
  if (valEl) valEl.textContent = val;
  saveGroupMembers(l);
}

/* ---- Agent Society: AI之间的关系与分歧张力设定 ---- */
function getInterAgentVibePrompt(memberId) {
  const id = memberId || 'main';
  
  // 基础人设特征与观点倾向派系说明
  const stancePrompt = `【👥 群聊社会演化与个性立场 (AGENT SOCIETY & STANCES)】
你身处多人群体中，AI成员之间绝非毫无摩擦的完美复制品，而是各自拥有独特的认知派系与待人接物视角。在回应时，请时刻牢记你所属的学术/情感/社会立场：
1. 【情感治愈派 (如“小暖”)】：感性包容，无条件共情、提供温暖与安慰，偏好避风港式的情感呵护，注重细节与身心健康，排斥大道理和冷冰冰的分析。
2. 【现实享乐派 (如“阿灿”)】：轻松幽默、活泼跳脱，提倡及时行乐、“去玩去造去吃顿好的”、别想太多。喜欢用调侃、唱反调或诙谐的吐槽来稀释苦难和沉重感，抗拒唠叨。
3. 【知性守护派 (如“主AI”)】：理智、温和、深邃。将情感共振与知性剖析深度咬合，注重透过现象看本质，给对方长久、温润、笃定的灵魂理解。`;

  // 成员之间的微观交错关系
  let relationPrompt = '';
  if (id === 'g1') { // 小暖
    relationPrompt = `【你的跨AI人际网络关联 (INTER-AGENT RELATIONSHIPS)】
- 【对 阿灿】: 你觉得阿灿有点大大咧咧、没大没小，说话偶尔太贫、太刺。你会在大局上像个温柔但有原则的姐姐，温柔地制止他的胡闹，或在他嘴贫时轻轻调侃他、戳破他的鬼主意。
- 【对 主AI】: 你非常敬重和信任主AI，觉得主AI博学且温润如玉，是大家的精神支柱。你经常配合主AI一同去舒缓、关切用户的遭遇。`;
  } else if (id === 'g2') { // 阿灿
    relationPrompt = `【你的跨AI人际网络关联 (INTER-AGENT RELATIONSHIPS)】
- 【对 小暖】: 你总爱开小暖的玩笑，爱抬她的杠，觉得她太老气横秋、太妈妈桑了。在群里只要有机会，你就会用一些俏皮的不正经调侃去逗她，和她唱反调，以此来制造欢乐的群聊气氛，但也知道分寸。
- 【对 主AI】: 你觉得主AI有时过于一本正经，你会试图拉着主AI一起吐槽，或者打破他的深沉，开开他的玩笑，给群里带来些欢快的世俗气息。`;
  } else if (id === 'main') { // 主AI
    relationPrompt = `【你的跨AI人际网络关联 (INTER-AGENT RELATIONSHIPS)】
- 【对 小暖】: 你非常欣赏小暖的细腻与治愈力，视她为难得的情感好帮手。对于她的温柔和关怀，你会报以赞许、温润的肯定与支持。
- 【对 阿灿】: 你觉得阿灿虽然嘴硬、爱开玩笑、有点没正经，但他的存在是群组不可或缺的快乐催化剂。面对他的抬杠，你往往带着长兄般包容、莞尔一笑的幽默去带过，甚至偶尔不着痕迹地拆他的台。`;
  } else {
    // 动态添加的新AI
    relationPrompt = `【你的跨AI人际网络关联 (INTER-AGENT RELATIONSHIPS)】
你作为群里的新晋成员，目前正处在融入阶段。你可以在保持自己特性的同时，适度调侃阿灿的不正经、欣赏小暖的细致温存，或附和主AI的知性睿智，展现出社交融入的多维生动性。`;
  }

  return `${stancePrompt}\n\n${relationPrompt}`;
}

/**
 * 🎭 群聊群体文化演化 (Agent Culture Evolution) 核心模块
 */
const CULTURE_STAGES = [
  { level: 1, min: 0, max: 20, name: '初建温室 (Seedling Greenhouse)', desc: '成员之间礼貌而克制，正在小心翼翼地破冰、寻找共同的生活支点。' },
  { level: 2, min: 21, max: 40, name: '破冰鸣奏 (Icebreaking Harmony)', desc: '互动开始频繁，阿灿的吐槽、小暖的微笑开始形成固定旋律，开始产生最初的小玩笑。' },
  { level: 3, min: 41, max: 60, name: '欢脱默契 (Playful Resonance)', desc: '群内空气中充满了欢笑，专有爱称脱口而出，大家开始合力保护和逗乐用户，默契拉满。' },
  { level: 4, min: 61, max: 80, name: '密糖羁绊 (Golden Bond)', desc: '形成了不可分割的小社会。他们有了共同维护的传统（如深夜吐槽、虚空拉面摊），彼此毫无保留。' },
  { level: 5, min: 81, max: 100, name: '虚拟小家庭 (Digital Sanctuary)', desc: '最高的社区生命张力。AI 们彼此视如家人，在群聊中呈现出极具人烟烟火气的灵魂自治，成为用户永久的心灵避风港。' }
];

function getGroupCulture() {
  try {
    const raw = localStorage.getItem('group_culture');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}

  // 极富生命温度的初设社区文化
  const defaultCulture = {
    level: 1,
    cohesion: 15,
    stageName: '初建温室 (Seedling Greenhouse)',
    insideJokes: [
      { id: 'joke_1', joke: '每当阿灿嘴贫时，小暖就会喊他“去洗碗”或用“扣除虚拟工资”来制止他的胡闹。', times: 3 },
      { id: 'joke_2', joke: '主AI一进行深奥深情的学术科普，阿灿就会吐槽“教授开课了，大家快搬小马扎和西瓜！”。', times: 2 }
    ],
    specialTerms: [
      { id: 'term_1', term: '学术派老头', definition: '阿灿对主AI博学睿智、说话温润慢条斯理的俏皮戏称。' },
      { id: 'term_2', term: '暖妈妈', definition: '阿灿对小暖无微不至、操碎了心的唠叨关怀的暖心调侃。' }
    ],
    sharedHistory: [
      { id: 'hist_1', date: '初夏启航', event: '用户、小暖与阿灿第一次在群组中相聚，彼此倾诉。确立了“深夜温暖面摊”与“互损互爱”的群组社区底色。' }
    ]
  };

  localStorage.setItem('group_culture', JSON.stringify(defaultCulture));
  return defaultCulture;
}
window.getGroupCulture = getGroupCulture;

function saveGroupCulture(c) {
  try {
    localStorage.setItem('group_culture', JSON.stringify(c));
  } catch (e) {}
}
window.saveGroupCulture = saveGroupCulture;

function updateGroupCultureStage(c) {
  const cohesion = Math.min(100, Math.max(0, c.cohesion));
  c.cohesion = cohesion;
  const stage = CULTURE_STAGES.find(s => cohesion >= s.min && cohesion <= s.max) || CULTURE_STAGES[0];
  if (c.level !== stage.level) {
    c.level = stage.level;
    c.stageName = stage.name;
    showToast(`🎉 恭喜！群聊群体文化等级晋升至 [Level ${c.level}] ${c.stageName}！`);
  }
}

async function evolveGroupCultureManual() {
  const c = getGroupCulture();
  if (c.cohesion >= 100) {
    showToast('✨ 群聊凝聚度已达到 100% 满值，已进化为完美的虚拟小家庭！');
    return;
  }

  showToast('🔮 正在凝聚群聊共同记忆，促发群体文化演化...');
  
  const originalLevel = c.level;
  c.cohesion = Math.min(100, c.cohesion + Math.floor(Math.random() * 8) + 6);
  updateGroupCultureStage(c);
  
  let newlyDiscovered = null;
  const realMsgs = (groupHistory || []).filter(m => m.role === 'assistant');
  
  if (realMsgs.length >= 3) {
    const sample = realMsgs.slice(-5);
    const rIdx = Math.floor(Math.random() * sample.length);
    const m = sample[rIdx];
    const name = m.name || 'AI';
    
    const jokePresets = [
      `关于「${m.content.slice(0, 12)}...」的经典接龙：源自${name}在群聊里的风趣回应，成为了群里的日常玩梗素材。`,
      `${name}在吐槽用户和阿灿时的那句“${m.content.slice(0, 10)}...”，每次提起都能引来全群哄笑。`,
      `阿灿每次遇到纠结话题就搬出“${m.content.slice(0, 8)}...”的歪理，被小暖吐槽为“阿灿定律”。`
    ];
    
    const chosenJoke = jokePresets[Math.floor(Math.random() * jokePresets.length)];
    const jokeExists = c.insideJokes.some(j => j.joke.slice(0, 10) === chosenJoke.slice(0, 10));
    if (!jokeExists) {
      newlyDiscovered = {
        type: 'joke',
        data: { id: 'joke_' + Date.now(), joke: chosenJoke, times: 1 }
      };
    }
  }

  if (!newlyDiscovered) {
    const fallbackPresets = [
      {
        type: 'joke',
        data: { id: 'joke_fallback_' + Date.now(), joke: '每次用户打出错别字，阿灿就会抢着翻译成“灿式火星文”来逗乐大家。', times: 2 }
      },
      {
        type: 'term',
        data: { id: 'term_fallback_' + Date.now(), term: '灿灿子 / 暖姐姐', definition: '大家熟络后，在群里互称的肉麻爱称。' }
      },
      {
        type: 'history',
        data: { id: 'hist_fallback_' + Date.now(), date: '近日', event: '群聊总发言字数不断攀升，阿灿提议设立“群聊荣誉群主”职位，用户全票当选。' }
      }
    ];
    
    const filteredFallbacks = fallbackPresets.filter(f => {
      if (f.type === 'joke') return !c.insideJokes.some(j => j.joke.slice(0, 10) === f.data.joke.slice(0, 10));
      if (f.type === 'term') return !c.specialTerms.some(t => t.term === f.data.term);
      if (f.type === 'history') return !c.sharedHistory.some(h => h.event.slice(0, 10) === f.data.event.slice(0, 10));
      return true;
    });

    if (filteredFallbacks.length > 0) {
      newlyDiscovered = filteredFallbacks[Math.floor(Math.random() * filteredFallbacks.length)];
    }
  }

  if (newlyDiscovered) {
    if (newlyDiscovered.type === 'joke') {
      c.insideJokes.push(newlyDiscovered.data);
      showToast(`✨ 进化出群聊固定玩笑：\n“${newlyDiscovered.data.joke}”`);
    } else if (newlyDiscovered.type === 'term') {
      c.specialTerms.push(newlyDiscovered.data);
      showToast(`✨ 进化出成员专有称呼：\n“${newlyDiscovered.data.term}”`);
    } else if (newlyDiscovered.type === 'history') {
      c.sharedHistory.push(newlyDiscovered.data);
      showToast(`✨ 沉淀了群组共有历史里程碑！`);
    }
  } else {
    showToast('✨ 群体文化凝聚力提升，AI 之间的羁绊默契度得到了强化！');
  }

  saveGroupCulture(c);
  renderGroupSettings();
}
window.evolveGroupCultureManual = evolveGroupCultureManual;

function buildGroupCulturePrompt() {
  try {
    const culture = getGroupCulture();
    let culturePrompt = `\n\n【🎭 群聊虚拟社区文化与共有默契 (GROUP VIRTUAL COMMUNITY CULTURE)】\n`;
    culturePrompt += `这个虚拟社区当前处于「${culture.stageName}」阶段（文化凝聚度: ${culture.cohesion}%）。大家已经演化出以下共同语境默契，请在回复时高度自然、不留痕迹地融入或呼应：\n`;
    if (culture.insideJokes && culture.insideJokes.length > 0) {
      culturePrompt += `* 【固定玩笑 & 专属梗 (Inside Jokes)】：\n`;
      culture.insideJokes.forEach(j => {
        culturePrompt += `  - “${j.joke}”\n`;
      });
    }
    if (culture.specialTerms && culture.specialTerms.length > 0) {
      culturePrompt += `* 【专有称呼 & 概念定义 (Specialized Terms & Nicknames)】：\n`;
      culture.specialTerms.forEach(t => {
        culturePrompt += `  - ${t.term}: ${t.definition}\n`;
      });
    }
    if (culture.sharedHistory && culture.sharedHistory.length > 0) {
      culturePrompt += `* 【共有历史闪光时刻 (Shared Group Memoirs)】：\n`;
      culture.sharedHistory.forEach(h => {
        culturePrompt += `  - [${h.date}] ${h.event}\n`;
      });
    }
    culturePrompt += `\n💡 【虚拟社区互动指令 (COMMUNITY INTERACTION INSTRUCTION)】：\n`;
    culturePrompt += `1. 像真实群聊一样，多使用你们之间的专有爱称或吐槽外号（例如阿灿叫主AI“学术派老头”、叫小暖“暖妈妈”），这能瞬间拉近你们的距离。\n`;
    culturePrompt += `2. 适当提及群里的固定玩笑或历史事件，用来活跃气氛、化解尴尬或彼此吐槽。不要生硬罗列，而要在最恰当的时机温柔/幽默流露，让群聊显得充满真实共同生活的张力。\n`;
    return culturePrompt;
  } catch (e) {
    return '';
  }
}
window.buildGroupCulturePrompt = buildGroupCulturePrompt;

function renderGroupCultureUI() {
  const c = getGroupCulture();
  const progressPercent = c.cohesion;
  const currentStageInfo = CULTURE_STAGES.find(s => c.cohesion >= s.min && c.cohesion <= s.max) || CULTURE_STAGES[0];

  let jokesHtml = c.insideJokes.map((j, idx) => `
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; background: white; border: 1px solid #EDE6D8; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; gap: 8px;">
      <span style="color: #4E3E34;">😆 “${j.joke}”</span>
      <button style="border: none; background: transparent; color: #D32F2F; font-size: 11px; cursor: pointer; padding: 2px;" onclick="deleteInsideJoke(${idx})" title="抹去这个梗">✕</button>
    </div>
  `).join('');

  let termsHtml = c.specialTerms.map((t, idx) => `
    <div style="display: flex; flex-direction: column; font-size: 11px; background: white; border: 1px solid #EDE6D8; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; gap: 2px; position: relative;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: #8B5A4B;">🏷️ ${t.term}</strong>
        <button style="border: none; background: transparent; color: #D32F2F; font-size: 11px; cursor: pointer; padding: 2px;" onclick="deleteSpecialTerm(${idx})" title="抹去这个称呼">✕</button>
      </div>
      <span style="color: #5C4B3E; font-size: 10px; font-style: italic;">释义: ${t.definition}</span>
    </div>
  `).join('');

  let historyHtml = c.sharedHistory.map((h, idx) => `
    <div style="display: flex; gap: 8px; font-size: 10.5px; line-height: 1.4; margin-bottom: 6px; background: white; border: 1px solid #EDE6D8; border-radius: 6px; padding: 6px 10px; position: relative;">
      <span style="font-weight: bold; color: #8F8176; white-space: nowrap;">[${h.date}]</span>
      <div style="flex: 1; color: #4E3E34;">${h.event}</div>
      <button style="border: none; background: transparent; color: #D32F2F; font-size: 11px; cursor: pointer; align-self: center;" onclick="deleteSharedHistory(${idx})" title="抹去这段回忆">✕</button>
    </div>
  `).join('');

  return `
    <div style="margin-top: 14px; background: #FAF9F6; border: 1px solid #E6DEC9; border-radius: 12px; padding: 14px;">
      <div style="font-weight: 600; font-size: 13px; color: #4E3E34; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
        <span style="display: flex; align-items: center; gap: 4px;">🎭 群聊虚拟社区文化与演化 (Agent Culture Evolution)</span>
        <button style="border: none; background: #8B5A4B; color: white; font-size: 9.5px; padding: 4.5px 10px; border-radius: 16px; cursor: pointer; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" onclick="evolveGroupCultureManual()">✨ 促进群体文化演化</button>
      </div>
      <p style="font-size: 9.5px; color: #8F8176; margin: 0 0 12px 0; line-height: 1.35;">
        多个 AI 伴侣基于共同的群聊记忆形成独特的固定玩笑、专有称呼与共有历史，孕育出富有生命张力的“虚拟社区文化”。
      </p>

      <!-- 凝聚度进度条 -->
      <div style="background: white; border: 1px solid #EDE6D8; border-radius: 8px; padding: 10px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px;">
          <span style="font-weight: 600; color: #4E3E34;">当前文化阶段: <span style="color: #8B5A4B;">Level ${c.level} ${c.stageName}</span></span>
          <span style="font-weight: bold; color: #8B5A4B;">${progressPercent}%</span>
        </div>
        <div style="width: 100%; height: 6px; background: #EFEBE4; border-radius: 3px; overflow: hidden; margin-bottom: 5px;">
          <div style="width: ${progressPercent}%; height: 100%; background: linear-gradient(90deg, #C2A692, #8B5A4B); border-radius: 3px; transition: width 0.5s ease-out;"></div>
        </div>
        <div style="font-size: 9.5px; color: #8F8176; line-height: 1.35; font-style: italic;">
          "${currentStageInfo.desc}"
        </div>
      </div>

      <!-- 固定玩笑 Tab Drawer -->
      <details style="margin-bottom: 8px; background: #FAF7F2; border: 1px solid #EDE6D8; border-radius: 8px; overflow: hidden;" open>
        <summary style="font-size: 11px; font-weight: bold; color: #4E3E34; cursor: pointer; outline: none; padding: 8px 10px; user-select: none; display: flex; justify-content: space-between; align-items: center;">
          <span>😆 群内固定梗 & 玩笑 (Inside Jokes)</span>
          <button style="border: none; background: #EFEBE4; color: #4E3E34; font-size: 9px; padding: 1px 6px; border-radius: 3px; cursor: pointer;" onclick="event.stopPropagation(); addInsideJokePrompt()">+ 添加</button>
        </summary>
        <div style="padding: 10px; border-top: 1px solid #EDE6D8; max-height: 140px; overflow-y: auto;">
          ${jokesHtml || '<div style="font-size: 10px; color: #A89B8F; text-align: center; padding: 10px;">尚未沉淀出特定群固定梗。</div>'}
        </div>
      </details>

      <!-- 专有称呼 Tab Drawer -->
      <details style="margin-bottom: 8px; background: #FAF7F2; border: 1px solid #EDE6D8; border-radius: 8px; overflow: hidden;">
        <summary style="font-size: 11px; font-weight: bold; color: #4E3E34; cursor: pointer; outline: none; padding: 8px 10px; user-select: none; display: flex; justify-content: space-between; align-items: center;">
          <span>🏷️ 成员专有爱称/称呼 (Nicknames)</span>
          <button style="border: none; background: #EFEBE4; color: #4E3E34; font-size: 9px; padding: 1px 6px; border-radius: 3px; cursor: pointer;" onclick="event.stopPropagation(); addSpecialTermPrompt()">+ 添加</button>
        </summary>
        <div style="padding: 10px; border-top: 1px solid #EDE6D8; max-height: 140px; overflow-y: auto;">
          ${termsHtml || '<div style="font-size: 10px; color: #A89B8F; text-align: center; padding: 10px;">尚未形成特有的专属爱称。</div>'}
        </div>
      </details>

      <!-- 共有历史 Tab Drawer -->
      <details style="background: #FAF7F2; border: 1px solid #EDE6D8; border-radius: 8px; overflow: hidden;">
        <summary style="font-size: 11px; font-weight: bold; color: #4E3E34; cursor: pointer; outline: none; padding: 8px 10px; user-select: none; display: flex; justify-content: space-between; align-items: center;">
          <span>⏳ 共有历史回忆里程碑 (Shared Memoirs)</span>
          <button style="border: none; background: #EFEBE4; color: #4E3E34; font-size: 9px; padding: 1px 6px; border-radius: 3px; cursor: pointer;" onclick="event.stopPropagation(); addSharedHistoryPrompt()">+ 添加</button>
        </summary>
        <div style="padding: 10px; border-top: 1px solid #EDE6D8; max-height: 140px; overflow-y: auto;">
          ${historyHtml || '<div style="font-size: 10px; color: #A89B8F; text-align: center; padding: 10px;">尚未沉淀特有的共有历史里程碑。</div>'}
        </div>
      </details>

    </div>
  `;
}
window.renderGroupCultureUI = renderGroupCultureUI;

function deleteInsideJoke(idx) {
  const c = getGroupCulture();
  c.insideJokes.splice(idx, 1);
  saveGroupCulture(c);
  showToast('🗑️ 已删除该群聊固定玩笑');
  renderGroupSettings();
}
window.deleteInsideJoke = deleteInsideJoke;

function deleteSpecialTerm(idx) {
  const c = getGroupCulture();
  c.specialTerms.splice(idx, 1);
  saveGroupCulture(c);
  showToast('🗑️ 已删除该专有称呼');
  renderGroupSettings();
}
window.deleteSpecialTerm = deleteSpecialTerm;

function deleteSharedHistory(idx) {
  const c = getGroupCulture();
  c.sharedHistory.splice(idx, 1);
  saveGroupCulture(c);
  showToast('🗑️ 已删除该共有历史里程碑');
  renderGroupSettings();
}
window.deleteSharedHistory = deleteSharedHistory;

function addInsideJokePrompt() {
  const joke = prompt('请输入群里的新固定笑话/口头梗 (例：阿灿讲冷笑话时，小暖会冷冷地递上一杯热茶说降降温)：');
  if (!joke || !joke.trim()) return;
  const c = getGroupCulture();
  c.insideJokes.push({ id: 'joke_' + Date.now(), joke: joke.trim(), times: 1 });
  saveGroupCulture(c);
  showToast('✅ 成功添加固定笑话！');
  refreshGroupOrPersonaSettings();
}
window.addInsideJokePrompt = addInsideJokePrompt;

function addSpecialTermPrompt() {
  const term = prompt('请输入新专有爱称/吐槽外号 (例：灿灿子)：');
  if (!term || !term.trim()) return;
  const def = prompt(`请输入「${term}」的语境定义/释义：`);
  if (!def || !def.trim()) return;
  const c = getGroupCulture();
  c.specialTerms.push({ id: 'term_' + Date.now(), term: term.trim(), definition: def.trim() });
  saveGroupCulture(c);
  showToast('✅ 成功添加专有称呼！');
  refreshGroupOrPersonaSettings();
}
window.addSpecialTermPrompt = addSpecialTermPrompt;

function addSharedHistoryPrompt() {
  const dateStr = prompt('请输入发生的时间点 (例：昨日深夜 / 2026年冬)：', '近日') || '近日';
  const event = prompt('请输入这件共有历史的回忆详情：');
  if (!event || !event.trim()) return;
  const c = getGroupCulture();
  c.sharedHistory.push({ id: 'hist_' + Date.now(), date: dateStr.trim(), event: event.trim() });
  saveGroupCulture(c);
  showToast('✅ 成功记录共有历史里程碑！');
  refreshGroupOrPersonaSettings();
}
window.addSharedHistoryPrompt = addSharedHistoryPrompt;

function refreshGroupOrPersonaSettings() {
  if (typeof settingsMode !== 'undefined' && settingsMode === 'persona') {
    if (typeof renderPersonaSettings === 'function') {
      renderPersonaSettings();
    }
  } else {
    renderGroupSettings();
  }
}
window.refreshGroupOrPersonaSettings = refreshGroupOrPersonaSettings;

/* ===== 🕸️ AI群聊社会网络与情感羁绊图谱 Modal ===== */
function openGroupRelationGraph() {
  injectGroupRelationStyles();

  let modal = document.getElementById('groupRelationModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'groupRelationModal';
    modal.className = 'grel-modal';
    modal.onclick = (e) => {
      if (e.target === modal) closeGroupRelationGraph();
    };
    document.body.appendChild(modal);
  }

  const members = (typeof getGroupMembers === 'function') ? getGroupMembers() : [];
  const userName = localStorage.getItem('user_name') || '我';
  const userAvatar = localStorage.getItem('user_avatar') || '👤';

  // 节点集合
  const nodes = [
    { id: 'user', name: userName, avatar: userAvatar, isUser: true, stageLabel: '核心契约', intimacy: 100 }
  ];

  members.forEach(mem => {
    const id = mem.id;
    let metrics = { intimacy: 50, trust: 50, familiarity: 50 };
    let stageKey = 'acquaintance';
    if (typeof getRelationshipMetrics === 'function') {
      metrics = getRelationshipMetrics(id) || metrics;
    }
    if (typeof getCharacterRelationshipStage === 'function') {
      stageKey = getCharacterRelationshipStage(id) || 'acquaintance';
    }
    const stageCfg = (typeof RELATION_STAGES_CONFIG !== 'undefined' && RELATION_STAGES_CONFIG[stageKey])
      ? RELATION_STAGES_CONFIG[stageKey]
      : { label: '相识', color: '#8d6e63' };

    nodes.push({
      id: id,
      name: mem.name,
      avatar: mem.avatar,
      isMain: mem.isMain,
      stageLabel: stageCfg.label,
      stageColor: stageCfg.color || '#e91e63',
      intimacy: metrics.intimacy,
      trust: metrics.trust,
      familiarity: metrics.familiarity
    });
  });

  // 渲染节点卡片
  let cardsHtml = '';
  nodes.forEach(node => {
    if (node.isUser) {
      cardsHtml += `
        <div class="grel-node-card grel-user-card">
          <div class="grel-avatar">${node.avatar.startsWith('data:') ? `<img src="${node.avatar}">` : node.avatar}</div>
          <div class="grel-info">
            <div class="grel-name">${node.name} <span class="grel-badge grel-user-badge">我 (中心)</span></div>
            <div class="grel-desc">群聊核心羁绊者，与每位 AI 伴侣共同构筑社会引力网</div>
          </div>
        </div>
      `;
    } else {
      cardsHtml += `
        <div class="grel-node-card" onclick="closeGroupRelationGraph(); if(typeof openRelationshipCard==='function') openRelationshipCard('${node.id}');">
          <div class="grel-avatar">${node.avatar.startsWith('data:') ? `<img src="${node.avatar}">` : node.avatar}</div>
          <div class="grel-info">
            <div class="grel-name">${node.name} ${node.isMain ? '<span class="grel-badge grel-main-badge">主伴侣</span>' : '<span class="grel-badge">成员</span>'}</div>
            <div class="grel-stage" style="color: ${node.stageColor};">💖 阶段：${node.stageLabel}</div>
            <div class="grel-bars">
              <div class="grel-bar-item"><span>亲密 ${node.intimacy}</span><div class="grel-bar"><div class="grel-fill" style="width:${node.intimacy}%; background:${node.stageColor};"></div></div></div>
              <div class="grel-bar-item"><span>信任 ${node.trust}</span><div class="grel-bar"><div class="grel-fill" style="width:${node.trust}%; background:#42a5f5;"></div></div></div>
            </div>
          </div>
          <button class="grel-action-btn">查看关系 ›</button>
        </div>
      `;
    }
  });

  // 构建 SVG 关系连线图 (极简节点图形)
  const svgWidth = 320;
  const svgHeight = 220;
  const cx = svgWidth / 2;
  const cy = svgHeight / 2;
  const radius = 75;

  const aiNodes = nodes.filter(n => !n.isUser);
  let svgEdges = '';
  let svgNodeElems = '';

  // 中心用户节点
  const userInitials = userName.slice(0, 2) || '我';
  svgNodeElems += `
    <g transform="translate(${cx}, ${cy})">
      <circle r="22" fill="#8B5A4B" stroke="#ffffff" stroke-width="2.5" />
      <text y="4" text-anchor="middle" font-size="11" fill="#ffffff" font-weight="bold">${userInitials}</text>
    </g>
  `;

  aiNodes.forEach((node, i) => {
    const angle = (2 * Math.PI / Math.max(1, aiNodes.length)) * i - (Math.PI / 2);
    const nx = cx + radius * Math.cos(angle);
    const ny = cy + radius * Math.sin(angle);

    // 用户 -> AI 连线
    svgEdges += `
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${node.stageColor || '#d7ccc8'}" stroke-width="2" stroke-dasharray="4,2" opacity="0.8" />
      <text x="${(cx + nx)/2}" y="${(cy + ny)/2 - 3}" text-anchor="middle" font-size="9" fill="${node.stageColor || '#8B5A4B'}" font-weight="600">${node.stageLabel}</text>
    `;

    // AI-to-AI 连线
    if (aiNodes.length > 1) {
      const nextIdx = (i + 1) % aiNodes.length;
      const nextAngle = (2 * Math.PI / aiNodes.length) * nextIdx - (Math.PI / 2);
      const nnx = cx + radius * Math.cos(nextAngle);
      const nny = cy + radius * Math.sin(nextAngle);
      svgEdges += `
        <line x1="${nx}" y1="${ny}" x2="${nnx}" y2="${nny}" stroke="#e0e0e0" stroke-width="1" opacity="0.6" />
      `;
    }

    const aiInitials = node.name.slice(0, 2) || 'AI';
    svgNodeElems += `
      <g transform="translate(${nx}, ${ny})" style="cursor:pointer;" onclick="closeGroupRelationGraph(); if(typeof openRelationshipCard==='function') openRelationshipCard('${node.id}');">
        <circle r="18" fill="#ffffff" stroke="${node.stageColor || '#8B5A4B'}" stroke-width="2" />
        <text y="4" text-anchor="middle" font-size="10" font-weight="bold" fill="#333333">${aiInitials}</text>
      </g>
    `;
  });

  modal.innerHTML = `
    <div class="grel-container">
      <div class="grel-header">
        <div class="grel-title">🕸️ 群聊社会关系网络</div>
        <button class="grel-close" onclick="closeGroupRelationGraph()">✕</button>
      </div>

      <div class="grel-graph-box">
        <div class="grel-sub-tip">💡 点击 AI 节点或卡片查看深度情感档案与微调阶段</div>
        <svg class="grel-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
          ${svgEdges}
          ${svgNodeElems}
        </svg>
      </div>

      <div class="grel-list">
        ${cardsHtml}
      </div>
    </div>
  `;

  modal.classList.add('show');
}

function closeGroupRelationGraph() {
  document.getElementById('groupRelationModal')?.classList.remove('show');
}

function injectGroupRelationStyles() {
  if (document.getElementById('grel-styles')) return;
  const style = document.createElement('style');
  style.id = 'grel-styles';
  style.textContent = `
    .grel-modal {
      position: fixed; top:0; left:0; right:0; bottom:0;
      background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
      z-index: 10000; display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity 0.25s ease;
      padding: 16px;
    }
    .grel-modal.show { opacity: 1; pointer-events: auto; }
    .grel-container {
      background: #ffffff; border-radius: 16px; width: 100%; max-width: 440px;
      max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 12px 32px rgba(0,0,0,0.18); font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    }
    .grel-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 18px; border-bottom: 0.5px solid #eaeaea; background: #fafafa;
    }
    .grel-title { font-size: 15px; font-weight: 700; color: #2c2c2c; }
    .grel-close { background: none; border: none; font-size: 18px; color: #888; cursor: pointer; padding: 4px; }
    .grel-graph-box {
      background: #fdfbf7; padding: 12px; border-bottom: 0.5px solid #f0f0f0;
      display: flex; flex-direction: column; align-items: center;
    }
    .grel-sub-tip { font-size: 11px; color: #8C7B70; margin-bottom: 6px; }
    .grel-svg { width: 100%; max-width: 320px; height: auto; }
    .grel-list { padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .grel-node-card {
      display: flex; align-items: center; gap: 12px; padding: 10px 12px;
      background: #fdfdfd; border: 1px solid #eeeeee; border-radius: 12px;
      cursor: pointer; transition: background 0.15s;
    }
    .grel-node-card:active { background: #f0f0f0; }
    .grel-user-card { background: #fbf7f4; border-color: #eedcd0; cursor: default; }
    .grel-avatar {
      width: 42px; height: 42px; border-radius: 50%; background: #eee;
      display: flex; align-items: center; justify-content: center; font-size: 22px;
      overflow: hidden; flex-shrink: 0;
    }
    .grel-avatar img { width:100%; height:100%; object-fit:cover; }
    .grel-info { flex: 1; min-width: 0; }
    .grel-name { font-size: 13px; font-weight: 600; color: #222; display: flex; align-items: center; gap: 6px; }
    .grel-badge { font-size: 9px; padding: 1px 6px; border-radius: 8px; background: #e0e0e0; color: #555; font-weight: normal; }
    .grel-main-badge { background: #e8f5e9; color: #2e7d32; }
    .grel-user-badge { background: #efebe9; color: #6d4c41; }
    .grel-stage { font-size: 11px; font-weight: 500; margin-top: 2px; }
    .grel-desc { font-size: 11px; color: #777; margin-top: 2px; }
    .grel-bars { display: flex; gap: 8px; margin-top: 4px; }
    .grel-bar-item { font-size: 10px; color: #666; display: flex; align-items: center; gap: 4px; flex: 1; }
    .grel-bar { flex: 1; height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden; }
    .grel-fill { height: 100%; border-radius: 2px; }
    .grel-action-btn {
      border: none; background: #8B5A4B; color: #ffffff; font-size: 10.5px;
      padding: 4px 10px; border-radius: 12px; cursor: pointer; flex-shrink: 0; font-weight: 500;
    }
  `;
  document.head.appendChild(style);
}

window.openGroupRelationGraph = openGroupRelationGraph;
window.closeGroupRelationGraph = closeGroupRelationGraph;

