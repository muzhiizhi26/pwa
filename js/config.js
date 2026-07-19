/* ===== 全局常量与状态 ===== */
const DEFAULT_EMO_BASE='https://lovestory-7gi.pages.dev/emotions';
const DEFAULT_TTS_URL='https://api.siliconflow.cn/v1/audio/speech';
const STT_URL='https://api.siliconflow.cn/v1/audio/transcriptions';
const VOICE_LIST_URL='https://api.siliconflow.cn/v1/audio/voice/list';
const FIXED_TTS_MODELS=['fnlp/MOSS-TTSD-v0.5','fnlp/moss-ttsd-v0.5.online.utf8-bytes'];
const EMBED_DIM=256;
const DEFAULT_PROMPT='你是一个有帮助、友好、诚实的AI助手。请用清晰、简洁的语言回答问题。';

const FREE_PROVIDER={id:'free',name:'免费模型(固化)',icon:'🆓',endpoint:'https://text.pollinations.ai/openai',auth:'none',locked:true,models:[{name:'openai',caps:['💡'],context:'32K',output:'4K'}],note:'无需 API Key，固化不可改'};
const GEMINI_PROVIDER={id:'gemini_proxy',name:'内置 Gemini (极速·极稳)',icon:'✨',endpoint:'/api/chat',auth:'none',locked:true,models:[{name:'gemini-3.5-flash',caps:['💡','👁️'],context:'1M',output:'8K'}],note:'本地服务器中转，无需前端配置 API Key，响应极快，最稳定'};
const DEFAULT_PROVIDERS=[
    JSON.parse(JSON.stringify(FREE_PROVIDER)),
    {id:'deepseek',name:'DeepSeek',icon:'🔍',endpoint:'https://api.deepseek.com',auth:'Bearer',models:[{name:'deepseek-chat',caps:['💡'],context:'64K',output:'8K'},{name:'deepseek-reasoner',caps:['💡'],context:'64K',output:'8K'}],note:'reasoner支持思考'},
    {id:'vector',name:'向量引擎',icon:'🧭',endpoint:'https://api.vectorengine.cn',auth:'Bearer',models:[{name:'gemini-3.1-flash-image-preview',caps:['💡','👁️'],context:'128K',output:'8K'}],note:'中转，支持gemini生图'},
    {id:'siliconflow',name:'SiliconFlow',icon:'🌊',endpoint:'https://api.siliconflow.cn/v1',auth:'Bearer',models:[{name:'deepseek-ai/DeepSeek-V3',caps:['💡'],context:'64K',output:'8K'}],note:'语音/嵌入同源'},
    {id:'custom',name:'自定义',icon:'⚙️',endpoint:'',auth:'Bearer',models:[],note:'OpenAI兼容'}
];

let providers=[],currentProviderId='free',selectedModelName='';
let conversationHistory=[],pendingImage=null,quotedText=null,ctxTargetUid=null,settingsMode='general';
let pendingGenInit=null;
let selectMode=false,selectedUids=new Set();

/* 情绪图床 / 语音模型配置 */
function emoBase(){return (localStorage.getItem('emotion_img_base')||DEFAULT_EMO_BASE).replace(/\/+$/,'');}
function emotionImgUrl(dom){return `${emoBase()}/${dom||'calm'}.webp`;}
function getTtsModels(){let l=null;try{l=JSON.parse(localStorage.getItem('tts_model_list'));}catch(e){}if(!Array.isArray(l)){l=FIXED_TTS_MODELS.slice();localStorage.setItem('tts_model_list',JSON.stringify(l));}return l;}
function saveTtsModels(l){localStorage.setItem('tts_model_list',JSON.stringify(l));}
function getTtsUrl(){return (localStorage.getItem('tts_url')||DEFAULT_TTS_URL).trim();}
