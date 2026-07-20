/* ===== 生图 ===== */
const OPENAI_IMAGE_DEFAULT_MODEL = 'gpt-image-2';
const LEGACY_OPENAI_IMAGE_MODELS = ['Kwai-Kolors/Kolors', 'black-forest-labs/FLUX.1-schnell', 'dall-e-3'];
const OPENAI_IMAGE_DEFAULT_MODELS = [OPENAI_IMAGE_DEFAULT_MODEL, ...LEGACY_OPENAI_IMAGE_MODELS];

function getImgInterfaces(){
  let l=null;
  try{
    l=JSON.parse(localStorage.getItem('img_interfaces_list'));
  }catch(e){}
  if(!Array.isArray(l)){
    l=[
      {id:'free', name:'免费 · Pollinations（无需Key）', type:'free', url:'', key:'', models:['pollinations-default'], selectedModel:'pollinations-default'},
      {id:'gemini', name:'收费 · Gemini 原生(:generateContent)', type:'gemini', url:'https://api.vectorengine.cn', key:'', models:['gemini-3.1-flash-image-preview', 'imagen-3.0-generate-002'], selectedModel:'gemini-3.1-flash-image-preview'},
      {id:'openai', name:'收费 · OpenAI(/v1/images/generations)', type:'openai', url:'https://api.vectorengine.cn/v1', key:'', models:OPENAI_IMAGE_DEFAULT_MODELS.slice(), selectedModel:OPENAI_IMAGE_DEFAULT_MODEL},
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
        item.models = OPENAI_IMAGE_DEFAULT_MODELS.slice();
      } else if (item.type === 'chat') {
        item.models = ['gemini-1.5-flash', 'gpt-4o'];
      } else {
        item.models = ['Kwai-Kolors/Kolors'];
      }
      updated = true;
    }
    if (item.type === 'openai') {
      const seededKey = 'img_openai_default_models_seeded_v2';
      if (!localStorage.getItem(seededKey)) {
        OPENAI_IMAGE_DEFAULT_MODELS.slice().reverse().forEach(model => {
          if (!item.models.includes(model)) {
            item.models.unshift(model);
            updated = true;
          }
        });
      }
      const storedModel = localStorage.getItem('img_model') || '';
      if (storedModel && item.models.includes(storedModel)) {
        item.selectedModel = storedModel;
        updated = true;
      }
      if (!item.selectedModel) {
        item.selectedModel = item.models[0] || OPENAI_IMAGE_DEFAULT_MODEL;
        updated = true;
      }
    }
    if (!item.selectedModel) {
      item.selectedModel = item.models[0] || '';
      updated = true;
    }
  });
  if (updated) {
    localStorage.setItem('img_interfaces_list', JSON.stringify(l));
  }
  if (!localStorage.getItem('img_openai_default_models_seeded_v2')) {
    localStorage.setItem('img_openai_default_models_seeded_v2', 'true');
  }
  const activeId = localStorage.getItem('img_interface_id') || 'free';
  const activeItem = l.find(item => item.id === activeId);
  if (activeItem && activeItem.type === 'openai') {
    localStorage.setItem('img_gen_mode', 'openai');
    localStorage.setItem('img_model', activeItem.selectedModel || OPENAI_IMAGE_DEFAULT_MODEL);
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
    url: 'https://api.vectorengine.cn/v1',
    key: '',
    models: OPENAI_IMAGE_DEFAULT_MODELS.slice(),
    selectedModel: OPENAI_IMAGE_DEFAULT_MODEL
  };
  list.push(newItem);
  saveImgInterfaces(list);
  
  localStorage.setItem('img_interface_id', newId);
  localStorage.setItem('img_gen_mode', 'openai');
  localStorage.setItem('img_url', 'https://api.vectorengine.cn/v1');
  localStorage.setItem('img_key', '');
  localStorage.setItem('img_model', OPENAI_IMAGE_DEFAULT_MODEL);
  
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
      item.models = OPENAI_IMAGE_DEFAULT_MODELS.slice();
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

