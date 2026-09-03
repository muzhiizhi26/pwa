/* ===== 语音通话：AudioWorklet VAD + 打断 + 整句 ASR ===== */
let callActive=false,callMuted=false,callStream=null,callMime='';
let callAudioCtx=null,micSource=null,vadNode=null,analyserFallback=null,fallbackRAF=null;
let callRecorder=null,callChunks=[],recStopReason='';
let ttsSource=null,callStartTime=0,callTimerInt=null;

/* Voice Runtime 状态机 */
const VoiceSession = {
  state: 'IDLE', // IDLE | LISTENING | PROCESSING | SPEAKING | INTERRUPTED | RECOVERING
  transitionTo(newState, reason = '') {
    console.log(`[VoiceSession] Transition: ${this.state} -> ${newState} (${reason})`);
    this.state = newState;
    callState = newState.toLowerCase();
    
    // 同步视觉状态
    const av = document.getElementById('callAvatar');
    if (newState === 'SPEAKING') {
      av?.classList.add('speaking');
    } else {
      av?.classList.remove('speaking');
    }
    
    // 同步状态栏和文字提示
    switch(newState) {
      case 'IDLE':
        setCallStatus('通话结束', '');
        break;
      case 'LISTENING':
        setCallStatus('正在聆听...', '');
        break;
      case 'PROCESSING':
        setCallStatus('识别与思考中...', '');
        break;
      case 'SPEAKING':
        setCallStatus('AI 正在说话...', '');
        break;
      case 'INTERRUPTED':
        setCallStatus('已打断，重置中...', '');
        break;
      case 'RECOVERING':
        setCallStatus('正在恢复聆听...', '');
        break;
    }
  },
  
  bargeIn() {
    if (this.state !== 'SPEAKING') return;
    this.transitionTo('INTERRUPTED', 'user barge-in');
    
    // 停止语音播放
    if (ttsSource) {
      try { ttsSource.stop(); } catch(e) {}
      ttsSource = null;
    }
    
    showToast('🎙️ 已打断');
    
    // 无缝恢复监听，不销毁 session，保留 conversation_id，直接无缝继续
    this.transitionTo('LISTENING', 'seamless recovery');
    
    // 初始化 VAD 聆听态运行参数，保证能正常检测随后的静音
    vad.spoke = true;
    vad.voiceMs = vad.bargeMs;
    vad.silentMs = 0;
    vad.utterMs = vad.bargeMs;
  }
};

let callState='idle'; // idle | listening | processing | speaking (legacy map)

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
function setCallStatus(s,sub,role){
  document.getElementById('callStatus').textContent=s;
  // 方向B：对话内容（sub 非空）累积到 callSub 字幕日志（纯状态提示如"识别中..."不覆盖日志）
  if(sub) appendCallSub(role||'system',`${s} ${sub}`);
}
// 方向B：字幕累积——保留最近 8 条，按角色（user/assistant/system）渲染为独立气泡
function appendCallSub(role, text){
  try {
    const el=document.getElementById('callSub');
    if(!el) return;
    const max=8;
    let msgs=el.dataset.msgs?JSON.parse(el.dataset.msgs):[];
    msgs.push({role:role||'system',text:String(text||'').trim()});
    if(msgs.length>max)msgs=msgs.slice(-max);
    el.dataset.msgs=JSON.stringify(msgs);
    el.innerHTML=msgs.map(m=>{
      const cls=m.role==='user'?'call-bubble call-bubble-user':m.role==='assistant'?'call-bubble call-bubble-ai':'call-bubble call-bubble-sys';
      return `<div class="${cls}">${m.text}</div>`;
    }).join('');
    el.scrollTop=el.scrollHeight;
  }catch(e){}
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
    if(callActive && VoiceSession.state==='SPEAKING'){
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

	// 通话中恢复：从后台切回时，如果流已死则重新获取
	if (callActive && callStream && !callStream.active) {
	  try {
	    callStream = await navigator.mediaDevices.getUserMedia({
	      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
	    });
	    await reconnectCallNodes();
	    console.log('[Call] Stream reacquired after returning from background');
	  } catch(e) {
	    console.warn('[Call] Failed to reacquire stream:', e);
	  }
	}

  // 缓存已有流，避免重复授权
  if (callStream && callStream.active) {
    // 复用已有流，只需重新连接音频节点
    if (!reconnectCallNodes()) return;
    return;
  }

  callStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
  });

  if (!reconnectCallNodes()) return;
}

