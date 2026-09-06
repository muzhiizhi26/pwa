# Lovestory Companion OS — AI 情感伴侣

智能 AI 陪伴应用，支持文字/语音/图片多模态交互、实时语音通话、情绪感知、长期记忆、群聊、日记、朋友圈、Bark 推送等功能。

## ✨ 核心功能

### 💬 智能对话
- 多模型支持（DeepSeek、Qwen、GLM、Gemini、OpenAI 等，可自定义）
- 多模态输入：文字、语音、图片
- 情绪感知：AI 实时识别用户情绪并调整回复风格
- 思考链展示：AI 推理过程可视化（`.thinking-block`）
- 私密独白前置：AI 内心独白作为思考汽泡显示

### 🧠 记忆系统
- **向量记忆（VDB）**：基于嵌入向量的语义召回，支持本地哈希/远程 API 双模式
- **分层记忆**：10 层记忆架构（事件记忆→中期摘要→长期档案→人生模型）
- **IndexedDB 主存储**：对话历史完整保存在 IndexedDB，localStorage 仅做快速缓存（100 条）
- **夜间做梦巩固**：自动合并相似记忆、去冗余
- **上下文路由**：场景感知（情绪倾诉/回忆/探索/闲聊）+ 自适应预算分配

### 🎤 语音交互
- **按住说话**：录音 → STT 语音识别 → 发送
- **实时语音通话**：端到端语音对话，支持 VAD 打断（barge-in）
- **通话字幕**：按角色（用户/AI/系统）渲染独立气泡
- **TTS 朗读**：AI 回复自动朗读（支持多种音色）

### 💖 关系与羁绊
- 亲密度/信任度/熟悉度三维指标
- 关系阶段自动晋升（陌生人→朋友→暧昧→恋人→伴侣）
- 共同经历时间线（Timelines 2.0）
- 情感羁绊系数面板

### 👥 群聊
- 多 AI 角色同时对话
- 自动接龙聊天
- 语音通话群聊
- 社交关系网络图

### 📱 PWA + 推送
- 电脑/手机浏览器均可使用
- 可添加到主屏幕（类原生 App 体验）
- Service Worker 离线缓存
- **Bark 推送**：AI 主动消息推送到 iPhone 通知（可经华为运动健康转发到手环）

### 📔 其他功能
- **日记**：AI 自动生成每日日记
- **朋友圈**：动态生成与展示（里程碑/关系纪念）
- **主动消息**：4 方向触发（时间/沉默/心情/随机）+ 自适应冷却
- **创作歌曲**：AI 协助写词谱曲
- **代码分析**：上传 ZIP 项目，AI 分析代码
- **阅读**：电子书导入与笔记
- **在线音乐**：搜索播放
- **预约系统**：自然语言预约 AI 在指定时间发消息

## 🚀 快速开始

### 方式一：纯前端运行（推荐）

直接用浏览器打开 `index.html` 即可使用基础聊天功能。配置 API Key 后可使用完整 AI 能力。

### 方式二：启动本地服务

