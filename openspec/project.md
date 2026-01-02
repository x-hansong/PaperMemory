# Project Context

## Purpose
PaperMemory 是一个跨浏览器扩展（支持 Chrome、Firefox、Edge、Brave），用于自动记录用户阅读的研究论文，查找相关代码仓库，并匹配预印本与正式出版物。

**核心目标：**
- 自动检测和解析学术论文页面
- 构建个人论文阅读记录库
- 提供论文元数据管理（标签、评论、笔记）
- 支持通过 GitHub Gist 进行跨设备同步
- 连接预印本（如 arXiv）与正式发表版本

## Tech Stack
- **前端**: 原生 JavaScript + HTML + CSS（无框架，最小化依赖）
- **构建工具**: Gulp 4.x（文件合并、压缩、预处理）
- **包管理**: Yarn（不使用 npm）
- **浏览器 API**: Chrome Extension Manifest V3
- **外部库**: Octokit（GitHub API 集成）
- **测试**: Node.js 测试环境，支持浏览器和非浏览器测试
- **文档**: MkDocs + Material 主题

## Project Conventions

### Code Style
- **语言**: 原生 JavaScript（ES6+），不使用 TypeScript 或框架（React/Vue）
- **UI 文本**: 前端页面中显示的文本统一使用英文，禁止使用颜文字
- **依赖原则**: 最小化外部依赖，优先使用原生 API
- **jQuery 迁移**: 项目正在从 jQuery 迁移到原生 JS（使用 miniquery.js 作为过渡）
- **模块导出模式**: 使用特定模式以兼容 Node.js 测试环境：
  ```javascript
  if (typeof module !== "undefined" && module.exports != null) {
      var dummyModule = module;  // 使用 dummyModule 保持 IDE "跳转到定义" 功能
      dummyModule.exports = { funcName };
  }
  ```

### Architecture Patterns
**标准浏览器扩展三层架构：**

1. **Background Script** (`src/background/background.js`)
   - Service Worker，处理浏览器 API 调用
   - 负责下载、存储、跨域请求

2. **Content Scripts** (`src/content_scripts/content_script.js`)
   - 在 `document_start` 时注入到所有网页
   - 自动检测和解析论文页面
   - 修改页面标题和添加 UI 元素

3. **Popup** (`src/popup/`)
   - 主用户界面（浏览器工具栏图标点击后打开）
   - 显示当前论文信息和已保存的论文库
   - 处理标签、评论、管理等用户交互

**核心工具模块** (`src/shared/js/utils/`)：
- 按特定顺序连接成 `utils.min.js`
- 关键模块：config.js（全局配置）、parsers.js（论文解析）、data.js（数据操作）、sync.js（同步功能）

### Testing Strategy
**测试命令**（所有测试需要先运行 `gulp watch` 或 `gulp dev`）：
- `npm test` - 运行所有测试
- `npm run test-cov` - 运行测试并生成覆盖率报告
- `npm run test-storage` - 存储功能测试（需要浏览器环境）
- `npm run test-duplicates` - 重复检测测试（需要浏览器环境）
- `npm run test-sync` - 同步功能测试（需要浏览器环境）
- `npm run test-no-browser` - 不需要浏览器的测试
- `npm run test-no-browser-cov` - 非浏览器测试的覆盖率

**测试数据**：
- `test/data/urls.json` - 包含所有支持的论文源的测试 URL
- 添加新论文源时必须更新此文件

### Git Workflow
- **主分支**: `master`（用于 PR 和主要开发）
- **提交要求**: 每次代码修改后必须运行 `gulp build` 确保构建成功
- **发布流程**: 使用 `gulp archive` 创建发布归档文件

## Domain Context
**学术论文管理领域知识：**

- **论文源识别**: 通过 URL 模式自动识别学术网站（arXiv、PubMed、IEEE、ACM、Springer 等）
- **元数据提取**: 从不同论文源提取标题、作者、摘要、发表信息等
- **BibTeX 支持**: 解析和生成 BibTeX 格式的引用信息
- **预印本匹配**: 连接预印本（如 arXiv）与正式发表版本（如会议/期刊论文）
- **PDF ↔ 网页导航**: 在论文 PDF 和网页版本之间自动跳转
- **代码仓库关联**: 查找论文相关的 GitHub/GitLab 代码仓库

**添加新论文源的流程**：
1. 在 `config.js` 的 `global.knownPaperPages` 中添加 URL 模式
2. 在 `parsers.js` 的 `makePaper()` 中添加解析函数
3. 在 `state.js` 的 `parseIdFromUrl()` 中添加 ID 提取逻辑
4. 在 `paper.js` 中更新 `paperToAbs()` 和 `paperToPDF()`
5. 在 `test/data/urls.json` 中添加测试 URL

## Important Constraints
**开发流程约束：**
- ⚠️ **必须运行 `gulp watch` 或 `gulp dev`**: 开发时必须先启动，因为扩展加载的是 `src/popup/min/popup.min.html` 等压缩文件，不是源文件
- ⚠️ **每次修改后运行 `gulp build`**: 确保所有更改被正确构建和压缩
- **扩展刷新行为**:
  - Popup 修改：立即生效，无需刷新
  - Content Script 修改：需要在浏览器设置中重新加载扩展，然后刷新页面

**技术约束：**
- **无框架**: 不使用 React/Vue/Angular 等现代框架
- **最小依赖**: 避免引入大型第三方库
- **浏览器兼容性**: 必须支持 Chrome、Firefox、Edge、Brave
- **Manifest V3**: 遵循最新的浏览器扩展规范

**构建顺序约束：**
- 文件必须按特定顺序连接（见 gulpfile.mjs）
- 修改文件顺序可能导致运行时错误

## External Dependencies
**外部服务：**
- **GitHub Gist API**: 用于跨设备同步论文数据
  - 通过 Octokit 库集成
  - 需要用户提供 GitHub Personal Access Token
  - 同步逻辑在 `src/shared/js/utils/sync.js` 和 `gist.js`

**学术论文数据源**（支持的网站）：
- **预印本服务**: arXiv, bioRxiv, medRxiv
- **出版商**: IEEE Xplore, ACM Digital Library, Springer, Elsevier, Nature, Science
- **学术数据库**: PubMed, Google Scholar, Semantic Scholar, DBLP
- **机构仓库**: HAL, OpenReview
- **其他**: ResearchGate, Papers with Code

**第三方库：**
- **Octokit**: GitHub API 客户端（已打包在 `octokit.bundle.js`）
- **Cairo**: 文档构建依赖（MkDocs Material 主题的图像处理）

**浏览器 API 依赖：**
- Chrome Extension API (Manifest V3)
- Storage API（本地和同步存储）
- Downloads API（论文下载）
- Tabs API（页面交互）
