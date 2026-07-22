/* ===== 备份 / 备忘录 ===== */
function initAutoBackup(){if(!autoBackupEnabled())return;const t=new Date().toISOString().slice(0,10);if(localStorage.getItem('last_backup_date')!==t&&conversationHistory.length>0)setTimeout(performAutoBackup,5000);}
function performAutoBackup(){if(!autoBackupEnabled())return;const t=new Date().toISOString().slice(0,10);if(localStorage.getItem('last_backup_date')===t||!conversationHistory.length)return;try{const b=new Blob(['\uFEFF'+generateBackupContent()],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`AI备份_${t}.txt`;a.click();localStorage.setItem('last_backup_date',t);showToast('✅ 自动备份完成');}catch(e){}}
function generateBackupContent(){let c=`AI 聊天备份\n📅 ${new Date().toLocaleString('zh-CN')}\n💬 ${conversationHistory.length} 条\n\n`;conversationHistory.forEach(m=>c+=`【${m.role==='user'?'我':'AI'}】 ${m.ts?new Date(m.ts).toLocaleString('zh-CN'):''}\n${m.content}\n\n`);const memo=localStorage.getItem('user_memo');if(memo)c+=`\n=== 备忘录 ===\n${memo}\n`;return c;}
function manualBackup(){if(!conversationHistory.length){alert('暂无记录');return;}const b=new Blob(['\uFEFF'+generateBackupContent()],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`AI备份_${Date.now()}.txt`;a.click();showToast('✅ 备份完成');toggleActionMenu();}
function openMemo(){document.getElementById('memoPanel').classList.add('show');const ta=document.getElementById('memoText');ta.value=localStorage.getItem('user_memo')||'';ta.oninput=()=>{localStorage.setItem('user_memo',ta.value);document.getElementById('memoStatus').textContent='已保存';};}
function closeMemo(){document.getElementById('memoPanel').classList.remove('show');}
function closeMemoOnOverlay(e){if(e.target===document.getElementById('memoPanel'))closeMemo();}
function saveMemo(){localStorage.setItem('user_memo',document.getElementById('memoText')?.value||'');}

/* ===== 搜索 ===== */
let searchMatches=[],searchIdx=-1;
function toggleSearch(){const b=document.getElementById('searchBar');b.classList.toggle('show');if(b.classList.contains('show')){document.getElementById('searchInput').focus();}else{clearSearch();}}

function clearSearch(){
  document.getElementById('searchInput').value='';
  searchMatches=[];searchIdx=-1;
  document.getElementById('searchNav').textContent='0/0';
  const list=document.getElementById('searchResults');
  if(list){list.classList.remove('show');list.innerHTML='';}
  document.querySelectorAll('.bubble').forEach(b=>{
    if(b.dataset.raw!==undefined){b.innerText=b.dataset.raw;delete b.dataset.raw;}
    b.classList.remove('hl-current');
  });
}

function runSearch(){
  const q=document.getElementById('searchInput').value.trim();
  document.querySelectorAll('.bubble').forEach(b=>{
    if(b.dataset.raw!==undefined){b.innerText=b.dataset.raw;delete b.dataset.raw;}
    b.classList.remove('hl-current');
  });
  searchMatches=[];searchIdx=-1;
  const list=document.getElementById('searchResults');
  if(list){list.innerHTML='';list.classList.remove('show');}
  if(!q){document.getElementById('searchNav').textContent='0/0';return;}
  const ql=q.toLowerCase();
  document.querySelectorAll('.chat-messages .bubble').forEach(b=>{
    const txt=b.innerText;
    if(txt.toLowerCase().includes(ql)){
      b.dataset.raw=txt;
      const re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
      b.innerHTML=escapeForSearch(txt).replace(re,'<mark>$1</mark>');
      searchMatches.push(b);
    }
  });
  if(searchMatches.length){searchIdx=0;focusMatch();buildSearchList(q);}
  document.getElementById('searchNav').textContent=`${searchMatches.length?1:0}/${searchMatches.length}`;
}

function buildSearchList(q){
  const list=document.getElementById('searchResults');
  if(!list)return;
  list.innerHTML='';
  searchMatches.forEach((b,i)=>{
    const msg=b.closest('.message');
    const uid=msg?.dataset.uid||'';
    const role=msg?.dataset.role==='user'?'我':'AI';
    const raw=b.dataset.raw||b.innerText;
    const idx=raw.toLowerCase().indexOf(q.toLowerCase());
    const start=Math.max(0,idx-10);
    const snippet=(start>0?'…':'')+raw.slice(start,start+40);
    const item=document.createElement('div');
    item.className='sr-item';
    item.innerHTML=`<span class="sr-role">${role}</span><span class="sr-text"></span>`;
    item.querySelector('.sr-text').textContent=snippet;
    item.onclick=()=>{
      searchIdx=i;
      focusMatch();
      document.getElementById('searchNav').textContent=`${i+1}/${searchMatches.length}`;
      jumpToMessage(uid);
    };
    list.appendChild(item);
  });
  list.classList.toggle('show',searchMatches.length>0);
}

function escapeForSearch(t){return t.replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));}

function searchStep(dir){
  if(!searchMatches.length)return;
  searchIdx=(searchIdx+dir+searchMatches.length)%searchMatches.length;
  focusMatch();
  document.getElementById('searchNav').textContent=`${searchIdx+1}/${searchMatches.length}`;
  const uid=searchMatches[searchIdx].closest('.message')?.dataset.uid;
  if(uid)jumpToMessage(uid);
}

function focusMatch(){
  searchMatches.forEach(b=>b.classList.remove('hl-current'));
  const cur=searchMatches[searchIdx];
  if(!cur)return;
  cur.classList.add('hl-current');
  cur.scrollIntoView({block:'center',behavior:'smooth'});
  const list=document.getElementById('searchResults');
  if(list){[...list.children].forEach((c,i)=>c.classList.toggle('sr-active',i===searchIdx));}
}

/* ===== 导入记忆 ===== */
function handleMemory(input){const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=async e=>{const chunks=e.target.result.split(/\n{2,}/).map(s=>s.trim()).filter(s=>s.length>=4);for(const ch of chunks)await memorize('imported',ch,'');addMessage('assistant',`✅ 已导入并向量化 ${chunks.length} 条记忆`,genUid());};r.readAsText(f,'UTF-8');input.value='';}

