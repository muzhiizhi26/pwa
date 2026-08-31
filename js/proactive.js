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
    // 触发时机多元化（方向1）：AI 自主规划 + 静默/睡前时机触发
    try { aiDailySchedule(); } catch(e) { console.error('[Proactive] aiDailySchedule error:', e); }
    try { checkMomentTriggers(); } catch(e) { console.error('[Proactive] momentTriggers error:', e); }
    // 预约系统（方向3）：到期预约 → AI 提醒
    try { checkAppointments(); } catch(e) { console.error('[Proactive] appointments error:', e); }
    dailyReviewCheck();
    // 白天空闲自动写日记已禁用（checkAutoDiary 会导致不停写日记），
    // 日记统一由夜间沉淀 nightlyDiarySettle 在 22:00 后写 1 篇
    // 朋友圈状态驱动（方案B）：情绪/关系/静默时长 三因素，每日上限+避开繁忙时段
    if (typeof MomentsEngine !== 'undefined' && typeof MomentsEngine.checkStateDrivenMoments === 'function') {
      try { MomentsEngine.checkStateDrivenMoments(); } catch(e) { console.error('[Moments] State-driven check error:', e); }
    }
    // 夜间沉淀模式：22:00-23:59 统一写当天标记的日记（每天最多一次）
    const h = new Date().getHours();
    if (h >= 22 && typeof nightlyDiarySettle==='function') {
      try { nightlyDiarySettle(); } catch(e) { console.error('[Diary] Nightly settle error:', e); }
    }
    // 夜间记忆做梦巩固：22:00 后与日记共用窗口，把当天事件记忆 LLM 合并/去冗余（内部防抖，每天一次）
    if (h >= 22 && typeof nightlyMemoryConsolidate==='function') {
      try { nightlyMemoryConsolidate(); } catch(e) { console.error('[Memory] Nightly consolidate error:', e); }
    }
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

function isProactiveTypeSuspended(type) {
  try {
    const feedbackStr = localStorage.getItem('proactiveFeedback');
    if (!feedbackStr) return false;
    const feedback = JSON.parse(feedbackStr);
    const data = feedback[type];
    if (data && data.total > 3) {
      const negativeRate = (data.negative || 0) / data.total;
      if (negativeRate > 0.5) {
        if (data.suspendedUntil && Date.now() < data.suspendedUntil) {
          console.log(`[Proactive System] Type "${type}" is currently suspended until ${new Date(data.suspendedUntil).toLocaleString()}`);
          return true;
        } else if (data.suspendedUntil && Date.now() >= data.suspendedUntil) {
          // Suspension expired! Reset counts to give it a fresh start
          data.positive = 0;
          data.negative = 0;
          data.total = 0;
          delete data.suspendedUntil;
          feedback[type] = data;
          localStorage.setItem('proactiveFeedback', JSON.stringify(feedback));
          console.log(`[Proactive System] Suspension expired for type "${type}". Resetting stats.`);
          return false;
        } else {
          // Suspend now for 7 days
          data.suspendedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
          feedback[type] = data;
          localStorage.setItem('proactiveFeedback', JSON.stringify(feedback));
          console.log(`[Proactive System] Suspending type "${type}" for 7 days due to negative rate ${negativeRate.toFixed(2)}`);
          return true;
        }
      }
    }
  } catch (e) {
    console.error('[Proactive System] Error checking suspension:', e);
  }
  return false;
}

