/* ===== 语音：TTS / STT / 按住录音 ===== */
function voiceKey(){return (localStorage.getItem('voice_key')||'').trim();}
function voiceForRole(role){return role==='user'?(localStorage.getItem('tts_voice_user')||''):(localStorage.getItem('tts_voice_ai')||'');}
function renderAutoSpeakToggle(){const b=document.getElementById('autoSpeakToggleBtn');if(!b)return;const on=autoSpeakEnabled();b.title=on?'自动朗读 AI 回复：已开启':'自动朗读 AI 回复：已关闭';b.classList.toggle('voice-off',!on);const icon=b.querySelector('span');if(icon)icon.textContent=on?'🔈':'🔕';const label=b.querySelector('b');if(label)label.textContent='自动朗读';}
function setAutoSpeak(on){localStorage.setItem('auto_speak',on?'true':'false');renderAutoSpeakToggle();}
function toggleAutoSpeakFromHeader(){setAutoSpeak(!autoSpeakEnabled());showToast(autoSpeakEnabled()?'🔈 自动朗读 AI 回复已开启':'🔕 自动朗读 AI 回复已关闭');}
function renderVoiceToggle(){const b=document.getElementById('voiceToggleBtn');if(voiceEnabled()){b.textContent='🔊';b.classList.remove('voice-off');}else{b.textContent='🔇';b.classList.add('voice-off');}renderAutoSpeakToggle();}
function toggleVoiceMaster(){localStorage.setItem('voice_enabled',voiceEnabled()?'false':'true');renderVoiceToggle();showToast(voiceEnabled()?'🔊 语音已开启':'🔇 语音已关闭');}
function setVoiceMaster(on){localStorage.setItem('voice_enabled',on?'true':'false');renderVoiceToggle();}

