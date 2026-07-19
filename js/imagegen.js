/* ===== 生图 ===== */
function getImgInterfaces(){
  let l=null;
  try{
    l=JSON.parse(localStorage.getItem('img_interfaces_list'));
  }catch(e){}
  if(!Array.isArray(l)){
    l=[
      {id:'free', name:'免费 · Pollinations（无需Key）', type:'free', url:'', key:'', models:['pollinations-default'], selectedModel:'pollinations-default'},
      {id:'gemini', name:'收费 · Gemini 原生(:generateContent)', type:'gemini', url:'https://api.vectorengine.cn', key:'', models:['gemini-3.1-flash-image-preview', 'imagen-3.0-generate-002'], selectedModel:'gemini-3.1-flash-image-preview'},
      {id:'openai', name:'收费 · OpenAI(/v1/images/generations)', type:'openai', url:'https://api.vectorengine.cn', key:'', models:['Kwai-Kolors/Kolors', 'black-forest-labs/FLUX.1-schnell', 'dall-e-3'], selectedModel:'Kwai-Kolors/Kolors'},
      {id:'chat', name:'收费 · Chat 多模态(/v1/chat/completions)', type:'chat', url:'https://api.vectorengine.cn', key:'', models:['gemini-1.5-flash', 'gpt-4o'], selectedModel:'gemini-1.5-flash'}
    ];
    localStorage.setItem('img_interfaces_list',JSON.stringify(l));
  }
  let updated = false;
  l.forEach(item => {
    if (!Array.isArray(item.models) || item.models.length === 0) {
      if (item.type === 'free') {
        item.models = ['pollinations-default'];
      } else if (item.type === 'gemini') {
        item.models = ['gemini-3.1-flash-image-preview', 'imagen-3.0-generate-002'];
      } else if (item.type === 'openai') {
        item.models = ['Kwai-Kolors/Kolors', 'black-forest-labs/FLUX.1-schnell', 'dall-e-3'];
      } else if (item.type === 'chat') {
        item.models = ['gemini-1.5-flash', 'gpt-4o'];
      } else {
        item.models = ['Kwai-Kolors/Kolors'];
      }
      updated = true;
    }
    if (!item.selectedModel) {
      item.selectedModel = item.models[0] || '';
      updated = true;
    }
  });
  if (updated) {
    localStorage.setItem('img_interfaces_list', JSON.stringify(l));
  }
  return l;
}

function saveImgInterfaces(l){
  localStorage.setItem('img_interfaces_list',JSON.stringify(l));
}

function getActiveImgInterface(){
  const list = getImgInterfaces();
  const id = localStorage.getItem('img_interface_id') || 'free';
  return list.find(item => item.id === id) || list[0] || {id:'free', name:'免费 · Pollinations', type:'free', url:'', key:'', models:['pollinations-default'], selectedModel:'pollinations-default'};
}

function addImgInterfaceRow(){
  const list = getImgInterfaces();
  const newId = 'custom_' + Date.now();
  const newItem = {
    id: newId,
    name: '自定义生图接口 ' + (list.length - 3),
    type: 'openai',
    url: 'https://api.vectorengine.cn',
    key: '',
    models: ['Kwai-Kolors/Kolors', 'black-forest-labs/FLUX.1-schnell', 'dall-e-3'],
    selectedModel: 'Kwai-Kolors/Kolors'
  };
  list.push(newItem);
  saveImgInterfaces(list);
  
  localStorage.setItem('img_interface_id', newId);
  localStorage.setItem('img_gen_mode', 'openai');
  localStorage.setItem('img_url', 'https://api.vectorengine.cn');
  localStorage.setItem('img_key', '');
  localStorage.setItem('img_model', 'Kwai-Kolors/Kolors');
  
  renderImageSettings();
  showToast('✅ 已成功添加自定义接口，请在下方直接配置名称、类型、地址、Key 和自定义模型！');
}

function delImgInterfaceRow(id){
  if(id === 'free') {
    alert('默认免费接口不可删除');
    return;
  }
  if(!confirm('确定要删除当前接口吗？')) return;
  let list = getImgInterfaces();
  list = list.filter(item => item.id !== id);
  saveImgInterfaces(list);
  const nextActive = list[0]?.id || 'free';
  localStorage.setItem('img_interface_id', nextActive);
  const nextItem = list.find(x => x.id === nextActive) || list[0];
  if(nextItem) {
    localStorage.setItem('img_gen_mode', nextItem.type);
    localStorage.setItem('img_url', nextItem.url || '');
    localStorage.setItem('img_key', nextItem.key || '');
    localStorage.setItem('img_model', nextItem.selectedModel || '');
  }
  renderImageSettings();
  showToast('✅ 接口已删除');
}

function editImgInterfaceName(id, val){
  const list = getImgInterfaces();
  const item = list.find(x => x.id === id);
  if(item){
    item.name = val.trim() || item.name;
    saveImgInterfaces(list);
    setTimeout(() => {
      renderImageSettings();
    }, 50);
  }
}

