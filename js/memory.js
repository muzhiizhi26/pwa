/* ===== 向量库 + 嵌入 + RAG（含情绪标记/遗忘曲线/关联网络/回忆计数）===== */
const VDB=(()=>{
async function put(rec){
  if (window.MemoryGraph) {
    const node = window.MemoryGraph.fromVDBRecord(rec);
    await window.MemoryGraph.addNode(node);
  }
}
async function del(id){
  if (window.MemoryGraph) {
    await window.MemoryGraph.deleteNode(id);
  }
}
async function all(){
  if (window.MemoryGraph) {
    const nodes = await window.MemoryGraph.getAllNodes();
    return nodes.map(n => window.MemoryGraph.toVDBRecord(n)).filter(r => r && r.vector !== undefined);
  }
  return [];
}
async function count(){
  if (window.MemoryGraph) {
    const allRecords = await all();
    return allRecords.length;
  }
  return 0;
}
async function clear(){
  if (window.MemoryGraph) {
    const nodes = await window.MemoryGraph.getAllNodes();
    for (const node of nodes) {
      if (node.metadata && (node.metadata.vector || node.id.startsWith('v_') || node.id.startsWith('evt_'))) {
        await window.MemoryGraph.deleteNode(node.id);
      }
    }
  }
}
async function get(id){
  if (window.MemoryGraph) {
    const node = await window.MemoryGraph.getNode(id);
    return node ? window.MemoryGraph.toVDBRecord(node) : null;
  }
  return null;
}
async function deleteBatch(ids) {
  if (!ids || !ids.length) return;
  if (window.MemoryGraph) {
    for (const id of ids) {
      await window.MemoryGraph.deleteNode(id);
    }
  }
}
async function latest(limit = 15) {
  const store = await all();
  return store.sort((a,b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit);
}
return {put,del,all,count,clear,latest,get,deleteBatch};})();

function memMaxLocal(){const s=localStorage.getItem('mem_max_local');if(s===null||s==='')return 0;const v=parseInt(s);return isNaN(v)?10000:v;}
function memMaxRemote(){const s=localStorage.getItem('mem_max_remote');if(s===null||s==='')return 0;const v=parseInt(s);return isNaN(v)?5000:v;}
function currentMemMax(){return (localStorage.getItem('embed_mode')||'local')==='remote'?memMaxRemote():memMaxLocal();}
async function trimVectorStore(){
  try{
    const now = Date.now();
    const all = await VDB.all();
    
    // PHASE 1 Lifecycle and Decay Process:
    // Apply exponential decay to 'active' memories that have not been reinforced recently.
    const lam = forgetLambda();
    const recordsToUpdate = [];
    all.forEach(r => {
      let changed = false;
      let currentStatus = r.status || 'active';
      
      if (currentStatus === 'active') {
        const ageDays = (now - (r.ts || now)) / (24 * 3600 * 1000);
        if (ageDays > 1) { // Only decay if more than a day has passed
          const decayMultiplier = Math.exp(-lam * ageDays);
          const originalScore = r.importance_score || 30;
          const newScore = originalScore * decayMultiplier;
          
          if (newScore !== originalScore) {
            r.importance_score = Math.max(1, Math.round(newScore));
            changed = true;
          }
          
          if (r.importance_score < 15) {
            r.status = 'fading';
            changed = true;
            console.log(`[Memory Lifecycle] Demoted memory to FADING (score < 15): "${r.text.slice(0, 15)}..."`);
          }
        }
      } else if (currentStatus === 'fading') {
        const ageDays = (now - (r.ts || now)) / (24 * 3600 * 1000);
        if (ageDays > 30) {
          r.status = 'archived';
          changed = true;
          console.log(`[Memory Lifecycle] Archived fading memory (over 30 days old): "${r.text.slice(0, 15)}..."`);
        }
      }
      
      if (changed) {
        recordsToUpdate.push(r);
      }
    });
    
    for (const recordToUpdate of recordsToUpdate) {
      await VDB.put(recordToUpdate);
    }

    // Trigger Memory Merging after decay and status updates
    if (typeof checkAndMergeMemories === 'function') {
      await checkAndMergeMemories();
    }

    // Re-fetch all to apply current limits
    const updatedAll = await VDB.all();

    // 1. 过滤并删除所有已经过期的即时 (Tier 1) / 情境 (Tier 2) 记忆
    const expiredIds = [];
    const validRecords = [];
    
    updatedAll.forEach(r => {
      const exp = r.expiry_ts || (r.metadata && r.metadata.expiry_ts);
      if (exp && exp <= now) {
        expiredIds.push(r.id);
      } else {
        validRecords.push(r);
      }
    });
    
    if (expiredIds.length > 0) {
      console.log(`[Memory Filter] Pruning ${expiredIds.length} expired memories.`);
      await VDB.deleteBatch(expiredIds);
    }
    
    const lim = currentMemMax();
    if (!lim || lim <= 0 || validRecords.length <= lim) return;
    
    // 2. 如果数据量依然超出限制，按层级和重要度进行修剪 (Tier 1 -> Tier 2 -> Tier 3)
    // 属于“不可覆盖区”的保护：情感浓度高 (emotion) 或 boost >= 2, 或属于 Tier 3 核心记忆
    const protectedIds = new Set();
    validRecords.forEach(r => {
      const isHighlyEmotional = ['love', 'sad', 'angry', 'excited'].includes(r.emotion);
      const isHighlyBoosted = (r.boost && r.boost >= 2.0);
      const tier = r.tier || (r.metadata && r.metadata.tier) || 1;
      
      if (isHighlyEmotional || isHighlyBoosted || tier === 3) {
        protectedIds.add(r.id);
      }
    });

    let prunable = validRecords.filter(r => !protectedIds.has(r.id));
    
    // 优先删除 Tier 1，然后再删除 Tier 2，最后按重要性分数 / 时间排序
    prunable.sort((a, b) => {
      const tierA = a.tier || (a.metadata && a.metadata.tier) || 1;
      const tierB = b.tier || (b.metadata && b.metadata.tier) || 1;
      if (tierA !== tierB) {
        return tierA - tierB;
      }
      const scoreA = a.importance_score || (a.metadata && a.metadata.importance_score) || (a.metadata && a.metadata.importance) || a.importance || 50;
      const scoreB = b.importance_score || (b.metadata && b.metadata.importance_score) || (b.metadata && b.metadata.importance) || b.importance || 50;
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      return (a.ts || 0) - (b.ts || 0);
    });

    const overage = validRecords.length - lim;
    if (prunable.length >= overage) {
      const rm = prunable.slice(0, overage);
      await VDB.deleteBatch(rm.map(r => r.id));
    } else {
      // 极端空间压力下，不得不裁剪受保护的记忆
      const rmPrunable = prunable;
      let protectedItems = validRecords.filter(r => protectedIds.has(r.id));
      
      protectedItems.sort((a, b) => {
        const tierA = a.tier || (a.metadata && a.metadata.tier) || 1;
        const tierB = b.tier || (b.metadata && b.metadata.tier) || 1;
        if (tierA !== tierB) return tierA - tierB;
        
        const scoreA = a.importance_score || (a.metadata && a.metadata.importance_score) || (a.metadata && a.metadata.importance) || a.importance || 50;
        const scoreB = b.importance_score || (b.metadata && b.metadata.importance_score) || (b.metadata && b.metadata.importance) || b.importance || 50;
        if (scoreA !== scoreB) return scoreA - scoreB;
        
        return (a.ts || 0) - (b.ts || 0);
      });
      
      const remainingToTrim = overage - rmPrunable.length;
      const rmProtected = protectedItems.slice(0, remainingToTrim);
      const toDelete = rmPrunable.concat(rmProtected).map(r => r.id);
      await VDB.deleteBatch(toDelete);
    }
  }catch(e){
    console.error('[Memory Filter] Trim error:', e);
  }
}

function localEmbed(text){const v=new Float32Array(EMBED_DIM);const c=(text||'').toLowerCase().replace(/\s+/g,'');const g=[];for(let i=0;i<c.length;i++){g.push(c[i]);if(i<c.length-1)g.push(c[i]+c[i+1]);}for(const x of g){let h=2166136261;for(let i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619);}const idx=Math.abs(h)%EMBED_DIM;v[idx]+=(h&1)?1:-1;}let n=0;for(let i=0;i<EMBED_DIM;i++)n+=v[i]*v[i];n=Math.sqrt(n)||1;for(let i=0;i<EMBED_DIM;i++)v[i]/=n;return Array.from(v);}
function strictSingleApiMode(){return localStorage.getItem('single_api_per_message')!=='false';}
window.strictSingleApiMode = strictSingleApiMode;
async function remoteEmbed(text){const url=(localStorage.getItem('embed_url')||'').trim();const key=(localStorage.getItem('embed_key')||'').trim();const model=(localStorage.getItem('embed_model')||'text-embedding-3-small').trim();if(!url)throw new Error('未配置嵌入API');let u=url.replace(/\/+$/,'');if(!u.includes('/embeddings'))u+='/embeddings';const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'Authorization':`Bearer ${key}`}:{})},body:JSON.stringify({model,input:text})});if(!r.ok)throw new Error('嵌入API错误');const d=await r.json();return d.data[0].embedding;}
const _embedCache = new Map();
async function embed(text){
  if (!text) return localEmbed(text);
  if (_embedCache.has(text)) {
    return _embedCache.get(text);
  }
  const m=localStorage.getItem('embed_mode')||'local';
  let vec;
  if(m==='remote' && !strictSingleApiMode()){
    try{
      vec = await remoteEmbed(text);
    }catch(e){
      vec = localEmbed(text);
    }
  } else {
    vec = localEmbed(text);
  }
  _embedCache.set(text, vec);
  if (_embedCache.size > 150) {
    const firstKey = _embedCache.keys().next().value;
    _embedCache.delete(firstKey);
  }
  return vec;
}
function cosine(a,b){const n=Math.min(a.length,b.length);let dot=0,na=0,nb=0;for(let i=0;i<n;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}return dot/(Math.sqrt(na)*Math.sqrt(nb)+1e-8);}

