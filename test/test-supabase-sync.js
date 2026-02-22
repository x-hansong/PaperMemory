const { expect } = require("expect");

const {
    validateSupabaseConfig,
    buildSupabasePaperRows,
    upsertPapersToSupabase,
    pullPapersFromSupabase,
} = require("../src/shared/js/utils/supabase");

describe("supabase sync helpers", () => {
    afterEach(() => {
        delete global.fetch;
        delete global.getManifestDataVersion;
    });

    it("validates url/anon key/sync key", () => {
        expect(
            validateSupabaseConfig({
                url: "",
                anonKey: "a",
                syncKey: "12345678",
            }).ok
        ).toBe(false);

        expect(
            validateSupabaseConfig({
                url: "https://example.supabase.co",
                anonKey: "",
                syncKey: "12345678",
            }).ok
        ).toBe(false);

        expect(
            validateSupabaseConfig({
                url: "https://example.supabase.co",
                anonKey: "anon",
                syncKey: "short",
            }).ok
        ).toBe(false);

        expect(
            validateSupabaseConfig({
                url: "https://example.supabase.co",
                anonKey: "anon",
                syncKey: "abcdefgh",
            }).ok
        ).toBe(true);

        expect(
            validateSupabaseConfig({
                url: "http://localhost:54321",
                anonKey: "anon",
                syncKey: "abcdefgh",
            }).ok
        ).toBe(true);
    });

    it("builds rows and skips metadata keys", () => {
        const rows = buildSupabasePaperRows({
            syncKey: "my-sync-key",
            papers: {
                __dataVersion: 10100,
                "Arxiv-1": { id: "Arxiv-1", title: "A" },
                "ACL-2": { id: "ACL-2", title: "B" },
            },
        });

        expect(rows.length).toBe(2);
        expect(rows[0].sync_key).toBe("my-sync-key");
        expect(rows.map((row) => row.paper_id).sort()).toEqual(["ACL-2", "Arxiv-1"]);
    });

    it("upserts in batches", async () => {
        const calls = [];
        global.fetch = async (url, options) => {
            calls.push({ url, options });
            return {
                ok: true,
                status: 201,
                headers: { get: () => null },
                text: async () => "",
            };
        };

        const papers = { __dataVersion: 10100 };
        for (let i = 0; i < 230; i++) {
            papers[`id-${i}`] = { id: `id-${i}` };
        }

        const result = await upsertPapersToSupabase({
            url: "https://example.supabase.co",
            anonKey: "anon",
            syncKey: "12345678",
            papers,
        });

        expect(result.ok).toBe(true);
        expect(result.synced).toBe(230);
        expect(calls.length).toBe(2);
        expect(calls[0].url).toContain("on_conflict=sync_key,paper_id");
    });

    it("pulls pages and returns papers map with data version", async () => {
        let reqCount = 0;
        global.getManifestDataVersion = () => 10100;
        global.fetch = async () => {
            reqCount += 1;
            if (reqCount === 1) {
                return {
                    ok: true,
                    status: 200,
                    headers: { get: () => null },
                    text: async () =>
                        JSON.stringify([
                            { paper_id: "Arxiv-1", paper_payload: { id: "Arxiv-1" } },
                        ]),
                };
            }
            return {
                ok: true,
                status: 200,
                headers: { get: () => null },
                text: async () => JSON.stringify([]),
            };
        };

        const result = await pullPapersFromSupabase({
            url: "https://example.supabase.co",
            anonKey: "anon",
            syncKey: "12345678",
        });

        expect(result.ok).toBe(true);
        expect(result.papers["Arxiv-1"].id).toBe("Arxiv-1");
        expect(result.papers.__dataVersion).toBe(10100);
        expect(reqCount).toBe(1);
    });
});
