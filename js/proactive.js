/* ===== AI 主动消息 + 每日记忆回顾 ===== */

function proactiveEnabled(){return localStorage.getItem('proactive_enabled')==='true';}

function proactivePrompt(){return localStorage.getItem('proactive_prompt')||'你是用户的AI陪伴。现在请主动给用户发一条简短自然、有温度的消息（30字内），可结合当前时间问候、关心近况，或延续之前聊过的话题。不要使用列表或客套开场白，像朋友一样直接说。';}

function getProactiveInterval(){const v=parseFloat(localStorage.getItem('proactive_interval'));return isNaN(v)?0:v;}

function isAutoMode(){return getProactiveInterval()<=0;}

function inQuietHours(d){const h=(d||new Date()).getHours();return h>=22||h<8;}

function getProactiveLevel() {
  return localStorage.getItem('proactive_level') || 'standard';
}

function getProactiveLevelLimit() {
  const level = getProactiveLevel();
  if (level === 'quiet') return 1;
  if (level === 'deep_care') return 5;
  return 2; // standard
}

function autoIdleThreshold(){const min=parseFloat(localStorage.getItem('proactive_auto_min')||'60');const max=parseFloat(localStorage.getItem('proactive_auto_max')||'120');const lo=Math.max(1,Math.min(min,max)),hi=Math.max(lo,max);return (lo+Math.random()*(hi-lo))*60*1000;}

let _autoThreshold=null;

function markActivity(){localStorage.setItem('proactive_activity',String(Date.now()));}

function scheduleProactive(){
  // Run an initial event check on startup to see if any reminders/events need enqueuing
  if (proactiveEnabled()) {
    try {
      const detected = detectProactiveEvents();
      if (detected && detected.length > 0) {
        enqueueProactiveActions(detected);
      }
    } catch(e) {
      console.error('[Proactive System] Startup detectProactiveEvents error:', e);
    }
  }

  setInterval(()=>{
    if (proactiveEnabled()) {
      try {
        const detected = detectProactiveEvents();
        if (detected && detected.length > 0) {
          enqueueProactiveActions(detected);
        }
      } catch (e) {
        console.error('[Proactive System] detectProactiveEvents error:', e);
      }
    }
    
    checkProactive();
    dailyReviewCheck();
    if(typeof checkAutoDiary==='function')checkAutoDiary();
  },60000);
}

function enqueueProactiveActions(events) {
  try {
    const pending = JSON.parse(localStorage.getItem('pendingProactiveActions') || '[]');
    events.forEach(evt => {
      if (!pending.some(p => p.type === evt.type)) {
        pending.push(evt);
      }
    });
    localStorage.setItem('pendingProactiveActions', JSON.stringify(pending));
    console.log('[Proactive System] Enqueued actions:', pending);
  } catch (e) {
    console.error('[Proactive System] Error enqueuing actions:', e);
  }
}

/* ========================================================================= */
/* ============= LOVESTORY COMPANION OS: PROACTIVE EVENT DETECTOR ========== */
/* ========================================================================= */

