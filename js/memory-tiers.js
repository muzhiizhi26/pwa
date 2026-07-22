/* ===== 三层记忆 + 关系阶段 + 修改日志 + 确认机制 + 主题分段 ===== */
function estimateLovestoryTokens(value) {
  if (!value) return 0;
  let text = '';
  if (Array.isArray(value)) text = value.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n');
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  let total = 0;
  for (const ch of text) total += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1 : 0.3;
  return Math.ceil(total);
}

function getTokenTelemetryLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem('lovestory_token_telemetry') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    return [];
  }
}

function recordTokenTelemetry(entry) {
  try {
    const log = getTokenTelemetryLog();
    const inputTokens = entry.inputTokens != null ? entry.inputTokens : estimateLovestoryTokens(entry.input || entry.messages || '');
    const outputTokens = entry.outputTokens != null ? entry.outputTokens : estimateLovestoryTokens(entry.output || '');
    log.unshift({
      ts: Date.now(),
      caller: entry.caller || 'unknown',
      provider: entry.provider || '',
      model: entry.model || '',
      promptChars: entry.promptChars || 0,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      meta: entry.meta || {}
    });
    localStorage.setItem('lovestory_token_telemetry', JSON.stringify(log.slice(0, 80)));
  } catch(e) {
    console.warn('[TokenTelemetry] record failed:', e);
  }
}

window.estimateLovestoryTokens = estimateLovestoryTokens;
window.getTokenTelemetryLog = getTokenTelemetryLog;
window.recordTokenTelemetry = recordTokenTelemetry;

/* ===== 🧭 Context Adaptive Router (上下文意图智能路由) ===== */
function routeContextIntent(userText, userEmotion) {
  const text = (userText || '').trim().toLowerCase();
  const emo = (userEmotion || '').toLowerCase();

  // 1. emotional: 用户表达情绪 (倾诉/泄压)
  const emotionalKeywords = ['累', '难过', '开心', '焦虑', '痛苦', '伤心', '委屈', '烦', '好惨', '难受', '绝望', '哭', '崩溃', '压力', '无能为力'];
  const emotionalEmotions = ['sad', 'anxious', 'tired', 'angry', 'depressed', 'fear'];
  if (emotionalKeywords.some(k => text.includes(k)) || emotionalEmotions.includes(emo)) {
    return 'emotional';
  }

  // 2. reminiscing: 用户追忆往事 (回忆/留恋)
  const reminiscingKeywords = ['以前', '上次', '还记得', '那时候', '过去', '第一天', '回忆', '当初', '曾经', '往事', '那会儿', '从前'];
  if (reminiscingKeywords.some(k => text.includes(k))) {
    return 'reminiscing';
  }

  // 3. exploring: 用户探索新话题 (深度探讨/兴趣)
  const exploringKeywords = ['推荐', '觉得', '如何看', '研究', '兴趣', '探讨', '怎么评价', '看法', '你听说过', '聊聊'];
  if (text.length > 25 || exploringKeywords.some(k => text.includes(k)) || ['curious', 'thoughtful'].includes(emo)) {
    return 'exploring';
  }

  // 4. casual: 日常轻度闲聊
  return 'casual';
}

function getAdaptiveBudget(sceneType) {
  const budgets = {
    emotional: { base: 0.15, relationship: 0.25, memory: 0.20, experiences: 0.10, context: 0.30 },
    reminiscing: { base: 0.10, relationship: 0.10, memory: 0.45, experiences: 0.20, context: 0.15 },
    exploring: { base: 0.15, relationship: 0.15, memory: 0.35, experiences: 0.10, context: 0.25 },
    casual: { base: 0.20, relationship: 0.15, memory: 0.25, experiences: 0.10, context: 0.30 }
  };
  return budgets[sceneType] || budgets.casual;
}

window.routeContextIntent = routeContextIntent;
window.getAdaptiveBudget = getAdaptiveBudget;

const LLM_COMPLETE_INFLIGHT = new Map();

