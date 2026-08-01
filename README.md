# Lovestory Companion OS — AI 情绪伴侣

智能 AI 陪伴聊天应用，支持文字/语音/图片多模态交互、实时语音通话、情绪感知、长期记忆、群聊、日记、朋友圈等功能。

## ✨ 功能特性

### 💬 智能聊天
- 多模型支持（DeepSeek、Qwen、GLM、Gemini 等）
- 多模态输入：文字、语音、图片
- 情绪感知：AI 能识别用户情绪并调整回复风格
- 长期记忆：自动记忆对话内容，跨会话召回
- 上下文管理：自动压缩长对话，节省 Token

### 🎤 语音交互
- **按住说话**：录音 → STT 语音识别 → 发送
- **实时语音通话**：端到端语音对话，支持打断
- **TTS 朗读**：AI 回复自动朗读（支持多种音色）
- 多轮录音流缓存，避免重复授权

### 👥 群聊
- 多 AI 角色同时对话
- 自动接龙聊天
- 语音通话群聊
- 社交关系网络图

### 📔 其他功能
- **日记**：AI 自动生成每日日记
- **朋友圈**：动态生成与展示
- **创作歌曲**：AI 协助写词谱曲
- **代码分析**：上传 ZIP 项目，AI 分析代码
- **阅读**：电子书导入与笔记

### 📱 PWA 支持
- 电脑/手机浏览器均可使用
- 可添加到主屏幕（类原生 App 体验）
- Service Worker 离线缓存

## 🚀 快速开始

### 方式一：纯前端运行（推荐）

直接用浏览器打开 `index.html` 即可使用基础聊天功能。
配置 API Key 后可使用完整 AI 能力。

### 方式二：启动本地服务

```bash
# 安装依赖
npm install

# 配置 Gemini API Key（可选，用于 Gemini 模型代理）
# 编辑 .env 文件，设置 GEMINI_API_KEY

# 启动服务（端口 3000）
npm run dev
```

### 方式三：Docker

```bash
docker build -t lovestory .
docker run -p 3000:3000 lovestory
```

访问 `http://localhost:3000`

## ⚙️ 配置说明

### API 服务商

支持配置多个 AI 服务商，在设置界面中管理：

| 服务商 | 说明 | 默认模型 |
|--------|------|----------|
| 向量引擎 | 中转 API，支持 Gemini 生图 | gemini-3.1-flash |
| 免费模型 | Pollinations AI（无需 Key） | openai |
| DeepSeek | 官方 API | deepseek-chat / deepseek-reasoner |
| SiliconFlow | 一站式 API（含语音） | DeepSeek-V3 |

### 语音设置

- 语音开关：🔊 总开关
- 自动朗读：AI 回复自动 TTS 朗读
- API Key：配置 TTS/STT 服务商密钥
- 音色选择：支持多种语音合成音色

## 🏗️ 项目架构

```
lovestory/
├── index.html          # 主页面
├── server.js           # 本地服务器（Express + Gemini 代理）
├── sw.js               # Service Worker（离线缓存）
├── manifest.json       # PWA 清单
├── css/
│   └── style.css       # 全局样式
├── js/
│   ├── core/
│   │   └── storage-manager.js   # 统一存储管理（localStorage + IndexedDB）
│   ├── memory/
│   │   └── embedding-cache.js   # Embedding 向量缓存
│   ├── runtime/
│   │   ├── runtime.js            # 运行时核心
│   │   ├── context.js            # 上下文管理
│   │   ├── prompt-builder.js     # Prompt 构建
│   │   ├── multimodal-runtime.js # 多模态处理
│   │   └── memory/               # 记忆图谱
│   ├── services/
│   │   └── gemini-multimodal.js  # Gemini 多模态服务
│   ├── voice/
│   │   └── multimodal-audio.js   # 多模态音频处理
│   ├── message/
│   │   ├── message-types.js      # 消息类型定义
│   │   └── message-adapter.js    # 消息适配器
│   ├── chat.js          # 聊天核心逻辑
│   ├── voice.js         # 语音录音（PTT）
│   ├── call.js          # 实时语音通话
│   ├── memory.js        # 长期记忆系统
│   ├── emotion.js       # 情绪系统
│   ├── group.js         # 群聊
│   ├── diary.js         # 日记
│   ├── moments.js       # 朋友圈
│   └── settings.js      # 设置界面
└── emotions/            # 情绪图片资源
```

## 🧠 架构特性

| 模块 | 说明 |
|------|------|
| **Storage Manager** | 统一存储层，自动选择 localStorage/IndexedDB，容量监控 |
| **Embedding Cache** | 三级缓存（内存 → IndexedDB → API），减少重复调用 |
| **Memory Graph** | 长期记忆图谱，基于向量检索 |
| **Relationship OS** | 亲密度、信任度、情绪状态机 |
| **Experience OS** | 用户偏好学习与适应 |
| **ContextAggregator** | 上下文聚合与 RAG 检索 |
| **Voice Runtime** | 实时通话状态机 + VAD 语音活动检测 |

## 🔧 兼容性

| 浏览器 | 聊天 | 语音录制 | 实时通话 | PWA |
|--------|------|----------|----------|-----|
| Chrome | ✅ | ✅ | ✅ | ✅ |
| Safari | ✅ | ✅ | ✅ | ✅ |
| 手机 Chrome | ✅ | ✅ | ✅ | ✅ |
| 手机 Safari | ✅ | ✅ | ✅ | ✅ |

> 语音功能需要 HTTPS 或 localhost 环境。

## 📄 许可证

MIT © 2026 muzhizhii26
