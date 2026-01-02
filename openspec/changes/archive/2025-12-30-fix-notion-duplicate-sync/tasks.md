# Tasks: Fix Notion Duplicate Sync

## Implementation Tasks

### 1. Update `checkNotionPageExists()` return signature - [x] COMPLETED
**File:** `src/shared/js/utils/notion.js:88-111`

- [x] Modify function to return structured result object
- [x] Return format: `{ exists: boolean, page: object|null, error: string|null }`
- [x] Handle three cases:
  - Paper found: `{ exists: true, page: notionPage, error: null }`
  - Paper not found: `{ exists: false, page: null, error: null }`
  - Error occurred: `{ exists: false, page: null, error: errorMessage }`
- [x] Preserve error logging with `logError()`

**Validation:**
- [x] Function returns correct structure for all three cases
- [x] Error messages are descriptive and actionable

---

### 2. Update `syncPaperToNotion()` to handle new return format - [x] COMPLETED
**File:** `src/shared/js/utils/notion.js:218-247`

- [x] Update call to `checkNotionPageExists()` to destructure result
- [x] Check `error` field first - if present, return error to caller
- [x] Check `exists` field to determine if paper already exists
- [x] Only proceed with `createNotionPage()` if `exists === false` and `error === null`
- [x] Update return values to include error information when check fails

**Validation:**
- [x] Function correctly skips creation when paper exists
- [x] Function returns error when existence check fails
- [x] Function creates paper only when confirmed non-existent

---

### 3. Run build and verify no syntax errors - [x] COMPLETED
**Command:** `gulp build`

- [x] Ensure all JavaScript files concatenate correctly
- [x] Verify minified output is generated
- [x] Check for any build warnings or errors

**Validation:**
- [x] Build completes successfully
- [x] No console errors in browser when loading extension

---

### 4. Test error scenarios - [ ] READY FOR USER TESTING
**Manual Testing:**

- [ ] Test with invalid Notion token (should report error, not create duplicate)
- [ ] Test with network disconnected (should report error, not create duplicate)
- [ ] Test with valid credentials (should work normally)
- [ ] Test with paper that already exists (should skip correctly)

**Validation:**
- [ ] No duplicates created in any error scenario
- [ ] Appropriate error messages logged
- [ ] Normal sync continues to work

---

## Task Dependencies

```
Task 1 (Update checkNotionPageExists)
  ↓
Task 2 (Update syncPaperToNotion)
  ↓
Task 3 (Build)
  ↓
Task 4 (Test)
```

All tasks must be completed sequentially.

## Estimated Scope

- **Lines Changed:** ~20 lines
- **Files Modified:** 1 file (`notion.js`)
- **Functions Modified:** 2 functions
- **Risk Level:** Low (isolated change)
