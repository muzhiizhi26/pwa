/* ===== 情绪模型（用户 + AI 表情包） ===== */
const EMOTION_LEXICON={
 happy:{label:'愉快',words:['开心','高兴','哈哈','太好了','喜欢','棒','幸福','满意','感谢','谢谢','嘿嘿','😄','🥰']},
 excited:{label:'兴奋',words:['太棒了','激动','迫不及待','哇','超级','棒极了','期待死了','兴奋','好耶','冲鸭','冲']},
 love:{label:'心动',words:['爱你','喜欢你','心动','想你','么么','亲亲','宝贝','偏爱','宠你','❤️']},
 gentle:{label:'温柔',words:['抱抱','陪你','在呢','别担心','我懂','辛苦了','照顾','晚安','早安','乖','慢慢来']},
 calm:{label:'平静',words:[]},
 thinking:{label:'思考',words:['让我想想','思考','也许','可能','分析','为什么','怎么办法','嗯','考虑']},
 sad:{label:'低落',words:['难过','伤心','哭','失望','沮丧','痛苦','孤独','想哭','委屈','心疼','遗憾','唉','😭','💔']},
 angry:{label:'生气',words:['生气','愤怒','烦','讨厌','可恶','气死','闭嘴','烦躁','无语','😠','😡']},
 anxious:{label:'焦虑',words:['焦虑','害怕','担心','紧张','不安','恐惧','怎么办','着急','压力','慌','😰']},
 tired:{label:'疲惫',words:['累','疲惫','困','撑不住','没力气','倦','想睡','熬夜']}
};
function detectEmotion(text){let max=0,best='calm';for(const[k,d]of Object.entries(EMOTION_LEXICON)){let s=0;for(const w of d.words)if(text.includes(w))s++;if(s>max){max=s;best=k;}}return best;}
function decayState(key,ne){let st={};try{st=JSON.parse(localStorage.getItem(key)||'{}');}catch(e){}for(const k of Object.keys(EMOTION_LEXICON))st[k]=(st[k]||0)*0.6;st[ne]=(st[ne]||0)+1;localStorage.setItem(key,JSON.stringify(st));let max=0,dom='calm';for(const[k,v]of Object.entries(st))if(v>max){max=v;dom=k;}return dom;}
function updateEmotionState(ne){const dom=decayState('emotion_state',ne);localStorage.setItem('emotion_dominant',dom);return dom;}

let msgCounter=parseInt(localStorage.getItem('emo_msg_counter')||'0');
function bumpMsgCounter(){msgCounter++;localStorage.setItem('emo_msg_counter',String(msgCounter));}

/* 情绪弹窗：顶部居中，6 秒由大到小淡出 */
function showEmotionBurst(dom){const d=EMOTION_LEXICON[dom]||EMOTION_LEXICON.calm;const el=document.getElementById('emotionBurst');const img=document.getElementById('burstImg');img.onerror=()=>{img.style.display='none';};img.style.display='';img.src=emotionImgUrl(dom);document.getElementById('burstLabel').textContent='AI '+d.label;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),6000);}
/* 点击顶部 AI 头像，弹出情绪文字（与 user 一致地展示情绪） */
function showAiEmotionBurst(){if(localStorage.getItem('emotion_enabled')==='false'){showToast('情绪模型已关闭');return;}const dom=localStorage.getItem('ai_emotion_dominant')||'calm';showEmotionBurst(dom);}

function renderBrandAvatar(){
  if(typeof currentPrivateAiId==='function'&&currentPrivateAiId()!=='main'){
    if(typeof updateBrandAvatarAndHeader==='function')updateBrandAvatarAndHeader();
    return;
  }
  const wrap=document.getElementById('brandAvatar');if(!wrap)return;
  const custom=localStorage.getItem('ai_avatar');
  if(custom){
    wrap.innerHTML=`<img class="avatar" src="${custom}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    return;
  }
  const off=localStorage.getItem('emotion_enabled')==='false';
  if(off){wrap.innerHTML=`<span>🤖</span>`;return;}
  const dom=localStorage.getItem('ai_emotion_dominant')||'calm';
  wrap.innerHTML=`<img src="${emotionImgUrl(dom)}" onerror="this.outerHTML='<span>🤖</span>'">`;
}
function updateAiEmotion(text){if(localStorage.getItem('emotion_enabled')==='false')return;const prev=localStorage.getItem('ai_emotion_dominant')||'calm';const e=detectEmotion(text||'');const dom=decayState('ai_emotion_state',e);localStorage.setItem('ai_emotion_dominant',dom);bumpMsgCounter();renderEmotionPills();renderBrandAvatar();if(dom!==prev){const lastBurst=parseInt(localStorage.getItem('emo_last_burst_count')||'-999');if(msgCounter-lastBurst>=20){showEmotionBurst(dom);localStorage.setItem('emo_last_burst_count',String(msgCounter));}}}
function renderEmotionPills(){renderBrandAvatar();const us=document.getElementById('userEmotionPill');const off=localStorage.getItem('emotion_enabled')==='false';if(us){if(off){us.style.display='none';}else{us.style.display='';const dom=localStorage.getItem('emotion_dominant')||'calm';const d=EMOTION_LEXICON[dom]||EMOTION_LEXICON.calm;us.textContent=d.label;us.title='你的情绪：'+d.label;}}}
function renderEmotionPill(){renderEmotionPills();}
function emotionContext(){if(localStorage.getItem('emotion_enabled')==='false')return'';const dom=localStorage.getItem('emotion_dominant')||'calm';const d=EMOTION_LEXICON[dom]||EMOTION_LEXICON.calm;const g={happy:'用户愉快，可延续轻松积极语气。',excited:'用户很兴奋，可一起热烈回应。',love:'氛围亲密，可温暖回应。',gentle:'氛围温柔，可贴心回应。',sad:'用户低落，请温柔共情。',angry:'用户有些生气，请冷静安抚。',anxious:'用户焦虑，请给予安定感。',tired:'用户疲惫，请简洁体贴。',thinking:'用户在思考，可一起分析。',calm:'用户情绪平稳，正常交流。'};return `\n【用户当前情绪】${d.label}。${g[dom]||''}`;}