function processProactiveFeedback(userText) {
  const type = localStorage.getItem('lastProactiveType');
  const timeStr = localStorage.getItem('lastProactiveTime');
  if (!type || !timeStr) return;
  
  const sentTime = parseInt(timeStr);
  const now = Date.now();
  const text = (userText || '').trim();
  if (!text) return;
  
  // Clean up lastProactiveType so we don't process the same proactive message twice
  localStorage.removeItem('lastProactiveType');
  localStorage.removeItem('lastProactiveTime');
  
  let feedback = {};
  try {
    feedback = JSON.parse(localStorage.getItem('proactiveFeedback') || '{}');
  } catch (e) {
    console.error('[Feedback Loop] Error parsing proactiveFeedback:', e);
  }
  
  if (!feedback[type]) {
    feedback[type] = { positive: 0, negative: 0, total: 0 };
  }
  
  const elapsedMs = now - sentTime;
  const minutesPassed = elapsedMs / (1000 * 60);
  
  const positiveKeywords = ['谢谢', '好的', '知道了', '哈哈', '开心', '摸摸', '抱抱', '乖', '真好', '暖心', '感动', '爱', '喜欢', '太好', '嘻嘻', '哒', '谢'];
  const hasPositiveKeyword = positiveKeywords.some(kw => text.includes(kw));
  
  let isPositive = true;
  if (minutesPassed > 30) {
    isPositive = false;
  } else if (text.length < 5 && !hasPositiveKeyword) {
    isPositive = false;
  }
  
  if (isPositive) {
    feedback[type].positive = (feedback[type].positive || 0) + 1;
    console.log(`[Feedback Loop] Positive feedback recorded for "${type}": "${text}"`);
  } else {
    feedback[type].negative = (feedback[type].negative || 0) + 1;
    console.log(`[Feedback Loop] Negative feedback recorded for "${type}" (elapsed: ${minutesPassed.toFixed(1)}m, text: "${text}")`);
  }
  feedback[type].total = (feedback[type].total || 0) + 1;
  
  localStorage.setItem('proactiveFeedback', JSON.stringify(feedback));
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
        
        if (shouldTrigger && !isProactiveTypeSuspended('reminder')) {
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
    if (sadAnxiousMsgs.length >= 3 && !isProactiveTypeSuspended('emotion_care')) {
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
    if (lateNightDates.size >= 4 && !isProactiveTypeSuspended('sleep_care')) {
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
      if (elapsedDays >= 3 && !isProactiveTypeSuspended('memory_reminder')) {
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

/* ===== 方向1：触发时机多元化（AI自主 + 时机触发，参考 Yuralume/Sebastian）===== */

// 通道1：AI 自主规划——每天 8:00-9:00 让 AI 自主发一条消息（它自己决定说什么、带今天的安排感）
async function aiDailySchedule(){
  if(!proactiveEnabled()||(typeof callActive!=='undefined'&&callActive))return;
  const now=new Date();const h=now.getHours();
  if(h<8||h>9)return;
  const todayKey=(typeof getLocalDateString==='function')?getLocalDateString(now):now.toISOString().slice(0,10);
  if(localStorage.getItem('ai_schedule_day_'+todayKey)==='done')return;
  localStorage.setItem('ai_schedule_day_'+todayKey,'done');
  await triggerProactive('现在是早晨，你自主决定今天想什么时候、以什么心情主动联系用户。请现在就发一条消息，自然地带上今天的安排感或期待（30字内，像朋友一样直接说）。');
}

// 通道2：时机触发——静默回访 / 睡前关怀（各每天 1 次，与 AI 自主共用每日上限护栏）
async function checkMomentTriggers(){
  if(!proactiveEnabled()||(typeof callActive!=='undefined'&&callActive))return;
  if(inQuietHours())return;
  const now=new Date();const h=now.getHours();
  const todayKey=(typeof getLocalDateString==='function')?getLocalDateString(now):now.toISOString().slice(0,10);
  // ① 静默回访：用户最后活动 >3h（每天 1 次）
  const silentKey='moment_silent_'+todayKey;
  if(localStorage.getItem(silentKey)!=='done'){
    const act=parseInt(localStorage.getItem('proactive_activity')||'0');
    if(act>0&&(Date.now()-act)>3*3600*1000){
      localStorage.setItem(silentKey,'done');
      await triggerProactive('用户很久没说话了，主动找一句话自然地关心一下（30字内，不要提具体时间，像朋友一样）。');
      return;
    }
  }
  // ② 睡前关怀：21:00-22:00（每天 1 次）
  const nightKey='moment_night_'+todayKey;
  if(h>=21&&h<22&&localStorage.getItem(nightKey)!=='done'){
    localStorage.setItem(nightKey,'done');
    await triggerProactive('快休息了，给用户发一条温柔的睡前关怀（30字内，温暖自然）。');
  }
}

/* ===== 方向2：消息多样性（意图+线索+氛围随机组合，参考 Sebastian 组合系统）===== */
function buildProactiveCombo(){
  const intents = [
    '关心用户近况，温柔地问候一下',
    '分享一件你今天的小想法或小情绪',
    '围绕之前聊过的话题自然地再提一句',
    '表达想念，让用户感受到你在意TA',
    '给用户一个轻松的小惊喜或真诚的夸赞',
    '好奇用户正在做什么，自然地搭话',
  ];
  const h = new Date().getHours();
  const vibe = h<12 ? '早晨，语气轻快有活力' : h<18 ? '午后，语气轻松日常' : '夜晚，语气温柔放松';
  const intent = intents[Math.floor(Math.random()*intents.length)];
  return `（主动消息）请以${vibe}的口吻，${intent}。像朋友一样自然直接地说，30字内，不要客套开场白，不要提"主动消息"这类词。`;
}

/* ===== 方向3：预约系统（自然语言定时提醒，参考 Sebastian appointment system）===== */

// 解析自然语言时间：支持 "X分钟后" "X小时后" "今天/明天X点" "HH:MM"（返回 {time,text} 或 null）
function parseAppointmentText(text){
  const t = String(text||'').trim();
  if(!t) return null;
  let m, when = 0, content = t;
  if((m = t.match(/(\d+)\s*分钟后/))) { when = Date.now() + parseInt(m[1])*60000; content = t.replace(/\d+\s*分钟后\s*/,''); }
  else if((m = t.match(/(\d+)\s*小时后/))) { when = Date.now() + parseInt(m[1])*3600000; content = t.replace(/\d+\s*小时后\s*/,''); }
  else if((m = t.match(/(今天|明天|明早|明晚|早上|上午|中午|下午|晚上)\s*(\d{1,2})\s*[点时]/))) {
    const d = new Date();
    if(m[1]==='明天'||m[1]==='明早'||m[1]==='明晚') d.setDate(d.getDate()+1);
    d.setHours(parseInt(m[2]), 0, 0, 0);
    when = d.getTime(); content = t.replace(/(今天|明天|明早|明晚|早上|上午|中午|下午|晚上)\s*\d{1,2}\s*[点时]\s*/,'');
  }
  else if((m = t.match(/(\d{1,2}):(\d{2})/))) {
    const d = new Date(); d.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0);
    when = d.getTime(); content = t.replace(/\d{1,2}:\d{2}\s*/,'');
  }
  if(!when) return null;
  return { time: when, text: (content||'预约提醒').trim() || '预约提醒' };
}
window.parseAppointmentText = parseAppointmentText;

// 添加预约（localStorage 持久化，一次性触发）
function addAppointment(text){
  const p = parseAppointmentText(text);
  if(!p) return { ok:false, reason:'无法识别时间（支持：X分钟后/X小时后/今天X点/明天X点/HH:MM）' };
  const list = JSON.parse(localStorage.getItem('appointments')||'[]');
  list.push({ id: Date.now().toString(36)+Math.random().toString(36).slice(2,5), time: p.time, text: p.text });
  localStorage.setItem('appointments', JSON.stringify(list));
  return { ok:true, time: p.time, text: p.text, count: list.length };
}
window.addAppointment = addAppointment;

// 定时检查到期预约 → 触发 AI 提醒（一次性，触发后移除）
async function checkAppointments(){
  const list = JSON.parse(localStorage.getItem('appointments')||'[]');
  if(!list.length) return;
  const now = Date.now();
  const due = list.filter(a => a.time <= now);
  if(!due.length) return;
  for(const a of due){
    try { await triggerProactive(`（预约提醒）${a.text}——到时间了，自然地提醒用户这件事（30字内，不要提"预约"）。`); } catch(e) { console.warn('[Appointment] trigger error:', e); }
  }
  localStorage.setItem('appointments', JSON.stringify(list.filter(a => a.time > now)));
}
window.checkAppointments = checkAppointments;

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

    // 频率控制：自适应冷却试用版（不设硬上限，指数增长自然稀疏）
    // 冷却 = 30分钟 × 2^(今日已发条数-1)；用户近1h活跃 ×0.7，>6h没动静 ×2
    const todayStr = new Date().toDateString();
    const proactiveCountKey = `proactive_count_${todayStr}`;
    const proactiveCount = parseInt(localStorage.getItem(proactiveCountKey) || '0');
    if (!extraInstruction || extraInstruction.includes('每日回忆')) {
      const lastSentTs = parseInt(localStorage.getItem('proactive_sent_last') || '0');
      let cooldownMs = 30 * 60 * 1000 * Math.pow(2, Math.max(0, proactiveCount - 1));
      const lastActTs = parseInt(localStorage.getItem('proactive_activity') || '0');
      const sinceAct = Date.now() - lastActTs;
      if (lastActTs > 0) {
        if (sinceAct < 60 * 60 * 1000) cooldownMs *= 0.7;
        else if (sinceAct > 6 * 3600 * 1000) cooldownMs *= 2;
      }
      if (lastSentTs > 0 && Date.now() - lastSentTs < cooldownMs) {
        console.log(`[Proactive] Cooldown: sent ${proactiveCount} today, next in ~${Math.round(cooldownMs/60000)}min`);
        return;
      }
    }

    // 方向2：消息多样性——用户自定义 prompt 优先，否则用意图+氛围随机组合（参考 Sebastian 组合系统）
    const customProactivePrompt = localStorage.getItem('proactive_prompt');
    let activePromptText = extraInstruction || ((customProactivePrompt && customProactivePrompt.trim()) ? customProactivePrompt : (typeof buildProactiveCombo === 'function' ? buildProactiveCombo() : proactivePrompt()));
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

    let proactiveType = 'general';
    if (extraInstruction) {
      if (extraInstruction.includes('每日回忆')) {
        proactiveType = 'daily_review';
      } else {
        proactiveType = 'manual';
      }
    } else if (isPendingAction && pendingActions.length > 0) {
      proactiveType = pendingActions[0].type;
    }

    // Check if this type is suspended before executing
    if (isProactiveTypeSuspended(proactiveType)) {
      console.log(`[Proactive System] Type "${proactiveType}" is suspended. Aborting trigger.`);
      if (isPendingAction) {
        // Remove it from pending list anyway to not get stuck
        pendingActions.shift();
        localStorage.setItem('pendingProactiveActions', JSON.stringify(pendingActions));
      }
      return;
    }

    let recallItems=[];
    const lastUser=conversationHistory.filter(m=>m.role==='user').pop()?.content||'';
    if(ragEnabled()&&lastUser){try{recallItems=await recall(lastUser);}catch(e){}}
    
    const sp=await composeSystemPrompt(lastUser,recallItems,activePromptText);
    const shortTerm=ctxSlice(conversationHistory).filter(m=>!m.image).map(m=>({role:m.role==='imported'?'user':m.role,content:m.content}));
    const messages=[{role:'system',content:sp},...shortTerm,{role:'user',content:'(系统：到达主动联系时机，请主动发起一句话)'}];
    
    let endpoint=(provider.endpoint||'').trim();
    if(!endpoint) return;
    if(!/^https?:\/\//i.test(endpoint)) endpoint='https://'+endpoint;
    let url=endpoint.replace(/\/+$/,'');
    if(!url.includes('/chat/completions')&&!url.includes('messages')&&!url.includes('/v1/chat'))url+='/chat/completions';
    
    const headers={'Content-Type':'application/json'};
    const cleanApiKey=(apiKey||'').trim();
    if(cleanApiKey){
      if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${cleanApiKey}`;
      else if(provider.auth==='x-api-key')headers['x-api-key']=cleanApiKey;
      else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=cleanApiKey;
    }
    
    const body={model:selectedModelName,messages,stream:false};
    
    const r = await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
    
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

    // 方向4：主动消息统计——记录历史（保留最近 20 条，供设置面板统计展示）
    try {
      const hist = JSON.parse(localStorage.getItem('proactive_history') || '[]');
      hist.push({ time: Date.now(), type: proactiveType || 'general', text: reply.slice(0, 60) });
      localStorage.setItem('proactive_history', JSON.stringify(hist.slice(-20)));
    } catch(e) { console.warn('[Proactive] history record error:', e); }
    
    // Clear pending action from queue and increment count upon successful delivery
    if (isPendingAction) {
      pendingActions.shift();
      localStorage.setItem('pendingProactiveActions', JSON.stringify(pendingActions));
    }
    localStorage.setItem(proactiveCountKey, String(proactiveCount + 1));
    localStorage.setItem('proactive_sent_last', String(Date.now())); // 自适应冷却基准时间（真实发送时刻）
    
    // Record for feedback loop
    localStorage.setItem('lastProactiveType', proactiveType);
    localStorage.setItem('lastProactiveTime', String(Date.now()));
    
    showToast('💌 AI 主动发来一条消息');

    // 纯前端弹窗（无需后端，电脑 Chrome 直接弹）
    try {
      const notifSupported = 'Notification' in window;
      const notifPerm = Notification.permission;
      console.log('[Proactive] Notification check - supported:', notifSupported, 'permission:', notifPerm);
      if (notifSupported && notifPerm === 'granted') {
        const pushBody = reply.length > 80 ? reply.slice(0, 77) + '...' : reply;
        const n = new Notification('💌 AI 陪伴', {
          body: pushBody,
          icon: '/emotions/calm.webp',
          tag: 'proactive-care'
        });
        console.log('[Proactive] Notification sent successfully');
        // 3秒后自动关闭
        setTimeout(() => n.close(), 5000);
      } else {
        console.log('[Proactive] Notification skipped - not granted:', notifPerm);
      }
    } catch (e) {
      console.warn('[Proactive] Notification API error:', e);
    }

    // 后端推送（手机 PWA 场景，需 node server.js 运行）
    try {
      if (window.pushClient && typeof window.pushClient.sendProactive === 'function') {
        window.pushClient.sendProactive('💌 AI 陪伴', reply);
      }
    } catch (e) {
      // 后端不存在时静默降级
    }

    // Bark 推送（iOS 通知 → 华为运动健康App转发 → 手环），设置中开启后生效
    try {
      if (typeof barkEnabled === 'function' && barkEnabled() && typeof sendBarkNotification === 'function') {
        sendBarkNotification('💌 AI 陪伴', reply);
      }
    } catch (e) {
      console.warn('[Proactive] Bark push error:', e);
    }

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
window.processProactiveFeedback = processProactiveFeedback;
window.isProactiveTypeSuspended = isProactiveTypeSuspended;
