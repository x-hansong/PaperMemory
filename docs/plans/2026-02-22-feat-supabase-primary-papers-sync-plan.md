---
title: feat: Add Supabase Primary-Source Papers Sync
type: feat
status: completed
date: 2026-02-22
origin: docs/brainstorms/2026-02-22-supabase-primary-sync-brainstorm.md
---

# feat: Add Supabase Primary-Source Papers Sync

## Overview
新增 Supabase 同步能力，定位为「Supabase 主库，local 从属」。首期只同步 `papers`，并维持项目现有同步产品形态：凭证配置、连接测试、手动同步、定时自动同步、错误反馈（see brainstorm: `docs/brainstorms/2026-02-22-supabase-primary-sync-brainstorm.md`）。

该计划复用现有 Notion 同步与 background message/alarms 架构，新增 Supabase 专用同步链路，不改变现有 Gist/Notion 行为。

## Problem Statement / Motivation
当前跨设备同步主链路是 Gist 与 Notion。用户已确认新需求是以 Supabase 为单一真相源，并要求：
- 冲突时远端覆盖本地
- 默认每 60 分钟自动拉取
- 本地删除可被远端恢复
- 支持手动上传 + 可选自动写回
（see brainstorm: `docs/brainstorms/2026-02-22-supabase-primary-sync-brainstorm.md`）

目标是用最少规则实现跨设备一致，避免复杂合并和 tombstone 机制。

## Research Consolidation

### Local repo findings
- Options 页已实现完整 Notion 同步交互块，可直接复用布局与交互语义：`src/options/options.html:668`、`src/options/options.js:1612`。
- Background 已具备同步职责分层：单条推送、批量推送、全量拉取、alarms 调度、message router：`src/background/background.js:337`、`src/background/background.js:404`、`src/background/background.js:450`、`src/background/background.js:501`、`src/background/background.js:534`。
- Sync utility 已有“是否启用 + 初始化校验 + background 消息封装”模式：`src/shared/js/utils/sync.js:387`。
- 迁移包配置键集中在 `global.migrationConfigKeys`，新增同步配置需要补齐键白名单：`src/shared/js/utils/config.js:170`。
- 现有同步 E2E 测试主要覆盖 Gist 跨设备一致性，可复用测试组织方式：`test/test-sync.js:32`。
- 机构沉淀：`docs/solutions/` 与 `critical-patterns.md` 当前不存在，暂无可复用内部案例。

### External research decision
本功能属于外部 API 集成 + 浏览器客户端安全域，按高风险策略执行外部研究。

