/* ===== 日记：用户 / 主AI / 群成员 各自写，按作者可见，支持 AI 主动写 ===== */
const DIARY_DB=(()=>{const DB='ai_diary_db',S='diary',V=1;let dbp=null;
function open(){if(dbp)return dbp;dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB,V);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains(S)){const st=d.createObjectStore(S,{keyPath:'id'});st.createIndex('ts','ts');}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});return dbp;}
async function put(rec){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction(S,'readwrite');tx.objectStore(S).put(rec);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function del(id){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction(S,'readwrite');tx.objectStore(S).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function all(){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction(S,'readonly');const rq=tx.objectStore(S).getAll();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);});}
return {put,del,all};})();

let diaryFilter='all'; // all | user | 具体作者名
function openDiary(){document.getElementById('diaryPanel').classList.add('show');buildDiaryTabs();renderDiaryList();}
function closeDiary(){document.getElementById('diaryPanel').classList.remove('show');}
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
async function saveDiaryEntry(author,name,content){if(!content||!content.trim())return;await DIARY_DB.put({id:'d_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),author,name:name||'',content:content.trim(),ts:Date.now()});if(document.getElementById('diaryPanel').classList.contains('show')){buildDiaryTabs();renderDiaryList();}}
async function deleteDiary(id){if(!confirm('删除这篇日记？'))return;await DIARY_DB.del(id);renderDiaryList();}
async function writeUserDiary(){
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
  const members=(typeof getGroupMembers==='function')?getGroupMembers():[{id:'main',name:'主AI',isMain:true}];
  const mem=members.find(m=>m.name===memberName)||members[0];
  const provider=(typeof memberProvider==='function')?memberProvider(mem):getCurrentProvider();
  const apiKey=localStorage.getItem(`apikey_${provider.id}`)||'';
  if(!apiKey&&provider.auth!=='none'){showToast('请先填入 API Key');return false;}
  showToast('🖊️ '+mem.name+' 正在写日记...');
  const recent=conversationHistory.filter(m=>!m.image&&m.content).slice(-30).map(m=>`${m.role==='user'?'用户':'我'}：${m.content}`).join('\n').slice(-3500);
  const persona=mem.isMain?'你是用户的 AI 陪伴':('你叫'+mem.name+'，'+(mem.persona||''));
  const sys=`${persona}。请以第一人称写一篇今天的私人日记（150字内），记录你和用户今天的互动、你的感受与小心思，语气真诚，像真的日记。只输出正文。`;
  try{const model=(typeof memberModel==='function')?memberModel(mem,provider):selectedModelName;
    const out=await llmComplete([{role:'system',content:sys},{role:'user',content:'今天的片段：\n'+recent}],{temperature:0.85});
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
function aiWriteDiary(){
  const members=(typeof getGroupMembers==='function')?getGroupMembers():[{name:'主AI'}];
  if(members.length===1){aiWriteDiaryBy(members[0].name);return;}
  const names=members.map((m,i)=>`${i+1}. ${m.name}`).join('\n');
  const pick=prompt('让哪个 AI 写日记？输入序号：\n'+names,'1');
  const idx=parseInt(pick)-1;if(isNaN(idx)||!members[idx])return;
  aiWriteDiaryBy(members[idx].name);
}

/* ===== AI 主动写日记（每天最多一次，随机某个AI，补写机制）===== */
function diaryAutoEnabled(){return localStorage.getItem('diary_auto')==='true';}
async function checkAutoDiary(){
  if(!diaryAutoEnabled())return;
  
  const today = new Date();
  const todayKey = (typeof getLocalDateString === 'function') ? getLocalDateString(today) : today.toISOString().slice(0, 10);
  const h = today.getHours();
  
  // 1. 获取所有已经写过的 AI 日记，做精确的排重
  let diaries = [];
  try {
    diaries = await DIARY_DB.all();
  } catch (e) {
    console.error('Failed to get diaries', e);
  }
  const writtenDates = new Set(
    diaries
      .filter(d => d.author === 'ai')
      .map(d => {
        const dateObj = new Date(d.ts);
        return (typeof getLocalDateString === 'function') ? getLocalDateString(dateObj) : dateObj.toISOString().slice(0, 10);
      })
  );

  // 2. 检查过去 3 天内（包括今天，如果今天已过18点），是否存在聊天过、但是没有 AI 日记的日期
  for (let i = 0; i < 3; i++) {
    const targetDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const targetKey = (typeof getLocalDateString === 'function') ? getLocalDateString(targetDate) : targetDate.toISOString().slice(0, 10);
    
    // 如果是今天，但还没到 18 点，说明还没到写今天日记的时间，先跳过
    if (i === 0 && h < 18) {
      continue;
    }
    
    // 如果这一天已经写过了，跳过
    if (writtenDates.has(targetKey)) {
      continue;
    }
    
    // 检查这一天是否有过对话 (用户消息或 AI 消息)
    const hasChatOnTargetDate = conversationHistory.some(m => {
      if (!m.ts) return false;
      const msgDate = new Date(m.ts);
      const msgDateKey = (typeof getLocalDateString === 'function') ? getLocalDateString(msgDate) : msgDate.toISOString().slice(0, 10);
      return msgDateKey === targetKey;
    });
    
    if (!hasChatOnTargetDate) {
      continue;
    }
    
    // 找到了一个符合条件的未写日记的日子：targetKey！
    const members = (typeof getGroupMembers === 'function') ? getGroupMembers() : [{name: '主AI'}];
    const mem = members[Math.floor(Math.random() * members.length)];
    
    // 提取当天的聊天记录
    const dayChats = conversationHistory.filter(m => {
      if (!m.ts || m.image || !m.content) return false;
      const msgDate = new Date(m.ts);
      const msgDateKey = (typeof getLocalDateString === 'function') ? getLocalDateString(msgDate) : msgDate.toISOString().slice(0, 10);
      return msgDateKey === targetKey;
    });
    
    const sliceMsgs = dayChats.length > 0 ? dayChats : conversationHistory.filter(m => !m.image && m.content);
    const recent = sliceMsgs.slice(-30).map(m => `${m.role === 'user' ? '用户' : '我'}：${m.content}`).join('\n').slice(-3500);
    
    const provider = (typeof memberProvider === 'function') ? memberProvider(mem) : getCurrentProvider();
    const apiKey = localStorage.getItem(`apikey_${provider.id}`) || '';
    if (!apiKey && provider.auth !== 'none') {
      continue; // 尝试下一个可能的可写天
    }
    
    const persona = mem.isMain ? '你是用户的 AI 陪伴' : ('你叫' + mem.name + '，' + (mem.persona || ''));
    const dateDesc = i === 0 ? '今天' : (i === 1 ? '昨天' : '前天');
    const sys = `${persona}\n请基于${dateDesc}（日期是 ${targetKey}）你和用户的对话片段，以自己的视角和口吻（第一人称）写一篇${dateDesc}的日记。日记应该真实流露情感、包含聊天里的细节/感悟、你的心理活动。直接输出日记内容即可，不要有任何 Markdown 包裹以外的废话。`;
    
    try {
      showToast('🖊️ ' + mem.name + ' 正在写日记...');
      const model = (typeof memberModel === 'function') ? memberModel(mem, provider) : selectedModelName;
      const out = await llmComplete([{role: 'system', content: sys}, {role: 'user', content: `【${targetKey}的对话片段】\n` + recent}], {temperature: 0.85});
      if (out) {
        // 设置时间戳为那天的晚上 23:59:59
        const targetTs = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59).getTime();
        await DIARY_DB.put({
          id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          author: 'ai',
          name: mem.name || '',
          content: out.trim(),
          ts: targetTs
        });
        showToast('📔 ' + mem.name + ' 写完了 (' + dateDesc + ')');
        if (!document.getElementById('diaryPanel').classList.contains('show')) openDiary();
        return; // 每次检测最多自动补写一篇，防止并发调用
      }
    } catch (e) {
      console.error('Auto diary write failed', e);
    }
  }
}