function getEffectiveImageEndpoint(iface) {
  if (!iface) return '';
  const type = iface.type || '';
  const model = (iface.selectedModel || (iface.models && iface.models[0]) || '').trim();
  const base = String(iface.url || '').trim().replace(/\/+$/, '');
  if (type === 'openai') return buildOpenAIImagesGenerationUrl(base);
  if (type === 'gemini') return base.includes(':generateContent') || base.includes('/v1beta/') ? base : `${base}/v1beta/models/${model}:generateContent`;
  if (type === 'chat') return base.includes('/chat/completions') || base.includes('/v1/chat/completions') ? base : `${base}/v1/chat/completions`;
  return 'Pollinations direct image URL';
}
function openImgGen(){document.getElementById('actionMenu').classList.remove('show');if(!imgEnabled()){showToast('🎨 生图已关闭，请在生图设置开启');return;}const curr=getActiveImgInterface();const model=(curr.selectedModel||(curr.models&&curr.models[0])||'').trim();const hint=`当前：${curr.name}${model?' · '+model:''} · ${getEffectiveImageEndpoint(curr)}`;document.getElementById('imgGenModeHint').textContent=hint;clearGenInit();document.getElementById('imgGenPrompt').value='';document.getElementById('imgGenPanel').classList.add('show');}
function handleGenInit(input){const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=e=>{pendingGenInit=e.target.result;document.getElementById('imgInitThumb').src=pendingGenInit;document.getElementById('imgInitPrev').classList.add('show');};r.readAsDataURL(f);input.value='';}
function clearGenInit(){pendingGenInit=null;document.getElementById('imgInitPrev').classList.remove('show');document.getElementById('imgInitThumb').src='';}

function isDirectImageCommand(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (/^(生成|画|绘制|做|发|来|给我|帮我|想看|看看|show me|generate|draw|create|make)/i.test(raw) && /(图|图片|照片|插画|壁纸|海报|头像|自拍|人像|风景|食物|动物|猫|狗|狐狸|蛋糕|咖啡|下午茶|海边|日落|星空|landscape|image|picture|photo|portrait|selfie|wallpaper|poster)/i.test(raw)) return true;
  if (/(生成|画|绘制|做|发|来|给我|帮我|想看|看看).{0,12}(一张|个|幅|些)?(图|图片|照片|插画|壁纸|海报|头像)/i.test(raw)) return true;
  if (/(风景图|食物图|动物图|头像图|海边图|日落图|猫咪图|照片)$/i.test(raw)) return true;
  return false;
}

function normalizeDirectImagePrompt(text) {
  let prompt = String(text || '').trim();
  prompt = prompt.replace(/^(请|麻烦|可以)?(帮我|给我)?(生成|画|绘制|做|发|来|看看|想看)\s*(一张|一个|一幅|些)?/i, '');
  prompt = prompt.replace(/^(show me|generate|draw|create|make)\s+(a|an|some)?\s*/i, '');
  return prompt.trim() || String(text || '').trim();
}

