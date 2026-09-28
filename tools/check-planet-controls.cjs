const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const preparePlanet = require("./planet-test-ground.cjs");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080";
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    for (const width of [320, 390, 768, 1100]) {
      const p = await b.newPage({
        viewport: { width, height: 844 },
        isMobile: width < 600,
        hasTouch: true,
        reducedMotion: "reduce",
      });
      p.on("pageerror", (e) => errors.push(e.message));
      await p.clock.install();
      await p.goto(base + "/planet.html");
      await preparePlanet(p);
      assert.match(await p.locator("#planet-tool-name").textContent(), /随便点点/);
      for (const [tool, text] of [
        ["tree", "绿色陆地"],
        ["dig", "树根或树冠"],
        ["rain", "松手"],
        ["volcano", "火山"],
        ["explore", "居民"],
      ]) {
        await p.locator("[data-tool=" + tool + "]").click();
        assert.match(await p.locator("#planet-tool-hint").textContent(), new RegExp(text));
      }
      const tapPlanet = async () => {
        await p.locator("#planet").scrollIntoViewIfNeeded();
        const rect = await p.locator("#planet").boundingBox();
        await p.touchscreen.tap(rect.x + rect.width / 2, rect.y + (rect.height * 253) / 510);
      };
      const count = () => p.locator("#planet").getAttribute("data-tree-count");
      await p.locator("[data-tool=tree]").click();
      await tapPlanet();
      assert.equal(await count(), "1");
      assert.match(
        await p.locator("#planet-tool-hint").textContent(),
        /绿色陆地/,
        "event keeps operation instructions",
      );
      await p.locator("[data-tool=dig]").click();
      await tapPlanet();
      assert.equal(await count(), "0");
      assert.equal(await p.locator("#planet-undo").isVisible(), true);
      const rect = await p.locator("#undo-plant").boundingBox();
      const canvasBox = await p.locator("#planet").boundingBox();
      assert.ok(rect.y >= canvasBox.y + canvasBox.height, "undo does not cover the planet");
      if (width < 600)
        assert.ok(
          rect.y >= 0 && rect.y + rect.height <= 844,
          "undo immediately in mobile viewport",
        );
      assert.ok(rect.height >= 44, "touch target large enough");
      assert.equal(await p.locator("#undo-seconds").textContent(), "8 秒");
      assert.ok(await p.locator("#undo-plant").evaluate((el) => !!el.closest(".planet-stage")));
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390)
        await p.screenshot({ path: ".qa/planet-undo-mobile.png", fullPage: false });
      const scroll = await p.evaluate(() => scrollY);
      await p.locator("#undo-plant").tap();
      if (width < 600)
        assert.ok(
          Math.abs((await p.evaluate(() => scrollY)) - scroll) <= 1,
          "undo without scrolling",
        );
      assert.equal(await count(), "1");
      assert.equal(await p.locator("#planet-undo").isVisible(), false);
      await tapPlanet();
      await p.clock.runFor(6100);
      assert.equal(await p.locator("#undo-seconds").textContent(), "2 秒");
      await p.locator("#undo-plant").tap();
      await tapPlanet();
      assert.equal(
        await p.locator("#undo-seconds").textContent(),
        "8 秒",
        "new removal starts full window",
      );
      await p.clock.runFor(1100);
      assert.equal(await p.locator("#undo-seconds").textContent(), "7 秒");
      await p.clock.runFor(6900);
      assert.equal(await p.locator("#planet-undo").isVisible(), false, "expires at eight seconds");
      assert.equal(await count(), "0", "expiry does not restore");
      await p.reload();
      assert.equal(await count(), "0", "removal saved");
      assert.equal(await p.locator("#planet-undo").isVisible(), false);
      await p.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS planet controls: persistent tool hints, 320/390/768/1100 layouts, immediate mobile undo without scrolling, countdown/reset/exact expiry, saved removal",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
