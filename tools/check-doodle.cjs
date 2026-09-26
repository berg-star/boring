const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:18080';
const key='boring-lab-doodle-v1';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base+'/doodle.html');await page.locator('#alive').click();assert.match(await page.locator('#doodle-error').innerText(),/先画/);
 await page.locator('#drawing').scrollIntoViewIfNeeded();const box=await page.locator('#drawing').boundingBox();await page.mouse.move(box.x+100,box.y+100);await page.mouse.down();await page.mouse.move(box.x+230,box.y+140,{steps:20});await page.mouse.up();
 const saved=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 assert.equal((await saved()).strokes.length,1);assert.ok((await saved()).strokes[0].points.length>2);
 await page.reload();assert.equal((await saved()).strokes.length,1);await page.locator('#undo').click();assert.equal((await saved()).strokes.length,0);
 await page.locator('#sample').click();assert.ok((await saved()).strokes.length>0);const original=JSON.stringify(await saved());await page.screenshot({path:'.qa/doodle-editor.png',fullPage:true});
 await page.locator('#alive').click();assert.equal(await page.locator('#paint-tools').isVisible(),false);
 const pixels=()=>page.locator('#drawing').evaluate(c=>c.toDataURL());
 for(const mode of ['jelly','jump','flop','random']){await page.locator('[data-motion='+mode+']').click();const a=await pixels();await page.waitForTimeout(180);assert.notEqual(await pixels(),a,mode+' moves');}
 await page.locator('#poke').click();assert.match(await page.locator('#doodle-speech').innerText(),/脾气/);
 await page.locator('#pause').click();const frozen=await pixels();await page.waitForTimeout(180);assert.equal(await pixels(),frozen);
 await page.locator('#edit').click();assert.equal(JSON.stringify(await saved()),original);await page.locator('#alive').click();await page.locator('#pause').click();await page.screenshot({path:'.qa/doodle-live.png',fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.getElementById('pause').disabled);assert.equal(await page.locator('#pause').isDisabled(),true);const still=await pixels();await page.waitForTimeout(180);assert.equal(await pixels(),still);
 await page.locator('#edit').click();await page.locator('#clear').click();assert.equal((await saved()).strokes.length,0);
 await page.evaluate(k=>localStorage.setItem(k,'broken'),key);await page.reload();assert.match(await page.locator('#doodle-save').innerText(),/不覆盖/);await page.locator('#sample').click();assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'broken');
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});mobile.on('dialog',d=>d.accept());await mobile.goto(base+'/doodle.html');await mobile.locator('#drawing').scrollIntoViewIfNeeded();const mb=await mobile.locator('#drawing').boundingBox();const cdp=await mobile.context().newCDPSession(mobile);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mb.x+50,y:mb.y+50}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mb.x+150,y:mb.y+80}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await mobile.evaluate(k=>JSON.parse(localStorage.getItem(k)).strokes.length,key),1);await mobile.locator('#sample').click();
 await mobile.screenshot({path:'.qa/doodle-mobile.png',fullPage:true});assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: mouse and touch drawing, undo, local saves, sample, four motions, pause, edit preservation, reduced motion, corrupt storage and mobile layout');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
