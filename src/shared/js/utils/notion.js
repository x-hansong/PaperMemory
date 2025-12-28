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

    // Capitalize first letter of source for Notion Select
    const capitalizeSource = (source) => {
        if (!source) return null;
        return source.charAt(0).toUpperCase() + source.slice(1);
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
        "Abstract": {
            rich_text: [{ text: { content: truncate(paper.abstract || "", 2000) } }]
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
            select: paper.source ? { name: capitalizeSource(paper.source) } : null
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
 * Sync all papers to Notion (bulk operation) - OPTIMIZED
 * 优化: 批量检查存在性,减少 API 调用次数
 */
const syncAllPapersToNotion = async ({ papers, databaseId, token, onProgress }) => {
    const results = {
        synced: 0,
        skipped: 0,
        errors: []
    };

    const paperIds = Object.keys(papers).filter(id => id !== "__dataVersion");
    const total = paperIds.length;

    // 优化: 先批量获取所有已存在的 papers (减少 ~1000 次 API 调用)
    if (onProgress) {
        onProgress(0, total, "正在检查已存在的论文...");
    }

    const queryResult = await queryAllNotionPapers({ databaseId, token });
    const existingPapersMap = new Map();

    if (queryResult.ok) {
        // 构建 paperId -> notionPageId 的映射
        for (const notionPage of queryResult.papers) {
            const paperId = notionPage.properties["Paper ID"]?.title?.[0]?.plain_text;
            if (paperId) {
                existingPapersMap.set(paperId, notionPage.id);
            }
        }
    }

    // 开始同步
    for (let i = 0; i < total; i++) {
        const paperId = paperIds[i];
        const paper = papers[paperId];

        if (onProgress) {
            onProgress(i + 1, total, `正在同步: ${paper.title?.substring(0, 50) || paperId}...`);
        }

        // 使用本地 Map 检查,而不是调用 API
        if (existingPapersMap.has(paper.id)) {
            results.skipped++;
            continue;
        }

        // 创建新 paper
        const createResult = await createNotionPage({
            databaseId,
            paper,
            token
        });

        if (createResult.ok) {
            results.synced++;
        } else {
            results.errors.push({
                paperId: paper.id,
                error: createResult.error
            });
        }

        // Rate limiting: pause every 3 requests
        if ((i + 1) % 3 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // 更新最后同步时间
    await setStorage("lastNotionSyncTime", new Date().toISOString());

    return results;
};

/**
 * Batch sync with progress saving (supports resume)
 * 分批同步,支持断点续传
 */
const syncPapersToNotionWithProgress = async ({ papers, databaseId, token, onProgress, batchSize = 100 }) => {
    const results = {
        synced: 0,
        skipped: 0,
        errors: [],
        completed: false
    };

    const paperIds = Object.keys(papers).filter(id => id !== "__dataVersion");
    const total = paperIds.length;

    // 获取上次同步进度
    const syncProgress = await getStorage("notionSyncProgress") || { lastIndex: 0, syncedIds: [] };
    const startIndex = syncProgress.lastIndex || 0;

    if (startIndex >= total) {
        // 已经全部同步完成
        results.completed = true;
        await setStorage("notionSyncProgress", null);
        return results;
    }

    if (onProgress) {
        onProgress(startIndex, total, `从第 ${startIndex + 1} 篇继续同步...`);
    }

    // 批量获取已存在的papers
    const queryResult = await queryAllNotionPapers({ databaseId, token });
    const existingPapersMap = new Map();

    if (queryResult.ok) {
        for (const notionPage of queryResult.papers) {
            const paperId = notionPage.properties["Paper ID"]?.title?.[0]?.plain_text;
            if (paperId) {
                existingPapersMap.set(paperId, notionPage.id);
            }
        }
    }

    // 分批同步
    for (let i = startIndex; i < total; i += batchSize) {
        const batchEnd = Math.min(i + batchSize, total);
        const batchIds = paperIds.slice(i, batchEnd);

        for (let j = 0; j < batchIds.length; j++) {
            const paperId = batchIds[j];
            const paper = papers[paperId];
            const currentIndex = i + j;

            if (onProgress) {
                onProgress(currentIndex + 1, total, `正在同步: ${paper.title?.substring(0, 50) || paperId}...`);
            }

            if (existingPapersMap.has(paper.id)) {
                results.skipped++;
            } else {
                const createResult = await createNotionPage({ databaseId, paper, token });
                if (createResult.ok) {
                    results.synced++;
                } else {
                    results.errors.push({ paperId: paper.id, error: createResult.error });
                }
            }

            // Rate limiting
            if ((currentIndex + 1) % 3 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // 保存进度
        await setStorage("notionSyncProgress", {
            lastIndex: batchEnd,
            syncedIds: [...(syncProgress.syncedIds || []), ...batchIds]
        });

        if (onProgress) {
            onProgress(batchEnd, total, `已完成 ${batchEnd}/${total} 篇...`);
        }
    }

    // 同步完成,清除进度
    results.completed = true;
    await setStorage("notionSyncProgress", null);
    await setStorage("lastNotionSyncTime", new Date().toISOString());

    return results;
};

/**
 * Incremental sync: only sync papers added/modified after last sync
 * 增量同步: 只同步上次同步后新增或修改的论文
 */
const syncIncrementalPapersToNotion = async ({ papers, databaseId, token, onProgress }) => {
    const results = {
        synced: 0,
        skipped: 0,
        errors: []
    };

    // 获取上次同步时间
    const lastSyncTime = await getStorage("lastNotionSyncTime");

    if (!lastSyncTime) {
        // 如果没有上次同步时间,执行全量同步
        return await syncAllPapersToNotion({ papers, databaseId, token, onProgress });
    }

    // 筛选出需要同步的papers (addDate > lastSyncTime)
    const lastSyncDate = new Date(lastSyncTime);
    const papersToSync = Object.keys(papers)
        .filter(id => id !== "__dataVersion")
        .filter(id => {
            const paper = papers[id];
            if (!paper.addDate) return false;
            const addDate = new Date(paper.addDate);
            return addDate > lastSyncDate;
        });

    const total = papersToSync.length;

    if (total === 0) {
        if (onProgress) {
            onProgress(0, 0, "没有需要同步的新论文");
        }
        return results;
    }

    if (onProgress) {
        onProgress(0, total, `发现 ${total} 篇新论文需要同步...`);
    }

    // 批量检查已存在的papers
    const queryResult = await queryAllNotionPapers({ databaseId, token });
    const existingPapersMap = new Map();

    if (queryResult.ok) {
        for (const notionPage of queryResult.papers) {
            const paperId = notionPage.properties["Paper ID"]?.title?.[0]?.plain_text;
            if (paperId) {
                existingPapersMap.set(paperId, notionPage.id);
            }
        }
    }

    // 同步新papers
    for (let i = 0; i < total; i++) {
        const paperId = papersToSync[i];
        const paper = papers[paperId];

        if (onProgress) {
            onProgress(i + 1, total, `正在同步: ${paper.title?.substring(0, 50) || paperId}...`);
        }

        if (existingPapersMap.has(paper.id)) {
            results.skipped++;
            continue;
        }

        const createResult = await createNotionPage({
            databaseId,
            paper,
            token
        });

        if (createResult.ok) {
            results.synced++;
        } else {
            results.errors.push({
                paperId: paper.id,
                error: createResult.error
            });
        }

        // Rate limiting
        if ((i + 1) % 3 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // 更新最后同步时间
    await setStorage("lastNotionSyncTime", new Date().toISOString());

    return results;
};

/**
 * Query all papers from Notion database with pagination
 * @param {string} databaseId - Notion database ID
 * @param {string} token - Notion API token
 * @returns {Promise<object>} { ok: true, papers: [...] } or { ok: false, error: "..." }
 */
const queryAllNotionPapers = async ({ databaseId, token }) => {
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;

    try {
        while (hasMore) {
            const response = await notionRequest({
                endpoint: `/databases/${databaseId}/query`,
                method: "POST",
                body: {
                    start_cursor: startCursor,
                    page_size: 100  // Notion API 最大值
                },
                token
            });

            allResults = allResults.concat(response.results);
            hasMore = response.has_more;
            startCursor = response.next_cursor;

            // 速率限制：每次请求后暂停 334ms (3 requests/second)
            if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 334));
            }
        }

        return { ok: true, papers: allResults };
    } catch (error) {
        console.error("[queryAllNotionPapers]", error);
        return {
            ok: false,
            error: formatNotionError(error)
        };
    }
};

/**
 * Convert Notion page properties to local paper object
 * @param {object} notionPage - Notion page object
 * @returns {object} Local paper object
 */
const notionPropertiesToPaper = (notionPage) => {
    const props = notionPage.properties;

    // 辅助函数：提取不同类型的属性值
    const getText = (prop) => {
        if (!prop || !prop.rich_text || prop.rich_text.length === 0) return "";
        return prop.rich_text[0].plain_text || "";
    };

    const getTitle = (prop) => {
        if (!prop || !prop.title || prop.title.length === 0) return "";
        return prop.title[0].plain_text || "";
    };

    const getNumber = (prop) => {
        return prop?.number || 0;
    };

    const getUrl = (prop) => {
        return prop?.url || "";
    };

    const getSelect = (prop) => {
        return prop?.select?.name || "";
    };

    const getMultiSelect = (prop) => {
        if (!prop || !prop.multi_select) return [];
        return prop.multi_select.map(item => item.name);
    };

    const getCheckbox = (prop) => {
        return prop?.checkbox || false;
    };

    const getDate = (prop) => {
        return prop?.date?.start || "";
    };

    // 构建 paper 对象
    const sourceValue = getSelect(props["Source"]);
    const paper = {
        id: getTitle(props["Paper ID"]),
        title: getText(props["Title"]),
        author: getText(props["Authors"]),
        abstract: getText(props["Abstract"]),
        venue: getText(props["Venue"]),
        year: props["Year"]?.number ? String(props["Year"].number) : "",
        source: sourceValue ? sourceValue.toLowerCase() : "arxiv",
        tags: getMultiSelect(props["Tags"]),
        note: getText(props["Notes"]),
        doi: getText(props["DOI"]),
        bibtex: getText(props["BibTeX"]),
        key: getText(props["Key"]),
        count: getNumber(props["Visit Count"]),
        pdfLink: getUrl(props["PDF Link"]),
        codeLink: getUrl(props["Code Link"]),
        favorite: getCheckbox(props["Favorite"]),
        addDate: getDate(props["Date Added"]),
        lastOpenDate: getDate(props["Last Opened"]),
        // 默认值
        favoriteDate: "",
        code: {},
        extras: {},
        md: ""  // 将在验证时自动生成
    };

    return paper;
};

/**
 * Sync a single paper from Notion to local storage
 * @param {object} notionPage - Notion page object
 * @param {object} localPapers - Current local papers object
 * @param {string} conflictStrategy - "notion" (Notion优先) or "local" (本地优先)
 * @returns {object} Result with updated paper
 */
const syncPaperFromNotion = ({ notionPage, localPapers, conflictStrategy = "notion" }) => {
    try {
        const notionPaper = notionPropertiesToPaper(notionPage);

        if (!notionPaper.id) {
            return {
                success: false,
                error: "Paper ID is missing in Notion page"
            };
        }

        const localPaper = localPapers[notionPaper.id];

        if (!localPaper) {
            // 本地不存在，直接添加
            return {
                success: true,
                action: "added",
                paper: notionPaper
            };
        }

        if (conflictStrategy === "notion") {
            // Notion 优先：完全覆盖本地数据
            return {
                success: true,
                action: "updated",
                paper: notionPaper
            };
        } else {
            // 本地优先：跳过
            return {
                success: true,
                action: "skipped",
                paper: localPaper
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Sync all papers from Notion to local storage (bulk operation)
 * @param {string} databaseId - Notion database ID
 * @param {string} token - Notion API token
 * @param {function} onProgress - Progress callback (current, total)
 * @returns {object} Sync results
 */
const syncAllPapersFromNotion = async ({ databaseId, token, onProgress }) => {
    const results = {
        added: 0,
        updated: 0,
        skipped: 0,
        errors: []
    };

    try {
        // 1. 查询 Notion 数据库所有论文
        const queryResult = await queryAllNotionPapers({ databaseId, token });

        if (!queryResult.ok) {
            return { ok: false, error: queryResult.error };
        }

        const notionPages = queryResult.papers;
        const total = notionPages.length;

        // 2. 获取本地论文数据
        const localPapers = (await getStorage("papers")) || {};
        const newPapers = { ...localPapers };

        // 3. 逐个同步
        for (let i = 0; i < total; i++) {
            const notionPage = notionPages[i];

            if (onProgress) {
                onProgress(i + 1, total);
            }

            const result = syncPaperFromNotion({
                notionPage,
                localPapers: newPapers,
                conflictStrategy: "notion"  // Notion 优先
            });

            if (result.success) {
                const { action, paper } = result;
                // 验证并修复 paper 数据
                try {
                    const { paper: validatedPaper } = validatePaper(paper, false);
                    newPapers[validatedPaper.id] = validatedPaper;

                    if (action === "added") {
                        results.added++;
                    } else if (action === "updated") {
                        results.updated++;
                    } else if (action === "skipped") {
                        results.skipped++;
                    }
                } catch (validationError) {
                    results.errors.push({
                        paperId: paper.id,
                        error: `Validation failed: ${validationError.message}`
                    });
                }
            } else {
                results.errors.push({
                    paperId: notionPage.id || "unknown",
                    error: result.error
                });
            }
        }

        // 4. 保存到本地存储
        await setStorage("papers", newPapers);

        return { ok: true, ...results };
    } catch (error) {
        console.error("[syncAllPapersFromNotion]", error);
        return {
            ok: false,
            error: error.message
        };
    }
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
        syncIncrementalPapersToNotion,
        syncPapersToNotionWithProgress,
        formatNotionError,
        queryAllNotionPapers,
        notionPropertiesToPaper,
        syncPaperFromNotion,
        syncAllPapersFromNotion
    };
}
