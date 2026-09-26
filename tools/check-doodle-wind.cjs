const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1100, height: 1000 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await p.goto((process.env.BASE_URL || "http://127.0.0.1:18080") + "/doodle.html");
    assert.equal(await p.locator('#toss,[data-motion="flop"],[data-motion="random"]').count(), 0);
    await p.locator('[data-preset="cup"]').click();
    assert.equal(await p.locator('[data-material="firm"]').getAttribute("aria-pressed"), "true");
    await p.locator('[data-preset="sock"]').click();
    await p.locator("#alive").click();
    const saved = await p.evaluate(() => localStorage.getItem("boring-lab-doodle-v1"));
    const physics = await p.evaluate(() => {
      const result = {};
      for (const material of ["soft", "firm", "paper"]) {
        const soft = createDoodleSoft();
        soft.reset(240, 200);
        soft.material(material);
        soft.wind(1);
        for (let i = 0; i < 60; i++) soft.update(1 / 60);
        result[material] = soft.map(0, -180)[0];
      }
      const field = createDoodleSoft();
      field.reset(240, 200);
      field.land(650);
      for (let i = 0; i < 3; i++) field.update(1 / 60);
      result.lower = field.map(100, -25)[0] - 100;
      result.upper = field.map(100, -175)[0] - 100;
      for (let i = 0; i < 240; i++) field.update(1 / 60);
      result.settled = field.map(100, -25)[0] - 100;
      field.inertia(-30, 20);
      field.update(0.032);
      result.drag = field.map(100, -100)[0] - 100;
      field.inertia(0, 0);
      for (let i = 0; i < 240; i++) field.update(1 / 60);
      result.dragSettled = field.map(100, -100)[0] - 100;
      const toy = createDoodleToy(document.createElement("canvas").getContext("2d"));
      toy.reset(240, 200);
      for (let i = 0; i < 600; i++) {
        toy.wind(1.6, 1 / 60);
        toy.update(1 / 60);
      }
      result.right = toy.pose().x;
      for (let i = 0; i < 600; i++) {
        toy.wind(-1.6, 1 / 60);
        toy.update(1 / 60);
      }
      result.left = toy.pose().x;
      return result;
    });
    assert.ok(physics.paper > physics.soft && physics.soft > physics.firm, JSON.stringify(physics));
    assert.ok(physics.lower > 0 && Math.abs(physics.upper) < 0.01);
    assert.ok(Math.abs(physics.settled) < 0.01 && Math.abs(physics.dragSettled) < 0.01);
    assert.ok(physics.drag < 0);
    assert.ok(physics.right > 400 && physics.right < 640 && physics.left < 230 && physics.left > 0);
    await p.locator('[data-tool="wind"]').click();
    await p.locator('[data-material="paper"]').click();
    await p.locator("#wind-power").selectOption("1.6");
    await p.locator("#wind-toggle").click();
    const pixels = () => p.locator("#drawing").evaluate((c) => c.toDataURL());
    const first = await pixels();
    await p.waitForTimeout(400);
    assert.notEqual(await pixels(), first);
    await p.locator("#wind-flip").click();
    await p.locator("#drawing").scrollIntoViewIfNeeded();
    await p.screenshot({ path: ".qa/doodle-wind.png" });
    await p.locator("#pause").click();
    assert.equal(await p.locator("#wind-toggle").getAttribute("aria-pressed"), "false");
    const frozen = await pixels();
    await p.waitForTimeout(150);
    assert.equal(await pixels(), frozen);
    assert.equal(await p.locator("#shake").isDisabled(), true);
    await p.locator("#pause").click();
    await p.locator("#shake").click();
    const shake = await pixels();
    await p.waitForTimeout(100);
    assert.notEqual(await pixels(), shake);
    await p.locator("#wind-toggle").click();
    await p.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(await p.locator("#wind-toggle").getAttribute("aria-pressed"), "false");
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.waitForFunction(() => document.getElementById("wind-toggle").disabled);
    assert.equal(await p.locator("#shake").isDisabled(), true);
    await p.locator("#edit").click();
    assert.equal(await p.evaluate(() => localStorage.getItem("boring-lab-doodle-v1")), saved);
    const m = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    m.on("pageerror", (e) => errors.push(e.message));
    await m.goto((process.env.BASE_URL || "http://127.0.0.1:18080") + "/doodle.html");
    await m.locator('[data-preset="octopus"]').click();
    await m.locator("#alive").click();
    await m.locator('[data-tool="wind"]').click();
    await m.locator("#drawing").scrollIntoViewIfNeeded();
    const box = await m.locator("#drawing").boundingBox(),
      cdp = await m.context().newCDPSession(m);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + 40, y: box.y + 100 }],
    });
    assert.equal(await m.locator("#wind-toggle").getAttribute("aria-pressed"), "true");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: box.x + 80, y: box.y + 140 }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    assert.equal(await m.locator("#wind-toggle").getAttribute("aria-pressed"), "false");
    await m.screenshot({ path: ".qa/doodle-wind-mobile.png", fullPage: true });
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(
      "PASS: wind force/direction/bounds, three materials, delayed local landing, inertia/recovery, shake, touch cancellation, pause/blur/reduced motion, removed controls, presets and draft preservation",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
