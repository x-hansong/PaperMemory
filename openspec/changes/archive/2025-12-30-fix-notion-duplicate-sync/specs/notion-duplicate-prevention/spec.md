# Spec: Notion Duplicate Prevention

## Overview

This spec defines the behavior for preventing duplicate paper entries in Notion when automatic sync encounters errors during existence checks.

## ADDED Requirements

### Requirement: Existence Check Error Handling

The `checkNotionPageExists()` function MUST return a structured result object that distinguishes between three states: paper exists, paper does not exist, and error occurred. The function SHALL NOT return ambiguous values that prevent callers from determining whether an error occurred.

**Rationale:** The current implementation returns `null` for both cases, causing the sync logic to incorrectly create duplicates when errors occur.

#### Scenario: Paper exists in Notion database

**Given:**
- A paper with ID "arxiv:2401.12345" exists in the Notion database
- Notion API is accessible and responding normally

**When:**
- `checkNotionPageExists()` is called with the paper ID

**Then:**
- Function returns `{ exists: true, page: <notionPage>, error: null }`
- The returned page object contains the existing Notion page data
- No error is logged

---

#### Scenario: Paper does not exist in Notion database

**Given:**
- A paper with ID "arxiv:2401.99999" does not exist in the Notion database
- Notion API is accessible and responding normally

**When:**
- `checkNotionPageExists()` is called with the paper ID

**Then:**
- Function returns `{ exists: false, page: null, error: null }`
- No error is logged
- Caller can safely proceed with creating the paper

---

#### Scenario: Notion API returns error during existence check

**Given:**
- Notion API is unavailable, rate-limited, or returns an error
- A paper needs to be synced

**When:**
- `checkNotionPageExists()` is called with the paper ID

**Then:**
- Function returns `{ exists: false, page: null, error: <errorMessage> }`
- Error is logged with `logError()` for debugging
- Error message is descriptive (e.g., "Rate limited", "Network error")
- Caller receives error information and can decide not to create duplicate

---

### Requirement: Sync Decision Logic

The `syncPaperToNotion()` function MUST use existence check results to make informed decisions about creating papers. The function SHALL NOT proceed with paper creation when the existence check returns an error. The function MUST propagate error information to callers for proper handling.

**Rationale:** Prevents duplicate creation when existence checks fail due to errors.

#### Scenario: Sync proceeds when paper confirmed non-existent

**Given:**
- `checkNotionPageExists()` returns `{ exists: false, page: null, error: null }`
- Paper data is valid

**When:**
- `syncPaperToNotion()` processes the result

**Then:**
- Function proceeds to call `createNotionPage()`
- Paper is created in Notion database
- Function returns `{ success: true, skipped: false }`

---

#### Scenario: Sync skips when paper already exists

**Given:**
- `checkNotionPageExists()` returns `{ exists: true, page: <notionPage>, error: null }`
- `skipExisting` parameter is `true`

**When:**
- `syncPaperToNotion()` processes the result

**Then:**
- Function does NOT call `createNotionPage()`
- Function returns `{ success: true, skipped: true }`
- No duplicate is created

---

#### Scenario: Sync fails when existence check encounters error

**Given:**
- `checkNotionPageExists()` returns `{ exists: false, page: null, error: "Rate limited" }`

**When:**
- `syncPaperToNotion()` processes the result

**Then:**
- Function does NOT call `createNotionPage()`
- Function returns `{ success: false, error: "Failed to check existence: Rate limited" }`
- No duplicate is created
- Error is propagated to caller for proper handling

---

## Implementation Notes

### Return Value Structure

```javascript
// Success - paper exists
{ exists: true, page: notionPageObject, error: null }

// Success - paper does not exist
{ exists: false, page: null, error: null }

// Error occurred
{ exists: false, page: null, error: "descriptive error message" }
```

### Backward Compatibility

This change modifies the return signature of `checkNotionPageExists()`. The function is only called by `syncPaperToNotion()`, so the impact is isolated and does not affect other sync functions that use batch checking.

### Error Messages

Error messages should be user-friendly and actionable:
- "Rate limited. Please wait a moment and try again."
- "Network error. Check your connection."
- "Invalid token. Please check your Notion integration token."
- "Database not found. Please check the database ID."