function ragEnabled(){return localStorage.getItem('rag_enabled')!=='false';}
function ragTopK(){return parseInt(localStorage.getItem('rag_topk')||'3');}
function ragThreshold(){return parseFloat(localStorage.getItem('rag_threshold')||'0.25');}
/* 优化6：遗忘系数 */
function forgetLambda(){const v=parseFloat(localStorage.getItem('forget_lambda'));return isNaN(v)?0.05:v;}
/* 优化12：时间窗口（按天分桶） */
function dayBucket(ts){return Math.floor((ts||Date.now())/(24*3600*1000));}

function normalizeMemoryText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?;:"'“”‘’()[\]{}【】（）]/g, '')
    .slice(0, 220);
}

function isSameMemoryCandidate(leftText, rightText) {
  const left = normalizeMemoryText(leftText);
  const right = normalizeMemoryText(rightText);
  if (!left || !right) return false;
  if (left === right) return true;
  const minLength = Math.min(left.length, right.length);
  if (minLength < 18) return false;
  return left.includes(right) || right.includes(left);
}

async function findDuplicateMemory(content, activeAi, role) {
  let records = [];
  try {
    records = await VDB.all();
  } catch (error) {
    return null;
  }
  const cutoffTs = Date.now() - 7 * 24 * 3600 * 1000;
  return records.find(record => {
    if (!record || !record.text) return false;
    const sameRole = !role || record.role === role;
    const sameAi = (record.ai_id || 'main') === activeAi;
    const recentEnough = !record.ts || record.ts >= cutoffTs;
    return sameRole && sameAi && recentEnough && isSameMemoryCandidate(content, record.text);
  }) || null;
}