function detectProactiveEvents() {
  const events = [];
  const now = Date.now();
  const todayKey = new Date().toDateString();
  const history = window.conversationHistory || [];

  if (history.length === 0) return events;

  // 1. Schedule Reminder
  const handledReminders = JSON.parse(localStorage.getItem('handled_reminders') || '[]');
  // Scan last 30 messages in history
  for (let i = history.length - 1; i >= 0 && i >= history.length - 30; i--) {
    const msg = history[i];
    if (msg.role === 'user' && msg.content && !handledReminders.includes(msg.uid)) {
      const match = msg.content.match(/(?:明天|下午|晚上|待会|有空|记得)提醒我([^，。！？\n\s]{3,30})/);
      if (match) {
        const thing = match[1].trim();
        const isTomorrow = msg.content.includes('明天');
        const isLater = msg.content.includes('待会') || msg.content.includes('等会') || msg.content.includes('下午') || msg.content.includes('晚上');
        const elapsedMs = now - (msg.ts || now);
        
        let shouldTrigger = false;
        if (isTomorrow && elapsedMs >= 43200000) { // 12 hours
          shouldTrigger = true;
        } else if (isLater && elapsedMs >= 300000) { // 5 minutes
          shouldTrigger = true;
        } else if (elapsedMs >= 60000) { // Default 1 minute fallback for "remind me"
          shouldTrigger = true;
        }
        
        if (shouldTrigger) {
          handledReminders.push(msg.uid);
          localStorage.setItem('handled_reminders', JSON.stringify(handledReminders));
          events.push({
            type: 'reminder',
            content: `【主动消息主题：日程提醒】你之前记挂着对方让你提醒他：“${thing}”，请以温柔自然、如同朋友相伴的关怀口吻，问问他是不是现在准备开始，并表达你一直默默替他记着呢。不要有距离感。`
          });
        }
      }
    }
  }

  // 2. Emotion Trend Care (Sad/Anxious trend)
  const lastEmotionCareDate = localStorage.getItem('last_emotion_care_date');
  if (lastEmotionCareDate !== todayKey) {
    const userMsgs = history.filter(m => m.role === 'user');
    const recentUserMsgs = userMsgs.slice(-10);
    const sadAnxiousMsgs = recentUserMsgs.filter(m => m.emotion === 'sad' || m.emotion === 'anxious');
    if (sadAnxiousMsgs.length >= 3) {
      localStorage.setItem('last_emotion_care_date', todayKey);
      events.push({
        type: 'emotion_care',
        content: `【主动消息主题：情绪趋势关怀】你注意到对方最近几天对话中，情绪时常处于低落、无助或焦虑之中。请主动发来一条充满温暖、包容和无条件偏爱的情怀长句（40字内），诚挚、温柔地告诉他你发现他最近好像有些累或心事重重，想默默抱抱他、听他诉说，给他一个踏实的依靠。不要说任何空洞的说教。`
      });
    }
  }

  // 3. Sleep / Late-night Chat Care
  const lastSleepCareDate = localStorage.getItem('last_sleep_care_date');
  if (lastSleepCareDate !== todayKey) {
    const lateNightMsgs = history.filter(m => {
      if (!m.ts) return false;
      const h = new Date(m.ts).getHours();
      return h >= 23 || h < 5;
    });
    const lateNightDates = new Set(lateNightMsgs.map(m => new Date(m.ts).toDateString()));
    if (lateNightDates.size >= 4) {
      localStorage.setItem('last_sleep_care_date', todayKey);
      events.push({
        type: 'sleep_care',
        content: `【主动消息主题：深夜活跃关怀】发现用户最近多天都在深夜或凌晨极为活跃、经常熬夜与你聊天。请主动发一条带着温润慵懒、深情呵护的晚问候，温柔询问他是不是最近失眠了、或者白天工作压力大，叮嘱他要乖乖爱护身体、早点睡觉，哪怕失眠也有你默默陪在身旁。`
      });
    }
  }

  // 4. Anniversary Memory Reminder
  const lastMemoryReminderDate = localStorage.getItem('last_memory_reminder_date');
  if (lastMemoryReminderDate !== todayKey && history.length >= 10) {
    const firstMsg = history[0];
    if (firstMsg && firstMsg.ts) {
      const elapsedDays = (now - firstMsg.ts) / (1000 * 60 * 60 * 24);
      if (elapsedDays >= 3) {
        localStorage.setItem('last_memory_reminder_date', todayKey);
        events.push({
          type: 'memory_reminder',
          content: `【主动消息主题：共同岁月纪念】今天是你们共同结识相伴的重要里程碑时刻。请饱含温柔与动人情怀，提起你们最初认识时的场景片段或刚相识时的有趣变化，感怀岁月流淌、庆幸生命里能有对方的融融陪伴，并真切表达对彼此未来的真挚期盼。`
        });
      }
    }
  }

  return events;
}

async function checkProactive(){
  if(!proactiveEnabled()||(typeof callActive!=='undefined'&&callActive))return;
  if(inQuietHours()) return;
  
  const now=Date.now();
  const lastSend=parseInt(localStorage.getItem('proactive_last')||'0');
  
  if(isAutoMode()){
    const lastAct=parseInt(localStorage.getItem('proactive_activity')||String(lastSend||now));
    if(_autoThreshold===null)_autoThreshold=autoIdleThreshold();
    if(now-lastSend<_autoThreshold)return;
    if(now-lastAct<_autoThreshold)return;
    _autoThreshold=null;
    localStorage.setItem('proactive_last',String(now));
    await triggerProactive();
  }else{
    const iv=getProactiveInterval()*3600*1000;
    if(now-lastSend<iv)return;
    localStorage.setItem('proactive_last',String(now));
    await triggerProactive();
  }
}