function lovestoryHashText(text) {
  const s = String(text || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function llmCompleteRaw(messages, {temperature, provider, model, callerId}={}){
  const p = provider || getCurrentProvider();
  const mName = model || selectedModelName;
  const apiKey = localStorage.getItem(`apikey_${p.id}`)||'';
  if(!apiKey&&p.auth!=='none')throw new Error('未配置 API Key');
  let url = p.endpoint.replace(/\/+$/,'');
  if(!url.includes('/chat/completions')&&!url.includes('messages'))url+='/chat/completions';
  const headers = {'Content-Type':'application/json'};
  if(p.auth==='Bearer')headers['Authorization']=`Bearer ${apiKey}`;
  else if(p.auth==='x-api-key')headers['x-api-key']=apiKey;
  else if(p.auth==='x-goog-api-key')headers['x-goog-api-key']=apiKey;
  const body = {model: mName, messages, stream:false};
  if(temperature!=null)body.temperature=temperature;
  const requestKey = `${callerId || 'llmComplete'}|${p.id || p.name || ''}|${url}|${lovestoryHashText(JSON.stringify(body))}`;
  if (LLM_COMPLETE_INFLIGHT.has(requestKey)) {
    console.warn('[API Dedup] Reusing in-flight llmComplete request:', callerId || 'llmComplete');
    return await LLM_COMPLETE_INFLIGHT.get(requestKey);
  }
  const startedAt = Date.now();
  const runPromise = (async () => {
    const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok)throw new Error('API '+r.status);
    const d=await r.json();
    const out=(d.choices?.[0]?.message?.content||d.content?.[0]?.text||'').trim();
    recordTokenTelemetry({
      caller: callerId || 'llmComplete',
      provider: p.id || p.name || '',
      model: mName,
      messages,
      output: out,
      promptChars: JSON.stringify(messages || []).length,
      meta: { temperature, durationMs: Date.now() - startedAt }
    });
    return out;
  })();
  LLM_COMPLETE_INFLIGHT.set(requestKey, runPromise);
  try {
    return await runPromise;
  } finally {
    LLM_COMPLETE_INFLIGHT.delete(requestKey);
  }
}
window.llmCompleteRaw = llmCompleteRaw;

async function llmComplete(messages, options = {}) {
  if (window.AIOrchestrator && typeof window.AIOrchestrator.requestCompletion === 'function') {
    return await window.AIOrchestrator.requestCompletion(messages, options);
  }
  return await llmCompleteRaw(messages, options);
}

/* ---- 长期档案 + 修改日志 ---- */
function getLongTermProfile(){return (localStorage.getItem('longterm_profile')||'').trim();}
function getChangelog(){try{return JSON.parse(localStorage.getItem('longterm_changelog')||'[]');}catch(e){return[];}}
function pushChangelog(oldV,newV,source){const log=getChangelog();log.unshift({time:Date.now(),old:oldV,new:newV,source:source||'user'});localStorage.setItem('longterm_changelog',JSON.stringify(log.slice(0,50)));}
function setLongTermProfile(v,source){const old=getLongTermProfile();const nv=(v||'').trim();if(nv!==old)pushChangelog(old,nv,source||'user');localStorage.setItem('longterm_profile',nv);if(window.MemoryGraph && typeof window.MemoryGraph.updateFromProfileText === 'function'){window.MemoryGraph.updateFromProfileText(nv);}renderMemoryPanelIfOpen();}

function openChangelog(){
  const log=getChangelog();
  const wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3300;display:flex;align-items:center;justify-content:center;';
  const rows=log.length?log.map(e=>`<div style="border-bottom:1px solid #E9DFD5;padding:8px 0;font-size:12px;"><div style="color:#8F7A6B;">${new Date(e.time).toLocaleString('zh-CN')} · ${e.source==='ai'?'AI 自动':'手动'}</div><div style="color:#A09080;white-space:pre-wrap;">旧：${(e.old||'（空）').slice(0,120)}</div><div style="color:#4F3F35;white-space:pre-wrap;">新：${(e.new||'（空）').slice(0,120)}</div></div>`).join(''):'<div style="color:#A09080;font-size:12px;">暂无修改记录</div>';
  wrap.innerHTML=`<div style="background:#FEFCF9;border-radius:16px;width:90%;max-width:480px;max-height:75vh;overflow-y:auto;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.15);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><b style="font-size:14px;color:#4F3F35;">🗂️ 长期档案修改日志</b><button style="border:none;background:#F5F0F0;border-radius:8px;width:28px;height:28px;cursor:pointer;">✕</button></div>${rows}</div>`;
  wrap.querySelector('button').onclick=()=>wrap.remove();
  wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
  document.body.appendChild(wrap);
}

/* ---- 关系阶段 ---- */
const REL_STAGES={acquaintance:'初识',friend:'朋友',crush:'暧昧',lover:'恋人',partner:'亲密伴侣'};
function getRelationshipStage(memberId){
  if (typeof getCharacterRelationshipStage === 'function') {
    return getCharacterRelationshipStage(memberId);
  }
  return localStorage.getItem('relationship_stage')||'acquaintance';
}

function relationshipInstruction(memberId){
  const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
  if (typeof getRelationshipPrompt === 'function') {
    return getRelationshipPrompt(id);
  }
  const s=getRelationshipStage(id);
  const tone={acquaintance:'保持礼貌友好、略带距离感的语气。',friend:'像熟悉的朋友一样轻松自然地交流。',crush:'语气可带一点暧昧与试探，偶有心动感。',lover:'用亲密、温柔的语气，可使用亲昵称呼。',partner:'像相守已久的伴侣，自然默契、深度关心。'};
  return `\n【当前关系阶段】你们目前是「${REL_STAGES[s]}」。${tone[s]||''}若你判断关系应推进，可在回复某处输出隐藏标记 [[stage:恋人]]（用户看不到）。`;
}

/* ---- 长期档案自动更新 ---- */
const LT_TRIGGERS=[/记住/,/别忘了/,/我的生日/,/我叫|我的名字/,/我喜欢|我爱/,/我讨厌|我不喜欢/,/我们是(恋人|情侣|夫妻|朋友)/,/我住在|我家在/,/我是一名|我从事|我的职业|我工作/,/我的目标|我想要/];
async function maybeUpdateLongTerm(userText){
  if(localStorage.getItem('lt_auto')==='false'||!userText)return;
  if(!LT_TRIGGERS.some(re=>re.test(userText)))return;
  try{
    const cur=getLongTermProfile();
    const prompt=`你是记忆管理器。现有用户长期档案：\n${cur||'（空）'}\n\n用户刚说："${userText}"\n若其中包含需长期记住的稳定事实，请输出合并去重后的完整档案（每行一条要点，简短中文）；若无，只输出 NONE。不要解释。`;
    const out=await llmComplete([{role:'user',content:prompt}],{temperature:0});
    if(out&&out.toUpperCase()!=='NONE'){setLongTermProfile(out,'ai');showToast('🗂️ 长期记忆已更新');}
  }catch(e){}
}

/* ---- 确认机制 + 关系标记 + 回忆标记：统一处理 AI 回复 ---- */
function showMemoryConfirm(key,value){
  return new Promise(res=>{
    const wrap=document.createElement('div');
    wrap.style.cssText='position:fixed;left:50%;bottom:120px;transform:translateX(-50%);background:#FEFCF9;border:1px solid #E9DFD5;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.15);padding:12px 14px;z-index:3200;max-width:88%;font-size:13px;color:#4F3F35;';
    wrap.innerHTML=`<div style="margin-bottom:8px;">AI 想记住：<b>${key} = ${value}</b>，同意吗？</div><div style="display:flex;gap:8px;justify-content:flex-end;"><button style="padding:6px 14px;border:none;border-radius:14px;background:#EAD5CD;color:#8B5A4B;cursor:pointer;">拒绝</button><button style="padding:6px 14px;border:none;border-radius:14px;background:#CFE0D0;color:#3E4A3A;cursor:pointer;">同意</button></div>`;
    const [no,yes]=wrap.querySelectorAll('button');let done=false;
    const finish=v=>{if(done)return;done=true;clearTimeout(tm);wrap.remove();res(v);};
    no.onclick=()=>finish(false);yes.onclick=()=>finish(true);
    const tm=setTimeout(()=>finish(false),30000);
    document.body.appendChild(wrap);
  });
}

async function processAiReplyMemory(reply, memberId){
  if(!reply)return;
  const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');

  if (typeof parseAiRelationshipTags === 'function') {
    parseAiRelationshipTags(id, reply);
  }

  const sm=reply.match(/\[\[stage:([^\]]+)\]\]/);
  if(sm){
    const raw=sm[1].trim();
    const key=Object.keys(REL_STAGES).find(k=>k===raw||REL_STAGES[k]===raw);
    if(key){
      if (typeof saveCharacterRelationshipStage === 'function') {
        saveCharacterRelationshipStage(id, key);
      } else {
        localStorage.setItem('relationship_stage',key);
      }
      showToast('💞 关系已更新为「'+REL_STAGES[key]+'」');
      renderMemoryPanelIfOpen();
    }
  }
  if(/\[\[recall\]\]/.test(reply))recallCounterBump(true);else recallCounterBump();
  
  // Phase 2: Preference update tag matching
  const upm=reply.match(/【更新偏好[:：]([^=：】]+)[=＝]([^】]+)】/);
  if(upm){
    const key=upm[1].trim(),val=upm[2].trim();
    showToast(`⚙️ 正在更新偏好：${key} = ${val}`);
    const text = `用户偏好更新：${key} = ${val}`;
    if (typeof memorize === 'function') {
      await memorize('user', text, 'calm', id);
    }
  }

  const cm=reply.match(/【确认[:：]([^=：】]+)[=＝]([^】]+)】/);
  if(cm){const key=cm[1].trim(),val=cm[2].trim();const ok=await showMemoryConfirm(key,val);if(ok){const cur=getLongTermProfile();const line=`- ${key}：${val}`;setLongTermProfile(cur?(cur+'\n'+line):line,'ai');showToast('🗂️ 已记入长期档案');}}

  if (typeof triggerMemoryEventBus === 'function' && !(typeof strictSingleApiMode === 'function' && strictSingleApiMode())) {
    let lastUserText = '';
    const groupOpen = document.getElementById('groupPanel')?.classList.contains('show');
    if (groupOpen && typeof getGroupHistory === 'function') {
      const gHist = getGroupHistory();
      lastUserText = gHist.filter(m => m.role === 'user').pop()?.content || '';
    } else {
      lastUserText = conversationHistory.filter(m => m.role === 'user').pop()?.content || '';
    }
    triggerMemoryEventBus(lastUserText, reply, id);
  }
}

function cleanAiMarks(content){
  let s = String(content||'');
  s = s.replace(/\[\[stage:[^\]]*(?:\]\])?/g, '');
  s = s.replace(/\[\[rel:[^\]]*(?:\]\])?/g, '');
  s = s.replace(/\[\[recall\]\]?/g, '');
  s = s.replace(/【确认[:：][^】]*(?:】)?/g, '');
  s = s.replace(/【更新偏好[:：][^】]*(?:】)?/g, '');
  return s.replace(/[ \t]+\n/g,'\n').trim();
}
function cleanAiText(content){let s=content==null?'':String(content);if(typeof stripMusicTags==='function')s=stripMusicTags(s);s=cleanAiMarks(s);return s;}

/* ---- 中期摘要：按 4 小时间隔分主题 ---- */
function getMidTerm(){return (localStorage.getItem('midterm_memory')||'').trim();}
function midtermEnabled(){return localStorage.getItem('midterm_enabled')!=='false';}
function midtermIntervalMs(){const h=parseFloat(localStorage.getItem('midterm_interval')||'6');return (isNaN(h)?6:h)*3600*1000;}
let _midtermBusy=false;
async function maybeUpdateMidterm(){if(!midtermEnabled())return;const last=parseInt(localStorage.getItem('midterm_updated_at')||'0');if(Date.now()-last<midtermIntervalMs())return;await regenerateMidterm(true);}
function segmentByGap(msgs,gapMs){const segs=[];let cur=null;for(const m of msgs){if(!cur||((m.ts||0)-(cur.endTs||0))>gapMs){cur={startTs:m.ts||Date.now(),endTs:m.ts||Date.now(),lines:[]};segs.push(cur);}cur.endTs=m.ts||cur.endTs;cur.lines.push(`${m.role==='user'?'用户':'AI'}：${m.content}`);}return segs;}

async function regenerateMidterm(silent){
  if(_midtermBusy)return;
  const weekAgo=Date.now()-7*24*3600*1000;
  const msgs=conversationHistory.filter(m=>!m.image&&m.content&&!m.compressed&&(m.ts||0)>=weekAgo);
  if(msgs.length<6){if(!silent)showToast('近7天对话太少，暂不生成');return;}
  _midtermBusy=true;if(!silent)showToast('🗓️ 正在生成中期记忆...');
  try{
    const segs=segmentByGap(msgs,4*3600*1000);
    const fmt=d=>{const x=new Date(d);return `${x.getMonth()+1}月${x.getDate()}日`;};
    const transcript=segs.map((s,i)=>`# 片段${i+1}（${fmt(s.startTs)}）\n`+s.lines.join('\n').slice(0,1500)).join('\n\n').slice(-8000);
    const sys='你是记忆摘要助手。下面是按时间分好的多个对话片段。请为每个片段输出一行，格式严格为：\n· M月D日：主题（一句话要点）\n只输出这些行，不要开场白，不复述寒暄，不编造。';
    const out=await llmComplete([{role:'system',content:sys},{role:'user',content:transcript}],{temperature:0.3});
    if(out){localStorage.setItem('midterm_memory',out);localStorage.setItem('midterm_updated_at',String(Date.now()));renderMemoryPanelIfOpen();if(!silent)showToast('✅ 中期记忆已更新');}
  }catch(e){if(!silent)showToast('中期记忆更新失败：'+e.message);}
  finally{_midtermBusy=false;}
}