async function reconnectCallNodes() {
  if (!callStream) return false;
  // P1修复：通话使用独立 AudioContext，不复用 voice.js 全局 audioCtx（避免挂起/恢复与普通TTS互相干扰）
  if (!callAudioCtx) callAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (callAudioCtx.state === 'suspended') callAudioCtx.resume();

  try { micSource = callAudioCtx.createMediaStreamSource(callStream); } catch(e) { return false; }

  let workletOk = false;
  if (callAudioCtx.audioWorklet && micSource) {
    try {
      const wurl = vadWorkletUrl();
      if (wurl) {
        await callAudioCtx.audioWorklet.addModule(wurl);
        vadNode = new AudioWorkletNode(callAudioCtx, 'vad-processor');
        micSource.connect(vadNode);
        vadNode.port.onmessage = e => handleVad(e.data);
        workletOk = true;
      }
    } catch(e) {
      workletOk = false;
    }
  }
  if (!workletOk && micSource) {
    analyserFallback = callAudioCtx.createAnalyser();
    analyserFallback.fftSize = 512;
    micSource.connect(analyserFallback);
    const data = new Uint8Array(analyserFallback.frequencyBinCount);
    const loop = () => {
      if (!callActive || (VoiceSession.state !== 'LISTENING' && VoiceSession.state !== 'SPEAKING')) return;
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
  return true;
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
  // 不停止 callStream 轨道 — 保持缓存供下次复用，避免重复授权
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
  callActive=false;
  VoiceSession.transitionTo('IDLE', 'endCall');
  stopCallTimer();
  document.getElementById('callOverlay').classList.remove('show');document.getElementById('callGate').classList.remove('show');document.getElementById('callAvatar').classList.remove('speaking');
  if(callRecorder&&callRecorder.state!=='inactive'){recStopReason='end';try{callRecorder.stop();}catch(e){}}
  if(ttsSource){try{ttsSource.stop();}catch(e){}ttsSource=null;}
  releaseMicAndStopVAD();
  // P1修复：不再操作 voice.js 全局 unlockedAudio（通话 TTS 已用独立 callAudioCtx 播放并已停止）
  stopKeepAlive();releaseWakeLock();
  if(wasActive)showCallEnd(dur);callStartTime=0;
  window.groupCallOverride=null;
}

/* 进入聆听：立即开录（含说话前预录），VAD 决定何时截断 */
async function enterListening(){
  if(!callActive||callMuted)return;
  VoiceSession.transitionTo('LISTENING', 'enterListening');
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
  if(VoiceSession.state!=='LISTENING')return;
  VoiceSession.transitionTo('PROCESSING', 'finalizeUtterance');
  if(callRecorder&&callRecorder.state==='recording'){recStopReason='utterance';try{callRecorder.stop();}catch(e){}}
}

async function prepareBargeInVAD(){
  if(!callActive||callMuted||!bargeInEnabled())return;
  resetVad();
  try{
    await acquireMicAndStartVAD();
  }catch(e){
    console.warn('[Call] Barge-in VAD failed:', e);
  }
}

async function onRecorderStop(){
  if(!callActive)return;
  if(recStopReason==='mute'||recStopReason==='end')return;
  const blob=new Blob(callChunks,{type:callRecorder.mimeType||callMime||'audio/mp4'});
  
  // 🎙️ 录制已结束，立即停止并释放麦克风，确保播放 AI 语音时 iOS 扬声器通道不被占用
  releaseMicAndStopVAD();

  if(blob.size<1000 && recStopReason!=='utterance'){enterListening();return;}
  setCallStatus('识别中...','');
  try{
    const text=await sttTranscribe(blob);
    if(!text.trim()){enterListening();return;}
    setCallStatus('你说：',text,'user');
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
        setCallStatus(`${mem.name} 回复：`,reply,'assistant');
        VoiceSession.transitionTo('SPEAKING', 'group tts play');
        // 群聊 TTS 期间开启高阈值 barge-in：用户贴麦说话可打断，AI自身扬声器漏音不会误判
        vad.bargeMs=0;vad.last=performance.now();
        const savedBargeMin = VAD_CFG.bargeMin;
        const savedBargeFactor = VAD_CFG.bargeFactor;
        VAD_CFG.bargeMin *= 2.5;   // 提高打断门槛，防止AI自己声音重采误触发
        VAD_CFG.bargeFactor *= 1.5;
        await prepareBargeInVAD();
        await playTTSCall(reply, mem.voice || localStorage.getItem('tts_voice_ai'));
        VAD_CFG.bargeMin = savedBargeMin;
        VAD_CFG.bargeFactor = savedBargeFactor;
        if(!callActive)return;
        if(VoiceSession.state!=='SPEAKING'){
          // 用户已打断 → 跳出循环，不加第三个AI
          break;
        }
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
    setCallStatus('AI 回复：',reply,'assistant');
    // 进入说话态（必须先转 SPEAKING，再 prepareBargeInVAD——否则 Analyser 循环因 state 非 SPEAKING/LISTENING 而立即退出）
    VoiceSession.transitionTo('SPEAKING', 'tts play');
    vad.bargeMs=0;vad.last=performance.now();
    await prepareBargeInVAD();
    await playTTSCall(reply);
    document.getElementById('callAvatar').classList.remove('speaking');
    if(callAudioCtx&&callAudioCtx.state==='suspended')await callAudioCtx.resume();
    if(callActive&&VoiceSession.state==='SPEAKING')enterListening(); // 未被打断则回到聆听
  }catch(e){setCallStatus('出错：',e.message);if(callActive)setTimeout(()=>{if(callActive)enterListening();},1200);}
}

/* 统一 VAD 回调（约每 25ms 一次） */
function handleVad(rms){
  if(!callActive)return;
  const now=performance.now();let dt=now-vad.last;vad.last=now;if(dt<=0||dt>200)dt=25;
  vad.smooth=vad.smooth*0.85+rms*0.15;
  if(VoiceSession.state==='LISTENING'){
    if(!vad.spoke)vad.noiseFloor=vad.noiseFloor*0.97+rms*0.03;
    const thr=Math.max(VAD_CFG.minThresh,vad.noiseFloor*VAD_CFG.noiseFactor);
    vad.utterMs+=dt;
    if(vad.smooth>thr){vad.voiceMs+=dt;if(vad.voiceMs>VAD_CFG.minSpeechMs)vad.spoke=true;vad.silentMs=0;}
    else{if(vad.spoke)vad.silentMs+=dt;else vad.voiceMs=Math.max(0,vad.voiceMs-dt);}
    if((vad.spoke&&vad.silentMs>VAD_CFG.silenceHangMs)||vad.utterMs>VAD_CFG.maxUtterMs)finalizeUtterance();
  }else if(VoiceSession.state==='SPEAKING'&&bargeInEnabled()){
    const thr=Math.max(VAD_CFG.bargeMin,vad.noiseFloor*VAD_CFG.bargeFactor);
    if(vad.smooth>thr){
      vad.bargeMs+=dt;
      // 说话态下，用户一开口即刻拉起 Recorder，避免漏掉打断判定期间的字词
      if(!callRecorder || callRecorder.state==='inactive'){
        startRecorder();
      }
      if(vad.bargeMs>VAD_CFG.bargeHoldMs)triggerBargeIn();
    }
    else {
      vad.bargeMs=Math.max(0,vad.bargeMs-dt*1.5);
      // 如果仅是微弱环境噪声/瞬时叹气，未达到打断时限，则默默销毁该次短音频
      if(vad.bargeMs===0 && callRecorder && callRecorder.state==='recording' && VoiceSession.state==='SPEAKING'){
        recStopReason='mute';
        try{callRecorder.stop();}catch(e){}
      }
    }
  }
}
function triggerBargeIn(){
  VoiceSession.bargeIn();
}
async function playTTSCall(text, voice){
  try{
    const gov=window.groupCallOverride||null;
    const voiceToUse=voice||(gov?gov.voice:localStorage.getItem('tts_voice_ai'));
    if(callAudioCtx.state==='suspended')await callAudioCtx.resume();
    // 方向A：分句 TTS——切句后逐句生成播放（首句先出，降首字延迟），barge-in 打断时停止后续
    const sentences = (typeof splitForTTS === 'function') ? splitForTTS(text) : [text];
    if(!sentences.length) return;
    for(let i=0;i<sentences.length;i++){
      // 通话结束或被用户打断（barge-in 已切 LISTENING）则停止后续句
      if(!callActive || VoiceSession.state!=='SPEAKING') return;
      const blob=await ttsSpeak(sentences[i],voiceToUse);
      if(!blob) continue;
      if(!callActive || VoiceSession.state!=='SPEAKING') return;
      const arr=await blob.arrayBuffer();
      const audioBuffer=await new Promise((res,rej)=>{callAudioCtx.decodeAudioData(arr,res,rej);});
      await new Promise(res=>{
        if(ttsSource){try{ttsSource.stop();}catch(e){}}
        ttsSource=callAudioCtx.createBufferSource();
        ttsSource.buffer=audioBuffer;
        ttsSource.connect(callAudioCtx.destination);
        ttsSource.onended=()=>{ttsSource=null;res();};
        ttsSource.start(0);
      });
    }
  }catch(e){console.warn('[playTTSCall] error:', e.message);}
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
  let endpoint1=(provider.endpoint||'').trim();if(!endpoint1)throw new Error('未配置 API Endpoint');if(!/^https?:\/\//i.test(endpoint1))endpoint1='https://'+endpoint1;let url=endpoint1.replace(/\/+$/,'');if(!url.includes('/chat/completions')&&!url.includes('messages')&&!url.includes('/v1/chat'))url+='/chat/completions';
  const headers={'Content-Type':'application/json'};const cleanKey1=(apiKey||'').trim();if(cleanKey1){if(provider.auth==='Bearer')headers['Authorization']=`Bearer ${cleanKey1}`;else if(provider.auth==='x-api-key')headers['x-api-key']=cleanKey1;else if(provider.auth==='x-goog-api-key')headers['x-goog-api-key']=cleanKey1;}
  const body={model:useModel,messages,stream:false};
  if(localStorage.getItem('temp_enabled')==='true')body.temperature=parseFloat(localStorage.getItem('temperature')||'1');

  // 通话中 API 调用：30 秒超时 + 自动重试一次
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      clearTimeout(timeoutId);
      if (!r.ok) throw new Error('API ' + r.status);
      const d = await r.json();
      const reply = d.choices?.[0]?.message?.content || d.content?.[0]?.text || '（无回应）';
      const uid = genUid(); const ts = Date.now();
      conversationHistory.push({ role: 'assistant', content: reply, uid, ts });
      renderTextMessage('assistant', reply, uid, null, null, false, ts);
      saveHistory(); memorize('assistant', reply, '');
      updateAiEmotion(reply);
      if (typeof processAiReplyMemory === 'function') processAiReplyMemory(reply);
      markActivity();
      return reply;
    } catch (e) {
      lastErr = e;
      if (attempt === 1) {
        console.warn('[Call] API attempt 1 failed, retrying:', e.message);
        setCallStatus('重试中...', '');
      }
    }
  }
  throw lastErr || new Error('API 请求失败');
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
  
  let endpoint2=(provider.endpoint||'').trim();if(!endpoint2)throw new Error('未配置 API Endpoint');if(!/^https?:\/\//i.test(endpoint2))endpoint2='https://'+endpoint2;let url2=endpoint2.replace(/\/+$/,'');if(!url2.includes('/chat/completions')&&!url2.includes('messages')&&!url2.includes('/v1/chat'))url2+='/chat/completions';
  const headers2={'Content-Type':'application/json'};const cleanKey2=(apiKey||'').trim();if(cleanKey2){if(provider.auth==='Bearer')headers2['Authorization']=`Bearer ${cleanKey2}`;else if(provider.auth==='x-api-key')headers2['x-api-key']=cleanKey2;else if(provider.auth==='x-goog-api-key')headers2['x-goog-api-key']=cleanKey2;}
  const body={model:useModel,messages,stream:false};
  if(localStorage.getItem('temp_enabled')==='true')body.temperature=parseFloat(localStorage.getItem('temperature')||'1');
  
  const r=await fetch(url2,{method:'POST',headers:headers2,body:JSON.stringify(body)});if(!r.ok)throw new Error('API '+r.status);
  const d=await r.json();let reply=(d.choices?.[0]?.message?.content||d.content?.[0]?.text||'').trim();
  if(typeof cleanAiText==='function')reply=cleanAiText(reply);
  
  const uid=genUid();const ts=Date.now();
  pushGroup({uid,role:'assistant',memberId:mem.id,name:mem.name,avatar:mem.avatar,content:reply,ts});
  return reply;
}
