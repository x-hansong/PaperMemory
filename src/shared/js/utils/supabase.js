const PM_SUPABASE_TABLE = "pm_papers_sync";
const PM_SUPABASE_PAGE_SIZE = 500;
const PM_SUPABASE_PUSH_BATCH = 200;

const normalizeSupabaseUrl = (url = "") => url.trim().replace(/\/+$/, "");

const validateSupabaseConfig = ({ url, anonKey, syncKey }) => {
    const normalizedUrl = normalizeSupabaseUrl(url);
    if (!normalizedUrl || !/^https?:\/\//.test(normalizedUrl)) {
        return { ok: false, reason: "Invalid Supabase URL" };
    }
    if (!anonKey) {
        return { ok: false, reason: "Missing Supabase anon key" };
    }
    if (!syncKey || syncKey.length < 8) {
        return { ok: false, reason: "syncKey must be at least 8 characters" };
    }
    return { ok: true };
};

const getSupabaseHeaders = (anonKey, { prefer = null } = {}) => {
    const headers = {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
    };
    if (prefer) {
        headers.Prefer = prefer;
    }
    return headers;
};

const formatSupabaseError = (error) => {
    if (!error) return "Unknown Supabase error";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    if (error.error_description) return error.error_description;
    if (error.hint) return `${error.error || "Request failed"}: ${error.hint}`;
    return JSON.stringify(error);
};

const parseResponse = async (response) => {
    const text = await response.text();
    let json = null;
    if (text) {
        try {
            json = JSON.parse(text);
        } catch (e) {
            json = { message: text };
        }
    }

    if (!response.ok) {
        return {
            ok: false,
            error: formatSupabaseError(json),
            status: response.status,
            payload: json,
        };
    }

    return {
        ok: true,
        status: response.status,
        payload: json,
        countHeader: response.headers.get("content-range"),
    };
};

const supabaseRequest = async ({
    url,
    anonKey,
    method = "GET",
    query = "",
    body = null,
    prefer = null,
}) => {
    const endpoint = `${normalizeSupabaseUrl(url)}/rest/v1/${PM_SUPABASE_TABLE}${query}`;
    const response = await fetch(endpoint, {
        method,
        headers: getSupabaseHeaders(anonKey, { prefer }),
        body: body ? JSON.stringify(body) : null,
    });
    return await parseResponse(response);
};

const testSupabaseConnection = async ({ url, anonKey, syncKey }) => {
    const valid = validateSupabaseConfig({ url, anonKey, syncKey });
    if (!valid.ok) return valid;

    try {
        const query = `?sync_key=eq.${encodeURIComponent(syncKey)}&select=paper_id&limit=1`;
        const result = await supabaseRequest({ url, anonKey, query });
        return result.ok ? { ok: true } : { ok: false, reason: result.error };
    } catch (error) {
        return { ok: false, reason: formatSupabaseError(error) };
    }
};

const buildSupabasePaperRows = ({ papers, syncKey }) => {
    return Object.entries(papers ?? {})
        .filter(([paperId]) => !paperId.startsWith("__"))
        .map(([paperId, paper]) => ({
            sync_key: syncKey,
            paper_id: paperId,
            paper_payload: paper,
            updated_at: new Date().toISOString(),
        }));
};

const chunkArray = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
};

const upsertPapersToSupabase = async ({
    url,
    anonKey,
    syncKey,
    papers,
    onProgress = null,
}) => {
    const valid = validateSupabaseConfig({ url, anonKey, syncKey });
    if (!valid.ok) return { ok: false, error: valid.reason };

    const rows = buildSupabasePaperRows({ papers, syncKey });
    const batches = chunkArray(rows, PM_SUPABASE_PUSH_BATCH);

    let synced = 0;
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        onProgress && onProgress(i + 1, batches.length, synced, rows.length);

        const result = await supabaseRequest({
            url,
            anonKey,
            method: "POST",
            query: "?on_conflict=sync_key,paper_id",
            body: batch,
            prefer: "resolution=merge-duplicates,return=minimal",
        });

        if (!result.ok) {
            return { ok: false, error: result.error, synced };
        }

        synced += batch.length;
    }

    return { ok: true, synced, total: rows.length };
};

const pullPapersFromSupabase = async ({
    url,
    anonKey,
    syncKey,
    onProgress = null,
}) => {
    const valid = validateSupabaseConfig({ url, anonKey, syncKey });
    if (!valid.ok) return { ok: false, error: valid.reason };

    const papers = {};
    let from = 0;

    while (true) {
        const to = from + PM_SUPABASE_PAGE_SIZE - 1;
        const query =
            `?sync_key=eq.${encodeURIComponent(syncKey)}` +
            "&select=paper_id,paper_payload" +
            "&order=updated_at.desc" +
            `&offset=${from}&limit=${PM_SUPABASE_PAGE_SIZE}`;

        const result = await supabaseRequest({ url, anonKey, query });
        if (!result.ok) {
            return { ok: false, error: result.error };
        }

        const rows = result.payload ?? [];
        for (const row of rows) {
            if (row.paper_id && row.paper_payload) {
                papers[row.paper_id] = row.paper_payload;
            }
        }

        onProgress && onProgress(Object.keys(papers).length, rows.length);

        if (rows.length < PM_SUPABASE_PAGE_SIZE) {
            break;
        }
        from += PM_SUPABASE_PAGE_SIZE;
    }

    const fallbackVersion =
        typeof getManifestDataVersion === "function" ? getManifestDataVersion() : 1;
    papers.__dataVersion = fallbackVersion;

    return { ok: true, papers };
};

if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        PM_SUPABASE_TABLE,
        normalizeSupabaseUrl,
        validateSupabaseConfig,
        formatSupabaseError,
        buildSupabasePaperRows,
        testSupabaseConnection,
        upsertPapersToSupabase,
        pullPapersFromSupabase,
        chunkArray,
    };
}
