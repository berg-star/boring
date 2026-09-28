const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const cards = require("../data/cards.json");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080",
  KEY = "boring-lab-cards-v1";
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    const context = await b.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const seed = {
      version: 1,
      owned: cards.filter((c) => c.series === "relax" && c.id !== "relax-15").map((c) => c.id),
      favorites: ["relax-01"],
    };
    await context.addInitScript(
      ({ key, seed }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
      },
      { key: KEY, seed },
    );
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    let card = cards.find((c) => c.id === "relax-15");
    await p.route("**/api/random-card", (r) => r.fulfill({ json: card }));
    await p.goto(base + "/card.html");
    const counts = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    const reveal = async () => {
      await p.locator("#draw").click();
      await p.locator("#card-back").click();
      await p.waitForFunction(() => !document.getElementById("card-encounter").hidden);
    };
    await p.locator("#open-collection").click();
    await p.waitForSelector(".collection-card");
    assert.equal(await p.locator(".series-progress").count(), 6);
    assert.equal(
      await p.locator("[data-progress-series=relax] progress").getAttribute("value"),
      "14",
    );
    assert.equal(
      await p.locator("[data-progress-series=funny] progress").getAttribute("value"),
      "0",
    );
    assert.equal(await p.locator("#series-celebration").isVisible(), false);
    assert.deepEqual(await counts(), seed, "reading old collection does not change save");
    await p.locator("#collection").evaluate((el) => (el.open = false));
    await p.locator("#draw").click();
    assert.equal((await counts()).owned.length, 14);
    assert.equal(await p.locator("#series-celebration").isVisible(), false);
    await p.locator("#card-back").click();
    await p.waitForFunction(() => !document.getElementById("series-celebration").hidden);
    assert.match(await p.locator("#card-encounter").textContent(), /第一次遇见/);
    assert.match(await p.locator("#series-complete-title").textContent(), /松弛.*集齐/);
    assert.equal(
      await p.locator("[data-progress-series=relax] progress").getAttribute("value"),
      "15",
    );
    assert.equal(
      await p.locator("[data-progress-series=relax]").getAttribute("data-complete"),
      "true",
    );
    assert.equal(
      await p.locator("#series-celebration").evaluate((el) => getComputedStyle(el).animationName),
      "none",
      "reduced motion",
    );
    assert.equal(
      await p.evaluate(() => document.activeElement.id),
      "draw",
      "celebration does not steal focus",
    );
    await p.locator("#result").screenshot({ path: ".qa/card-series-complete.png" });
    await p.locator("#close-series-celebration").click();
    assert.equal(await p.locator("#series-celebration").isVisible(), false);
    await reveal();
    assert.match(await p.locator("#card-encounter").textContent(), /老朋友又来了/);
    assert.equal((await counts()).owned.length, 15);
    assert.equal(await p.locator("#series-celebration").isVisible(), false);
    await p.locator("#favorite").click();
    assert.equal(await p.locator("#series-celebration").isVisible(), false);
    await p.reload();
    assert.equal(await p.locator("#series-celebration").isVisible(), false);
    await p.locator("#open-collection").click();
    await p.waitForSelector(".collection-card");
    await p.locator("[data-progress-series=relax]").click();
    assert.equal(await p.locator("#collection-series").inputValue(), "relax");
    assert.equal(await p.locator(".collection-card").count(), 15);
    assert.equal(
      await p.locator("[data-progress-series=relax]").getAttribute("aria-pressed"),
      "true",
    );
    await p.locator(".collection-card.owned").first().click();
    assert.match(await p.locator("#card-encounter").textContent(), /收藏里的老朋友/);
    assert.equal(await p.locator("#series-celebration").isVisible(), false);
    await p.locator("[data-progress-series=courage]").click();
    assert.equal(await p.locator("#collection-series").inputValue(), "courage");
    assert.equal(await p.locator(".collection-card.owned").count(), 0);
    card = cards.find((c) => c.id === "courage-07");
    await p.locator("#collection").evaluate((el) => (el.open = false));
    await reveal();
    assert.match(await p.locator("#card-encounter").textContent(), /第一次遇见/);
    assert.equal(
      await p.locator("[data-progress-series=courage] progress").getAttribute("value"),
      "1",
    );
    assert.equal(await p.locator("#series-celebration").isVisible(), false);
    await p.locator("#open-collection").click();
    await p
      .locator("#collection-progress")
      .screenshot({ path: ".qa/card-series-progress-mobile.png" });
    for (const width of [320, 390, 768, 1100]) {
      await p.setViewportSize({ width, height: 844 });
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await context.close();
    // Two tabs revealing the same missing last card should celebrate only on the tab that adds it.
    const shared = await b.newContext({ reducedMotion: "reduce" });
    await shared.addInitScript(
      ({ key, seed }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
      },
      { key: KEY, seed },
    );
    const pages = await Promise.all([shared.newPage(), shared.newPage()]);
    for (const page of pages) {
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/random-card", (r) =>
        r.fulfill({ json: cards.find((c) => c.id === "relax-15") }),
      );
      await page.goto(base + "/card.html");
      await page.locator("#draw").click();
    }
    await Promise.all(pages.map((page) => page.locator("#card-back").click()));
    await Promise.all(
      pages.map((page) =>
        page.waitForFunction(() => !document.getElementById("card-encounter").hidden),
      ),
    );
    assert.equal(
      (
        await Promise.all(pages.map((page) => page.locator("#series-celebration").isVisible()))
      ).filter(Boolean).length,
      1,
      "one completion celebration across tabs",
    );
    assert.equal(
      (
        await Promise.all(pages.map((page) => page.locator("#card-encounter").textContent()))
      ).filter((t) => t.includes("第一次遇见")).length,
      1,
      "one new encounter across tabs",
    );
    await Promise.all(
      pages.map((page) =>
        page.waitForFunction(
          () => document.querySelector("[data-progress-series=relax] progress").value === 15,
        ),
      ),
    );
    await shared.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS card feedback: first/repeat/view states, six series counts/filter, one-time completion/dismiss/reload, unchanged legacy save, no forced focus, reduced motion, responsive layout, concurrent tabs",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
