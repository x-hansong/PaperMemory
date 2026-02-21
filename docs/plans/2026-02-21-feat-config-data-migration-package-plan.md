---
title: feat: Add config and data migration package
type: feat
status: completed
date: 2026-02-21
origin: docs/brainstorms/2026-02-21-config-data-migration-brainstorm.md
---

# feat: Add config and data migration package

## Overview
新增“整机迁移包”能力：用户可导出单一 `PaperMemory-migration.json`，并在目标设备导入后直接覆盖本地状态，实现“数据 + 配置 + 敏感凭证”一次迁移（see brainstorm: `docs/brainstorms/2026-02-21-config-data-migration-brainstorm.md`）。

该计划明确只覆盖单用户迁移场景，不引入团队共享格式、加密流程、合并策略或多文件打包（see brainstorm: `docs/brainstorms/2026-02-21-config-data-migration-brainstorm.md`）。

## Problem Statement / Motivation
当前项目已有：
- Memory 数据导出与覆盖导入（`src/options/options.js:641`、`src/options/options.js:675`）
- 标签维度导出与 URL 列表导入
- 分散的配置持久化（`prefs`、`syncPAT`、`autoTags`、`notion*`、`ai*` 等）

但缺少统一迁移包，导致换设备时需要人工重复配置，且易漏项。

## Research Summary
### Repo Patterns
- 数据迁移机制已存在：`migrateData()` 可处理版本差异（`src/shared/js/utils/data.js:11`）。
- 导入覆盖流程已存在：`prepareOverwriteData()` + confirm 覆盖（`src/options/options.js:695`）。
- 数据管理入口已集中在 `setupDataManagement()`（`src/options/options.js:785`）。
- 配置键定义有中心位点：`global.prefsStorageKeys`（`src/shared/js/utils/config.js:149`）。

### Learnings
- 未发现 `docs/solutions/` 历史方案库；本计划仅基于现有代码与 brainstorm 决策。

### Research Decision
- 不做外部研究，原因：现有代码对导入导出、迁移、校验路径已经完整可复用；本次主要是能力整合而非引入新框架/新协议。

## Proposed Solution
### 1) 迁移包格式（单文件）
定义 JSON schema（v1）：
- `meta`: `schemaVersion`、`exportedAt`、`appVersion`、`dataVersion`
- `data`: `papers`（含 `__dataVersion`）
- `config`: 所有迁移范围内的 storage keys（含敏感键）

### 2) 导出流程
在 Data Management 增加“Export Migration Package”动作：
- 聚合 `papers + config keys`
- 生成单文件下载
- 文件名固定前缀：`PaperMemory-migration-<date>-<time>.json`

### 3) 导入流程（覆盖）
在 Data Management 增加“Import Migration Package”动作：
- 读取并校验 schema
- 对 `data.papers` 调用兼容迁移逻辑（沿用 `migrateData()` 语义）
- 成功后覆盖写入 `papers` 与 `config` 键
- 失败时阻止覆盖并反馈原因

## Technical Considerations
- 兼容性：必须依赖 `dataVersion` 和 `migrateData()`，避免旧包直接写入导致字段缺失。
- 安全性：按决策包含敏感凭证且不加密，UI 需要明确风险提示（文件泄露风险）。
- 一致性：导入后若启用 sync/notion 等状态，应避免立即触发异常同步；需定义导入后触发顺序。
- 可测试性：导入导出需支持可重复测试样本和损坏样本。

## System-Wide Impact
- **Interaction graph**: options 页面按钮 -> 文件读写 -> `prepareOverwriteData/migrateData` -> `chrome.storage.local` -> 可能触发 `pushToRemote` 或 Notion 状态初始化。
- **Error propagation**: JSON 解析错误、schema 错误、迁移错误、storage 写入错误都需在 options 层被捕获并反馈。
- **State lifecycle risks**: 部分 key 写入成功、部分失败会造成混合状态；需保证“先校验后批量写入”与失败中止。
- **API surface parity**: 现有覆盖导入与新迁移包导入都属于“重写本地状态”，应复用一致的校验/确认交互。
- **Integration test scenarios**: 版本差异导入、损坏 JSON、缺失敏感键、导入后同步状态验证。

