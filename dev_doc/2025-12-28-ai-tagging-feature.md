# AI 自动打标功能实现文档

**版本**: v1.2.0
**日期**: 2025-12-28
**作者**: Claude Code

## 功能概述

本次更新为 PaperMemory 添加了 AI 自动打标功能，支持使用 OpenAI 兼容的大模型 API 根据论文的标题和摘要自动生成标签。

### 核心特性

1. **OpenAI 兼容 API 支持**
   - 支持配置自定义 API Base URL
   - 支持配置 API Key 和模型名称
   - 兼容所有 OpenAI Chat Completions 格式的 API

2. **可配置的标签体系**
   - 三大类标签：Area（领域）、Task（任务）、Method（方法）
   - 默认提供 198 个预定义标签
   - 用户可在 Options 页面自定义标签体系

3. **灵活的 Prompt 模板**
   - 支持自定义 Prompt 模板
   - 内置占位符：`{AREA_TAGS}`, `{TASK_TAGS}`, `{METHOD_TAGS}`, `{TITLE}`, `{ABSTRACT}`
   - 可重置为默认模板

4. **双模式打标**
   - **手动批量打标**：在 Options 页面一键为所有未打标论文生成标签
   - **自动打标**：保存新论文时自动调用 AI 生成标签

5. **智能标签合并**
   - AI 生成的标签与现有标签自动合并
   - 不区分大小写的去重处理
   - 最多保留 9 个标签

## 文件改动清单

### 新增文件 (2 个)

1. **`src/shared/js/utils/aiTagging.js`** (240 行)
   - AI 打标核心模块
   - 包含 API 调用、标签解析、批量处理等功能

2. **`dev_doc/tag.md`**
   - 标签体系参考文档
   - 包含 Area/Task/Method 三大类共 198 个标签

### 修改文件 (9 个)

1. **`src/shared/js/utils/config.js`** (+236 行)
2. **`src/options/options.js`** (+218 行)
3. **`src/options/options.html`** (+99 行)
4. **`src/background/background.js`** (+23 行)
5. **`src/shared/js/utils/paper.js`** (+22 行)
6. **`src/shared/min/utils.min.js`** (+25 行)
7. **`manifest.json`** (+1 行)
8. **`gulpfile.mjs`** (+1 行)
9. **`CLAUDE.md`** (+4 行)

**总计**: +629 行代码

## 详细改动说明

### 1. 核心模块：`src/shared/js/utils/aiTagging.js`

新增的 AI 打标核心模块，包含以下关键函数：

#### 主要函数

- **`getTagTaxonomy()`**
  - 从 Chrome Storage 读取标签体系配置
  - 如果未配置则使用默认值
  - 返回 `{ areaTags, taskTags, methodTags }`

- **`getAIConfig()`**
  - 获取完整的 AI 配置（API 配置 + 标签体系）
  - 返回包含 enabled, baseUrl, apiKey, model, prompt 等字段

- **`callAIAPI({ baseUrl, apiKey, model, messages, temperature })`**
  - 调用 OpenAI 兼容的 Chat Completions API
  - 支持自定义 temperature（默认 0.3）
  - 最大 token 数：500
  - 完整的错误处理和日志记录

- **`parseAITags(aiResponse)`**
  - 解析 AI 返回的 JSON 数组
  - 降级方案：使用正则表达式提取标签
  - 过滤、清理、转小写
  - 限制最多 9 个标签

- **`mergeTagsWithAI(existingTags, aiTags)`**
  - 合并现有标签和 AI 生成的标签
  - 不区分大小写的去重处理
  - 保持原始标签的大小写格式

- **`generateAITags(paper)`**
  - 为单篇论文生成 AI 标签
  - 构建 prompt（替换占位符）
  - 调用 API 并解析结果
  - 完整的配置检查和错误处理

- **`tagAllUntaggedPapers()`**
  - 批量为所有未打标论文生成标签
  - 返回成功/失败统计和错误信息
  - 逐个处理，避免并发问题

### 2. 配置系统：`src/shared/js/utils/config.js`

新增 AI 配置项和默认值：

#### 新增配置键 (9 个)