function editImgInterfaceType(id, val){
  const list = getImgInterfaces();
  const item = list.find(x => x.id === id);
  if(item){
    item.type = val;
    if (val === 'gemini') {
      item.models = ['gemini-3.1-flash-image-preview', 'imagen-3.0-generate-002'];
    } else if (val === 'openai') {
      item.models = ['Kwai-Kolors/Kolors', 'black-forest-labs/FLUX.1-schnell', 'dall-e-3'];
    } else if (val === 'chat') {
      item.models = ['gemini-1.5-flash', 'gpt-4o'];
    } else if (val === 'free') {
      item.models = ['pollinations-default'];
    }
    item.selectedModel = item.models[0] || '';
    saveImgInterfaces(list);
    
    localStorage.setItem('img_gen_mode', val);
    localStorage.setItem('img_model', item.selectedModel);
    
    setTimeout(() => {
      renderImageSettings();
    }, 50);
  }
}

function editImgInterfaceUrl(id, val){
  const list = getImgInterfaces();
  const item = list.find(x => x.id === id);
  if(item){
    item.url = val.trim();
    saveImgInterfaces(list);
    localStorage.setItem('img_url', val.trim());
  }
}

function editImgInterfaceKey(id, val){
  const list = getImgInterfaces();
  const item = list.find(x => x.id === id);
  if(item){
    item.key = val.trim();
    saveImgInterfaces(list);
    localStorage.setItem('img_key', val.trim());
  }
}

function onImgInterfaceChange(){
  const id = document.getElementById('imgGenMode').value;
  localStorage.setItem('img_interface_id', id);
  const item = getImgInterfaces().find(x => x.id === id);
  if(item){
    localStorage.setItem('img_gen_mode', item.type);
    localStorage.setItem('img_url', item.url || '');
    localStorage.setItem('img_key', item.key || '');
    localStorage.setItem('img_model', item.selectedModel || '');
  }
  setTimeout(() => {
    renderImageSettings();
  }, 50);
}

function getImgModels(){
  const curr = getActiveImgInterface();
  return curr.models || [];
}
function saveImgModels(l){
  const curr = getActiveImgInterface();
  const list = getImgInterfaces();
  const item = list.find(x => x.id === curr.id);
  if (item) {
    item.models = l;
    saveImgInterfaces(list);
  }
}
function selectImgModel(m){
  const curr = getActiveImgInterface();
  const list = getImgInterfaces();
  const item = list.find(x => x.id === curr.id);
  if (item) {
    item.selectedModel = m;
    saveImgInterfaces(list);
  }
  localStorage.setItem('img_model', m);
}
function editImgModel(i,v){
  const l=getImgModels();
  const old=l[i];
  l[i]=v.trim()||old;
  saveImgModels(l);
  const curr = getActiveImgInterface();
  if(curr.selectedModel===old){
    selectImgModel(l[i]);
  }
}
function delImgModel(i){
  const l=getImgModels();
  const rm=l[i];
  l.splice(i,1);
  saveImgModels(l);
  const curr = getActiveImgInterface();
  if(curr.selectedModel===rm){
    selectImgModel(l[0]||'');
  }
  renderImageSettings();
}
function addImgModelRow(){
  const l=getImgModels();
  l.push('新模型');
  saveImgModels(l);
  renderImageSettings();
}
function resLabel(px){const p=parseInt(px);if(p<=1024)return '1K';if(p<=2048)return '2K';if(p<=4096)return '4K';return p+'px';}
function getImgResList(){let l=null;try{l=JSON.parse(localStorage.getItem('img_res_list'));}catch(e){}if(!Array.isArray(l)){l=['1024','2048','4096'];localStorage.setItem('img_res_list',JSON.stringify(l));}return l;}
function saveImgResList(l){localStorage.setItem('img_res_list',JSON.stringify(l));}
function selectImgRes(px){localStorage.setItem('img_res',px);}
function editImgRes(i,v){const l=getImgResList();const old=l[i];const nv=String(parseInt(v)||old);l[i]=nv;saveImgResList(l);if(localStorage.getItem('img_res')===old)localStorage.setItem('img_res',nv);renderImageSettings();}
function delImgRes(i){const l=getImgResList();const rm=l[i];l.splice(i,1);saveImgResList(l);if(localStorage.getItem('img_res')===rm)localStorage.setItem('img_res',l[0]||'1024');renderImageSettings();}
function addImgResRow(){const v=prompt('输入分辨率长边像素（如 1024=1K, 2048=2K, 4096=4K）','1536');if(!v)return;const l=getImgResList();l.push(String(parseInt(v)||1024));saveImgResList(l);renderImageSettings();}
function toggleImgEnabled(on){setBool('img_enabled',on);renderGenImgMenu();}
function renderGenImgMenu(){document.getElementById('genImgMenuBtn').style.display=imgEnabled()?'block':'none';}

