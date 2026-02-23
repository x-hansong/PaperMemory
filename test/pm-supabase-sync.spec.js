const { test, expect, chromium } = require("playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");

test("supabase sync smoke", async () => {
    const supabaseUrl = process.env.pm_supabase_url;
    const supabaseAnonKey = process.env.pm_supabase_anon_key;
    const supabaseSyncKey = process.env.pm_supabase_sync_key;

    test.skip(
        !supabaseUrl || !supabaseAnonKey || !supabaseSyncKey,
        "pm_supabase_url / pm_supabase_anon_key / pm_supabase_sync_key not set"
    );

    const extPath = path.resolve(__dirname, "..");
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-supa-pw-"));

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
    });

    let [bg] = context.serviceWorkers();
    if (!bg) bg = await context.waitForEvent("serviceworker", { timeout: 20000 });
    const extensionId = bg.url().split("/")[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, {
        waitUntil: "domcontentloaded",
    });

    await page.locator("#supabase-url-input").fill(supabaseUrl);
    await page.locator("#supabase-anon-key-input").fill(supabaseAnonKey);
    await page.locator("#supabase-sync-key-input").fill(supabaseSyncKey);
    await page.locator("#save-supabase-credentials").click();

    await page.locator("#test-supabase-connection").click();
    await expect(page.locator("#supabase-feedback")).toContainText(/successful/i, {
        timeout: 30000,
    });

    await context.close();
});
