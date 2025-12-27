/**
 * Notion API Integration Module
 *
 * 直接使用 Notion REST API，不依赖 SDK
 * API 文档: https://developers.notion.com/reference
 */

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";  // 使用稳定版本的 API

/**
 * 发送 Notion API 请求
 */
const notionRequest = async ({ endpoint, method = "GET", body = null, token }) => {
    const options = {
        method,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${NOTION_API_BASE}${endpoint}`, options);

    // Check if response is JSON before parsing
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[Notion] Non-JSON response:", text.substring(0, 200));
        const error = new Error("Notion API returned non-JSON response. Check CORS or network issues.");
        error.status = response.status;
        throw error;
    }

    const data = await response.json();

    if (!response.ok) {
        const error = new Error(data.message || "Notion API error");
        error.code = data.code;
        error.status = response.status;
        throw error;
    }

    return data;
};

/**
 * Get Notion Token from storage
 */
const getNotionToken = async (tokenError = true) => {
    const token = await getStorage("notionToken");
    if (!token && tokenError) {
        await setStorage("notionSyncState", false);
        throw new Error("Notion token not found. Sync disabled.");
    }
    return token;
};

/**
 * Test Notion connection
 */
const testNotionConnection = async ({ token, databaseId }) => {
    try {
        // 查询数据库（限制1条）来验证连接
        const response = await notionRequest({
            endpoint: `/databases/${databaseId}/query`,
            method: "POST",
            body: { page_size: 1 },
            token
        });

        return { ok: true };
    } catch (error) {
        console.error("[Notion] testNotionConnection error:", error);
        return {
            ok: false,
            error: formatNotionError(error)
        };
    }
};

/**
 * Check if a paper already exists in Notion database
 */
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
        return null;
    }
};

/**
 * Map paper object to Notion properties
 */
const paperToNotionProperties = (paper) => {
    const truncate = (text, maxLength = 2000) => {
        if (!text) return "";
        return text.length > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    };

    return {
        "Paper ID": {
            title: [{ text: { content: paper.id || "Unknown" } }]
        },
        "Title": {
            rich_text: [{ text: { content: truncate(paper.title || "") } }]
        },
        "Authors": {
            rich_text: [{ text: { content: truncate(paper.author || "") } }]
        },
        "Venue": {
            rich_text: [{ text: { content: truncate(paper.venue || "") } }]
        },
        "Notes": {
            rich_text: [{ text: { content: truncate(paper.note || "") } }]
        },
        "DOI": {
            rich_text: [{ text: { content: truncate(paper.doi || "") } }]
        },
        "BibTeX": {
            rich_text: [{ text: { content: truncate(paper.bibtex || "", 1900) } }]
        },
        "Key": {
            rich_text: [{ text: { content: truncate(paper.key || "") } }]
        },
        "Year": {
            number: paper.year ? parseInt(paper.year) : null
        },
        "Visit Count": {
            number: paper.count || 0
        },
        "PDF Link": {
            url: paper.pdfLink || null
        },
        "Code Link": {
            url: paper.codeLink || null
        },
        "Abstract URL": {
            url: (typeof paperToAbs === 'function' ? paperToAbs(paper) : null) || null
        },
        "Source": {
            select: paper.source ? { name: paper.source } : null
        },
        "Tags": {
            multi_select: (paper.tags || []).map(tag => ({ name: String(tag) }))
        },
        "Favorite": {
            checkbox: paper.favorite || false
        },
        "Date Added": {
            date: paper.addDate ? { start: paper.addDate } : null
        },
        "Last Opened": {
            date: paper.lastOpenDate ? { start: paper.lastOpenDate } : null
        }
    };
};

/**
 * Create a new page in Notion database
 */
const createNotionPage = async ({ databaseId, paper, token }) => {
    try {
        const properties = paperToNotionProperties(paper);

        const response = await notionRequest({
            endpoint: "/pages",
            method: "POST",
            body: {
                parent: { database_id: databaseId },
                properties: properties
            },
            token
        });

        return { ok: true, page: response };
    } catch (error) {
        return {
            ok: false,
            error: formatNotionError(error)
        };
    }
};

/**
 * Sync a single paper to Notion
 */
const syncPaperToNotion = async ({ paper, databaseId, token, skipExisting = true }) => {
    try {
        const existingPage = await checkNotionPageExists({
            databaseId,
            paperId: paper.id,
            token
        });

        if (existingPage && skipExisting) {
            return { success: true, skipped: true };
        }

        const result = await createNotionPage({
            databaseId,
            paper,
            token
        });

        if (result.ok) {
            return { success: true, skipped: false };
        } else {
            return { success: false, error: result.error };
        }
    } catch (error) {
        return {
            success: false,
            error: formatNotionError(error)
        };
    }
};

/**
 * Sync all papers to Notion (bulk operation)
 */
const syncAllPapersToNotion = async ({ papers, databaseId, token, onProgress }) => {
    const results = {
        synced: 0,
        skipped: 0,
        errors: []
    };

    const paperIds = Object.keys(papers).filter(id => id !== "__dataVersion");
    const total = paperIds.length;

    for (let i = 0; i < total; i++) {
        const paperId = paperIds[i];
        const paper = papers[paperId];

        if (onProgress) {
            onProgress(i + 1, total);
        }

        const result = await syncPaperToNotion({
            paper,
            databaseId,
            token,
            skipExisting: true
        });

        if (result.success) {
            if (result.skipped) {
                results.skipped++;
            } else {
                results.synced++;
            }
        } else {
            results.errors.push({
                paperId: paper.id,
                error: result.error
            });
        }

        // Rate limiting: pause every 3 requests
        if ((i + 1) % 3 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
};

/**
 * Format Notion API errors into user-friendly messages
 */
const formatNotionError = (error) => {
    if (error.code === 'unauthorized' || error.status === 401) {
        return "Invalid token. Please check your Notion integration token.";
    } else if (error.code === 'restricted_resource' || error.status === 403) {
        return "Permission denied. Make sure the database is shared with your integration.";
    } else if (error.code === 'object_not_found' || error.status === 404) {
        return "Database not found. Please check the database ID.";
    } else if (error.code === 'rate_limited' || error.status === 429) {
        return "Rate limited. Please wait a moment and try again.";
    } else if (error.code === 'validation_error' || error.status === 400) {
        return `Invalid request: ${error.message}. Check database schema.`;
    } else {
        return error.message || "Unknown error occurred.";
    }
};

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        getNotionToken,
        testNotionConnection,
        checkNotionPageExists,
        paperToNotionProperties,
        createNotionPage,
        syncPaperToNotion,
        syncAllPapersToNotion,
        formatNotionError
    };
}