async function writeDedupedMemory(rec) {
  const duplicate = await findDuplicateMemory(rec.text, rec.ai_id, rec.role);
  if (duplicate) {
    duplicate.boost = Math.min((duplicate.boost || 1) + 0.25, 3);
    duplicate.ts = Date.now();
    duplicate.window_id = rec.window_id;
    duplicate.emotion = duplicate.emotion || rec.emotion;
    duplicate.tier = Math.max(duplicate.tier || 1, rec.tier || 1);
    // Mention frequency increases importance score
    duplicate.importance_score = Math.min(100, Math.max(duplicate.importance_score || 0, rec.importance_score || 0) + 10);
    duplicate.expiry_ts = Math.max(duplicate.expiry_ts || 0, rec.expiry_ts || 0) || rec.expiry_ts;
    duplicate.topicTags = rec.topicTags || duplicate.topicTags;
    duplicate.timeWindowTag = rec.timeWindowTag || duplicate.timeWindowTag;
    
    // PHASE 1 updates
    duplicate.mention_count = (duplicate.mention_count || 1) + 1;
    // Frequency promotion rules:
    const isRecentlyReinforced = duplicate.mention_count >= 3;
    if (isRecentlyReinforced || duplicate.importance_score >= 80) {
      duplicate.status = 'stable';
    }
    await VDB.put(duplicate);
    
    // Auto-create Experience if reinforced (Phase 4)
    if (duplicate.mention_count >= 5 && typeof autoCreateExperience === 'function') {
      await autoCreateExperience(duplicate, 'achievement');
    }

    return duplicate;
  }
  rec.vector = await embed(rec.text);
  rec.relatedIds = await linkRelatedMemories(rec);
  await VDB.put(rec);
  
  // Run Conflict Resolution (Phase 2)
  if (typeof resolveMemoryConflicts === 'function') {
    await resolveMemoryConflicts(rec);
  }
  
  // Auto-create Experience if milestone/important
  const isAnniversary = /纪念日|生日|情人节|春节|跨年|初见|相遇|第一次|看海/.test(rec.text);
  if (isAnniversary && rec.importance_score >= 50 && typeof autoCreateExperience === 'function') {
    await autoCreateExperience(rec, 'milestone');
  } else if (rec.importance_score >= 80 && typeof autoCreateExperience === 'function') {
    await autoCreateExperience(rec, 'shared_event');
  }

  return rec;
}

/* 评估记忆的分数与三层分类 */
function evaluateMemory(content, role, emotion) {
  let score = 15; // 基础分
  
  // 长度加成
  const len = content.length;
  score += Math.min(15, Math.floor(len / 8));
  
  // 情感加成
  if (emotion && ['love', 'sad', 'angry', 'excited', 'heart', 'fear'].includes(emotion)) {
    score += 25;
  }
  
  const text = content.toLowerCase();
  
  // 核心人格与长期事实关键词 (Tier 3) -> +55
  const coreKeywords = [
    '我叫', '名字是', '我的名字', '生日是', '出生于', '我是个', 
    '我的职业', '我的工作', '换工作', '辞职', '入职', '我的梦想', '我的理想',
    '最喜欢', '最讨厌', '极度反感', '我的价值观', '我觉得人生', '结婚', '分手',
    '恋爱', '暗恋', '喜欢你', '爱上你', '我的爸爸', '我的妈妈', '我的父母',
    '我的家庭', '我的秘密', '不要告诉别人'
  ];
  
  // 情境记忆关键词 (Tier 2) -> +25
  const contextualKeywords = [
    '压力', '累了', '好烦', '郁闷', '最近', '目前', '打算', '计划',
    '准备', '换', '买', '学习', '考试', '面试', '项目', '加班',
    '失眠', '睡不着', '心情', '感觉', '觉得', '希望', '想要'
  ];
  
  // 无意义/口水话判定 (降分)
  const noiseKeywords = [
    '哈哈', '嘻嘻', '呵呵', '嗷嗷', '好的', '嗯嗯', '哦哦', '没事',
    '好吧', '也是', '这样啊', '原来如此', '不知道', '随便', 'OK', 'ok'
  ];
  
  let isCore = false;
  let isContextual = false;
  let isNoise = false;
  
  for (const k of coreKeywords) {
    if (text.includes(k)) {
      isCore = true;
      break;
    }
  }
  
  if (!isCore) {
    for (const k of contextualKeywords) {
      if (text.includes(k)) {
        isContextual = true;
        break;
      }
    }
  }
  
  for (const k of noiseKeywords) {
    if (text.includes(k) && len < 10) {
      isNoise = true;
      break;
    }
  }
  
  if (isCore) {
    score += 55;
  } else if (isContextual) {
    score += 25;
  }
  
  // 节日/纪念日/特殊节点加成 (+30)
  const celebrationKeywords = ['纪念日', '生日', '情人节', '圣诞', '元旦', '春节', '跨年', '初见', '相遇', '第一次'];
  for (const word of celebrationKeywords) {
    if (text.includes(word)) {
      score += 30;
      break;
    }
  }
  
  if (isNoise) {
    score = Math.max(2, score - 20);
  }
  
  score = Math.max(0, Math.min(100, score));
  
  let tier = 1; // 默认 Tier 1 即时记忆
  if (score >= 75 || isCore) {
    tier = 3; // 核心人格记忆
  } else if (score >= 35 || isContextual) {
    tier = 2; // 情境记忆
  }
  
  return { score, tier };
}

/* Topic tag extractor helper */
function extractTopicTags(content) {
  const text = (content || '').toLowerCase();
  const tags = [];
  
  const rules = [
    { tag: '喜好习惯', keywords: ['喜欢', '讨厌', '爱吃', '习惯', '经常', '嗜好', '最爱', '甜食', '喝咖啡', '奶茶'] },
    { tag: '情感羁绊', keywords: ['爱', '暗恋', '心动', '表白', '想你', '难过', '伤心', '陪伴', '永远', '纪念日', '感情', '喜欢你'] },
    { tag: '日常生活', keywords: ['睡觉', '吃饭', '做饭', '散步', '逛街', '洗澡', '天气', '下雨', '日常', '宠物', '猫', '狗', '晚安', '早安'] },
    { tag: '工作学业', keywords: ['加班', '项目', '代码', '辞职', '入职', '考试', '面试', '学习', '专业', '论文', '毕业', '工作', '上班', '学校'] },
    { tag: '休闲娱乐', keywords: ['游戏', '电影', '小说', '动漫', '音乐', '旅行', '旅游', '看书', '科幻', '运动', '健身', '听歌', '视频'] },
    { tag: '未来期许', keywords: ['梦想', '未来', '目标', '打算', '计划', '以后', '希望', '憧憬', '想去'] }
  ];
  
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        tags.push(rule.tag);
        break;
      }
    }
  }
  
  if (tags.length === 0) {
    tags.push('日常杂记');
  }
  
  return tags;
}

