const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const preparePlanet = require("./planet-test-ground.cjs");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080";
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    for (const width of [320, 390, 600, 768, 1100]) {
      const p = await b.newPage({
        viewport: { width, height: 844 },
        isMobile: width <= 600,
        hasTouch: true,
        reducedMotion: "reduce",
      });
      p.on("pageerror", (e) => errors.push(e.message));
      await p.clock.install();
      await p.goto(base + "/planet.html");
      await preparePlanet(p);
      const open = () => p.locator("#planet-more").evaluate((el) => el.open);
      const setOpen = async (value) => {
        if ((await open()) !== value) await p.locator("#planet-more > summary").click();
      };
      assert.equal(await open(), width > 600, "initial responsive panel");
      assert.equal(await p.locator(".planet-tools [data-tool]").count(), 3);
      for (const tool of ["explore", "tree", "dig"])
        assert.ok(await p.locator("[data-tool=" + tool + "]").isVisible());
      if (width <= 600) {
        assert.equal(await p.locator("#call-ufo").isVisible(), false);
        assert.equal(await p.locator("[data-tool=rain]").isVisible(), false);
      }
      await setOpen(false);
      if (width === 390) {
        await p.locator(".planet-tools").scrollIntoViewIfNeeded();
        await p.screenshot({ path: ".qa/planet-folded-mobile.png" });
      }
      await p.locator("#planet-more > summary").focus();
      await p.keyboard.press("Enter");
      assert.equal(await open(), true, "keyboard opens native panel");
      await p.locator("[data-tool=rain]").click();
      await p.locator("#weather-kind").selectOption("popcorn");
      if (width === 390)
        await p.locator("#planet-more").screenshot({ path: ".qa/planet-more-mobile.png" });
      await setOpen(false);
      assert.match(await p.locator("#planet-more-state").textContent(), /下场雨/);
      assert.match(await p.locator("#planet-tool-hint").textContent(), /更多玩法/);
      await p.locator("#planet").focus();
      await p.keyboard.press("Enter");
      assert.equal(
        await p.locator("#planet").getAttribute("data-last-event"),
        "popcorn",
        "collapsed panel preserves selected weather",
      );
      await setOpen(true);
      assert.equal(await p.locator("#weather-kind").inputValue(), "popcorn");
      await p.locator("[data-tool=dig]").click();
      assert.equal(await p.locator("#planet-more-state").textContent(), "");
      await p.locator("#call-egg").click();
      await setOpen(false);
      await p.clock.runFor(8500);
      assert.ok(
        await p.locator("#hatch-egg").isVisible(),
        "egg action available with closed panel",
      );
      assert.equal(
        await p.locator("#hatch-egg").evaluate((el) => !!el.closest("#planet-more")),
        false,
      );
      await p.locator("#hatch-egg").click();
      assert.equal(await p.locator("#planet-event-actions").isVisible(), false);
      await p.locator("#night").click();
      await setOpen(true);
      await p.locator("#call-meteor").click();
      await setOpen(false);
      assert.ok(
        await p.locator("#catch-meteor").isVisible(),
        "meteor action available with closed panel",
      );
      await p.locator("#catch-meteor").click();
      assert.equal(await p.locator("#planet-event-actions").isVisible(), false);
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await setOpen(true);
      await p.locator("[data-tool=rain]").click();
      await p.setViewportSize({ width: 1100, height: 844 });
      await p.clock.runFor(100);
      assert.equal(await open(), true);
      await p.setViewportSize({ width: 390, height: 844 });
      await p.clock.runFor(100);
      await p.waitForFunction(() => !document.getElementById("planet-more").open);
      assert.equal(await open(), false);
      assert.equal(
        await p.locator("#weather-kind").inputValue(),
        "popcorn",
        "resize retains selection",
      );
      assert.equal(await p.locator("[data-tool=rain]").getAttribute("aria-pressed"), "true");
      await setOpen(true);
      await p.setViewportSize({ width: 390, height: 760 });
      await p.clock.runFor(100);
      assert.equal(await open(), true, "height change preserves manually opened panel");
      await p.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS planet layout: common tools, responsive native panel, keyboard, hidden active-tool indicator, weather retention, egg/meteor actions outside collapsed panel, no overflow",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
