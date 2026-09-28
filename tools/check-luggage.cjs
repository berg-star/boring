const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080";
const marker = "boring-lab-restore-notice-v1";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/luggage.html");
    assert.equal(await page.locator("#luggage-count").innerText(), "可以带走 0 项记录");
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
    const fixtures = {
      "boring-lab-pet-v1": JSON.stringify({
        version: 1,
        name: "旅行小圆",
        color: 1,
        shape: 2,
        personality: 0,
        food: 65,
        joy: 75,
        weight: 25,
        born: now - 86400000,
        updated: now,
        awayUntil: 0,
      }),
      "boring-lab-cards-v1": JSON.stringify({
        version: 1,
        owned: ["relax-01", "funny-15"],
        favorites: ["funny-15"],
      }),
      "boring-lab-planet-v1": JSON.stringify({
        version: 1,
        trees: [],
        ponds: [],
        residents: ["#f5cb8e", "#e8a7ad", "#b7a8e7", "#d5e9aa", "#99d9ce"].map((color) => ({
          p: { x: 1, y: 0, z: 0 },
          color,
        })),
        night: true,
        yaw: 0.5,
        pitch: 0,
      }),
      "boring-lab-doodle-v1": JSON.stringify({ version: 1, strokes: [stroke] }),
      "boring-lab-doodle-shelf-v1": JSON.stringify({
        version: 1,
        items: [{ id: "trip-one", name: "三笔旅行者", created: now, strokes: [stroke] }],
      }),
      "boring-lab-achievements-v1": JSON.stringify({
        version: 1,
        visits: ["pet"],
        kinds: [],
        wheelMs: 0,
        spins: 1,
        cards: 2,
        skips: 0,
        trees: 0,
        books: 0,
        early: false,
        fast: false,
        named: true,
        unlocked: { keeper: now },
      }),
      "boring-lab-wheel-v1": JSON.stringify({
        version: 1,
        scene: "drink",
        brand: "custom-trip",
        custom: [{ id: "custom-trip", name: "旅行茶馆" }],
        lists: {
          "drink:custom-trip": [
            { text: "云朵茶", on: true },
            { text: "树叶水", on: true },
          ],
        },
      }),
      "boring-lab-smash-settings-v1": JSON.stringify({
        sound: false,
        vibration: false,
        regenerate: true,
      }),
      "boring-lab-planet-sound": "off",
      "boring-lab-book-sound": "off",
    };
    const seed = async (p, values) =>
      p.evaluate((values) => {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      }, values);
    const snapshot = async (p, keys = Object.keys(fixtures)) =>
      p.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), keys);
    await seed(page, { ...fixtures, unrelated: "private", [marker]: "ignored" });
    await page.reload();
    assert.equal(await page.locator("[data-state=ready]").count(), 10);
    const download = page.waitForEvent("download");
    await page.locator("#export-luggage").click();
    const text = await fs.readFile(await (await download).path(), "utf8"),
      archive = JSON.parse(text);
    assert.equal(archive.records.length, 10);
    assert.deepEqual(Object.fromEntries(archive.records.map((r) => [r.key, r.value])), fixtures);
    const fresh = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      }),
      p = await fresh.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/luggage.html");
    const upload = async (data) => {
      await p.locator("#import-file").setInputFiles({
        name: "travel.json",
        mimeType: "application/json",
        buffer: Buffer.from(typeof data === "string" ? data : JSON.stringify(data)),
      });
      await p.waitForFunction(
        () => !document.querySelector("#luggage-status").textContent.includes("正在检查"),
      );
    };
    const restore = async () => {
      await p.locator("#review-restore").click();
      await p.locator("#apply-restore").click();
      await p.waitForFunction(
        () =>
          !document.querySelector("#restore-success").hidden ||
          /失败|未能|发生变化/.test(document.querySelector("#luggage-status").textContent),
      );
    };
    await upload(text);
    assert.equal(await p.locator("#restore-items input").count(), 10);
    assert.ok(Object.values(await snapshot(p)).every((v) => v === null));
    await p.locator("#cancel-import").click();
    assert.ok(Object.values(await snapshot(p)).every((v) => v === null));
    await upload(text);
    await p.locator("#review-restore").click();
    await p.locator("#cancel-confirm").click();
    assert.ok(Object.values(await snapshot(p)).every((v) => v === null));
    await restore();
    assert.deepEqual(await snapshot(p), fixtures);
    // Partial restoration preserves unchecked and absent records.
    const changedPet = JSON.stringify({
      ...JSON.parse(fixtures["boring-lab-pet-v1"]),
      name: "留在本地",
    });
    const localCards = JSON.stringify({ version: 1, owned: ["idea-02"], favorites: [] });
    await seed(p, {
      "boring-lab-pet-v1": changedPet,
      "boring-lab-cards-v1": localCards,
      unrelated: "keep",
    });
    await upload(text);
    for (const input of await p.locator("#restore-items input").all()) await input.uncheck();
    await p.locator("#restore-items input").first().check();
    await restore();
    assert.deepEqual(await snapshot(p), { ...fixtures, "boring-lab-cards-v1": localCards });
    assert.equal(await p.evaluate(() => localStorage.getItem("unrelated")), "keep");
    // Legacy single-pet backups, no other state touched.
    await upload(changedPet);
    assert.equal(await p.locator("#restore-items input").count(), 1);
    await restore();
    assert.equal((await snapshot(p))["boring-lab-pet-v1"], changedPet);
    const safe = await snapshot(p);
    const badCases = [
      "{",
      { ...archive, version: 999 },
      { ...archive, format: "another-site" },
      { ...archive, records: [{ key: "__proto__", value: "{}" }] },
      { ...archive, records: [archive.records[0], archive.records[0]] },
      {
        ...archive,
        records: [
          archive.records[0],
          { key: "boring-lab-cards-v1", value: '{"version":1,"owned":["fake"],"favorites":[]}' },
        ],
      },
      {
        ...archive,
        records: [
          {
            key: "boring-lab-doodle-v1",
            value: '{"version":1,"strokes":[{"color":"#28352f","width":9,"points":[[9999,0]]}]}',
          },
        ],
      },
      " ".repeat(8 * 1024 * 1024 + 1),
    ];
    for (const bad of badCases) {
      await upload(bad);
      assert.equal(await p.locator("#restore-preview").isVisible(), false);
      assert.deepEqual(await snapshot(p), safe);
      assert.match(await p.locator("#luggage-status").innerText(), /当前记录没有改变/);
    }
    // Stale preview must ask for a fresh confirmation.
    await upload(text);
    await seed(p, { "boring-lab-pet-v1": fixtures["boring-lab-pet-v1"] });
    await restore();
    assert.match(await p.locator("#luggage-status").innerText(), /发生变化/);
    assert.equal(await p.locator("#restore-confirmation").isVisible(), false);
    // A mid-write failure rolls back both replacements and newly created keys.
    await p.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        "boring-lab-pet-v1",
        JSON.stringify({
          version: 1,
          name: "留下来",
          color: 0,
          shape: 0,
          personality: 0,
          food: 55,
          joy: 55,
          weight: 20,
          born: Date.now(),
          updated: Date.now(),
          awayUntil: 0,
        }),
      );
    });
    const before = await snapshot(p);
    await upload(text);
    await p.evaluate(() => {
      const original = Storage.prototype.setItem;
      let calls = 0;
      Storage.prototype.setItem = function (key, value) {
        if (key !== "boring-lab-restore-notice-v1" && ++calls === 2) {
          Storage.prototype.setItem = original;
          throw new DOMException("test quota", "QuotaExceededError");
        }
        return original.call(this, key, value);
      };
    });
    await restore();
    assert.deepEqual(await snapshot(p), before);
    assert.match(await p.locator("#luggage-status").innerText(), /保留恢复前/);
    await upload(text);
    await restore();
    assert.deepEqual(await snapshot(p), fixtures);
    // An already open game pauses saves during restoration, then reloads.
    const pet = await fresh.newPage();
    await pet.goto(base + "/pet.html");
    const old = await pet.locator("#pet-name").innerText();
    await p.evaluate(
      (key) => localStorage.setItem(key, JSON.stringify({ id: "pause-test", phase: "restoring" })),
      marker,
    );
    await pet.waitForFunction(() => !window.BoringStorage.canWrite());
    const paused = await snapshot(p);
    await pet.locator("#feed").click();
    assert.deepEqual(await snapshot(p), paused);
    const incoming = JSON.stringify({
      ...JSON.parse(fixtures["boring-lab-pet-v1"]),
      name: "新搬来的",
    });
    await seed(p, { "boring-lab-pet-v1": incoming });
    const reloaded = pet.waitForEvent("load");
    await p.evaluate(
      (key) => localStorage.setItem(key, JSON.stringify({ id: "pause-test", phase: "complete" })),
      marker,
    );
    await reloaded;
    assert.equal(await pet.locator("#pet-name").innerText(), "新搬来的");
    assert.notEqual(old, "新搬来的");
    await pet.close();
    // Real import reloads already open planet and doodle pages with their new state.
    const planet = await fresh.newPage(),
      doodle = await fresh.newPage();
    await planet.goto(base + "/planet.html");
    await doodle.goto(base + "/doodle.html");
    const actual = structuredClone(archive);
    actual.records.find((r) => r.key === "boring-lab-planet-v1").value = JSON.stringify({
      ...JSON.parse(fixtures["boring-lab-planet-v1"]),
      night: false,
    });
    const newDrawing = JSON.stringify({
      version: 1,
      strokes: [
        stroke,
        {
          ...stroke,
          points: [
            [100, 100],
            [150, 170],
          ],
        },
      ],
    });
    actual.records.find((r) => r.key === "boring-lab-doodle-v1").value = newDrawing;
    await upload(actual);
    const loadedPlanet = planet.waitForEvent("load"),
      loadedDoodle = doodle.waitForEvent("load");
    await restore();
    await Promise.all([loadedPlanet, loadedDoodle]);
    assert.equal(JSON.parse((await snapshot(p))["boring-lab-planet-v1"]).night, false);
    assert.equal((await snapshot(p))["boring-lab-doodle-v1"], newDrawing);
    await planet.close();
    await doodle.close();
    // Open the restored games, confirm records are accepted by their own loaders.
    for (const game of ["card", "planet", "doodle", "wheel", "smash", "achievements", "book"]) {
      const gamePage = await fresh.newPage();
      gamePage.on("pageerror", (e) => errors.push(e.message));
      await gamePage.goto(base + "/" + game + ".html");
      await gamePage.waitForTimeout(150);
      assert.equal(await gamePage.locator("footer .luggage-link").count(), 1);
      if (game === "wheel")
        assert.equal(await gamePage.locator("#brand").inputValue(), "custom-trip");
      if (game === "doodle") assert.equal(await gamePage.locator(".doodle-art").count(), 1);
      await gamePage.close();
    }
    // Corrupted local records remain intact and are explicitly excluded from export.
    await seed(p, { "boring-lab-cards-v1": "broken" });
    await p.reload();
    assert.equal(await p.locator("[data-state=invalid]").count(), 1);
    const next = p.waitForEvent("download");
    await p.locator("#export-luggage").click();
    const exported = JSON.parse(await fs.readFile(await (await next).path(), "utf8"));
    assert.ok(!exported.records.some((r) => r.key === "boring-lab-cards-v1"));
    assert.equal((await snapshot(p))["boring-lab-cards-v1"], "broken");
    for (const width of [320, 390, 600, 1100]) {
      await p.setViewportSize({ width, height: 844 });
      await upload(text);
      await p.locator("#review-restore").click();
      assert.equal(
        await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        "overflow " + width,
      );
      if (width === 390) await p.screenshot({ path: ".qa/luggage-mobile.png", fullPage: true });
    }
    await p.goto(base + "/");
    assert.equal(await p.locator(".section-head .luggage-link").count(), 1);
    await p.setViewportSize({ width: 320, height: 844 });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    // Browsers denying local storage show a clear fallback without throwing.
    const denied = await browser.newContext();
    await denied.addInitScript(() => {
      Storage.prototype.getItem = function () {
        throw new DOMException("denied", "SecurityError");
      };
      Storage.prototype.setItem = function () {
        throw new DOMException("denied", "SecurityError");
      };
    });
    const d = await denied.newPage();
    d.on("pageerror", (e) => errors.push(e.message));
    await d.goto(base + "/luggage.html");
    assert.match(await d.locator("#luggage-count").innerText(), /无法读取/);
    assert.equal(await d.locator("#export-luggage").isDisabled(), true);
    await denied.close();
    assert.deepEqual(errors, []);
    await context.close();
    await fresh.close();
    console.log(
      "PASS: ten-record export, fresh-browser restore, selection, cancel, legacy, invalid files, stale preview, rollback, cross-tab protection, game compatibility and responsive layout at " +
        base,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