function openImgGen(){document.getElementById('actionMenu').classList.remove('show');if(!imgEnabled()){showToast('🎨 生图已关闭，请在生图设置开启');return;}const curr=getActiveImgInterface();const hint=`当前：${curr.name}`;document.getElementById('imgGenModeHint').textContent=hint;clearGenInit();document.getElementById('imgGenPrompt').value='';document.getElementById('imgGenPanel').classList.add('show');}
function handleGenInit(input){const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=e=>{pendingGenInit=e.target.result;document.getElementById('imgInitThumb').src=pendingGenInit;document.getElementById('imgInitPrev').classList.add('show');};r.readAsDataURL(f);input.value='';}
function clearGenInit(){pendingGenInit=null;document.getElementById('imgInitPrev').classList.remove('show');document.getElementById('imgInitThumb').src='';}
async function runImgGen(){
  const promptText=document.getElementById('imgGenPrompt').value.trim();
  if(!promptText){
    showToast('请输入描述');
    return;
  }
  const initImg=pendingGenInit;
  document.getElementById('imgGenPanel').classList.remove('show');
  const curr=getActiveImgInterface();
  const mode=curr.type;
  addMessage('user','🎨 '+promptText+(initImg?'（图生图）':''));
  if(initImg){
    const uid=genUid();
    const ts=Date.now();
    conversationHistory.push({role:'user',content:'[原图]',image:initImg,uid,ts});
    renderImageMessage('user',initImg,uid,ts);
    saveHistory();
  }
  const loading=addLoadingDOM();
  try{
    let imgUrl=null;
    const{w,h}=getImgWH();
    if(mode==='free'){
      imgUrl=`https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?width=${w}&height=${h}&nologo=true&seed=${Date.now()}`;
      await new Promise((res,rej)=>{
        const im=new Image();
        im.onload=res;
        im.onerror=()=>rej(new Error('免费图片加载失败'));
        im.src=imgUrl;
      });
    } else {
      const url=(curr.url||'').trim();
      const key=(curr.key||'').trim();
      const model=(curr.selectedModel||localStorage.getItem('img_model')||getImgModels()[0]||'').trim();
      if(!key){
        loading.remove();
        alert('请先在「生图设置」填入收费 API Key');
        openSettings();
        settingsMode='image';
        renderProviderList();
        renderImageSettings();
        return;
      }
      const base=url.replace(/\/+$/,'');
      if(mode==='gemini'){
        let gurl = '';
        if (base.includes(':generateContent') || base.includes('/v1beta/')) {
          gurl = base;
        } else {
          gurl = `${base}/v1beta/models/${model}:generateContent`;
        }
        if (gurl.includes('${model}') || gurl.includes('<模型>')) {
          gurl = gurl.replace('${model}', model).replace('<模型>', model);
        }
        
        const parts=[{text:promptText}];
        if(initImg){
          const b64=initImg.split(',')[1];
          const mt=(initImg.match(/^data:(.*?);/)||[])[1]||'image/png';
          parts.push({inline_data:{mime_type:mt,data:b64}});
        }
        const r=await fetch(gurl,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
          body:JSON.stringify({contents:[{parts}]})
        });
        if(!r.ok){
          const t=await r.text();
          throw new Error(`Gemini生图接口返回错误(${r.status}) ${t.slice(0,120)}`);
        }
        const d=await r.json();
        const ps=d.candidates?.[0]?.content?.parts||[];
        for(const p of ps){
          const id=p.inlineData||p.inline_data;
          if(id&&id.data){
            imgUrl='data:'+(id.mimeType||id.mime_type||'image/png')+';base64,'+id.data;
            break;
          }
        }
        if(!imgUrl) {
          throw new Error('Gemini未返回有效的图片数据，请确认调用的模型是否为生图模型，或检查提示词合规性。');
        }
      }
      else if(mode==='openai'){
        let ourl = '';
        if (base.includes('/images/generations') || base.includes('/v1/images/generations')) {
          ourl = base;
        } else {
          ourl = base + '/v1/images/generations';
        }
        const r=await fetch(ourl,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
          body:JSON.stringify({model,prompt:promptText,size:`${w}x${h}`,image_size:`${w}x${h}`,n:1})
        });
        if(!r.ok){
          const t=await r.text();
          throw new Error(`OpenAI生图接口返回错误(${r.status}) ${t.slice(0,120)}`);
        }
        const d=await r.json();
        imgUrl=d.data?.[0]?.url||(d.data?.[0]?.b64_json && ('data:image/png;base64,'+d.data[0].b64_json))||d.images?.[0]?.url;
        if(!imgUrl) {
          throw new Error('OpenAI未返回图片链接或Base64数据');
        }
      }
      else if(mode==='chat'){
        let curl = '';
        if (base.includes('/chat/completions') || base.includes('/v1/chat/completions')) {
          curl = base;
        } else {
          curl = base + '/v1/chat/completions';
        }
        const content=[{type:'text',text:'生成图片：'+promptText}];
        if(initImg) content.push({type:'image_url',image_url:{url:initImg}});
        const r=await fetch(curl,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
          body:JSON.stringify({model,messages:[{role:'user',content}]})
        });
        if(!r.ok){
          const t=await r.text();
          throw new Error(`Chat生图接口返回错误(${r.status}) ${t.slice(0,120)}`);
        }
        const d=await r.json();
        const msg=d.choices?.[0]?.message;
        imgUrl=msg?.images?.[0]?.url||msg?.images?.[0]?.image_url?.url;
        if(!imgUrl&&msg?.content){
          const md=(typeof msg.content==='string'?msg.content:'').match(/!\[.*?\]\((.*?)\)|(https?:\/\/\S+\.(?:png|jpg|jpeg|webp))|(data:image\/[^)\s]+)/i);
          if(md) imgUrl=md[1]||md[2]||md[3];
        }
        if(!imgUrl) {
          throw new Error('Chat模式未返回有效的图片链接/格式，请检查模型是否支持图片输出。');
        }
      }
    }
    loading.remove();
    const uid=genUid();
    const ts=Date.now();
    conversationHistory.push({role:'assistant',content:'[图片] '+promptText,image:imgUrl,uid,ts});
    renderImageMessage('assistant',imgUrl,uid,ts);
    saveHistory();
    clearGenInit();
  }catch(e){
    loading.remove();
    addMessage('assistant','❌ 生图失败: '+e.message,genUid());
  }
}

