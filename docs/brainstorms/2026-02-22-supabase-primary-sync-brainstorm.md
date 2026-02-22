---
date: 2026-02-22
topic: supabase-primary-sync
---

# Supabase 主库自动同步 Brainstorm

## What We're Building
为 PaperMemory 增加 Supabase 同步能力，定位为“Supabase 是主库（single source of truth）”。首期仅同步 `papers` 数据，不扩展到其它配置项。用户在本地提供 Supabase 连接信息与 `syncKey` 命名空间后，可手动上传本地 `papers` 到 Supabase，并按固定间隔自动从 Supabase 拉取并覆盖本地。

同步冲突采用简单且可预测的策略：远端覆盖本地。本地删除不会作为 tombstone 回传，下一次拉取时若远端仍存在该 paper，则会被重新拉回本地。目标是以最小规则复杂度实现“跨设备一致”。

## Why This Approach
当前项目已存在 Notion/Gist 同步范式（凭证配置、手动同步、定时任务、错误提示），可复用交互心智。你希望“像 Notion 一样”并且明确选择 Supabase 主库，因此优先保证一致性和可解释性，而不是复杂合并逻辑。

相较“整包快照”，本次选择结构化表模式（每篇 paper 一行）是为了给后续扩展留空间（查询、增量、审计），但首期仍坚持 YAGNI：
- 数据范围只做 `papers`
- 冲突规则只做“远端覆盖”
- 写回采用“手动 + 可选自动”，不强制全自动

## Key Decisions
- 同步定位：Supabase 主库，本地以拉取结果为准。
- 冲突策略：远端全量覆盖本地。
- 自动拉取：固定间隔任务，默认 60 分钟。
- 数据范围：首期仅同步 `papers`。
- 数据模型：Supabase 结构化表（每篇 paper 一条记录）。
- 身份隔离：不接 Supabase Auth，使用用户提供的 `syncKey` 作为命名空间。
- 写回策略：手动上传 + 可选自动写回。
- 失败反馈：拉取失败时弹窗提醒，要求用户处理后再继续同步。
- 删除语义：本地删除不优先，远端存在则会在后续拉取中恢复。

## Resolved Questions
- 目标模式：Supabase 主库（远端真相源）。
- 冲突规则：远端覆盖本地。
- 自动触发：固定间隔自动拉取。
- 默认间隔：60 分钟。
- 同步范围：仅 `papers`。
- 方案选择：结构化表模式。
- 用户隔离：`syncKey` 命名空间。
- 本地写回：手动上传 + 可选自动写回。
- 失败处理：弹窗提醒并要求处理。
- 本地删除后行为：远端可拉回（保持主库一致）。

## Open Questions
- 无（进入规划条件已满足）。

## Next Steps
进入规划阶段，明确：
- Supabase 表结构与字段约束（包含 `sync_key`、`paper_id`、`paper_payload`、时间戳等）
- 拉取覆盖流程中的安全确认与失败恢复
- “手动上传 + 可选自动写回”的交互边界
- 测试矩阵（定时拉取、远端覆盖、本地删除回流、异常网络与凭证失效）