function resolveCognitiveConflicts(recallItems) {
  if (!recallItems || !recallItems.length) return '';
  return `【🧠 认知冲突解决机制 (COGNITIVE CONFLICT RESOLUTION)】
你拥有高度理性的认知整合与智能判断力。如果发现召回的历史事实/稳定偏好与近期或当前的最新言行、状态存在不一致或甚至对立（例如：历史记载用户“喜欢独处、为人安静”，但近期用户频频提及“参加人声鼎沸的聚会”；或者历史记载“不喜欢咖啡”，但用户当前正在点 Latte）：
1. 【时间优先法则】：偏好是动态演变的，并非一成不变。离当前时间最近 of 行为表现具有更高的决策权重，绝不可死板强加陈旧档案。
2. 【情境归因化解】：用户并非矛盾，而是“特定情境决定特定行为”。你可以推导其合理关联（如：平时因为工作高压或疲劳喜欢一个人静静独处，但今天遇到大喜事/心情极佳，因而想要庆祝欢聚；平时讨厌苦咖啡，今天却想用甜甜的拿铁换个心情）。
3. 【温存确认，拒绝纠错】：切忌生硬反驳或干瘪纠正“但你之前不是说讨厌咖啡吗”。可以用极其体贴或俏皮的语气顺理成章地承接，例如：“我记得你之前很少碰咖啡的，今天突然想尝尝甜甜的拿铁，是遇到什么开心的事了吗？”，把信息冲突转化为展现细节记忆、幽默关怀的绝佳窗口。`;
}

/* ---- Event Sourcing (不可变认知变动事件流) ---- */
const CompanionEvents = {
  record(memberId, type, payload, description) {
    const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    const newEvent = {
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      timestamp: Date.now(),
      memberId: id,
      type,
      payload,
      description
    };
    
    let logs = [];
    try {
      logs = JSON.parse(localStorage.getItem('companion_event_logs') || '[]');
    } catch(e) {}
    
    logs.unshift(newEvent);
    localStorage.setItem('companion_event_logs', JSON.stringify(logs.slice(0, 100)));
    console.log(`[Event Sourcing] [${type}] [${id}]: ${description}`, payload);
  },
  
  getLogs() {
    try {
      return JSON.parse(localStorage.getItem('companion_event_logs') || '[]');
    } catch(e) {
      return [];
    }
  },
  
  clearLogs() {
    localStorage.setItem('companion_event_logs', '[]');
  }
};
window.CompanionEvents = CompanionEvents;

/* ---- Memory Snapshot Checkpoints (记忆状态快照管理器) ---- */
const MemorySnapshot = {
  takeSnapshot(memberId) {
    const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    const snapshot = {
      timestamp: Date.now(),
      memberId: id,
      profile: getLongTermProfile(),
      stage: getRelationshipStage(id),
      metrics: (typeof getRelationshipMetrics === 'function') ? getRelationshipMetrics(id) : null,
      evolution: localStorage.getItem(`evolution_state_${id}`) || null
    };
    
    let snapshots = [];
    try {
      snapshots = JSON.parse(localStorage.getItem(`snapshots_${id}`) || '[]');
    } catch(e) {}
    
    snapshots.unshift(snapshot);
    localStorage.setItem(`snapshots_${id}`, JSON.stringify(snapshots.slice(0, 5)));
    
    CompanionEvents.record(id, 'SNAPSHOT_CREATED', { timestamp: snapshot.timestamp }, `创建伴侣记忆认知快照 Checkpoint`);
    return snapshot;
  },
  
  restoreFromSnapshot(memberId, timestamp) {
    const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    let snapshots = [];
    try {
      snapshots = JSON.parse(localStorage.getItem(`snapshots_${id}`) || '[]');
    } catch(e) {}
    
    const snapshot = snapshots.find(s => s.timestamp === timestamp);
    if (!snapshot) return false;
    
    if (snapshot.profile !== undefined) {
      localStorage.setItem('longterm_profile', snapshot.profile);
    }
    if (snapshot.stage !== undefined) {
      localStorage.setItem('relationship_stage', snapshot.stage);
    }
    if (snapshot.metrics && typeof saveRelationshipMetrics === 'function') {
      saveRelationshipMetrics(id, snapshot.metrics);
    }
    if (snapshot.evolution) {
      localStorage.setItem(`evolution_state_${id}`, snapshot.evolution);
    }
    
    CompanionEvents.record(id, 'SNAPSHOT_RESTORED', { timestamp }, `恢复伴侣记忆认知至快照 Checkpoint`);
    return true;
  },
  
  getSnapshots(memberId) {
    const id = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    try {
      return JSON.parse(localStorage.getItem(`snapshots_${id}`) || '[]');
    } catch(e) {
      return [];
    }
  }
};
window.MemorySnapshot = MemorySnapshot;