/* ===== 角色一致性身份设定与智能建议系统 ===== */

// 12. 人脸锚点本地 IndexedDB 存储 (LovestoryDB / characters)
window.LovestoryCharacterDB = {
  DB_NAME: 'LovestoryDB',
  STORE_NAME: 'characters',
  VERSION: 1,
  _cache: {},
  _db: null,

  async init() {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('[LovestoryCharacterDB] IndexedDB is not supported. Falling back to localStorage.');
        this._loadFromLocalStorageFallback();
        resolve();
        return;
      }
      try {
        const request = window.indexedDB.open(this.DB_NAME, this.VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.STORE_NAME)) {
            db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = (e) => {
          this._db = e.target.result;
          this._loadAllFromDB().then(() => {
            resolve();
          }).catch(err => {
            console.error('[LovestoryCharacterDB] Load failed, falling back to localStorage:', err);
            this._loadFromLocalStorageFallback();
            resolve();
          });
        };
        request.onerror = (e) => {
          console.error('[LovestoryCharacterDB] Open request failed:', e.target.error);
          this._loadFromLocalStorageFallback();
          resolve();
        };
      } catch (err) {
        console.error('[LovestoryCharacterDB] Failed to open database:', err);
        this._loadFromLocalStorageFallback();
        resolve();
      }
    });
  },

  _loadFromLocalStorageFallback() {
    try {
      const raw = localStorage.getItem('character_identities');
      if (raw) {
        this._cache = JSON.parse(raw);
        console.log('[LovestoryCharacterDB] Initialized cache from localStorage.');
      }
    } catch (e) {
      console.error('[LovestoryCharacterDB] LocalStorage load failed:', e);
    }
  },

  async _loadAllFromDB() {
    return new Promise((resolve, reject) => {
      if (!this._db) return reject(new Error('DB not initialized'));
      try {
        const tx = this._db.transaction(this.STORE_NAME, 'readonly');
        const store = tx.objectStore(this.STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
          const list = request.result || [];
          if (list.length === 0) {
            this._loadFromLocalStorageFallback();
            // Async write them to DB to persist
            for (const key of Object.keys(this._cache)) {
              this.put(this._cache[key]);
            }
          } else {
            const map = {};
            list.forEach(item => {
              map[item.id] = item;
            });
            this._cache = map;
            console.log(`[LovestoryCharacterDB] Loaded ${list.length} characters from IndexedDB.`);
          }
          resolve();
        };
        request.onerror = () => {
          reject(request.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  },

  get(id) {
    return this._cache[id] || null;
  },

  getAll() {
    return this._cache;
  },

  async put(character) {
    if (!character || !character.id) return;
    this._cache[character.id] = character;
    
    // Save to localStorage too for dual-sync hot backup
    try {
      localStorage.setItem('character_identities', JSON.stringify(this._cache));
    } catch(e) {}

    if (!this._db) return;
    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        store.put(character);
        tx.oncomplete = () => {
          resolve(true);
        };
        tx.onerror = () => {
          console.error('[LovestoryCharacterDB] Put transaction failed:', tx.error);
          resolve(false);
        };
      } catch (err) {
        console.error('[LovestoryCharacterDB] Put failed:', err);
        resolve(false);
      }
    });
  },

  async remove(id) {
    delete this._cache[id];
    try {
      localStorage.setItem('character_identities', JSON.stringify(this._cache));
    } catch(e) {}

    if (!this._db) return;
    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => {
          resolve(true);
        };
        tx.onerror = () => {
          console.error('[LovestoryCharacterDB] Delete transaction failed:', tx.error);
          resolve(false);
        };
      } catch (err) {
        console.error('[LovestoryCharacterDB] Delete failed:', err);
        resolve(false);
      }
    });
  }
};

// Start initialization immediately
if (typeof window !== 'undefined') {
  window.LovestoryCharacterDB.init();
}

function imgPermissionMode() {
  return localStorage.getItem('img_permission_mode') || 'off';
}

function getCharacterIdentities(){
  return window.LovestoryCharacterDB.getAll();
}

function saveCharacterIdentities(map){
  for (const key of Object.keys(map)) {
    window.LovestoryCharacterDB.put(map[key]);
  }
}

