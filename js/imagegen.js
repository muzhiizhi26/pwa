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
    const activeAi = (typeof currentPrivateAiId === 'function') ? currentPrivateAiId() : 'main';
    const { imgUrl } = await generateImageWithFailover(promptText, initImg, activeAi);
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

window.LovestoryImageDB = {
  DB_NAME: 'LovestoryImagesDB',
  STORE_NAME: 'images',
  VERSION: 1,
  _db: null,

  async init() {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('[LovestoryImageDB] IndexedDB is not supported.');
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
          console.log('[LovestoryImageDB] Initialized successfully.');
          resolve();
        };
        request.onerror = (e) => {
          console.error('[LovestoryImageDB] Open request failed:', e.target.error);
          resolve();
        };
      } catch (err) {
        console.error('[LovestoryImageDB] Failed to open database:', err);
        resolve();
      }
    });
  },

  async put(id, dataUrlOrBlob) {
    if (!this._db) return false;
    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        store.put({ id, data: dataUrlOrBlob, ts: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => {
          console.error('[LovestoryImageDB] Put failed:', tx.error);
          resolve(false);
        };
      } catch (err) {
        console.error('[LovestoryImageDB] Error storing image:', err);
        resolve(false);
      }
    });
  },

  async get(id) {
    if (!this._db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction(this.STORE_NAME, 'readonly');
        const store = tx.objectStore(this.STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
          resolve(request.result ? request.result.data : null);
        };
        request.onerror = () => {
          resolve(null);
        };
      } catch (err) {
        resolve(null);
      }
    });
  },

  async remove(id) {
    if (!this._db) return false;
    return new Promise((resolve) => {
      try {
        const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }
};

if (typeof window !== 'undefined') {
  window.LovestoryImageDB.init();
}

async function downloadAndStoreImage(url, id) {
  try {
    if (!url) return null;
    if (url.startsWith('data:')) {
      if (window.LovestoryImageDB) {
        await window.LovestoryImageDB.put(id, url);
      }
      return url;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result;
        if (window.LovestoryImageDB) {
          await window.LovestoryImageDB.put(id, base64data);
        }
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[ImagePersistence] Failed to download/convert image to base64:', e);
    return url;
  }
}
window.downloadAndStoreImage = downloadAndStoreImage;

async function generateImageWithFailover(promptText, initImg = null, memberId = 'main', intentType = 'character') {
  const interfaces = getImgInterfaces();
  const active = getActiveImgInterface();
  const tryQueue = [];

  // 1. Try active first
  tryQueue.push(active);

  // 2. Add other paid providers if configured (i.e. have a key)
  interfaces.forEach(it => {
    if (it.id !== active.id && it.type !== 'free' && it.key && it.key.trim()) {
      tryQueue.push(it);
    }
  });

  // 3. Add free Pollinations as final backup if not tried
  const freeProv = interfaces.find(it => it.type === 'free') || { id: 'free', type: 'free', name: '免费 · Pollinations' };
  if (!tryQueue.some(it => it.id === freeProv.id)) {
    tryQueue.push(freeProv);
  }

  let lastError = null;
  const { w, h } = getImgWH();
  const profile = getCharacterIdentity(memberId) || {};
  
  let refImg = initImg;
  if (!refImg) {
    if (intentType === 'character') {
      refImg = (Array.isArray(profile.ref_images) && profile.ref_images.length > 0) ? profile.ref_images[0] : null;
    } else if (intentType === 'pet') {
      refImg = (profile.pet_anchor && profile.pet_anchor.originalImage) ? profile.pet_anchor.originalImage : null;
    } else if (intentType === 'object') {
      refImg = (profile.object_anchor && profile.object_anchor.originalImage) ? profile.object_anchor.originalImage : null;
    } else if (intentType === 'scene') {
      refImg = (profile.place_anchor && profile.place_anchor.originalImage) ? profile.place_anchor.originalImage : null;
    } else if (intentType === 'food') {
      refImg = null; // Strictly no reference image for foods to avoid contamination
    }
  }

  for (const prov of tryQueue) {
    const mode = prov.type;
    console.log(`[ImageFailover] Attempting image generation with provider: ${prov.name || mode}`);

    if (mode !== 'free' && (!prov.key || !prov.key.trim())) {
      console.log(`[ImageFailover] Skipping ${prov.name || mode} (no API Key configured)`);
      continue;
    }

    const maxRetries = mode === 'free' ? 2 : 1;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let imgUrl = null;
        if (mode === 'free') {
          imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?width=${w}&height=${h}&nologo=true&seed=${Date.now() + attempt}`;
          
          // Verify loadability
          await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = resolve;
            im.onerror = () => reject(new Error('Pollinations image server failed or returned 500'));
            im.src = imgUrl;
          });
        } else {
          const url = (prov.url || '').trim();
          const key = (prov.key || '').trim();
          const model = (prov.selectedModel || localStorage.getItem('img_model') || (prov.models && prov.models[0]) || '').trim();
          const base = url.replace(/\/+$/, '');

          if (mode === 'gemini') {
            let gurl = base.includes(':generateContent') || base.includes('/v1beta/') ? base : `${base}/v1beta/models/${model}:generateContent`;
            if (gurl.includes('${model}') || gurl.includes('<模型>')) {
              gurl = gurl.replace('${model}', model).replace('<模型>', model);
            }

            const parts = [{ text: promptText }];
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
              throw new Error(`Gemini Error (${r.status}): ${t.slice(0, 100)}`);
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
            if (!imgUrl) throw new Error('Gemini did not return image data');
          } else if (mode === 'openai') {
            const ourl = base.includes('/images/generations') || base.includes('/v1/images/generations') ? base : base + '/v1/images/generations';
            const r = await fetch(ourl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
              body: JSON.stringify({ model, prompt: promptText, size: `${w}x${h}`, image_size: `${w}x${h}`, n: 1 })
            });
            if (!r.ok) {
              const t = await r.text();
              throw new Error(`OpenAI Error (${r.status}): ${t.slice(0, 100)}`);
            }
            const d = await r.json();
            imgUrl = d.data?.[0]?.url || (d.data?.[0]?.b64_json && ('data:image/png;base64,' + d.data[0].b64_json)) || d.images?.[0]?.url;
            if (!imgUrl) throw new Error('OpenAI did not return image URL');
          } else if (mode === 'chat') {
            const curl = base.includes('/chat/completions') || base.includes('/v1/chat/completions') ? base : base + '/v1/chat/completions';
            const content = [{ type: 'text', text: 'Generate image: ' + promptText }];
            if (refImg) content.push({ type: 'image_url', image_url: { url: refImg } });
            const r = await fetch(curl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
              body: JSON.stringify({ model, messages: [{ role: 'user', content }] })
            });
            if (!r.ok) {
              const t = await r.text();
              throw new Error(`Chat Error (${r.status}): ${t.slice(0, 100)}`);
            }
            const d = await r.json();
            const msg = d.choices?.[0]?.message;
            imgUrl = msg?.images?.[0]?.url || msg?.images?.[0]?.image_url?.url;
            if (!imgUrl && msg?.content) {
              const md = (typeof msg.content === 'string' ? msg.content : '').match(/!\[.*?\]\((.*?)\)|(https?:\/\/\S+\.(?:png|jpg|jpeg|webp))|(data:image\/[^)\s]+)/i);
              if (md) imgUrl = md[1] || md[2] || md[3];
            }
            if (!imgUrl) throw new Error('Chat model did not return image format');
          }
        }

        if (imgUrl) {
          console.log(`[ImageFailover] Successfully generated image using: ${prov.name || mode}`);
          return { imgUrl, providerName: prov.name || mode };
        }
      } catch (err) {
        lastError = err;
        console.warn(`[ImageFailover] Attempt ${attempt} failed for provider ${prov.name || mode}: ${err.message}`);
      }
    }
  }

  throw lastError || new Error('All image generation providers failed');
}
window.generateImageWithFailover = generateImageWithFailover;

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
      ref_images:[],
      appearance_profile:{
        face_shape:'',
        eyes:'',
        hair:'',
        skin:'',
        age:'',
        unique_features:[]
      },
      character_anchor:null
    };
    window.LovestoryCharacterDB.put(char);
  } else {
    let updated = false;
    if (!char.appearance_profile) {
      char.appearance_profile = {
        face_shape:'',
        eyes:'',
        hair:'',
        skin:'',
        age:'',
        unique_features:[]
      };
      updated = true;
    }
    if (char.character_anchor === undefined) {
      char.character_anchor = null;
      updated = true;
    }
    if (updated) {
      window.LovestoryCharacterDB.put(char);
    }
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
    '雪花', '街道', '沙滩', '森林', '卧室', '沙发', '手拉手', '牵手', '依偎', '肩膀', '眼泪', '哭泣', '笑', '开心',
    '猫', '狗', '宠物', '小动物', '蛋糕', '下午茶', '咖啡', '甜点', '晚餐', '好吃的'
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
    
    const sysPrompt = `你是一个聊天视觉场景 analysis 与意图路由专家。请分析用户与AI伴侣 (${companionName}) 的最新对话，判断这是否是一个富有情绪感、画面感、值得用画面纪念/陪伴的场景。
你必须对该生图意图进行【多类型生图策略路由】（Visual Identity System），将画面类型归入以下五类之一：
- "character": 含有AI角色、用户、人像，或两人合照、拥抱等有人物在场、有长相外貌特征的场景（默认优先）。
- "pet": 宠物、猫咪、狗狗、或其他小动物的场景，且人物不作为画面主体（如果有宠物和人一起亲密互动，依然属于 character）。
- "food": 纯美食、下午茶、蛋糕、咖啡、饮品、丰盛晚餐，不含有AI角色、人脸或任何人物痕迹。
- "scene": 纯风景、自然环境、星空日落、下雨天、街景、温馨卧室或空旷环境，不含有任何特定人物痕迹。
- "object": 纯物件，如手写日记本、手作礼物、一束鲜花、纪念饰品，不含有特定人物痕迹。

如果确定要触发生图：
- trigger: true
- intentType: "character" | "pet" | "food" | "scene" | "object"
- scene: 提取出一个非常精美、具有艺术感和故事感的英文生图提示词（不需要包含人物的外貌/服装特征，这些会由系统各层的视觉锚点自动补全）。
- description: 用温馨的中文描述一句话，说明这是什么图（例如：“下午茶时光的草莓蛋糕纪念图”、“星空下依偎的纪念自拍”）。

请严格输出为以下 JSON 格式，不要包含任何 markdown 标记、\`\`\`json 包裹或多余文字：
{
  "trigger": true,
  "intentType": "character",
  "scene": "detailed English prompt describing the environment, atmosphere, and lighting. Do NOT include character physical appearance or clothes here",
  "description": "一起看夕阳的纪念图"
}
如果不触发，直接输出：
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
      const intentType = result.intentType || 'character';
      console.log(`[VisualEvaluation] Trigger matched: ${result.description} | Strategy: ${intentType}`);
      if (mode === 'suggest') {
        showVisualSuggestion(memberId, result.scene, result.description, assistantMsgUid, intentType);
      } else if (mode === 'auto') {
        autoGenerateVisualCompanion(memberId, result.scene, result.description, assistantMsgUid, intentType);
      }
    }
  } catch (e) {
    console.warn(`[VisualEvaluation] Error evaluating scene:`, e);
  }
}

// Inject visual suggestion button into assistant bubble
function showVisualSuggestion(memberId, scene, description, assistantMsgUid, intentType = 'character') {
  const msgDiv = document.querySelector(`.message[data-uid="${assistantMsgUid}"]`);
  if (!msgDiv) return;
  const bubbles = msgDiv.querySelector('.bubbles');
  if (!bubbles) return;

  // Prevent duplicate suggestions
  if (msgDiv.querySelector('.visual-suggestion')) return;

  let emojiPrefix = '📷';
  if (intentType === 'pet') emojiPrefix = '🐾';
  if (intentType === 'food') emojiPrefix = '🍰';
  if (intentType === 'scene') emojiPrefix = '🏡';
  if (intentType === 'object') emojiPrefix = '🎁';

  const card = document.createElement('div');
  card.className = 'visual-suggestion';
  card.style.cssText = 'margin-top: 10px; border: 1.5px dashed var(--accent); border-radius: 12px; padding: 12px; background-color: var(--bg-hover); text-align: center; font-size: 12px; animation: slideUp 0.3s ease; box-shadow: 0 2px 8px var(--shadow);';
  card.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 8px; color: var(--accent); display: flex; align-items: center; justify-content: center; gap: 4px;">
      ${emojiPrefix} 氛围感智能建议 (${intentType === 'character' ? '人物' : intentType === 'pet' ? '宠物' : intentType === 'food' ? '美食' : intentType === 'scene' ? '风景' : '物品'})：${description}
    </div>
    <button class="btn btn-success" style="padding: 4px 14px; font-size: 11px; border-radius: 8px; font-weight: 500;" onclick="generateCompanionImage('${memberId}', '${encodeURIComponent(scene)}', '${encodeURIComponent(description)}', '${assistantMsgUid}', this, '${intentType}')">
      🎨 开启视觉陪伴 (生成纪念图)
    </button>
  `;
  bubbles.appendChild(card);
  scrollBottom();
}

// User clicked generate button
async function generateCompanionImage(memberId, sceneDecoded, descriptionDecoded, assistantMsgUid, buttonEl, intentType = 'character') {
  const scene = decodeURIComponent(sceneDecoded);
  const description = decodeURIComponent(descriptionDecoded);
  
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerHTML = '⏳ 正在构建画面...';
  }
  
  // Remove the visual suggestion box to prevent reuse
  const suggestCard = buttonEl ? buttonEl.closest('.visual-suggestion') : null;
  if (suggestCard) suggestCard.remove();
  
  // Show active drawing status
  const loadingDiv = addLoadingDOM();
  
  try {
    const finalPrompt = buildFinalImgPrompt(memberId, scene, intentType);
    
    // Call failover image engine
    const { imgUrl } = await generateImageWithFailover(finalPrompt, null, memberId, intentType);
    
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
async function autoGenerateVisualCompanion(memberId, scene, description, assistantMsgUid, intentType = 'character') {
  // Append loading status
  const loadingDiv = addLoadingDOM();
  try {
    const finalPrompt = buildFinalImgPrompt(memberId, scene, intentType);
    
    // Call failover image engine
    const { imgUrl } = await generateImageWithFailover(finalPrompt, null, memberId, intentType);
    
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
      showVisualSuggestion(memberId, scene, description, assistantMsgUid, intentType);
    }
  } catch (err) {
    loadingDiv.remove();
    console.error('[AutoVisual] Auto draw failed, falling back to suggestion:', err);
    showVisualSuggestion(memberId, scene, description, assistantMsgUid, intentType);
  }
}

// Build visual prompt combining profile and multi-anchor visual intelligence routing
function buildFinalImgPrompt(id, scenePrompt, intentType = 'character') {
  const profile = getCharacterIdentity(id);
  
  if (intentType === 'food') {
    let foodSection = `[Subject Features]
Subject: beautiful food, high culinary detail, delicious presentation, fresh and appetizing.`;

    let sceneSection = `[Scene & Environment]
Action & Setting: ${scenePrompt}`;

    let styleSection = `[Style & Lighting]`;
    if (profile.style) {
      styleSection += `\nArt Style: ${profile.style}`;
    } else {
      styleSection += `\nArt Style: close-up gourmet food photography, soft warm lighting, appetizing mood, morandi pastel color theme`;
    }
    return `${foodSection}\n\n${sceneSection}\n\n${styleSection}`;
  }
  
  if (intentType === 'pet') {
    let petDesc = 'a cute pet';
    let hasPetRef = false;
    if (profile.pet_anchor) {
      hasPetRef = !!profile.pet_anchor.originalImage;
      if (profile.pet_anchor.anchorPromptEn) {
        petDesc = profile.pet_anchor.anchorPromptEn;
      } else if (profile.pet_anchor.visualDescription) {
        petDesc = profile.pet_anchor.visualDescription;
      }
    }
    
    let identitySection = '';
    if (hasPetRef) {
      identitySection = `[Identity]
This is the EXACT same pet animal from the reference image. You must strictly preserve its facial structure, fur color, patterns, and look. Match the features with maximum fidelity.
Priority: Extremely High.`;
    } else {
      identitySection = `[Identity]
Maintain consistent appearance of the described pet animal.`;
    }

    let petSection = `[Subject Features]
Subject: ${petDesc}`;

    let sceneSection = `[Scene & Environment]
Action & Setting: ${scenePrompt}`;

    let styleSection = `[Style & Lighting]`;
    if (profile.style) {
      styleSection += `\nArt Style: ${profile.style}`;
    } else {
      styleSection += `\nArt Style: digital painting, soft cinematic lighting, warm emotional atmosphere, detailed features, morandi pastel color theme`;
    }
    return `${identitySection}\n\n${petSection}\n\n${sceneSection}\n\n${styleSection}`;
  }
  
  if (intentType === 'object') {
    let objDesc = 'a beautiful item';
    let hasObjRef = false;
    if (profile.object_anchor) {
      hasObjRef = !!profile.object_anchor.originalImage;
      if (profile.object_anchor.anchorPromptEn) {
        objDesc = profile.object_anchor.anchorPromptEn;
      } else if (profile.object_anchor.visualDescription) {
        objDesc = profile.object_anchor.visualDescription;
      }
    }
    
    let identitySection = '';
    if (hasObjRef) {
      identitySection = `[Identity]
This is the EXACT same object from the reference image. You must strictly preserve its colors, textures, craftsmanship, and look. Match the object features with maximum fidelity.
Priority: Extremely High.`;
    } else {
      identitySection = `[Identity]
Maintain consistent appearance of the described object.`;
    }

    let objSection = `[Subject Features]
Subject: ${objDesc}`;

    let sceneSection = `[Scene & Environment]
Action & Setting: ${scenePrompt}`;

    let styleSection = `[Style & Lighting]`;
    if (profile.style) {
      styleSection += `\nArt Style: ${profile.style}`;
    } else {
      styleSection += `\nArt Style: digital painting, soft cinematic lighting, warm emotional atmosphere, detailed features, morandi pastel color theme`;
    }
    return `${identitySection}\n\n${objSection}\n\n${sceneSection}\n\n${styleSection}`;
  }
  
  if (intentType === 'scene') {
    let placeDesc = 'a beautiful place';
    let hasPlaceRef = false;
    if (profile.place_anchor) {
      hasPlaceRef = !!profile.place_anchor.originalImage;
      if (profile.place_anchor.anchorPromptEn) {
        placeDesc = profile.place_anchor.anchorPromptEn;
      } else if (profile.place_anchor.visualDescription) {
        placeDesc = profile.place_anchor.visualDescription;
      }
    }
    
    let identitySection = '';
    if (hasPlaceRef) {
      identitySection = `[Identity]
This is the EXACT same room or setting environment from the reference image. You must strictly preserve its architecture, colors, layout, and look. Match the environment features with maximum fidelity.
Priority: Extremely High.`;
    } else {
      identitySection = `[Identity]
Maintain consistent appearance of the described scene.`;
    }

    let placeSection = `[Environment Features]
Base Environment: ${placeDesc}`;

    let sceneSection = `[Scene & Environment]
Action & Setting: ${scenePrompt}`;

    let styleSection = `[Style & Lighting]`;
    if (profile.style) {
      styleSection += `\nArt Style: ${profile.style}`;
    } else {
      styleSection += `\nArt Style: digital painting, soft cinematic lighting, warm emotional atmosphere, detailed environment, morandi pastel color theme`;
    }
    return `${identitySection}\n\n${placeSection}\n\n${sceneSection}\n\n${styleSection}`;
  }

  // Fallback to 'character' mode
  const hasRefImage = Array.isArray(profile.ref_images) && profile.ref_images.length > 0;
  
  let identitySection = '';
  if (hasRefImage) {
    identitySection = `[Identity]
This is the EXACT same person from the reference image. You must strictly preserve their facial identity, structural details, and look. Match the facial features from the provided reference image with maximum fidelity.
Priority: Extremely High. Do not deviate from the reference face.`;
  } else {
    identitySection = `[Identity]
Maintain consistent appearance of the described character.`;
  }

  let faceSection = `[Face Features]
Gender: ${profile.gender || 'female'}, Age: ${profile.age || 'young adult'}.`;
  if (profile.face_anchor) {
    faceSection += `\nFacial Details: ${profile.face_anchor}.`;
  }
  if (profile.hairstyle) {
    faceSection += `\nHairstyle: ${profile.hairstyle}.`;
  }

  let sceneSection = `[Scene & Environment]
Action & Setting: ${scenePrompt}`;
  if (profile.dress) {
    sceneSection += `\nClothing: wearing ${profile.dress}.`;
  }

  let styleSection = `[Style & Lighting]`;
  if (profile.style) {
    styleSection += `\nArt Style: ${profile.style}`;
  } else {
    styleSection += `\nArt Style: digital painting, soft cinematic lighting, warm emotional atmosphere, detailed face, morandi pastel color theme`;
  }
  
  // Combine into a structured, highly prioritized prompt
  const finalPrompt = `${identitySection}

${faceSection}

${sceneSection}

${styleSection}`;

  return finalPrompt;
}

// AI vision-based character visual profiling analyzer
async function analyzeAndSetCharacterAnchor(id, base64Image) {
  showToast('✨ AI 正在深度分析参考图人物五官特征，生成专属人脸一致性锚点档案...');
  
  const sysPrompt = `你是一个专业的 AI 视觉人像分析专家。
请仔细分析用户上传的这张人物参考图（人脸和整体形象），提取出最稳定、最显著、最精准的脸部和外貌特征。
你必须返回一个符合以下结构的 JSON 字符串。
不要包含任何 markdown 标记、\`\`\`json 包裹或多余的解释。

{
  "gender": "英文性别，如 female 或 male",
  "age": "英文年龄感，如 young adult, teenage, 25 years old 等",
  "face_shape": "英文脸型描述，如 oval, round, heart-shaped 等",
  "eyes": "英文眼睛与眼神描述，如 large double-eyelid brown eyes, expressive and gentle",
  "hair": "英文发型发色与细节，如 long wavy brown hair, styled with ponytail",
  "skin": "英文皮肤质感与肤色，如 fair smooth skin, warm peach undertone",
  "unique_features": [
    "中文描述：五官的独特记号或特征1，例如：左眼角有一颗小泪痣",
    "中文描述：特征2，例如：高挺的鼻梁",
    "中文描述：特征3，例如：笑起来有浅浅的酒窝"
  ],
  "dress_style": "英文衣服穿搭风格，如 comfortable casual oversized cream sweater",
  "face_anchor_en": "精炼且特异性极高的英文面部锚点 Prompt（用于生图锁脸）。必须用英语逗号分隔，包含脸型、双眼、嘴唇、五官比例、表情、泪痣/雀斑等独特微小特征，避免 general 词汇如 'beautiful face'。例如: 'oval face, highly detailed big brown eyes, high nose bridge, soft rosy lips, tiny elegant mole near left eye corner, gentle and warm expression'",
  "visual_description_cn": "一段优美、详尽的中文人物外貌特征描写，用于展示在档案中（150字以内）。"
}`;

  try {
    const messages = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: [
        { type: 'text', text: '请分析这张照片并提取出核心人脸和外貌锚点。' },
        { type: 'image_url', image_url: { url: base64Image } }
      ]}
    ];

    // Force using our highly reliable built-in Gemini proxy provider
    const response = await llmComplete(messages, {
      provider: GEMINI_PROVIDER,
      model: 'gemini-3.5-flash',
      temperature: 0.1
    });

    if (!response) {
      throw new Error('AI 未返回任何分析数据');
    }

    let cleaned = response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    }

    const res = JSON.parse(cleaned);
    
    // Save to character identity
    const prof = getCharacterIdentity(id);
    
    // Level 2: Human visual description profile
    prof.appearance_profile = {
      face_shape: res.face_shape || '',
      eyes: res.eyes || '',
      hair: res.hair || '',
      skin: res.skin || '',
      age: res.age || '',
      unique_features: Array.isArray(res.unique_features) ? res.unique_features : []
    };

    // Level 3: Anchor info
    prof.character_anchor = {
      originalImage: base64Image,
      visualDescription: res.visual_description_cn || '',
      faceFeatures: prof.appearance_profile,
      createdTime: Date.now()
    };

    // Auto-fill standard visual profile properties
    if (res.gender) prof.gender = res.gender;
    if (res.age) prof.age = res.age;
    if (res.face_anchor_en) prof.face_anchor = res.face_anchor_en;
    if (res.hair) prof.hairstyle = res.hair;
    if (res.dress_style) prof.dress = res.dress_style;

    saveCharacterIdentity(id, prof);
    
    // Trigger render if setting panel is open
    if (typeof renderCharacterProfileDetails === 'function') {
      renderCharacterProfileDetails(id);
    }
    
    showToast('✨ AI 深度视觉分析已完成！成功生成高精度人脸一致性锚点特征档案。');
  } catch (e) {
    console.error('[VisionAnalysis] Failed to analyze character ref photo:', e);
    showToast('⚠️ AI 人像特征分析失败（将使用普通模式保存）：' + e.message);
  }
}
window.analyzeAndSetCharacterAnchor = analyzeAndSetCharacterAnchor;

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

// AI vision-based multi-anchor analyzer for Pets, Objects, and Places
async function analyzeAndSetOtherAnchor(id, type, base64Image) {
  let anchorName = '宠物';
  if (type === 'object') anchorName = '物品';
  if (type === 'place') anchorName = '空间';
  
  showToast(`✨ AI 正在深度分析参考图${anchorName}特征，生成专属一致性锚点档案...`);
  
  let sysPrompt = '';
  if (type === 'pet') {
    sysPrompt = `你是一个专业的 AI 宠物/动物形象分析专家。
请仔细分析用户上传的这张宠物参考图，提取出最稳定、最显著、最精准的动物品种、毛发颜色、面部花纹、眼睛颜色和独特外貌特征。
你必须返回一个符合以下结构的 JSON 字符串。
不要包含任何 markdown 标记、\`\`\`json 包裹或多余的解释。

{
  "species": "英文品种或物种，例如 orange tabby cat, golden retriever puppy, cute red fox 等",
  "fur": "英文毛发细节，例如 fluffy thick ginger fur, white patch on the chest",
  "eyes": "英文眼睛描述，例如 round green sparkling eyes",
  "unique_features": [
    "中文描述：品种与毛色特征，例如：橘黄色条纹，胸口有一块白色爱心花纹",
    "中文描述：耳朵与尾巴特征，例如：耳朵尖是白色的，尾巴蓬松"
  ],
  "visual_description_cn": "一段优美的、100字以内的中文宠物形象描述，用于展示在档案中。",
  "anchor_prompt_en": "精炼且特异性极高的英文宠物锚点 Prompt。例如: 'fluffy ginger tabby cat, green sparkling eyes, white chest patch, highly detailed fur texture'"
}`;
  } else if (type === 'object') {
    sysPrompt = `你是一个专业的 3D 物品/静态物件分析专家。
请仔细分析用户上传的这张物品参考图，提取出材质、颜色、纹理、结构和独特细节。
你必须返回一个符合以下结构的 JSON 字符串。
不要包含任何 markdown 标记、\`\`\`json 包裹或多余的解释。

{
  "name": "英文物品名称，例如 leatherbound vintage diary, handmade ceramic tea cup",
  "material": "英文材质与质感，例如 worn brown leather, polished gold accents, glossy ceramic glaze",
  "color": "英文色彩搭配，例如 deep cognac brown, aged golden bronze",
  "unique_features": [
    "中文描述：外观纹理，例如：封面上雕刻着一片精美的枫叶纹路",
    "中文描述：配件细节，例如：带有一条铜质的书签带"
  ],
  "visual_description_cn": "一段优美的、100字以内的中文物品细节描述，用于展示在档案中。",
  "anchor_prompt_en": "精炼且特异性极高的英文物品锚点 Prompt。例如: 'vintage cognac leather notebook, embossed maple leaf pattern, brass clasp, aged paper edges, warm lighting'"
}`;
  } else if (type === 'place') {
    sysPrompt = `你是一个专业的 室内设计/场景环境分析专家。
请仔细分析用户上传的这张场景空间参考图，提取出空间布局、家具风格、主色调、光影氛围和标志性摆设。
你必须返回一个符合以下结构的 JSON 字符串。
不要包含任何 markdown 标记、\`\`\`json 包裹或多余的解释。

{
  "name": "英文空间名称，例如 cozy warm-toned reading cabin, minimalist modern study corner",
  "style": "英文装修风格与氛围，例如 rustic warm cabin, minimalist modern, vintage retro, soft warm light",
  "layout": "英文布局摆设，例如 wooden bookshelf filled with books, leather armchair near fireplace",
  "unique_features": [
    "中文描述：空间特质，例如：背景中有一面巨大的落地窗，透出暖黄色的落日余晖",
    "中文描述：装饰细节，例如：墙壁上挂着一幅复古油画，桌面上点着一盏香薰蜡烛"
  ],
  "visual_description_cn": "一段优美的、100字以内的中文空间氛围描述，用于展示在档案中。",
  "anchor_prompt_en": "精炼且特异性极高的英文空间锚点 Prompt。例如: 'cozy warm reading room, floor-to-ceiling bookshelf, fireplace glowing, soft leather armchair, amber cinematic lighting'"
}`;
  }

  try {
    const messages = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: [
        { type: 'text', text: `请分析这张照片并提取出核心${anchorName}锚点。` },
        { type: 'image_url', image_url: { url: base64Image } }
      ]}
    ];

    const response = await llmComplete(messages, {
      provider: typeof GEMINI_PROVIDER !== 'undefined' ? GEMINI_PROVIDER : 'gemini',
      model: 'gemini-3.5-flash',
      temperature: 0.1
    });

    if (!response) {
      throw new Error('AI 未返回任何分析数据');
    }

    let cleaned = response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    }

    const res = JSON.parse(cleaned);
    
    const prof = getCharacterIdentity(id);
    const anchorKey = `${type}_anchor`;
    
    prof[anchorKey] = {
      originalImage: base64Image,
      visualDescription: res.visual_description_cn || '',
      anchorPromptEn: res.anchor_prompt_en || '',
      features: res,
      createdTime: Date.now()
    };

    saveCharacterIdentity(id, prof);
    
    if (typeof renderCharacterProfileDetails === 'function') {
      renderCharacterProfileDetails(id);
    }
    
    showToast(`✨ AI 深度视觉分析已完成！成功生成高精度${anchorName}一致性锚点特征档案。`);
  } catch (e) {
    console.error('[VisionAnalysis] Failed to analyze reference photo:', e);
    
    // Direct save fallback
    const prof = getCharacterIdentity(id);
    const anchorKey = `${type}_anchor`;
    prof[anchorKey] = {
      originalImage: base64Image,
      visualDescription: '已保存参考图',
      anchorPromptEn: type === 'pet' ? 'cute fluffy pet' : type === 'object' ? 'beautiful object' : 'cozy room',
      features: {},
      createdTime: Date.now()
    };
    saveCharacterIdentity(id, prof);
    
    if (typeof renderCharacterProfileDetails === 'function') {
      renderCharacterProfileDetails(id);
    }
    
    showToast(`⚠️ AI 特征分析失败（已使用普通模式保存）：` + e.message);
  }
}
window.analyzeAndSetOtherAnchor = analyzeAndSetOtherAnchor;