添加到 `global.prefsStorageKeys` 数组：
- `aiTaggingEnabled` - AI 打标功能开关
- `aiApiBaseUrl` - API 基础 URL
- `aiApiKey` - API 密钥
- `aiModel` - 模型名称
- `aiTaggingPrompt` - 自定义 Prompt 模板
- `aiAutoTagOnSave` - 保存时自动打标开关
- `aiAreaTags` - Area 标签列表（58 个）
- `aiTaskTags` - Task 标签列表（57 个）
- `aiMethodTags` - Method 标签列表（83 个）

#### 新增默认配置对象

`global.aiTaggingDefaults` 包含：
- 默认 API 配置（OpenAI API v1）
- 默认模型：gpt-4o-mini
- 完整的 Prompt 模板
- 完整的标签体系（198 个标签）

### 3. Options 页面 UI：`src/options/options.html`

新增 AI 配置界面（99 行），包含：

#### UI 组件

1. **AI 配置表单**
   - API Base URL 输入框
   - API Key 输入框（密码类型）
   - Model 输入框
   - 保存配置按钮
   - 测试连接按钮

2. **自动打标开关**
   - Checkbox：保存新论文时自动打标

3. **手动批量打标**
   - 批量打标按钮
   - 进度显示区域

4. **Prompt 编辑器**
   - Textarea：自定义 Prompt 模板
   - 保存按钮
   - 重置按钮

5. **标签体系编辑器**
   - 三个 Textarea（Area/Task/Method）
   - 保存标签体系按钮
   - 重置标签体系按钮

6. **反馈信息**
   - 成功/错误消息显示区域
   - 加载动画

### 4. Options 页面逻辑：`src/options/options.js`

新增 `setupAITagging()` 函数（218 行），实现：

#### 核心功能

1. **配置加载与显示**
   - 从 Chrome Storage 加载 AI 配置
   - 加载标签体系配置
   - 填充表单字段

2. **保存 AI 配置**
   - 验证输入
   - 保存到 Chrome Storage
   - 显示成功/错误消息

3. **测试 AI 连接**
   - 通过 background script 调用 API
   - 发送测试消息
   - 显示连接结果

4. **批量打标**
   - 调用 background script 的 `tagAllUntaggedPapers`
   - 显示进度和结果统计
   - 错误处理和反馈

5. **Prompt 管理**
   - 保存自定义 Prompt
   - 重置为默认 Prompt
   - 实时预览占位符

6. **标签体系管理**
   - 解析 textarea 内容为数组
   - 保存到 Chrome Storage
   - 重置为默认标签体系

7. **自动打标开关**
   - Toggle checkbox 状态
   - 保存到 Chrome Storage

### 5. Background Script：`src/background/background.js`

新增消息处理器（23 行）：

#### 新增消息类型

1. **`testAIConnection`**
   - 测试 AI API 连接
   - 发送简单的测试消息
   - 返回成功/失败状态

2. **`tagAllUntaggedPapers`**
   - 调用批量打标函数
   - 返回统计结果

3. **`generateAITagsForPaper`**
   - 为单篇论文生成标签
   - 返回标签数组

#### 模块导入

在 `importScripts` 中添加：
```javascript
"../shared/js/utils/aiTagging.js"
```

### 6. 自动打标集成：`src/shared/js/utils/paper.js`

在 `addOrUpdatePaper()` 函数末尾新增自动打标逻辑（22 行）：

#### 实现细节

- **触发条件**：
  - 论文是新添加的（`isNew === true`）
  - 启用了自动打标（`aiAutoTagOnSave === true`）
  - AI 功能已启用（`aiTaggingEnabled === true`）
  - 论文没有标签或标签为空

- **执行方式**：
  - 异步执行，不阻塞主流程
  - 使用 IIFE（立即执行函数表达式）
  - 完整的错误处理和日志记录

- **标签处理**：
  - 调用 `generateAITags(paper)` 生成标签
  - 使用 `mergeTagsWithAI()` 合并标签
  - 更新 storage 中的论文数据

### 7. 构建配置：`gulpfile.mjs` 和 `manifest.json`

#### gulpfile.mjs (+1 行)

在 utils 任务的文件列表中添加 `aiTagging.js`：
- 位置：在 `data.js` 之后，`paper.js` 之前
- 确保 `aiTagging.js` 在 `paper.js` 之前加载（依赖关系）

#### manifest.json (+1 行)

在 content_scripts 的 js 数组中添加：
```javascript
"src/shared/js/utils/aiTagging.js"
```
- 位置：在 `data.js` 之后，`paper.js` 之前
- 确保 content script 环境中也能访问 AI 打标功能