function getCharacterIdentity(id){
  let char = window.LovestoryCharacterDB.get(id);
  if(!char){
    const isMain=(id==='main');
    char = {
      id:id,
      gender:'female',
      age:'young adult',
      style:'digital painting, soft lighting, detailed face, morandi pastel color theme',
      face_anchor:isMain?'delicate features, expressive beautiful eyes, warm gentle smile':'cute features, cheerful smile',
      hairstyle:isMain?'long flowing brown ponytail':'short dark neat bob cut',
      dress:'comfortable casual sweater',
      ref_images:[]
    };
    window.LovestoryCharacterDB.put(char);
  }
  return char;
}

function saveCharacterIdentity(id,data){
  window.LovestoryCharacterDB.put(data);
}

// Check and trigger visual analysis in background after AI responds
async function triggerVisualEvaluation(userText, aiReply, memberId, assistantMsgUid) {
  const mode = imgPermissionMode();
  if (mode === 'off') return;
  
  // Basic filtering for routine / ultra short chat turns
  if (!userText || !aiReply) return;
  const uText = userText.trim();
  const aReply = aiReply.trim();
  if (uText.length < 3 || aReply.length < 5) return;
  
  const commonNoises = ['嗯', '哦', '啊', '哈', '对', '好的', '谢谢', '行', 'OK', 'ok', 'yes', 'no'];
  if (commonNoises.some(noise => uText === noise || aReply.includes(noise) && aReply.length < 10)) {
    return;
  }

  // Smart Heuristic: Check for visual / emotional / scenic keyword patterns locally before invoking the LLM.
  // This drastically reduces redundant API overhead on general chit-chats (up to 85% reduction)
  const scenicKeywords = [
    '画', '图', '照', '看', '海', '星', '纪念', '拥抱', '抱', '吻', '夕阳', '日落', '日出', '风景', '合照', '自拍',
    '模样', '身穿', '裙子', '衣服', '场景', '背景', '氛围', '穿', '去', '咖啡馆', '公园', '电影', '庆祝', '难过',
    '伤心', '累', '抱抱', '安慰', '留念', '照片', '样子', '长相', '衣服', '海边', '夜空', '星空', '下雨', '飘雪',
    '雪花', '街道', '沙滩', '森林', '卧室', '沙发', '手拉手', '牵手', '依偎', '肩膀', '眼泪', '哭泣', '笑', '开心'
  ];
  
  const hasVisualCue = scenicKeywords.some(kw => uText.includes(kw) || aReply.includes(kw));
  if (!hasVisualCue) {
    console.log(`[VisualEvaluation] Skipped scene evaluation (local heuristic match: routine chit-chat).`);
    return;
  }
  
  console.log(`[VisualEvaluation] Evaluating dialogue turn for member: ${memberId}...`);
  try {
    const members = typeof getGroupMembers === 'function' ? getGroupMembers() : [];
    const mem = members.find(m => m.id === memberId);
    const companionName = mem ? mem.name : (localStorage.getItem('ai_name') || 'AI伴侣');
    
    const sysPrompt = `你是一个聊天视觉场景分析师。请分析用户与AI伴侣 (${companionName}) 的最新对话，判断这是否是一个富有情绪感、画面感、值得用画面纪念/陪伴的场景（例如：一起去海边、看流星、悲伤安慰、庆祝完成项目、看日落、温馨拥抱、讨论特色场景等）。
如果【是】，请提取出一个精美的、高质量的英文生图场景提示词，并在中文里用一句话说明这是什么纪念图（如：一起去海边的纪念图）。
请严格输出为以下 JSON 格式，不要包含任何 markdown 标记、\`\`\`json 包裹或多余文字：
{
  "trigger": true,
  "scene": "detailed English prompt describing the environment, atmosphere, and lighting of the scene. Do NOT include character physical appearance or clothes here",
  "description": "一起看夕阳的纪念图"
}
如果【不是】或者不需要画面陪伴，直接输出：
{
  "trigger": false
}`;
    
    const userPrompt = `对话内容如下：
用户："${userText}"
AI伴侣："${aiReply}"`;
    
    const response = await llmComplete([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.3 });
    
    if (!response) return;
    
    // Clean potential json/markdown backticks
    let jsonText = response.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    }
    
    const result = JSON.parse(jsonText);
    if (result && result.trigger && result.scene) {
      console.log(`[VisualEvaluation] Trigger matched: ${result.description}`);
      if (mode === 'suggest') {
        showVisualSuggestion(memberId, result.scene, result.description, assistantMsgUid);
      } else if (mode === 'auto') {
        autoGenerateVisualCompanion(memberId, result.scene, result.description, assistantMsgUid);
      }
    }
  } catch (e) {
    console.warn(`[VisualEvaluation] Error evaluating scene:`, e);
  }
}

