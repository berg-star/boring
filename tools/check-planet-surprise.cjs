const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const preparePlanet = require("./planet-test-ground.cjs");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080";
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    const p = await b.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/static/planet.js", async (route) => {
      const response = await route.fetch();
      let source = await response.text();
      assert.ok(source.includes("  resize();"));
      source = source.replace(
        "  resize();",
        "window.surpriseQA={trees,ponds,groundPoints,dry,land,near,project,inverse,volcano,surpriseEvent,saveWorld,view(a,b){yaw=a;pitch=b;}}; resize();",
      );
      await route.fulfill({ response, body: source });
    });
    await p.goto(base + "/planet.html");
    await preparePlanet(p);
    await p.locator("[data-tool=dig]").click();
    await p.locator("#planet-more > summary").click();
    await p.locator("[data-tool=rain]").click();
    await p.locator("#weather-kind").selectOption("popcorn");
    await p.locator("[data-tool=dig]").click();
    const fire = async (n) => {
      await p.evaluate((n) => {
        surpriseQA.view(0, 0);
        Math.random = () => n;
      }, n);
      await p.locator("#surprise-event").click();
      assert.match(await p.locator("#planet-message").textContent(), /这次整活/);
      assert.doesNotMatch(
        await p.locator("#planet-message").textContent(),
        /有点挤|换块|不能|没有植物/,
      );
      assert.equal(await p.locator("[data-tool=dig]").getAttribute("aria-pressed"), "true");
      assert.match(await p.locator("#planet-tool-name").textContent(), /小铲子/);
      assert.equal(await p.locator("#weather-kind").inputValue(), "popcorn");
    };
    await fire(0);
    assert.equal(await p.locator("#planet").getAttribute("data-last-event"), "tree");
    assert.ok(
      await p.evaluate(() => surpriseQA.trees.length === 1 && surpriseQA.dry(surpriseQA.trees[0])),
    );
    const growth = await p.evaluate(() => surpriseQA.trees[0].growth);
    await fire(0.3);
    assert.equal(await p.locator("#planet").getAttribute("data-last-event"), "rain");
    assert.ok(await p.evaluate((g) => surpriseQA.trees[0].growth > g, growth));
    await fire(0.6);
    assert.equal(await p.locator("#planet").getAttribute("data-last-event"), "volcano");
    assert.ok(await p.evaluate(() => surpriseQA.project(surpriseQA.volcano).z > 0.99));
    await fire(0.99);
    assert.equal(await p.locator("#planet").getAttribute("data-last-event"), "water");
    assert.equal(await p.evaluate(() => surpriseQA.land(surpriseQA.inverse(300, 253))), false);
    const filled = await p.evaluate(() => {
      const q = surpriseQA;
      q.ponds.splice(0);
      q.trees.splice(0);
      for (const point of q.groundPoints) {
        if (q.trees.length >= 80) break;
        if (
          q.dry(point) &&
          q.near(point, q.volcano) > 0.24 &&
          q.trees.every((t) => q.near(t, point) > 0.17)
        )
          q.trees.push({ ...point, type: "tree", growth: 2 });
      }
      q.saveWorld();
      return q.trees.length;
    });
    assert.equal(filled, 80);
    for (const n of [0, 0.5, 0.99]) {
      await fire(n);
      assert.notEqual(
        await p.locator("#planet").getAttribute("data-last-event"),
        "tree",
        "full planet skips planting",
      );
      assert.equal(await p.locator("#planet").getAttribute("data-tree-count"), "80");
    }
    await p.evaluate(() => {
      surpriseQA.trees.splice(0);
      surpriseQA.ponds.splice(0);
      surpriseQA.saveWorld();
    });
    for (let i = 0; i < 30; i++) {
      await fire(((i * 37) % 101) / 101);
      assert.ok(
        await p.evaluate(() => surpriseQA.trees.every(surpriseQA.dry)),
        "plants remain on dry land",
      );
    }
    for (const width of [320, 390, 600, 1100]) {
      await p.setViewportSize({ width, height: 844 });
      await p.locator("#planet-more").evaluate((el) => (el.open = false));
      const canvas = await p.locator("#planet").boundingBox(),
        tools = await p.locator(".planet-tools").boundingBox();
      assert.ok(
        tools.y >= canvas.y + canvas.height && tools.y - (canvas.y + canvas.height) <= 16,
        "tools immediately below canvas",
      );
      assert.ok(await p.locator(".planet-tools").evaluate((el) => !!el.closest(".planet-room")));
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390) {
        await p.locator("#planet").scrollIntoViewIfNeeded();
        await p.screenshot({ path: ".qa/planet-close-tools-mobile.png" });
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS planet surprise: valid planting/watering/sea/volcano targets, full-planet fallback, 30 effective events, tool/weather preserved, close mobile controls",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
