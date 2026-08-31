/* ===== 语音：TTS / STT / 按住录音 ===== */
function voiceKey(){return (localStorage.getItem('voice_key')||'').trim();}
function voiceForRole(role){return role==='user'?(localStorage.getItem('tts_voice_user')||''):(localStorage.getItem('tts_voice_ai')||'');}
function renderAutoSpeakToggle(){const b=document.getElementById('autoSpeakToggleBtn');if(!b)return;const on=autoSpeakEnabled();b.title=on?'自动朗读 AI 回复：已开启':'自动朗读 AI 回复：已关闭';b.classList.toggle('voice-off',!on);const icon=b.querySelector('span');if(icon)icon.textContent=on?'🔈':'🔕';const label=b.querySelector('b');if(label)label.textContent='自动朗读';}
function setAutoSpeak(on){localStorage.setItem('auto_speak',on?'true':'false');renderAutoSpeakToggle();}
function toggleAutoSpeakFromHeader(){setAutoSpeak(!autoSpeakEnabled());showToast(autoSpeakEnabled()?'🔈 自动朗读 AI 回复已开启':'🔕 自动朗读 AI 回复已关闭');}
function renderVoiceToggle(){const b=document.getElementById('voiceToggleBtn');if(voiceEnabled()){b.textContent='🔊';b.classList.remove('voice-off');}else{b.textContent='🔇';b.classList.add('voice-off');}renderAutoSpeakToggle();}
function toggleVoiceMaster(){localStorage.setItem('voice_enabled',voiceEnabled()?'false':'true');renderVoiceToggle();showToast(voiceEnabled()?'🔊 语音已开启':'🔇 语音已关闭');}
function setVoiceMaster(on){localStorage.setItem('voice_enabled',on?'true':'false');renderVoiceToggle();}

function pickMimeType(){if(typeof MediaRecorder==='undefined')return '';const types=['audio/mp4','audio/aac','audio/webm;codecs=opus','audio/webm','audio/mpeg'];for(const t of types){if(MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))return t;}return '';}
function extForMime(mime){if(!mime)return 'm4a';if(mime.includes('mp4')||mime.includes('aac')||mime.includes('m4a'))return 'm4a';if(mime.includes('mpeg'))return 'mp3';if(mime.includes('wav'))return 'wav';if(mime.includes('webm'))return 'webm';return 'm4a';}

async function fetchVoiceList(){
  const keyInput = document.getElementById('voiceKey')?.value;
  const key = (keyInput !== undefined ? keyInput.trim() : voiceKey());
  if(!key){alert('请先填入 API Key');return;}try{const r=await fetch(VOICE_LIST_URL,{headers:{'Authorization':`Bearer ${key}`}});if(!r.ok)throw new Error('获取失败 '+r.status);const d=await r.json();const list=(d.result||d.data||d.voices||[]).map(v=>v.uri||v.id||v.name||v).filter(Boolean);localStorage.setItem('voice_list',JSON.stringify(list));localStorage.setItem('voice_key',key);showToast(`✅ 获取 ${list.length} 个音色`);renderVoiceSettings();}catch(e){alert('获取音色失败：'+e.message);}}
/* 方向A：分句 TTS——按标点切短句（合并过短句），供通话流式播放降首字延迟 */
function splitForTTS(text){
  const s = String(text || '').trim();
  if (!s) return [];
  const parts = s.split(/(?<=[。！？；!?;\n])/).map(p => p.trim()).filter(Boolean);
  // 合并过短句（<6字）到前一句，避免碎句
  const merged = [];
  for (const p of parts) {
    if (merged.length && (merged[merged.length-1].length < 6 || p.length < 6)) {
      merged[merged.length-1] += p;
    } else {
      merged.push(p);
    }
  }
  return merged.length ? merged : [s];
}
window.splitForTTS = splitForTTS;

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
async function sttTranscribe(blob){const key=voiceKey();if(!key)return '';const ext=extForMime(blob.type);const fd=new FormData();fd.append('model',localStorage.getItem('stt_model')||'FunAudioLLM/SenseVoiceSmall');fd.append('file',blob,'audio.'+ext);const headers={};if(key)headers['Authorization']=`Bearer ${key}`;const r=await fetch(STT_URL,{method:'POST',headers,body:fd});if(!r.ok)throw new Error('STT '+r.status);const d=await r.json();return d.text||'';}

