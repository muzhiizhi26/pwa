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
    
    // 1. 过滤并删除所有已经过期的即时 (Tier 1) / 情境 (Tier 2) 记忆
    const expiredIds = [];
    const validRecords = [];
    
    all.forEach(r => {
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
    duplicate.importance_score = Math.max(duplicate.importance_score || 0, rec.importance_score || 0);
    duplicate.expiry_ts = Math.max(duplicate.expiry_ts || 0, rec.expiry_ts || 0) || rec.expiry_ts;
    await VDB.put(duplicate);
    return duplicate;
  }
  rec.vector = await embed(rec.text);
  await VDB.put(rec);
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

async function memorize(role,content,emotion,aiId){
  if(!content||content.length<4)return;
  if(localStorage.getItem('rag_enabled')==='false')return;
  
  const { score, tier } = evaluateMemory(content, role, emotion);
  if (score < 15) {
    // 低重要度日常对话（例如哈哈、嗯嗯、无实体信息短句）不作为长期或中期向量索引，节省不必要的嵌入 API 消耗
    return;
  }
  const ts=Date.now();
  const expiry_ts = tier === 1 
    ? ts + 24 * 3600 * 1000 
    : (tier === 2 ? ts + 90 * 24 * 3600 * 1000 : Infinity);
  const activeAi=aiId||(typeof currentPrivateAiId==='function'?currentPrivateAiId():'main');

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
    expiry_ts
  };

  // 使用统一的 MemoryLockQueue 串行入队执行，彻底消除写入与裁剪并发时的 Race Condition
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

/* 优化6：相似度×时间衰减×boost；优化12：召回后连带同一时间窗口的记忆 */
async function recall(query,aiId){
  if(!ragEnabled())return[];
  let store;try{store=await VDB.all();}catch(e){return[];}
  if(!store.length)return[];
  const activeAi=aiId||(typeof currentPrivateAiId==='function'?currentPrivateAiId():'main');
  const filtered=store.filter(r=>{
    const recordAi=r.ai_id||'main';
    let vis=r.visibility||'relationship';

    // 统一将旧版 'group' 记忆无缝桥接到新的 'world' 能见度，实现“共享世界状态”
    if (vis === 'group') {
      vis = 'world';
    }

    if(vis==='private'){
      // 专属私有：仅当初创制该记忆的 AI 角色在私聊该用户时可检索到
      return recordAi===activeAi;
    }
    if(vis==='relationship'){
      // 关系共享：该特定 AI 角色与其和用户的交互记录。由于主AI协调一切关系，因此主AI或对应角色皆可见
      if(activeAi==='main'){
        return true;
      }
      return recordAi===activeAi||recordAi==='main';
    }
    if(vis==='world' || vis==='chronicle' || vis==='archive'){
      // 🌍 共同世界、📅 共同岁月年鉴、📦 长期归档：全员无条件共享！
      // 无论哪一个伴侣在哪种聊天中触发事件，所有成员直接共享这个世界的事实，不复有隔离
      return true;
    }

    // 兜底后备兼容
    if(activeAi==='main'){
      return true;
    }
    return recordAi===activeAi||recordAi==='main';
  });
  if(!filtered.length)return[];
  const qv=await embed(query);const lam=forgetLambda();const now=Date.now();
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
          keepRecall = false; // 普通记忆在凌晨不调用
        }
      } else {
        if (imp < 70) {
          boost *= 0.5; // 普通事件降低权重
        }
      }
    }
    
    return {...r,sim,score:sim*decay*boost,keepRecall};
  }).filter(r=>r.sim>=ragThreshold() && r.keepRecall !== false).sort((a,b)=>b.score-a.score);
  const top=scored.slice(0,ragTopK());
  const chosen=new Set(top.map(t=>t.id));const assoc=[];const cap=ragTopK()+3;
  for(const t of top){for(const r of filtered){if(chosen.has(r.id))continue;if(r.window_id===t.window_id&&Math.abs((r.ts||0)-(t.ts||0))<=30*60*1000){r.assoc=true;assoc.push(r);chosen.add(r.id);if(top.length+assoc.length>=cap)break;}}if(top.length+assoc.length>=cap)break;}
  return top.concat(assoc);
}

/* 优化1：召回渲染情绪标签 + 关联记忆分组 */
function emotionLabelOf(key){try{return (EMOTION_LEXICON[key]||{}).label||'';}catch(e){return '';}}
function formatRecall(items){
  if(!items||!items.length)return'';
  const main=items.filter(i=>!i.assoc),rel=items.filter(i=>i.assoc);
  let out='\n【召回的长期记忆】\n';
  out+=main.map(it=>{const who=it.role==='user'?'用户曾说':'AI曾说';const emo=it.emotion?emotionLabelOf(it.emotion):'';const emoStr=emo?`，当时情绪：${emo}`:'';const relv=(it.sim!=null?it.sim:it.score);return `· (${who}，相关度${(relv*100).toFixed(0)}%${emoStr}) ${it.text.slice(0,120)}`;}).join('\n');
  if(rel.length)out+='\n【同一时段还聊到】\n'+rel.map(it=>`· ${it.text.slice(0,80)}`).join('\n');
  return out;
}

/* 优化4：主动回忆计数器（每次 AI 回复 +1，AI 用 [[recall]] 后清零；累积到阈值才强提示回忆） */
function recallCounterGet(){return parseInt(localStorage.getItem('recall_counter')||'0');}
function recallCounterBump(reset){if(reset){localStorage.setItem('recall_counter','0');return;}localStorage.setItem('recall_counter',String(recallCounterGet()+1));}
function shouldTriggerRecall(){return recallCounterGet()>=8;}

/* 优化6/8联动：用户确认/复习时提升该记忆权重，抵消遗忘 */
async function boostMemoryByText(text){try{if(!text)return;const store=await VDB.all();const key=text.slice(0,20);const t=store.find(r=>r.text&&r.text.includes(key));if(t){t.boost=Math.min((t.boost||1)+0.5,3);await VDB.put(t);}}catch(e){}}
