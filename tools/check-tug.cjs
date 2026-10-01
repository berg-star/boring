const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.BASE_URL || 'http://127.0.0.1:18080';
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:"chrome"})});
  try {
    const page = await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const clockStart = new Date();
    await page.clock.install({time:clockStart});
    await page.clock.pauseAt(clockStart);
    await page.goto(base+'/tug.html');
    const arena=page.locator('#tug-arena');
    const score=async side=>Number(await arena.getAttribute('data-'+side));
    const cdp=await page.context().newCDPSession(page);
    async function touch(ids=[0,1],end=true){
      await page.locator("#pull-left").scrollIntoViewIfNeeded();
      const points=[];
      for(let i=0;i<ids.length;i++){
        const r=await page.locator(ids[i]===0?'#pull-left':'#pull-right').boundingBox();
        points.push({x:r.x+r.width/2+i*3,y:r.y+r.height/2,id:i+1});
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
      if(end)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    const advance=ms=>page.clock.runFor(ms);
    async function begin(){await page.locator('#tug-start').click();await advance(3020);assert.equal(await arena.getAttribute('data-state'),'running');}
    await page.locator('#tug-fullscreen').evaluate(b=>b.hidden=true); // Layout tested independently of fullscreen support.
    await begin(); await advance(480);await touch();
    assert.equal(await score('left'),5);assert.equal(await score('right'),5);assert.equal(await arena.getAttribute('data-position'),'0');
    await touch();assert.equal(await score('left'),5); // Each side can score only once per beat.
    await advance(300);await touch([0]);assert.equal(await score('left'),5); // Outside rhythm window.
    await advance(550);await touch([0]);assert.equal(await score('left'),10);
    await page.locator('#tug-pause').click();const remaining=await page.locator('#tug-time').innerText();
    await advance(5000);assert.equal(await page.locator('#tug-time').innerText(),remaining);
    await page.locator('#tug-pause').click();await advance(850);await touch([1]);assert.equal(await score('right'),10);
    await page.locator('[data-mode=tap]').click();assert.equal(await arena.getAttribute('data-state'),'idle');await begin();
    await touch([0,0]);assert.equal(await score('left'),1); // Two fingers on the same team.
    await advance(100);await touch();assert.equal(await score('left'),2);assert.equal(await score('right'),1);
    await advance(100);await touch([1],false);await advance(1000);assert.equal(await score('right'),2); // Holding contributes only once.
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await advance(100);await touch([1]);assert.equal(await score('right'),3);
    await page.keyboard.down('a');await advance(100);await page.keyboard.down('a');await page.keyboard.up('a');assert.equal(await score('left'),3);
    await advance(20000);assert.equal(await arena.getAttribute('data-state'),'finished');assert.match(await page.locator('#tug-status').textContent(),/平局/);
    await begin();for(let i=0;i<40;i++){await advance(100);await touch([0]);}
    assert.equal(await arena.getAttribute('data-state'),'finished');assert.match(await page.locator('#tug-status').textContent(),/青柠队赢/);
    await touch([1]);assert.equal(await score('right'),0);
    await begin();await page.evaluate(()=>dispatchEvent(new Event('blur')));assert.equal(await arena.getAttribute('data-state'),'paused');
    await page.locator('#tug-pause').click();await advance(20000);assert.match(await page.locator('#tug-status').textContent(),/平局/);
    await page.locator('[data-mode=rhythm]').click();await begin();await advance(500);
    for(let i=0;i<8;i++){if(i)await advance(850);await touch([1]);}
    assert.equal(await arena.getAttribute('data-state'),'finished');assert.match(await page.locator('#tug-status').textContent(),/蓝莓队赢/);
    fs.mkdirSync('.qa',{recursive:true});
    await page.screenshot({path:'.qa/tug-landscape.png',fullPage:true});
    for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'.qa/tug-portrait.png',fullPage:true});
    await page.emulateMedia({reducedMotion:'reduce'});await begin();await advance(500);await touch();assert.equal(await score('left'),5);assert.equal(await score('right'),5);
    await page.locator('[data-mode=tap]').click();await begin();
    await page.locator('#pull-left').focus();await page.keyboard.down('Enter');await advance(100);await page.keyboard.down('Enter');await page.keyboard.up('Enter');assert.equal(await score('left'),1);
    await page.evaluate(()=>screen.orientation.dispatchEvent(new Event('change')));assert.equal(await arena.getAttribute('data-state'),'paused');
    await page.setViewportSize({width:844,height:390});await page.locator('#tug-fullscreen').evaluate(b=>b.hidden=false);
    await page.evaluate(()=>document.querySelector('.tug-room').requestFullscreen=()=>Promise.reject(new Error('Unsupported fullscreen')));
    await page.locator('#tug-fullscreen').click();
    await advance(100);
    assert.match(await page.locator('#tug-status').textContent(),/暂不支持全屏/);
    await page.screenshot({path:'.qa/tug-fullscreen.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: simultaneous two-touch, same-side multi-touch, canceled/held touches, keyboard hold, beat timing and no duplicate scoring, both wins, timeout tie, pause/resume and reset, 320/390/768 layout, reduced motion.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