function extractImagePromptFromActionText(text) {
  const raw = String(text || '').trim();
  if (!/dalle\.text2im|text2im|image-generation/i.test(raw)) return '';
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const obj = JSON.parse(cleaned.slice(start, end + 1));
      const input = obj.action_input;
      if (typeof input === 'string') {
        const parsedInput = JSON.parse(input);
        if (parsedInput && parsedInput.prompt) return String(parsedInput.prompt).trim();
      } else if (input && input.prompt) {
        return String(input.prompt).trim();
      }
    }
  } catch(e) {}
  const m = cleaned.match(/\\?"prompt\\?"\s*:\s*\\?"([^"\\]+(?:\\.[^"\\]*)*)/i);
  if (m && m[1]) {
    try { return JSON.parse('"' + m[1].replace(/"/g, '\\"') + '"').trim(); } catch(e) { return m[1].trim(); }
  }
  return '';
}

async function handleDirectImageCommand(text, initImg = null, options = {}) {
  if (!isDirectImageCommand(text)) return false;
  if (typeof imgEnabled === 'function' && !imgEnabled()) {
    addMessage('assistant', '🎨 生图已关闭，请先在生图设置里开启。', genUid());
    return true;
  }
  const promptText = normalizeDirectImagePrompt(text);
  const loading = addLoadingDOM();
  try {
    const activeAi = (typeof currentPrivateAiId === 'function') ? currentPrivateAiId() : 'main';
    const { imgUrl } = await generateImageWithFailover(promptText, initImg, activeAi, { source: 'chat-direct-image-command' });
    loading.remove();
    const uid = genUid();
    const ts = Date.now();
    conversationHistory.push({ role:'assistant', content:'[图片] ' + promptText, image:imgUrl, uid, ts });
    renderImageMessage('assistant', imgUrl, uid, ts);
    saveHistory();
    return true;
  } catch(e) {
    loading.remove();
    addMessage('assistant', '❌ 生图失败: ' + formatImageGenerationError(e), genUid());
    return true;
  }
}

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
    addMessage('assistant','❌ 生图失败: '+formatImageGenerationError(e),genUid());
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

window.VisualIdentityDB = {
  DB_NAME: 'LovestoryVisualIdentityDB',
  VERSION: 1,
  STORES: ['characters'],
  _db: null,
  _cache: { characters: {} },

  async init() {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        this._loadLegacyFallback();
        resolve();
        return;
      }
      try {
        const req = window.indexedDB.open(this.DB_NAME, this.VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          this.STORES.forEach(store => {
            if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
          });
        };
        req.onsuccess = async (e) => {
          this._db = e.target.result;
          await this._loadAll();
          this._loadLegacyFallback();
          await this._migrateCharacters();
          resolve();
        };
        req.onerror = () => {
          this._loadLegacyFallback();
          resolve();
        };
      } catch(e) {
        this._loadLegacyFallback();
        resolve();
      }
    });
  },

  _loadLegacyFallback() {
    try {
      const raw = localStorage.getItem('character_identities');
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object') {
        this._cache.characters = { ...this._cache.characters, ...parsed };
      }
    } catch(e) {}
  },

  async _loadAll() {
    if (!this._db) return;
    await Promise.all(this.STORES.map(store => new Promise(resolve => {
      try {
        const tx = this._db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => {
          const map = {};
          (req.result || []).forEach(item => { if (item && item.id) map[item.id] = item; });
          this._cache[store] = map;
          resolve();
        };
        req.onerror = () => resolve();
      } catch(e) {
        resolve();
      }
    })));
  },

  async _migrateCharacters() {
    const legacy = this._cache.characters || {};
    for (const id of Object.keys(legacy)) {
      await this.put('characters', legacy[id]);
    }
  },

  get(store, id) {
    return (this._cache[store] || {})[id] || null;
  },

  getAll(store) {
    return this._cache[store] || {};
  },

  async put(store, item) {
    if (!this.STORES.includes(store) || !item || !item.id) return false;
    if (!this._cache[store]) this._cache[store] = {};
    this._cache[store][item.id] = item;
    if (store === 'characters') {
      try { localStorage.setItem('character_identities', JSON.stringify(this._cache.characters)); } catch(e) {}
    }
    if (!this._db) return true;
    return new Promise(resolve => {
      try {
        const tx = this._db.transaction(store, 'readwrite');
        tx.objectStore(store).put(item);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch(e) {
        resolve(false);
      }
    });
  },

  async remove(store, id) {
    if (!this.STORES.includes(store) || !id) return false;
    if (this._cache[store]) delete this._cache[store][id];
    if (!this._db) return true;
    return new Promise(resolve => {
      try {
        const tx = this._db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch(e) {
        resolve(false);
      }
    });
  }
};

if (typeof window !== 'undefined') {
  window.VisualIdentityDB.init();
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

function normalizeGeneratedImageValue(value, fallbackMime = 'image/png') {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^data:image\/[^;]+;base64,/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed) || /^blob:/i.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/\s+/g, '');
  if (compact.length > 200 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return `data:${fallbackMime};base64,${compact}`;
  }
  return '';
}

function formatImageGenerationError(err) {
  const msg = String(err && err.message ? err.message : err || '');
  if (/429|负载|限流|quota|rate limit|too many requests/i.test(msg)) {
    return '接口返回 429/上游负载或限流，不是 PWA 浏览器拦截。请稍后重试，或在生图设置里切换其它可用上游。原始错误：' + msg;
  }
  if (/Failed to fetch|CORS|image URL cannot be rendered|image load timeout|image fetch/i.test(msg)) {
    return '图片请求已返回，但浏览器无法直接加载图片资源，通常是临时 URL 不允许跨域/外链访问。纯前端 PWA 无法代替服务端取图，请优先使用返回 base64 的生图接口。原始错误：' + msg;
  }
  return msg || '未知错误';
}

function extractGeneratedImageFromText(text) {
  if (!text || typeof text !== 'string') return '';
  const markdownMatch = text.match(/!\[[^\]]*]\(([^)\s]+)\)/);
  if (markdownMatch) return normalizeGeneratedImageValue(markdownMatch[1]);
  const dataMatch = text.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+/i);
  if (dataMatch) return normalizeGeneratedImageValue(dataMatch[0]);
  const urlMatch = text.match(/https?:\/\/[^\s"'<>）)]+/i);
  if (urlMatch) return normalizeGeneratedImageValue(urlMatch[0]);
  return normalizeGeneratedImageValue(text);
}

function extractGeneratedImageFromResponse(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return extractGeneratedImageFromText(payload);
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const extracted = extractGeneratedImageFromResponse(item);
      if (extracted) return extracted;
    }
    return '';
  }
  if (typeof payload !== 'object') return '';

  const directCandidates = [
    payload.url,
    payload.output_url,
    payload.image_url?.url,
    payload.image_url,
    payload.image,
    payload.b64_json,
    payload.base64,
    payload.data_url,
    payload.inlineData?.data,
    payload.inline_data?.data,
    payload.source?.url
  ];
  for (const candidate of directCandidates) {
    const mimeType = payload.mimeType || payload.mime_type || payload.inlineData?.mimeType || payload.inline_data?.mime_type || 'image/png';
    const normalized = normalizeGeneratedImageValue(candidate, mimeType);
    if (normalized) return normalized;
  }

  const nestedCandidates = [
    payload.data,
    payload.images,
    payload.artifacts,
    payload.output,
    payload.outputs,
    payload.result,
    payload.results,
    payload.candidates,
    payload.choices,
    payload.message,
    payload.content,
    payload.parts
  ];
  for (const nested of nestedCandidates) {
    const extracted = extractGeneratedImageFromResponse(nested);
    if (extracted) return extracted;
  }
  return '';
}