### External research findings (Supabase)
- 前端推荐使用 `createClient(url, anonKey)` 初始化客户端（Supabase JS v2）：[supabase-js README](https://github.com/supabase/supabase-js/blob/v2.58.0/README.md)。
- 查询与分页使用 `select` + filter/order + `range()`；可分批拉取全量数据：[supabase-js docs snippets](https://context7.com/supabase/supabase-js/llms.txt)。
- 写入建议使用 `upsert(..., { onConflict })`，并通过返回 `error` 判断失败（非异常流）：[supabase-js RELEASE](https://github.com/supabase/supabase-js/blob/v2.58.0/RELEASE.md)。
- 安全基线：浏览器端只使用 `anon key`；`service_role` 仅可服务端使用，不得进入扩展客户端：[secure-data](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/secure-data.mdx)、[service role usage](https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/performing-administration-tasks-on-the-server-side-with-the-servicerole-secret-BYM4Fa.mdx)。

## Proposed Solution

### Scope (MVP)
1. 新增 Supabase 同步配置（URL、anon key、syncKey、启用状态、自动拉取状态、间隔）。
2. 新增 Supabase 手动操作：
- Test Connection
- Push All Papers (Local -> Supabase)
- Pull from Supabase (Supabase -> Local, 覆盖)
3. 新增定时拉取（默认 60 分钟）。
4. 新增可选自动写回（本地新增/更新时写回 Supabase）。
5. 首期仅同步 `papers`；不含 `prefs/notion/ai` 等配置（see brainstorm: `docs/brainstorms/2026-02-22-supabase-primary-sync-brainstorm.md`）。

### Out of scope
- Supabase Auth 登录流
- 多表复杂关系建模
- 本地删除 tombstone
- 精细字段合并策略

### Data model (Supabase)
建议新建表 `pm_papers_sync`：
- `sync_key text not null`
- `paper_id text not null`
- `paper_payload jsonb not null`
- `updated_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- 唯一约束：`unique(sync_key, paper_id)`
- 索引：`(sync_key, updated_at desc)`

RLS 建议（客户端 anon key 场景）：
- 默认拒绝，按 `sync_key` 过滤授予 select/upsert/delete。
- 若不引入 Supabase Auth，策略上以“知道 sync_key 即可访问该命名空间”为前提，需在 UI 与文档中明确该安全边界。

## Technical Considerations
- 架构复用：沿用 Notion 模块切片，新增 `supabase.js` utility 与 background handler，避免把供应商逻辑塞进 `sync.js` 过深。
- 并发控制：参考 `notionSyncLocks`，对同 `paper_id` 写回做去重锁，避免双击/重复事件导致竞态。
- 覆盖安全：Pull 前确认提示必须明确“远端覆盖本地”（see brainstorm: `docs/brainstorms/2026-02-22-supabase-primary-sync-brainstorm.md`）。
- 错误面：网络失败、401/403、RLS 拒绝、表不存在、schema 不兼容、分页中断。
- 迁移兼容：Supabase 配置键加入 `migrationConfigKeys`，保持整机迁移可恢复（参考 `src/shared/js/utils/config.js:170`）。

## System-Wide Impact
- **Interaction graph**: options 触发 -> `sendMessageToBackground` -> background Supabase handler -> storage 覆盖写入 -> memory UI 刷新。
- **Error propagation**: Supabase 返回 `error` -> background 统一 `{ok:false,error}` -> options 展示反馈/alert。
- **State lifecycle risks**: 拉取中途失败可能导致部分更新；需定义“批次完成后一次性覆盖”或“失败即回滚”的策略。
- **API surface parity**: 与 Notion 同步入口保持一致（配置、手动 push/pull、auto schedule），降低用户认知成本（see brainstorm: `docs/brainstorms/2026-02-22-supabase-primary-sync-brainstorm.md`）。
- **Integration test scenarios**:
  - 定时触发拉取后本地被远端覆盖。
  - 本地删除后，下一次拉取被远端恢复。
  - 失效 key/URL 时，弹窗错误并阻止继续自动同步。
  - 自动写回开启时，本地新增 paper 能写入远端并被其他设备拉取。

## SpecFlow Analysis (Gap & Edge Cases)
- 缺失点 1：`syncKey` 为空或格式错误时的前置校验规则未定义。
- 缺失点 2：分页拉取过程的失败恢复点（从头重拉 vs 断点续拉）未定义。
- 缺失点 3：自动拉取失败“要求处理后再继续同步”需要明确“暂停哪个开关”（仅 auto pull 还是整体 Supabase sync）。
- 缺失点 4：自动写回开启时与手动全量 push 的并发优先级未定义。

计划默认决议（若实现前不再补充）：
- `syncKey` 必填且最小长度限制 8。
- 分页失败按“整次失败，不覆盖本地”处理。
- 连续失败时自动关闭 auto pull 开关，并弹窗提示用户重新测试连接。
- 手动全量 push 期间临时忽略自动写回事件。

## Acceptance Criteria
- [x] 新增 Supabase 配置区（URL/anon key/syncKey）并支持本地保存与连接测试。
- [x] 新增 Pull from Supabase（覆盖本地）并包含明确确认弹窗。
- [x] 新增 Push All Papers to Supabase（手动）。
- [x] 新增自动拉取（默认 60 分钟，可配置间隔）。
- [x] 新增可选自动写回（关闭为默认）。
- [x] 拉取失败触发明显弹窗提示，并阻止后续自动拉取直至用户处理（see brainstorm: `docs/brainstorms/2026-02-22-supabase-primary-sync-brainstorm.md`）。
- [x] 本地删除后，远端存在记录时可在下次拉取恢复。
- [x] 不引入 Supabase Auth；命名空间隔离使用 `syncKey`。
- [x] Supabase 同步配置被纳入迁移包导入导出键集合。
- [x] 测试覆盖：utility 单测 + background 单测 + 浏览器集成测试关键流。

## Success Metrics
- 首次配置成功率（Test Connection 通过率）>= 95%（内部测试样本）。
- 2 设备一致性场景下，拉取后 `papers` 键集合一致率 = 100%（测试环境）。
- 定时拉取在 24 小时窗口内成功执行率 >= 99%（非网络故障前提）。

## Dependencies & Risks
- Supabase 项目需提前建表、唯一约束、RLS 策略。
- 浏览器扩展中保存 anon key + syncKey 具备泄露风险；需文档提示与最小权限策略。
- `paper_payload` 结构随数据版本演进可能产生兼容风险；需复用 `prepareOverwriteData/migrateData` 路径。
- 批量 upsert 在大库下可能触发速率限制；需批次与重试策略。

## Implementation Task Breakdown

### 1. Data & config foundation
- [x] `src/shared/js/utils/config.js`：新增 Supabase 配置键（如 `supabaseUrl`、`supabaseAnonKey`、`supabaseSyncKey`、`supabaseSyncState`、`supabaseAutoPullEnabled`、`supabaseSyncInterval`、`supabaseAutoPushEnabled`）。
- [x] `src/shared/js/utils/config.js`：把上述键纳入 `global.migrationConfigKeys`。

### 2. Supabase utility layer
- [x] 新增 `src/shared/js/utils/supabase.js`：封装 client 初始化、连接探测、分页拉取、批量 upsert、错误标准化。
- [x] `src/shared/js/utils/sync.js`：新增 should/init/wrapper 方法，对齐现有 Notion pattern。

### 3. Background orchestration
- [x] `src/background/background.js`：新增 Supabase push/pull handler、并发锁、alarm setup、message route。
- [x] `src/background/background.js`：新增 `chrome.alarms.onAlarm` 分支（例如 `supabaseAutoPull`）。

### 4. Options UX
- [x] `src/options/options.html`：新增 Supabase Synchronization 区块（参考 Notion 结构）。
- [x] `src/options/options.js`：新增配置保存、测试连接、手动 push/pull、auto pull、interval、auto push 开关逻辑。
- [x] 明确覆盖提示文案与失败弹窗策略。

### 5. Tests
- [x] 新增 `test/test-supabase-sync.js`（Node 层 utility/validation）。
- [x] 新增 `test/pm-supabase-sync.spec.js`（浏览器关键流 smoke）。
- [x] 在现有测试工具中补充 Supabase 假数据与环境变量说明。

### 6. Docs
- [x] 更新 `docs/features.md` 与 `docs/configuration.md` Supabase 说明。
- [x] 更新 `开发指南.md` 实现记录与测试命令。

## Suggested Sequence
1. 配置键与 utility 封装。
2. background handler + alarm。
3. options UI/交互。
4. 测试补齐。
5. 文档更新与验收。

## Sources & References
- **Origin brainstorm:** [`docs/brainstorms/2026-02-22-supabase-primary-sync-brainstorm.md`](/Users/xiaohansong/projects/PaperMemory/docs/brainstorms/2026-02-22-supabase-primary-sync-brainstorm.md)
- Similar implementations:
  - `src/options/options.js:1612`
  - `src/options/options.html:668`
  - `src/background/background.js:337`
  - `src/background/background.js:534`
  - `src/shared/js/utils/sync.js:387`
  - `src/shared/js/utils/config.js:170`
  - `test/test-sync.js:32`
- Supabase docs:
  - [supabase-js createClient](https://github.com/supabase/supabase-js/blob/v2.58.0/README.md)
  - [Supabase secure data & anon key guidance](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/secure-data.mdx)
  - [Service role server-only guidance](https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/performing-administration-tasks-on-the-server-side-with-the-servicerole-secret-BYM4Fa.mdx)
  - [Supabase JS error-return pattern](https://github.com/supabase/supabase-js/blob/v2.58.0/RELEASE.md)