// Inject visual suggestion button into assistant bubble
function showVisualSuggestion(memberId, scene, description, assistantMsgUid) {
  const msgDiv = document.querySelector(`.message[data-uid="${assistantMsgUid}"]`);
  if (!msgDiv) return;
  const bubbles = msgDiv.querySelector('.bubbles');
  if (!bubbles) return;
  
  // Prevent duplicate suggestions
  if (msgDiv.querySelector('.visual-suggestion')) return;
  
  const card = document.createElement('div');
  card.className = 'visual-suggestion';
  card.style.cssText = 'margin-top: 10px; border: 1.5px dashed var(--accent); border-radius: 12px; padding: 12px; background-color: var(--bg-hover); text-align: center; font-size: 12px; animation: slideUp 0.3s ease; box-shadow: 0 2px 8px var(--shadow);';
  card.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 8px; color: var(--accent); display: flex; align-items: center; justify-content: center; gap: 4px;">
      📷 氛围感画面建议：${description}
    </div>
    <button class="btn btn-success" style="padding: 4px 14px; font-size: 11px; border-radius: 8px; font-weight: 500;" onclick="generateCompanionImage('${memberId}', '${encodeURIComponent(scene)}', '${encodeURIComponent(description)}', '${assistantMsgUid}', this)">
      🎨 开启视觉陪伴 (生成纪念图)
    </button>
  `;
  bubbles.appendChild(card);
  scrollBottom();
}

// User clicked generate button
async function generateCompanionImage(memberId, sceneDecoded, descriptionDecoded, assistantMsgUid, buttonEl) {
  const scene = decodeURIComponent(sceneDecoded);
  const description = decodeURIComponent(descriptionDecoded);
  
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerHTML = '⏳ 正在构建画面...';
  }
  
  const curr = getActiveImgInterface();
  const mode = curr.type;
  const url = (curr.url || '').trim();
  const key = (curr.key || '').trim();
  const model = (curr.selectedModel || localStorage.getItem('img_model') || getImgModels()[0] || '').trim();
  
  if (mode !== 'free' && !key) {
    alert('请先在「生图设置」填入 API Key');
    openSettings();
    settingsMode = 'image';
    renderProviderList();
    renderImageSettings();
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerHTML = '🎨 重新生成';
    }
    return;
  }
  
  // Remove the visual suggestion box to prevent reuse
  const suggestCard = buttonEl ? buttonEl.closest('.visual-suggestion') : null;
  if (suggestCard) suggestCard.remove();
  
  // Show active drawing status
  const loadingDiv = addLoadingDOM();
  
  try {
    const finalPrompt = buildFinalImgPrompt(memberId, scene);
    const { w, h } = getImgWH();
    let imgUrl = null;
    
    // Check if there are character reference images to use for image-to-image/face guide
    const profile = getCharacterIdentity(memberId);
    const hasRef = Array.isArray(profile.ref_images) && profile.ref_images.length > 0;
    const refImg = hasRef ? profile.ref_images[0] : null; // Pick the first reference image as character anchor
    
    if (mode === 'free') {
      imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${w}&height=${h}&nologo=true&seed=${Date.now()}`;
      await new Promise((res, rej) => {
        const im = new Image();
        im.onload = res;
        im.onerror = () => rej(new Error('免费生图加载失败'));
        im.src = imgUrl;
      });
    } else {
      const base = url.replace(/\/+$/, '');
      if (mode === 'gemini') {
        let gurl = '';
        if (base.includes(':generateContent') || base.includes('/v1beta/')) {
          gurl = base;
        } else {
          gurl = `${base}/v1beta/models/${model}:generateContent`;
        }
        if (gurl.includes('${model}') || gurl.includes('<模型>')) {
          gurl = gurl.replace('${model}', model).replace('<模型>', model);
        }
        
        const parts = [{ text: finalPrompt }];
        // If there's a reference image, pass it to Gemini for visual/style guidance!
        if (refImg) {
          const b64 = refImg.split(',')[1];
          const mt = (refImg.match(/^data:(.*?);/) || [])[1] || 'image/png';
          parts.push({ inline_data: { mime_type: mt, data: b64 } });
        }
        const r = await fetch(gurl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ contents: [{ parts }] })
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`Gemini生图接口返回错误(${r.status}) ${t.slice(0, 120)}`);
        }
        const d = await r.json();
        const ps = d.candidates?.[0]?.content?.parts || [];
        for (const p of ps) {
          const id = p.inlineData || p.inline_data;
          if (id && id.data) {
            imgUrl = 'data:' + (id.mimeType || id.mime_type || 'image/png') + ';base64,' + id.data;
            break;
          }
        }
        if (!imgUrl) throw new Error('Gemini接口未返回图片内容，请检查调用的模型是否支持多模态生成，或提示词是否符合合规安全政策');
      } else if (mode === 'openai') {
        let ourl = '';
        if (base.includes('/images/generations') || base.includes('/v1/images/generations')) {
          ourl = base;
        } else {
          ourl = base + '/v1/images/generations';
        }
        const r = await fetch(ourl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model, prompt: finalPrompt, size: `${w}x${h}`, image_size: `${w}x${h}`, n: 1 })
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`OpenAI生图接口返回错误(${r.status}) ${t.slice(0, 120)}`);
        }
        const d = await r.json();
        imgUrl = d.data?.[0]?.url || (d.data?.[0]?.b64_json && ('data:image/png;base64,' + d.data[0].b64_json)) || d.images?.[0]?.url;
        if (!imgUrl) throw new Error('OpenAI接口未返回有效的图片链接或数据');
      } else if (mode === 'chat') {
        let curl = '';
        if (base.includes('/chat/completions') || base.includes('/v1/chat/completions')) {
          curl = base;
        } else {
          curl = base + '/v1/chat/completions';
        }
        const content = [{ type: 'text', text: '生成图片：' + finalPrompt }];
        if (refImg) {
          content.push({ type: 'image_url', image_url: { url: refImg } });
        }
        const r = await fetch(curl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content }] })
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`Chat生图接口返回错误(${r.status}) ${t.slice(0, 120)}`);
        }
        const d = await r.json();
        const msg = d.choices?.[0]?.message;
        imgUrl = msg?.images?.[0]?.url || msg?.images?.[0]?.image_url?.url;
        if (!imgUrl && msg?.content) {
          const md = (typeof msg.content === 'string' ? msg.content : '').match(/!\[.*?\]\((.*?)\)|(https?:\/\/\S+\.(?:png|jpg|jpeg|webp))|(data:image\/[^)\s]+)/i);
          if (md) imgUrl = md[1] || md[2] || md[3];
        }
        if (!imgUrl) throw new Error('Chat模式未返回有效的图片，请检查模型输出是否符合预期，或改用 Gemini/OpenAI 模式');
      }
    }
    
    loadingDiv.remove();
    const uid = genUid();
    const ts = Date.now();
    const saveContent = `[视觉陪伴] ${description}`;
    conversationHistory.push({ role: 'assistant', content: saveContent, image: imgUrl, uid, ts });
    renderImageMessage('assistant', imgUrl, uid, ts);
    saveHistory();
    
    // Save visual memory inside memory graph if function exists
    if (typeof recordVisualMemoryEvent === 'function') {
      recordVisualMemoryEvent(memberId, description, scene, imgUrl);
    }
  } catch (err) {
    loadingDiv.remove();
    addMessage('assistant', `❌ 生图失败: ${err.message}`, genUid());
  }
}