```bash
npm install
# 编辑 .env 文件，设置 GEMINI_API_KEY（可选，用于 Gemini 模型代理）
npm run dev    # 启动服务（端口 3000）
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
| 自定义 | OpenAI 兼容接口 | — |

### 语音设置

- 语音开关：🔊 总开关
- 自动朗读：AI 回复自动 TTS 朗读
- API Key：配置 TTS/STT 服务商密钥
- 音色选择：支持多种语音合成音色

### Bark 推送

1. iPhone 安装 [Bark](https://apps.apple.com/app/bark/id1403753865)（免费）
2. PWA 设置 → 🔔 AI 主动消息推送 → 打开 → 填入 Bark Key
3. AI 主动消息 → iPhone 通知栏弹出

## 🏗️ 项目架构

```
lovestory/
├── index.html              # 主页面（PWA 入口）
├── server.js               # 本地服务器（Express + Gemini 代理）
├── sw.js                   # Service Worker（离线缓存）
├── manifest.json           # PWA 清单
│
├── css/
│   └── style.css           # 全局样式（响应式 + 深色模式）
│
├── js/
│   ├── main.js             # 应用入口（初始化、事件绑定）
│   ├── config.js           # 配置常量（默认服务商、情绪图床）
│   ├── utils.js            # 工具函数（ctxSlice、存储、Bark 推送）
│   ├── chat.js             # 对话核心（消息收发、历史管理、上下文构建）
│   ├── voice.js            # 语音录音（PTT 按住说话）
│   ├── call.js             # 实时语音通话（VAD、barge-in、字幕气泡）
│   ├── settings.js         # 设置面板（16 个分类模块）
│   ├── emotion.js          # 情绪系统（检测/衰减/表情渲染）
│   ├── group.js            # 群聊（多 AI 对话/接龙/关系图）
│   ├── proactive.js        # 主动消息（4 方向触发/自适应冷却/预约系统）
│   ├── relationship.js     # 关系系统（亲密度/信任/熟悉度/阶段晋升/衰减）
│   ├── memory.js           # 向量记忆库（VDB CRUD/嵌入/召回/夜间巩固）
│   ├── memory-tiers.js     # 记忆架构（场景路由/中期摘要/LLM 包装/确认机制）
│   ├── memory-bridge.js    # 事件总线 + 人生模型（UserLifeModel）
│   ├── token-telemetry.js  # Token 遥测（估算/日志/统计）
│   ├── moments.js          # 朋友圈（动态生成/里程碑/关系纪念）
│   ├── diary.js            # 日记（AI 自动生成每日日记）
│   ├── tabs.js             # 关系面板 UI（羁绊系数/时间线/独白）
│   ├── evolution.js        # 人格演化（羁绊点数/等级/解锁）
│   ├── orchestrator.js     # 任务编排器
│   ├── launcher.js         # 桌面启动器
│   ├── imagegen.js         # AI 生图
│   ├── music.js            # 在线音乐
│   ├── songcraft.js        # 歌曲创作
│   ├── narrative.js        # 叙事引擎
│   ├── ebook.js            # 电子书阅读
│   ├── code-analyzer.js    # 代码分析
│   ├── band-bridge.js      # 华为手环连接（Bark 转发）
│   ├── push-client.js      # Web Push 客户端
│   ├── life-rhythm.js      # 生活节律
│   ├── life-summary.js     # 生活摘要
│   ├── care-strategy.js    # 关怀策略
│   ├── rhythm-engine.js    # 对话节奏引擎
│   ├── attention-manager.js # 注意力管理（上下文聚焦）
│   ├── project-context.js  # 项目上下文
│   ├── communication.js    # 通信模块
│   │
│   ├── core/               # 核心基础设施
│   │   ├── storage-manager.js   # 统一存储管理（localStorage + IndexedDB）
│   │   ├── api-scheduler.js     # API 调度器
│   │   ├── error-boundary.js    # 错误边界
│   │   └── trace-center.js      # 全链路日志追踪
│   │
│   ├── memory/             # 记忆子系统
│   │   └── embedding-cache.js   # Embedding 向量缓存
│   │
│   ├── runtime/            # 运行时
│   │   ├── runtime.js           # 运行时核心
│   │   ├── context.js           # 上下文管理
│   │   ├── prompt-builder.js    # Prompt 构建
│   │   ├── multimodal-runtime.js # 多模态处理
│   │   ├── memory/              # 记忆图谱
│   │   └── models/              # 数据模型
│   │
│   ├── services/           # 外部服务
│   │   └── gemini-multimodal.js # Gemini 多模态服务
│   │
│   ├── voice/              # 语音子系统
│   │   └── multimodal-audio.js  # 多模态音频处理
│   │
│   ├── message/            # 消息子系统
│   │   ├── message-types.js     # 消息类型定义
│   │   └── message-adapter.js   # 消息适配器
│   │
│   └── modules/            # ES Module 版本（渐进迁移）
│       ├── main.js
│       ├── chat/
│       ├── core/
│       ├── voice/
│       └── ...
│
├── emotions/               # 情绪表情图片（10 种情绪 × .webp）
├── api/                    # API 辅助
│   └── song.js
├── api-server/             # 本地 API 服务器
│   ├── server.mjs
│   └── package.json
├── cloudflare-worker/      # Cloudflare Worker（Bark 推送中转）
│   └── bark-relay.js
│
├── package.json
├── .env.example
├── .vapid.json             # Web Push VAPID 密钥
└── test-modules.html       # 模块测试页面
```

## 🧠 核心架构

| 模块 | 说明 |
|------|------|
| **Storage Manager** | 统一存储层：localStorage（快速缓存 100 条）+ IndexedDB（完整主存储），自动容量监控 |
| **Memory Tiers** | 10 层分层记忆：事件记忆 → 中期摘要 → 长期档案 → 人生模型，统一维护调度器 |
| **VDB（向量记忆库）** | 基于嵌入向量的语义召回，支持本地哈希/远程 API，含 IndexedDB 持久化缓存 |
| **Relationship OS** | 亲密度/信任度/熟悉度三维指标 + 关系阶段晋升 + 衰减 + 情感羁绊系数 |
| **Context Router** | 场景感知路由（情绪倾诉/回忆/探索/闲聊）+ 固定预算分配 |
| **Voice Runtime** | 实时通话状态机 + VAD 语音活动检测 + barge-in 打断 |
| **Proactive Engine** | 4 方向主动消息（时间/沉默/心情/随机）+ 自适应冷却 + 预约系统 |
| **Token Telemetry** | Token 估算/遥测/统计（独立模块） |
| **Event Bus** | 统一事件总线（MemoryLockQueue 并发锁 + 事件流） |

## 🔧 兼容性

| 浏览器 | 聊天 | 语音录制 | 实时通话 | PWA |
|--------|:----:|:--------:|:--------:|:---:|
| Chrome | ✅ | ✅ | ✅ | ✅ |
| Safari | ✅ | ✅ | ✅ | ✅ |
| 手机 Chrome | ✅ | ✅ | ✅ | ✅ |
| 手机 Safari | ✅ | ✅ | ✅ | ✅ |

> 语音功能需要 HTTPS 或 localhost 环境。

## 📄 许可证

MIT © 2026 muzhizhii26