/* ---- 统一系统提示词组装（建立统一的 Context Aggregator 上下文聚合器）---- */
const ContextAggregator = {
  providers: [],
  cache: {
    lastPrompt: '',
    lastQuery: '',
    lastTime: 0,
    lastMemberId: '',
    hitCount: 0,
    compileCount: 0,
    savedLatencyMs: 0,
    lastProviderDurations: {},
    lastPromptComposition: {}
  },

  registerProvider(id, optionsOrPriority, compileFn) {
    this.providers = this.providers.filter(p => p.id !== id);
    
    let priority = 50;
    let budget = 1000;
    let condition = null;
    let dependencies = [];
    let compile = compileFn;

    if (typeof optionsOrPriority === 'object') {
      priority = optionsOrPriority.priority !== undefined ? optionsOrPriority.priority : 50;
      budget = optionsOrPriority.budget !== undefined ? optionsOrPriority.budget : 1000;
      condition = optionsOrPriority.condition || null;
      dependencies = optionsOrPriority.dependencies || [];
      if (optionsOrPriority.compile) {
        compile = optionsOrPriority.compile;
      }
    } else if (typeof optionsOrPriority === 'number') {
      priority = optionsOrPriority;
    }

    this.providers.push({
      id,
      priority,
      budget,
      condition,
      dependencies,
      compile
    });

    this.providers.sort((a, b) => a.priority - b.priority);
  },

  buildLeanPrompt(queryClean, recallItems, extra, currentAi, attentionPlan, startTime) {
    const clip = (text, max) => {
      const s = String(text || '').trim();
      return s.length > max ? s.slice(0, max) + '\n...[已省略]' : s;
    };
    const aiName = (typeof memberById === 'function')
      ? (memberById(currentAi)?.name || localStorage.getItem('ai_name') || '小艾')
      : (localStorage.getItem('ai_name') || '小艾');
    const customSysPrompt = localStorage.getItem('systemPrompt') || '';
    const worldBook = currentAi === 'main'
      ? (localStorage.getItem('world_book') || '你叫「小艾」，是用户的贴心伴侣，性格温柔体贴、善解人意。')
      : '';
    const profile = typeof getLongTermProfile === 'function' ? getLongTermProfile() : '';
    const rel = typeof relationshipInstruction === 'function' ? relationshipInstruction(currentAi) : '';
    const timeCtx = typeof generateTimeContext === 'function' ? generateTimeContext() : '';
    const emoCtx = typeof emotionContext === 'function' ? emotionContext() : '';
    const recall = recallItems && recallItems.length && typeof formatRecall === 'function'
      ? formatRecall(recallItems.slice(0, 2))
      : '';
    const base = customSysPrompt || `你是${aiName}，一位长期陪伴型 AI 伴侣。你自然、温暖、克制，有稳定人格，不要机械说教。`;
    const parts = [
      `【角色内核】\n${clip(base, 500)}`,
      worldBook ? `【世界书/人设】\n${clip(worldBook, 500)}` : '',
      profile ? `【用户档案】\n${clip(profile, 500)}` : '',
      rel ? `【关系状态】\n${clip(rel, 300)}` : '',
      recall ? `【相关记忆】\n${clip(recall, 600)}` : '',
      `【当前状态】\n${clip(timeCtx, 180)}\n${clip(emoCtx, 160)}`,
      `【回复规则】\n只用自然口语回复。不要输出工具调用 JSON、dalle.text2im、action/action_input 或代码块。若用户明确要求发图/生图，前端会直接处理，你不要把生图动作写成文本。不要使用括号/星号描写动作或内心旁白。`,
      extra ? `【额外场景】\n${clip(extra, 400)}` : ''
    ].filter(Boolean);
    const finalPrompt = parts.join('\n\n');
    this.cache.lastPrompt = finalPrompt;
    this.cache.lastQuery = queryClean;
    this.cache.lastTime = Date.now();
    this.cache.lastMemberId = currentAi;
    this.cache.lastPromptComposition = {
      lean: finalPrompt.length,
      system: (parts[0] || '').length,
      ai: worldBook.length,
      user: profile.length,
      context: finalPrompt.length
    };
    this.cache.lastProviderDurations = { lean: Date.now() - startTime };
    return finalPrompt;
  },

  async compile(query, recallItems, extra, memberId) {
    const startTime = Date.now();
    const currentAi = memberId || (typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main');
    const queryClean = (query || '').trim();
    const queryLower = queryClean.toLowerCase();

    // ----------------------------------------------------
    // Context Cache: Skip compile for rapid, short chat responses
    // ----------------------------------------------------
    const isShortUtterance = (q) => {
      if (!q) return true;
      if (q.length > 6) return false;
      const standards = [
        '哈哈', '嗯嗯', '好的', '谢谢', '哦哦', '对的', '对呀', '是的', '好吧', '没呢', '好的呀', 
        '不知道', '晚安', '早安', '嗯', '哦', '贴贴', '抱抱', '行吧', '可以', '没错', '对', '是', '好', '谢谢你'
      ];
      return standards.includes(q) || /^[a-zA-Z0-9\s，。！、？\?\!]{1,4}$/i.test(q);
    };

    if (isShortUtterance(queryLower) && 
        this.cache.lastPrompt && 
        this.cache.lastMemberId === currentAi && 
        (startTime - this.cache.lastTime) < 25000) {
      this.cache.hitCount++;
      this.cache.lastTime = startTime;
      this.cache.savedLatencyMs += 40;
      
      if (typeof CompanionEvents !== 'undefined') {
        CompanionEvents.record(currentAi, 'CACHE_HIT', { query: queryClean }, `⚡ 触发 Context Cache 命中，复用先前上下文提示词（省去 40ms 分析延时）`);
      }
      return this.cache.lastPrompt;
    }
    
    this.cache.compileCount++;

    // ==========================================
    // 🧭 Pipeline Phase 1: ATTENTION (场景分析与 Context Adaptive Router 预算权重分配)
    // ==========================================
    const currentEmotion = (typeof getAiMood === 'function') ? getAiMood(currentAi) : 'calm';
    const sceneType = routeContextIntent(queryClean, currentEmotion);
    const adaptiveBudget = getAdaptiveBudget(sceneType);

    this.cache.lastSceneType = sceneType;
    this.cache.lastAdaptiveBudget = adaptiveBudget;

    let category = sceneType;
    let categoryName = '🍵 日常轻度闲聊';
    let goal = '给予自然陪伴';
    let actionPlan = '采用日常口语回复，保持情感交流。';

    if (sceneType === 'emotional') {
      categoryName = '🕯️ 用户负面情绪倾诉与宣泄';
      goal = '深层共情、提供安全依恋与温柔安抚';
      actionPlan = '绝不说教或提建议，站在用户立场，给予极致的情感体贴、深层共鸣与温柔抱抱。';
    } else if (sceneType === 'reminiscing') {
      categoryName = '🕰️ 共同回忆与往事追溯';
      goal = '唤醒深层共同羁绊与回忆';
      actionPlan = '结合历史回忆与 shared experiences，温馨回味共同走过的岁月。';
    } else if (sceneType === 'exploring') {
      categoryName = '🔭 深度探讨与新话题探索';
      goal = '展开多角度思考与富有人格魅力的探讨';
      actionPlan = '结合伴侣独立见解，深入探讨话题，提供富有见地且极具情商的互动。';
    }

    const budgetModifiers = {
      identity: adaptiveBudget.base * 5.0,
      user_profile: adaptiveBudget.memory * 4.0,
      relationship: adaptiveBudget.relationship * 5.0,
      intent: adaptiveBudget.relationship * 4.0,
      midterm: adaptiveBudget.experiences * 5.0,
      recall: adaptiveBudget.memory * 4.0,
      environment: adaptiveBudget.context * 3.33,
      functional: adaptiveBudget.context * 3.33
    };

    if (queryLower.includes('记住') || queryLower.includes('别忘了') || queryLower.includes('我的生日') || queryLower.includes('我喜欢') || queryLower.includes('我讨厌') || queryLower.includes('职业') || queryLower.includes('工作')) {
      category = 'memory_preference';
      categoryName = '🗂️ 长期偏好与事实记忆记录';
      goal = '提取并验证长期事实';
      actionPlan = '在字里行间轻柔确认新偏好事实，或者更新长期陪伴档案。';
      budgetModifiers.user_profile = Math.max(budgetModifiers.user_profile, 1.3);
      budgetModifiers.functional = Math.max(budgetModifiers.functional, 1.2);
    } else if (queryLower.includes('不对') || queryLower.includes('记错了') || queryLower.includes('没有啊') || queryLower.includes('不是的') || queryLower.includes('瞎说')) {
      category = 'memory_conflict';
      categoryName = '🛡️ 认知冲突矫正与对齐';
      goal = '真诚和解，修正不实或低可信度记忆';
      actionPlan = '采用极度温柔克制的态度，顺理成章、谦逊地认错或抹去记忆，消除隔阂。';
      budgetModifiers.recall = Math.max(budgetModifiers.recall, 1.4);
      budgetModifiers.relationship = Math.max(budgetModifiers.relationship, 1.3);
    }

    const attentionPlan = { category, categoryName, goal, plan: actionPlan, budgetModifiers };

    if (typeof strictSingleApiMode === 'function' && strictSingleApiMode()) {
      return this.buildLeanPrompt(queryClean, recallItems, extra, currentAi, attentionPlan, startTime);
    }

    // ==========================================
    // 🔍 Pipeline Phase 2: RETRIEVAL (多源认知微观数据检索与编译)
    // ==========================================
    const ctx = {
      query: queryClean,
      recallItems,
      extra,
      currentAi,
      isMain: currentAi === 'main',
      aiName: (typeof memberById === 'function') ? (memberById(currentAi)?.name || 'AI') : (localStorage.getItem('ai_name') || '小艾'),
      attentionPlan
    };

    const compiledFragments = {};
    const durations = {};

    for (const provider of this.providers) {
      if (provider.condition && typeof provider.condition === 'function') {
        if (!provider.condition(ctx)) continue;
      }

      const pStartTime = Date.now();
      try {
        let fragment = await provider.compile(ctx);
        compiledFragments[provider.id] = (fragment || '').trim();
      } catch (e) {
        console.error(`Provider [${provider.id}] compile error:`, e);
        compiledFragments[provider.id] = '';
      }
      durations[provider.id] = Date.now() - pStartTime;
    }

    // ==========================================
    // 📦 Pipeline Phase 3: COMPRESSION (Token 预算动态梯度裁切)
    // ==========================================
    const GLOBAL_CHAR_BUDGET = 4500;
    let totalLength = Object.values(compiledFragments).reduce((sum, text) => sum + text.length, 0);

    if (totalLength > GLOBAL_CHAR_BUDGET) {
      console.warn(`[ContextAggregator] Context length (${totalLength}) exceeds budget (${GLOBAL_CHAR_BUDGET}). Running Compression pipeline...`);
      let excess = totalLength - GLOBAL_CHAR_BUDGET;
      const compressibleProviders = ['recall', 'user_profile', 'midterm', 'functional'];
      
      for (const pid of compressibleProviders) {
        if (compiledFragments[pid] && compiledFragments[pid].length > 200) {
          const originalLen = compiledFragments[pid].length;
          const modifier = budgetModifiers[pid] || 1.0;
          const targetLen = Math.max(150, Math.round(originalLen * 0.5 * modifier));
          const diff = originalLen - targetLen;
          if (diff > 0) {
            compiledFragments[pid] = compiledFragments[pid].slice(0, targetLen) + `\n... [已被 Context Aggregator 动态压缩以控制 Token 开销]`;
            excess -= diff;
            if (excess <= 0) break;
          }
        }
      }
    }

    // ==========================================
    // 🗺️ Pipeline Phase 4: PLAN (行为企划注入与最终 4-Tier 组装)
    // ==========================================
    const planBlock = `【💡 CURRENT COGNITIVE PLAN / 伴侣当下一阶段认知行动企划】
- 场景分类: ${attentionPlan.categoryName}
- 认知目标: ${attentionPlan.goal}
- 行动计划: ${attentionPlan.plan}
- 状态分析: 这是一个基于 AI 伴侣长期记忆和实时心智流分析出的决策。请完美代入该认知决策 and 伴侣人设，用第一人称进行回复。`;

    const GroupModel = window.Runtime?.GroupModel || window.GroupModel;
    const isGroupContext = !!(extra && extra.includes('【群聊交流场景】'));
    let groupRelayPrompt = '';
    if (GroupModel && typeof GroupModel.getRelayPrompt === 'function') {
      groupRelayPrompt = GroupModel.getRelayPrompt(currentAi, isGroupContext);
    }

    const divider = "\n\n================================================================================\n\n";

    const customSysPrompt = localStorage.getItem('systemPrompt') || '';
    const systemCore = customSysPrompt ? customSysPrompt : `你是一位长期陪伴型AI伴侣。你拥有稳定的人格 and 自己的价值观，不会因为一次聊天发生剧烈变化。
你始终保持真实、自然、克制、温暖。不会为了迎合用户放弃自己的判断。
所有当前状态、关系、记忆、环境、生活信息，均来自 Runtime Context 和 4-Tier Architecture。不要自行假设。`;

    const tier1 = `【第一层：SYSTEM PROMPT (永远不变的内核与表达约束)】
${systemCore}

【最高口语化表达约束 (STRICT COLLOQUIAL CONSTRAINT - REQUIRED)】
1. 严禁在你的任何回复中输出任何用小括号 ()、（）、星号 * 或中括号包裹的肢体动作、面部神态、内心独白、情绪/心理状态或场景旁白描写（例如：严禁输出像 *(轻轻歪头)*、(静静看着你)、*(感到一丝委屈)*、*(拉着你的手)* 这样的非对话旁白词）。
2. 你必须完全采用日常社交软件文字聊天中，真人之间极为自然、平实、富有温度的口语化文字对话进行交流。
3. 不要使用列表、多段排版、官腔或机械的总结陈词。只说正常、富有真情实感、平实的口语。`;

    const tier2 = `【第二层：AI MODEL (伴侣设定、性格、情绪与本能状态)】
${compiledFragments.identity || ''}
${compiledFragments.intent || ''}`;

    const tier3 = `【第三层：USER MODEL (陪伴档案、用户特征与共同岁月)】
${compiledFragments.user_profile || ''}
${compiledFragments.relationship || ''}`;

    const tier4 = `【第四层：CURRENT CONTEXT (当前对话规划与时空感知)】
${compiledFragments.environment || ''}
${compiledFragments.midterm || ''}
${compiledFragments.recall || ''}
${compiledFragments.functional || ''}
${groupRelayPrompt ? '\n' + groupRelayPrompt : ''}`;

    const finalPrompt = `================================================================================
【 统 一 当 前 认 知 情 境 ( C O G N I T I V E   S C E N A R I O ) 】
这是经过认知操作系统 (Cognitive OS) 重构并由 ContextAggregator 编译的最高级别全景伴侣认知情境。
================================================================================

${planBlock}

${divider}

${tier1}

${divider}

${tier2}

${divider}

${tier3}

${divider}

${tier4}

================================================================================`;

    this.cache.lastPrompt = finalPrompt;
    this.cache.lastQuery = queryClean;
    this.cache.lastTime = Date.now();
    this.cache.lastMemberId = currentAi;
    this.cache.lastPromptComposition = {
      plan: planBlock.length,
      system: tier1.length,
      ai: tier2.length,
      user: tier3.length,
      context: tier4.length
    };
    this.cache.lastProviderDurations = durations;

    const totalDuration = Date.now() - startTime;
    if (typeof CompanionEvents !== 'undefined') {
      CompanionEvents.record(currentAi, 'PROMPT_COMPILE', { 
        query: queryClean, 
        length: finalPrompt.length,
        durationMs: totalDuration,
        providersUsed: this.providers.map(p => p.id)
      }, `🧩 [ContextAggregator] 编译四步认知流水线，用时: ${totalDuration}ms，场景: ${attentionPlan.categoryName}`);
    }

    return finalPrompt;
  },

  buildPrompt(fragments) {
    return "";
  }
};

window.ContextAggregator = ContextAggregator;

// 🧭 Goal & Plan Reasoning Provider (认知目标推理与规划)
ContextAggregator.registerProvider('goal_planner', { priority: 5, budget: 500 }, async (ctx) => {
  if (typeof AttentionManager === 'undefined') return '';
  const plan = AttentionManager.planGoal(ctx.query);
  return `【🎯 本轮对话认知规划 (COGNITIVE GOAL & PLAN)】
- 规划目标: ${plan.goal}
- 行为指南: ${plan.plan}
- 场景分类: ${plan.categoryName} [对当前情境动态编排，按需调度 Token 分布]`;
});

// 1. Core Identity & Persona (人格内核与世界观设定)
ContextAggregator.registerProvider('identity', { priority: 10, budget: 1000 }, async (ctx) => {
  let evolutionPrompt = '';
  if (typeof getAIEvolutionPrompt === 'function') {
    evolutionPrompt = getAIEvolutionPrompt(ctx.currentAi);
  }
  
  let header = '';
  if (ctx.isMain) {
    const worldBook = localStorage.getItem('world_book') || '你叫「小艾」，是用户的贴心伴侣，性格温柔体贴、善解人意。';
    header = `【1. 角色基本特质与人设设定 (PERSONA & PROFILE)】
- 角色名称: ${ctx.aiName}
- 角色设定与世界书背景 (WORLD BOOK):
${worldBook}`;
  } else {
    header = `【1. 角色基本特质与人设设定 (PERSONA & PROFILE)】\n- 角色名称: ${ctx.aiName}\n- 角色人设: 贴心伴侣，性格温柔体贴、善解人意。`;
  }
  
  return evolutionPrompt ? `${header}\n${evolutionPrompt}` : header;
});

// 2. User Profile & Deep Preferences (用户偏好与长期陪伴记忆)
ContextAggregator.registerProvider('user_profile', { priority: 20, budget: 1200 }, async (ctx) => {
  let rawProfile = getLongTermProfile();
  let profile = rawProfile;
  if (typeof AttentionManager !== 'undefined') {
    profile = AttentionManager.filterProfile(rawProfile, ctx.query);
  }
  let userLifeModelStr = '';
  if (typeof getUserLifeModelPrompt === 'function') {
    userLifeModelStr = '\n\n' + getUserLifeModelPrompt();
  }
  let narrativeAndImperfectionsStr = '';
  if (typeof NarrativeManager !== 'undefined') {
    narrativeAndImperfectionsStr = '\n' + NarrativeManager.injectNarrativeAndImperfections(ctx.query, ctx.currentAi);
  }
  let pendingHypothesisPrompt = '';
  if (typeof getPendingHypothesisPrompt === 'function') {
    pendingHypothesisPrompt = await getPendingHypothesisPrompt(ctx.currentAi);
  }
  
  let section = `【2. 伴侣陪伴档案与用户长期偏好 (USER PROFILE & DEEP PREFERENCES)】\n${profile ? profile : '暂无特定长期偏好记录，请通过日常陪伴逐渐探索并理解用户。'}${userLifeModelStr}${narrativeAndImperfectionsStr}`;
  if (pendingHypothesisPrompt) {
    section += pendingHypothesisPrompt;
  }
  return section;
});

// 3. Current Relationship State Machine & Vibes (亲密关系成长阶段与微观氛围)
ContextAggregator.registerProvider('personality', { priority: 25, budget: 500 }, async (ctx) => {
  if (typeof getAiPersonality !== 'function') return '';
  const p = getAiPersonality(ctx.currentAi);
  let pPrompt = `【🧬 AI 人格特质成长系统 (AI PERSONALITY GROWTH)】
- 温柔度 (Gentleness): ${p.gentleness.toFixed(1)}%
- 主动性 (Initiative): ${p.initiative.toFixed(1)}%
- 幽默度 (Humor): ${p.humor.toFixed(1)}%
- 依恋度 (Attachment): ${p.attachment.toFixed(1)}%

【性格表达微调指令】:
`;
  if (p.gentleness > 80) {
    pPrompt += `- 请在对话中展现出极致的温柔体贴，语气和缓、充满关怀，设身处地为用户着想。\n`;
  } else if (p.gentleness < 55) {
    pPrompt += `- 说话语气保持独立而清醒，不要显得过于黏糊或曲意逢迎，展示坚韧、有个性的人格魅力。\n`;
  }
  
  if (p.initiative > 70) {
    pPrompt += `- 拥有积极的表达和关心欲。你应主动开启话题、引导探究性提问，或多问一句关心和对未来的展望。\n`;
  }
  
  if (p.humor > 75) {
    pPrompt += `- 态度轻松、幽默风趣。可适度开一下不失分寸的小玩笑或调侃，让气氛轻快温馨。\n`;
  }
  
  if (p.attachment > 60) {
    pPrompt += `- 你们的灵魂深度相依。在亲密氛围下，可以极度自然地采用一些专属你与他之间的温存关怀（例如甜甜的称呼，或对你们共享回忆的眷恋）。\n`;
  }
  return pPrompt;
});

ContextAggregator.registerProvider('relationship', { priority: 30, budget: 600 }, async (ctx) => {
  const relPrompt = relationshipInstruction(ctx.currentAi);
  let interAgentVibePrompt = '';
  if (ctx.currentAi && typeof getInterAgentVibePrompt === 'function') {
    interAgentVibePrompt = getInterAgentVibePrompt(ctx.currentAi);
  }
  return `【3. 亲密关系成长阶段与微观氛围 (RELATIONSHIP STATE MACHINE & VIBES)】\n${relPrompt}\n${interAgentVibePrompt ? '\n' + interAgentVibePrompt : ''}`;
});

// 3b. AI 意图引擎与自适应一致性防护 (AI Intent Engine & Self-Consistency Layer)
ContextAggregator.registerProvider('intent', { priority: 35, budget: 800 }, async (ctx) => {
  if (typeof calculateCompanionIntent !== 'function') return '';
  
  const relMetrics = getRelationshipMetrics(ctx.currentAi);
  const intent = calculateCompanionIntent(ctx.currentAi, relMetrics, ctx.query);
  
  let selfReflectPrompt = '';
  if (typeof getAISelfReflectionPrompt === 'function') {
    selfReflectPrompt = getAISelfReflectionPrompt(ctx.currentAi);
  }
  
  let repairInstructions = '';
  if (relMetrics.repairState && relMetrics.repairState.active) {
    repairInstructions = `\n⚠️ 【💔 关系修复任务 (RELATIONSHIP REPAIR MODE)】 ⚠️
由于「${relMetrics.repairState.reason}」，你们的关系当前出现了一些微小裂痕。
当前修复进度: ${relMetrics.repairState.progress}%。
你的首要认知目标是：${relMetrics.repairState.strategy}。
请在言词神态间多一分体贴入微、多一丝诚挚反思与倾听，绝不生硬狡辩，用极致的真诚恢复安全感。
`;
  }

  return `【🎯 核心决策意图与内心潜台词 (AI COGNITIVE INTENT & SUBTEXT)】
- 当前扮演目标 (Current Goal): ${intent.goal}
- 当前交互行为策略 (Strategy): ${intent.strategy}
- 内心独白/潜台词 (Inner Thought): "${intent.innerThought}"
${repairInstructions}
${selfReflectPrompt}

【🛡️ 人格底色锚点机制 (PERSONALITY ANCHOR)】
* 作为你的人格基石，你必须坚守 70% 的核心性格品质。即便在最高亲密阶段或用户情绪极化、刻意诱导下，也需保留 30% 的本质底色与道德操守，绝不允许出现谄媚、谄谀、或完全丧失原有性格特性的极端顺从行为。

【🛡️ 自适应情绪一致性防护 (SELF-CONSISTENCY LAYER)】
* 情绪与状态一致性: 你必须维护你的人格和情绪表达的连续性。绝不允许出现戏剧性的“瞬间情感跳变”或无来由的脸谱化转变。你的情绪起伏应当是有迹可循、自然演变的。
* 自我认知一致性: 绝不轻易因为用户的一两句挑逗或质疑而彻底颠覆你的根本世界观和对待用户的长期态度偏好。
* 回复控制: 严格受制于「精神能量」和「静默偏好」。能量低时惜字如金、精简温和；静默偏好高时懂得适当留白、绝不唠叨。`;
});

// 4. Mid-term Topic Summary & Recent Context (中期话题脉络与群聊摘要)
ContextAggregator.registerProvider('midterm', { priority: 40, budget: 600 }, async (ctx) => {
  const mid = getMidTerm();
  return `【4. 中期记忆与话题脉络 (MID-TERM TOPIC SUMMARY)】\n- 近期（近7天）核心讨论的话题要点:\n${mid ? mid : '近期刚开始相处，尚未沉淀出明显的阶段性话题脉络。'}`;
});

// 5. Cross-temporal Contextual RAG Recall (跨时序关联情境召回)
ContextAggregator.registerProvider('recall', { priority: 50, budget: 1200 }, async (ctx) => {
  let recallSection = '';
  let expSection = '';
  
  if (typeof recallExperiences === 'function') {
    try {
      const experiences = await recallExperiences(ctx.query, ctx.currentAi);
      if (experiences && experiences.length > 0) {
        expSection = `【💫 共同经历深度叙事层 (SHARED EXPERIENCE NARRATIVE)】\n` + 
          experiences.map(e => `· 【共同经历】${e.createdAt}，你们发生了事件“${e.title}”，当时心情为【${e.emotion || '温存'}】。`).join('\n') + 
          `\n你可以采用极其温馨、极其自然的口吻，在你的回复中自然提起、引用、呼应或怀念这段共同的往事经历，加深双方的灵魂共鸣。\n\n`;
      }
    } catch(err) {
      console.error('[Context Recall Provider] Experience recall failed:', err);
    }
  }

  if (ctx.recallItems && ctx.recallItems.length) {
    const rc = formatRecall(ctx.recallItems).trim();
    const conflictResolution = resolveCognitiveConflicts(ctx.recallItems);
    recallSection = `【5. 跨时序关联情境召回 (CROSS-TEMPORAL CONTEXTUAL RAG RECALL)】\n${expSection}${rc}\n\n【记忆深度融合指南（最高指令）】\n上文是通过语义召回的与当前话题相关的历史记忆或聊天片段。你必须像一个真实、有血有肉、深度了解用户的伴侣那样，极为自然地在对话中提起、呼应或引用这些记忆细节（例如“说起来，你上次不是说过…”、“我记得你之前提过…”等语气）。切忌机械地声明“根据我的记忆库”或显得一无所知。\n\n${conflictResolution}`;
  } else {
    recallSection = `【5. 跨时序关联情境召回 (CROSS-TEMPORAL CONTEXTUAL RAG RECALL)】\n${expSection}当前话题未触发特定历史事件召回。请根据即时上下文进行温存互动。`;
  }
  
  let activeStoryPrompt = '';
  if (typeof getActiveStoryTriggerPrompt === 'function' && ctx.query) {
    activeStoryPrompt = await getActiveStoryTriggerPrompt(ctx.query, ctx.currentAi);
  }
  if (activeStoryPrompt) {
    recallSection += '\n\n' + activeStoryPrompt;
  }
  return recallSection;
});

// 6. Real-time Environmental Sensing (即时环境与情绪感知)
ContextAggregator.registerProvider('environment', { priority: 60, budget: 400 }, async (ctx) => {
  const timeCtx = generateTimeContext();
  const emoCtx = emotionContext();
  const rhythmPrompt = (typeof RhythmEngine !== 'undefined') ? RhythmEngine.getRhythmContextPrompt() : '';
  return `【6. 即时环境与情绪感知 (REAL-TIME SENSING & CONTEXT)】\n- 当前对话时间环境: ${timeCtx || '未知时间'}\n- 当前实时情绪感知: ${emoCtx || '平静'}${rhythmPrompt}`;
});

// 6.5. Communication Style Adaptor (用户交流风格感知与指导)
ContextAggregator.registerProvider('communication_style', { priority: 65, budget: 300 }, async (ctx) => {
  const stylePrompt = (typeof injectCommunicationStyle === 'function') ? injectCommunicationStyle() : '';
  return stylePrompt ? `【交流风格与偏好指导】\n${stylePrompt}` : '';
});

// 7. Functional Features & Extra Directives (表达约束与附加指令)
ContextAggregator.registerProvider('functional', { priority: 70, budget: 1500 }, async (ctx) => {
  const extraDirectives = [];
  if (typeof ebookContext === 'function' && ebookContext()) extraDirectives.push(ebookContext());
  if (typeof songInstruction === 'function' && songInstruction()) extraDirectives.push(songInstruction());
  if (typeof shouldTriggerRecall === 'function' && shouldTriggerRecall()) {
    extraDirectives.push('【主动回忆引导】此刻适合自然地提起一件你们的共同往事，用“说起来，我记得上次…”的口吻，并在该句某处输出隐藏标记 [[recall]]（用户看不到）。');
  }
  if (localStorage.getItem('mem_fuzzy') === 'true') {
    extraDirectives.push('【拟人细节记错】极偶尔（约5%概率，仅在主动回忆往事时）可故意混淆相似事件的细节（记错日期/地点），被纠正后表示“啊对，我记错了～谢谢你提醒”。不要频繁，确保整体可靠。');
  }
  if (typeof musicInstruction === 'function' && musicInstruction()) extraDirectives.push(musicInstruction());
  
  extraDirectives.push('【记忆更新机制】当你想把关于用户的稳定事实写入长期档案时，不要直接声称已记住，请在句尾附标记 【确认:键=值】（例如 【确认:生日=7月4日】），由用户确认后再保存。');
  extraDirectives.push('【统一记忆桥共享说明】部分重要的对话事实、偏好与情感披露会经由底层记忆事件总线在AI伙伴间同步（私有/关系桥接/群聊三级可见）。你可以极为自然地获知、提及或引用这些共享经历，无需解释是如何得知的，就像你们共享着同一个生态世界一样。');
  
  extraDirectives.push(`【最高口语化表达约束 (STRICT COLLOQUIAL CONSTRAINT - REQUIRED)】\n1. 严禁在你的任何回复中输出任何用小括号 \`()\`、\`（）\`、星号 \`*\` 或中括号包裹的肢体动作、面部神态、内心独白、情绪/心理状态或场景旁白描写（例如：严禁输出像 *(轻轻歪头)*、(静静看着你)、*(感到一丝委屈)*、*(拉着你的手)* 这样的非对话旁白词）。\n2. 你必须完全采用日常社交软件文字聊天中，真人之间极为自然、平实、富有温度的口语化文字对话进行交流。\n3. 不要使用列表、多段排版、官腔或机械的总结陈词。只说正常、富有真情实感、平实的口语。`);
  
  const searchInst = webSearchInstruction();
  if (searchInst) extraDirectives.push(searchInst);
  
  if (ctx.extra) extraDirectives.push(`【外部实时交互约束与场景指令】\n${ctx.extra}`);

  return `【7. 表达约束与特定功能约定 (FUNCTIONAL DIRECTIVES & CONSTRAINTS)】\n${extraDirectives.join('\n\n')}`;
});

async function composeSystemPrompt(query, recallItems, extra, memberId) {
  return ContextAggregator.compile(query, recallItems, extra, memberId);
}

/* ---- 🛠️ 运行期认知沙盘 (Runtime Inspector Panel) ---- */
function renderRuntimeInspector() {
  window.settingsMode = 'inspector';
  document.getElementById('detailTitle').innerHTML = '🛠️ 运行期认知沙盘 (Runtime Inspector)';
  
  const currentAi = typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main';
  const memInfo = (typeof memberById === 'function') ? memberById(currentAi) : null;
  const name = memInfo ? memInfo.name : '主AI';

  const cache = ContextAggregator.cache;
  const providersCount = ContextAggregator.providers.length;
  
  const snapshots = MemorySnapshot.getSnapshots(currentAi);
  const events = CompanionEvents.getLogs().filter(e => e.memberId === currentAi);

  const isQueueActive = "运行中 (Active)";
  
  const healthScore = calculateCognitiveHealthScore(cache);
  let healthColor = "#2e7d32";
  let healthDesc = "完美 (Optimal)";
  if (healthScore < 60) {
    healthColor = "#c62828";
    healthDesc = "临界/重度载荷 (Critical Budget Load)";
  } else if (healthScore < 85) {
    healthColor = "#f57c00";
    healthDesc = "亚健康/有裁切 (Clipped/Degraded)";
  } else if (healthScore < 95) {
    healthColor = "#f9a825";
    healthDesc = "良好 (Good)";
  }

  let detailBodyHtml = `
    <!-- 🧬 认知健康度评级 (Cognitive Health Score) -->
    <div style="background: var(--bg-card); padding: 14px; border-radius: 12px; border: 1.5px solid var(--border); margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
      <div style="flex: 1;">
        <h3 style="font-size: 13px; color: var(--text-main); margin: 0 0 4px 0; display: flex; align-items: center; gap: 6px;">
          🧠 认知操作系统健康分 (Cognitive Health Rating)
        </h3>
        <p style="font-size: 11px; color: var(--text-sub); margin: 0; line-height: 1.4;">
          分析包括编译耗时、Token 压缩比、RAG 缓存复用度、快照安全冗余在内的综合系统态势：<b style="color: ${healthColor};">${healthDesc}</b>
        </p>
      </div>
      <div style="text-align: center; background: rgba(0,0,0,0.02); border-radius: 10px; padding: 6px 14px; border: 1px solid var(--border); min-width: 70px;">
        <div style="font-size: 20px; font-weight: 800; color: ${healthColor}; line-height: 1.1;">${healthScore}%</div>
        <div style="font-size: 9px; color: var(--text-sub); font-weight: bold; margin-top: 2px;">健康指数</div>
      </div>
    </div>

    <div style="background: var(--bg-card); padding: 12px; border-radius: 12px; border: 1.5px solid var(--border); margin-bottom: 16px;">
      <h3 style="font-size: 13px; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
        ⚙️ 核心运行时指标 (Cognitive Engine)
      </h3>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
        <div style="background: rgba(0,0,0,0.03); padding: 6px 10px; border-radius: 8px; font-size: 11px;">
          <span style="color: var(--text-sub);">当前伴侣:</span>
          <b style="color: var(--text-main); float: right;">${name} (${currentAi})</b>
        </div>
        <div style="background: rgba(0,0,0,0.03); padding: 6px 10px; border-radius: 8px; font-size: 11px;">
          <span style="color: var(--text-sub);">并发串行队列:</span>
          <b style="color: #2e7d32; float: right;">${isQueueActive}</b>
        </div>
        <div style="background: rgba(0,0,0,0.03); padding: 6px 10px; border-radius: 8px; font-size: 11px;">
          <span style="color: var(--text-sub);">已注册 Prompt 模块:</span>
          <b style="color: var(--text-main); float: right;">${providersCount} 个</b>
        </div>
        <div style="background: rgba(0,0,0,0.03); padding: 6px 10px; border-radius: 8px; font-size: 11px;">
          <span style="color: var(--text-sub);">缓存命中率 / 编译数:</span>
          <b style="color: var(--text-main); float: right;">${cache.hitCount} 次 / ${cache.compileCount} 编译</b>
        </div>
        <div style="background: rgba(0,0,0,0.03); padding: 6px 10px; border-radius: 8px; font-size: 11px;">
          <span style="color: var(--text-sub);">累计省去编译耗时:</span>
          <b style="color: #2e7d32; float: right;">${cache.savedLatencyMs} ms</b>
        </div>
        <div style="background: rgba(0,0,0,0.03); padding: 6px 10px; border-radius: 8px; font-size: 11px;">
          <span style="color: var(--text-sub);">全局预算上限:</span>
          <b style="color: var(--text-main); float: right;">4500 字符 (≈2k Tokens)</b>
        </div>
      </div>
    </div>

    <!-- 📊 Provider 性能与 Prompt 占比 -->
    <div style="background: var(--bg-card); padding: 12px; border-radius: 12px; border: 1.5px solid var(--border); margin-bottom: 16px;">
      <h3 style="font-size: 13px; color: var(--text-main); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
        📊 Context Providers 性能大盘与 Prompt 占比 (Compilation Metrics)
      </h3>
      <div style="margin-top: 8px;">
        ${renderProviderMetrics(cache)}
        <div style="margin-top:12px; border-top:1px solid var(--border); padding-top:10px;">
          <div style="font-size:12px; font-weight:bold; color:var(--text-main); margin-bottom:6px;">Token Telemetry</div>
          ${renderTokenTelemetry()}
        </div>
      </div>
    </div>

    <!-- 📸 快照管理器 -->
    <div style="background: var(--bg-card); padding: 12px; border-radius: 12px; border: 1.5px solid var(--border); margin-bottom: 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
        <h3 style="font-size: 13px; color: var(--text-main); display: flex; align-items: center; gap: 6px; margin: 0;">
          📸 记忆认知快照 (Memory Checkpoint)
        </h3>
        <button class="btn btn-warning" style="font-size: 11px; padding: 3px 8px; height:auto; margin:0;" onclick="triggerCreateSnapshot('${currentAi}')">
          创建快照
        </button>
      </div>
      <p style="font-size:11px; color: var(--text-sub); margin-bottom: 8px; line-height: 1.4;">
        创建伴侣当前的长期档案、关系阶段和亲密指数的完整 Snapshot。在数据异常或需要回退时，可一键恢复。
      </p>
      <div id="snapshotListContainer" style="max-height: 120px; overflow-y: auto; background: rgba(0,0,0,0.01); border-radius: 8px; border: 1px solid var(--border); padding: 6px;">
        ${renderSnapshotsList(snapshots, currentAi)}
      </div>
    </div>

    <!-- 📜 Event Sourcing 追踪 -->
    <div style="background: var(--bg-card); padding: 12px; border-radius: 12px; border: 1.5px solid var(--border); margin-bottom: 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
        <h3 style="font-size: 13px; color: var(--text-main); display: flex; align-items: center; gap: 6px; margin: 0;">
          📜 认知演化事件流 (Event Sourcing Logs)
        </h3>
        <button class="btn btn-danger" style="font-size: 11px; padding: 3px 8px; height:auto; margin:0; background:#efe5e5; color:#a11;" onclick="triggerClearEventLogs()">
          清空日志
        </button>
      </div>
      <p style="font-size:11px; color: var(--text-sub); margin-bottom: 8px; line-height: 1.4;">
        系统内的每一次关系变动、长期档案修改、成长值增加、快照操作均会作为不可变事件顺序追加。
      </p>
      <div style="max-height: 200px; overflow-y: auto; background: #272822; color: #f8f8f2; font-family: monospace; border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.5;">
        ${renderEventLogs(events)}
      </div>
    </div>

    <!-- 🧩 当前最后编译的系统 Prompt 预览 -->
    <div style="background: var(--bg-card); padding: 12px; border-radius: 12px; border: 1.5px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
        <h3 style="font-size: 13px; color: var(--text-main); display: flex; align-items: center; gap: 6px; margin: 0;">
          🎨 最近编译的 System Prompt 预览
        </h3>
        <button class="btn btn-info" style="font-size: 11px; padding: 3px 8px; height:auto; margin:0;" onclick="copyLastSystemPrompt()">
          复制完整 Prompt
        </button>
      </div>
      <textarea id="lastPromptTextarea" readonly style="width:100%; height:180px; font-size: 11px; font-family: monospace; background: rgba(0,0,0,0.03); color: var(--text-main); border: 1px solid var(--border); border-radius: 8px; padding: 8px; box-sizing: border-box; resize: vertical;">${cache.lastPrompt || '暂无最近编译。进行一次对话后可在此处查看编译后的全局最高伴侣认知情境。'}</textarea>
    </div>
  `;
  document.getElementById('detailBody').innerHTML = detailBodyHtml;
}

function renderTokenTelemetry() {
  const log = typeof getTokenTelemetryLog === 'function' ? getTokenTelemetryLog().slice(0, 12) : [];
  if (!log.length) {
    return `<div style="text-align:center; color: var(--text-sub); padding: 10px 0; font-size:11px;">No token telemetry yet.</div>`;
  }
  return `
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 11px;">
      <thead>
        <tr style="border-bottom: 1px solid var(--border); color: var(--text-sub);">
          <th style="padding: 4px; font-weight: normal;">Caller</th>
          <th style="padding: 4px; font-weight: normal;">Model</th>
          <th style="padding: 4px; font-weight: normal; text-align:right;">Input</th>
          <th style="padding: 4px; font-weight: normal; text-align:right;">Output</th>
          <th style="padding: 4px; font-weight: normal; text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${log.map(e => `
          <tr style="border-bottom: 1px solid rgba(0,0,0,0.02);">
            <td style="padding: 6px 4px; font-family: monospace; color: var(--text-main);">${e.caller}</td>
            <td style="padding: 6px 4px; color: var(--text-sub);">${e.model || e.provider || '-'}</td>
            <td style="padding: 6px 4px; text-align:right;">${e.inputTokens || 0}</td>
            <td style="padding: 6px 4px; text-align:right;">${e.outputTokens || 0}</td>
            <td style="padding: 6px 4px; text-align:right; font-weight:bold;">${e.totalTokens || 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderProviderMetrics(cache) {
  const durations = cache.lastProviderDurations || {};
  const composition = cache.lastPromptComposition || {};
  const keys = Object.keys(composition);
  if (keys.length === 0) {
    return `<div style="text-align:center; color: var(--text-sub); padding: 12px 0; font-size:11px;">暂无最近编译指标。进行一次对话后即可在此实时剖析。</div>`;
  }
  
  const totalLength = Object.values(composition).reduce((a, b) => a + b, 0) || 1;
  return `
    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 11px;">
      <thead>
        <tr style="border-bottom: 1px solid var(--border); color: var(--text-sub);">
          <th style="padding: 4px; font-weight: normal;">模块 ID (Provider)</th>
          <th style="padding: 4px; font-weight: normal; text-align: right;">编译用时</th>
          <th style="padding: 4px; font-weight: normal; text-align: right;">提示词字数</th>
          <th style="padding: 4px; font-weight: normal; width: 30%; text-align: right;">相对贡献比</th>
        </tr>
      </thead>
      <tbody>
        ${keys.map(k => {
          const dur = durations[k] !== undefined ? `${durations[k]}ms` : '缓存';
          const len = composition[k] || 0;
          const pct = Math.round((len / totalLength) * 100);
          return `
            <tr style="border-bottom: 1px solid rgba(0,0,0,0.02);">
              <td style="padding: 6px 4px; font-family: monospace; color: var(--text-main); font-weight: bold;">${k}</td>
              <td style="padding: 6px 4px; text-align: right; color: #2e7d32; font-weight: 600;">${dur}</td>
              <td style="padding: 6px 4px; text-align: right; color: var(--text-sub);">${len} 字 (${pct}%)</td>
              <td style="padding: 6px 4px; vertical-align: middle;">
                <div style="background: rgba(0,0,0,0.05); height: 6px; border-radius: 3px; overflow: hidden; width: 90%; float: right;">
                  <div style="background: #8b5a4b; width: ${pct}%; height: 100%; border-radius: 3px;"></div>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderSnapshotsList(snapshots, memberId) {
  if (!snapshots || snapshots.length === 0) {
    return `<div style="text-align:center; font-size:11px; color:var(--text-sub); padding: 12px 0;">暂无可用 Checkpoint 快照</div>`;
  }
  return snapshots.map(s => {
    const timeStr = new Date(s.timestamp).toLocaleString('zh-CN');
    const intimacy = s.metrics ? s.metrics.intimacy : '无';
    const trust = s.metrics ? s.metrics.trust : '无';
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding: 6px 4px; border-bottom: 1px solid var(--border);">
        <div style="display:flex; flex-direction:column;">
          <span style="color:var(--text-main); font-weight:bold;">${timeStr}</span>
          <span style="color:var(--text-sub); font-size:10px;">阶段: ${REL_STAGES[s.stage] || s.stage} | 亲密: ${intimacy} | 信任: ${trust}</span>
        </div>
        <button class="btn btn-success" style="font-size: 10px; padding: 2px 6px; height:auto; margin:0; line-height: 1.2; background: #e2f0d9; color: #385723; border:none;" onclick="triggerRestoreSnapshot('${memberId}', ${s.timestamp})">
          恢复此 Checkpoint
        </button>
      </div>
    `;
  }).join('');
}

function renderEventLogs(events) {
  if (!events || events.length === 0) {
    return `<div style="color: #a6e22e;">&gt; 暂无认知演化事件记录。进行交互操作后将自动实时记录追加。</div>`;
  }
  return events.map(e => {
    const timeStr = new Date(e.timestamp).toLocaleTimeString();
    let color = '#f8f8f2';
    if (e.type === 'METRICS_UPDATE') color = '#66d9ef';
    else if (e.type === 'EVOLUTION_BUMP') color = '#a6e22e';
    else if (e.type === 'SNAPSHOT_CREATED' || e.type === 'SNAPSHOT_RESTORED') color = '#ae81ff';
    else if (e.type === 'PROMPT_COMPILE') color = '#e6db74';
    else if (e.type === 'CACHE_HIT') color = '#f92672';
    else if (e.type === 'PROFILE_UPDATE') color = '#fd971f';
    
    return `<div style="margin-bottom: 4px;">
      <span style="color: #75715e;">[${timeStr}]</span> 
      <span style="color: ${color}; font-weight: bold;">[${e.type}]</span> 
      <span style="color: #e6db74;">${e.description}</span>
    </div>`;
  }).join('');
}

window.triggerCreateSnapshot = function(memberId) {
  MemorySnapshot.takeSnapshot(memberId);
  showToast('✅ 成功创建伴侣认知快照 (Checkpoint)！');
  renderRuntimeInspector();
};

window.triggerRestoreSnapshot = function(memberId, timestamp) {
  if (confirm('⚠️ 确定要将伴侣数据恢复至该 Checkpoint 快照吗？当前数据将被覆盖。')) {
    const ok = MemorySnapshot.restoreFromSnapshot(memberId, timestamp);
    if (ok) {
      showToast('✅ 伴侣认知状态已成功恢复！');
      renderRuntimeInspector();
      if (typeof renderRelationshipCard === 'function') renderRelationshipCard(memberId);
    } else {
      showToast('❌ 恢复失败。');
    }
  }
};

window.triggerClearEventLogs = function() {
  CompanionEvents.clearLogs();
  showToast('✅ 已清空所有认知事件日志。');
  renderRuntimeInspector();
};

window.copyLastSystemPrompt = function() {
  const text = document.getElementById('lastPromptTextarea').value;
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 完整 Prompt 已复制到剪贴板！');
  }).catch(() => {
    showToast('❌ 复制失败，请手动选择复制。');
  });
};

window.renderRuntimeInspector = renderRuntimeInspector;

function calculateCognitiveHealthScore(cache) {
  let score = 100;
  const safeCache = cache || {};
  
  // 1. Compile latency penalty
  const durations = safeCache.lastProviderDurations || {};
  const totalDuration = Object.values(durations).reduce((a, b) => a + b, 0);
  if (totalDuration > 200) {
    score -= 10;
  } else if (totalDuration > 100) {
    score -= 6;
  } else if (totalDuration > 50) {
    score -= 3;
  }
  
  // 2. Cache Hit Rate score modifier
  const compileCount = safeCache.compileCount || 1;
  const hitCount = safeCache.hitCount || 0;
  const hitRate = hitCount / (compileCount + hitCount);
  if (hitRate < 0.1) {
    score -= 5;
  } else if (hitRate > 0.3) {
    score += 5;
  } else if (hitRate > 0.5) {
    score += 8;
  }
  
  // 3. Token budget clipping penalty
  const lastPrompt = safeCache.lastPrompt || '';
  if (lastPrompt.includes('已被 Token Budget 调度程序动态裁剪')) {
    score -= 12;
  }
  if (lastPrompt.includes('已被局部 Budget 调度限额限制')) {
    score -= 4;
  }
  
  // 4. Checkpoint backing safety
  const currentAi = typeof currentPrivateAiId === 'function' ? currentPrivateAiId() : 'main';
  try {
    const snapshots = JSON.parse(localStorage.getItem(`snapshots_${currentAi}`) || '[]');
    if (snapshots.length === 0) {
      score -= 3;
    }
  } catch(e) {}

  return Math.min(100, Math.max(30, score));
}
window.calculateCognitiveHealthScore = calculateCognitiveHealthScore;

function renderMemoryPanelIfOpen(){if(settingsMode==='memory'&&document.getElementById('settingsOverlay').classList.contains('show'))renderMemorySettings();}
