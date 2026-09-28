const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    const wechat = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: "Mozilla/5.0 Android MicroMessenger/8.0",
      reducedMotion: "reduce",
    });
    await wechat.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }),
    );
    const source = await wechat.newPage();
    source.on("pageerror", (e) => errors.push(e.message));
    let downloads = 0;
    source.on("download", () => downloads++);
    await source.goto(base + "/luggage.html");
    const now = Date.now(),
      stroke = {
        color: "#28352f",
        width: 9,
        points: [
          [200, 150],
          [220, 180],
          [260, 190],
        ],
      };
    const original = {
      "boring-lab-pet-v1": JSON.stringify({
        version: 1,
        name: "微信里的小东西",
        color: 1,
        shape: 2,
        personality: 0,
        food: 65,
        joy: 75,
        weight: 25,
        born: now - 3 * 86400000,
        updated: now,
        awayUntil: 0,
      }),
      "boring-lab-cards-v1": JSON.stringify({
        version: 1,
        owned: ["relax-01", "courage-05", "funny-15"],
        favorites: [],
      }),
      "boring-lab-planet-v1": JSON.stringify({
        version: 1,
        trees: [{ x: 1, y: 0, z: 0, type: "tree", growth: 1 }],
        ponds: [],
        residents: ["#f5cb8e", "#e8a7ad", "#b7a8e7", "#d5e9aa", "#99d9ce"].map((color) => ({
          p: { x: 1, y: 0, z: 0 },
          color,
        })),
        night: false,
        yaw: 0.5,
        pitch: 0,
      }),
      "boring-lab-doodle-v1": JSON.stringify({ version: 1, strokes: [stroke] }),
      "boring-lab-achievements-v1": JSON.stringify({
        version: 1,
        visits: ["pet", "planet", "wheel", "card", "doodle", "book"],
        kinds: [],
        wheelMs: 0,
        spins: 1,
        cards: 3,
        skips: 0,
        trees: 1,
        books: 0,
        early: false,
        fast: false,
        named: true,
        unlocked: { keeper: now, explorer: now },
      }),
      "boring-lab-wheel-v1": JSON.stringify({
        version: 1,
        scene: "breakfast",
        brand: "choose",
        custom: [],
        lists: {
          breakfast: [
            { text: "鸡蛋饼", on: true },
            { text: "包子", on: true },
          ],
        },
      }),
    };
    const seed = async (p, data) =>
      p.evaluate((data) => {
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
      }, data);
    const snapshot = (p) =>
      p.evaluate(
        (keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])),
        Object.keys(original),
      );
    await seed(source, { ...original, unrelated: "do not copy" });
    await source.reload();
    assert.equal(await source.locator("[data-state=ready]").count(), 6);
    await source.locator("#export-text").click();
    await source.waitForFunction(() =>
      document.querySelector("#text-copy-status").textContent.includes("自动复制不可用"),
    );
    const copied = await source.locator("#export-text-value").inputValue(),
      backup = JSON.parse(copied);
    assert.equal(downloads, 0);
    assert.equal(source.url(), base + "/luggage.html");
    assert.equal(backup.records.length, 6);
    assert.deepEqual(Object.fromEntries(backup.records.map((r) => [r.key, r.value])), original);
    assert.match(await source.locator("#text-export-summary").innerText(), /6 项记录/);
    await source.locator("#select-export-text").click();
    assert.deepEqual(
      await source
        .locator("#export-text-value")
        .evaluate((e) => [e.selectionStart, e.selectionEnd]),
      [0, copied.length],
    );
    // External browser starts with different progress, as in the reported issue.
    const external = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const dest = await external.newPage();
    dest.on("pageerror", (e) => errors.push(e.message));
    await dest.goto(base + "/luggage.html");
    await seed(dest, {
      "boring-lab-cards-v1": JSON.stringify({ version: 1, owned: ["company-05"], favorites: [] }),
      "boring-lab-achievements-v1": JSON.stringify({
        ...JSON.parse(original["boring-lab-achievements-v1"]),
        visits: ["card"],
        cards: 7,
        unlocked: {},
      }),
    });
    const before = await snapshot(dest);
    assert.equal((await snapshot(dest))["boring-lab-pet-v1"], null);
    await dest.locator("#text-import summary").click();
    const paste = async (text) => {
      await dest.locator("#import-text-value").fill(text);
      await dest.locator("#check-import-text").click();
      await dest.waitForFunction(
        () => !document.querySelector("#luggage-status").textContent.includes("正在检查"),
      );
    };
    await paste(copied);
    assert.equal(await dest.locator("#restore-items input").count(), 6);
    assert.deepEqual(await snapshot(dest), before);
    await dest.locator("#review-restore").click();
    assert.deepEqual(await snapshot(dest), before);
    await dest.locator("#apply-restore").click();
    await dest.waitForSelector("#restore-success");
    assert.deepEqual(await snapshot(dest), original);
    // The existing download route produces the same saved values as copied text.
    const pending = source.waitForEvent("download");
    await source.locator("#export-luggage").click();
    const file = JSON.parse(await fs.readFile(await (await pending).path(), "utf8"));
    assert.deepEqual(file.records, backup.records);
    // Truncated, invalid, oversized and empty text never writes partial progress.
    for (const value of ["", copied.slice(0, -20), '{"format":"another-site"}']) {
      await paste(value);
      assert.equal(await dest.locator("#restore-preview").isVisible(), false);
      assert.deepEqual(await snapshot(dest), original);
      assert.match(await dest.locator("#luggage-status").innerText(), /当前记录没有改变/);
    }
    await dest
      .locator("#import-text-value")
      .evaluate((e) => (e.value = " ".repeat(8 * 1024 * 1024 + 1)));
    await dest.locator("#check-import-text").click();
    await dest.waitForFunction(
      () => !document.querySelector("#luggage-status").textContent.includes("正在检查"),
    );
    assert.deepEqual(await snapshot(dest), original);
    // A browser that permits copying receives the complete payload; large drawings are not truncated.
    await source.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text) => {
            window.__copied = text;
          },
        },
        configurable: true,
      }),
    );
    const large = JSON.stringify({
      version: 1,
      strokes: [
        {
          color: "#28352f",
          width: 9,
          points: Array.from({ length: 15000 }, (_, i) => [i % 640, i % 440]),
        },
      ],
    });
    await seed(source, { "boring-lab-doodle-v1": large });
    await source.locator("#export-text").click();
    await source.waitForFunction(() =>
      document.querySelector("#text-copy-status").textContent.startsWith("已复制完整存档"),
    );
    assert.equal(
      await source.evaluate(() => window.__copied),
      await source.locator("#export-text-value").inputValue(),
    );
    const longText = await source.locator("#export-text-value").inputValue();
    assert.ok(longText.length > 100000);
    assert.equal(
      JSON.parse(longText).records.find((r) => r.key === "boring-lab-doodle-v1").value,
      large,
    );
    await source.locator("#copy-prepared-text").click();
    assert.equal(await source.evaluate(() => window.__copied), longText);
    await paste(longText);
    assert.equal(await dest.locator("#restore-items input").count(), 6);
    // Denied clipboard permissions fall back to manual selection without losing data.
    await source.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async () => {
            throw new DOMException("denied", "NotAllowedError");
          },
        },
        configurable: true,
      }),
    );
    await source.locator("#copy-prepared-text").click();
    await source.waitForFunction(() =>
      document.querySelector("#text-copy-status").textContent.includes("自动复制不可用"),
    );
    assert.equal(await source.locator("#export-text-value").inputValue(), longText);
    for (const width of [320, 390, 600, 1100]) {
      await dest.setViewportSize({ width, height: 844 });
      assert.equal(
        await dest.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        "overflow " + width,
      );
      await source.setViewportSize({ width, height: 844 });
      assert.equal(
        await source.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        "source overflow " + width,
      );
    }
    await source.setViewportSize({ width: 390, height: 844 });
    await source.screenshot({ path: ".qa/luggage-text-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
    await wechat.close();
    await external.close();
    console.log(
      "PASS: WeChat-like separate storage, six-record text transfer, clipboard missing/denied/success, manual selection, large drawings, safe preview/confirmation, invalid input, file compatibility and mobile layout at " +
        base,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