/* 按住录音（Push-To-Talk）+ 整句 ASR */
let mediaRecorder=null,recChunks=[],recording=false,pttActive=false,pttStart=0;
let audioStream=null; // 缓存音频流，避免每次重复授权
let pttRecordCount=0;
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent); // 检测 Safari
async function ensureAudioStream(){
  // Safari 流老化保护：每录 5 次刷新一次流（Safari 流老化后录出空数据）
  if(isSafari && pttRecordCount > 0 && pttRecordCount % 5 === 0 && audioStream) {
    try { audioStream.getTracks().forEach(t => t.stop()); } catch(e) {}
    audioStream = null;
  }
  // 检查缓存的流是否仍然有效（浏览器可能在切后台后回收轨道）
  if(audioStream) {
    const tracks = audioStream.getAudioTracks();
    const allEnded = tracks.length > 0 && tracks.every(t => t.readyState === 'ended');
    if(allEnded) {
      try { audioStream.getTracks().forEach(t => t.stop()); } catch(e) {}
      audioStream = null;
    } else {
      return audioStream;
    }
  }
  audioStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
  return audioStream;
}
async function startPTT(isGroup = false){
  if(pttActive)return;
  if(!voiceEnabled()){showToast('🔇 语音已关闭，请先开启');return;}
  if(!navigator.mediaDevices?.getUserMedia){alert('当前环境不支持录音（需 HTTPS）');return;}
  unlockAudioOnGesture();
  try{
    const stream=await ensureAudioStream();
    const mime=pickMimeType();
    mediaRecorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
    recChunks=[];
    mediaRecorder.ondataavailable=e=>{if(e.data.size>0)recChunks.push(e.data);};
    mediaRecorder.onstop=async()=>{
      // 不停止 stream 轨道，保持缓存供下次复用
      const micBtn = isGroup ? document.getElementById('groupHoldToTalkBtn') : document.getElementById('holdToTalkBtn');
      if(micBtn) micBtn.classList.remove('recording');
      const dur=Date.now()-pttStart;
      const mimeType = mediaRecorder.mimeType || mime || 'audio/webm';
      const blob=new Blob(recChunks,{type:mimeType});
      if(dur<300||blob.size<1500){showToast('录音太短');if(isSafari){try{audioStream.getTracks().forEach(t=>t.stop());}catch(e){}audioStream=null;}return;}
      showToast('🎤 发送语音中...');

      // 使用 FileReader 转 base64（兼容性优于 btoa + arrayBuffer）
      let base64Data = await new Promise(resolve => {
        try {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result || '';
            resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : '');
          };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        } catch(e) {
          console.warn('[PTT] FileReader failed:', e);
          resolve('');
        }
      });

      let transcript = '';
      try {
        transcript = await sttTranscribe(blob);
      } catch(e) {
        console.warn('[PTT] Background STT skipped:', e);
      }

      const durSec = Math.max(1, Math.round(dur / 1000));
      const displayText = transcript ? transcript.trim() : '语音消息';

      if(isGroup){
        if (typeof sendGroupAudioMessage === 'function') {
          sendGroupAudioMessage(displayText, base64Data, mimeType, transcript, durSec);
        }
      } else {
        if (typeof sendAudioMessage === 'function') {
          sendAudioMessage(displayText, base64Data, mimeType, transcript, durSec);
        }
      }
    };
    mediaRecorder.start();
    recording=true;pttActive=true;pttStart=Date.now();pttRecordCount++;
    const micBtn = isGroup ? document.getElementById('groupHoldToTalkBtn') : document.getElementById('holdToTalkBtn');
    if(micBtn) micBtn.classList.add('recording');
    showToast('🎤 松开发送');
  }catch(e){
    // 首次获取失败则清除缓存，下次重试
    if(audioStream){try{audioStream.getTracks().forEach(t=>t.stop());}catch(se){}}
    audioStream=null;
    alert('无法访问麦克风：'+e.message);
    pttActive=false;
  }
}
function endPTT(){
  if(!pttActive)return;
  pttActive=false;recording=false;
  if(mediaRecorder&&mediaRecorder.state!=='inactive'){try{mediaRecorder.stop();}catch(e){console.warn('[PTT] stop failed:',e);}}
}
