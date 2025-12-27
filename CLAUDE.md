# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PaperMemory is a browser extension (Chrome, Firefox, Edge, Brave) that automatically records research papers you read, finds code repositories, and matches preprints to publications. It's built with vanilla JavaScript and HTML with minimal dependencies (no frameworks like React/Vue).

## Build System

The project uses Gulp for building and development. All commands must be run from the repository root.

### Development Commands

```bash
# Install dependencies (use yarn, not npm)
yarn install

# Development mode with file watching (REQUIRED for development)
gulp watch

# Production build (minifies and concatenates files)
gulp build

# Build HTML only
gulp html

# Create release archive
gulp archive
```

**IMPORTANT**: You MUST run `gulp watch` or `gulp dev` before making changes. The extension loads `src/popup/min/popup.min.html`, not the source HTML files. Without gulp running, your changes won't be reflected.

### Testing Commands

All test commands require development mode (`gulp dev` or `gulp watch`) to be running first.

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test-cov

# Run specific test suites
npm run test-storage      # Storage tests (requires browser)
npm run test-duplicates   # Duplicate detection tests (requires browser)
npm run test-sync         # Sync functionality tests (requires browser)
npm run test-no-browser   # Tests that don't require browser
npm run test-no-browser-cov  # Coverage for non-browser tests

# Run with environment variables
env keep_browser=true max_sources=3 npm run test

# Generate screenshots
npm run screenshots
```

## Architecture

### Extension Components

PaperMemory follows the standard browser extension architecture with three main components:

1. **Background Script** (`src/background/background.js`)
   - Service worker that interacts with browser APIs unavailable to content scripts
   - Handles downloads, storage, and cross-origin requests

2. **Content Scripts** (`src/content_scripts/content_script.js`)
   - Injected into all web pages at `document_start`
   - Automatically detects and parses papers from supported venues
   - Updates page titles and adds UI elements to paper pages

3. **Popup** (`src/popup/`)
   - Main user interface opened via browser action
   - Displays current paper info and memory (library) of saved papers
   - Handles user interactions for tagging, commenting, and managing papers

### Core Utility Modules

Located in `src/shared/js/utils/`, these files are concatenated in order into `utils.min.js`:

- **config.js**: Global constants and state variables, including `global.knownPaperPages` which defines all supported paper sources
- **miniquery.js**: Vanilla JS replacement for jQuery (project is moving away from jQuery dependency)
- **functions.js**: General utility functions used throughout the codebase
- **bibtexParser.js**: Parses BibTeX strings into JavaScript objects
- **data.js**: Memory/data manipulation (migrations, paper validation, overwrite logic)
- **paper.js**: Single-paper operations (`isPaper()`, `paperToAbs()`, `paperToPDF()`)
- **state.js**: State management (`addOrUpdatePaper()`, custom title functions)
- **parsers.js**: Paper parsing functions for different sources (`makePaper()`)
- **sync.js**: GitHub Gist synchronization functionality
- **gist.js**: GitHub API integration via Octokit

### Build Process

Gulp concatenates and minifies files in specific orders:

**Popup JS** (in order):
1. `handlers.js` - Event handlers
2. `templates.js` - HTML string templates
3. `memory.js` - Memory-specific functions
4. `popup.js` - Main execution
→ Output: `src/popup/min/popup.min.js`

**Utils JS** (in order):
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
→ Output: `src/shared/min/utils.min.js`

**CSS**: Concatenates vars, options, popup, and loader CSS into minified versions.

### HTML Preprocessing

HTML files use `gulp-preprocess` with `@if DEV` / `@else` / `@endif` directives:
- DEV mode: Loads individual source files for debugging
- Production: Loads minified concatenated files

## Adding a New Paper Source

To add support for a new academic venue/website:

1. **config.js**: Add to `global.knownPaperPages`:
   ```javascript
   source: {
     patterns: [/* URL patterns or boolean functions */],
     name: "Display Name"
   }
   ```

2. **parsers.js**: Add parser function in `makePaper()` to extract paper metadata

3. **state.js**: Update `parseIdFromUrl()` to extract paper ID from URLs

4. **paper.js**: Update `paperToAbs()` and `paperToPDF()` for PDF↔webpage navigation

5. **functions.js**: Update `getDisplayId()` and `isPdfUrl()` if needed

6. **test/data/urls.json**: Add test URLs to verify integration

## Creating a New Paper Attribute

1. Add validation entry in `data.js:validatePaper()`
2. Add default value in `data.js:migrateData()` for existing papers

## Module Exports Pattern

Files use this pattern for Node.js test compatibility:

```javascript
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = { funcName };
}
```

- `dummyModule` (not `module`) preserves IDE "Go to definition" functionality
- Required for `require()` in test files

## Extension Refresh Behavior

- **Popup changes**: Take effect immediately, no refresh needed
- **Content script changes**: Require extension reload in browser settings, then page refresh

## Documentation

Documentation uses MkDocs with Material theme. Requires Cairo library.

```bash
# Install Cairo (macOS)
brew install cairo

# Install Python dependencies
pip install mkdocs-material[imaging]

# Serve documentation locally
mkdocs serve

# If Cairo crashes, set library path:
export DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib
mkdocs serve
```

## Key Files

- `manifest.json`: Extension configuration (permissions, content scripts, commands)
- `gulpfile.mjs`: Build configuration
- `src/shared/js/utils/config.js`: Central configuration and supported venues
- `src/shared/js/utils/parsers.js`: Paper parsing logic for all sources
- `src/content_scripts/content_script.js`: Auto-detection and page modification
- `test/data/urls.json`: Test URLs for all supported paper sources
