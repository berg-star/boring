const preparePlanet = require("./planet-test-ground.cjs");
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080",
  key = "boring-lab-planet-v1";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1000, height: 1000 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/planet.html");
    const initial = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    assert.equal(initial.residents.length, 5);
    const empty = {
      ...initial,
      trees: [],
      ponds: [],
      yaw: -Math.PI / 80,
      pitch: Math.PI * 0.15,
      night: false,
    };
    await p.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [key, empty]);
    await p.reload();
    await p.locator("#sound").click();
    const state = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    const click = async (x = 300, y = 253) => {
      await p.locator("#planet").scrollIntoViewIfNeeded();
      const b = await p.locator("#planet").boundingBox();
      await p.mouse.click(b.x + (x * b.width) / 600, b.y + (y * b.height) / 510);
    };
    await p.locator('[data-tool="tree"]').click();
    await click();
    assert.equal((await state()).trees.length, 1);
    assert.equal((await state()).trees[0].growth, 0);
    await click();
    assert.equal((await state()).trees.length, 1);
    assert.match(await p.locator("#planet-message").innerText(), /挤/);
    await p.locator('[data-tool="rain"]').click();
    for (let i = 0; i < 3; i++) await click();
    const grown = await state();
    assert.equal(grown.trees[0].growth, 2);
    assert.equal(grown.ponds[0].water, 3);
    assert.ok(grown.trees.every((t) => ["tree", "mushroom", "lamp"].includes(t.type)));
    await p.locator('[data-tool="dig"]').click();
    await click();
    assert.equal((await state()).trees.length, grown.trees.length - 1);
    assert.ok(await p.locator("#undo-plant").isVisible());
    await p.locator("#undo-plant").click();
    assert.equal((await state()).trees.length, grown.trees.length);
    await click();
    await p.reload();
    assert.equal((await state()).trees.length, grown.trees.length - 1);
    assert.equal((await state()).ponds[0].water, 3);
    await p.locator("#night").click();
    await p.reload();
    assert.equal(await p.locator("#night").getAttribute("aria-pressed"), "true");
    await p.locator("#night").click();
    await p.locator('[data-tool="rain"]').click();
    await p.locator("#planet").scrollIntoViewIfNeeded();
    const b = await p.locator("#planet").boundingBox(),
      pos = (x, y) => [b.x + (x * b.width) / 600, b.y + (y * b.height) / 510];
    const oldYaw = (await state()).yaw;
    await p.mouse.move(...pos(280, 180));
    await p.mouse.down();
    await p.mouse.move(...pos(330, 190), { steps: 8 });
    await p.mouse.up();
    assert.equal((await state()).yaw, oldYaw);
    await p.screenshot({ path: ".qa/planet-ecology.png", fullPage: true });
    await p.locator('[data-tool="dig"]').click();
    await click(0, 0);
    assert.match(await p.locator("#planet-message").innerText(), /星球/);
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.waitForTimeout(2800);
    const frozen = await p.locator("#planet").evaluate((c) => c.toDataURL());
    await p.waitForTimeout(200);
    assert.equal(await p.locator("#planet").evaluate((c) => c.toDataURL()), frozen);
    await p.evaluate((k) => localStorage.setItem(k, "broken"), key);
    await p.reload();
    assert.match(await p.locator("#planet-save").innerText(), /不覆盖/);
    await p.locator('[data-tool="rain"]').click();
    await click();
    assert.equal(await p.evaluate((k) => localStorage.getItem(k), key), "broken");
    for (const width of [320, 390, 768]) {
      await p.setViewportSize({ width, height: 844 });
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }

    const m = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    m.on("pageerror", (e) => errors.push(e.message));
    await m.goto(base + "/planet.html");
    await preparePlanet(m);
    await m.locator('[data-tool="tree"]').tap();
    await m.locator("#planet").scrollIntoViewIfNeeded();
    const mb = await m.locator("#planet").boundingBox();
    const touch = (x, y) => ({ x: mb.x + (x * mb.width) / 600, y: mb.y + (y * mb.height) / 510 });
    await m.touchscreen.tap(touch(300, 253).x, touch(300, 253).y);
    const count = Number(await m.locator("#planet").getAttribute("data-tree-count"));
    await m.locator('[data-tool="dig"]').tap();
    await m.locator("#planet").scrollIntoViewIfNeeded();
    const digbox = await m.locator("#planet").boundingBox();
    await m.touchscreen.tap(digbox.x + digbox.width / 2, digbox.y + (digbox.height * 253) / 510);
    assert.equal(Number(await m.locator("#planet").getAttribute("data-tree-count")), count - 1);
    await m.locator("#undo-plant").tap();
    assert.equal(Number(await m.locator("#planet").getAttribute("data-tree-count")), count);
    await m.locator('[data-tool="rain"]').tap();
    await m.locator("#planet").scrollIntoViewIfNeeded();
    const rb = await m.locator("#planet").boundingBox(),
      cdp = await m.context().newCDPSession(m);
    const rainBefore = await m.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: rb.x + rb.width / 2 + 20, y: rb.y + rb.height / 2 - 20 }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    assert.deepEqual(await m.evaluate((k) => JSON.parse(localStorage.getItem(k)), key), rainBefore);
    await m.screenshot({ path: ".qa/planet-ecology-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: persisted world, spacing, seed growth, ponds/mushrooms, removal/undo/reload, saved night, cloud drag, corrupt storage, reduced motion and responsive layout",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
