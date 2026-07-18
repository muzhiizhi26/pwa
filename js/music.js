/* ===== 在线音乐（网易云，多源回退）===== */
function musicEnabled(){return localStorage.getItem('music_enabled')==='true';}
function musicApiBase(){return (localStorage.getItem('music_api_base')||'').replace(/\/+$/,'');}
function musicAudioProxy(){return (localStorage.getItem('music_audio_proxy')||'').replace(/\/+$/,'');}
function musicCookieParam(){const u=(localStorage.getItem('music_u')||'').trim();return u?`&cookie=${encodeURIComponent('MUSIC_U='+u)}`:'';}
function musicLevel(){return localStorage.getItem('music_level')||'exhigh';}
function musicOuterUrl(id){return `https://music.163.com/song/media/outer/url?id=${id}.mp3`;}

let musicPlaylist=[],musicIndex=-1,musicAudio=null,musicBarEl=null;

function initMusic(){
  if(musicBarEl)return;
  const bar=document.createElement('div');
  bar.id='musicBar';bar.className='music-bar';
  bar.innerHTML=`
    <button class="mb-btn" id="mbPrev" title="上一首">⏮</button>
    <button class="mb-btn" id="mbPlay" title="播放/暂停">▶️</button>
    <button class="mb-btn" id="mbNext" title="下一首">⏭</button>
    <div class="mb-info"><div class="mb-title" id="mbTitle">未播放</div><div class="mb-artist" id="mbArtist"></div></div>
    <button class="mb-btn" id="mbClose" title="关闭">✕</button>`;
  const wrap=document.querySelector('.input-wrapper');
  wrap.parentNode.insertBefore(bar,wrap);
  musicBarEl=bar;
  musicAudio=new Audio();musicAudio.setAttribute('playsinline','');musicAudio.preload='auto';
  musicAudio.onended=()=>musicNext();
  musicAudio.onplaying=()=>{document.getElementById('mbPlay').textContent='⏸';};
  musicAudio.onpause=()=>{document.getElementById('mbPlay').textContent='▶️';};
  document.getElementById('mbPrev').onclick=musicPrev;
  document.getElementById('mbNext').onclick=musicNext;
  document.getElementById('mbClose').onclick=musicStop;
  document.getElementById('mbPlay').onclick=()=>{if(musicAudio.paused)musicAudio.play().catch(()=>{});else musicAudio.pause();};
}
function showMusicBar(show){if(musicBarEl)musicBarEl.classList.toggle('show',!!show);}

async function musicSearch(keyword){
  const base=musicApiBase();
  if(!base)throw new Error('未配置搜索 API 地址');
  const url=`${base}/cloudsearch?keywords=${encodeURIComponent(keyword)}&limit=8${musicCookieParam()}`;
  const r=await fetch(url);if(!r.ok)throw new Error('搜索失败 '+r.status);
  const d=await r.json();
  // 兼容本地后端 {songs: [...]} 和网易原始 {result:{songs:[...]}}
  const songs = d.songs || (d.result && d.result.songs) || [];
  return songs.map(s=>({id:s.id,name:s.name,artist:s.artist||(s.artists||s.ar||[]).map(a=>a.name).join('/')}));
}
async function musicApiUrl(id){
  const base=musicApiBase();if(!base)return null;
  try{
    const url=`${base}/song/url/v1?id=${id}&level=${musicLevel()}${musicCookieParam()}`;
    const r=await fetch(url);if(!r.ok)return null;
    const d=await r.json();
    // 兼容本地后端 {url: "..."} 和网易原始 {data:[{url:...}]}
    let u = d.url || (d.data?.[0]?.url) || null;
    if(!u)return null;
    return u.replace(/^http:/,'https:');
  }catch(e){return null;}
}

/* 候选播放源：API直链 → 音频代理 → 外链兜底 */
async function musicResolveSources(id){
  const list=[];
  const apiU=await musicApiUrl(id);if(apiU)list.push(apiU);
  const proxy=musicAudioProxy();if(proxy)list.push(`${proxy}?id=${id}`);
  list.push(musicOuterUrl(id));
  return [...new Set(list)];
}
function playWithFallback(sources,i,song){
  if(i>=sources.length){showToast('无法播放（可能无版权）：'+song.name);setTimeout(musicNext,600);return;}
  musicAudio.onerror=()=>playWithFallback(sources,i+1,song);
  try{musicAudio.src=sources[i];const p=musicAudio.play();if(p&&p.catch)p.catch(()=>playWithFallback(sources,i+1,song));}
  catch(e){playWithFallback(sources,i+1,song);}
}
async function musicPlayCurrent(){
  const s=musicPlaylist[musicIndex];if(!s)return;
  showMusicBar(true);
  document.getElementById('mbTitle').textContent=s.name;
  document.getElementById('mbArtist').textContent=s.artist||'';
  showToast('▶️ '+s.name);
  const sources=await musicResolveSources(s.id);
  playWithFallback(sources,0,s);
}
function musicNext(){if(musicIndex<musicPlaylist.length-1){musicIndex++;musicPlayCurrent();}else musicAudio&&musicAudio.pause();}
function musicPrev(){if(musicIndex>0){musicIndex--;musicPlayCurrent();}}
function musicStop(){if(musicAudio){musicAudio.pause();musicAudio.removeAttribute('src');musicAudio.load();}showMusicBar(false);}

