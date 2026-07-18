/* ===== 语音通话：AudioWorklet VAD + 打断 + 整句 ASR ===== */
let callActive=false,callMuted=false,callStream=null,callMime='';
let callAudioCtx=null,micSource=null,vadNode=null,analyserFallback=null,fallbackRAF=null;
let callRecorder=null,callChunks=[],recStopReason='';
let ttsSource=null,callStartTime=0,callTimerInt=null;
let callState='idle'; // idle | listening | processing | speaking

/* VAD 调参 */
const VAD_CFG={
  minThresh:0.020, noiseFactor:2.2, minSpeechMs:180,
  silenceHangMs:850, maxUtterMs:15000,
  bargeMin:0.045, bargeFactor:2.8, bargeHoldMs:320
};
/* VAD 运行时状态 */
let vad={smooth:0,noiseFloor:0.012,spoke:false,voiceMs:0,silentMs:0,utterMs:0,bargeMs:0,last:0};
function resetVad(){vad={smooth:0,noiseFloor:vad.noiseFloor||0.012,spoke:false,voiceMs:0,silentMs:0,utterMs:0,bargeMs:0,last:performance.now()};}

function fmtDur(ms){const s=Math.floor(ms/1000);const m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function startCallTimer(){callStartTime=Date.now();document.getElementById('callTimer').textContent='00:00';callTimerInt=setInterval(()=>{document.getElementById('callTimer').textContent=fmtDur(Date.now()-callStartTime);},1000);}
function stopCallTimer(){if(callTimerInt){clearInterval(callTimerInt);callTimerInt=null;}}
function showCallEnd(dur){const t=document.getElementById('callEndToast');document.getElementById('callEndBox').innerHTML='📵 通话结束'+(dur?'<br>通话时长 '+dur:'');t.classList.remove('show');void t.offsetWidth;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000);}
function setCallStatus(s,sub){
  document.getElementById('callStatus').textContent=s;
  const subEl=document.getElementById('callSub');
  subEl.textContent=sub||'';
  subEl.scrollTop=subEl.scrollHeight;
}
function bargeInEnabled(){return localStorage.getItem('call_bargein')!=='false';}

function startCall(){
  document.getElementById('actionMenu').classList.remove('show');
  if(!voiceEnabled()){showToast('🔇 语音已关闭，请先开启');return;}
  if(!voiceKey()){alert('请先在「语音设置」填入 API Key');openSettings();settingsMode='voice';renderProviderList();renderVoiceSettings();return;}
  if(!navigator.mediaDevices?.getUserMedia){alert('当前环境不支持通话（需 HTTPS/PWA）');return;}
  const ov=document.getElementById('callOverlay');
  ov.classList.add('show');document.getElementById('callGate').classList.add('show');document.getElementById('callTimer').textContent='';
  const av=document.getElementById('callAvatar');

  // 支持在说话状态下点击头像手动打断
  av.onclick=()=>{
    if(callActive && callState==='speaking'){
      triggerBargeIn();
    }
  };

  const currentAi=typeof currentPrivateAiId==='function'?currentPrivateAiId():'main';
  if(!window.groupCallOverride && currentAi!=='main'){
    const members=(typeof getGroupMembers==='function')?getGroupMembers():[];
    const mem=members.find(m=>m.id===currentAi);
    if(mem){
      window.groupCallOverride={name:mem.name,persona:mem.persona,voice:mem.voice,model:mem.model,providerId:mem.providerId,isMain:false,avatar:mem.avatar};
    }
  }

  const gcov=window.groupCallOverride;
  if(gcov && gcov.isGroup){
    const members=(typeof getGroupMembers==='function')?getGroupMembers():[];
    av.style.display='flex';av.style.gap='14px';av.style.flexWrap='wrap';av.style.justifyContent='center';av.style.width='auto';av.style.height='auto';av.style.boxShadow='none';av.style.background='none';av.style.borderRadius='0';av.style.animation='none';
    av.innerHTML=members.map(m=>{
      const isBase64=(m.avatar||'').startsWith('data:');
      const avHtml=isBase64?`<img src="${m.avatar}">`:`<span style="font-size:26px;line-height:1;">${m.avatar||'🤖'}</span>`;
      return `<div class="group-call-member" id="gcm-${m.id}" style="width:64px;height:64px;border-radius:50%;overflow:hidden;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.25);position:relative;transition:all 0.25s ease;">${avHtml}<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#fff;font-size:8px;padding:1px 0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.name}</div></div>`;
    }).join('');
    setCallStatus('准备群聊通话','');
  } else {
    av.style.display='flex';av.style.gap='';av.style.flexWrap='';av.style.justifyContent='';av.style.width='120px';av.style.height='120px';av.style.boxShadow='var(--shadow)';av.style.background='var(--bg-white)';av.style.borderRadius='50%';av.style.animation='';
    const aiAv=(gcov&&gcov.avatar&&gcov.avatar.startsWith('data:'))?gcov.avatar:(localStorage.getItem('ai_avatar')||emotionImgUrl(localStorage.getItem('ai_emotion_dominant')||'calm'));
    av.innerHTML=`<img src="${aiAv}" onerror="this.outerHTML='🤖'">`;
    setCallStatus('准备通话','');
  }
}

