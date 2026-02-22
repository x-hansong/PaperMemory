---
module: Supabase Synchronization
date: 2026-02-22
problem_type: integration_issue
component: tooling
symptoms:
  - "Options 页面测试 Supabase 时提示: Connection failed: Invalid Supabase URL"
  - "同一套 key 用 curl 可访问 /rest/v1 接口，但扩展内无法通过连接测试"
  - "手动 Pull 失败提示称 auto-pull 会被阻断，但实际并未触发该阻断逻辑"
root_cause: config_error
resolution_type: code_fix
severity: medium
tags: [supabase, browser-extension, url-validation, sync]
---

# Troubleshooting: Supabase URL 校验导致 HTTP 端点无法接入

## Problem
在接入 Supabase 同步时，用户使用自建/网关地址（`http://...:18000`）进行配置，扩展始终报 `Invalid Supabase URL`。同时，手动 Pull 失败提示文案与实际逻辑不一致，造成误导。

## Environment
- Module: Supabase Synchronization
- Rails Version: N/A (browser extension project)
- Affected Component: Supabase 同步工具层与 Options 交互提示
- Date: 2026-02-22

## Symptoms
- 在 Options 中点击 `Test Connection` 后返回：`Connection failed: Invalid Supabase URL`。
- 终端直接调用 REST API 时可读写：
  - `GET /rest/v1/pm_papers_sync` 返回 `200`
  - `POST /rest/v1/pm_papers_sync` 在权限修正后返回 `201`
- 手动 Pull 失败时弹窗提示“auto pull will remain blocked...”，但该阻断仅在定时任务失败路径中才会执行。

## What Didn't Work

**Attempted Solution 1:** 直接使用 `https://stormfire.heiyu.space:18000`
- **Why it failed:** 该端口实际提供的是 HTTP 服务，TLS 握手失败（`wrong version number` / `tlsv1 alert protocol version`）。

**Attempted Solution 2:** 保持原有前端 URL 校验不变，仅调整 Supabase 侧权限
- **Why it failed:** 即使服务端权限正确，扩展内校验仍只接受 `https://`，导致配置阶段被本地逻辑拦截，无法发起实际请求。

## Solution

放宽 URL 校验并修正文案：

1. 在 Supabase 工具层允许 `http://` 与 `https://`：

```javascript
// src/shared/js/utils/supabase.js
if (!normalizedUrl || !/^https?:\/\//.test(normalizedUrl)) {
  return { ok: false, reason: "Invalid Supabase URL" };
}
```

2. 修正手动 Pull 失败提示，避免暗示未发生的自动阻断：

```javascript
// src/options/options.js
alert("Supabase pull failed.\n\n" + result.error);
```

3. 补充测试覆盖 `http://` 场景：

```javascript
// test/test-supabase-sync.js
validateSupabaseConfig({
  url: "http://localhost:54321",
  anonKey: "anon",
  syncKey: "abcdefgh",
}).ok === true
```

## Why This Works
1. 根因是**本地配置校验策略与实际部署形态不匹配**：代码默认假设 Supabase endpoint 必为 HTTPS。
2. 允许 `http(s)` 后，扩展可覆盖标准云端与自建网关两种部署。
3. 失败提示与控制流对齐后，用户不会被“手动失败会阻断 auto-pull”这类不实信息误导。

## Prevention
- 在接入外部服务时，校验规则要与目标部署模型对齐（SaaS + self-hosted）。
- UI 提示必须与真实分支逻辑一致（尤其是“会自动禁用/会回滚”类强语义提示）。
- 为配置校验添加代表性测试矩阵：
  - `https://` 云端地址
  - `http://localhost` 自建地址
  - 非法 scheme（如 `ftp://`）

## Related Issues
No related issues documented yet.
