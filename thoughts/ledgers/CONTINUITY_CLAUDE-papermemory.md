# Continuity Ledger: PaperMemory

**Session**: papermemory
**Created**: 2025-12-29
**Last Updated**: 2025-12-29

---

## Goal

Maintain and enhance PaperMemory, a browser extension for automatically recording research papers, finding code repositories, and syncing to external services (GitHub Gist, Notion). Success means:

1. Complete remaining Notion integration UI work
2. Maintain code quality and test coverage
3. Add new paper sources and features as needed
4. Keep documentation up-to-date
5. Ensure all builds pass and extension works across Chrome, Firefox, Edge, Brave

---

## Constraints

### Technical Requirements
- **Build System**: Gulp-based build pipeline (MUST run `gulp watch` or `gulp build` before testing)
- **No Frameworks**: Vanilla JavaScript and HTML only (no React/Vue)
- **Package Manager**: Use `yarn` for dependencies, not `npm`
- **Browser Compatibility**: Chrome, Firefox, Edge, Brave (Manifest V3)
- **Language**: All user-facing text must be in English (no emojis in UI)
- **Module Pattern**: Files use `dummyModule.exports` pattern for Node.js test compatibility

### Development Workflow
1. Always run `gulp watch` during development (extension loads minified files)
2. Run `gulp build` after code changes before committing
3. Test with `npm test` (requires `gulp dev` or `gulp watch` running first)
4. Extension refresh: Popup changes take effect immediately; content script changes require extension reload + page refresh

### Code Organization
- **Background Script**: `/src/background/background.js` - Service worker for browser APIs
- **Content Scripts**: `/src/content_scripts/content_script.js` - Injected at document_start
- **Popup**: `/src/popup/` - Main UI (HTML, JS, CSS)
- **Shared Utils**: `/src/shared/js/utils/` - Core modules concatenated into `utils.min.js`
- **Build Output**: `/src/popup/min/` and `/src/shared/min/` - Minified files

### Utility Module Load Order (Critical)
Files in `/src/shared/js/utils/` are concatenated in this exact order:
1. `octokit.bundle.js`
2. `miniquery.js`
3. `config.js`
4. `bibtexParser.js`
5. `functions.js`
6. `sync.js`
7. `data.js`
8. `paper.js`
9. `state.js`
10. `parsers.js`

---

## Key Decisions

### Architecture Decisions
- **No External Dependencies in Content Scripts**: Use vanilla JS and custom `miniquery.js` instead of jQuery
- **Gulp Preprocessing**: HTML files use `@if DEV` directives to load source files in dev mode, minified in production
- **Module Exports Pattern**: Use `dummyModule.exports` to preserve IDE "Go to definition" while supporting Node.js tests
- **API Integration**: Direct Fetch API calls for Notion/GitHub (no SDK in content scripts)

### Recent Feature Additions
1. **Notion Integration (v1.1.0)**: Sync papers to Notion database with bidirectional sync support
2. **AI Auto-Tagging (v1.2.0)**: OpenAI-compatible API for automatic paper tagging based on title/abstract
3. **Abstract Field Support**: Added paper abstract field to data model

### Testing Strategy
- **Browser Tests**: `test-storage.js`, `test-duplicates.js`, `test-sync.js` (require Puppeteer)
- **Non-Browser Tests**: `test-utils.js` (can run without browser)
- **Coverage**: Use `npm run test-cov` for coverage reports
- **Environment Variables**: `keep_browser=true`, `max_sources=3` for test control

---

## State

### Done
- [x] Initial codebase analysis and architecture understanding
- [x] Notion API integration backend (`notion.js`, `sync.js`, `background.js`)
- [x] AI auto-tagging feature with OpenAI-compatible API support
- [x] Abstract field support in paper data model
- [x] Bidirectional Notion sync functionality
- [x] Performance optimizations for large datasets

### Now
[→] Creating continuity ledger and onboarding documentation

### Next
- [ ] Complete Notion integration UI (options.html and options.js)
- [ ] Test Notion sync end-to-end with real database
- [ ] Review and update user documentation for new features

### Remaining Work (from NOTION_INTEGRATION_REMAINING_STEPS.md)
- [ ] Add Notion UI section to `/src/options/options.html` (after line 517)
- [ ] Add Notion event handlers to `/src/options/options.js`
- [ ] Test connection, credentials saving, and manual sync
- [ ] Create user guide for Notion database setup
- [ ] Verify automatic sync on paper save

