/* ===== AI 主动消息 + 每日记忆回顾 ===== */
function proactiveEnabled(){return localStorage.getItem('proactive_enabled')==='true';}
function proactivePrompt(){return localStorage.getItem('proactive_prompt')||'你是用户的AI陪伴。现在请主动给用户发一条简短自然、有温度的消息（30字内），可结合当前时间问候、关心近况，或延续之前聊过的话题。不要使用列表或客套开场白，像朋友一样直接说。';}
function getProactiveInterval(){const v=parseFloat(localStorage.getItem('proactive_interval'));return isNaN(v)?0:v;}
function isAutoMode(){return getProactiveInterval()<=0;}
function inQuietHours(d){const h=(d||new Date()).getHours();return h>=22||h<8;}
function autoIdleThreshold(){const min=parseFloat(localStorage.getItem('proactive_auto_min')||'60');const max=parseFloat(localStorage.getItem('proactive_auto_max')||'120');const lo=Math.max(1,Math.min(min,max)),hi=Math.max(lo,max);return (lo+Math.random()*(hi-lo))*60*1000;}
let _autoThreshold=null;
function markActivity(){localStorage.setItem('proactive_activity',String(Date.now()));}
function scheduleProactive(){setInterval(()=>{checkProactive();dailyReviewCheck();if(typeof checkAutoDiary==='function')checkAutoDiary();},60000);}

async function checkProactive(){if(!proactiveEnabled()||callActive)return;if(inQuietHours())return;const now=Date.now();const lastSend=parseInt(localStorage.getItem('proactive_last')||'0');if(isAutoMode()){const lastAct=parseInt(localStorage.getItem('proactive_activity')||String(lastSend||now));if(_autoThreshold===null)_autoThreshold=autoIdleThreshold();if(now-lastSend<_autoThreshold)return;if(now-lastAct<_autoThreshold)return;_autoThreshold=null;localStorage.setItem('proactive_last',String(now));await triggerProactive();}else{const iv=getProactiveInterval()*3600*1000;if(now-lastSend<iv)return;localStorage.setItem('proactive_last',String(now));await triggerProactive();}}

async function triggerProactive(extraInstruction){try{const provider=getCurrentProvider();const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';if(!apiKey&&provider.auth!=='none')return;let recallItems=[];const lastUser=conversationHistory.filter(m=>m.role==='user').pop()?.content||'';if(ragEnabled()&&lastUser){try{recallItems=await recall(lastUser);}catch(e){}}const sp=await composeSystemPrompt(lastUser,recallItems,(extraInstruction||proactivePrompt()));const shortTerm=ctxSlice(conversationHistory).filter(m=>!m.image).map(m=>({role:m.role==='imported'?'user':m.role,content:m.content}));const messages=[{role:'system',content:sp},...shortTerm,{role:'user',content:'(系统：到达主动联系时机，请主动发起一句话)'}];let url=provider.endpoint.replace(/\/+$/,'');if(!url.includes('/chat/completions')&&!url.includes('messages'))url+='/chat/completions';const headers={'Content-Type':'application/json'};if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${apiKey}`;else if(provider.auth==='x-api-key')headers['x-api-key']=apiKey;else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=apiKey;const body={model:selectedModelName,messages,stream:false};const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok)return;const d=await r.json();const raw=d.choices?.[0]?.message?.content||d.content?.[0]?.text||'';if(!raw.trim())return;const reply=(typeof cleanAiText==='function')?cleanAiText(raw):raw;const uid=genUid();const ts=Date.now();conversationHistory.push({role:'assistant',content:reply,uid,proactive:true,ts});renderTextMessage('assistant',reply,uid,null,null,true,ts);saveHistory();memorize('assistant',reply,'');updateAiEmotion(reply);if(typeof processAiReplyMemory==='function')processAiReplyMemory(raw);markActivity();_autoThreshold=null;showToast('💌 AI 主动发来一条消息');if(autoSpeakEnabled()&&voiceEnabled())playTTS(reply,localStorage.getItem('tts_voice_ai'));}catch(e){}}

/* 优化7：一年前的今天（每天 8:00-10:00 触发一次，需已开启主动消息） */
async function dailyReviewCheck(){
  if(!proactiveEnabled()||callActive)return;
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

function renderProactiveSettings(){settingsMode='proactive';document.getElementById('detailTitle').innerHTML='💌 主动消息';const ivRaw=localStorage.getItem('proactive_interval');const iv=(ivRaw==null||ivRaw==='')?'':ivRaw;const auto=(iv===''||parseFloat(iv)<=0);const amin=localStorage.getItem('proactive_auto_min')||'60',amax=localStorage.getItem('proactive_auto_max')||'120';const last=parseInt(localStorage.getItem('proactive_last')||'0');const lastStr=last?new Date(last).toLocaleString('zh-CN'):'尚未触发';document.getElementById('detailBody').innerHTML=`
    <div class="switch-row"><div class="switch-info"><div class="switch-label">💌 启用 AI 主动消息</div><div class="switch-desc">默认关闭。开启后 AI 会在你空闲时主动找你，并启用「一年前的今天」每日回顾</div></div><label class="switch"><input type="checkbox" ${proactiveEnabled()?'checked':''} onchange="onProactiveToggle(this.checked)"><span class="switch-slider"></span></label></div>
    <div class="form-group" style="margin-top:12px;"><label class="form-label">触发间隔（小时，留空 = 智能自主）</label><input type="number" class="form-input" id="proInterval" min="0" step="0.1" placeholder="留空 / 0 = AI 自行决定时机" value="${iv}"><div class="form-hint">填 1=每小时，24=每天；留空或 0 进入「智能自主」：默认每 1~2 小时在你空闲时随机冒泡，22:00–08:00 不打扰。</div></div>
    <div id="autoBox" style="${auto?'':'display:none'}"><div class="form-group"><label class="form-label">自主空闲触发范围（分钟）</label><div class="input-with-btn"><input type="number" class="form-input" id="proAutoMin" min="1" step="1" value="${amin}"><input type="number" class="form-input" id="proAutoMax" min="1" step="1" value="${amax}"></div></div></div>
    <div class="form-group"><label class="form-label">主动消息提示词</label><textarea class="form-input" id="proPrompt" rows="4">${proactivePrompt()}</textarea></div>
    <div class="stat-box"><span>上次主动消息</span><b>${lastStr}</b></div>
    <div class="action-buttons"><button class="btn btn-info" onclick="manualProactive()">▶️ 立即生成一条</button></div>`;const ii=document.getElementById('proInterval');if(ii)ii.oninput=()=>{const v=parseFloat(ii.value);document.getElementById('autoBox').style.display=(ii.value===''||isNaN(v)||v<=0)?'':'none';};}
function onProactiveToggle(on){setBool('proactive_enabled',on);if(on){markActivity();localStorage.setItem('proactive_last',String(Date.now()-1));_autoThreshold=null;showToast(isAutoMode()?'✅ 已开启自主模式':'✅ 已开启');}}
async function manualProactive(){showToast('🔄 生成中...');localStorage.setItem('proactive_last',String(Date.now()));await triggerProactive();}