function imageUrlToDataUrl(url, key) {
  return fetch(url, {
    headers: {
      Accept: 'image/*',
      ...(key ? { Authorization: `Bearer ${key}` } : {})
    }
  }).then(response => {
    if (!response.ok) throw new Error(`image fetch ${response.status}`);
    return response.blob();
  }).then(blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }));
}

function waitForRenderableImage(src, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error('image load timeout'));
    }, timeoutMs);
    image.onload = () => {
      clearTimeout(timer);
      resolve(src);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('image URL cannot be rendered by <img>'));
    };
    image.referrerPolicy = 'no-referrer';
    image.src = src;
  });
}

async function ensureRenderableGeneratedImage(imgUrl, key = '') {
  const normalized = normalizeGeneratedImageValue(imgUrl);
  if (!normalized) return '';
  if (normalized.startsWith('data:') || normalized.startsWith('blob:')) return normalized;
  if (!/^https?:\/\//i.test(normalized)) return normalized;

  try {
    await waitForRenderableImage(normalized);
    return normalized;
  } catch (loadError) {
    if (!key) throw loadError;
    return imageUrlToDataUrl(normalized, key);
  }
}

const IMAGE_INTENT_CACHE = new Map();

function normalizeIntentText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 240);
}

function createImageIntent(type, overrides = {}) {
  const normalizedType = type === 'pet' ? 'animal' : type;
  const noReference = ['food', 'scene', 'object', 'animal'].includes(normalizedType);
  return {
    type: normalizedType,
    needReference: noReference ? false : !!overrides.needReference,
    anchorKind: noReference ? null : (overrides.anchorKind || (normalizedType === 'character' ? 'character' : null)),
    subjectId: overrides.subjectId || null,
    reason: overrides.reason || 'rule'
  };
}