---

## Open Questions

- UNCONFIRMED: Should AI tagging be enabled by default for new users?
- UNCONFIRMED: What is the optimal rate limit for Notion API calls? (currently 3 requests per second)
- UNCONFIRMED: Should we add support for other sync services (e.g., Airtable, Google Sheets)?
- UNCONFIRMED: Is there a plan to migrate away from jQuery completely? (miniquery.js is partial replacement)

---

## Working Set

### Key Files
```
/Users/xiaohansong/PycharmProjects/PaperMemory/
├── manifest.json                          # Extension configuration (v1.1.0)
├── package.json                           # Dependencies and scripts
├── gulpfile.mjs                          # Build configuration
├── CLAUDE.md                             # Project instructions for Claude
├── src/
│   ├── background/background.js          # Service worker
│   ├── content_scripts/content_script.js # Auto-detection and parsing
│   ├── popup/
│   │   ├── html/popup.html              # Main UI
│   │   ├── js/
│   │   │   ├── handlers.js              # Event handlers
│   │   │   ├── templates.js             # HTML templates
│   │   │   ├── memory.js                # Memory functions
│   │   │   └── popup.js                 # Main execution
│   │   └── min/popup.min.html           # Built popup (loaded by extension)
│   ├── options/
│   │   ├── options.html                 # Settings page
│   │   └── options.js                   # Settings logic
│   └── shared/js/utils/
│       ├── config.js                    # Global constants and supported venues
│       ├── parsers.js                   # Paper parsing for all sources
│       ├── paper.js                     # Single-paper operations
│       ├── state.js                     # State management
│       ├── data.js                      # Data validation and migration
│       ├── sync.js                      # GitHub Gist sync
│       ├── notion.js                    # Notion API integration
│       ├── aiTagging.js                 # AI auto-tagging
│       ├── gist.js                      # GitHub API via Octokit
│       └── functions.js                 # General utilities
├── test/
│   ├── test-storage.js                  # Storage tests (browser)
│   ├── test-duplicates.js               # Duplicate detection (browser)
│   ├── test-sync.js                     # Sync tests (browser)
│   └── test-utils.js                    # Utility tests (no browser)
└── dev_doc/
    ├── 2025-12-27-notion-integration.md
    ├── 2025-12-28-ai-tagging-feature.md
    └── 2025-12-28-notion-bidirectional-sync.md
```

### Branch
- **Current**: `master`
- **Main Branch**: `master`
- **Status**: Clean working directory

### Recent Commits
```
22690b5 - feat: optimize Notion sync performance for large datasets
2e6ce71 - feat: 添加 AI 自动打标功能 (v1.2.0)
c5a185f - feat: 添加论文 Abstract 字段支持
55c32b0 - feat: 增强 Notion 双向同步功能
023b3e6 - feat: 添加 Notion 数据库同步功能 (v1.1.0)
```

### Essential Commands
```bash
# Development
yarn install                    # Install dependencies
gulp watch                      # Watch mode (REQUIRED for development)
gulp build                      # Production build
gulp html                       # Build HTML only

# Testing
npm test                        # Run all tests (requires gulp watch)
npm run test-cov               # Run with coverage
npm run test-no-browser        # Tests without browser
npm run test-storage           # Storage tests only
npm run test-duplicates        # Duplicate detection tests
npm run test-sync              # Sync tests

# Documentation
mkdocs serve                   # Serve docs locally (requires Cairo)
export DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib  # Fix Cairo on macOS

# Release
gulp archive                   # Create release archive
```

---

## Tech Stack

### Core Technologies
- **Language**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Build Tool**: Gulp 4.0
- **Test Framework**: Mocha + Puppeteer (for browser tests)
- **Package Manager**: Yarn
- **Browser APIs**: Chrome Extension Manifest V3

### Key Dependencies
- **@octokit/request**: GitHub API integration
- **gulp-preprocess**: HTML preprocessing with conditionals
- **gulp-uglify**: JavaScript minification
- **gulp-clean-css**: CSS minification
- **gulp-concat**: File concatenation
- **jsdom**: DOM manipulation in tests
- **puppeteer**: Browser automation for tests
- **mocha**: Test runner
- **nyc**: Code coverage

