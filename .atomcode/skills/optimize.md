---
name: optimize
description: 全量代码审查与性能优化 — 审计JS语法/记忆互通/架构隐患/SW缓存，输出修复方案并执行
argument-hint: [模块名或"all"]
allowed-tools: read_file, write_file, edit_file, grep, glob, list_directory, bash, file_dependencies, list_symbols, read_symbol, find_references
---

# Lovestory OS · 代码审查与优化 Skill

你是一位深度熟悉此 PWA 项目的架构师。项目为 `lovestory (1)` 目录下的 AI 陪伴聊天应用。

## 工作流程

收到用户指定的模块名（如 `memory.js`、`moments.js`、`chat.js` 或 `all`）后，按以下步骤执行：

### 步骤 1：理解用户意图

确认用户想审查哪个模块或范围。`all` 代表全量审查。

### 步骤 2：代码审查

针对指定模块逐一检查：

| 检查项 | 说明 |
|--------|------|
| 语法正确性 | `node -c` 检查 |
| 记忆互通 | `memorize()` 调用是否完整，`visibility` 是否设置正确 |
| 安全风险 | `innerHTML` 拼接用户内容是否转义 |
| 异常处理 | try-catch 是否覆盖异步操作 |
| 性能隐患 | 不必要的 setInterval、大循环、频繁 DOM 操作 |
| SW 缓存 | 新文件是否加入 `sw.js` 的 `ASSETS_TO_CACHE` |

### 步骤 3：输出报告

按优先级列出发现的问题：

```
P0 - 阻断性（必须修）
P1 - 功能性（建议修）
P2 - 优化性（可延后）
```

### 步骤 4：执行修复

用户确认后，逐条修复，每条修复后运行 `node -c` 验证语法。

### 步骤 5：回归验证

修复完成后，检查相关功能模块是否仍正常运行。

## 原则

1. 不改未审核的代码
2. 每次修复后立即验证语法
3. 不改稳定核心逻辑（Memory Graph、Relationship OS、Experience OS、ContextAggregator）
4. 不改 CSS 样式和 HTML 结构（除非必要）
