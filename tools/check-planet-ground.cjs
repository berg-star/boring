const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const base = process.env.TEST_BASE || "http://127.0.0.1:18080";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const p = await browser.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    // Expose actual loaded functions only inside this isolated test browser.
    await p.route("**/static/planet.js", async (route) => {
      const response = await route.fetch();
      let source = await response.text();
      assert.ok(source.includes("  resize();"));
      source = source.replace(
        "  resize();",
        "window.groundQA={land,dry,near,normalize,point,simulate,act,repairGround,trees,residents,ponds,saveWorld,clearPath,tool(value){tool=value;},rain(p){wet(p);},view(){return {yaw,pitch}}}; resize();",
      );
      await route.fulfill({ response, body: source });
    });
    await p.goto(base + "/planet.html");
    const result = await p.evaluate(() => {
      const q = groundQA,
        water = { x: 0, y: 0, z: 1 };
      const initial = q.residents.every((r) => q.dry(r.p)) && q.trees.every(q.dry);
      q.tool("tree");
      const count = q.trees.length;
      q.act(water);
      const rejected = q.trees.length === count;
      q.trees.push({ ...water, type: "lamp", growth: 1 });
      q.residents.forEach((r) => (r.p = { ...water }));
      q.repairGround();
      const migrated =
        q.residents.every((r) => q.dry(r.p)) &&
        q.trees.every(q.dry) &&
        q.trees.at(-1).type === "lamp" &&
        q.trees.at(-1).growth === 1;
      let crossings = 0,
        moved = 0;
      for (let i = 0; i < 3000; i++) {
        if (i % 250 === 0) q.rain(q.residents[(i / 250) % 5 | 0].p);
        const before = q.residents.map((r) => ({ ...r.p }));
        q.simulate(0.05, performance.now() + i * 50);
        q.residents.forEach((r, j) => {
          if (!q.dry(r.p) || !q.clearPath(before[j], r.p)) crossings++;
          if (q.near(before[j], r.p) > 1e-6) moved++;
        });
      }
      q.saveWorld();
      return { initial, rejected, migrated, crossings, moved, plantsDry: q.trees.every(q.dry) };
    });
    assert.ok(result.initial);
    assert.ok(result.rejected);
    assert.ok(result.migrated);
    assert.equal(result.crossings, 0);
    assert.ok(result.moved > 50);
    assert.ok(result.plantsDry);
    await p.reload();
    assert.ok(
      await p.evaluate(
        () =>
          groundQA.residents.every((r) => groundQA.dry(r.p)) && groundQA.trees.every(groundQA.dry),
      ),
    );
    await p.evaluate(() => {
      const key = "boring-lab-planet-v1",
        s = JSON.parse(localStorage.getItem(key));
      s.yaw = 0;
      s.pitch = 0;
      localStorage.setItem(key, JSON.stringify(s));
    });
    await p.reload();
    await p.locator('[data-tool="tree"]').click();
    await p.locator("#planet").scrollIntoViewIfNeeded();
    const box = await p.locator("#planet").boundingBox();
    for (const kind of ["tree", "mushroom", "surprise"]) {
      await p.locator("#seed-kind").selectOption(kind);
      const before = await p.locator("#planet").getAttribute("data-tree-count");
      await p.mouse.click(box.x + box.width / 2, box.y + (box.height * 253) / 510);
      assert.equal(await p.locator("#planet").getAttribute("data-tree-count"), before);
      assert.match(await p.locator("#planet-message").innerText(), /水面或岸边/);
    }
    await p.screenshot({ path: ".qa/planet-ground.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: visible sea rejects all seeds, land-only spawns, legacy migration preserves plants, 150 simulated seconds of shore/pond avoidance, rain mushrooms stay dry, reload",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
