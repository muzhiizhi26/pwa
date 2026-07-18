/* ===== 和 AI 一起创作歌曲（歌词 + MiniMax Music 2.6 旋律）===== */
function songEnabled(){return localStorage.getItem('song_enabled')==='true';}
function songProxy(){return (localStorage.getItem('song_proxy')||'').replace(/\/+$/,'');}
function songKey(){return (localStorage.getItem('song_key')||'').trim();}
function songModel(){return localStorage.getItem('song_model')||'music-2.6';}

let lastLyrics='';
function openSongCraft(){document.getElementById('songPanel').classList.add('show');document.getElementById('songLyrics').value=lastLyrics;}
function closeSongCraft(){document.getElementById('songPanel').classList.remove('show');}

/* 让 AI 写/改歌词 */
async function aiWriteLyrics(){
  const theme=document.getElementById('songTheme').value.trim();if(!theme){showToast('先填主题/要求');return;}
  const provider=getCurrentProvider();const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';
  if(!apiKey&&provider.auth!=='none'){showToast('请先填入 API Key');return;}
  showToast('✍️ AI 正在写词...');
  const cur=document.getElementById('songLyrics').value.trim();
  const sys='你是专业作词人。请根据用户要求创作中文歌词，结构包含[主歌][副歌]等段落标签，语言优美有画面感，押韵自然。只输出歌词本身。';
  const userMsg=cur?`现有歌词：\n${cur}\n\n修改要求：${theme}`:`创作要求：${theme}`;
  try{
    const out=await llmComplete([{role:'system',content:sys},{role:'user',content:userMsg}],{temperature:0.85});
    if(out){
      document.getElementById('songLyrics').value=out;
      lastLyrics=out;
      showToast('✅ 歌词已生成');
    }
  }
  catch(e){showToast('写词失败：'+e.message);}
}

/* 调用 MiniMax Music 生成旋律（异步轮询版，支持长音频） */
async function generateSong(){
  const lyrics=document.getElementById('songLyrics').value.trim();
  if(!lyrics){showToast('请先写歌词');return;}
  lastLyrics=lyrics;
  const style=document.getElementById('songStyle').value.trim()||'流行 温暖 抒情';
  const proxy=songProxy();
  if(!proxy){showToast('未配置音乐生成代理，仅保存歌词');addMessage('assistant','🎵 已生成歌词（未配置生成代理，无法出旋律）：\n\n'+lyrics,genUid());closeSongCraft();return;}
  
  const btn=document.getElementById('songGenBtn');
  if(btn){btn.disabled=true;btn.textContent='提交中...';}
  showToast('🎧 任务已提交，等待生成...');

  const params={
    lyrics,
    style,
    key:songKey(),
    model:songModel()
  };

  try{
    // 1. 提交异步任务
    let resp=await fetch(proxy,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(params)
    });
    let data=await resp.json();

    // 2. 轮询等待结果（最长 10 分钟）
    let attempts=0;
    const maxAttempts=200; // 200次 × 3秒 = 10分钟

    while(data.pending && attempts < maxAttempts){
      await new Promise(r=>setTimeout(r,3000));
      resp=await fetch(proxy,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...params, taskId:data.taskId})
      });
      data=await resp.json();
      attempts++;
    }

    if(data.pending) throw new Error('生成超时，请稍后重试');
    if(data.error) throw new Error(data.error);

    // 3. 获取音频 URL
    let audioUrl=data.audio_url||data.url||(data.data&&(data.data.audio_url||data.data.audio));
    if(!audioUrl&&data.audio) audioUrl=data.audio.startsWith('data:')?data.audio:('data:audio/mp3;base64,'+data.audio);
    if(!audioUrl) throw new Error('代理未返回音频');

    // 4. 播放音频（复用音乐播放器）
    if(typeof initMusic==='function') initMusic();
    if(typeof musicBarEl!=='undefined' && musicBarEl && musicAudio){
      showMusicBar(true);
      document.getElementById('mbTitle').textContent='AI 创作歌曲';
      document.getElementById('mbArtist').textContent=style;
      musicAudio.src=audioUrl;
      musicAudio.play().catch(()=>showToast('点屏幕后播放'));
    }else{
      const a=new Audio(audioUrl);
      a.play().catch(()=>{});
    }

    // 5. 在聊天界面中显示歌词并提供下载链接
    closeSongCraft();
    addMessage('assistant','🎵 我们的原创歌曲完成啦！歌词：\n\n'+lyrics,genUid());
    const dlA=document.createElement('a');
    dlA.href=audioUrl;
    dlA.download='AI原创歌曲.mp3';
    dlA.textContent='⬇️ 下载歌曲';
    dlA.style.cssText='display:inline-block;margin:6px 0;color:#8F7A6B;';
    const lastBubble=document.querySelector('.chat-messages').lastElementChild?.querySelector('.bubble');
    if(lastBubble) lastBubble.appendChild(dlA);
    showToast('✅ 生成完成');
  }catch(e){
    showToast('生成失败：'+e.message);
    addMessage('assistant','❌ 旋律生成失败：'+e.message+'\n\n歌词已保留：\n'+lyrics,genUid());
  }finally{
    if(btn){btn.disabled=false;btn.textContent='🎼 生成旋律';}
  }
}

function songInstruction(){if(!songEnabled())return'';return '\n【歌曲创作能力】用户想创作歌曲时，你可以帮忙写歌词、改词、定曲风。写好后提示用户点击「＋ → 创作歌曲」用 AI 作曲。';}

/* 设置页 */
function renderSongSettings(){settingsMode='song';document.getElementById('detailTitle').innerHTML='🎼 歌曲创作';const proxy=localStorage.getItem('song_proxy')||'';const key=localStorage.getItem('song_key')||'';const model=songModel();document.getElementById('detailBody').innerHTML=`
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🎼 启用歌曲创作</div><div class="switch-desc">默认关闭</div></div><label class="switch"><input type="checkbox" id="songEnableChk" ${songEnabled()?'checked':''} onchange="setBool('song_enabled',this.checked);var sb=document.getElementById('songMenuBtn');if(sb)sb.style.display=this.checked?'block':'none';"><span class="switch-slider"></span></label></div>
    <div class="form-group" style="margin-top:8px;"><label class="form-label">音乐生成代理地址</label><input type="text" class="form-input" id="songProxy" value="${proxy}" placeholder="https://你的项目.vercel.app/api/music-gen"><div class="form-hint">MiniMax 需服务端鉴权，前端无法直连。请部署代理转发到 MiniMax Music，接收 {model,lyrics,style,key}，返回 {audio_url}。留空则只写词不出曲。</div></div>
    <div class="form-group"><label class="form-label">MiniMax API Key（转发给代理）</label><div class="input-with-btn"><input type="password" class="form-input" id="songKey" value="${key}"><button onclick="togglePwd('songKey')">👁️</button></div></div>
    <div class="form-group"><label class="form-label">模型</label><input type="text" class="form-input" id="songModel" value="${model}" placeholder="music-01 / MiniMax Music 2.6"></div>
    <div class="form-hint" style="line-height:1.7;">用法：聊天里让 AI 写词，或点「＋ → 🎼 创作歌曲」打开创作台，写词后一键生成旋律，用底部播放器播放。</div>`;
}