/* VAD Worklet 源码（内联 Blob 加载，免额外文件） */
function vadWorkletUrl(){
  const src=`
  class VadProcessor extends AudioWorkletProcessor{
    constructor(){super();this._sum=0;this._n=0;this._target=Math.max(1,Math.round(sampleRate*0.025));}
    process(inputs){
      const ch=inputs[0]&&inputs[0][0];
      if(ch){for(let i=0;i<ch.length;i++){const v=ch[i];this._sum+=v*v;this._n++;}
        if(this._n>=this._target){this.port.postMessage(Math.sqrt(this._sum/this._n));this._sum=0;this._n=0;}}
      return true;
    }
  }
  registerProcessor('vad-processor',VadProcessor);`;
  return URL.createObjectURL(new Blob([src],{type:'application/javascript'}));
}

async function acquireMicAndStartVAD() {
  releaseMicAndStopVAD();
  if (callMuted) return;
  
  callStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
  });
  
  callAudioCtx = audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
  if (callAudioCtx.state === 'suspended') await callAudioCtx.resume();
  
  try { micSource = callAudioCtx.createMediaStreamSource(callStream); } catch(e) {}
  
  let workletOk = false;
  if (callAudioCtx.audioWorklet && micSource) {
    try {
      await callAudioCtx.audioWorklet.addModule(vadWorkletUrl());
      vadNode = new AudioWorkletNode(callAudioCtx, 'vad-processor');
      micSource.connect(vadNode);
      vadNode.port.onmessage = e => handleVad(e.data);
      workletOk = true;
    } catch(e) {
      workletOk = false;
    }
  }
  if (!workletOk && micSource) { // 回退：AnalyserNode + rAF
    analyserFallback = callAudioCtx.createAnalyser();
    analyserFallback.fftSize = 512;
    micSource.connect(analyserFallback);
    const data = new Uint8Array(analyserFallback.frequencyBinCount);
    const loop = () => {
      if (!callActive || callState !== 'listening') return;
      analyserFallback.getByteTimeDomainData(data);
      let s = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        s += v * v;
      }
      handleVad(Math.sqrt(s / data.length));
      fallbackRAF = requestAnimationFrame(loop);
    };
    fallbackRAF = requestAnimationFrame(loop);
  }
}

function releaseMicAndStopVAD() {
  if (vadNode) {
    try { vadNode.port.onmessage = null; vadNode.disconnect(); } catch(e) {}
    vadNode = null;
  }
  if (analyserFallback) {
    try { analyserFallback.disconnect(); } catch(e) {}
    analyserFallback = null;
  }
  if (fallbackRAF) {
    cancelAnimationFrame(fallbackRAF);
    fallbackRAF = null;
  }
  if (micSource) {
    try { micSource.disconnect(); } catch(e) {}
    micSource = null;
  }
  if (callStream) {
    callStream.getTracks().forEach(t => t.stop());
    callStream = null;
  }
}

async function confirmStartCall(){
  unlockAudioOnGesture();
  document.getElementById('callGate').classList.remove('show');
  callActive=true;callMuted=false;callMime=pickMimeType();
  requestWakeLock();startKeepAlive();startCallTimer();
  await enterListening();
}

function toggleCallMute(){
  callMuted=!callMuted;
  document.getElementById('callMute').classList.toggle('active',callMuted);
  if(callStream) {
    callStream.getAudioTracks().forEach(t=>t.enabled=!callMuted);
  }
  if(callMuted){
    setCallStatus('已静音','');
    if(callRecorder&&callRecorder.state==='recording'){
      recStopReason='mute';
      try{callRecorder.stop();}catch(e){}
    }
  }else if(callActive){
    enterListening();
  }
}

