/**
 * AI Auto-Tagging Module
 *
 * 使用 OpenAI 兼容的 API 为论文自动生成标签
 */

/**
 * 获取标签体系配置（从 Chrome Storage）
 * @returns {Promise<{areaTags: string[], taskTags: string[], methodTags: string[]}>}
 */
const getTagTaxonomy = async () => {
    const areaTags = await getStorage("aiAreaTags") || global.aiTaggingDefaults.areaTags;
    const taskTags = await getStorage("aiTaskTags") || global.aiTaggingDefaults.taskTags;
    const methodTags = await getStorage("aiMethodTags") || global.aiTaggingDefaults.methodTags;

    return { areaTags, taskTags, methodTags };
};

/**
 * 获取 AI 配置
 * @returns {Promise<Object>} AI 配置对象
 */
const getAIConfig = async () => {
    const config = {
        enabled: await getStorage("aiTaggingEnabled") ?? false,
        baseUrl: await getStorage("aiApiBaseUrl") ?? global.aiTaggingDefaults.baseUrl,
        apiKey: await getStorage("aiApiKey") ?? "",
        model: await getStorage("aiModel") ?? global.aiTaggingDefaults.model,
        prompt: await getStorage("aiTaggingPrompt") ?? global.aiTaggingDefaults.prompt,
        autoTagOnSave: await getStorage("aiAutoTagOnSave") ?? false,
    };

    // 获取标签体系
    const taxonomy = await getTagTaxonomy();
    config.areaTags = taxonomy.areaTags;
    config.taskTags = taxonomy.taskTags;
    config.methodTags = taxonomy.methodTags;

    return config;
};

/**
 * 调用 OpenAI 兼容的 API
 * @param {Object} params - API 调用参数
 * @param {string} params.baseUrl - API 基础 URL
 * @param {string} params.apiKey - API Key
 * @param {string} params.model - 模型名称
 * @param {Array} params.messages - 消息数组
 * @param {number} params.temperature - 温度参数
 * @returns {Promise<string>} AI 响应内容
 */
const callAIAPI = async ({ baseUrl, apiKey, model, messages, temperature = 0.3 }) => {
    const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

    const requestBody = {
        model,
        messages,
        temperature,
        max_tokens: 500,
    };

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        });

        // Check if response is JSON before parsing
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await response.text();
            console.error("[AI Tagging] Non-JSON response:", text.substring(0, 200));
            throw new Error(`AI API returned non-JSON response (${response.status}). Check API endpoint and CORS settings.`);
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                `AI API error: ${response.status} - ${errorData.error?.message || response.statusText}`
            );
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("[AI Tagging] API call failed:", error);
        throw error;
    }
};

/**
 * 解析 AI 返回的标签
 * @param {string} aiResponse - AI 响应内容
 * @returns {string[]} 标签数组
 */
const parseAITags = (aiResponse) => {
    try {
        // 尝试直接解析 JSON
        const tags = JSON.parse(aiResponse.trim());

        if (!Array.isArray(tags)) {
            throw new Error("Response is not an array");
        }

        // 过滤和清理标签
        return tags
            .filter(tag => typeof tag === "string" && tag.length > 0)
            .map(tag => tag.trim().toLowerCase())
            .slice(0, 9); // 最多 9 个标签

    } catch (error) {
        console.error("[AI Tagging] Failed to parse AI response:", error);
        console.error("[AI Tagging] Raw response:", aiResponse);

        // 尝试从文本中提取标签（降级方案）
        const tagPattern = /["']([a-z0-9\-\/]+)["']/g;
        const matches = [...aiResponse.matchAll(tagPattern)];
        return matches.map(m => m[1]).slice(0, 9);
    }
};

/**
 * 合并 AI 标签与现有标签
 * @param {string[]} existingTags - 现有标签
 * @param {string[]} aiTags - AI 生成的标签
 * @returns {string[]} 合并后的标签（去重）
 */
const mergeTagsWithAI = (existingTags, aiTags) => {
    const allTags = [...(existingTags || []), ...aiTags];

    // 去重（不区分大小写）
    const uniqueTags = [];
    const seen = new Set();

    for (const tag of allTags) {
        const normalized = tag.toLowerCase().trim();
        if (!seen.has(normalized) && normalized.length > 0) {
            seen.add(normalized);
            uniqueTags.push(tag);
        }
    }

    return uniqueTags;
};

/**
 * 为单篇论文生成 AI 标签
 * @param {Object} paper - 论文对象，必须包含 title 和 abstract
 * @returns {Promise<string[]>} 生成的标签数组
 */
const generateAITags = async (paper) => {
    if (!paper.title) {
        throw new Error("Paper must have a title");
    }

    // 获取配置
    const config = await getAIConfig();

    if (!config.enabled) {
        throw new Error("AI tagging is not enabled");
    }

    if (!config.apiKey) {
        throw new Error("AI API key is not configured");
    }

    // 构建 prompt
    let prompt = config.prompt;
    prompt = prompt.replace("{AREA_TAGS}", config.areaTags.join("\n"));
    prompt = prompt.replace("{TASK_TAGS}", config.taskTags.join("\n"));
    prompt = prompt.replace("{METHOD_TAGS}", config.methodTags.join("\n"));
    prompt = prompt.replace("{TITLE}", paper.title);
    prompt = prompt.replace("{ABSTRACT}", paper.abstract || "No abstract available");

    // 调用 AI API
    const messages = [
        {
            role: "user",
            content: prompt,
        },
    ];

    const aiResponse = await callAIAPI({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages,
    });

    // 解析标签
    const aiTags = parseAITags(aiResponse);

    log("[AI Tagging] Generated tags for paper:", paper.id, aiTags);

    return aiTags;
};

/**
 * 批量打标未打标的论文
 * @returns {Promise<{ok: boolean, success: number, failed: number, errors: string[]}>}
 */
const tagAllUntaggedPapers = async () => {
    const papers = await getStorage("papers") || {};
    const untaggedPapers = Object.values(papers).filter(p => !p.tags || p.tags.length === 0);

    let success = 0;
    let failed = 0;
    const errors = [];

    for (const paper of untaggedPapers) {
        try {
            const aiTags = await generateAITags(paper);
            paper.tags = mergeTagsWithAI(paper.tags || [], aiTags);

            // 更新 storage
            papers[paper.id] = paper;
            await setStorage("papers", papers);

            success++;
        } catch (error) {
            failed++;
            errors.push(`${paper.id}: ${error.message}`);
            console.error(`[AI Tagging] Failed to tag paper ${paper.id}:`, error);
        }
    }

    return { ok: true, success, failed, errors };
};

// ----------------------------------------------------
// -----  TESTS: modules for node.js environment  -----
// ----------------------------------------------------
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        getTagTaxonomy,
        getAIConfig,
        callAIAPI,
        parseAITags,
        mergeTagsWithAI,
        generateAITags,
        tagAllUntaggedPapers,
    };
}
