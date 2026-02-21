const { expect } = require("expect");

const { migrationConfigKeys } = require("../src/shared/js/utils/config");
const {
    migrationPackageSchemaVersion,
    buildMigrationPackage,
    normalizeMigrationConfig,
    validateMigrationPackage,
} = require("../src/shared/js/utils/data");

describe("migration package helpers", () => {
    before(() => {
        global.migrationConfigKeys = migrationConfigKeys;
    });

    describe("#normalizeMigrationConfig", () => {
        it("fills missing keys with null", () => {
            const cfg = normalizeMigrationConfig({ syncState: true });
            expect(cfg.syncState).toBe(true);
            expect(cfg.syncPAT).toBe(null);
            expect(Object.keys(cfg).length).toBe(migrationConfigKeys.length);
        });

        it("keeps explicit falsey values", () => {
            const cfg = normalizeMigrationConfig({
                notionSyncState: false,
                aiApiKey: "",
            });
            expect(cfg.notionSyncState).toBe(false);
            expect(cfg.aiApiKey).toBe("");
        });
    });

    describe("#validateMigrationPackage", () => {
        it("accepts a valid package", () => {
            const payload = {
                meta: { schemaVersion: migrationPackageSchemaVersion },
                data: { papers: { __dataVersion: 10100 } },
                config: {},
            };
            expect(validateMigrationPackage(payload)).toEqual({ ok: true });
        });

        it("rejects newer schema versions", () => {
            const payload = {
                meta: { schemaVersion: migrationPackageSchemaVersion + 1 },
                data: { papers: {} },
                config: {},
            };
            const result = validateMigrationPackage(payload);
            expect(result.ok).toBe(false);
            expect(result.reason.toLowerCase()).toContain("unsupported");
        });

        it("rejects missing papers object", () => {
            const payload = {
                meta: { schemaVersion: migrationPackageSchemaVersion },
                data: {},
                config: {},
            };
            const result = validateMigrationPackage(payload);
            expect(result.ok).toBe(false);
            expect(result.reason).toContain("data.papers");
        });

        it("accepts older data versions for migration", () => {
            const payload = {
                meta: { schemaVersion: migrationPackageSchemaVersion },
                data: { papers: { __dataVersion: 208, "Arxiv-1234.5678": {} } },
                config: {},
            };
            expect(validateMigrationPackage(payload)).toEqual({ ok: true });
        });
    });

    describe("#buildMigrationPackage", () => {
        it("creates a single-file snapshot with normalized config", async () => {
            const store = {
                papers: { __dataVersion: 10100, "Arxiv-1": { id: "Arxiv-1" } },
                syncPAT: "secret-token",
                syncState: true,
            };
            global.chrome = {
                runtime: {
                    getManifest: () => ({ version: "1.1.0" }),
                },
                storage: {
                    local: {
                        get: (key, cb) => {
                            if (typeof key === "string") {
                                cb({ [key]: store[key] });
                                return;
                            }
                            if (Array.isArray(key)) {
                                const out = {};
                                for (const k of key) {
                                    out[k] = store[k];
                                }
                                cb(out);
                                return;
                            }
                            cb({});
                        },
                    },
                },
            };

            const payload = await buildMigrationPackage();
            expect(payload.meta.schemaVersion).toBe(migrationPackageSchemaVersion);
            expect(payload.meta.appVersion).toBe("1.1.0");
            expect(payload.data.papers).toEqual(store.papers);
            expect(payload.config.syncPAT).toBe("secret-token");
            expect(payload.config.syncState).toBe(true);
            expect(payload.config.aiApiKey).toBe(null);
            expect(Object.keys(payload.config).length).toBe(migrationConfigKeys.length);
        });
    });
});
