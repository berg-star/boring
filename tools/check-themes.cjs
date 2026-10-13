const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = (process.env.BASE_URL || 'http://127.0.0.1:18080').replace(/\/$/, '');
const key = 'boring-lab-theme-v1';
const palettes = { lime: '#121414', cream: '#f6f1e7', violet: '#191326', ocean: '#101e2c' };
const pages = ['/', ...fs.readdirSync('static').filter(p => p.endsWith('.html') && p !== 'index.html').map(p => '/' + p)];
async function main() {
  fs.mkdirSync('.qa', { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const palette = () => page.locator('html').getAttribute('data-theme');
    async function pick(id) {
      await page.locator('.theme-trigger').click();
      await page.locator(`[data-theme-choice="${id}"]`).click();
      assert.equal(await palette(), id);
      assert.equal(await page.locator(`[data-theme-choice="${id}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), palettes[id]);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#theme-picker').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('theme-trigger')), true);
    }
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('theme-game-sentinel', 'unchanged'));
    await page.evaluate(() => { window.themeRuntimeSentinel = 'no-refresh'; });
    for (const id of Object.keys(palettes)) {
      await page.evaluate(() => { window.themeRuntimeSentinel = 'no-refresh'; });
      await pick(id);
      assert.equal(await page.evaluate(() => window.themeRuntimeSentinel), 'no-refresh');
      await page.screenshot({ path: `.qa/theme-${id}-mobile.png`, animations: 'disabled' });
      await page.reload();
      assert.equal(await palette(), id);
    }
    const other = await context.newPage();
    await other.goto(base + '/wheel.html');
    assert.equal(await other.locator('html').getAttribute('data-theme'), 'ocean');
    await pick('cream');
    await other.waitForFunction(() => document.documentElement.dataset.theme === 'cream');
    await page.goto(base + '/luggage.html');
    await page.locator('#export-text').click();
    await page.waitForFunction(() => document.querySelector('#export-text-value').value.length > 0);
    const backupText = await page.locator('#export-text-value').inputValue();
    assert.ok(JSON.parse(backupText).records.some(r => r.key === key && r.value === 'cream'));
    await pick('violet');
    await page.locator('#import-file').setInputFiles({ name: 'themes.json', mimeType: 'application/json', buffer: Buffer.from(backupText) });
    await page.locator('#restore-items').getByText('界面主题', { exact: true }).waitFor();
    for (const checkbox of await page.locator('#restore-items input[type=checkbox]').all()) {
      const row = checkbox.locator('xpath=..');
      await checkbox.setChecked((await row.textContent()).includes('界面主题'));
    }
    await page.locator('#review-restore').click();
    await page.locator('#apply-restore').click();
    await page.locator('#restore-success').waitFor();
    assert.equal(await palette(), 'cream');
    await page.reload();
    assert.equal(await palette(), 'cream');
    const saved = await context.storageState();
    const reopened = await browser.newContext({ storageState: saved });
    const fresh = await reopened.newPage();
    await fresh.goto(base + '/question.html');
    assert.equal(await fresh.locator('html').getAttribute('data-theme'), 'cream');
    await reopened.close();
    // Exercise every palette on every real page; check the header separately from game canvas widths.
    for (const id of Object.keys(palettes)) {
      await page.evaluate(({ key, id }) => localStorage.setItem(key, id), { key, id });
      for (const route of pages) {
        await page.goto(base + route);
        assert.equal(await palette(), id);
        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          const layout = await page.evaluate(() => {
            const header = document.querySelector('.header');
            const children = [...header.children].filter(e => e.getBoundingClientRect().width && getComputedStyle(e).display !== 'none');
            const bounds = children.map(e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
            return {
              width: document.documentElement.clientWidth,
              overflow: document.documentElement.scrollWidth,
              overlapping: bounds.some((a, i) => bounds.slice(i + 1).some(b => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)),
              touch: document.querySelector('.theme-trigger').getBoundingClientRect().height,
            };
          });
          assert.ok(layout.overflow <= layout.width + 1, `${id} ${route} ${width}: overflow ${layout.overflow}`);
          assert.equal(layout.overlapping, false, `${id} ${route} ${width}: overlapping header`);
          assert.ok(layout.touch >= 44);
        }
      }
    }
    await page.goto(base + '/reaction.html');
    await page.evaluate(() => document.querySelector('.reaction-pad').classList.add('ready'));
    assert.equal(await page.locator('.reaction-pad').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(185, 248, 121)');
    await page.goto(base);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cached = await page.evaluate(async () => {
      const name = (await caches.keys()).find(n => n.startsWith('boring-lab-pwa-'));
      return (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname);
    });
    assert.ok(cached.includes('/static/themes.js') && cached.includes('/static/themes.css'));
    await context.setOffline(true);
    await page.goto(base + '/wheel.html');
    await pick('cream');
    await page.reload();
    assert.equal(await palette(), 'cream');
    await context.setOffline(false);
    assert.equal(await page.evaluate(() => localStorage.getItem('theme-game-sentinel')), 'unchanged');
    assert.deepEqual(errors, []);
    await other.close();
    await context.close();
    const restricted = await browser.newContext();
    await restricted.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    });
    const blocked = await restricted.newPage();
    await blocked.goto(base);
    assert.equal(await blocked.locator('html').getAttribute('data-theme'), 'lime');
    await blocked.locator('.theme-trigger').click();
    await blocked.locator('[data-theme-choice="cream"]').click();
    assert.equal(await blocked.locator('html').getAttribute('data-theme'), 'cream');
    assert.match(await blocked.locator('.theme-status').textContent(), /不能保存/);
    await restricted.close();
  } finally { await browser.close(); }
  console.log('PASS: four themes, all-page mobile/desktop layout, persistence, cross-tab sync, luggage roundtrip, offline cache and blocked storage at ' + base);
}
main().catch(error => { console.error(error); process.exit(1); });
