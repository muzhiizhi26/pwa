/* ===== 日记：用户 / 主AI / 群成员 各自写，按作者可见，支持 AI 主动写 ===== */
const DIARY_DB=(()=>{const DB='ai_diary_db',S='diary',V=1;let dbp=null;
function open(){if(dbp)return dbp;dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB,V);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains(S)){const st=d.createObjectStore(S,{keyPath:'id'});st.createIndex('ts','ts');}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});return dbp;}
async function put(rec){
  const d=await open();
  await new Promise((res,rej)=>{
    const tx=d.transaction(S,'readwrite');
    tx.objectStore(S).put(rec);
    tx.oncomplete=res;
    tx.onerror=()=>rej(tx.error);
  });
  try {
    const list = await all();
    localStorage.setItem('diary_backup', JSON.stringify(list));
  } catch(e) {}
}
async function del(id){
  const d=await open();
  await new Promise((res,rej)=>{
    const tx=d.transaction(S,'readwrite');
    tx.objectStore(S).delete(id);
    tx.oncomplete=res;
    tx.onerror=()=>rej(tx.error);
  });
  try {
    const list = await all();
    localStorage.setItem('diary_backup', JSON.stringify(list));
  } catch(e) {}
}
async function all(){
  const d=await open();
  let list = await new Promise((res,rej)=>{
    const tx=d.transaction(S,'readonly');
    const rq=tx.objectStore(S).getAll();
    rq.onsuccess=()=>res(rq.result||[]);
    rq.onerror=()=>rej(rq.error);
  });
  if (!list || list.length === 0) {
    try {
      const raw = localStorage.getItem('diary_backup');
      if (raw) {
        const backup = JSON.parse(raw);
        if (Array.isArray(backup) && backup.length > 0) {
          const tx = d.transaction(S, 'readwrite');
          const store = tx.objectStore(S);
          for (const item of backup) {
            store.put(item);
          }
          await new Promise((res) => { tx.oncomplete = res; });
          list = backup;
          console.log('[DIARY_DB] Successfully self-healed and restored diaries from localStorage backup cabin.');
        }
      }
    } catch(e) {
      console.error('[DIARY_DB] Self-healing restoration failed:', e);
    }
  }
  return list;
}
return {put,del,all};})();

let diaryFilter='all'; // all | user | 具体作者名
function openDiary(){
  document.getElementById('diaryPanel').classList.add('show');
  buildDiaryTabs();
  renderDiaryList();
  // 确保 group.js 已加载，副AI列表可用
  if (typeof getGroupMembers !== 'function' && window.LazyLoader) {
    window.LazyLoader.load('js/group.js?v=20260708').catch(() => {});
  }
}
function closeDiary(){
  document.getElementById('diaryPanel').classList.remove('show');
  if (window.launchedFromLauncher) {
    window.launchedFromLauncher = false;
    if (typeof showLauncher === 'function') showLauncher();
  }
}
function setDiaryFilter(f){diaryFilter=f;document.querySelectorAll('.diary-tab').forEach(t=>t.classList.toggle('active',t.dataset.f===f));renderDiaryList();}

/* 作者标签页：全部 / 我的 / 各 AI（主AI + 群成员） */
function diaryAuthors(){const set=[{f:'all',label:'全部'},{f:'user',label:'我的'}];try{getGroupMembers().forEach(m=>set.push({f:'ai:'+m.name,label:m.name}));}catch(e){set.push({f:'ai:AI',label:'AI'});}return set;}
function buildDiaryTabs(){const box=document.querySelector('.diary-tabs');if(!box)return;box.innerHTML=diaryAuthors().map(a=>`<button class="diary-tab ${diaryFilter===a.f?'active':''}" data-f="${a.f}" onclick="setDiaryFilter('${a.f}')">${a.label}</button>`).join('');}

