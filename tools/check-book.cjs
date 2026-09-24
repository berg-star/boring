const {chromium}=require('playwright');const assert=require('node:assert/strict');
const base=process.env.TEST_BASE||'http://127.0.0.1:18080';
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await b.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:1200,height:1050}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.__sounds=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.__sounds++;return start.apply(this,args);};});
 const r=await p.request.get(base+'/api/book-answers');assert.equal(r.status(),200);const answers=await r.json();assert.equal(answers.length,200);assert.equal(new Set(answers.map(x=>x.answer)).size,200);
 await p.goto(base+'/book.html');assert.equal(await p.evaluate(()=>__sounds),0);assert.equal(await p.locator('#copy-answer').isDisabled(),true);await p.screenshot({path:'.qa/book-closed-desktop.png',fullPage:true});
 await p.locator('#open-book').click();assert.equal(await p.locator('#open-book').isDisabled(),true);await p.waitForFunction(()=>!document.querySelector('#open-book').disabled); const first=await p.locator('#book-answer').textContent();assert.ok(answers.some(x=>x.answer===first));assert.ok(await p.evaluate(()=>__sounds)>0);
 await p.locator('#copy-answer').click();await p.waitForFunction(()=>document.querySelector('#book-status').textContent.includes('已复制'));assert.ok((await p.evaluate(()=>navigator.clipboard.readText())).includes(first));
 await p.evaluate(()=>{navigator.clipboard.writeText=()=>Promise.reject(new Error('denied'));});await p.locator('#copy-answer').click();await p.locator('#book-copy-text').waitFor({state:'visible'});assert.equal(await p.locator('#book-copy-text').inputValue(),first);
 await p.locator('#book-sound').click();const sounds=await p.evaluate(()=>__sounds);await p.emulateMedia({reducedMotion:'reduce'});
 const seen=await p.evaluate(async()=>{
  const values=[document.querySelector('#book-answer').textContent],button=document.querySelector('#open-book');
  async function click(){button.click();while(button.disabled)await new Promise(r=>setTimeout(r,1));}
  for(let i=1;i<200;i++){await click();await click();values.push(document.querySelector('#book-answer').textContent);}
  await click();await click();values.push(document.querySelector('#book-answer').textContent);return values;
 });assert.equal(new Set(seen.slice(0,200)).size,200);assert.notEqual(seen[199],seen[200]);assert.equal(await p.evaluate(()=>__sounds),sounds);
 await p.reload();assert.equal(await p.locator('#book-sound').getAttribute('aria-pressed'),'false');
 await p.route('**/api/book-answers',route=>route.fulfill({status:503,body:'unavailable'}));await p.locator('#open-book').click();await p.waitForFunction(()=>!document.querySelector('#open-book').disabled);assert.ok(await p.locator('#book-error').textContent());assert.equal(await p.locator('#copy-answer').isDisabled(),true);
 await p.unroute('**/api/book-answers');await p.route('**/api/book-answers',route=>route.fulfill({json:[{answer:''}]}));await p.locator('#open-book').click();await p.waitForFunction(()=>!document.querySelector('#open-book').disabled);assert.ok(await p.locator('#book-error').textContent());
 await p.unroute('**/api/book-answers');await p.locator('#open-book').click();await p.waitForFunction(()=>!document.querySelector('#open-book').disabled);assert.equal(await p.locator('#book-error').textContent(),'');
 const longest=answers.reduce((a,b)=>a.answer.length>b.answer.length?a:b).answer;await p.locator('#book-answer').evaluate((el,text)=>el.textContent=text,longest);
 for(const width of [320,390,768]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await p.locator('#book-answer').evaluate(el=>el.scrollHeight<=el.parentElement.clientHeight-110));if(width===390)await p.screenshot({path:'.qa/book-open-mobile.png',fullPage:true});}
 await p.locator('#open-book').click();await p.waitForFunction(()=>!document.querySelector('#open-book').disabled);assert.equal(await p.locator('#book-answer').textContent(),'');assert.equal(await p.locator('#copy-answer').isDisabled(),true);await p.screenshot({path:'.qa/book-closed-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS book: 200 unique answers, full shuffle round and boundary, flip/close, audio starts/mute/persistence, copy/fallback, invalid API/retry, reduced motion and mobile layouts');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});