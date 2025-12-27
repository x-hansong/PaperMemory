# Notion 集成 - 剩余步骤

## 已完成的工作 ✅

1. ✅ 安装 Notion SDK 依赖 (`@notionhq/client`)
2. ✅ 创建 Notion SDK Bundle 脚本 (`src/background/notion-bundle.js`)
3. ✅ 创建 Notion API 模块 (`src/shared/js/utils/notion.js`)
4. ✅ 扩展同步模块 (`src/shared/js/utils/sync.js`)
5. ✅ 修改论文保存流程 (`src/shared/js/utils/paper.js`)
6. ✅ 更新配置文件 (`src/shared/js/utils/config.js`)
7. ✅ 更新构建配置 (`gulpfile.mjs`)
8. ✅ 添加后台脚本处理 (`src/background/background.js`)

## 剩余需要完成的步骤

### 步骤 1: 添加选项页面 UI (options.html)

需要在 `/src/options/options.html` 文件中,在 GitHub 同步部分之后(约第 517 行)添加以下 HTML 代码:

```html
<hr>

<div class="section">
    <h2 id="notion-synchronization">Notion Synchronization</h2>

    <h4 id="notion-how-it-works">How it works</h4>

    <ul>
        <li>Your papers are synced to a Notion database that you create and own</li>
        <li>Each paper becomes a page in your database with all metadata as properties</li>
        <li>Synchronization happens automatically when papers are added (if enabled)</li>
        <li>You can also manually sync all papers at once</li>
        <li>Papers already in Notion (by ID) are skipped to avoid duplicates</li>
    </ul>

    <h4 id="notion-setup">Setup Instructions</h4>

    <ol>
        <li>Create a Notion integration at <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer">notion.so/my-integrations</a></li>
        <li>Copy the "Internal Integration Token"</li>
        <li>Create a new database in Notion with the required properties (see documentation)</li>
        <li>Share the database with your integration (click "..." -> "Add connections")</li>
        <li>Copy the database ID from the URL (the 32-character string after the workspace name)</li>
    </ol>

    <h4 id="notion-credentials">Credentials</h4>

    <div>
        <label for="notion-token-input">Notion Integration Token:</label>
        <input name="notion-token-input" id="notion-token-input" type="password"
            placeholder="secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style="width: 400px;" />
        <br />

        <label for="notion-database-input">Notion Database ID:</label>
        <input name="notion-database-input" id="notion-database-input" type="text"
            placeholder="1234567890abcdef1234567890abcdef" style="width: 400px;" />
        <br />

        <input id="save-notion-credentials" type="button" value="Save Credentials">
        <input id="test-notion-connection" type="button" value="Test Connection">

        <br />
        <div><small>Note: your credentials are saved locally and do not leave your computer.</small></div>

        <div>
            <div class="pm-loader" id="notion-loader" style="display: none;"></div>
            <p id="notion-feedback"></p>
        </div>
    </div>

    <h4 id="notion-sync-controls">Sync Controls</h4>

    <div id="notion-sync-section" style="display: none;">
        <div>
            <label for="check-notion-sync">
                <input type="checkbox" id="check-notion-sync" name="check-notion-sync">
                Enable automatic Notion sync
            </label>
            <p><small>When enabled, papers will automatically sync to Notion when added to your memory</small></p>
        </div>

        <div>
            <h5>Manual Sync</h5>
            <p>Sync all papers in your memory to Notion (skips existing papers)</p>
            <input id="manual-notion-sync" type="button" value="Sync All Papers to Notion">

            <div class="pm-loader" id="notion-sync-loader" style="display: none;"></div>
            <div id="notion-sync-progress"></div>
            <p id="notion-sync-feedback"></p>
        </div>
    </div>
</div>
```

### 步骤 2: 添加选项页面 JavaScript (options.js)

需要在 `/src/options/options.js` 文件中添加以下代码:

#### 2.1 在页面加载时初始化 Notion 设置

在现有的初始化代码中添加:

```javascript
// 加载 Notion 凭据和状态
const notionToken = await getStorage("notionToken");
const notionDatabaseId = await getStorage("notionDatabaseId");
const notionSyncState = await getStorage("notionSyncState");

if (notionToken) {
    findEl({ element: "notion-token-input" }).value = notionToken;
}
if (notionDatabaseId) {
    findEl({ element: "notion-database-input" }).value = notionDatabaseId;
}
if (notionToken && notionDatabaseId) {
    showId("notion-sync-section");
}
if (notionSyncState) {
    findEl({ element: "check-notion-sync" }).checked = true;
}
```

#### 2.2 添加事件监听器

在事件监听器注册部分添加:

```javascript
// 保存 Notion 凭据
addListener(findEl({ element: "save-notion-credentials" }), "click", async () => {
    const token = findEl({ element: "notion-token-input" }).value.trim();
    const databaseId = findEl({ element: "notion-database-input" }).value.trim();

    if (!token || !databaseId) {
        setHTML("notion-feedback", "Please enter both token and database ID");
        return;
    }

    await setStorage("notionToken", token);
    await setStorage("notionDatabaseId", databaseId);

    setHTML("notion-feedback", "Credentials saved successfully!");
    showId("notion-sync-section");

    setTimeout(() => {
        setHTML("notion-feedback", "");
    }, 3000);
});

// 测试 Notion 连接
addListener(findEl({ element: "test-notion-connection" }), "click", async () => {
    showId("notion-loader");
    setHTML("notion-feedback", "Testing connection...");

    const token = await getStorage("notionToken");
    const databaseId = await getStorage("notionDatabaseId");

    if (!token || !databaseId) {
        hideId("notion-loader");
        setHTML("notion-feedback", "Please save credentials first");
        return;
    }

    const result = await sendMessageToBackground({
        type: "testNotionConnection",
        token: token,
        databaseId: databaseId
    });

    hideId("notion-loader");

    if (result.ok) {
        setHTML("notion-feedback", "Connection successful! Database is accessible.");
        showId("notion-sync-section");
    } else {
        setHTML("notion-feedback", `Connection failed: ${result.error}`);
    }
});

// 手动同步所有论文
addListener(findEl({ element: "manual-notion-sync" }), "click", async () => {
    const papers = await getStorage("papers");
    const paperCount = Object.keys(papers).filter(id => id !== "__dataVersion").length;

    if (!confirm(`This will sync ${paperCount} papers to Notion. Papers already in Notion will be skipped. Continue?`)) {
        return;
    }

    showId("notion-sync-loader");
    setHTML("notion-sync-feedback", "Syncing papers...");
    setHTML("notion-sync-progress", "");

    const result = await sendMessageToBackground({
        type: "syncAllNotionPapers",
        papers: papers
    });

    hideId("notion-sync-loader");

    if (result.ok) {
        const msg = `Sync complete! Synced: ${result.synced}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`;
        setHTML("notion-sync-feedback", msg);

        if (result.errors.length > 0) {
            const errorDetails = result.errors.slice(0, 5).map(e =>
                `${e.paperId}: ${e.error}`
            ).join("<br>");
            setHTML("notion-sync-progress", `<small>First errors:<br>${errorDetails}</small>`);
        }
    } else {
        setHTML("notion-sync-feedback", `Sync failed: ${result.error}`);
    }
});

// 启用/禁用自动同步
addListener(findEl({ element: "check-notion-sync" }), "change", async (e) => {
    await setStorage("notionSyncState", e.target.checked);

    if (e.target.checked) {
        const result = await sendMessageToBackground({ type: "initNotionSync" });
        if (!result.ok) {
            e.target.checked = false;
            await setStorage("notionSyncState", false);
            alert(`Failed to enable Notion sync: ${result.reason}`);
        }
    }
});
```

### 步骤 3: 运行构建并测试

```bash
# 运行开发构建
npx gulp dev

# 或运行生产构建
npx gulp build
```

### 步骤 4: 在 Notion 中创建数据库

用户需要在 Notion 中创建包含以下属性的数据库:

| 属性名称 | Notion 类型 | 说明 |
|---------|------------|------|
| **Paper ID** | Title | 主标识符 |
| Title | Rich Text | 论文标题 |
| Authors | Rich Text | 作者 |
| Year | Number | 发表年份 |
| Source | Select | 来源 |
| Venue | Rich Text | 会议/期刊 |
| Tags | Multi-select | 标签 |
| Notes | Rich Text | 笔记 |
| PDF Link | URL | PDF 链接 |
| Code Link | URL | 代码链接 |
| DOI | Rich Text | DOI |
| BibTeX | Rich Text | BibTeX |
| Favorite | Checkbox | 收藏 |
| Visit Count | Number | 访问次数 |
| Date Added | Date | 添加日期 |
| Last Opened | Date | 最后打开 |
| Abstract URL | URL | 摘要链接 |
| Key | Rich Text | 键 |

### 步骤 5: 测试功能

1. 在浏览器中加载扩展
2. 打开选项页面
3. 输入 Notion Integration Token 和 Database ID
4. 点击 "Test Connection" 验证连接
5. 启用自动同步
6. 访问一篇论文页面,验证是否自动同步到 Notion
7. 测试手动批量同步功能

## 注意事项

1. **API 速率限制**: Notion API 有速率限制,批量同步时每 3 个请求暂停 1 秒
2. **字符限制**: Rich Text 属性限制 2000 字符,长文本会被截断
3. **异步处理**: 所有 Notion API 调用都是异步的,不会阻塞 UI
4. **隐私**: Token 仅存储在本地,不会发送到任何服务器
5. **向后兼容**: 不影响现有的 GitHub Gist 同步功能

## 故障排除

如果遇到问题:

1. 检查浏览器控制台是否有错误信息
2. 确认 Notion Integration Token 有效
3. 确认数据库已与集成共享
4. 确认数据库 ID 正确
5. 检查网络连接

## 完整实施流程总结

1. ✅ 安装依赖: `npm install @notionhq/client --save`
2. ✅ 创建 Bundle: `npm run build-notion`
3. ✅ 创建 API 模块: `notion.js`
4. ✅ 扩展同步: `sync.js`
5. ✅ 集成保存流程: `paper.js`
6. ✅ 更新配置: `config.js`
7. ⏳ 添加 UI: `options.html`
8. ⏳ 添加事件处理: `options.js`
9. ✅ 后台处理: `background.js`
10. ✅ 更新构建: `gulpfile.mjs`
11. ⏳ 测试: `gulp watch` 并进行完整测试
