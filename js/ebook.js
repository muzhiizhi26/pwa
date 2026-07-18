/* ===== 阅读模块：书架 / 翻页 / 进度 / 划线笔记 / 与聊天互通 ===== */
const EBOOK_DB=(()=>{const DB='ai_ebook_db',S='books',N='notes',V=1;let dbp=null;
function open(){if(dbp)return dbp;dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB,V);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains(S))d.createObjectStore(S,{keyPath:'id'});if(!d.objectStoreNames.contains(N)){const st=d.createObjectStore(N,{keyPath:'id'});st.createIndex('book','bookId');}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});return dbp;}
async function putBook(b){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction('books','readwrite');tx.objectStore('books').put(b);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function getBook(id){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction('books','readonly');const rq=tx.objectStore('books').get(id);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error);});}
async function allBooks(){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction('books','readonly');const rq=tx.objectStore('books').getAll();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);});}
async function delBook(id){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction('books','readwrite');tx.objectStore('books').delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function putNote(n){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction('notes','readwrite');tx.objectStore('notes').put(n);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function notesOf(bookId){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction('notes','readonly');const rq=tx.objectStore('notes').index('book').getAll(bookId);rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);});}
async function delNote(id){const d=await open();return new Promise((res,rej)=>{const tx=d.transaction('notes','readwrite');tx.objectStore('notes').delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
return {putBook,getBook,allBooks,delBook,putNote,notesOf,delNote};})();

let curBook=null; // {id,title,chapters:[{title,body}],idx}
let ebookView='shelf'; // shelf | reader | notes

function openEbook(){document.getElementById('ebookPanel').classList.add('show');showShelf();}
function closeEbook(){document.getElementById('ebookPanel').classList.remove('show');}
function triggerEbookFile(){document.getElementById('ebookFileInput').click();}

/* ---- 导入 TXT ---- */
function handleEbookFile(input){
  const f=input.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=async e=>{
    const chapters=splitChapters(e.target.result);
    const book={id:'bk_'+Date.now(),title:f.name.replace(/\.txt$/i,''),chapters,idx:0,addedAt:Date.now()};
    await EBOOK_DB.putBook(book);
    showToast(`📖 已加入书架《${book.title}》${chapters.length}章`);
    showShelf();
  };
  r.readAsText(f,'UTF-8');input.value='';
}
function splitChapters(text){
  const norm=text.replace(/\r\n/g,'\n');
  const re=/(第[0-9零一二三四五六七八九十百千万]+[章回节卷篇][^\n]{0,30})/g;
  const idxs=[];let m;while((m=re.exec(norm))){idxs.push({title:m[1].trim(),pos:m.index});}
  if(idxs.length>=2){const chs=[];for(let i=0;i<idxs.length;i++){const s=idxs[i].pos,en=i+1<idxs.length?idxs[i+1].pos:norm.length;chs.push({title:idxs[i].title,body:norm.slice(s,en).trim()});}return chs;}
  const size=2800;const chs=[];for(let i=0;i<norm.length;i+=size)chs.push({title:'片段 '+(chs.length+1),body:norm.slice(i,i+size).trim()});
  return chs.length?chs:[{title:'全文',body:norm}];
}

/* ---- 书架 ---- */
async function showShelf(){
  ebookView='shelf';
  const books=await EBOOK_DB.allBooks();books.sort((a,b)=>b.addedAt-a.addedAt);
  document.getElementById('ebookTitle').textContent='📚 书架';
  const body=document.getElementById('ebookBody');
  if(!books.length){body.innerHTML='<div class="form-hint" style="text-align:center;padding:40px;">书架空空的。点下方「📂 导入 TXT」添加电子书。</div>';}
  else{body.innerHTML='<div class="shelf-grid">'+books.map(b=>{const prog=Math.round(((b.idx+1)/b.chapters.length)*100);return `<div class="shelf-item" onclick="openBook('${b.id}')"><div class="shelf-cover">📖</div><div class="shelf-name">${b.title}</div><div class="shelf-prog">${prog}% · ${b.chapters.length}章</div><button class="shelf-del" onclick="event.stopPropagation();removeBook('${b.id}')">✕</button></div>`;}).join('')+'</div>';}
  document.getElementById('ebookFoot').innerHTML=`<button class="footer-btn footer-btn-primary" style="flex:1;" onclick="triggerEbookFile()">📂 导入 TXT</button>`;
}
async function removeBook(id){if(!confirm('从书架删除这本书？'))return;await EBOOK_DB.delBook(id);showShelf();}

/* ---- 阅读 ---- */
async function openBook(id){
  curBook=await EBOOK_DB.getBook(id);if(!curBook)return;
  renderReader();
}
function renderReader(){
  ebookView='reader';
  const ch=curBook.chapters[curBook.idx];
  document.getElementById('ebookTitle').textContent=`${curBook.title} · ${ch.title}`;
  document.getElementById('ebookBody').innerHTML=`<div class="ebook-content" id="ebookContent">${escapeForSearch(ch.body)}</div>`;
  document.getElementById('ebookFoot').innerHTML=`
    <button class="footer-btn footer-btn-secondary" onclick="ebookPrev()">◀</button>
    <span class="memo-status" style="flex:1;text-align:center;">${curBook.idx+1}/${curBook.chapters.length}</span>
    <button class="footer-btn footer-btn-secondary" onclick="ebookNext()">▶</button>
    <button class="footer-btn footer-btn-secondary" onclick="ebookChapterList()">☰目录</button>
    <button class="footer-btn footer-btn-secondary" onclick="showNotes()">📝笔记</button>
    <button class="footer-btn footer-btn-primary" onclick="ebookAsk()">🤖问AI</button>`;
  document.getElementById('ebookBody').scrollTop=0;
  bindEbookSelection();
  persistProgress();
}
function ebookPrev(){if(curBook&&curBook.idx>0){curBook.idx--;renderReader();}}
function ebookNext(){if(curBook&&curBook.idx<curBook.chapters.length-1){curBook.idx++;renderReader();}}
function persistProgress(){if(curBook)EBOOK_DB.putBook(curBook);}
function ebookChapterList(){
  const html='<div class="chapter-list">'+curBook.chapters.map((c,i)=>`<div class="chapter-item ${i===curBook.idx?'cur':''}" onclick="gotoChapter(${i})">${i+1}. ${c.title}</div>`).join('')+'</div>';
  document.getElementById('ebookBody').innerHTML=html;
  document.getElementById('ebookTitle').textContent=curBook.title+' · 目录';
}
function gotoChapter(i){curBook.idx=i;renderReader();}

/* ---- 划线选段 → 记笔记 / 发给聊天 ---- */
let _selText='';
function bindEbookSelection(){
  const c=document.getElementById('ebookContent');if(!c)return;
  const handler=()=>{const s=window.getSelection().toString().trim();if(s){_selText=s;showSelBar();}};
  c.onmouseup=handler;c.ontouchend=handler;
}
function showSelBar(){
  let bar=document.getElementById('ebookSelBar');
  if(!bar){bar=document.createElement('div');bar.id='ebookSelBar';bar.className='ebook-selbar';document.getElementById('ebookPanel').querySelector('.memo-container').appendChild(bar);}
  bar.innerHTML=`<button onclick="noteFromSel()">📝 记笔记</button><button onclick="askFromSel()">🤖 问AI</button><button onclick="copySel()">📋 复制</button><button onclick="hideSelBar()">✕</button>`;
  bar.classList.add('show');
}
function hideSelBar(){const b=document.getElementById('ebookSelBar');if(b)b.classList.remove('show');}
function copySel(){if(_selText)navigator.clipboard.writeText(_selText).then(()=>showToast('✅ 已复制'));hideSelBar();}
async function noteFromSel(){
  if(!_selText||!curBook)return;
  const remark=prompt('给这段划线加点笔记（可留空）：','');
  await EBOOK_DB.putNote({id:'nt_'+Date.now(),bookId:curBook.id,chapter:curBook.chapters[curBook.idx].title,text:_selText,remark:remark||'',ts:Date.now()});
  showToast('📝 笔记已保存');hideSelBar();
}
/* 与聊天互通：把选段带入主聊天让 AI 讨论 */
function askFromSel(){
  if(!_selText)return;
  const q=_selText;hideSelBar();closeEbook();
  const inp=document.getElementById('messageInput');
  inp.value=`我在读《${curBook.title}》，关于这段：\n「${q.slice(0,300)}」\n请帮我解读一下。`;
  sendMessage();
}
/* 让 AI 总结/讨论当前章 */
function ebookAsk(){
  if(!curBook)return;
  const ch=curBook.chapters[curBook.idx];
  closeEbook();
  const inp=document.getElementById('messageInput');
  inp.value=`我正在读《${curBook.title}》的「${ch.title}」，请用几句话总结本章，并点出关键人物与情节转折。`;
  sendMessage();
}

/* ---- 笔记列表 ---- */
async function showNotes(){
  ebookView='notes';
  const notes=(await EBOOK_DB.notesOf(curBook.id)).sort((a,b)=>b.ts-a.ts);
  document.getElementById('ebookTitle').textContent=curBook.title+' · 笔记';
  const body=document.getElementById('ebookBody');
  if(!notes.length){body.innerHTML='<div class="form-hint" style="text-align:center;padding:40px;">还没有笔记。阅读时选中文字即可「📝 记笔记」。</div>';}
  else{body.innerHTML=notes.map(n=>`<div class="note-card"><div class="note-chapter">${n.chapter} · ${new Date(n.ts).toLocaleDateString('zh-CN')}</div><div class="note-text">「${escapeForSearch(n.text)}」</div>${n.remark?`<div class="note-remark">💭 ${escapeForSearch(n.remark)}</div>`:''}<div class="note-actions"><button onclick="askNote('${n.id}')">🤖 问AI</button><button onclick="delNoteUI('${n.id}')">🗑️</button></div></div>`).join('');}
  document.getElementById('ebookFoot').innerHTML=`<button class="footer-btn footer-btn-secondary" style="flex:1;" onclick="renderReader()">‹ 返回阅读</button>`;
}
async function delNoteUI(id){await EBOOK_DB.delNote(id);showNotes();}
async function askNote(id){const notes=await EBOOK_DB.notesOf(curBook.id);const n=notes.find(x=>x.id===id);if(!n)return;closeEbook();const inp=document.getElementById('messageInput');inp.value=`我在《${curBook.title}》里记了一段笔记：\n「${n.text.slice(0,300)}」\n${n.remark?'我的想法：'+n.remark+'\n':''}请和我聊聊这段。`;sendMessage();}

/* 顶部返回：阅读→书架 */
function ebookBack(){if(ebookView==='reader'||ebookView==='notes')showShelf();else closeEbook();}

/* 当前阅读章节注入聊天上下文（陪读） */
function ebookContext(){
  if(!curBook||localStorage.getItem('ebook_companion')==='false')return'';
  const ch=curBook.chapters[curBook.idx];if(!ch)return'';
  return `\n【用户正在阅读】《${curBook.title}》- ${ch.title}\n当前章节内容（供理解，用户可能就此提问/总结/分析）：\n${ch.body.slice(0,3000)}`;
}