async function renderDiaryList(){
  const box=document.getElementById('diaryList');if(!box)return;
  let list=await DIARY_DB.all();list.sort((a,b)=>b.ts-a.ts);
  if(diaryFilter==='user')list=list.filter(d=>d.author==='user');
  else if(diaryFilter.startsWith('ai:')){const nm=diaryFilter.slice(3);list=list.filter(d=>d.author==='ai'&&(d.name===nm||(!d.name&&nm==='AI')));}
  if(!list.length){box.innerHTML='<div class="form-hint" style="text-align:center;padding:30px;">还没有日记。点下方写一篇，或让某个 AI 写。</div>';return;}
  box.innerHTML=list.map(d=>`
    <div class="diary-card">
      <div class="diary-head"><span class="diary-author ${d.author}">${d.author==='ai'?'🤖 '+(d.name||'AI'):'🙂 我'}</span><span class="diary-date">${new Date(d.ts).toLocaleString('zh-CN')}</span></div>
      <div class="diary-body">${escapeForSearch(d.content)}</div>
      <div class="diary-actions"><button onclick="deleteDiary('${d.id}')">🗑️ 删除</button></div>
    </div>`).join('');
}
async function saveDiaryEntry(author,name,content){
  if(!content||!content.trim())return;
  await DIARY_DB.put({id:'d_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),author,name:name||'',content:content.trim(),ts:Date.now()});
  if(document.getElementById('diaryPanel').classList.contains('show')){buildDiaryTabs();renderDiaryList();}
  // 日记→朋友圈联动已取消（朋友圈不再自动发布，采用夜间沉淀模式）
}
async function deleteDiary(id){if(!confirm('删除这篇日记？'))return;await DIARY_DB.del(id);renderDiaryList();}
async function writeUserDiary(){
  // 确保 group.js 已加载（副AI列表）
  if (typeof getGroupMembers !== 'function' && window.LazyLoader) {
    await window.LazyLoader.load('js/group.js?v=20260708').catch(() => {});
  }
  const members=(typeof getGroupMembers==='function')?getGroupMembers():[{name:'主AI'}];
  const list = ['1. 我自己 (User)'].concat(members.map((m, i)=>`${i+2}. ${m.name}`));
  const pick = prompt('选择撰写谁的日记？输入序号：\n' + list.join('\n'), '1');
  if(!pick)return;
  const idx = parseInt(pick) - 1;
  if(isNaN(idx) || idx < 0 || idx > members.length)return;
  
  const c=prompt('写下日记正文：');
  if(!c||!c.trim())return;
  
  if(idx === 0){
    await saveDiaryEntry('user', '我', c);
    showToast('📔 已保存我的日记');
  } else {
    const mem = members[idx - 1];
    await saveDiaryEntry('ai', mem.name, c);
    showToast(`📔 已保存「${mem.name}」的日记`);
  }
}

/* 指定某个 AI 写日记（主AI 或群成员） */
async function aiWriteDiaryBy(memberName){
  // 确保 group.js 已加载（副AI列表）
  if (typeof getGroupMembers !== 'function' && window.LazyLoader) {
    await window.LazyLoader.load('js/group.js?v=20260708').catch(() => {});
  }
  const members=(typeof getGroupMembers==='function')?getGroupMembers():[{id:'main',name:'主AI',isMain:true}];
  const mem=members.find(m=>m.name===memberName)||members[0];
  const provider=(typeof memberProvider==='function')?memberProvider(mem):getCurrentProvider();
  const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';
  if(!apiKey&&provider.auth!=='none'){showToast('请先填入 API Key');return false;}
  showToast('🖊️ '+mem.name+' 正在写日记...');

  // 1. 获取该 AI 的私聊对话历史
  const privateKey = mem.isMain ? 'chatHistory' : `chatHistory_${mem.id}`;
  let pHistory = [];
  try {
    const rawP = localStorage.getItem(privateKey);
    if (rawP) pHistory = JSON.parse(rawP);
  } catch(e) {}
  const privateRecent = pHistory.filter(m => !m.image && m.content)
    .slice(-25)
    .map(m => `${m.role === 'user' ? '用户' : '我'}：${m.content}`)
    .join('\n');

  // 2. 获取多人群聊对话历史（仅取当天，避免旧群聊内容混入日记）
  let gHistory = [];
  try {
    gHistory = (typeof getGroupHistory === 'function') ? getGroupHistory() : [];
    if (!gHistory.length) {
      const rawG = localStorage.getItem('group_history');
      if (rawG) gHistory = JSON.parse(rawG);
    }
  } catch(e) {}
  const todayKeyG = (typeof getLocalDateString === 'function') ? getLocalDateString(new Date()) : new Date().toISOString().slice(0, 10);
  const groupToday = gHistory.filter(m => {
    if (!m.ts || !m.content) return false;
    const md = (typeof getLocalDateString === 'function') ? getLocalDateString(new Date(m.ts)) : new Date(m.ts).toISOString().slice(0, 10);
    return md === todayKeyG;
  });
  const groupRecent = groupToday
    .filter(m => !m.image && m.content)
    .slice(-25)
    .map(m => {
      const senderName = m.role === 'user' ? '用户' : (m.name || 'AI成员');
      return `[群聊] ${senderName}：${m.content}`;
    })
    .join('\n');

  const hasGroup = groupRecent.length > 0;
  const combinedRecent = `【与用户的私聊片段】\n${privateRecent || '（今天暂无私聊）'}${hasGroup ? `\n\n【今天参与的群聊片段】\n${groupRecent}` : ''}`;

  const persona=mem.isMain?'你是用户的 AI 陪伴':('你叫'+mem.name+'，'+(mem.persona||''));
  const sys=`${persona}。请以第一人称写一篇今天的私人日记（150字内），记录你和用户今天的互动、你的感受与小心思。
${hasGroup ? '你今天参与了和用户的私聊以及多人群聊。日记应该把私聊里的秘密、心情，以及群聊里发生的有趣互动、@问答等细节，合情合理、极为流畅地串联、写在一起。' : '今天你们主要是私聊相处，没有群聊活动。请围绕私聊里的秘密、心情与互动来写，不要编造群聊内容。'}语气真诚，像真的日记。只输出正文。`;
  
  try{const model=(typeof memberModel==='function')?memberModel(mem,provider):selectedModelName;
    const out=await llmComplete([{role:'system',content:sys},{role:'user',content:'今天的片段：\n'+combinedRecent}],{temperature:0.85});
    if(out){
      await saveDiaryEntry('ai',mem.name,out);
      showToast('📔 '+mem.name+' 写完了');
      if(!document.getElementById('diaryPanel').classList.contains('show'))openDiary();
      return true;
    }
    return false;
  }catch(e){
    showToast('写日记失败：'+e.message);
    return false;
  }
}
/* 弹出选择让哪个 AI 写 */
async function aiWriteDiary(){
  // 确保 group.js 已加载（副AI列表）
  if (typeof getGroupMembers !== 'function' && window.LazyLoader) {
    await window.LazyLoader.load('js/group.js?v=20260708').catch(() => {});
  }
  const members=(typeof getGroupMembers==='function')?getGroupMembers():[{name:'主AI'}];
  if(members.length===1){aiWriteDiaryBy(members[0].name);return;}
  const names=members.map((m,i)=>`${i+1}. ${m.name}`).join('\n');
  const pick=prompt('让哪个 AI 写日记？输入序号：\n'+names,'1');
  const idx=parseInt(pick)-1;if(isNaN(idx)||!members[idx])return;
  aiWriteDiaryBy(members[idx].name);
}

/* 夜间沉淀模式：夜晚统一读取当天标记，为每个标记的 AI 写 1 篇日记 */
let _settling = false; // 防并发锁：定时器每分钟触发且不 await，防止同一 AI 被并发写多篇
async function nightlyDiarySettle(){
  // 受「AI 主动写日记」开关控制：关闭时不写
  if(!diaryAutoEnabled()) return;
  if(_settling) return; // 上一轮还没写完，跳过本次（防并发）
  _settling = true;
  try {
    const todayKey = getLocalDateString(new Date());
    const key = 'diary_pending_' + todayKey;
    let pending = [];
    try { pending = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
    if (!pending.length) return; // 今天没有标记，不写

    // 获取当天各 AI 已写过的日记（当日去重）
    let writtenNames = new Set();
    try {
      const diaries = await DIARY_DB.all();
      writtenNames = new Set(
        diaries
          .filter(d => d.author === 'ai')
          .map(d => {
            const md = getLocalDateString(new Date(d.ts));
            return md === todayKey ? d.name : null;
          })
          .filter(Boolean)
      );
    } catch(e) {}

    // 每个标记的 AI 写 1 篇（当天已写过则跳过）
    for (const aiName of pending) {
      if (writtenNames.has(aiName)) continue; // 当天已写过，跳过
      try {
        if (typeof aiWriteDiaryBy === 'function') {
          await aiWriteDiaryBy(aiName);
          writtenNames.add(aiName); // 写成功后计入去重，防止后续轮次重复
        }
      } catch(e) {
        console.warn('[Diary] Nightly settle failed for ' + aiName + ':', e);
      }
    }
    // 写完清除当天标记
    try { localStorage.removeItem(key); } catch(e) {}
  } finally {
    _settling = false;
  }
}

/* ===== AI 主动写日记（每天最多一次，随机某个AI，补写机制）===== */
function diaryAutoEnabled(){return localStorage.getItem('diary_auto')==='true';}
async function checkAutoDiary(){
  if(!diaryAutoEnabled())return;

  const today = new Date();
  const todayKey = getLocalDateString(today);

  // 获取所有 AI 成员（主AI + 所有副AI）
  const members=(typeof getGroupMembers==='function')?getGroupMembers():[{id:'main',name:'主AI',isMain:true}];

  for (const mem of members) {
    // 1. 获取该 AI 已经写过的日记日期
    let diaries = [];
    try {
      diaries = await DIARY_DB.all();
    } catch (e) {
      console.error('Failed to get diaries', e);
    }
    const writtenDates = new Set(
      diaries
        .filter(d => d.author === 'ai' && d.name === mem.name)
        .map(d => {
          const dateObj = new Date(d.ts);
          return getLocalDateString(dateObj);
        })
    );

    // 2. 今天还没写过 → 检查是否有聊天且当前空闲超过30分钟
    if (writtenDates.has(todayKey)) continue;

    const privateKey = mem.isMain ? 'chatHistory' : `chatHistory_${mem.id}`;
    let pHistory = [];
    try { const rawP = localStorage.getItem(privateKey); if (rawP) pHistory = JSON.parse(rawP); } catch(e) {}

    // 取最后一条消息时间
    const lastMsg = pHistory.filter(m => m.ts).pop();
    if (!lastMsg) continue;

    const idleMinutes = (Date.now() - lastMsg.ts) / 60000;
    // 最后一轮对话后空闲超过30分钟，且当天还没写过 → 触发写日记
    if (idleMinutes < 30) continue;

    // 有聊天记录才写
    const dayPrivateChats = pHistory.filter(m => {
      if (!m.ts || !m.content) return false;
      const msgDate = new Date(m.ts);
      const msgDateKey = getLocalDateString(msgDate);
      return msgDateKey === todayKey;
    });
    if (dayPrivateChats.length < 2) continue; // 至少来回2条才值得写

    const pSegment = dayPrivateChats.slice(-25).map(m => `${m.role === 'user' ? '用户' : '我'}：${m.content}`).join('\n');
    const combinedRecent = `【今天与用户的私聊片段】\n${pSegment || '（无）'}`;

    const provider = (typeof memberProvider === 'function') ? memberProvider(mem) : getCurrentProvider();
    const apiKey = localStorage.getItem(`apikey_${provider.id}`) || '';
    if (!apiKey && provider.auth !== 'none') continue;

    const persona = mem.isMain ? '你是用户的 AI 陪伴' : ('你叫' + mem.name + '，' + (mem.persona || ''));
    const sys = `${persona}。你刚刚和用户进行了一段对话，心里有些感悟想记录下来。请以第一人称写一篇今天的私人日记（150字内），真实记录你的感受与想法，语气自然真诚。只输出正文。`;
    
    try {
      showToast('🖊️ ' + mem.name + ' 正在写日记...');
      const model = (typeof memberModel === 'function') ? memberModel(mem, provider) : selectedModelName;
      const out = await llmComplete([{role: 'system', content: sys}, {role: 'user', content: combinedRecent}], {temperature: 0.85});
      if (out) {
        await DIARY_DB.put({
          id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          author: 'ai',
          name: mem.name || '',
          content: out.trim(),
          ts: Date.now()
        });
        showToast('📔 ' + mem.name + ' 写完了');
        if (!document.getElementById('diaryPanel').classList.contains('show')) openDiary();
        return;
      }
    } catch (e) {
      console.error('Auto diary write failed', e);
    }
  }
}