## SpecFlow Analysis (Flow Gaps)
### 核心用户流
1. 导出完整迁移包
2. 选择迁移包并触发导入
3. 校验通过后确认覆盖
4. 导入成功后刷新状态

### 发现的关键边界
- 包内缺少部分 config key 时：按默认值补齐还是保留本地值。
- 包版本高于当前扩展版本时：是否拒绝导入。
- 导入后是否立刻执行远程同步：可能覆盖远端或被远端回写。
- 敏感凭证为空字符串时：视为“清空”还是“无变更”。

### 计划内默认决策
- 缺失 key：按 schema 规则补默认值，不保留旧本地值（保持“整机快照语义”）。
- 高版本包：先尝试兼容迁移；不兼容则拒绝。
- 导入后自动同步：默认不立即触发，待用户下一次显式动作/常规流程触发。
- 空字符串凭证：按包内容写入（即允许清空）。

## Acceptance Criteria
- [x] 在 `src/options/options.html` 的 Data Management 区新增迁移包导入/导出入口，文案明确“含敏感信息”。
- [x] 在 `src/options/options.js` 新增迁移包导出处理器，输出单一 JSON 文件。
- [x] 在 `src/options/options.js` 新增迁移包导入处理器，包含 schema 校验、确认覆盖、错误反馈。
- [x] 在 `src/shared/js/utils/data.js` 复用或扩展现有迁移/校验能力，确保版本差异可处理。
- [x] 导入成功后 `papers` 与配置键完整落库；导入失败不应改写本地状态。
- [x] 增加测试（建议在 `test/test-storage.js` 或新增 `test/test-migration-package.js`）覆盖：
  - [ ] 正常导出->导入回放
  - [ ] 损坏 JSON
  - [x] schema 缺失字段
  - [x] 低版本/高版本数据兼容
  - [x] 敏感键存在与为空两类行为
- [x] 更新 `开发指南.md` 记录功能、迁移包字段、风险提示与测试方式。

## Success Metrics
- 新设备迁移流程可在一次导出 + 一次导入内完成。
- 导入失败场景均给出可读错误信息，无 silent failure。
- 版本差异场景下导入成功率满足预期（以测试样本为准）。

## Dependencies & Risks
- 依赖：现有 `migrateData`、`prepareOverwriteData`、`setStorage/getStorage`。
- 风险1：敏感凭证明文导出导致泄露。
  - 缓解：强提示、二次确认、文档告知。
- 风险2：导入后同步状态竞争（本地/远端覆盖）。
  - 缓解：导入流程不自动触发 push/pull，交由用户显式触发。
- 风险3：历史配置键遗漏导致“不完整迁移”。
  - 缓解：集中定义迁移 key 白名单并测试断言。

## Implementation Checklist
- [x] `src/options/options.html`: 增加迁移包导入/导出 UI 区块
- [x] `src/options/options.js`: 新增 migration package handlers 与事件绑定
- [x] `src/shared/js/utils/data.js`: 新增/复用 schema 校验与版本迁移入口
- [x] `src/shared/js/utils/config.js`: 明确可迁移配置键集合（如新增常量）
- [x] `test/test-storage.js` 或 `test/test-migration-package.js`: 增加自动化用例
- [x] `开发指南.md`: 更新本次功能与注意事项

## Sources & References
- **Origin brainstorm:** [`docs/brainstorms/2026-02-21-config-data-migration-brainstorm.md`](/Users/xiaohansong/projects/PaperMemory/docs/brainstorms/2026-02-21-config-data-migration-brainstorm.md)
  - Carried decisions:
  - 单文件迁移包
  - 包含敏感凭证
  - 覆盖导入
  - 版本差异先迁移后阻断
- Existing data overwrite flow: `src/options/options.js:641`
- Existing import entry: `src/options/options.js:675`
- Existing data migration: `src/shared/js/utils/data.js:11`
- Existing config key registry: `src/shared/js/utils/config.js:149`
- Existing backup behavior: `src/shared/js/utils/data.js:334`
