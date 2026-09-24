const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.TEST_BASE||'http://127.0.0.1:18080';
const key='boring-lab-pet-v1';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const context=await browser.newContext({viewport:{width:1200,height:1050}});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/pet.html');
 const read=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
 const first=await read();assert.equal(first.version,1);
 await p.locator('#name-input').fill('团团');await p.locator('#name-form button').click();
 await p.locator('#feed').click();let fed=await read();assert.ok(fed.food>first.food);assert.ok(fed.weight>first.weight);
 await p.reload();assert.equal(await p.locator('#pet-name').textContent(),'团团');assert.equal((await read()).color,first.color);
 await p.locator('#play').click();assert.ok((await read()).joy>fed.joy);
 await p.mouse.move(1100,200);assert.notEqual(await p.locator('#pet').evaluate(el=>el.style.getPropertyValue('--look-x')),'0px');
 await p.screenshot({path:'.qa/pet-desktop.png',fullPage:true});
 await p.locator('summary').click();const downloadEvent=p.waitForEvent('download');await p.locator('#export-pet').click();const download=await downloadEvent;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.name,'团团');
 const importSave=async data=>p.locator('#import-file').setInputFiles({name:'pet.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await importSave({version:1});assert.equal((await read()).name,'团团');assert.match(await p.locator('#backup-status').textContent(),/无法导入/);
 p.once('dialog',dialog=>dialog.dismiss());await importSave({...exported,name:'取消导入'});assert.equal((await read()).name,'团团');
 p.once('dialog',dialog=>dialog.accept());await importSave({...exported,name:'搬家成功'});assert.equal((await read()).name,'搬家成功');
 const other=await context.newPage();await other.goto(base+'/pet.html');await p.locator('#name-input').fill('同步名字');await p.locator('#name-form button').click();await other.waitForFunction(()=>document.querySelector('#pet-name').textContent==='同步名字');await other.close();
 await p.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.born-=86400000;s.updated-=7*3600000;localStorage.setItem(k,JSON.stringify(s));},key);await p.reload();assert.equal(await p.locator('#away-note').isVisible(),true);assert.ok((await read()).food<fed.food);await p.locator('#call-home').click();assert.equal(await p.locator('#pet').isVisible(),true);
 await p.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.awayUntil=Date.now()+10000;localStorage.setItem(k,JSON.stringify(s));},key);await p.reload();assert.equal(await p.locator('#away-note').isVisible(),true);await p.waitForTimeout(10100);await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(await p.locator('#pet').isVisible(),true);
 for(const width of [320,390,768]){await p.setViewportSize({width,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===390)await p.screenshot({path:'.qa/pet-mobile.png',fullPage:true});}
 await p.evaluate(k=>localStorage.setItem(k,'broken'),key);await p.reload();assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),'broken');assert.match(await p.locator('#save-status').textContent(),/暂未覆盖/);
 const blocked=await browser.newContext();await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('blocked')};});const bp=await blocked.newPage();await bp.goto(base+'/pet.html');assert.match(await bp.locator('#save-status').textContent(),/无法保存/);await blocked.close();
 assert.deepEqual(errors,[]);console.log('PASS pet: identity, feeding, play, persistence, eye tracking, export/import/cancel/invalid save, tab sync, offline trip/return, mobile, corrupt storage and failed writes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});