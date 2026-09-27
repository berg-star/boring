const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() => {
      window.exportText = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...args) {
        if (this.canvas.width === 900)
          window.exportText.push({ text, y, height: this.canvas.height });
        return original.call(this, text, x, y, ...args);
      };
    });
    await p.goto(base + "/card.html");
    assert.equal(await p.locator("#share-card").isDisabled(), true);
    await p.locator("#draw").tap();
    await p.locator("#card-back").tap();
    const title = await p.locator("#keyword").textContent();
    await p.locator("#share-card").tap();
    await p.waitForFunction(() => document.getElementById("share-preview").naturalWidth === 900);
    assert.match(await p.locator("#share-preview").getAttribute("alt"), new RegExp(title));
    const text = await p.evaluate(() => exportText);
    assert.ok(text.some((x) => x.text.includes("无聊研究所")));
    assert.ok(text.some((x) => x.text === "boring-lab-production.up.railway.app/card.html"));
    assert.ok(text.every((x) => x.y > 30 && x.y < x.height - 30));
    const download = p.waitForEvent("download");
    await p.locator("#download-card").tap();
    const file = await download;
    assert.match(file.suggestedFilename(), /^boring-lab-.*\.png$/);
    await file.saveAs(".qa/card-share-mobile.png");
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.locator("#close-card-image").tap();
    assert.equal(await p.locator("#card-image").isVisible(), false);
    assert.equal(await p.locator("#share-card").getAttribute("aria-expanded"), "false");
    await p.locator("#share-card").tap();
    await p.waitForFunction(() => !document.getElementById("card-image").hidden);
    await p.locator("#draw").tap();
    assert.equal(await p.locator("#card-image").isVisible(), false);
    await p.locator("#card-back").tap();
    await p.evaluate(() => {
      window.nativeBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb) {
        cb(null);
      };
    });
    await p.locator("#share-card").tap();
    await p.waitForFunction(() =>
      document.getElementById("api-error").textContent.includes("重试"),
    );
    assert.equal(await p.locator("#share-card").isDisabled(), false);
    await p.evaluate(() => (HTMLCanvasElement.prototype.toBlob = window.nativeBlob));
    await p.locator("#share-card").tap();
    await p.waitForFunction(() => !document.getElementById("card-image").hidden);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: branded URL footer, export bounds, mobile PNG download, collapse/regenerate, stale image cleared, export failure retry",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