## 使用指南

### 配置步骤

1. **打开 Options 页面**
   - 右键点击扩展图标 → Options
   - 或在扩展管理页面点击 "详细信息" → "扩展程序选项"

2. **配置 AI API**
   - 填写 API Base URL（默认：`https://api.openai.com/v1`）
   - 填写 API Key
   - 填写模型名称（默认：`gpt-4o-mini`）
   - 点击 "Test Connection" 测试连接
   - 点击 "Save AI Configuration" 保存配置

3. **启用自动打标（可选）**
   - 勾选 "Auto-tag on save" 复选框
   - 保存新论文时会自动调用 AI 生成标签

4. **自定义 Prompt（可选）**
   - 在 "Custom Prompt Template" 区域编辑 Prompt
   - 使用占位符：`{AREA_TAGS}`, `{TASK_TAGS}`, `{METHOD_TAGS}`, `{TITLE}`, `{ABSTRACT}`
   - 点击 "Save Prompt" 保存
   - 点击 "Reset to Default" 恢复默认

5. **自定义标签体系（可选）**
   - 在三个 textarea 中编辑标签（每行一个）
   - 点击 "Save Tag Taxonomy" 保存
   - 点击 "Reset to Default" 恢复默认

### 使用方式

#### 方式一：手动批量打标

1. 在 Options 页面找到 "Manual Batch Tagging" 区域
2. 点击 "Tag All Untagged Papers" 按钮
3. 等待处理完成，查看结果统计

#### 方式二：自动打标

1. 启用 "Auto-tag on save" 选项
2. 访问任意支持的论文页面（如 arXiv）
3. PaperMemory 自动保存论文时会调用 AI 生成标签
4. 标签会自动添加到论文中

## 技术实现要点

### 1. 异步执行设计

- **不阻塞主流程**：AI 调用使用异步 IIFE，不会阻塞论文保存
- **错误隔离**：AI 打标失败不影响论文正常保存
- **日志记录**：完整的 console.log 用于调试

### 2. 标签解析容错

- **主方案**：直接解析 JSON 数组
- **降级方案**：正则表达式提取标签
- **过滤清理**：去除无效标签，统一转小写

### 3. 配置管理

- **Chrome Storage**：所有配置存储在 Chrome Storage
- **默认值**：完整的默认配置，首次使用即可工作
- **可扩展**：标签体系和 Prompt 都可自定义

### 4. 模块加载顺序

- **关键依赖**：`aiTagging.js` 必须在 `paper.js` 之前加载
- **两处配置**：
  - `gulpfile.mjs`：构建时的文件顺序
  - `manifest.json`：content script 的加载顺序

### 5. 消息传递机制

- **Background Script**：处理 API 调用和批量操作
- **Options Page**：通过 `chrome.runtime.sendMessage` 与 background 通信
- **返回结果**：使用 Promise 和 `sendResponse` 回调

## 常见问题

### Q1: 为什么自动打标没有生效？

**可能原因**：
1. AI 功能未启用（检查 `aiTaggingEnabled`）
2. 自动打标开关未开启（检查 `aiAutoTagOnSave`）
3. API 配置错误（测试连接）
4. 论文已有标签（只为无标签论文打标）
5. 模块加载顺序错误（检查 manifest.json）

### Q2: API 调用失败怎么办？

**排查步骤**：
1. 检查 API Base URL 是否正确
2. 检查 API Key 是否有效
3. 检查模型名称是否正确
4. 查看浏览器控制台的错误信息
5. 使用 "Test Connection" 功能测试

### Q3: 标签格式不正确怎么办？

**解决方案**：
1. 检查标签体系配置（每行一个标签）
2. 确保标签使用 `category/name` 格式
3. 使用 "Reset to Default" 恢复默认标签
4. 自定义 Prompt 时确保要求 AI 返回 JSON 数组

### Q4: 如何使用其他 AI 服务？

**支持的服务**：
- OpenAI API
- Azure OpenAI
- 任何兼容 OpenAI Chat Completions 格式的 API（如 Ollama、LM Studio 等）

**配置方法**：
- 修改 API Base URL 为对应服务的地址
- 使用对应服务的 API Key
- 选择支持的模型名称

## 后续优化方向

### 短期优化