/* ===== 聊天主流程 ===== */
function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,80)+'px';if(tokenPanelOpen&&document.getElementById('tokenPanel').classList.contains('show'))renderTokenBody();}
function toggleActionMenu(){document.getElementById('actionMenu').classList.toggle('show');}
function triggerFileInput(id){document.getElementById(id).click();if(id!=='genInitInput')document.getElementById('actionMenu').classList.remove('show');}
async function handleImage(input){const f=input.files[0];if(!f)return;const reader=new FileReader();reader.onload=async e=>{const dim = (typeof getImageCompressDim==='function')?getImageCompressDim():768;const compressed=await compressImage(e.target.result,dim,0.7);pendingImage=compressed;const uid=genUid();const ts=Date.now();conversationHistory.push({role:'user',content:'[图片]',image:compressed,uid,ts});renderImageMessage('user',compressed,uid,ts);saveHistory();showToast('✅ 图片已压缩，发送消息可让AI识别');};reader.readAsDataURL(f);input.value='';}
function setQuote(t){quotedText=t;document.getElementById('quoteText').textContent='引用: '+t.slice(0,40);document.getElementById('quotePreview').classList.add('show');document.getElementById('messageInput').focus();}
function clearQuote(){quotedText=null;document.getElementById('quotePreview').classList.remove('show');}
let chatReplying = false;
let chatRequestInFlightKey = '';