function endCall(){
  const wasActive=callActive&&callStartTime>0;const dur=wasActive?fmtDur(Date.now()-callStartTime):'';
  callActive=false;callState='idle';stopCallTimer();
  document.getElementById('callOverlay').classList.remove('show');document.getElementById('callGate').classList.remove('show');document.getElementById('callAvatar').classList.remove('speaking');
  if(callRecorder&&callRecorder.state!=='inactive'){recStopReason='end';try{callRecorder.stop();}catch(e){}}
  if(ttsSource){try{ttsSource.stop();}catch(e){}ttsSource=null;}
  releaseMicAndStopVAD();
  if(unlockedAudio)unlockedAudio.pause();
  stopKeepAlive();releaseWakeLock();
  if(wasActive)showCallEnd(dur);callStartTime=0;
  window.groupCallOverride=null;
}

/* 进入聆听：立即开录（含说话前预录），VAD 决定何时截断 */
async function enterListening(){
  if(!callActive||callMuted)return;
  callState='listening';setCallStatus('正在聆听...','');
  resetVad();
  try {
    await acquireMicAndStartVAD();
    startRecorder();
  } catch(e) {
    setCallStatus('麦克风启动失败', e.message);
    if(callActive) {
      setTimeout(() => { if(callActive) enterListening(); }, 2000);
    }
  }
}

function startRecorder(){
  try{
    callChunks=[];recStopReason='';
    callRecorder=new MediaRecorder(callStream,callMime?{mimeType:callMime}:undefined);
    callRecorder.ondataavailable=e=>{if(e.data.size>0)callChunks.push(e.data);};
    callRecorder.onstop=onRecorderStop;
    callRecorder.start();
  }catch(e){setCallStatus('录音启动失败',e.message);}
}

function finalizeUtterance(){
  if(callState!=='listening')return;
  callState='processing';
  if(callRecorder&&callRecorder.state==='recording'){recStopReason='utterance';try{callRecorder.stop();}catch(e){}}
}

async function onRecorderStop(){
  if(!callActive)return;
  if(recStopReason==='mute'||recStopReason==='end')return;
  const blob=new Blob(callChunks,{type:callRecorder.mimeType||callMime||'audio/mp4'});
  
  // 🎙️ 录制已结束，立即停止并释放麦克风，确保播放 AI 语音时 iOS 扬声器通道不被占用
  releaseMicAndStopVAD();

  if(blob.size<2200){enterListening();return;}
  setCallStatus('识别中...','');
  try{
    const text=await sttTranscribe(blob);
    if(!text.trim()){enterListening();return;}
    setCallStatus('你说：',text);
    const emo=localStorage.getItem('emotion_enabled')!=='false'?detectEmotion(text):'calm';
    if(localStorage.getItem('emotion_enabled')!=='false'){updateEmotionState(emo);renderEmotionPills();}

    const gov=window.groupCallOverride||null;
    if(gov && gov.isGroup){
      const userUid=genUid();const userTs=Date.now();
      if(typeof pushGroup==='function')pushGroup({uid:userUid,role:'user',content:text,ts:userTs});
      if(typeof memorize==='function')memorize('user','[群聊语音] '+text,'calm');
      
      const members=(typeof getGroupMembers==='function')?getGroupMembers():[];
      let targets=members;
      if(localStorage.getItem('group_reply_mode')==='random'){
        targets=[members[Math.floor(Math.random()*members.length)]];
      }
      
      for(const mem of targets){
        if(!callActive)return;
        setCallStatus(`${mem.name} 正在思考...`,'');
        document.querySelectorAll('.group-call-member').forEach(el=>el.classList.remove('active-speaker'));
        document.getElementById(`gcm-${mem.id}`)?.classList.add('active-speaker');
        
        let reply='（无回应）';
        try{
          reply=await callRequestAiForGroupCall(mem, text);
        }catch(err){
          reply=`（${mem.name}看图有些费劲：${err.message}）`;
        }
        
        if(!callActive)return;
        setCallStatus(`${mem.name} 回复：`,reply);
        callState='speaking';
        vad.bargeMs=0;vad.last=performance.now();
        await playTTSCall(reply, mem.voice || localStorage.getItem('tts_voice_ai'));
      }
      document.querySelectorAll('.group-call-member').forEach(el=>el.classList.remove('active-speaker'));
      if(callAudioCtx&&callAudioCtx.state==='suspended')await callAudioCtx.resume();
      if(callActive)enterListening();
      return;
    }

    const uid=genUid();const ts=Date.now();
    conversationHistory.push({role:'user',content:text,uid,emotion:emo,ts});
    renderTextMessage('user',text,uid,null,null,false,ts);saveHistory();
    memorize('user',text,emo);bumpMsgCounter();markActivity();
    if(typeof maybeUpdateLongTerm==='function')maybeUpdateLongTerm(text);
    const reply=await callRequestAI(text);
    if(!callActive)return;
    setCallStatus('AI 回复：',reply);
    // 进入说话态，开启打断监听
    callState='speaking';
    document.getElementById('callAvatar').classList.add('speaking');
    vad.bargeMs=0;vad.last=performance.now();
    await playTTSCall(reply);
    document.getElementById('callAvatar').classList.remove('speaking');
    if(callAudioCtx&&callAudioCtx.state==='suspended')await callAudioCtx.resume();
    if(callActive&&callState==='speaking')enterListening(); // 未被打断则回到聆听
  }catch(e){setCallStatus('出错：',e.message);if(callActive)setTimeout(()=>{if(callActive)enterListening();},1200);}
}

