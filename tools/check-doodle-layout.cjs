const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const base = process.env.BASE_URL || "http://127.0.0.1:18080";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await p.goto(base + "/doodle.html");
    assert.equal(await p.locator("#featured-models").evaluate((e) => e.open), false);
    assert.equal(await p.locator("#sample").evaluate((e) => e.parentElement.id), "model-picker");
    for (const width of [320, 390, 600]) {
      await p.setViewportSize({ width, height: 844 });
      const select = await p.locator("#model-kind").boundingBox(),
        sample = await p.locator("#sample").boundingBox();
      assert.ok(Math.abs(select.y - sample.y) < 12, "random control shares the selector row");
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator("#sample").tap();
    await p.screenshot({ path: ".qa/doodle-editor-layout.png", fullPage: true });
    const draft = await p.evaluate(() => localStorage.getItem("boring-lab-doodle-v1"));
    await p.locator("#alive").tap();
    assert.equal(await p.locator("#live-settings").evaluate((e) => e.open), false);
    assert.equal(await p.locator('[data-material="soft"]').isVisible(), false);
    assert.equal(await p.locator('[data-tool="pull"]').isVisible(), true);
    const exit = await p.locator("#edit").boundingBox(),
      canvas = await p.locator("#drawing").boundingBox();
    assert.ok(exit.y >= 0 && exit.y < canvas.y && exit.y + exit.height < 844);
    await p.screenshot({ path: ".qa/doodle-live-layout.png", fullPage: true });
    await p.locator("#live-settings summary").tap();
    await p.locator('[data-material="paper"]').tap();
    await p.locator('[data-stage="moon"]').tap();
    await p.locator('[data-motion="jump"]').tap();
    const sticky = await p.locator("#edit").boundingBox();
    assert.ok(
      sticky.y >= 0 && sticky.y + sticky.height < 844,
      "exit stays onscreen while changing settings",
    );
    await p.locator("#edit").tap();
    assert.equal(await p.locator("#live-actions").isVisible(), false);
    assert.equal(await p.evaluate(() => localStorage.getItem("boring-lab-doodle-v1")), draft);
    await p.locator("#alive").tap();
    await p.locator('[data-tool="wind"]').tap();
    await p.locator("#wind-toggle").tap();
    await p.locator("#edit").tap();
    assert.equal(await p.locator("#wind-toggle").getAttribute("aria-pressed"), "false");
    await p.locator("#alive").tap();
    await p.setViewportSize({ width: 1100, height: 900 });
    assert.equal(await p.locator("#live-settings").evaluate((e) => e.open), true);
    assert.equal(await p.locator('[data-material="paper"]').getAttribute("aria-pressed"), "true");
    await p.screenshot({ path: ".qa/doodle-desktop-layout.png", fullPage: true });
    await p.setViewportSize({ width: 390, height: 844 });
    assert.equal(await p.locator("#live-settings").evaluate((e) => e.open), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: adjacent random selector/button, mobile collapsed settings, sticky exit, settings preserve state, exit stops wind and preserves drawing, desktop expansion, breakpoint changes and no overflow",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
