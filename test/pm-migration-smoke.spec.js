const { test, expect, chromium } = require('playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('migration package export/import smoke', async () => {
  const extPath = '/Users/xiaohansong/projects/PaperMemory';
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pw-'));
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-dl-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
    ],
    acceptDownloads: true,
    downloadsPath: downloadDir,
  });

  let [bg] = context.serviceWorkers();
  if (!bg) bg = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extensionId = bg.url().split('/')[2];

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, { waitUntil: 'domcontentloaded' });

  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.locator('#download-migration-package').click();
  const download = await downloadPromise;
  const exportedPath = path.join(downloadDir, download.suggestedFilename());
  await download.saveAs(exportedPath);

  await page.locator('#import-migration-package-input').setInputFiles(exportedPath);
  page.once('dialog', async (dialog) => await dialog.accept());
  await page.locator('#import-migration-package-button').click();

  const feedback = page.locator('#importMigrationFeedback');
  await expect(feedback).toBeVisible({ timeout: 20000 });
  await expect(feedback).toContainText(/imported successfully/i, { timeout: 20000 });

  await context.close();
});