async function playBySearch(keyword){
  if(!musicEnabled()){showToast('🎵 音乐功能未开启');return;}
  if(!musicApiBase()){showToast('未配置搜索 API，无法按名字点歌');return;}
  showToast('🔎 搜索：'+keyword);
  try{const list=await musicSearch(keyword);if(!list.length){showToast('未找到歌曲');return;}musicPlaylist=list;musicIndex=0;await musicPlayCurrent();}
  catch(e){showToast('点歌失败：'+e.message);}
}
async function musicPlayById(id,name,artist){
  if(!musicEnabled()){showToast('🎵 音乐功能未开启');return;}
  musicPlaylist=[{id,name:name||('歌曲'+id),artist:artist||''}];musicIndex=0;await musicPlayCurrent();
}

/* 用户指令：点歌 xxx / 播放 xxx / 点歌id:数字 */
function handleMusicCommand(text){
  const idm=text.match(/^\s*(?:点歌|播放)\s*id\s*[:：]?\s*(\d{3,})\s*$/i);
  if(idm){musicPlayById(idm[1]);return true;}
  const m=text.match(/^\s*(?:点歌|播放|来首|来一首|放一首|放首)\s*[:：]?\s*(.+)$/);
  if(!m)return false;const q=m[1].trim();if(!q)return false;playBySearch(q);return true;
}

/* AI 用标记推荐歌曲 */
function musicInstruction(){if(!musicEnabled())return'';return '\n【音乐能力】你可为用户点歌/推荐。想让用户直接播放时，在该句结尾附标记 [[music:歌名|歌手]]，若确知网易云歌曲ID可用 [[musicid:ID|歌名]]。除标记外正常口语表达，不要解释标记本身。';}
function stripMusicTags(content){if(content==null)return content;return String(content).replace(/\[\[music(?:id)?:[^\]]+\]\]/g,'').replace(/[ \t]+\n/g,'\n').trim();}
function decorateMusic(bubblesEl,rawContent){
  if(!musicEnabled()||!bubblesEl||!rawContent)return;
  const tags=[...String(rawContent).matchAll(/\[\[music(id)?:([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
  if(!tags.length)return;
  const box=document.createElement('div');box.className='music-chips';
  tags.forEach(t=>{
    const isId=!!t[1];const a=(t[2]||'').trim(),b=(t[3]||'').trim();
    const chip=document.createElement('button');chip.className='music-chip';
    if(isId){chip.textContent='▶ '+(b||('ID'+a));chip.onclick=()=>musicPlayById(a,b);}
    else{chip.textContent='▶ '+a+(b?' - '+b:'');chip.onclick=()=>playBySearch(b?`${a} ${b}`:a);}
    box.appendChild(chip);
  });
  bubblesEl.parentNode.appendChild(box);
}

/* 设置页 */
function renderMusicSettings(){settingsMode='music';document.getElementById('detailTitle').innerHTML='🎵 在线音乐';
  const api=localStorage.getItem('music_api_base')||'';const proxy=localStorage.getItem('music_audio_proxy')||'';const u=localStorage.getItem('music_u')||'';const lvl=musicLevel();
  document.getElementById('detailBody').innerHTML=`
    <div class="switch-row"><div class="switch-info"><div class="switch-label">🎵 启用在线音乐</div><div class="switch-desc">默认关闭</div></div><label class="switch"><input type="checkbox" ${musicEnabled()?'checked':''} onchange="setBool('music_enabled',this.checked)"><span class="switch-slider"></span></label></div>
    <div class="form-group" style="margin-top:8px;"><label class="form-label">🔊 音频代理地址（强烈建议）</label><input type="text" class="form-input" id="musicAudioProxy" value="${proxy}" placeholder="https://你的项目.vercel.app/api/song"><div class="form-hint">解决 https 混合内容/防盗链/直链过期。填 Vercel Edge 音频代理地址，末尾不带 ?id。</div></div>
    <div class="form-group"><label class="form-label">🔎 搜索/VIP API 地址</label><input type="text" class="form-input" id="musicApiBase" value="${api}" placeholder="https://你的NeteaseApi.vercel.app"><div class="form-hint">按歌名点歌与 VIP 直链需要。留空则只能用「点歌id:数字」或 AI 带ID推荐。</div></div>
    <div class="form-group"><label class="form-label">MUSIC_U Cookie（VIP，可选）</label><div class="input-with-btn"><input type="password" class="form-input" id="musicU" value="${u}"><button onclick="togglePwd('musicU')">👁️</button></div></div>
    <div class="form-group"><label class="form-label">音质</label><select class="form-input" id="musicLevel"><option value="standard" ${lvl==='standard'?'selected':''}>标准</option><option value="higher" ${lvl==='higher'?'selected':''}>较高</option><option value="exhigh" ${lvl==='exhigh'?'selected':''}>极高</option><option value="lossless" ${lvl==='lossless'?'selected':''}>无损(VIP)</option><option value="hires" ${lvl==='hires'?'selected':''}>Hi-Res(VIP)</option></select></div>
    <div class="action-buttons"><button class="btn btn-info" onclick="playBySearch('周杰伦 晴天')">▶️ 测试点歌(需搜索API)</button><button class="btn btn-info" onclick="musicPlayById('1868553','测试外链')">▶️ 测试ID直链</button></div>
    <div class="form-hint" style="margin-top:8px;line-height:1.7;">用法：聊天输入「点歌 歌名」或「点歌id:1868553」；AI 推荐会带 ▶ 播放按钮。</div>`;
}

// 自动初始化
try {
  initMusic();
} catch(e) {
  console.error('[Music] Auto-init failed:', e);
}
