const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080";
const key = "boring-lab-question-recent-v1";
const themes = ["imagination", "life", "choice", "objects"];
(async () => {
  const response = await fetch(base + "/api/questions");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json.*utf-8/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const rows = await response.json();
  assert.equal(rows.length, 100);
  assert.equal(new Set(rows.map((r) => r.id)).size, 100);
  assert.equal(new Set(rows.map((r) => r.question)).size, 100);
  for (const theme of themes) assert.equal(rows.filter((r) => r.category === theme).length, 25);
  for (const row of rows) {
    assert.match(row.id, /^q-(?!000)\d{3}$/);
    assert.ok(themes.includes(row.category));
    assert.ok(row.question.trim() && row.question.length <= 100);
  }
  const lookup = new Map(rows.map((r) => [r.id, r]));
  for (let i = 0; i < 5; i++) {
    const row = await (await fetch(base + "/api/random-question")).json();
    assert.deepEqual(row, lookup.get(row.id));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 1100, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let requests = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/questions")) requests++;
    });
    const ready = () =>
      page.waitForFunction(
        () =>
          !document.querySelector("#draw").disabled &&
          !!document.querySelector("#result").dataset.questionId,
      );
    const current = () => page.locator("#result").getAttribute("data-question-id");
    const observed = [];
    async function record(theme = "all") {
      await ready();
      const id = await current();
      assert.ok(lookup.has(id));
      assert.ok(!observed.slice(-8).includes(id), "must avoid last eight questions");
      if (theme !== "all") assert.equal(lookup.get(id).category, theme);
      assert.equal(await page.locator("#question").textContent(), lookup.get(id).question);
      assert.equal(
        await page.locator("#question-theme-label").getAttribute("data-category"),
        lookup.get(id).category,
      );
      observed.push(id);
      return id;
    }
    async function draw(theme = "all") {
      await page.evaluate(() => document.querySelector("#draw").click());
      return record(theme);
    }
    await page.goto(base + "/question.html");
    await record();
    for (let i = 1; i < 100; i++) await draw();
    assert.equal(new Set(observed).size, 100, "all-theme first round has no duplicates");
    for (let i = 0; i < 20; i++) await draw();
    for (const theme of themes) {
      await page.locator(`[data-theme=${theme}]`).click();
      const round = [await record(theme)];
      assert.equal(
        await page.locator(`[data-theme=${theme}]`).getAttribute("aria-pressed"),
        "true",
      );
      for (let i = 1; i < 25; i++) round.push(await draw(theme));
      assert.equal(new Set(round).size, 25, "theme first round has no duplicates");
      for (let i = 0; i < 12; i++) await draw(theme);
    }
    for (let i = 0; i < 50; i++) {
      const theme = themes[i % 4];
      await page.locator(`[data-theme=${theme}]`).click();
      await record(theme);
    }
    assert.equal(requests, 1, "draws do not issue additional catalogue requests");
    assert.deepEqual(
      await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)).ids, key),
      observed.slice(-8),
    );
    await page.reload();
    await record();
    assert.equal(requests, 2);
    for (const width of [320, 390, 600, 1100]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        "no horizontal overflow",
      );
      for (const button of await page.locator("[data-theme]").all()) {
        const box = await button.boundingBox();
        assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
      }
      if (width === 390) await page.screenshot({ path: ".qa/question-mobile.png", fullPage: true });
      if (width === 1100)
        await page.screenshot({ path: ".qa/question-desktop.png", fullPage: true });
    }
    await page.locator("[data-theme=life]").focus();
    await page.keyboard.press("Enter");
    await record("life");
    assert.deepEqual(errors, []);
    await context.close();
    // Broken/blocked storage is optional; play must continue.
    for (const mode of ["broken", "blocked"]) {
      const ctx = await browser.newContext();
      await ctx.addInitScript(
        ({ key, mode }) => {
          if (mode === "broken") sessionStorage.setItem(key, "{broken");
          else {
            const get = Storage.prototype.getItem,
              set = Storage.prototype.setItem;
            Storage.prototype.getItem = function (k) {
              if (k === key) throw Error("blocked");
              return get.call(this, k);
            };
            Storage.prototype.setItem = function (k, v) {
              if (k === key) throw Error("blocked");
              return set.call(this, k, v);
            };
          }
        },
        { key, mode },
      );
      const p = await ctx.newPage();
      const failures = [];
      p.on("pageerror", (e) => failures.push(e.message));
      await p.goto(base + "/question.html");
      await p.waitForFunction(() => !!document.querySelector("#result").dataset.questionId);
      const ids = [];
      for (let i = 0; i < 15; i++) {
        const id = await p.locator("#result").getAttribute("data-question-id");
        assert.ok(!ids.slice(-8).includes(id));
        ids.push(id);
        await p.evaluate(() => document.querySelector("#draw").click());
      }
      assert.deepEqual(failures, []);
      await ctx.close();
    }
    // A failed or invalid catalogue must be rejected in full and retry cleanly.
    for (const mode of ["503", "duplicate", "missing-theme", "invalid-id"]) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      const bad = structuredClone(rows);
      if (mode === "duplicate") bad[1] = { ...bad[0] };
      if (mode === "invalid-id") bad[0].id = "q-000";
      const payload = mode === "missing-theme" ? bad.filter((r) => r.category !== "objects") : bad;
      await p.route("**/api/questions", (r) =>
        mode === "503"
          ? r.fulfill({ status: 503, body: "unavailable" })
          : r.fulfill({ json: payload }),
      );
      await p.goto(base + "/question.html");
      await p.waitForFunction(() => !!document.querySelector("#api-error").textContent);
      assert.equal(await p.locator("#result").getAttribute("data-question-id"), null);
      assert.equal(await p.evaluate((k) => sessionStorage.getItem(k), key), null);
      assert.equal(await p.locator("#draw").isEnabled(), true);
      await p.unroute("**/api/questions");
      await p.locator("#draw").click();
      await p.waitForFunction(() => !!document.querySelector("#result").dataset.questionId);
      assert.equal(await p.locator("#api-error").textContent(), "");
      await ctx.close();
    }
    const slowContext = await browser.newContext();
    const slowPage = await slowContext.newPage();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await slowPage.route("**/api/questions", async (r) => {
      await gate;
      await r.fulfill({ json: rows });
    });
    await slowPage.goto(base + "/question.html");
    assert.equal(await slowPage.locator("#draw").isDisabled(), true);
    assert.equal(await slowPage.locator("[data-theme=life]").isDisabled(), true);
    release();
    await slowPage.waitForFunction(() => !!document.querySelector("#result").dataset.questionId);
    await slowContext.close();
    console.log(
      "PASS: 100 questions, theme cycles, recent-eight exclusion, reload, optional storage, retry and mobile layout at " +
        base,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