/* 统一 VAD 回调（约每 25ms 一次） */
function handleVad(rms){
  if(!callActive)return;
  const now=performance.now();let dt=now-vad.last;vad.last=now;if(dt<=0||dt>200)dt=25;
  vad.smooth=vad.smooth*0.85+rms*0.15;
  if(callState==='listening'){
    if(!vad.spoke)vad.noiseFloor=vad.noiseFloor*0.97+rms*0.03;
    const thr=Math.max(VAD_CFG.minThresh,vad.noiseFloor*VAD_CFG.noiseFactor);
    vad.utterMs+=dt;
    if(vad.smooth>thr){vad.voiceMs+=dt;if(vad.voiceMs>VAD_CFG.minSpeechMs)vad.spoke=true;vad.silentMs=0;}
    else{if(vad.spoke)vad.silentMs+=dt;else vad.voiceMs=Math.max(0,vad.voiceMs-dt);}
    if((vad.spoke&&vad.silentMs>VAD_CFG.silenceHangMs)||vad.utterMs>VAD_CFG.maxUtterMs)finalizeUtterance();
  }else if(callState==='speaking'&&bargeInEnabled()){
    const thr=Math.max(VAD_CFG.bargeMin,vad.noiseFloor*VAD_CFG.bargeFactor);
    if(vad.smooth>thr){vad.bargeMs+=dt;if(vad.bargeMs>VAD_CFG.bargeHoldMs)triggerBargeIn();}
    else vad.bargeMs=Math.max(0,vad.bargeMs-dt*1.5);
  }
}
function triggerBargeIn(){
  if(callState!=='speaking')return;
  if(ttsSource){try{ttsSource.stop();}catch(e){}ttsSource=null;}
  document.getElementById('callAvatar').classList.remove('speaking');
  showToast('🎙️ 已打断');
  enterListening();
}
async function playTTSCall(text, voice){
  try{
    const gov=window.groupCallOverride||null;
    const voiceToUse=voice||(gov?gov.voice:localStorage.getItem('tts_voice_ai'));
    const blob=await ttsSpeak(text,voiceToUse);
    if(!blob)return;
    if(callAudioCtx.state==='suspended')await callAudioCtx.resume();
    const arr=await blob.arrayBuffer();
    const audioBuffer=await new Promise((res,rej)=>{callAudioCtx.decodeAudioData(arr,res,rej);});
    return new Promise(res=>{
      if(ttsSource){try{ttsSource.stop();}catch(e){}}
      ttsSource=callAudioCtx.createBufferSource();
      ttsSource.buffer=audioBuffer;
      ttsSource.connect(callAudioCtx.destination);
      ttsSource.onended=()=>{ttsSource=null;res();};
      ttsSource.start(0);
    });
  }catch(e){showToast('朗读失败：'+e.message);}
}