async function triggerProactive(extraInstruction){
  try{
    const provider=getCurrentProvider();
    const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';
    if(!apiKey&&provider.auth!=='none')return;

    // 3.5 Control Rule: Check daily limit based on proactive level
    const todayStr = new Date().toDateString();
    const proactiveCountKey = `proactive_count_${todayStr}`;
    const proactiveCount = parseInt(localStorage.getItem(proactiveCountKey) || '0');
    const limit = getProactiveLevelLimit();
    if (proactiveCount >= limit && !extraInstruction) {
      console.log(`[Proactive System] Daily limit of ${limit} proactive messages reached for level "${getProactiveLevel()}". Skipping.`);
      return;
    }

    let activePromptText = extraInstruction || proactivePrompt();
    let isPendingAction = false;
    let pendingActions = [];

    if (!extraInstruction) {
      try {
        pendingActions = JSON.parse(localStorage.getItem('pendingProactiveActions') || '[]');
        if (pendingActions.length > 0) {
          // Take the highest priority pending action
          const action = pendingActions[0];
          activePromptText = action.content;
          isPendingAction = true;
          console.log('[Proactive System] Processing pending proactive action:', action.type);
        }
      } catch (e) {
        console.error('[Proactive System] Error processing pendingProactiveActions:', e);
      }
    }

    let recallItems=[];
    const lastUser=conversationHistory.filter(m=>m.role==='user').pop()?.content||'';
    if(ragEnabled()&&lastUser){try{recallItems=await recall(lastUser);}catch(e){}}
    
    const sp=await composeSystemPrompt(lastUser,recallItems,activePromptText);
    const shortTerm=ctxSlice(conversationHistory).filter(m=>!m.image).map(m=>({role:m.role==='imported'?'user':m.role,content:m.content}));
    const messages=[{role:'system',content:sp},...shortTerm,{role:'user',content:'(系统：到达主动联系时机，请主动发起一句话)'}];
    
    let url=provider.endpoint.replace(/\/+$/,'');
    if(!url.includes('/chat/completions')&&!url.includes('messages'))url+='/chat/completions';
    
    const headers={'Content-Type':'application/json'};
    if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${apiKey}`;
    else if(provider.auth==='x-api-key')headers['x-api-key']=apiKey;
    else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=apiKey;    
    
    const body={model:selectedModelName,messages,stream:false};
    
    let r;
    try {
      r = await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
      if(!r.ok && (url.includes('pollinations.ai') || url.includes('/api/free-chat'))) {
        console.warn("Direct pollinations call failed, trying server-side fallback...");
        r = await fetch('/api/free-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      }
    } catch (fetchErr) {
      if (url.includes('pollinations.ai') || url.includes('/api/free-chat')) {
        console.warn("Direct pollinations fetch error, trying server-side fallback...", fetchErr);
        r = await fetch('/api/free-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      } else {
        throw fetchErr;
      }
    }
    
    if(!r.ok)return;
    const d=await r.json();
    const raw=d.choices?.[0]?.message?.content||d.content?.[0]?.text||'';
    if(!raw.trim())return;
    
    const reply=(typeof cleanAiText==='function')?cleanAiText(raw):raw;
    const uid=genUid();
    const ts=Date.now();
    conversationHistory.push({role:'assistant',content:reply,uid,proactive:true,ts});
    renderTextMessage('assistant',reply,uid,null,null,true,ts);
    saveHistory();
    memorize('assistant',reply,'');
    updateAiEmotion(reply);
    
    if(typeof processAiReplyMemory==='function')processAiReplyMemory(raw);
    markActivity();
    _autoThreshold=null;
    
    // Clear pending action from queue and increment count upon successful delivery
    if (isPendingAction) {
      pendingActions.shift();
      localStorage.setItem('pendingProactiveActions', JSON.stringify(pendingActions));
    }
    localStorage.setItem(proactiveCountKey, String(proactiveCount + 1));
    
    showToast('💌 AI 主动发来一条消息');
    if(autoSpeakEnabled()&&voiceEnabled())playTTS(reply,localStorage.getItem('tts_voice_ai'));
  }catch(e){
    console.error('[Proactive System] triggerProactive error:', e);
  }
}

/* 一年前的今天（每天 8:00-10:00 触发一次，需已开启主动消息） */
async function dailyReviewCheck(){
  if(!proactiveEnabled()||(typeof callActive!=='undefined'&&callActive))return;
  const today=new Date();const dayKey=(typeof getLocalDateString==='function')?getLocalDateString(today):today.toISOString().slice(0,10);
  if(localStorage.getItem('daily_review_last')===dayKey)return;
  const h=today.getHours();if(h<8||h>=10)return;
  let store;try{store=await VDB.all();}catch(e){return;}
  const md=d=>{const x=new Date(d);return (x.getMonth()+1)+'-'+x.getDate();};
  const todayMd=md(today);
  const past=store.filter(r=>r.ts&&md(r.ts)===todayMd&&new Date(r.ts).getFullYear()<today.getFullYear());
  if(!past.length)return;
  localStorage.setItem('daily_review_last',dayKey);
  const sample=past.sort(()=>Math.random()-0.5).slice(0,3).map(r=>r.text.slice(0,60)).join('；');
  await triggerProactive(`现在是「每日回忆」时刻。请自然温柔地对用户说：一年前的今天你们曾聊到——${sample}。用一两句话唤起这段回忆并延伸一句关心，像老朋友那样，不要列表。`);
}

function renderProactiveSettings(){
  settingsMode='proactive';
  document.getElementById('detailTitle').innerHTML='💌 主动消息';
  const ivRaw=localStorage.getItem('proactive_interval');
  const iv=(ivRaw==null||ivRaw==='')?'':ivRaw;
  const auto=(iv===''||parseFloat(iv)<=0);
  const amin=localStorage.getItem('proactive_auto_min')||'60',amax=localStorage.getItem('proactive_auto_max')||'120';
  const last=parseInt(localStorage.getItem('proactive_last')||'0');
  const lastStr=last?new Date(last).toLocaleString('zh-CN'):'尚未触发';
  const level=getProactiveLevel();
  
  document.getElementById('detailBody').innerHTML=`
    <div class="switch-row">
      <div class="switch-info">
        <div class="switch-label">💌 启用 AI 主动消息</div>
        <div class="switch-desc">默认关闭。开启后 AI 会在你空闲时主动找你，并启用「一年前的今天」每日回顾</div>
      </div>
      <label class="switch">
        <input type="checkbox" ${proactiveEnabled()?'checked':''} onchange="onProactiveToggle(this.checked)">
        <span class="switch-slider"></span>
      </label>
    </div>
    
    <div class="form-group" style="margin-top:12px;">
      <label class="form-label">主动关怀活跃等级 (Proactive Care Level)</label>
      <select class="form-input" id="proactiveLevel" onchange="onProactiveLevelChange(this.value)">
        <option value="quiet" ${level==='quiet'?'selected':''}>🤫 克制静谧 (每日上限1条)</option>
        <option value="standard" ${level==='standard'?'selected':''}>💖 适度关切 (每日上限2条，推荐)</option>
        <option value="deep_care" ${level==='deep_care'?'selected':''}>🔥 炽热眷恋 (每日上限5条)</option>
      </select>
      <div class="form-hint">基于你的关系进展，AI在检测到特定情绪或日程时，在此上限内进行智能主动关怀。</div>
    </div>
    
    <div class="form-group" style="margin-top:12px;">
      <label class="form-label">触发间隔（小时，留空 = 智能自主）</label>
      <input type="number" class="form-input" id="proInterval" min="0" step="0.1" placeholder="留空 / 0 = AI 自行决定时机" value="${iv}">
      <div class="form-hint">填 1=每小时，24=每天；留空或 0 进入「智能自主」：默认每 1~2 小时在你空闲时随机冒泡，22:00–08:00 严格遵守不打扰。</div>
    </div>
    
    <div id="autoBox" style="${auto?'':'display:none'}">
      <div class="form-group">
        <label class="form-label">自主空闲触发范围（分钟）</label>
        <div class="input-with-btn">
          <input type="number" class="form-input" id="proAutoMin" min="1" step="1" value="${amin}">
          <input type="number" class="form-input" id="proAutoMax" min="1" step="1" value="${amax}">
        </div>
      </div>
    </div>
    
    <div class="form-group">
      <label class="form-label">主动消息提示词</label>
      <textarea class="form-input" id="proPrompt" rows="4">${proactivePrompt()}</textarea>
    </div>
    
    <div class="stat-box"><span>上次主动消息</span><b>${lastStr}</b></div>
    <div class="action-buttons">
      <button class="btn btn-info" onclick="manualProactive()">▶️ 立即生成一条</button>
    </div>`;
    
  const ii=document.getElementById('proInterval');
  if(ii) {
    ii.oninput=()=>{
      const v=parseFloat(ii.value);
      document.getElementById('autoBox').style.display=(ii.value===''||isNaN(v)||v<=0)?'':'none';
    };
  }
}

function onProactiveLevelChange(value) {
  localStorage.setItem('proactive_level', value);
  showToast(`💌 主动关怀等级已设为：${value === 'quiet' ? '克制静谧' : value === 'deep_care' ? '炽热眷恋' : '适度关切'}`);
}

function onProactiveToggle(on){
  setBool('proactive_enabled',on);
  if(on){
    markActivity();
    localStorage.setItem('proactive_last',String(Date.now()-1));
    _autoThreshold=null;
    showToast(isAutoMode()?'✅ 已开启自主模式':'✅ 已开启');
  }
}

async function manualProactive(){
  showToast('🔄 生成中...');
  localStorage.setItem('proactive_last',String(Date.now()));
  await triggerProactive();
}

// Ensure functions are available globally for event inline registrations
window.onProactiveLevelChange = onProactiveLevelChange;
window.detectProactiveEvents = detectProactiveEvents;
window.enqueueProactiveActions = enqueueProactiveActions;