1. **性能优化**
   - 添加请求缓存机制
   - 支持批量并发处理
   - 优化标签解析性能

2. **用户体验**
   - 添加打标进度条
   - 支持取消正在进行的批量打标
   - 添加打标历史记录

3. **错误处理**
   - 更详细的错误提示
   - 自动重试机制
   - 网络超时配置

### 长期优化

1. **功能扩展**
   - 支持更多 AI 模型（Claude, Gemini 等）
   - 支持批量重新打标（覆盖现有标签）
   - 支持用户反馈和标签修正
   - 添加标签推荐功能

2. **Prompt 优化**
   - 添加 few-shot examples
   - 支持多语言 Prompt
   - 根据论文领域动态调整 Prompt

3. **数据分析**
   - 标签使用统计
   - AI 打标质量评估
   - 标签分布可视化

## 测试建议

### 单元测试

1. **aiTagging.js 模块测试**
   - `parseAITags()` 函数测试（正常 JSON、异常格式）
   - `mergeTagsWithAI()` 函数测试（去重逻辑）
   - API 调用模拟测试

2. **配置管理测试**
   - Chrome Storage 读写测试
   - 默认值加载测试
   - 配置验证测试

### 集成测试

1. **完整流程测试**
   - 配置 → 测试连接 → 批量打标
   - 配置 → 自动打标 → 验证结果

2. **错误场景测试**
   - API 调用失败
   - 网络超时
   - 无效的 API Key
   - 格式错误的响应

### 用户体验测试

1. **UI 交互测试**
   - 所有按钮点击响应
   - 表单输入验证
   - 成功/错误消息显示
   - 加载状态显示

2. **性能测试**
   - 批量打标性能（100+ 论文）
   - API 响应时间
   - 内存使用情况

## 注意事项

### 开发注意事项

1. **模块加载顺序**
   - `aiTagging.js` 必须在 `paper.js` 之前加载
   - 需要同时修改 `gulpfile.mjs` 和 `manifest.json`

2. **异步处理**
   - AI 调用不应阻塞主流程
   - 使用 IIFE 包装异步代码
   - 完整的错误处理

3. **Chrome Storage**
   - 所有配置使用 Chrome Storage
   - 注意 Storage 配额限制
   - 提供合理的默认值

### 使用注意事项

1. **API 成本**
   - AI API 调用会产生费用
   - 建议使用较小的模型（如 gpt-4o-mini）
   - 批量打标前评估成本

2. **隐私安全**
   - API Key 存储在本地 Chrome Storage
   - 论文标题和摘要会发送到 AI 服务
   - 建议使用可信的 AI 服务提供商

3. **标签质量**
   - AI 生成的标签可能不完全准确
   - 建议人工审核和调整
   - 可通过优化 Prompt 提高质量

## 版本历史

### v1.2.0 (2025-12-28)

**新增功能**：
- ✨ AI 自动打标功能
- ✨ OpenAI 兼容 API 支持
- ✨ 可配置的标签体系（198 个预定义标签）
- ✨ 自定义 Prompt 模板
- ✨ 手动批量打标
- ✨ 保存时自动打标

**技术改进**：
- 🔧 新增 `aiTagging.js` 核心模块
- 🔧 扩展 Chrome Storage 配置系统
- 🔧 完善 Options 页面 UI
- 🔧 优化模块加载顺序

**文件变更**：
- 新增 2 个文件
- 修改 9 个文件
- 新增 629 行代码

## 相关资源

### 文档

- [标签体系参考](./tag.md) - 完整的标签列表
- [实现计划](../.claude/plans/sharded-meandering-biscuit.md) - 详细的实现计划

### 代码文件

- [aiTagging.js](../src/shared/js/utils/aiTagging.js) - AI 打标核心模块
- [config.js](../src/shared/js/utils/config.js) - 配置系统
- [options.html](../src/options/options.html) - Options 页面 UI
- [options.js](../src/options/options.js) - Options 页面逻辑

### API 文档

- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Chrome Runtime Messaging](https://developer.chrome.com/docs/extensions/mv3/messaging/)

## 贡献者

- **Claude Code** - 功能设计与实现
- **xiaohansong** - 需求提出与测试

## 许可证

本功能遵循 PaperMemory 项目的许可证。

---

**最后更新**: 2025-12-28
**文档版本**: 1.0
