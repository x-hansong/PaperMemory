# Proposal: Fix Notion Duplicate Sync

## Problem Statement

When a new paper is automatically synced to Notion, duplicate entries are created in the Notion database. This occurs because the `checkNotionPageExists()` function returns `null` when an error occurs, causing the sync logic to treat the paper as non-existent and create a duplicate entry.

## Root Cause Analysis

The bug is located in `src/shared/js/utils/notion.js:88-111`:

```javascript
const checkNotionPageExists = async ({ databaseId, paperId, token }) => {
    try {
        const response = await notionRequest({
            endpoint: `/databases/${databaseId}/query`,
            method: "POST",
            body: {
                filter: {
                    property: "Paper ID",
                    title: {
                        equals: paperId
                    }
                }
            },
            token
        });

        return response.results.length > 0 ? response.results[0] : null;
    } catch (error) {
        logError("[checkNotionPageExists]", error);
        return null;  // ⚠️ BUG: Returns null on error, indistinguishable from "not found"
    }
};
```

**The Problem:**
- When the function succeeds and finds no match: returns `null`
- When the function fails due to an error: returns `null`
- The caller cannot distinguish between "paper doesn't exist" and "error occurred"

This causes `syncPaperToNotion()` (line 218-247) to incorrectly proceed with creating a new page when an error occurs, resulting in duplicates.

## Impact

- **User Experience:** Users see duplicate papers in their Notion database
- **Data Integrity:** Notion database becomes polluted with duplicate entries
- **Sync Reliability:** Users lose trust in the automatic sync feature
- **Frequency:** Occurs every time automatic sync encounters a transient error (network issues, rate limiting, etc.)

## Proposed Solution

Modify `checkNotionPageExists()` to return a structured result object that distinguishes between three states:
1. Paper exists (return the page)
2. Paper doesn't exist (return indication of non-existence)
3. Error occurred (return error information)

This allows callers to make informed decisions about whether to proceed with creation.

## Scope

- **Files Modified:** `src/shared/js/utils/notion.js`
- **Functions Affected:**
  - `checkNotionPageExists()` - Change return signature
  - `syncPaperToNotion()` - Update to handle new return format
  - `syncAllPapersToNotion()` - Already uses batch checking, no change needed
  - `syncIncrementalPapersToNotion()` - Already uses batch checking, no change needed
  - `syncPapersToNotionWithProgress()` - Already uses batch checking, no change needed

## Success Criteria

1. No duplicate papers created when automatic sync encounters errors
2. Existing sync functionality continues to work correctly
3. Error conditions are properly logged and reported
4. All existing tests pass
5. Build completes successfully with `gulp build`

## Alternatives Considered

1. **Retry logic:** Add retries to `checkNotionPageExists()` - Doesn't solve the fundamental ambiguity problem
2. **Throw errors:** Make the function throw on errors - Would require extensive error handling changes in callers
3. **Status object (chosen):** Return structured result - Clean, explicit, minimal changes required

## Dependencies

None - this is an isolated bug fix within the Notion sync module.

## Risks

- **Low Risk:** Changes are localized to error handling logic
- **Mitigation:** Thorough testing of error scenarios and normal operation