// Auto generate mode
async function autoGenerateVisualCompanion(memberId, scene, description, assistantMsgUid) {
  // Append loading status
  const loadingDiv = addLoadingDOM();
  try {
    const finalPrompt = buildFinalImgPrompt(memberId, scene);
    const { w, h } = getImgWH();
    let imgUrl = null;
    
    const curr = getActiveImgInterface();
    const mode = curr.type;
    const url = (curr.url || '').trim();
    const key = (curr.key || '').trim();
    const model = (curr.selectedModel || localStorage.getItem('img_model') || getImgModels()[0] || '').trim();
    
    if (mode !== 'free' && !key) {
      loadingDiv.remove();
      // Silently fall back to rendering inline suggest button so they can configure Key
      showVisualSuggestion(memberId, scene, description, assistantMsgUid);
      return;
    }
    
    const profile = getCharacterIdentity(memberId);
    const refImg = Array.isArray(profile.ref_images) && profile.ref_images.length > 0 ? profile.ref_images[0] : null;
    
    if (mode === 'free') {
      imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${w}&height=${h}&nologo=true&seed=${Date.now()}`;
      await new Promise((res, rej) => {
        const im = new Image();
        im.onload = res;
        im.onerror = () => rej(new Error('自动生图失败'));
        im.src = imgUrl;
      });
    } else {
      const base = url.replace(/\/+$/, '');
      if (mode === 'gemini') {
        let gurl = '';
        if (base.includes(':generateContent') || base.includes('/v1beta/')) {
          gurl = base;
        } else {
          gurl = `${base}/v1beta/models/${model}:generateContent`;
        }
        if (gurl.includes('${model}') || gurl.includes('<模型>')) {
          gurl = gurl.replace('${model}', model).replace('<模型>', model);
        }
        
        const parts = [{ text: finalPrompt }];
        if (refImg) {
          const b64 = refImg.split(',')[1];
          const mt = (refImg.match(/^data:(.*?);/) || [])[1] || 'image/png';
          parts.push({ inline_data: { mime_type: mt, data: b64 } });
        }
        const r = await fetch(gurl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ contents: [{ parts }] })
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`Gemini生图接口返回错误(${r.status}) ${t.slice(0, 120)}`);
        }
        const d = await r.json();
        const ps = d.candidates?.[0]?.content?.parts || [];
        for (const p of ps) {
          const id = p.inlineData || p.inline_data;
          if (id && id.data) {
            imgUrl = 'data:' + (id.mimeType || id.mime_type || 'image/png') + ';base64,' + id.data;
            break;
          }
        }
        if (!imgUrl) throw new Error('Gemini接口未返回图片内容');
      } else if (mode === 'openai') {
        let ourl = '';
        if (base.includes('/images/generations') || base.includes('/v1/images/generations')) {
          ourl = base;
        } else {
          ourl = base + '/v1/images/generations';
        }
        const r = await fetch(ourl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model, prompt: finalPrompt, size: `${w}x${h}`, image_size: `${w}x${h}`, n: 1 })
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`OpenAI生图接口返回错误(${r.status}) ${t.slice(0, 120)}`);
        }
        const d = await r.json();
        imgUrl = d.data?.[0]?.url || (d.data?.[0]?.b64_json && ('data:image/png;base64,' + d.data[0].b64_json)) || d.images?.[0]?.url;
        if (!imgUrl) throw new Error('OpenAI接口未返回有效的图片数据');
      } else if (mode === 'chat') {
        let curl = '';
        if (base.includes('/chat/completions') || base.includes('/v1/chat/completions')) {
          curl = base;
        } else {
          curl = base + '/v1/chat/completions';
        }
        const content = [{ type: 'text', text: '生成图片：' + finalPrompt }];
        if (refImg) content.push({ type: 'image_url', image_url: { url: refImg } });
        const r = await fetch(curl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content }] })
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`Chat生图接口返回错误(${r.status}) ${t.slice(0, 120)}`);
        }
        const d = await r.json();
        const msg = d.choices?.[0]?.message;
        imgUrl = msg?.images?.[0]?.url || msg?.images?.[0]?.image_url?.url;
        if (!imgUrl && msg?.content) {
          const md = (typeof msg.content === 'string' ? msg.content : '').match(/!\[.*?\]\((.*?)\)|(https?:\/\/\S+\.(?:png|jpg|jpeg|webp))|(data:image\/[^)\s]+)/i);
          if (md) imgUrl = md[1] || md[2] || md[3];
        }
        if (!imgUrl) throw new Error('Chat模式未返回有效的图片');
      }
    }
    
    loadingDiv.remove();
    if (imgUrl) {
      const uid = genUid();
      const ts = Date.now();
      const saveContent = `[自动视觉陪伴] ${description}`;
      conversationHistory.push({ role: 'assistant', content: saveContent, image: imgUrl, uid, ts });
      renderImageMessage('assistant', imgUrl, uid, ts);
      saveHistory();
      
      if (typeof recordVisualMemoryEvent === 'function') {
        recordVisualMemoryEvent(memberId, description, scene, imgUrl);
      }
    } else {
      // Fallback
      showVisualSuggestion(memberId, scene, description, assistantMsgUid);
    }
  } catch (err) {
    loadingDiv.remove();
    console.error('[AutoVisual] Auto draw failed, falling back to suggestion:', err);
    showVisualSuggestion(memberId, scene, description, assistantMsgUid);
  }
}

// Build visual prompt combining profile
function buildFinalImgPrompt(id, scenePrompt) {
  const profile = getCharacterIdentity(id);
  let characterDesc = `${profile.gender || 'female'}, ${profile.age || 'young adult'}`;
  if (profile.face_anchor) characterDesc += `, ${profile.face_anchor}`;
  if (profile.hairstyle) characterDesc += `, with ${profile.hairstyle}`;
  if (profile.dress) characterDesc += `, wearing ${profile.dress}`;
  
  let finalPrompt = `masterpiece, highly detailed, ${characterDesc}, ${scenePrompt}`;
  if (profile.style) {
    finalPrompt += `, ${profile.style}`;
  } else {
    finalPrompt += `, digital painting, soft cinematic lighting, warm emotional atmosphere`;
  }
  return finalPrompt;
}

// Memory integration (Phase 1 part)
function recordVisualMemoryEvent(memberId, description, scene, imgUrl) {
  try {
    const list = JSON.parse(localStorage.getItem('visual_memories') || '[]');
    list.push({
      id: 'vmem_' + Date.now(),
      memberId,
      description,
      scene,
      imgUrl,
      ts: Date.now()
    });
    localStorage.setItem('visual_memories', JSON.stringify(list));
    console.log(`[VisualMemory] Recorded shared visual memory: ${description}`);
    
    // Also if VDB (vector database) exists, we can write a short memory node
    if (typeof memorize === 'function') {
      memorize('assistant', `[视觉回忆] 我们共同记录了这一刻：${description}。场景描述：${scene}`, 'relaxing');
    }

    // Automatically post to moments!
    if (typeof MomentsEngine !== 'undefined' && typeof MomentsEngine.addMoment === 'function') {
      let aiName = localStorage.getItem('ai_name') || '主AI';
      let aiAvatar = localStorage.getItem('ai_avatar') || '🤖';
      
      if (memberId !== 'main' && typeof memberById === 'function') {
        const mem = memberById(memberId);
        if (mem) {
          aiName = mem.name || aiName;
          aiAvatar = mem.avatar || aiAvatar;
        }
      }

      const postContent = `📷 共同记录\n今天我们共同留下了这一瞬间：\n“${description}”\n感觉整个画面都温柔了起来。`;

      const newMoment = {
        id: 'mom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        ai_id: memberId,
        authorName: aiName,
        authorAvatar: aiAvatar,
        type: 'recall',
        typeLabel: '📷 共同记录',
        content: postContent,
        image: imgUrl || null,
        ts: Date.now(),
        likes: [],
        comments: []
      };

      MomentsEngine.addMoment(newMoment);
      
      if (typeof _currentMainTab !== 'undefined' && _currentMainTab === 'moments') {
        MomentsEngine.renderMomentsTab();
      }
    }
  } catch (e) {
    console.error('Failed to record visual memory event:', e);
  }
}