async function callRequestAI(query){
  const gov=window.groupCallOverride||null;
  const provider=gov&&gov.providerId?(getProvider(gov.providerId)||getCurrentProvider()):getCurrentProvider();
  const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';
  const useModel=gov&&gov.model?gov.model:(provider.id===currentProviderId?selectedModelName:(provider.models[0]&&provider.models[0].name)||selectedModelName);
  let recallItems=[];if(ragEnabled()&&query){try{recallItems=await recall(query);}catch(e){}}
  let sp;
  if(gov&&!gov.isMain){
    const profile=(typeof getLongTermProfile==='function')?getLongTermProfile():'';
    const rc=(typeof formatRecall==='function')?formatRecall(recallItems):'';
    sp=[profile?('【共同长期记忆】\n'+profile):'',`你正在和用户语音通话，你是「${gov.name}」。人设：${gov.persona||'自然随和'}`,rc,'请用简洁口语化中文回答，避免列表与符号。'].filter(Boolean).join('\n\n');
  }else{
    sp=await composeSystemPrompt(query,recallItems,'（语音通话，请用简洁口语化中文回答，避免列表与符号。）');
  }
  const shortTerm=ctxSlice(conversationHistory).map(m=>({role:m.role==='imported'?'user':m.role,content:m.content}));
  const messages=[{role:'system',content:sp},...shortTerm];
  let url=provider.endpoint.replace(/\/+$/,'');if(!url.includes('/chat/completions')&&!url.includes('messages'))url+='/chat/completions';
  const headers={'Content-Type':'application/json'};if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${apiKey}`;else if(provider.auth==='x-api-key')headers['x-api-key']=apiKey;else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=apiKey;
  const body={model:useModel,messages,stream:false};
  if(localStorage.getItem('temp_enabled')==='true')body.temperature=parseFloat(localStorage.getItem('temperature')||'1');
  const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok)throw new Error('API '+r.status);
  const d=await r.json();const reply=d.choices?.[0]?.message?.content||d.content?.[0]?.text||'（无回应）';
  const uid=genUid();const ts=Date.now();conversationHistory.push({role:'assistant',content:reply,uid,ts});renderTextMessage('assistant',reply,uid,null,null,false,ts);saveHistory();memorize('assistant',reply,'');updateAiEmotion(reply);if(typeof processAiReplyMemory==='function')processAiReplyMemory(reply);markActivity();
  return reply;
}

async function callRequestAiForGroupCall(mem, query){
  const provider=memberProvider(mem);
  const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';
  const useModel=memberModel(mem,provider);
  
  // 保证 groupHistory 最新，且解决 script 加载顺序可能导致 global 引用滞后或未同步的问题
  if (typeof getGroupHistory === 'function') {
    getGroupHistory();
  }
  
  const lastMsg = groupHistory[groupHistory.length - 1];
  const queryText = query || (lastMsg ? lastMsg.content : '');
  
  let recallItems=[];if(ragEnabled()&&queryText){try{recallItems=await recall(queryText);}catch(e){}}
  const roster=getGroupMembers().map(m=>m.name).join('、');
  
  const cl = (typeof getGroupContextLimit === 'function') ? getGroupContextLimit() : 18;
  const sliceCount = (cl === Infinity || isNaN(cl)) ? groupHistory.length : cl;
  const recent = groupHistory.slice(-sliceCount).map(m=>`${m.role==='user'?'用户':(memberById(m.memberId)?.name||m.name||'AI')}：${m.content}`).join('\n');
  
  const groupCallExtra = `【群聊语音通话】这是一个多人群聊语音通话，成员：用户、${roster}。你是「${mem.name}」。
当前用户说了话："${queryText}"。
规则：请只以「${mem.name}」的身份和性格特征（人设：${mem.persona || '自然随和'}）发表一条极其简短口语化、口头化的口语回复（控制在30字以内，最好15-25字），千万不要带有任何名字前缀（如 “${mem.name}：” 等），也不要复述别人的话，保持像真人连麦一样自然流畅、快速接话。`;

  const sp = await composeSystemPrompt(queryText, recallItems, groupCallExtra, mem.id);
  
  const messages=[
    {role:'system',content:sp},
    {role:'user',content:`最近群聊历史：\n${recent}\n\n当前用户对大家说："${queryText}"\n请立即以「${mem.name}」身份极简短口语接话。`}
  ];
  
  let url=provider.endpoint.replace(/\/+$/,'');if(!url.includes('/chat/completions')&&!url.includes('messages'))url+='/chat/completions';
  const headers={'Content-Type':'application/json'};if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${apiKey}`;else if(provider.auth==='x-api-key')headers['x-api-key']=apiKey;else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=apiKey;
  const body={model:useModel,messages,stream:false};
  if(localStorage.getItem('temp_enabled')==='true')body.temperature=parseFloat(localStorage.getItem('temperature')||'1');
  
  const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok)throw new Error('API '+r.status);
  const d=await r.json();let reply=(d.choices?.[0]?.message?.content||d.content?.[0]?.text||'').trim();
  if(typeof cleanAiText==='function')reply=cleanAiText(reply);
  
  const uid=genUid();const ts=Date.now();
  pushGroup({uid,role:'assistant',memberId:mem.id,name:mem.name,avatar:mem.avatar,content:reply,ts});
  return reply;
}
