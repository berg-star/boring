const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto((process.env.BASE_URL || "http://127.0.0.1:18080") + "/doodle.html");
    const result = await page.evaluate(() => {
      function trial(material) {
        const field = createDoodleSoft();
        field.reset(240, 200);
        field.material(material);
        field.hold(-90, -160, 70, 40);
        for (let i = 0; i < 60; i++) field.update(1 / 60);
        const near = field.map(-90, -160),
          far = field.map(120, 0);
        field.release();
        for (let i = 0; i < 240; i++) field.update(1 / 60);
        return { near, far, rest: field.map(-90, -160) };
      }
      const stress = createDoodleSoft();
      stress.reset(1, 1);
      for (let i = 0; i < 2000; i++) {
        stress.hold(0, 0, i % 2 ? 10000 : -10000, 10000);
        stress.update(0.032);
      }
      return { soft: trial("soft"), firm: trial("firm"), stress: stress.map(0, 0) };
    });
    assert.ok(result.soft.near[0] + 90 > result.firm.near[0] + 90);
    assert.ok(result.soft.near[0] + 90 > 5 * Math.abs(result.soft.far[0] - 120));
    assert.ok(Math.hypot(result.soft.rest[0] + 90, result.soft.rest[1] + 160) < 0.01);
    assert.ok(result.stress.every(Number.isFinite));
    await page.locator("#sample").click();
    const original = await page.evaluate(() => localStorage.getItem("boring-lab-doodle-v1"));
    await page.locator("#alive").click();
    await page.locator('[data-tool="press"]').click();
    await page.locator("#drawing").scrollIntoViewIfNeeded();
    const box = await page.locator("#drawing").boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + (box.height * 280) / 440;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(350);
    assert.match(await page.locator("#drawing").getAttribute("class"), /is-grabbed/);
    await page.screenshot({ path: ".qa/doodle-soft-press.png" });
    await page.mouse.up();
    await page.waitForTimeout(700);
    await page.locator('[data-tool="pull"]').click();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 70, y - 55, { steps: 5 });
    await page.waitForTimeout(70);
    await page.screenshot({ path: ".qa/doodle-soft-pull.png" });
    await page.mouse.up();
    await page.locator("#edit").click();
    assert.equal(await page.evaluate(() => localStorage.getItem("boring-lab-doodle-v1")), original);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: local displacement, material contrast, spring recovery, bounded stress, press/pull and original artwork preservation",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