function promptMentionsUserFace(promptText) {
  return /(我的自拍|我的照片|我自己|用户照片|给我拍|画我|把我|user photo|my selfie|my portrait|photo of me|portrait of me)/i.test(String(promptText || ''));
}

function promptMentionsUserTogether(promptText) {
  return /(和我|我们|一起|合照|with me|together|couple)/i.test(String(promptText || ''));
}

function analyzeImageIntentByRules(promptText, context = {}) {
  const raw = String(promptText || '');
  const text = normalizeIntentText(raw);
  const hasOwnPet = /(我的|my|our|咱家|家里).{0,8}(猫|猫咪|狗|狗狗|宠物|pet|cat|dog)/i.test(raw);
  const hasCharacter = /(自拍|合照|人像|伴侣|小艾|小暖|阿灿|AI|ai|女孩|男孩|女生|男生|woman|man|girl|boy|portrait|selfie|together|couple|with me|和我|我们|一起)/i.test(raw);
  const hasFood = /(蛋糕|下午茶|咖啡|奶茶|甜点|餐|饭|面包|寿司|披萨|茶|cake|tea|coffee|latte|food|dessert|meal|bread|pizza|sushi)/i.test(raw);
  const hasScene = /(海边|日落|风景|山|森林|街道|城市|夜空|星空|房间|海|湖|花园|公园|beach|sunset|landscape|forest|mountain|city|street|sky|room|garden|park)/i.test(raw);
  const hasAnimal = /(狐狸|猫|猫咪|狗|狗狗|兔|鸟|动物|fox|cat|dog|rabbit|bird|animal)/i.test(raw);
  const hasObject = /(杯子|包|书|手机|戒指|车|衣服|裙子|物品|收藏|cup|bag|book|phone|ring|car|dress|object|product)/i.test(raw);
  const hasFantasy = /(幻想|梦境|魔法|赛博|精灵|异世界|fantasy|dream|magic|cyberpunk|fairy)/i.test(raw);

  const hasUserFace = promptMentionsUserFace(raw);
  const hasTogether = promptMentionsUserTogether(raw);

  if (hasFood && !hasCharacter && !hasUserFace) return createImageIntent('food', { reason: 'food keyword' });
  if (hasOwnPet) return createImageIntent('animal', { reason: 'own pet keyword, no face anchor' });
  if (hasAnimal && !hasCharacter) return createImageIntent('animal', { reason: 'generic animal keyword' });
  if (hasScene && !hasCharacter && !hasOwnPet) return createImageIntent('scene', { reason: 'scene keyword' });
  if (hasObject && !hasCharacter && !hasOwnPet) return createImageIntent('object', { reason: 'object keyword' });
  if (hasCharacter || hasUserFace) return createImageIntent('character', { needReference: true, anchorKind: 'character', subjectId: (hasUserFace && !hasTogether) ? 'user' : (context.memberId || 'main'), reason: hasUserFace ? 'user face keyword' : 'character keyword' });
  if (hasFantasy) return createImageIntent('fantasy', { needReference: false, anchorKind: null, reason: 'fantasy keyword' });
  return createImageIntent('scene', { reason: 'default safe scene' });
}

