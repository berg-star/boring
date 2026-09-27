const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080",
  key = "boring-lab-planet-v1";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1000, height: 1000 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.clock.install();
    await p.goto(base + "/planet.html");
    await require("./planet-test-ground.cjs")(p);
    const fixture = await p.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k));
      const lat = s.pitch,
        lon = -s.yaw;
      s.trees = [
        {
          x: Math.cos(lat) * Math.sin(lon),
          y: Math.sin(lat),
          z: Math.cos(lat) * Math.cos(lon),
          type: "tree",
          growth: 2,
        },
      ];
      localStorage.setItem(k, JSON.stringify(s));
      return s.trees;
    }, key);
    await p.reload();
    const saved = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    assert.equal(await p.locator("#call-meteor").isDisabled(), true);
    await p.locator("#call-ufo").click();
    assert.equal(await p.locator("#call-ufo").isDisabled(), true);
    await p.clock.runFor(4000);
    assert.deepEqual((await saved()).trees, fixture);
    await p.locator("#planet").screenshot({ path: ".qa/planet-ufo.png" });
    await p.clock.runFor(4500);
    assert.match(await p.locator("#planet-message").innerText(), /还回来了/);
    assert.deepEqual((await saved()).trees, fixture);
    await p.locator("#planet").screenshot({ path: ".qa/planet-inverted.png" });
    await p.reload();
    assert.deepEqual((await saved()).trees, fixture);
    await p.locator("#call-egg").click();
    await p.clock.runFor(8500);
    assert.equal(await p.locator("#hatch-egg").isVisible(), true);
    await p.locator("#hatch-egg").click();
    assert.equal(await p.locator("#hatch-egg").isVisible(), false);
    assert.match(await p.locator("#planet-message").innerText(), /孵出|小星星|迷你飞碟/);
    await p.clock.runFor(19000);
    assert.equal(await p.locator("#call-egg").isDisabled(), false);
    await p.locator('[data-tool="rain"]').click();
    await p.locator("#weather-kind").selectOption("popcorn");
    const before = await saved();
    await p.locator("#planet").focus();
    await p.keyboard.press("Enter");
    assert.equal(await p.locator("#planet").getAttribute("data-last-event"), "popcorn");
    assert.deepEqual((await saved()).ponds, before.ponds);
    assert.deepEqual((await saved()).trees, before.trees);
    await p.locator("#planet").screenshot({ path: ".qa/planet-popcorn.png" });
    await p.locator("#night").click();
    await p.locator("#call-meteor").click();
    await p.clock.runFor(1000);
    await p.locator("#planet").scrollIntoViewIfNeeded();
    const b = await p.locator("#planet").boundingBox();
    // Meteor starts at (75,36) and travels (450,80) across 12 seconds.
    await p.mouse.click(
      b.x + ((75 + 450 / 12) * b.width) / 600,
      b.y + ((36 + 80 / 12) * b.height) / 510,
    );
    assert.equal(await p.locator("#catch-meteor").isVisible(), false);
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.clock.runFor(100);
    for (const [random, text] of [
      [0.01, "粉色"],
      [0.5, "跳舞"],
      [0.99, "亮晶晶"],
    ]) {
      await p.evaluate((n) => (Math.random = () => n), random);
      await p.locator("#call-meteor").click();
      await p.locator("#catch-meteor").click();
      assert.match(await p.locator("#planet-message").innerText(), new RegExp(text));
      await p.locator("#planet").screenshot({ path: ".qa/planet-wish-" + random + ".png" });
      await p.clock.runFor(15000);
    }
    await p.locator("#call-meteor").click();
    await p.locator("#night").click();
    assert.equal(await p.locator("#catch-meteor").isVisible(), false);
    assert.equal(await p.locator("#call-meteor").isDisabled(), true);
    assert.deepEqual((await saved()).trees, fixture);
    await p.reload();
    const baseline = await p.locator("#planet").evaluate((c) => c.toDataURL());
    await p.locator("#call-ufo").click();
    assert.notEqual(await p.locator("#planet").evaluate((c) => c.toDataURL()), baseline);
    await p.clock.runFor(19000);
    assert.equal(await p.locator("#planet").evaluate((c) => c.toDataURL()), baseline);
    const m = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    m.on("pageerror", (e) => errors.push(e.message));
    await m.goto(base + "/planet.html");
    await m.locator("#call-egg").tap();
    assert.equal(await m.locator("#hatch-egg").isVisible(), true);
    await m.locator("#hatch-egg").tap();
    await m.locator("#night").tap();
    await m.locator("#call-meteor").tap();
    await m.locator("#catch-meteor").tap();
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await m.screenshot({ path: ".qa/planet-visitors-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: UFO return/reload without plant loss, egg hatch/expiry, popcorn no irrigation, meteor hit/three temporary wishes/day reset, reduced motion, mobile controls",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