### External APIs
- **PapersWithCode API**: Automatic code repository discovery
- **GitHub Gist API**: Paper library synchronization
- **Notion API**: Database synchronization (v2022-06-28)
- **OpenAI-compatible APIs**: AI auto-tagging (configurable endpoint)

### Supported Paper Sources
The extension automatically detects and parses papers from:
- arXiv
- OpenReview
- NeurIPS
- ICLR
- ICML
- CVPR
- ACL
- EMNLP
- And many more (see `config.js:global.knownPaperPages`)

---

## Project Context

### What is PaperMemory?
PaperMemory is a browser extension that helps researchers manage their reading by:
1. Automatically recording papers they visit (arXiv, OpenReview, conferences)
2. Finding associated code repositories via PapersWithCode
3. Matching preprints to published versions
4. Syncing to GitHub Gist and Notion for cross-device access
5. Providing tagging, notes, and favorites functionality
6. AI-powered automatic tagging based on paper content

### Current Version
- **Version**: 1.1.0 (in manifest.json)
- **Latest Features**: Notion sync, AI tagging, abstract support
- **Stores**: Chrome Web Store, Firefox Add-ons
- **Website**: https://papermemory.org

### Development Philosophy
- Minimalist and fast (no heavy frameworks)
- Privacy-focused (all data stored locally)
- Extensible (easy to add new paper sources)
- Well-tested (comprehensive test suite)
- User-friendly (automatic detection, minimal clicks)

---

## Notes

### Adding a New Paper Source
To add support for a new academic venue:
1. Add to `config.js:global.knownPaperPages` with URL patterns
2. Add parser function in `parsers.js:makePaper()`
3. Update `state.js:parseIdFromUrl()` for ID extraction
4. Update `paper.js:paperToAbs()` and `paperToPDF()` for navigation
5. Add test URLs to `test/data/urls.json`

### Common Pitfalls
- **Forgetting to run gulp**: Extension loads minified files, source changes won't appear
- **Module load order**: Utils must be concatenated in correct order (see Constraints)
- **Content script refresh**: Requires extension reload + page refresh, not just popup refresh
- **Test requirements**: Browser tests need `gulp watch` running first
- **Character limits**: Notion Rich Text properties limited to 2000 characters

### Performance Considerations
- Notion API rate limiting: 3 requests/second with 1-second pauses
- Large dataset optimization: Batch operations with progress feedback
- Content script injection: Runs at `document_start` for early detection
- Storage: Uses `chrome.storage.local` with unlimited storage permission

---

## Documentation

### User Documentation
- **Website**: https://papermemory.org (MkDocs + Material theme)
- **Location**: `/docs/` directory
- **Build**: `mkdocs serve` (requires Cairo library)

### Developer Documentation
- **Project Guide**: `/CLAUDE.md` (comprehensive development guide)
- **Contributing**: `/contributing.md`
- **Feature Docs**: `/dev_doc/` (implementation details for major features)
- **Chinese Guide**: `/开发指南.md`

### API Documentation
- Notion API: Uses v2022-06-28 stable version
- GitHub API: Via @octokit/request
- PapersWithCode: Public API for code discovery

---

## Future Considerations

### Potential Features
- Additional sync services (Airtable, Google Sheets, Zotero)
- Enhanced AI features (summarization, related papers)
- Collaborative features (shared libraries)
- Mobile app companion
- Browser reading mode integration

### Technical Debt
- Complete jQuery removal (migrate remaining code to miniquery.js)
- Improve test coverage for new features
- Add E2E tests for full user workflows
- Optimize bundle size (currently ~11k lines in utils)

### Community
- GitHub: https://github.com/vict0rsch/PaperMemory
- Issues: Track bugs and feature requests
- Contributions: Welcome via PRs (see contributing.md)

## Agent Reports

### onboard (2025-12-29T03:29:24.343Z)
- Task: 
- Summary: 
- Output: `.claude/cache/agents/onboard/latest-output.md`

### onboard (2025-12-29T03:17:29.941Z)
- Task: 
- Summary: 
- Output: `.claude/cache/agents/onboard/latest-output.md`

### onboard (2025-12-29T03:17:04.350Z)
- Task: 
- Summary: 
- Output: `.claude/cache/agents/onboard/latest-output.md`