function pickMimeType(){if(typeof MediaRecorder==='undefined')return '';const types=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/aac','audio/mpeg'];for(const t of types){if(MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))return t;}return '';}
function extForMime(mime){if(!mime)return 'webm';if(mime.includes('mp4'))return 'mp4';if(mime.includes('mpeg'))return 'mp3';if(mime.includes('aac'))return 'aac';return 'webm';}

async function fetchVoiceList(){
  const keyInput = document.getElementById('voiceKey')?.value;
  const key = (keyInput !== undefined ? keyInput.trim() : voiceKey());
  if(!key){alert('请先填入 API Key');return;}try{const r=await fetch(VOICE_LIST_URL,{headers:{'Authorization':`Bearer ${key}`}});if(!r.ok)throw new Error('获取失败 '+r.status);const d=await r.json();const list=(d.result||d.data||d.voices||[]).map(v=>v.uri||v.id||v.name||v).filter(Boolean);localStorage.setItem('voice_list',JSON.stringify(list));localStorage.setItem('voice_key',key);showToast(`✅ 获取 ${list.length} 个音色`);renderVoiceSettings();}catch(e){alert('获取音色失败：'+e.message);}}
async function ttsSpeak(text,voice){const key=voiceKey();if(!key){showToast('请先在语音设置填入 API Key');return null;}const spoken=stripForSpeech(text);if(!spoken)return null;const body={model:localStorage.getItem('tts_model')||getTtsModels()[0],input:spoken,response_format:'mp3'};const v=voice||localStorage.getItem('tts_voice_ai');if(v)body.voice=v;const r=await fetch(getTtsUrl(),{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify(body)});if(!r.ok)throw new Error('TTS '+r.status);return await r.blob();}
async function playTTS(text,voice){if(!voiceEnabled()){showToast('🔇 语音已关闭');return;}try{const blob=await ttsSpeak(text,voice);if(!blob)return;if(!unlockedAudio){unlockedAudio=new Audio();unlockedAudio.setAttribute('playsinline','');}if(unlockedAudio.src && unlockedAudio.src.startsWith('blob:')) {
      const oldUrl = unlockedAudio.src;
      unlockedAudio.src = '';
      try { URL.revokeObjectURL(oldUrl); } catch(e) {}
    }
    unlockedAudio.onended = null;
    unlockedAudio.onerror = null;
    if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();
    const objUrl = URL.createObjectURL(blob);
    unlockedAudio.src = objUrl;
    const cleanup = () => {
      unlockedAudio.onended = null;
      unlockedAudio.onerror = null;
      try { URL.revokeObjectURL(objUrl); } catch(e) {}
    };
    const pr=unlockedAudio.play();if(pr&&pr.catch){
      const ok = await pr.then(() => true).catch(() => {
        showToast('点击屏幕后可播放');
        cleanup();
        return false;
      });
      if(!ok) return;
    }return new Promise(res=>{unlockedAudio.onended=()=>{cleanup();res();};unlockedAudio.onerror=()=>{cleanup();res();};});}catch(e){showToast('朗读失败：'+e.message);}}
async function testTTS(){localStorage.setItem('voice_key',document.getElementById('voiceKey').value);localStorage.setItem('tts_url',document.getElementById('ttsUrl').value);localStorage.setItem('tts_voice_ai',document.getElementById('voiceAi').value);localStorage.setItem('tts_voice_user',document.getElementById('voiceUser').value);if(!voiceEnabled()){showToast('🔇 请先打开语音总开关');return;}unlockAudioOnGesture();await playTTS('你好，这是 AI 音色测试。（这句括号内容不会被朗读）',document.getElementById('voiceAi').value);}
async function sttTranscribe(blob){const key=voiceKey();if(!key)throw new Error('请先填入 API Key');const ext=extForMime(blob.type);const fd=new FormData();fd.append('model',localStorage.getItem('stt_model')||'FunAudioLLM/SenseVoiceSmall');fd.append('file',blob,'audio.'+ext);const r=await fetch(STT_URL,{method:'POST',headers:{'Authorization':`Bearer ${key}`},body:fd});if(!r.ok)throw new Error('STT '+r.status);const d=await r.json();return d.text||'';}

/* 按住录音（Push-To-Talk）+ 整句 ASR */
let mediaRecorder=null,recChunks=[],recording=false,pttActive=false,pttStart=0;
async function startPTT(isGroup = false){
  if(pttActive)return;
  if(!voiceEnabled()){showToast('🔇 语音已关闭，请先开启');return;}
  if(!navigator.mediaDevices?.getUserMedia){alert('当前环境不支持录音（需 HTTPS）');return;}
  unlockAudioOnGesture();
  let stream=null;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
    const mime=pickMimeType();
    mediaRecorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
    recChunks=[];
    mediaRecorder.ondataavailable=e=>{if(e.data.size>0)recChunks.push(e.data);};
    mediaRecorder.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      const micBtn = isGroup ? document.getElementById('groupMicBtn') : document.getElementById('micBtn');
      if(micBtn) micBtn.classList.remove('recording');
      const dur=Date.now()-pttStart;
      const blob=new Blob(recChunks,{type:mediaRecorder.mimeType||mime||'audio/mp4'});
      if(dur<300||blob.size<1500){showToast('录音太短');return;}
      showToast('🔄 识别中...');
      try{
        const text=await sttTranscribe(blob);
        if(!text.trim()){showToast('未识别到语音');return;}
        const inp=isGroup ? document.getElementById('groupInput') : document.getElementById('messageInput');
        if(inp){
          inp.value=(inp.value?inp.value+' ':'')+text.trim();
          autoResize(inp);
        }
        showToast('✅ 识别完成');
      }
      catch(e){showToast('识别失败：'+e.message);}
    };
    mediaRecorder.start();
    recording=true;pttActive=true;pttStart=Date.now();
    const micBtn = isGroup ? document.getElementById('groupMicBtn') : document.getElementById('micBtn');
    if(micBtn) micBtn.classList.add('recording');
    showToast('🎤 松开发送');
  }catch(e){
    if(stream){try{stream.getTracks().forEach(t=>t.stop());}catch(se){}}
    alert('无法访问麦克风：'+e.message);
    pttActive=false;
  }
}
function endPTT(){
  if(!pttActive)return;
  pttActive=false;recording=false;
  if(mediaRecorder&&mediaRecorder.state!=='inactive'){try{mediaRecorder.stop();}catch(e){}}
}
