// Focused PWA acceptance: run against an actual Crow server, not a mocked page.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = (process.env.BASE_URL || "http://127.0.0.1:18080").replace(/\/$/, "");
const origin = new URL(base).origin;
const prefix = "boring-lab-pwa-";
const pages = fs.readdirSync("static").filter((name) => name.endsWith(".html"));
(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const qaRoot = path.resolve(".qa");
  const profile = fs.mkdtempSync(path.join(qaRoot, "pwa-profile-"));
  const browser = await chromium.launchPersistentContext(profile, {
    headless: true,
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: "chrome" }),
  });
  try {
    const context = browser;
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/");
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, {}, { timeout: 30000 });
    assert.equal(await page.evaluate(() => isSecureContext), true);
    const registration = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return { scope: r.scope, script: r.active.scriptURL, state: r.active.state };
    });
    assert.deepEqual(registration, {
      scope: origin + "/",
      script: origin + "/sw.js",
      state: "activated",
    });
    const api = context.request;
    const response = await api.get(base + "/manifest.json");
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-type"], /application\/manifest\+json/);
    const manifest = await response.json();
    assert.equal(manifest.name, "无聊研究所");
    assert.equal(manifest.short_name, "无聊研究所");
    assert.equal(manifest.id, "/");
    assert.equal(manifest.start_url, "/");
    assert.equal(manifest.scope, "/");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.prefer_related_applications, false);
    assert.equal(manifest.theme_color, "#121414");
    for (const size of [192, 512])
      assert.ok(manifest.icons.some((i) => i.sizes === `${size}x${size}` && i.purpose === "any"));
    assert.ok(manifest.icons.some((i) => i.purpose === "maskable"));
    for (const icon of [
      ...manifest.icons,
      { src: "/static/apple-touch-icon.png", sizes: "180x180" },
    ]) {
      const r = await api.get(base + icon.src);
      assert.equal(r.status(), 200);
      assert.match(r.headers()["content-type"], /image\/png/);
      const buffer = await r.body();
      const size = Number(icon.sizes.split("x")[0]);
      assert.equal(buffer.readUInt32BE(16), size);
      assert.equal(buffer.readUInt32BE(20), size);
    }
    const sw = await api.get(base + "/sw.js");
    assert.equal(sw.status(), 200);
    assert.match(sw.headers()["content-type"], /javascript/);
    assert.equal(sw.headers()["service-worker-allowed"], "/");
    assert.equal(sw.headers()["cache-control"], "no-cache");
    const cdp = await context.newCDPSession(page);
    const parsed = await cdp.send("Page.getAppManifest");
    assert.equal(parsed.url, origin + "/manifest.json");
    assert.deepEqual(parsed.errors, []);
    const installability = await cdp.send("Page.getInstallabilityErrors");
    assert.deepEqual(installability.installabilityErrors, [], JSON.stringify(installability));
    const cacheKeys = () =>
      page.evaluate(async (prefix) => {
        const names = (await caches.keys()).filter((n) => n.startsWith(prefix));
        return (
          await Promise.all(
            names.map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)),
          )
        ).flat();
      }, prefix);
    let keys = await cacheKeys();
    assert.ok(keys.includes(origin + "/"));
    assert.ok(keys.includes(origin + "/offline.html"));
    for (const name of pages.filter((n) => n !== "index.html"))
      assert.ok(keys.includes(origin + "/" + name));
    assert.ok(
      keys.every((url) => !/\/(api|ws)\/|\/healthz|\?/.test(url)),
      "only static clean paths are cached",
    );
    await page.evaluate(() => localStorage.setItem("pwa-test-record", "keep-me"));
    // A stale cached asset must never win over an available network response.
    await page.evaluate(async (prefix) => {
      const name = (await caches.keys()).find((n) => n.startsWith(prefix));
      await (await caches.open(name)).put("/static/pwa.css", new Response("STALE_PWA_CSS"));
    }, prefix);
    assert.ok(
      (await page.evaluate(async () => (await fetch("/static/pwa.css")).text())).includes(
        "safe-area-inset",
      ),
    );
    await page.evaluate(async () => {
      await fetch("/api/questions");
      await fetch("/healthz");
    });
    assert.ok((await cacheKeys()).every((url) => !/\/(api|ws)\/|\/healthz/.test(url)));

    // WebSocket auth and authoritative scores remain live while the page is SW controlled.
    const sync = await page.evaluate(async () => {
      const post = async (path, body) =>
        (
          await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        ).json();
      const host = await post("/api/tug/rooms", {});
      const guest = await post("/api/tug/join", { room: host.room });
      return new Promise((resolve, reject) => {
        const states = [null, null];
        const ws = [host, guest].map(
          (id) =>
            new WebSocket(
              `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/tug`,
            ),
        );
        let ready = false,
          pulled = false;
        const timeout = setTimeout(() => {
          ws.forEach((s) => s.close());
          reject(Error("WebSocket test timeout"));
        }, 12000);
        ws.forEach((socket, index) => {
          socket.onopen = () =>
            socket.send(
              JSON.stringify({ type: "auth", room: host.room, token: [host, guest][index].token }),
            );
          socket.onmessage = (event) => {
            const state = JSON.parse(event.data);
            if (state.type !== "state") return;
            states[index] = state;
            if (!ready && states.every((s) => s?.leftConnected && s?.rightConnected)) {
              ready = true;
              ws.forEach((s) => s.send('{"type":"ready"}'));
            }
            if (!pulled && states.every((s) => s?.phase === "running")) {
              pulled = true;
              ws[0].send('{"type":"pull"}');
            }
            if (pulled && states.every((s) => s?.left === 1)) {
              clearTimeout(timeout);
              ws[0].send('{"type":"leave"}');
              ws.forEach((s) => s.close());
              resolve(states.map((s) => s.left));
            }
          };
          socket.onerror = () => {
            clearTimeout(timeout);
            ws.forEach((s) => s.close());
            reject(Error("WebSocket error"));
          };
        });
      });
    });
    assert.deepEqual(sync, [1, 1]);
    assert.ok((await cacheKeys()).every((url) => !/\/(api|ws)\//.test(url)));

    await context.setOffline(true);
    await page.goto(base + "/wheel.html");
    await page.waitForFunction(
      () => !!document.querySelector("#spin") && !document.querySelector("#spin").disabled,
    );
    // Transport emulation may leave the OS connectivity flag online; verify that UI separately.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      dispatchEvent(new Event("offline"));
    });
    assert.equal(await page.locator(".pwa-network-note").isVisible(), true);
    await page.locator("#spin").click();
    await page.waitForFunction(() => !document.querySelector("#spin").disabled);
    assert.ok((await page.locator("#wheel-result").textContent()).trim());
    assert.equal(await page.evaluate(() => localStorage.getItem("pwa-test-record")), "keep-me");
    for (const path of ["/api/questions", "/healthz"]) {
      assert.equal(
        await page.evaluate(async (path) => {
          try {
            await fetch(path);
            return false;
          } catch {
            return true;
          }
        }, path),
        true,
        "network-only data must fail offline",
      );
    }
    assert.equal(
      await page.evaluate(async () => {
        try {
          await fetch("/api/tug/rooms", { method: "POST" });
          return false;
        } catch {
          return true;
        }
      }),
      true,
    );
    await page.goto(base + "/tug-online.html?room=ABC234");
    assert.equal(await page.locator("#online-code").inputValue(), "ABC234");
    // Transport emulation may leave the OS connectivity flag online; verify that UI separately.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      dispatchEvent(new Event("offline"));
    });
    assert.equal(await page.locator(".pwa-network-note").isVisible(), true);
    await page.goto(base + "/static/wheel.html");
    assert.equal(
      await page.locator("#spin").count(),
      1,
      "static alias uses the canonical page cache",
    );
    await page.goto(base + "/not-a-cached-page");
    assert.match(await page.title(), /暂时离线/);
    await context.setOffline(false);
    await page.goto(base + "/");
    assert.equal(await page.locator(".pwa-network-note").isVisible(), false);
    // Test the optional in-page install UI without invoking the OS installer in CI.
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = async () => {
        window.pwaPromptCalls = (window.pwaPromptCalls || 0) + 1;
      };
      event.userChoice = Promise.resolve({ outcome: "dismissed" });
      dispatchEvent(event);
      document.querySelector("#pwa-install").click();
    });
    await page.waitForFunction(() =>
      document.querySelector("#pwa-install-feedback").textContent.includes("稍后"),
    );
    assert.equal(await page.evaluate(() => window.pwaPromptCalls), 1);
    assert.match(await page.locator("#pwa-install-feedback").textContent(), /稍后/);

    for (const [width, height] of [
      [320, 900],
      [390, 844],
      [844, 390],
      [1440, 1000],
    ]) {
      await page.setViewportSize({ width, height });
      for (const name of pages) {
        await page.goto(base + "/" + name);
        assert.equal(
          await page.locator("link[rel=manifest]").getAttribute("href"),
          "/manifest.json",
          name,
        );
        assert.match(
          await page.locator("meta[name=viewport]").getAttribute("content"),
          /viewport-fit=cover/,
        );
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${name} overflow at ${width}`,
        );
        if (width <= 600) {
          const small = await page.evaluate(() =>
            [...document.querySelectorAll("button")]
              .filter((b) => !b.hidden && b.getClientRects().length && !b.closest("[hidden]"))
              .map((b) => ({
                id: b.id || b.textContent.trim(),
                rect: b.getBoundingClientRect().toJSON(),
              }))
              .filter((b) => b.rect.height < 43.5 || b.rect.width < 43.5),
          );
          assert.deepEqual(small, [], `${name} small touch target at ${width}`);
        }
      }
      if (width === 390) {
        await page.goto(base + "/");
        await page.screenshot({ path: ".qa/pwa-home-mobile.png", fullPage: true });
        await page.goto(base + "/doodle.html");
        await page.screenshot({ path: ".qa/pwa-doodle-mobile.png", fullPage: true });
      }
    }
    await page.goto(base + "/tug-online.html");
    await page.evaluate(() => {
      window.pwaRuntimeMarker = "still-playing";
    });
    await page.evaluate(() =>
      navigator.serviceWorker.register("/sw.js?update-test=1", { scope: "/" }),
    );
    await page.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration("/")).waiting,
    );
    assert.equal(await page.evaluate(() => window.pwaRuntimeMarker), "still-playing");
    assert.equal(
      await page.evaluate(() => navigator.serviceWorker.controller.scriptURL),
      origin + "/sw.js",
    );
    assert.equal(await page.evaluate(() => localStorage.getItem("pwa-test-record")), "keep-me");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: PWA installability, scope, icons, static/offline cache, network-only APIs, live WebSockets, waiting updates and mobile/desktop layout at " +
        base,
    );
  } finally {
    await browser.close();
    // Delete only the fresh disposable profile created by this check.
    if (
      path.resolve(profile).startsWith(qaRoot + path.sep) &&
      path.basename(profile).startsWith("pwa-profile-")
    )
      fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