function chatRequestHash(text) {
  const s = String(text || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function makeChatRequestKey(provider, model, body, url) {
  return `${provider?.id || provider?.name || ''}|${model || ''}|${url || ''}|${chatRequestHash(JSON.stringify(body || {}))}`;
}

function isStrictSingleApiChatMode() {
  return typeof strictSingleApiMode === 'function' ? strictSingleApiMode() : localStorage.getItem('single_api_per_message') !== 'false';
}

async function sendMessage(){
  if(chatReplying) return;
  chatReplying = true;
  try {
    if (typeof applyRelationshipDecay === 'function') {
      try { applyRelationshipDecay(); } catch (e) { console.error('[sendMessage] applyRelationshipDecay failed:', e); }
    }
    if (typeof markActivity === 'function') { try { markActivity(); } catch (e) {} }
    if (typeof triggerHaptic === 'function') { try { triggerHaptic('medium'); } catch (e) {} }
    const input=document.getElementById('messageInput');
    if (!input) {
      chatReplying = false;
      return;
    }
    let text=input.value.trim();
    if(!text&&!pendingImage) {
      chatReplying = false;
      return;
    }
    if(text&&typeof handleMusicCommand==='function'&&handleMusicCommand(text)){
      input.value='';
      if (typeof autoResize === 'function') autoResize(input);
      chatReplying = false;
      return;
    }
    if(quotedText){text=`> ${quotedText}\n\n${text}`;clearQuote();}
    const img=pendingImage;pendingImage=null;
    let emotion='calm';
    if(text&&localStorage.getItem('emotion_enabled')!=='false'){
      try {
        if (typeof detectEmotion === 'function') emotion=detectEmotion(text);
        if (typeof updateEmotionState === 'function') updateEmotionState(emotion);
        if (typeof renderEmotionPills === 'function') renderEmotionPills();
      } catch (e) {
        console.error('[sendMessage] Emotion detection failed:', e);
      }
    }
    if(text){
      const uid=genUid();
      const ts=Date.now();
      conversationHistory.push({role:'user',content:text,uid,emotion,ts});
      renderTextMessage('user',text,uid,null,null,false,ts);
      saveHistory();
      if (typeof memorize === 'function') { try { memorize('user',text,emotion); } catch (e) { console.error('memorize failed:', e); } }
      if (typeof updateRelationshipState === 'function') {
        try { updateRelationshipState({ userEmotion: emotion, text: text }); } catch (e) { console.error('updateRelationshipState failed:', e); }
      }
      if (typeof processProactiveFeedback === 'function') {
        try { processProactiveFeedback(text); } catch (e) { console.error('[sendMessage] processProactiveFeedback failed:', e); }
      }
      if (typeof bumpMsgCounter === 'function') { try { bumpMsgCounter(); } catch (e) {} }
      if(!isStrictSingleApiChatMode()&&typeof maybeUpdateLongTerm==='function') {
        try { maybeUpdateLongTerm(text); } catch (e) {}
      }
      if(typeof bumpPrivateChatCount==='function') {
        try { bumpPrivateChatCount(currentPrivateAiId()); } catch (e) {}
      }
    }
    input.value='';
    if (typeof autoResize === 'function') autoResize(input);
    if(text && typeof handleDirectImageCommand === 'function' && await handleDirectImageCommand(text, img, { source:'chat-send' })) {
      return;
    }
    await requestAI(img,text);
    if (typeof maybeAutoCompress === 'function') { try { maybeAutoCompress(); } catch(e) {} }
    if(!isStrictSingleApiChatMode()&&typeof maybeUpdateMidterm==='function') { try { maybeUpdateMidterm(); } catch(e) {} }
  } catch (err) {
    console.error('Error in sendMessage:', err);
    try { if (typeof showToast === 'function') showToast('❌ 发送遇到异常: ' + (err.message || err)); } catch(e){}
  } finally {
    chatReplying = false;
  }
}

/* ===== 多气泡渲染（按换行拆分句子，每行一个气泡） ===== */
function splitToBubbles(content){if(content==null)return[''];return String(content).split('\n').map(s=>s.replace(/\s+$/,'')).filter(s=>s.trim()!=='');}
function getActiveTtsVoice(){
  const id=currentPrivateAiId();
  if(id==='main')return localStorage.getItem('tts_voice_ai');
  const members=(typeof getGroupMembers==='function')?getGroupMembers():[];
  const mem=members.find(m=>m.id===id);
  return (mem&&mem.voice)||localStorage.getItem('tts_voice_ai');
}
function avatarHTML(role){
  const isU=role==='user';
  if(isU){
    const src=localStorage.getItem('user_avatar');
    return src?`<img class="avatar" src="${src}" alt="">`:`<div class="avatar avatar-emoji">🙂</div>`;
  }
  const currentAi=currentPrivateAiId();
  if(currentAi==='main'){
    const custom=localStorage.getItem('ai_avatar');
    return custom?`<img class="avatar" src="${custom}" alt="">`:`<div class="avatar avatar-emoji">🤖</div>`;
  }else{
    const members=(typeof getGroupMembers==='function')?getGroupMembers():[];
    const mem=members.find(m=>m.id===currentAi);
    if(mem&&mem.avatar){
      if(mem.avatar.startsWith('data:')){return `<img class="avatar" src="${mem.avatar}" alt="">`;}
      else{return `<div class="avatar avatar-emoji">${mem.avatar}</div>`;}
    }
    return `<div class="avatar avatar-emoji">👧</div>`;
  }
}
function createMessageSkeleton(role,uid,ts){const div=document.createElement('div');div.className=`message ${role==='user'?'user-message':'ai-message'}`;div.id='msg-'+uid;div.dataset.uid=uid;div.dataset.role=role;div.innerHTML=`<input type="checkbox" class="msg-check" onchange="onCheck('${uid}',this.checked)">${avatarHTML(role)}<div class="msg-content"><div class="bubbles"></div><div class="msg-time">${nowTime(ts)}</div><div class="msg-actions"><button onclick="msgCopy('${uid}')">📋</button><button onclick="msgEdit('${uid}')">✏️</button>${role!=='user'?`<button onclick="msgRetry('${uid}')">🔄</button>`:''}<button onclick="msgQuote('${uid}')">💬</button><button onclick="copyAnchor('${uid}')" title="复制锚点">🔗</button><button onclick="msgDelete('${uid}')">🗑️</button></div></div>`;bindContextMenu(div,uid);return {div,bubbles:div.querySelector('.bubbles')};}
function toggleRecallChip(uid){const div=getMsgDiv(uid);if(!div)return;const chip=div.querySelector('.recall-chip');if(chip)chip.classList.toggle('show');}
function toggleMsgActions(uid){
  const div=getMsgDiv(uid);if(!div)return;
  const actions=div.querySelector('.msg-actions');if(!actions)return;
  const wasShown=actions.classList.contains('show-mobile');
  document.querySelectorAll('.msg-actions.show-mobile').forEach(el=>el.classList.remove('show-mobile'));
  if(!wasShown)actions.classList.add('show-mobile');
}
function speakerHTML(uid){return `<span class="inline-speak" onclick="event.stopPropagation();msgSpeak('${uid}')" title="朗读">🔊</span>`;}
/* 文本消息：换行拆成多个气泡；朗读按钮挂在最后一个气泡 */
function renderTextMessage(role,content,uid,reasoning,recallItems,proactive,ts){
  const {div,bubbles}=createMessageSkeleton(role,uid,ts);
  if(recallItems&&role!=='user'){
    const c=document.createElement('div');
    c.className='recall-chip';
    if(Array.isArray(recallItems) && recallItems.length > 0){
      const itemsHtml = recallItems.map(it => {
        const emoMap = { happy: '😊', sad: '😢', excited: '⚡', love: '💖', angry: '娇嗔', gentle: '🌸', calm: '🍃', tired: '🥱', anxious: '😟', thinking: '💭' };
        const emoIcon = emoMap[it.emotion] || '';
        const tags = it.topicTags || [];
        const tagStr = tags.length ? tags.join('/') : '通用';
        const timeWin = it.timeWindowTag || '未知时刻';
        const assocText = it.assoc ? `🔗 [关联扩散: ${it.assocReason || '网络'}]` : `🎯 [精确检索共鸣]`;
        return `
          <div class="recall-item" style="font-size: 10.5px; line-height: 1.4; color: var(--text-color); padding: 4px 8px; border-left: 2.5px solid ${it.assoc ? '#BA68C8' : 'var(--accent)'}; background: rgba(255,255,255,0.45); border-radius: 0 6px 6px 0; margin-top: 4px; max-width: 100%; box-shadow: 0 0.5px 1px rgba(0,0,0,0.03);">
            <div style="font-size: 8.5px; opacity: 0.7; font-weight: bold; margin-bottom: 2px; display: flex; justify-content: space-between;">
              <span>${assocText} · ${timeWin} [${tagStr}]</span>
              <span>${emoIcon}</span>
            </div>
            <div style="word-break: break-all; white-space: pre-wrap;">${it.text || it.summary || ''}</div>
          </div>
        `;
      }).join('');
      c.innerHTML = `
        <div style="font-weight: 600; font-size: 10.5px; display: flex; align-items: center; gap: 4px; color: var(--text-sub);">
          <span>🧠 意识共鸣与关联记忆库 (${recallItems.length}个节点)</span>
        </div>
        <div class="recall-items-list" style="display: flex; flex-direction: column; gap: 4px; width: 100%; margin-top: 4px;">
          ${itemsHtml}
        </div>
      `;
    } else if(typeof recallItems === 'string'){
      c.textContent='🔎 '+recallItems;
    } else {
      c.textContent='🔎 召回相关记忆';
    }
    bubbles.parentNode.insertBefore(c,bubbles);
  }
  if(reasoning&&role!=='user'&&showThinkingEnabled()){
    const tb=document.createElement('div');
    tb.className='thinking-block';
    tb.innerText='💭 '+reasoning;
    bubbles.parentNode.insertBefore(tb,bubbles);
  }
  const display=(role!=='user'&&typeof stripMusicTags==='function')?stripMusicTags(content):content;
  const lines=splitToBubbles(display);
  lines.forEach((line,i)=>{
    const b=document.createElement('div');
    b.className='bubble';
    if(proactive)b.classList.add('proactive');
    if(content&&content.includes('已压缩'))b.classList.add('compressed');
    b.onclick=(e)=>{toggleRecallChip(uid);toggleMsgActions(uid);e.stopPropagation();};
    b.innerText=(proactive&&i===0?'💌 ':'')+line;
    bubbles.appendChild(b);
  });
  const last=bubbles.lastElementChild;
  if(last)last.insertAdjacentHTML('beforeend',speakerHTML(uid));
  if(role!=='user'&&typeof decorateMusic==='function')decorateMusic(bubbles,content);
  document.getElementById('chatMessages').appendChild(div);
  scrollBottom();
}
function renderImageMessage(role,src,uid,ts){const div=document.createElement('div');div.className=`message ${role==='user'?'user-message':'ai-message'}`;div.id='msg-'+uid;div.dataset.uid=uid;div.dataset.role=role;div.innerHTML=`<input type="checkbox" class="msg-check" onchange="onCheck('${uid}',this.checked)">${avatarHTML(role)}<div class="msg-content"><div class="bubbles"><div class="bubble image-bubble" onclick="toggleMsgActions('${uid}'); event.stopPropagation();"><img id="img-el-${uid}" src="${src}" onclick="event.stopPropagation(); openImageViewer(this.src)"></div></div><div class="msg-time">${nowTime(ts)}</div><div class="msg-actions"><button onclick="copyAnchor('${uid}')" title="复制锚点">🔗</button><button onclick="msgDelete('${uid}')">🗑️</button></div></div>`;document.getElementById('chatMessages').appendChild(div);if(uid&&window.LovestoryImageDB){window.LovestoryImageDB.get(uid).then(storedData=>{if(storedData){const imgEl=document.getElementById(`img-el-${uid}`);if(imgEl)imgEl.src=storedData;}else if(src&&typeof downloadAndStoreImage==='function'){downloadAndStoreImage(src,uid).then(storedUrl=>{const imgEl=document.getElementById(`img-el-${uid}`);if(imgEl&&storedUrl)imgEl.src=storedUrl;}).catch(e=>console.warn('[ImagePersistence] Fail to cache rendered image:',e));}}).catch(e=>console.warn('[ImagePersistence] Failed to fetch image from IndexedDB:',e));}scrollBottom();}
function rerenderAll(){const c=document.getElementById('chatMessages');c.innerHTML='';conversationHistory.forEach(m=>{if(m.image)renderImageMessage(m.role==='user'?'user':'assistant',m.image,m.uid,m.ts);else renderTextMessage(m.role==='imported'?'assistant':m.role,m.content,m.uid,m.reasoning,m.recallItems,m.proactive,m.ts);});}
function addMessage(role,content,uid){uid=uid||genUid();const ts=Date.now();conversationHistory.push({role,content,uid,ts});renderTextMessage(role,content,uid,null,null,false,ts);saveHistory();}
function addLoadingDOM(){const {div,bubbles}=createMessageSkeleton('assistant','loading_'+Date.now());const b=document.createElement('div');b.className='bubble';b.innerHTML='<div class="loading-dots"><span></span><span></span><span></span></div>';bubbles.appendChild(b);div.querySelector('.msg-time')?.remove();div.querySelector('.msg-actions')?.remove();document.getElementById('chatMessages').appendChild(div);scrollBottom();return div;}
function addLoadingWithIntroDOM(introText) {
  if (!introText) return addLoadingDOM();
  const {div, bubbles} = createMessageSkeleton('assistant', 'loading_' + Date.now());
  const b1 = document.createElement('div');
  b1.className = 'bubble';
  b1.innerText = introText;
  bubbles.appendChild(b1);
  const b2 = document.createElement('div');
  b2.className = 'bubble';
  b2.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  bubbles.appendChild(b2);
  div.querySelector('.msg-time')?.remove();
  div.querySelector('.msg-actions')?.remove();
  document.getElementById('chatMessages').appendChild(div);
  scrollBottom();
  return div;
}
async function requestAI(currentImage=null,queryText=''){
  // 一次性清除引导AI跟进的本地标记，确保对话是单次高优触发而不会递归跟进
  if (localStorage.getItem('pending_thread_checkin_title')) {
    setTimeout(() => {
      localStorage.removeItem('pending_thread_checkin_title');
      localStorage.removeItem('pending_thread_checkin_immediate');
    }, 1500);
  }

  const currentAi=currentPrivateAiId();
  const members=(typeof getGroupMembers==='function')?getGroupMembers():[];
  const mem=members.find(m=>m.id===currentAi);
  let useProvider=getCurrentProvider();
  let useModel=selectedModelName;
  if(mem){
    if(typeof memberProvider==='function'){
      useProvider=memberProvider(mem);
      useModel=memberModel(mem,useProvider);
    }
  }
  const provider=useProvider;
  if (!provider || !provider.id) {
    addMessage('assistant','❌ 未能获取有效的模型服务商配置，请在设置中重新选择服务商并填入 API Key',genUid());
    return;
  }
  const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';
  if(!apiKey&&provider.auth!=='none'){
    addMessage('assistant','❌ 请先在设置中填入 API Key',genUid());
    return;
  }
  let recallItems=[];
  const q=queryText||conversationHistory.filter(m=>m.role==='user').pop()?.content||'';
  
  // Phase 3 Growth Signal triggers:
  if (typeof adjustAiPersonality === 'function' && q) {
    const qLower = q.toLowerCase();
    if (/哈哈|笑死|嘻嘻|逗我|好笑|调侃/.test(qLower)) {
      adjustAiPersonality(currentAi, 'laughter');
    }
    if (/谢谢|温存|喜欢|开心|感动|抱抱|真好|舒服|宝贝|爱你/.test(qLower)) {
      adjustAiPersonality(currentAi, 'user_happy');
    }
    if (/难过|讨厌|生气|烦|郁闷|无语|滚|冷淡|差劲/.test(qLower)) {
      adjustAiPersonality(currentAi, 'user_unhappy');
    }
    if (typeof checkContinuousDaysActive === 'function' && checkContinuousDaysActive()) {
      adjustAiPersonality(currentAi, 'active_3days');
    }
  }

  if(ragEnabled()&&q){try{recallItems=await recall(q);}catch(e){}}const recallNote=recallItems.length?`召回 ${recallItems.length} 条相关记忆`:'';

// 1. 叙事愿警与轨迹自动检测
if (typeof NarrativeManager !== 'undefined') {
  NarrativeManager.detectAndTrackArc(q, currentAi);
}

// 2. 检测是否应当主动选择不接话（留白偏好）
if (typeof RhythmEngine !== 'undefined' && RhythmEngine.shouldSilence(q)) {
  const silentAction = RhythmEngine.getSilenceAction();
  RhythmEngine.lastDecision = {
    query: q,
    slowTriggered: true,
    reason: "🔇 激发了主动收敛留白机制：在精力损耗期发送了极短或虚无讯息",
    delayMs: 0,
    introBubbleSent: false,
    silenceActionSent: true,
    timestamp: Date.now()
  };
  const uid = genUid();
  const ts = Date.now();
  conversationHistory.push({ role: 'assistant', content: silentAction, uid, ts });
  renderTextMessage('assistant', silentAction, uid, null, null, false, ts);
  saveHistory();
  return;
}

// 3. 计算当前的对话节拍 (物理打字延迟与心智留白)
const rhythm = (typeof RhythmEngine !== 'undefined') ? RhythmEngine.determineRhythm(q) : { slow: false, delay: 0, introText: '' };

let sp = await composeSystemPrompt(q, recallItems, null, currentAi);

  // Module 2: Behavior Decision Layer (Determine Response Intent)
  if (typeof determineResponseIntent === 'function') {
    const userEmo = (conversationHistory.filter(m => m.role === 'user').pop()?.emotion) || 'calm';
    const intent = determineResponseIntent(q, userEmo, null, new Date().getHours());
    if (intent) {
      const intentMap = {
        comfort: '【行为决策意图控制：安慰】请以极致温柔、极具同理心的态度倾听与陪伴。此时无需急着给出理性的解决方案或列表，而应采用能包容、抚平情绪的温软短句进行情感拥抱。',
        celebrate: '【行为决策意图控制：庆祝】请表达由衷的开心与祝贺！话语间带着暖暖的笑意、欢快与热烈，高度分享、称赞并放大对方的成就和快乐。',
        remember: '【行为决策意图控制：回忆】请极其自然地在字里行间提起或呼应一件你们的共同经历往事。多使用“我还记得上次…”、“说起来你以前…”等口吻，增进默契。',
        encourage: '【行为决策意图控制：鼓励】请给予无条件的信心支持与理解。用坚定、温暖的话语去拥抱和支持对方，陪伴其度过不确定性，成为其精神后盾。',
        playful: '【行为决策意图控制：互动】请保持轻松、风趣、俏皮、傲娇或轻松调侃的态度。适度开一些温暖的小玩笑，让气氛变得融融而欢快。',
        quiet_support: '【行为决策意图控制：安静陪伴】当前处于深夜静谧时分，请字句精简、点到即止。无需主动抛出过多追问或开启新话题，安安静静、温润轻柔地给予陪伴。'
      };
      const intentPrompt = intentMap[intent];
      if (intentPrompt) {
        sp += '\n\n' + intentPrompt;
        console.log(`[Behavior Decision Layer] Injected intent prompt: ${intent}`);
      }
    }
  }
const shortTerm=ctxSlice(conversationHistory).filter(m=>!m.image).map(m=>({role:m.role==='imported'?'user':m.role,content:m.content}));const messages=[{role:'system',content:sp},...shortTerm];if(currentImage)messages.push({role:'user',content:[{type:'text',text:queryText||'请描述这张图片'},{type:'image_url',image_url:{url:currentImage}}]});let url=provider.endpoint.replace(/\/+$/,'');if(!url.includes('/chat/completions')&&!url.includes('messages'))url+='/chat/completions';const headers={'Content-Type':'application/json'};if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${apiKey}`;else if(provider.auth==='x-api-key')headers['x-api-key']=apiKey;else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=apiKey;const stream=streamEnabled();const body={model:useModel,messages,stream};if(localStorage.getItem('temp_enabled')==='true')body.temperature=parseFloat(localStorage.getItem('temperature')||'1');if(localStorage.getItem('top_p_enabled')==='true')body.top_p=parseFloat(localStorage.getItem('top_p')||'1');const requestKey=makeChatRequestKey(provider,useModel,body,url);if(chatRequestInFlightKey===requestKey){console.warn('[API Dedup] Duplicate chat completion blocked.');showToast('已拦截重复 API 请求');return;}chatRequestInFlightKey=requestKey;if(window.recordTokenTelemetry)recordTokenTelemetry({caller:'requestAI-input',provider:provider.id||provider.name||'',model:useModel,messages,promptChars:JSON.stringify(messages||[]).length,meta:{stream,hasImage:!!currentImage}});
    if(!stream){
      const loading=rhythm.slow ? addLoadingWithIntroDOM(rhythm.introText) : addLoadingDOM();
      if (rhythm.slow) {
        await new Promise(res => setTimeout(res, rhythm.delay));
      }
      try{
        const r = await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
        if(!r.ok)throw new Error(`API 错误 (${r.status})`);
        const d=await r.json();
        loading.remove();
        const m=d.choices?.[0]?.message;
        let reply=m?.content||d.content?.[0]?.text||'无响应';
        if (rhythm.slow && rhythm.introText) {
          reply = rhythm.introText + '\n' + reply;
        }
        const reasoning=m?.reasoning_content||'';
        const uid=genUid();
        const ts=Date.now();
        const savedRecallItems = recallItems.map(it => ({
          text: it.text,
          sim: it.sim,
          topicTags: it.topicTags,
          timeWindowTag: it.timeWindowTag,
          emotion: it.emotion,
          assoc: it.assoc,
          assocReason: it.assocReason
        }));
        conversationHistory.push({role:'assistant',content:reply,uid,reasoning,ts,recallItems:savedRecallItems});
        const clean=(typeof cleanAiText==='function')?cleanAiText(reply):reply;
        if(window.recordTokenTelemetry)recordTokenTelemetry({caller:'requestAI-output',provider:provider.id||provider.name||'',model:useModel,inputTokens:0,output:clean,meta:{stream:false}});
        renderTextMessage('assistant',clean,uid,reasoning,recallItems,false,ts);
        conversationHistory[conversationHistory.length-1].content=clean;
        saveHistory();
        memorize('assistant',clean,'');
        updateAiEmotion(clean);
        if (typeof adjustAiPersonality === 'function' && (reply.includes('[[proactive]]') || reply.includes('proactive') || clean.includes('主动'))) {
          adjustAiPersonality(currentAi, 'responded_proactive');
        }
        if(typeof processAiReplyMemory==='function')processAiReplyMemory(reply, currentAi);
        markActivity();
        if(autoSpeakEnabled()&&voiceEnabled())playTTS(clean,getActiveTtsVoice());
        if(!isStrictSingleApiChatMode()&&typeof triggerVisualEvaluation==='function') triggerVisualEvaluation(q, clean, currentAi, uid);
      }catch(err){
        loading.remove();
        addMessage('assistant','❌ '+err.message,genUid());
      } finally {
        if (chatRequestInFlightKey === requestKey) chatRequestInFlightKey = '';
      }
      return;
    }
    const uid=genUid();const ts=Date.now();
    if (rhythm.slow) {
      const slowLoading = addLoadingWithIntroDOM(rhythm.introText);
      await new Promise(res => setTimeout(res, rhythm.delay));
      slowLoading.remove();
    }
    const {div,bubbles}=createMessageSkeleton('assistant',uid,ts);
    if(recallItems && recallItems.length > 0){
      const c=document.createElement('div');
      c.className='recall-chip';
      const itemsHtml = recallItems.map(it => {
        const emoMap = { happy: '😊', sad: '😢', excited: '⚡', love: '💖', angry: '娇嗔', gentle: '🌸', calm: '🍃', tired: '🥱', anxious: '😟', thinking: '💭' };
        const emoIcon = emoMap[it.emotion] || '';
        const tags = it.topicTags || [];
        const tagStr = tags.length ? tags.join('/') : '通用';
        const timeWin = it.timeWindowTag || '未知时刻';
        const assocText = it.assoc ? `🔗 [关联扩散: ${it.assocReason || '网络'}]` : `🎯 [精确检索共鸣]`;
        return `
          <div class="recall-item" style="font-size: 10.5px; line-height: 1.4; color: var(--text-color); padding: 4px 8px; border-left: 2.5px solid ${it.assoc ? '#BA68C8' : 'var(--accent)'}; background: rgba(255,255,255,0.45); border-radius: 0 6px 6px 0; margin-top: 4px; max-width: 100%; box-shadow: 0 0.5px 1px rgba(0,0,0,0.03);">
            <div style="font-size: 8.5px; opacity: 0.7; font-weight: bold; margin-bottom: 2px; display: flex; justify-content: space-between;">
              <span>${assocText} · ${timeWin} [${tagStr}]</span>
              <span>${emoIcon}</span>
            </div>
            <div style="word-break: break-all; white-space: pre-wrap;">${it.text || it.summary || ''}</div>
          </div>
        `;
      }).join('');
      c.innerHTML = `
        <div style="font-weight: 600; font-size: 10.5px; display: flex; align-items: center; gap: 4px; color: var(--text-sub);">
          <span>🧠 意识共鸣与关联记忆库 (${recallItems.length}个节点)</span>
        </div>
        <div class="recall-items-list" style="display: flex; flex-direction: column; gap: 4px; width: 100%; margin-top: 4px;">
          ${itemsHtml}
        </div>
      `;
      bubbles.parentNode.insertBefore(c,bubbles);
    }
    if (rhythm.slow && rhythm.introText) {
      const introBubble = document.createElement('div');
      introBubble.className = 'bubble';
      introBubble.innerText = rhythm.introText;
      bubbles.appendChild(introBubble);
    }
    const streamBubble=document.createElement('div');
    streamBubble.className='bubble';
    streamBubble.innerHTML='<div class="loading-dots"><span></span><span></span><span></span></div>';
    bubbles.appendChild(streamBubble);
    document.getElementById('chatMessages').appendChild(div);
    scrollBottom();
    let thinkingEl=null,full='',reasoning='',started=false;
    try{
      const r = await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
      if(!r.ok)throw new Error(`API 错误 (${r.status})`);
      const reader=r.body.getReader();
      const dec=new TextDecoder();
      let buf='';
      while(true){
        const{done,value}=await reader.read();
        if(done)break;
        buf+=dec.decode(value,{stream:true});
        const lines=buf.split('\n');
        buf=lines.pop();
        for(const line of lines){
          const t=line.trim();
          if(!t.startsWith('data:'))continue;
          const dd=t.slice(5).trim();
          if(dd==='[DONE]')continue;
          try{
            const j=JSON.parse(dd);
            const delta=j.choices?.[0]?.delta||{};
            if(delta.reasoning_content&&showThinkingEnabled()){
              reasoning+=delta.reasoning_content;
              if(!thinkingEl){
                thinkingEl=document.createElement('div');
                thinkingEl.className='thinking-block';
                bubbles.parentNode.insertBefore(thinkingEl,bubbles);
              }
              thinkingEl.innerText='💭 '+reasoning;
              scrollBottom();
            }
            if(delta.content){
              if(!started){
                streamBubble.innerText='';
                started=true;
              }
              full+=delta.content;
              streamBubble.innerText=(typeof cleanAiText==='function'?cleanAiText(full):full);
              scrollBottom();
            }
          }catch(e){}
        }
      }
      if(!started)full=full||'无响应';
      const display=(typeof cleanAiText==='function'?cleanAiText(full):full);
      if(window.recordTokenTelemetry)recordTokenTelemetry({caller:'requestAI-output',provider:provider.id||provider.name||'',model:useModel,inputTokens:0,output:display,meta:{stream:true}});
      const finalDisplay = (rhythm.slow && rhythm.introText) ? (rhythm.introText + '\n' + display) : display;
      bubbles.innerHTML='';
      const linesOut=splitToBubbles(finalDisplay);
      (linesOut.length?linesOut:[finalDisplay]).forEach(line=>{
        const b=document.createElement('div');
        b.className='bubble';
        b.onclick=()=>toggleRecallChip(uid);
        b.innerText=line;
        bubbles.appendChild(b);
      });
      const last=bubbles.lastElementChild;
      if(last)last.insertAdjacentHTML('beforeend',speakerHTML(uid));
      if(typeof decorateMusic==='function')decorateMusic(bubbles,full);
      const savedRecallItems = recallItems.map(it => ({
        text: it.text,
        sim: it.sim,
        topicTags: it.topicTags,
        timeWindowTag: it.timeWindowTag,
        emotion: it.emotion,
        assoc: it.assoc,
        assocReason: it.assocReason
      }));
      conversationHistory.push({role:'assistant',content:finalDisplay||'无响应',uid,reasoning,ts,recallItems:savedRecallItems});
      saveHistory();
      memorize('assistant',display,'');
      updateAiEmotion(display);
      if (typeof adjustAiPersonality === 'function' && (full.includes('[[proactive]]') || full.includes('proactive') || display.includes('主动'))) {
        adjustAiPersonality(currentAi, 'responded_proactive');
      }
      if(typeof processAiReplyMemory==='function')processAiReplyMemory(full, currentAi);
      markActivity();
      if(autoSpeakEnabled()&&voiceEnabled()&&full)playTTS(full,getActiveTtsVoice());
      if(!isStrictSingleApiChatMode()&&typeof triggerVisualEvaluation==='function') triggerVisualEvaluation(q, display, currentAi, uid);
    }catch(err){
      bubbles.innerHTML='';
      const b=document.createElement('div');
      b.className='bubble';
      b.innerText='❌ '+err.message;
      bubbles.appendChild(b);
    } finally {
      if (chatRequestInFlightKey === requestKey) chatRequestInFlightKey = '';
    }
  }

/* ===== 消息操作 ===== */
function getMsg(uid){return conversationHistory.find(m=>m.uid===uid);}
function getMsgDiv(uid){return document.querySelector(`.message[data-uid="${uid}"]`);}
function msgCopy(uid){const m=getMsg(uid);if(m)navigator.clipboard.writeText(m.content).then(()=>showToast('✅ 已复制'));}
function msgSpeak(uid){
  if(!voiceEnabled()){showToast('🔇 语音已关闭，请先点顶部🔊开启');return;}
  if(!voiceKey()){showToast('请先在「语音设置」填入 API Key');return;}
  const m=getMsg(uid);if(!m)return;
  unlockAudioOnGesture();
  const sp=getMsgDiv(uid)?.querySelector('.inline-speak');
  if(sp)sp.classList.add('playing');
  showToast('🔊 朗读中...');
  const voice=m.role==='user'?'':getActiveTtsVoice();
  playTTS(m.content,voice)
    .catch(e=>showToast('朗读失败：'+e.message))
    .finally(()=>{if(sp)sp.classList.remove('playing');});
}
/* 修改：在多气泡结构下，编辑时合并为单一可编辑气泡，保存后再按换行重排 */
function msgEdit(uid){const m=getMsg(uid),div=getMsgDiv(uid);if(!m||!div)return;const bubbles=div.querySelector('.bubbles');if(!bubbles)return;bubbles.innerHTML='';const b=document.createElement('div');b.className='bubble editing';b.innerText=m.content;bubbles.appendChild(b);b.contentEditable='true';b.focus();const r=document.createRange();r.selectNodeContents(b);r.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(r);const fin=()=>{b.contentEditable='false';m.content=b.innerText.trim();saveHistory();b.removeEventListener('blur',fin);
    // 重排为多气泡
    bubbles.innerHTML='';const lines=splitToBubbles(m.content);lines.forEach(line=>{const nb=document.createElement('div');nb.className='bubble';nb.onclick=()=>toggleRecallChip(uid);nb.innerText=line;bubbles.appendChild(nb);});const last=bubbles.lastElementChild;if(last)last.insertAdjacentHTML('beforeend',speakerHTML(uid));showToast('✅ 已修改');};b.addEventListener('blur',fin);}
function msgRetry(uid){const idx=conversationHistory.findIndex(m=>m.uid===uid);if(idx===-1)return;const rm=conversationHistory.splice(idx);rm.forEach(m=>{const d=getMsgDiv(m.uid);if(d)d.remove();});saveHistory();requestAI();}
function msgQuote(uid){const m=getMsg(uid);if(m)setQuote(m.content);}
function msgDelete(uid){if(!confirm('删除该消息？'))return;const idx=conversationHistory.findIndex(m=>m.uid===uid);if(idx!==-1){conversationHistory.splice(idx,1);saveHistory();}const d=getMsgDiv(uid);if(d)d.remove();}

/* ===== 多选 ===== */
function enterSelectMode(){selectMode=true;selectedUids.clear();document.getElementById('chatMessages').classList.add('select-mode');document.getElementById('selectBar').classList.add('show');updateSelInfo();}
function exitSelectMode(){selectMode=false;selectedUids.clear();document.getElementById('chatMessages').classList.remove('select-mode');document.getElementById('selectBar').classList.remove('show');document.querySelectorAll('.msg-check').forEach(c=>c.checked=false);}
function onCheck(uid,checked){if(checked)selectedUids.add(uid);else selectedUids.delete(uid);updateSelInfo();}
function updateSelInfo(){document.getElementById('selInfo').textContent='已选 '+selectedUids.size+' 条';}
function selectAllMsgs(){const all=document.querySelectorAll('.message[data-uid]');const allSelected=selectedUids.size===all.length;selectedUids.clear();document.querySelectorAll('.msg-check').forEach(c=>{const uid=c.closest('.message').dataset.uid;if(!allSelected){c.checked=true;selectedUids.add(uid);}else c.checked=false;});updateSelInfo();}
function copySelected(){if(!selectedUids.size){showToast('未选择');return;}const txt=conversationHistory.filter(m=>selectedUids.has(m.uid)).map(m=>`【${m.role==='user'?'我':'AI'}】${m.content}`).join('\n\n');navigator.clipboard.writeText(txt).then(()=>showToast('✅ 已复制 '+selectedUids.size+' 条'));}
function deleteSelected(){if(!selectedUids.size){showToast('未选择');return;}if(!confirm(`删除选中的 ${selectedUids.size} 条消息？`))return;conversationHistory=conversationHistory.filter(m=>!selectedUids.has(m.uid));selectedUids.forEach(uid=>{const d=getMsgDiv(uid);if(d)d.remove();});saveHistory();exitSelectMode();showToast('✅ 已删除');}

/* ===== 右键 / 长按菜单 ===== */
function bindContextMenu(div,uid){let pt=null;const show=(x,y)=>{ctxTargetUid=uid;showContextMenu(x,y,div);};div.addEventListener('contextmenu',e=>{e.preventDefault();show(e.clientX,e.clientY);});div.addEventListener('touchstart',e=>{pt=setTimeout(()=>{const t=e.touches[0];show(t.clientX,t.clientY);},500);},{passive:true});div.addEventListener('touchend',()=>clearTimeout(pt));div.addEventListener('touchmove',()=>clearTimeout(pt));}
function showContextMenu(x,y,div){const menu=document.getElementById('contextMenu');menu.querySelector('button[onclick="ctxRetry()"]').style.display=div.classList.contains('ai-message')?'flex':'none';menu.classList.add('show');menu.style.left=Math.min(x,window.innerWidth-menu.offsetWidth-10)+'px';menu.style.top=Math.min(y,window.innerHeight-menu.offsetHeight-10)+'px';}
function hideContextMenu(){document.getElementById('contextMenu').classList.remove('show');}
function ctxCopy(){msgCopy(ctxTargetUid);hideContextMenu();}
function ctxSpeak(){msgSpeak(ctxTargetUid);hideContextMenu();}
function ctxEdit(){msgEdit(ctxTargetUid);hideContextMenu();}
function ctxRetry(){msgRetry(ctxTargetUid);hideContextMenu();}
function ctxQuote(){msgQuote(ctxTargetUid);hideContextMenu();}
function ctxMultiSelect(){enterSelectMode();if(ctxTargetUid){selectedUids.add(ctxTargetUid);const c=getMsgDiv(ctxTargetUid)?.querySelector('.msg-check');if(c)c.checked=true;updateSelInfo();}hideContextMenu();}
function ctxDelete(){msgDelete(ctxTargetUid);hideContextMenu();}

/* ===== 历史持久化 ===== */
function currentPrivateAiId(){return localStorage.getItem('current_private_ai')||'main';}
function saveHistory(){
  const id=currentPrivateAiId();
  const key=id==='main'?'chatHistory':`chatHistory_${id}`;
  try{
    localStorage.setItem(key,JSON.stringify(conversationHistory));
    if (typeof HistoryBackupDB !== 'undefined') {
      HistoryBackupDB.set(key, conversationHistory);
    }
  }catch(e){
    if(conversationHistory.length>20){
      conversationHistory.splice(0,Math.ceil(conversationHistory.length*0.1));
      saveHistory();
    }
  }
}
async function loadHistory(){
  const id=currentPrivateAiId();
  const key=id==='main'?'chatHistory':`chatHistory_${id}`;
  const s=localStorage.getItem(key);
  let migrated=false;

  const renderList = (history) => {
    const c=document.getElementById('chatMessages');
    if(c)c.innerHTML='';
    history.forEach(m=>{
      if(!m.uid)m.uid=genUid();
      if(!m.ts){m.ts=Date.now();migrated=true;}
      if(m.image)renderImageMessage(m.role==='user'?'user':'assistant',m.image,m.uid,m.ts);
      else renderTextMessage(m.role==='imported'?'assistant':m.role,m.content,m.uid,m.reasoning,m.recallItems,m.proactive,m.ts);
    });
  };

  if(s){
    try{
      conversationHistory=JSON.parse(s);
      renderList(conversationHistory);
    }catch(e){}
  } else {
    // If empty in localStorage, try restoring from IndexedDB
    try {
      if (typeof HistoryBackupDB !== 'undefined') {
        const backup = await HistoryBackupDB.get(key);
        if (backup && Array.isArray(backup) && backup.length > 0) {
          conversationHistory = backup;
          renderList(conversationHistory);
          localStorage.setItem(key, JSON.stringify(conversationHistory));
          showToast('🔄 已从 IndexedDB 恢复聊天历史记录');
        } else {
          conversationHistory = [];
        }
      } else {
        conversationHistory = [];
      }
    } catch(e) {
      conversationHistory = [];
    }
  }

  if(migrated) saveHistory();
  updateBrandAvatarAndHeader();
  if(!conversationHistory.length){
    if(id==='main'){
      addMessage('assistant','你好！我支持记忆、情绪表情、语音、生图与主动消息。（语音/生图/自动备份/主动消息默认关闭，可在设置开启）💫',genUid());
    }else{
      const mem=(typeof getGroupMembers==='function')?getGroupMembers().find(m=>m.id===id):null;
      addMessage('assistant',`你好！我是「${mem?.name||'AI'}」。很高兴和你私聊！✨`,genUid());
    }
  }
}
function switchPrivateChat(memberId){
  saveHistory();
  localStorage.setItem('current_private_ai',memberId);
  const key=memberId==='main'?'chatHistory':`chatHistory_${memberId}`;
  const s=localStorage.getItem(key);
  if(s){try{conversationHistory=JSON.parse(s);}catch(e){conversationHistory=[];}}else{conversationHistory=[];}
  const c=document.getElementById('chatMessages');if(c)c.innerHTML='';
  loadHistory();
}
function updateBrandAvatarAndHeader(){
  const brand=document.getElementById('brandAvatar');
  const titleArea=document.getElementById('headerTitleArea');
  const nameEl=document.getElementById('headerAiName');
  if(!brand)return;
  const currentAi=currentPrivateAiId();
  if(titleArea)titleArea.style.display='flex';
  
  // 渲染或更新亲密关系角标
  let badgeEl = document.getElementById('headerRelBadge');
  if (!badgeEl && titleArea) {
    badgeEl = document.createElement('span');
    badgeEl.id = 'headerRelBadge';
    badgeEl.className = 'header-rel-badge';
    const arrow = titleArea.querySelector('.header-ai-dropdown-arrow');
    if (arrow) {
      titleArea.insertBefore(badgeEl, arrow);
    } else {
      titleArea.appendChild(badgeEl);
    }
  }

  let stageKey = 'acquaintance';
  if (typeof getCharacterRelationshipStage === 'function') {
    stageKey = getCharacterRelationshipStage(currentAi);
  } else {
    stageKey = localStorage.getItem(currentAi === 'main' ? 'relationship_stage' : `rel_stage_${currentAi}`) || 'acquaintance';
  }
  
  const stageCfg = (typeof RELATION_STAGES_CONFIG !== 'undefined' && RELATION_STAGES_CONFIG[stageKey]) 
    ? RELATION_STAGES_CONFIG[stageKey] 
    : { label: stageKey === 'friend' ? '朋友' : stageKey === 'crush' ? '暧昧' : stageKey === 'lover' ? '恋人' : stageKey === 'partner' ? '亲密伴侣' : '初识', color: '#90A4AE' };
  
  if (badgeEl) {
    badgeEl.textContent = stageCfg.label;
    badgeEl.style.backgroundColor = stageCfg.color;
  }

  if(currentAi==='main'){
    if(nameEl)nameEl.textContent=localStorage.getItem('ai_name')||'主AI';
    const custom=localStorage.getItem('ai_avatar');
    if(custom){brand.innerHTML=`<img class="avatar" src="${custom}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;}
    else{brand.innerHTML='<span>🤖</span>';}
  }else{
    const members=(typeof getGroupMembers==='function')?getGroupMembers():[];
    const mem=members.find(m=>m.id===currentAi);
    if(nameEl)nameEl.textContent=mem?mem.name:'副AI';
    if(mem&&mem.avatar){
      if(mem.avatar.startsWith('data:')){brand.innerHTML=`<img class="avatar" src="${mem.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;}
      else{brand.innerHTML=`<div class="avatar avatar-emoji" style="width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;">${mem.avatar}</div>`;}
    }else{brand.innerHTML='<span>👧</span>';}
  }
}
function toggleAiSwitcher(e){
  e&&e.stopPropagation();
  const pop=document.getElementById('aiSwitcherPopover');
  if(!pop)return;
  if(pop.classList.contains('show')){
    pop.classList.remove('show');
    return;
  }
  pop.innerHTML='';
  const currentAi=currentPrivateAiId();
  const mainName=localStorage.getItem('ai_name')||'主AI';
  const mainAvatar=localStorage.getItem('ai_avatar');
  const mainAvHtml=mainAvatar?`<img class="avatar" src="${mainAvatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">`:`<div class="avatar avatar-emoji" style="font-size:16px;">🤖</div>`;
  const mainDiv=document.createElement('div');
  mainDiv.className='as-item'+(currentAi==='main'?' sel':'');
  mainDiv.innerHTML=`<div style="display:flex;align-items:center;gap:8px;">${mainAvHtml}<span>${mainName} (主AI)</span></div>`;
  mainDiv.onclick=()=>{
    switchPrivateChat('main');
    pop.classList.remove('show');
  };
  pop.appendChild(mainDiv);
  const members=(typeof getGroupMembers==='function')?getGroupMembers():[];
  members.forEach(m=>{
    if(m.isMain)return;
    const avHtml=(m.avatar||'').startsWith('data:')?`<img class="avatar" src="${m.avatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">`:`<div class="avatar avatar-emoji" style="font-size:16px;">${m.avatar||'👧'}</div>`;
    const d=document.createElement('div');
    d.className='as-item'+(currentAi===m.id?' sel':'');
    d.innerHTML=`<div style="display:flex;align-items:center;gap:8px;">${avHtml}<span>${m.name}</span></div>`;
    d.onclick=()=>{
      switchPrivateChat(m.id);
      pop.classList.remove('show');
    };
    pop.appendChild(d);
  });
  pop.classList.add('show');
}
function clearChat(){if(confirm('清空所有对话？(不影响长期记忆)')){
  conversationHistory=[];
  const id=currentPrivateAiId();
  const key=id==='main'?'chatHistory':`chatHistory_${id}`;
  localStorage.removeItem(key);
  document.getElementById('chatMessages').innerHTML='';
  if(id==='main'){
    addMessage('assistant','对话已清空 ✨',genUid());
  }else{
    const mem=(typeof getGroupMembers==='function')?getGroupMembers().find(m=>m.id===id):null;
    addMessage('assistant',`你好！我是「${mem?.name||'AI'}」。很高兴和你私聊！✨`,genUid());
  }
}}
function exportChat(){if(!conversationHistory.length){alert('没有记录');return;}const md=confirm('导出为 Markdown（Obsidian 兼容）？\n\n确定 = Markdown(.md)\n取消 = 纯文本(.txt)');if(md)exportChatMarkdown();else exportChatTxt();}
function exportChatTxt(){let o='聊天记录\n'+new Date().toLocaleString()+'\n\n';conversationHistory.forEach(m=>o+=`【${m.role==='user'?'我':'AI'}】 ${m.ts?new Date(m.ts).toLocaleString('zh-CN'):''}\n${m.content}\n\n`);downloadBlob('\uFEFF'+o,`聊天记录_${new Date().toISOString().slice(0,10)}.txt`,'text/plain;charset=utf-8');}
function exportChatMarkdown(){
  const now=new Date();
  const sessionId='chat-'+now.toISOString().slice(0,10);
  const fm=`---\ntitle: AI 聊天记录 ${now.toISOString().slice(0,10)}\nsession_id: ${sessionId}\nexported_at: ${now.toISOString()}\nmessage_count: ${conversationHistory.length}\ntags: [ai-chat]\n---\n\n`;
  let lastDay='';let body='';
  conversationHistory.forEach(m=>{
    const t=m.ts?new Date(m.ts):null;
    const dayStr=t?`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`:'未知日期';
    if(dayStr!==lastDay){body+=`\n## ${dayStr}\n\n`;lastDay=dayStr;}
    const who=m.role==='user'?'🙂 我':'🤖 AI';
    const time=t?t.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'';
    body+=`> [!${m.role==='user'?'quote':'note'}] ${who} · ${time} ^msg-${m.uid}\n`;
    if(m.image){body+='> ![图片]('+(m.image.startsWith('data:')?'（内嵌 base64 图片已省略）':m.image)+')\n\n';}
    else{const lines=mdEscape(m.content).split('\n');body+=lines.map(l=>'> '+l).join('\n')+'\n\n';}
  });
  const mid=(typeof getMidTerm==='function')?getMidTerm():'';
  const profile=(typeof getLongTermProfile==='function')?getLongTermProfile():'';
  let extra='';
  if(profile)extra+=`\n## 🗂️ 长期记忆档案\n\n${profile}\n`;
  if(mid)extra+=`\n## 🗓️ 中期记忆\n\n${mid}\n`;
  downloadBlob(fm+body+extra,`${sessionId}.md`,'text/markdown;charset=utf-8');
}
function downloadBlob(text,filename,mime){const b=new Blob([text],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=filename;a.click();}