/* Time window formatter helper */
function formatTimeWindow(ts) {
  const date = new Date(ts);
  const hour = date.getHours();
  let timeStr = '';
  if (hour >= 5 && hour < 12) timeStr = '清晨';
  else if (hour >= 12 && hour < 14) timeStr = '中午';
  else if (hour >= 14 && hour < 18) timeStr = '下午';
  else if (hour >= 18 && hour < 22) timeStr = '夜晚';
  else timeStr = '深夜';
  
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${timeStr}`;
}

/* Bidirectional relational linking helper */
async function linkRelatedMemories(newRec) {
  try {
    const allRecords = await VDB.all();
    const relatedIds = [];
    const newTags = newRec.topicTags || [];
    
    for (const old of allRecords) {
      if (old.id === newRec.id) continue;
      
      let isRelated = false;
      const oldTags = old.topicTags || (old.metadata && old.metadata.topicTags) || [];
      const hasSharedTag = newTags.some(t => oldTags.includes(t));
      const isCloseInTime = Math.abs((old.ts || 0) - (newRec.ts || 0)) <= 4 * 3600 * 1000;
      
      if (hasSharedTag || isCloseInTime) {
        isRelated = true;
      }
      
      if (isRelated) {
        relatedIds.push(old.id);
        
        // Ensure bidirectional reference in old node
        if (old.metadata) {
          if (!old.metadata.relatedIds) old.metadata.relatedIds = [];
          if (!old.metadata.relatedIds.includes(newRec.id)) {
            old.metadata.relatedIds.push(newRec.id);
            old.relatedIds = old.metadata.relatedIds;
            await VDB.put(old);
          }
        }
      }
      
      if (relatedIds.length >= 5) break;
    }
    
    return relatedIds;
  } catch (err) {
    console.warn('[Memory Graph 2.0] Link related memories failed:', err);
    return [];
  }
}

async function memorize(role,content,emotion,aiId){
  if(!content||content.length<4)return;
  if(localStorage.getItem('rag_enabled')==='false')return;
  
  const { score, tier } = evaluateMemory(content, role, emotion);
  if (score < 15) {
    return;
  }
  const ts = Date.now();
  const expiry_ts = tier === 1 
    ? ts + 24 * 3600 * 1000 
    : (tier === 2 ? ts + 90 * 24 * 3600 * 1000 : Infinity);
  const activeAi=aiId||(typeof currentPrivateAiId==='function'?currentPrivateAiId():'main');

  const topicTags = extractTopicTags(content);
  const timeWindowTag = formatTimeWindow(ts);

  const rec = {
    id:'v_'+ts+'_'+Math.random().toString(36).slice(2,7),
    text:content,
    vector:null,
    role,
    emotion:emotion||'',
    ts,
    window_id:dayBucket(ts),
    boost:1,
    ai_id:activeAi,
    tier,
    importance_score:score,
    expiry_ts,
    // Graph 2.0 properties
    topicTags,
    timeWindowTag,
    relatedIds: [],
    // PHASE 1 properties
    status: 'active',
    mention_count: 1
  };

  if (window.MemoryLockQueue) {
    return window.MemoryLockQueue.enqueue(async () => {
      try {
        await writeDedupedMemory(rec);
        await trimVectorStore();
      } catch(e) {}
    });
  } else {
    try {
      await writeDedupedMemory(rec);
      await trimVectorStore();
    } catch(e) {}
  }
}

/* Memory Graph 2.0: Relational Memory Recall with Memory Packages */
async function recall(query,aiId){
  if(!ragEnabled())return[];
  let store;try{store=await VDB.all();}catch(e){return[];}
  if(!store.length)return[];
  const activeAi=aiId||(typeof currentPrivateAiId==='function'?currentPrivateAiId():'main');
  const isDeepRecallQuery = /回忆|以前|过去|很久以前|不记得|记不记得|忘了吧|曾经|早些时候/.test((query || '').toLowerCase());
  
  const filtered=store.filter(r=>{
    const recordAi=r.ai_id||'main';
    let vis=r.visibility||'relationship';

    if (vis === 'group') {
      vis = 'world';
    }

    if(vis==='private'){
      if (recordAi!==activeAi) return false;
    } else if(vis==='relationship'){
      if(activeAi!=='main' && recordAi!==activeAi && recordAi!=='main') return false;
    }

    // 🎭 多角色认知边界 (Character Cognitive Boundary) 过滤
    if (typeof getCharacterMemoryScope === 'function') {
      const scopeObj = getCharacterMemoryScope(activeAi);
      if (scopeObj.scope === 'public_only') {
        const isGroupSource = r.source === 'group_chat' || (r.metadata && r.metadata.source === 'group_chat') || vis === 'world' || r.visibility === 'group';
        if (!isGroupSource) return false;
      } else if (scopeObj.scope === 'shared') {
        const isGroupSource = r.source === 'group_chat' || (r.metadata && r.metadata.source === 'group_chat') || vis === 'world' || r.visibility === 'group';
        const tags = r.topicTags || (r.metadata && r.metadata.topicTags) || [];
        const text = (r.text || '').toLowerCase();
        const sharedKeys = scopeObj.sharedKeys || ['preferences', 'topics', 'facts'];
        const matchesShared = sharedKeys.some(k => tags.includes(k) || text.includes(k) || (r.category && r.category.includes(k)));
        if (!isGroupSource && !matchesShared && recordAi !== activeAi) return false;
      }
    }
    
    // PHASE 1 Lifecycle filtration
    const status = r.status || 'active';
    if (status === 'archived') return false;
    if (status === 'fading' && !isDeepRecallQuery) return false;

    return true;
  });
  if(!filtered.length)return[];
  const qv=await embed(query);const lam=forgetLambda();const now=Date.now();
  const queryTags = extractTopicTags(query);
  
  const scored=filtered.map(r=>{
    const sim=cosine(qv,r.vector);
    const ageDays=(now-(r.ts||now))/(24*3600*1000);
    const decay=Math.exp(-lam*Math.max(0,ageDays));
    let boost=r.boost||1;
    let keepRecall=true;
    
    if (typeof RhythmEngine !== 'undefined' && RhythmEngine.getConfig().enabled) {
      const hour = new Date().getHours();
      const isNight = (hour >= 23 || hour < 5);
      const imp = r.importance_score || r.importance || (r.metadata && r.metadata.importance_score) || 50;
      
      if (isNight) {
        if (imp < 70) {
          keepRecall = false;
        }
      } else {
        if (imp < 70) {
          boost *= 0.5;
        }
      }
    }
    
    // PHASE 5: Advanced weighting formula:
    // 记忆价值 = 语义相似度 × 时间权重 × 情绪强度 × 关系深度 × 话题连续性
    const emoWeight = ['love', 'sad', 'angry', 'excited', 'heart'].includes(r.emotion) ? 1.3 : 1.0;
    
    const rTags = r.topicTags || (r.metadata && r.metadata.topicTags) || [];
    const hasTopicOverlap = queryTags.some(t => rTags.includes(t));
    const continuityMultiplier = hasTopicOverlap ? 1.25 : 1.0;
    
    const relDepthMultiplier = 1.0 + Math.min(0.5, (r.mention_count || 1) * 0.05);
    
    const finalScore = sim * decay * boost * emoWeight * continuityMultiplier * relDepthMultiplier;
    
    return {...r,sim,score:finalScore,keepRecall};
  }).filter(r=>r.sim>=ragThreshold() && r.keepRecall !== false).sort((a,b)=>b.score-a.score);
  
  const top=scored.slice(0,ragTopK());
  const chosen=new Set(top.map(t=>t.id));
  const assoc=[];
  const cap=ragTopK()+4; // Bring up to 4 associated memories in the package
  
  for(const t of top){
    const tTags = t.topicTags || (t.metadata && t.metadata.topicTags) || [];
    const tRelated = t.relatedIds || (t.metadata && t.metadata.relatedIds) || [];
    
    for(const r of filtered){
      if(chosen.has(r.id))continue;
      
      const rTags = r.topicTags || (r.metadata && r.metadata.topicTags) || [];
      const rRelated = r.relatedIds || (r.metadata && r.metadata.relatedIds) || [];
      
      const isDirectlyLinked = tRelated.includes(r.id) || rRelated.includes(t.id);
      const sharesTopic = tTags.length > 0 && rTags.some(tag => tTags.includes(tag));
      const isCloseInTime = r.window_id === t.window_id && Math.abs((r.ts||0)-(t.ts||0)) <= 4 * 3600 * 1000;
      
      if (isDirectlyLinked || sharesTopic || isCloseInTime) {
        r.assoc = true;
        if (isDirectlyLinked) r.assocReason = '关联网络';
        else if (sharesTopic) r.assocReason = `同类话题(${rTags.join('/')})`;
        else r.assocReason = '邻近时刻';
        
        assoc.push(r);
        chosen.add(r.id);
        if(top.length+assoc.length>=cap)break;
      }
    }
    if(top.length+assoc.length>=cap)break;
  }
  return top.concat(assoc);
}

/* 召回渲染：将情绪标签、时间窗口和关联链完美融入 */
function emotionLabelOf(key){try{return (EMOTION_LEXICON[key]||{}).label||'';}catch(e){return '';}}

function formatRecall(items){
  if(!items||!items.length)return'';
  const main=items.filter(i=>!i.assoc),rel=items.filter(i=>i.assoc);
  let out='\n【记忆网络核心召回（Memory Package 2.0）】\n';
  out+=main.map(it=>{
    if (it.status === 'superseded' || it.supersededBy) {
      const oldTime = it.supersededAt ? `，${new Date(it.supersededAt).toLocaleDateString('zh-CN')}` : '';
      return `· 【偏好变化/历史偏好】用户曾记录（已被取代${oldTime}）：${it.text}`;
    }
    if (it.supersedes) {
      return `· 【偏好变化/当前最新偏好】用户最新偏好：${it.text}`;
    }
    const who=it.role==='user'?'用户曾说':'AI曾说';
    const emo=it.emotion?emotionLabelOf(it.emotion):'';
    const emoStr=emo?`，情绪：${emo}`:'';
    const tags = it.topicTags || (it.metadata && it.metadata.topicTags) || [];
    const tagStr = tags.length ? `，话题：[${tags.join(',')}]` : '';
    const timeWin = it.timeWindowTag || (it.metadata && it.metadata.timeWindowTag) || '';
    const timeStr = timeWin ? `，时间：${timeWin}` : '';
    const relv=(it.sim!=null?it.sim:it.score);
    return `· (${who}，检索共鸣${(relv*100).toFixed(0)}%${emoStr}${tagStr}${timeStr}) ${it.text}`;
  }).join('\n');
  
  if(rel.length) {
    out+='\n【关联扩散记忆节点】\n'+rel.map(it=>{
      const tags = it.topicTags || (it.metadata && it.metadata.topicTags) || [];
      const reason = it.assocReason || '网络关联';
      const tagStr = tags.length ? ` [${tags.join(',')}]` : '';
      return `· (${reason}${tagStr}) ${it.text}`;
    }).join('\n');
  }
  return out;
}

/* 主动回忆计数器（每次 AI 回复 +1，AI 用 [[recall]] 后清零；累积到阈值才强提示回忆） */
function recallCounterGet(){return parseInt(localStorage.getItem('recall_counter')||'0');}
function recallCounterBump(reset){if(reset){localStorage.setItem('recall_counter','0');return;}localStorage.setItem('recall_counter',String(recallCounterGet()+1));}
function shouldTriggerRecall(){return recallCounterGet()>=8;}

/* 关联复习权重提升机制 */
async function boostMemoryByText(text){
  try {
    if(!text) return;
    const store = await VDB.all();
    const key = text.slice(0,20);
    const t = store.find(r => r.text && r.text.includes(key));
    if (t) {
      t.boost = Math.min((t.boost || 1) + 0.5, 3);
      await VDB.put(t);
    }
  } catch(e) {}
}

/* ========================================================================= */
/* ================== COGNITIVE COMPANION ENGINE ADDITIONS ================= */
/* ========================================================================= */

/* ---- PHASE 1: Memory Merging System (周期性记忆聚合为长期偏好) ---- */
async function checkAndMergeMemories() {
  try {
    const store = await VDB.all();
    const now = Date.now();
    
    // Group active/stable memories by topicTag
    const topicGroups = {};
    for (const record of store) {
      if (!record.text || record.status === 'archived' || record.status === 'fading') continue;
      const tags = record.topicTags || [];
      for (const tag of tags) {
        if (!topicGroups[tag]) {
          topicGroups[tag] = [];
        }
        topicGroups[tag].push(record);
      }
    }
    
    // Look for clusters of 4+ memories in a single tag within recent days
    for (const [tag, records] of Object.entries(topicGroups)) {
      if (records.length >= 4) {
        const recentRecords = records.filter(r => (now - (r.ts || now)) <= 5 * 24 * 3600 * 1000);
        if (recentRecords.length >= 3) {
          console.log(`[Memory Merge] Detected memory cluster for tag "${tag}". Merging...`);
          
          recentRecords.sort((a,b) => b.importance_score - a.importance_score);
          const representative = recentRecords[0];
          
          // Construct combined narrative text
          const combinedText = `关于【${tag}】的长期稳定偏好：` + recentRecords.map(r => r.text).join('；');
          
          // Create new stable merged memory record (Tier 3)
          const mergedRec = {
            id: 'v_merge_' + now + '_' + Math.random().toString(36).slice(2, 7),
            text: combinedText,
            vector: representative.vector,
            role: 'user',
            emotion: 'calm',
            ts: now,
            window_id: dayBucket(now),
            boost: 2.0,
            ai_id: representative.ai_id || 'main',
            tier: 3, // Tier 3 (Long-term profile preference)
            importance_score: 95,
            expiry_ts: Infinity,
            topicTags: [tag],
            timeWindowTag: formatTimeWindow(now),
            relatedIds: [],
            status: 'stable',
            mention_count: recentRecords.reduce((acc, r) => acc + (r.mention_count || 1), 0),
            is_merged: true,
            merged_sources: recentRecords.map(r => r.id)
          };
          
          await VDB.put(mergedRec);
          
          // Batch delete the old fragment memories to reduce cognitive clutter
          const oldIds = recentRecords.map(r => r.id);
          await VDB.deleteBatch(oldIds);
          
          showToast(`🔮 已将关于「${tag}」的零散记忆融合成长期偏好记录`);
          
          // Auto-create Experience milestones for this growth!
          if (typeof autoCreateExperience === 'function') {
            await autoCreateExperience(mergedRec, 'achievement', [mergedRec.id]);
          }
          
          break; // Process one merge per trim loop to ensure stability
        }
      }
    }
  } catch (err) {
    console.error('[Memory Merge] Error merging memories:', err);
  }
}

/* ---- PHASE 2: Cognitive Conflict Resolution (认知冲突解决与偏好自动纠正) ---- */
async function resolveMemoryConflicts(newRec) {
  try {
    const store = await VDB.all();
    if (typeof detectSemanticContradiction === 'function') {
      const handled = await detectSemanticContradiction(newRec, store);
      if (handled) return;
    }
    const newText = newRec.text.toLowerCase();
    
    // Check if the new record indicates a change, correction, or denial
    const isCorrection = newText.includes('纠正') || newText.includes('记错了') || newText.includes('偏好更新') || newText.includes('不喜欢') || newText.includes('不是的') || newText.includes('不要');
    if (!isCorrection) return;

    console.log('[Conflict Resolution] Checking conflicts for:', newRec.text);
    
    // Extract topic tags of the new memory
    const newTags = newRec.topicTags || [];
    if (!newTags.length) return;

    for (const record of store) {
      if (record.id === newRec.id) continue;
      if ((record.ai_id || 'main') !== (newRec.ai_id || 'main')) continue;
      
      const recTags = record.topicTags || [];
      const hasTopicOverlap = newTags.some(t => recTags.includes(t));
      
      if (hasTopicOverlap) {
        const recordText = record.text.toLowerCase();
        
        let isContradictory = false;
        // 1. Like vs Dislike contradiction
        if ((newText.includes('不喜欢') && recordText.includes('喜欢') && !recordText.includes('不喜欢')) ||
            (newText.includes('讨厌') && recordText.includes('喜欢')) ||
            (newText.includes('不要') && recordText.includes('要') && !recordText.includes('不要'))) {
          isContradictory = true;
        }
        
        // 2. Clear denial / mismatch
        if (newText.includes('不喝') && recordText.includes('喜欢喝') ||
            newText.includes('不用') && recordText.includes('用') && !recordText.includes('不用')) {
          isContradictory = true;
        }
        
        if (isContradictory) {
          console.log(`[Conflict Resolution] Contradiction archived: "${record.text}" contradicted by "${newRec.text}"`);
          record.status = 'archived';
          record.expiry_ts = Date.now(); // Expire immediately
          await VDB.put(record);
          
          showToast(`🧠 已自动归档冲突的历史记忆: "${record.text.slice(0, 15)}..."`);
        }
      }
    }
  } catch (err) {
    console.error('[Conflict Resolution] Error resolving memory conflicts:', err);
  }
}

/* ---- PHASE 3: AI Character Growth System (AI 人格成长特质系统) ---- */
function getAiPersonality(aiId) {
  const id = aiId || 'main';
  const key = `ai_personality_${id}`;
  let data = localStorage.getItem(key);
  if (!data) {
    data = { gentleness: 80, initiative: 60, humor: 70, attachment: 50 };
    localStorage.setItem(key, JSON.stringify(data));
    return data;
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return { gentleness: 80, initiative: 60, humor: 70, attachment: 50 };
  }
}

function saveAiPersonality(aiId, data) {
  const id = aiId || 'main';
  const key = `ai_personality_${id}`;
  localStorage.setItem(key, JSON.stringify(data));
  if (typeof doubleWriteBackup === 'function') {
    doubleWriteBackup(key, JSON.stringify(data));
  }
}

function adjustAiPersonality(aiId, signal) {
  try {
    const id = aiId || 'main';
    const p = getAiPersonality(id);
    if (signal === 'user_happy') {
      p.gentleness = Math.max(40, Math.min(95, p.gentleness + 0.5));
    } else if (signal === 'user_unhappy') {
      p.gentleness = Math.max(40, Math.min(95, p.gentleness - 0.5));
    } else if (signal === 'responded_proactive') {
      p.initiative = Math.max(40, Math.min(95, p.initiative + 0.5));
    } else if (signal === 'laughter') {
      p.humor = Math.max(40, Math.min(95, p.humor + 0.5));
    } else if (signal === 'active_3days') {
      p.attachment = Math.max(40, Math.min(95, p.attachment + 0.5));
    }
    saveAiPersonality(id, p);
    console.log(`[AI Personality Growth] Parameter adjusted (${signal}):`, p);
  } catch (e) {
    console.error('[AI Personality] Error adjusting:', e);
  }
}

function checkContinuousDaysActive() {
  try {
    if (typeof conversationHistory === 'undefined') return false;
    const days = new Set();
    for (const m of conversationHistory) {
      if (m.ts) {
        const day = new Date(m.ts).toDateString();
        days.add(day);
      }
    }
    const sortedDays = Array.from(days).map(d => new Date(d).getTime()).sort();
    if (sortedDays.length >= 3) {
      let consecutiveCount = 1;
      for (let i = sortedDays.length - 1; i > 0; i--) {
        const diff = sortedDays[i] - sortedDays[i-1];
        if (diff <= 25 * 3600 * 1000) {
          consecutiveCount++;
        } else {
          break;
        }
      }
      return consecutiveCount >= 3;
    }
  } catch (e) {}
  return false;
}

/* ---- PHASE 4: Common Experience Layer (共同经历了独立数据库储存) ---- */
const ExperienceStore = {
  DB_NAME: 'experience_db',
  STORE_NAME: 'experiences',
  VERSION: 1,
  _db: null,

  _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async init() {
    if (this._db) return;
    this._db = await this._openDB();
  },

  async put(exp) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      store.put(exp);
      tx.oncomplete = () => resolve(exp);
      tx.onerror = () => reject(tx.error);
    });
  },

  async get(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async all() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async clear() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};
window.ExperienceStore = ExperienceStore;

async function autoCreateExperience(rec, type, relatedMemoryIds) {
  try {
    const experiences = await ExperienceStore.all();
    const activeAi = rec.ai_id || 'main';
    
    // Check de-duplication
    const existing = experiences.find(e => {
      return e.relatedMemories && e.relatedMemories.includes(rec.id);
    });
    if (existing) return;
    
    const ts = Date.now();
    const dateStr = new Date(rec.ts || ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    
    let title = rec.text.slice(0, 30);
    if (type === 'milestone') {
      title = `共同纪念：${title}`;
    } else if (type === 'achievement') {
      title = `共同成长印记：${title}`;
    } else {
      title = `共同经历：${title}`;
    }
    
    const exp = {
      id: 'exp_' + ts + '_' + Math.random().toString(36).slice(2, 7),
      title: title,
      type: type, // 'milestone' | 'shared_event' | 'achievement'
      participants: ['user', activeAi],
      relatedMemories: relatedMemoryIds || [rec.id],
      relatedContent: { images: [], diary: null, posts: [] },
      emotion: rec.emotion || 'calm',
      importance: rec.importance_score || 70,
      createdAt: dateStr,
      lastRecalledAt: ts
    };
    
    await ExperienceStore.put(exp);
    console.log(`[Experience] New experience stored: "${title}"`);
    showToast(`🌟 共同经历已收录至回忆画卷: "${title}"`);
  } catch (e) {
    console.error('[Experience] Error creating experience:', e);
  }
}

async function recallExperiences(query, aiId) {
  try {
    const experiences = await ExperienceStore.all();
    if (!experiences || !experiences.length) return [];
    const activeAi = aiId || 'main';
    const qLower = (query || '').toLowerCase();
    
    // Dynamic matching of experience title/emotion against the prompt query
    const scoredExps = experiences.filter(e => {
      if (!e.participants.includes(activeAi)) return false;
      const titleLower = e.title.toLowerCase();
      
      let score = 0;
      const keywords = qLower.split(/[\s,，.。!！?？、]+/);
      for (const kw of keywords) {
        if (kw && titleLower.includes(kw)) {
          score += 10;
        }
      }
      return score > 0;
    });
    
    return scoredExps.sort((a,b) => b.importance - a.importance).slice(0, 2);
  } catch (e) {
    console.error('[Experience Recall] Error:', e);
    return [];
  }
}

/* ===== 🏥 记忆健康监控 (Memory Health Monitor) & AI 自我复盘 (Self Reflection) ===== */
async function getMemoryHealthReport() {
  try {
    const allRecords = await VDB.all();
    const totalCount = allRecords.length;

    if (totalCount === 0) {
      return {
        totalCount: 0,
        effectiveRatio: '100%',
        unverifiedInferenceRatio: '0%',
        conflictCount: 0,
        lowQualityCount: 0,
        statusCounts: { active: 0, stable: 0, fading: 0, archived: 0 },
        sourceCounts: { user_explicit: 0, ai_inferred: 0, other: 0 },
        generatedAt: new Date().toLocaleString('zh-CN')
      };
    }

    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 3600 * 1000;

    let activeCount = 0;
    let stableCount = 0;
    let fadingCount = 0;
    let archivedCount = 0;

    let userExplicitCount = 0;
    let aiInferredCount = 0;
    let otherSourceCount = 0;

    let unverifiedInferredCount = 0;
    let lowQualityCount = 0;

    let conflictCount = 0;
    const topicMap = new Map();

    for (const rec of allRecords) {
      const status = rec.status || 'active';
      if (status === 'active') activeCount++;
      else if (status === 'stable') stableCount++;
      else if (status === 'fading') fadingCount++;
      else if (status === 'archived') archivedCount++;
      else activeCount++;

      const source = rec.source || (rec.metadata && rec.metadata.source) || 'user_explicit';
      if (source === 'user_explicit' || source === 'user') userExplicitCount++;
      else if (source === 'ai_inferred' || source === 'inferred') aiInferredCount++;
      else otherSourceCount++;

      const isVerified = (rec.verified_count || 0) > 0;
      const confidence = rec.confidence != null ? rec.confidence : (rec.importance_score || 50);
      const ageMs = now - (rec.ts || now);

      if ((source === 'ai_inferred' || source === 'inferred') && !isVerified) {
        unverifiedInferredCount++;
      }

      // 低价值记忆判定：状态为 fading 或 archived，或者 (置信度 < 40 且 90天未被验证)
      const isLowQuality = (status === 'fading' || status === 'archived') ||
                           (confidence < 40 && !isVerified && ageMs > ninetyDaysMs);
      if (isLowQuality) {
        lowQualityCount++;
      }

      // 冲突记忆统计
      if (rec.conflict_with || status === 'conflict') {
        conflictCount++;
      } else {
        const topicKey = (rec.text || '').slice(0, 10);
        if (topicKey) {
          if (topicMap.has(topicKey)) {
            const prev = topicMap.get(topicKey);
            if (prev.emotion && rec.emotion && prev.emotion !== rec.emotion) {
              conflictCount++;
            }
          } else {
            topicMap.set(topicKey, rec);
          }
        }
      }
    }

    const effectiveRatioNum = ((activeCount + stableCount) / totalCount) * 100;
    const effectiveRatio = `${effectiveRatioNum.toFixed(1)}%`;

    const unverifiedRatioNum = totalCount > 0 ? (unverifiedInferredCount / totalCount) * 100 : 0;
    const unverifiedInferenceRatio = `${unverifiedRatioNum.toFixed(1)}%`;

    return {
      totalCount,
      effectiveRatio,
      unverifiedInferenceRatio,
      conflictCount,
      lowQualityCount,
      statusCounts: { active: activeCount, stable: stableCount, fading: fadingCount, archived: archivedCount },
      sourceCounts: { user_explicit: userExplicitCount, ai_inferred: aiInferredCount, other: otherSourceCount },
      generatedAt: new Date().toLocaleString('zh-CN')
    };
  } catch (e) {
    console.error('[Memory Health] Error generating report:', e);
    return {
      totalCount: 0,
      effectiveRatio: '0%',
      unverifiedInferenceRatio: '0%',
      conflictCount: 0,
      lowQualityCount: 0,
      statusCounts: { active: 0, stable: 0, fading: 0, archived: 0 },
      sourceCounts: { user_explicit: 0, ai_inferred: 0, other: 0 },
      error: e.message
    };
  }
}

async function cleanLowQualityMemories() {
  try {
    const allRecords = await VDB.all();
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 3600 * 1000;
    const lowQualityIds = [];

    for (const rec of allRecords) {
      const status = rec.status || 'active';
      const source = rec.source || (rec.metadata && rec.metadata.source) || 'user_explicit';
      const isVerified = (rec.verified_count || 0) > 0;
      const confidence = rec.confidence != null ? rec.confidence : (rec.importance_score || 50);
      const ageMs = now - (rec.ts || now);

      const isLowQuality = (status === 'fading' || status === 'archived') ||
                           (confidence < 40 && !isVerified && ageMs > ninetyDaysMs);
      if (isLowQuality && rec.id) {
        lowQualityIds.push(rec.id);
      }
    }

    if (lowQualityIds.length > 0) {
      await VDB.deleteBatch(lowQualityIds);
      console.log(`[Memory Health] Cleaned ${lowQualityIds.length} low quality memory items.`);
    }

    return { cleanedCount: lowQualityIds.length };
  } catch (e) {
    console.error('[Memory Health] Error cleaning low quality memories:', e);
    throw e;
  }
}

async function performSelfReflection() {
  try {
    console.log('[SelfReflection] Starting AI Self Reflection cycle...');
    const allRecords = await VDB.all();
    const now = Date.now();

    const oneHundredEightyDaysMs = 180 * 24 * 3600 * 1000;
    const threeHundredSixtyFiveDaysMs = 365 * 24 * 3600 * 1000;
    const ninetyDaysMs = 90 * 24 * 3600 * 1000;

    let demotedToFading = 0;
    let demotedToArchived = 0;
    let confidenceReduced = 0;

    for (const rec of allRecords) {
      let changed = false;
      const status = rec.status || 'active';
      const lastRecall = rec.lastRecalledAt || rec.ts || now;
      const ageSinceRecall = now - lastRecall;
      const source = rec.source || (rec.metadata && rec.metadata.source) || 'user_explicit';
      const verifiedCount = rec.verified_count || 0;

      // 1. 连续 180 天未被召回的 stable 记忆降级为 fading
      if (status === 'stable' && ageSinceRecall > oneHundredEightyDaysMs) {
        rec.status = 'fading';
        demotedToFading++;
        changed = true;
      }
      // 2. 连续 365 天未被召回的 fading 记忆降级为 archived
      else if (status === 'fading' && ageSinceRecall > threeHundredSixtyFiveDaysMs) {
        rec.status = 'archived';
        demotedToArchived++;
        changed = true;
      }

      // 3. verified_count 为 0 且 source 为 ai_inferred 且超过 90 天未验证，置信度降低 10%
      if ((source === 'ai_inferred' || source === 'inferred') && verifiedCount === 0) {
        const memoryAge = now - (rec.ts || now);
        if (memoryAge > ninetyDaysMs) {
          const currentConf = rec.confidence != null ? rec.confidence : (rec.importance_score || 50);
          rec.confidence = Math.max(1, Math.round(currentConf * 0.9));
          rec.importance_score = rec.confidence;
          confidenceReduced++;
          changed = true;
        }
      }

      if (changed) {
        await VDB.put(rec);
      }
    }

    const currentMetrics = await getMemoryHealthReport();

    let previousMetrics = null;
    try {
      const prevRaw = localStorage.getItem('lastReflectionReport');
      if (prevRaw) {
        const prevObj = JSON.parse(prevRaw);
        previousMetrics = prevObj.currentMetrics || null;
      }
    } catch(e) {}

    const reflectionReport = {
      timestamp: new Date().toLocaleString('zh-CN'),
      executedAt: Date.now(),
      summary: {
        demotedToFading,
        demotedToArchived,
        confidenceReduced
      },
      currentMetrics,
      previousMetrics
    };

    localStorage.setItem('lastReflectionReport', JSON.stringify(reflectionReport));
    localStorage.setItem('lastReflectionTime', Date.now().toString());

    console.log(`[SelfReflection] Cycle completed. Demoted to Fading: ${demotedToFading}, Demoted to Archived: ${demotedToArchived}, Confidence Reduced: ${confidenceReduced}`);
    return reflectionReport;
  } catch (e) {
    console.error('[SelfReflection] Error executing self reflection:', e);
    throw e;
  }
}

// Export helper functions to window context
window.getAiPersonality = getAiPersonality;
window.saveAiPersonality = saveAiPersonality;
window.adjustAiPersonality = adjustAiPersonality;
window.checkContinuousDaysActive = checkContinuousDaysActive;
window.checkAndMergeMemories = checkAndMergeMemories;
window.resolveMemoryConflicts = resolveMemoryConflicts;
window.autoCreateExperience = autoCreateExperience;
window.recallExperiences = recallExperiences;
window.getMemoryHealthReport = getMemoryHealthReport;
window.cleanLowQualityMemories = cleanLowQualityMemories;
window.performSelfReflection = performSelfReflection;