async function analyzeImageIntent(promptText, context = {}) {
  const key = normalizeIntentText(promptText) + '|' + (context.memberId || '') + '|' + (context.source || '');
  if (IMAGE_INTENT_CACHE.has(key)) return IMAGE_INTENT_CACHE.get(key);
  let intent = analyzeImageIntentByRules(promptText, context);

  if (context.allowLLM && context.ambiguous && typeof llmComplete === 'function') {
    try {
      const prompt = `Classify this image request. Return compact JSON only with type, needReference, anchorKind, reason. Types: character, animal, food, scene, object, fantasy. Use character only for main AI, sub AI, user, portraits, selfies, or group photos. Pets and all animals must be animal with needReference false.\nRequest: ${String(promptText || '').slice(0, 500)}`;
      const response = await llmComplete([{ role: 'user', content: prompt }], { temperature: 0, callerId: 'image-intent-classification', priority: 1 });
      let jsonText = String(response || '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(jsonText);
      if (parsed && parsed.type) {
        intent = createImageIntent(parsed.type, {
          needReference: !!parsed.needReference,
          anchorKind: parsed.anchorKind || null,
          subjectId: parsed.subjectId || context.memberId || null,
          reason: parsed.reason || 'llm'
        });
      }
    } catch(e) {
      console.warn('[ImageIntent] LLM classification failed, using rule intent:', e);
    }
  }

  IMAGE_INTENT_CACHE.set(key, intent);
  if (window.recordTokenTelemetry) {
    recordTokenTelemetry({
      caller: 'image-intent',
      input: promptText,
      output: JSON.stringify(intent),
      meta: { source: context.source || '', rule: intent.reason }
    });
  }
  return intent;
}

function getDefaultCharacterIdentity(id){
  const isMain=(id==='main');
  const isUser=(id==='user');
  return {
    id:id,
    gender:isUser?'': 'female',
    age:'young adult',
    style:'digital painting, soft lighting, detailed face, morandi pastel color theme',
    face_anchor:isUser?'':(isMain?'delicate features, expressive beautiful eyes, warm gentle smile':'cute features, cheerful smile'),
    hairstyle:isUser?'':(isMain?'long flowing brown ponytail':'short dark neat bob cut'),
    dress:isUser?'':'comfortable casual sweater',
    ref_images:[]
  };
}

function describeFaceProfile(profile, fallbackLabel) {
  if (!profile) return fallbackLabel;
  const parts = [fallbackLabel];
  if (profile.gender) parts.push(profile.gender);
  if (profile.age) parts.push(profile.age);
  if (profile.face_anchor) parts.push(profile.face_anchor);
  if (profile.hairstyle) parts.push(`with ${profile.hairstyle}`);
  if (profile.dress) parts.push(`wearing ${profile.dress}`);
  return parts.filter(Boolean).join(', ');
}

function buildCharacterPrompt(id, scenePrompt, options = {}) {
  const profile = getCharacterIdentity(id);
  const includeUser = !!options.includeUser && id !== 'user';
  let characterDesc = describeFaceProfile(profile, id === 'user' ? 'user' : 'AI companion');
  if (includeUser) {
    const userProfile = getCharacterIdentity('user');
    characterDesc = `two-person scene, AI companion: ${characterDesc}; user: ${describeFaceProfile(userProfile, 'user')}`;
  }
  let finalPrompt = `masterpiece, highly detailed, ${characterDesc}, ${scenePrompt}`;
  finalPrompt += profile.style ? `, ${profile.style}` : ', digital painting, soft cinematic lighting, warm emotional atmosphere';
  return finalPrompt;
}

async function buildVisualGenerationRequest(promptText, initImg = null, memberId = 'main', options = {}) {
  const intent = options.intent || await analyzeImageIntent(promptText, { memberId, source: options.source, allowLLM: !!options.allowLLM, ambiguous: !!options.ambiguous });
  let finalPrompt = String(promptText || '').trim();
  let refImg = initImg || null;

  if (intent.type === 'character' || (intent.type === 'fantasy' && intent.anchorKind === 'character')) {
    const profile = getCharacterIdentity(intent.subjectId || memberId || 'main') || {};
    const subjectId = intent.subjectId || memberId || 'main';
    finalPrompt = buildCharacterPrompt(subjectId, finalPrompt, { includeUser: promptMentionsUserTogether(promptText) });
    if (!refImg && Array.isArray(profile.ref_images) && profile.ref_images.length > 0) refImg = profile.ref_images[0];
    if (!refImg && subjectId !== 'user' && promptMentionsUserTogether(promptText)) {
      const userProfile = getCharacterIdentity('user') || {};
      if (Array.isArray(userProfile.ref_images) && userProfile.ref_images.length > 0) refImg = userProfile.ref_images[0];
    }
  } else if (['food', 'scene', 'object', 'animal', 'pet'].includes(intent.type)) {
    finalPrompt = `${finalPrompt}, high detail, natural composition, no humans, no person, no portrait, no face anchor`;
    refImg = null;
  } else {
    finalPrompt = `${finalPrompt}, high detail, coherent composition`;
  }

  return { promptText: finalPrompt, refImg, intent };
}

const IMAGE_GENERATION_INFLIGHT = new Map();

function imageRequestHash(text) {
  const s = String(text || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function buildOpenAIImagesGenerationUrl(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '/v1/images/generations';
  if (/\/images\/generations$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/images/generations`;
  return `${base}/v1/images/generations`;
}

async function generateImageWithFailover(promptText, initImg = null, memberId = 'main', options = {}) {
  const visualRequest = await buildVisualGenerationRequest(promptText, initImg, memberId, options);
  promptText = visualRequest.promptText;
  initImg = visualRequest.refImg;
  const active = getActiveImgInterface();
  const tryQueue = [active];

  let lastError = null;
  const { w, h } = getImgWH();
  const refImg = initImg || null;
  const requestKey = `${active.id || active.name || active.type}|${active.selectedModel || ''}|${w}x${h}|${imageRequestHash(promptText)}|${refImg ? imageRequestHash(refImg.slice(0, 512)) : 'no-ref'}`;
  if (IMAGE_GENERATION_INFLIGHT.has(requestKey)) {
    console.warn('[API Dedup] Reusing in-flight image generation request.');
    return await IMAGE_GENERATION_INFLIGHT.get(requestKey);
  }

  const runPromise = (async () => {

  for (const prov of tryQueue) {
    const mode = prov.type;
    console.log(`[ImageFailover] Attempting image generation with provider: ${prov.name || mode}`);

    if (mode !== 'free' && (!prov.key || !prov.key.trim())) {
      throw new Error(`当前生图接口「${prov.name || mode}」未配置 API Key，已停止请求，不会自动切换到免费模型`);
    }

    const maxRetries = 1;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let imgUrl = null;
        let authKey = '';
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
          authKey = key;
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
            if (!imgUrl) imgUrl = extractGeneratedImageFromResponse(d);
            if (!imgUrl) throw new Error('Gemini did not return image data');
          } else if (mode === 'openai') {
            const ourl = buildOpenAIImagesGenerationUrl(base);
            const r = await fetch(ourl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
              body: JSON.stringify({ model, prompt: promptText, size: `${w}x${h}`, n: 1 })
            });
            if (!r.ok) {
              const t = await r.text();
              throw new Error(`OpenAI Error (${r.status}): ${t.slice(0, 100)}`);
            }
            const d = await r.json();
            imgUrl = extractGeneratedImageFromResponse(d);
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
            imgUrl = extractGeneratedImageFromResponse(d);
            if (!imgUrl) throw new Error('Chat model did not return image format');
          }
        }

        if (imgUrl) {
          try {
            imgUrl = await ensureRenderableGeneratedImage(imgUrl, authKey);
          } catch (renderError) {
            renderError.generatedImageReceived = true;
            throw renderError;
          }
          console.log(`[ImageFailover] Successfully generated image using: ${prov.name || mode}`);
          return { imgUrl, providerName: prov.name || mode };
        }
      } catch (err) {
        lastError = err;
        console.warn(`[ImageFailover] Attempt ${attempt} failed for provider ${prov.name || mode}: ${err.message}`);
        if (err && err.generatedImageReceived) {
          throw err;
        }
      }
    }
  }

  throw lastError || new Error('Image generation failed');
  })();

  IMAGE_GENERATION_INFLIGHT.set(requestKey, runPromise);
  try {
    return await runPromise;
  } finally {
    IMAGE_GENERATION_INFLIGHT.delete(requestKey);
  }
}
window.generateImageWithFailover = generateImageWithFailover;
window.analyzeImageIntent = analyzeImageIntent;
window.buildVisualGenerationRequest = buildVisualGenerationRequest;
window.buildFinalImgPrompt = buildFinalImgPrompt;

function imgPermissionMode() {
  return localStorage.getItem('img_permission_mode') || 'off';
}

function getCharacterIdentities(){
  if (window.VisualIdentityDB) return window.VisualIdentityDB.getAll('characters');
  return window.LovestoryCharacterDB.getAll();
}

function saveCharacterIdentities(map){
  for (const key of Object.keys(map)) {
    saveCharacterIdentity(key, map[key]);
  }
}

function getCharacterIdentity(id){
  let char = window.VisualIdentityDB ? window.VisualIdentityDB.get('characters', id) : null;
  if (!char && window.LovestoryCharacterDB) char = window.LovestoryCharacterDB.get(id);
  if(!char){
    char = getDefaultCharacterIdentity(id);
    saveCharacterIdentity(id, char);
  }
  return char;
}

function saveCharacterIdentity(id,data){
  const normalized = { ...data, id: data.id || id };
  if (window.VisualIdentityDB) window.VisualIdentityDB.put('characters', normalized);
  if (window.LovestoryCharacterDB) window.LovestoryCharacterDB.put(normalized);
}

// Check and trigger visual analysis in background after AI responds
async function triggerVisualEvaluation(userText, aiReply, memberId, assistantMsgUid) {
  const mode = imgPermissionMode();
  if (mode === 'off') return;
  const lastEvalAt = Number(localStorage.getItem('visual_eval_last_at') || '0');
  if (Date.now() - lastEvalAt < 45000) {
    console.log('[VisualEvaluation] Skipped by rate limit.');
    return;
  }
  
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
    localStorage.setItem('visual_eval_last_at', String(Date.now()));
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
    ], { temperature: 0.3, callerId: 'visual-evaluation', priority: 1 });
    
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
  
  // Remove the visual suggestion box to prevent reuse
  const suggestCard = buttonEl ? buttonEl.closest('.visual-suggestion') : null;
  if (suggestCard) suggestCard.remove();
  
  // Show active drawing status
  const loadingDiv = addLoadingDOM();
  
  try {
    const intent = await analyzeImageIntent(`${description}\n${scene}`, { memberId, source: 'visual-companion' });
    
    // Call failover image engine
    const { imgUrl } = await generateImageWithFailover(scene, null, memberId, { source: 'visual-companion', intent });
    
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
    addMessage('assistant', `❌ 生图失败: ${formatImageGenerationError(err)}`, genUid());
  }
}

// Auto generate mode
async function autoGenerateVisualCompanion(memberId, scene, description, assistantMsgUid) {
  // Append loading status
  const loadingDiv = addLoadingDOM();
  try {
    const intent = await analyzeImageIntent(`${description}\n${scene}`, { memberId, source: 'auto-visual-companion' });
    
    // Call failover image engine
    const { imgUrl } = await generateImageWithFailover(scene, null, memberId, { source: 'auto-visual-companion', intent });
    
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
  return buildCharacterPrompt(id, scenePrompt);
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

