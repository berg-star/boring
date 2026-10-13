const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = (process.env.BASE_URL || 'http://127.0.0.1:18080').replace(/\/$/, '');
(async () => {
  fs.mkdirSync('.qa', { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
  try {
    const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })));
    const host = await contexts[0].newPage();
    let guest = await contexts[1].newPage();
    const errors = [], states = new Map();
    function monitor(page) {
      page.on('pageerror', e => errors.push(e.message));
      page.on('websocket', ws => ws.on('framereceived', event => {
        try { const s = JSON.parse(event.payload); if (s.type === 'state') states.set(page, s); } catch {}
      }));
    }
    monitor(host); monitor(guest);
    // Test-only socket handle, to exercise the local disconnect UI against the actual server.
    await host.addInitScript(() => {
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(...args) { super(...args); window.__qaSocket = this; }
      };
    });
    const board = host.locator('#light-board');
    const phase = async (page, value) => page.waitForFunction(v => document.querySelector('#light-board').dataset.phase === v, value);
    await host.goto(base + '/light-online.html');
    await host.locator('#light-create').tap();
    await host.waitForFunction(() => document.querySelector('#light-board').dataset.run);
    const link = await host.locator('#light-share-link').inputValue();
    const code = await host.locator('#light-room-code').textContent();
    assert.match(link, new RegExp('room=' + code));
    assert.equal(await host.locator('#light-ready').isDisabled(), true);
    await guest.goto(link);
    assert.equal(await guest.locator('#light-code').inputValue(), code);
    await guest.locator('#light-join-form button').tap();
    for (const page of [host, guest]) await page.waitForFunction(() => !document.querySelector('#light-ready').disabled);
    await host.locator('#light-ready').tap();
    assert.equal(await board.getAttribute('data-phase'), 'waiting');
    await guest.locator('#light-ready').tap();
    await phase(host, 'countdown');
    assert.equal(await host.locator('#light-left').isDisabled(), true);
    assert.equal(await host.locator('#light-room-info').evaluate(e => e.open), false);
    await phase(host, 'running'); await phase(guest, 'running');
    await host.locator('#light-right').tap();
    await host.waitForFunction(() => document.querySelector('#light-heading').textContent === '→');
    assert.equal(states.get(host).ack, 1, 'one touch produces exactly one turn');
    await guest.close();
    await phase(host, 'paused');
    const saved = states.get(host);
    assert.equal(await host.locator('#light-left').isDisabled(), true);
    await host.waitForTimeout(450);
    assert.equal(states.get(host).step, saved.step);
    // Paused match affords time to exercise palettes and viewports without gameplay timing assumptions.
    await host.setViewportSize({ width: 1440, height: 900 });
    for (const theme of ['lime', 'cream', 'violet', 'ocean']) {
      await host.locator('.theme-trigger').tap();
      await host.locator(`[data-theme-choice="${theme}"]`).tap();
      await host.locator('.theme-close').tap();
      for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await host.setViewportSize(size);
        await host.evaluate(() => scrollTo(0, 0));
        assert.equal(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, theme + JSON.stringify(size));
        for (const id of ['light-left', 'light-right', 'light-leave']) {
          const bounds = await host.locator('#' + id).boundingBox();
          if (bounds.y + bounds.height > size.height) await host.screenshot({ path: '.qa/light-layout-failure.png' });
          assert.ok(bounds.width >= 44 && bounds.height >= 44, id);
          assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= size.height, id + ' accessible without scrolling ' + theme + JSON.stringify(size) + JSON.stringify(bounds));
        }
        assert.equal(await board.getAttribute('data-step'), String(saved.step));
      }
      await host.setViewportSize({ width: 1440, height: 900 });
    }
    await host.setViewportSize({ width: 390, height: 844 });
    await host.locator('#light-sound').tap();
    assert.equal(await host.locator('#light-sound').getAttribute('aria-pressed'), 'false');
    await host.screenshot({ path: '.qa/light-mobile.png' });
    guest = await contexts[1].newPage(); monitor(guest); await guest.goto(link);
    await phase(host, 'countdown'); await phase(guest, 'countdown');
    assert.equal(await board.getAttribute('data-step'), String(saved.step));
    assert.equal(states.get(guest).trail, saved.trail);
    await phase(host, 'running'); await phase(guest, 'running');
    // Keyboard drives the same relative-turn protocol as touch.
    await host.keyboard.press('ArrowLeft');
    await host.waitForFunction(() => document.querySelector('#light-heading').textContent === '↑');
    await host.evaluate(() => window.__qaSocket.close());
    await phase(guest, 'paused');
    const held = states.get(guest);
    await host.setViewportSize({ width: 320, height: 568 });
    await host.evaluate(() => scrollTo(0, 0));
    await host.waitForFunction(() => !document.querySelector('#light-reconnect').hidden);
    assert.equal(await host.locator('#light-left').isVisible(), false);
    const reconnectBounds = await host.locator('#light-reconnect').boundingBox();
    assert.ok(reconnectBounds.y + reconnectBounds.height <= 568, 'reconnect stays visible on a short phone');
    await host.locator('#light-reconnect').tap();
    await phase(host, 'countdown'); await phase(guest, 'countdown');
    assert.equal(states.get(host).trail, held.trail);
    await phase(host, 'running'); await phase(guest, 'running');
    await host.setViewportSize({ width: 390, height: 844 });
    await phase(host, 'finished'); await phase(guest, 'finished');
    assert.equal(states.get(host).winner, states.get(guest).winner);
    assert.equal(states.get(host).trail, states.get(guest).trail);
    const run = states.get(host).run;
    await host.locator('#light-ready').tap(); await guest.locator('#light-ready').tap();
    await phase(host, 'countdown');
    assert.ok(states.get(host).run > run && states.get(host).swapped);
    assert.equal(await host.locator('#light-heading').textContent(), '↓');
    await phase(host, 'running');
    await host.screenshot({ path: '.qa/light-running.png' });
    await phase(host, 'finished'); await phase(guest, 'finished');
    assert.equal(states.get(host).winner, -1);
    assert.match(await host.locator('#light-overlay-title').textContent(), /平局/);
    await host.setViewportSize({ width: 320, height: 568 });
    await host.evaluate(() => scrollTo(0, 0));
    const readyBounds = await host.locator('#light-ready').boundingBox();
    assert.ok(readyBounds.y + readyBounds.height <= 568, 'rematch button remains beside the result');
    await guest.locator('#light-leave').tap(); await phase(host, 'waiting');
    await host.locator('#light-leave').tap();
    await host.goto(base + '/luggage.html');
    await host.locator('#export-text').tap();
    await host.waitForFunction(() => document.querySelector('#export-text-value').value.length > 0);
    const records = JSON.parse(await host.locator('#export-text-value').inputValue()).records;
    assert.ok(records.some(r => r.key === 'boring-lab-light-sound' && r.value === 'off'));
    assert.ok(JSON.parse(records.find(r => r.key === 'boring-lab-achievements-v1').value).visits.includes('light-online'));
    assert.ok(!records.some(r => r.key === 'boring-lab-light-online-v1'));
    await host.goto(base + '/light-online.html');
    assert.equal(await host.locator('#light-sound').getAttribute('aria-pressed'), 'false');
    await host.waitForFunction(() => !!navigator.serviceWorker.controller);
    await contexts[0].setOffline(true); await host.reload();
    await host.locator('#light-create').tap();
    await host.waitForFunction(() => !document.querySelector('#light-error').hidden);
    assert.match(await host.locator('#light-error').textContent(), /检查网络/);
    await contexts[0].setOffline(false);
    assert.deepEqual(errors, []);
    console.log('PASS: touch/keyboard steering, preserved reconnect, exchanged starts, shared draw, four themes, 320px portrait/landscape controls, sound/luggage and offline shell at ' + base);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
