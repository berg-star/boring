const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:18080';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})});
 try{
  const a=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const b=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const host=await a.newPage(),guest=await b.newPage(),errors=[];
  for(const p of [host,guest])p.on('pageerror',e=>errors.push(e.message));
  await host.goto(base+'/tug-online.html');await host.locator('#online-create').click();await host.waitForFunction(()=>/^[A-HJ-NP-Z2-9]{6}$/.test(document.querySelector('#online-room-code').textContent));
  const code=await host.locator('#online-room-code').textContent();assert.match(code,/^[A-HJ-NP-Z2-9]{6}$/);
  const link=await host.locator('#online-share-link').inputValue();assert.match(link,new RegExp('room='+code));
  await guest.goto(link);assert.equal(await guest.locator('#online-code').inputValue(),code);
  await guest.locator('#online-join-form button').click();
  await host.waitForFunction(()=>document.querySelector('#online-player-right').textContent.includes('已连接'));
  await guest.waitForFunction(()=>document.querySelector('#online-player-left').textContent.includes('已连接'));
  const full=await b.request.post(base+'/api/tug/join',{data:{room:code}});assert.equal(full.status(),409);
  assert.equal(await host.locator('#online-pull-right').isDisabled(),true);
  assert.equal(await guest.locator('#online-pull-left').isDisabled(),true);
  await host.locator('#online-ready').click();await guest.locator('#online-ready').click();
  await host.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='running',{timeout:7000});
  await guest.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='running',{timeout:7000});
  fs.mkdirSync('.qa',{recursive:true});
  await host.screenshot({path:'.qa/tug-online-host.png',fullPage:true});
  await guest.screenshot({path:'.qa/tug-online-guest.png',fullPage:true});
  assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await guest.setViewportSize({width:320,height:700});
  assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await host.locator('#online-pull-left').click();await guest.waitForFunction(()=>Number(document.querySelector('#online-arena').dataset.left)>0);await host.waitForFunction(()=>Number(document.querySelector('#online-arena').dataset.left)>0);
  assert.equal(await host.locator('#online-arena').getAttribute('data-left'),await guest.locator('#online-arena').getAttribute('data-left'));
  await guest.locator('#online-pull-right').click();await host.waitForFunction(()=>Number(document.querySelector('#online-arena').dataset.right)>0);
  // 连点直到青柠队胜利，胜负都由服务器广播。
  for(let i=0;i<46;i++){
    if(await host.locator('#online-arena').getAttribute('data-state')==='finished')break;
    await host.locator('#online-pull-left').click();await host.waitForTimeout(85);
  }
  await host.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='finished');
  await guest.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='finished');
  assert.match(await host.locator('#online-status').textContent(),/你赢啦/);
  assert.match(await guest.locator('#online-status').textContent(),/对方赢啦/);
  // 两人都确认后才能重赛。
  await guest.locator('#online-ready').click();await guest.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='waiting');
  await host.locator('#online-ready').click();await guest.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='countdown');
  await host.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='running',{timeout:7000});
  await guest.close();
  await host.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='waiting');
  assert.match(await host.locator('#online-status').textContent(),/离线/);
  const revived=await b.newPage();await revived.goto(base+'/tug-online.html?room='+code);
  await revived.waitForFunction(()=>document.querySelector('#online-session')&&!document.querySelector('#online-session').hidden);
  await host.waitForFunction(()=>document.querySelector('#online-player-right').textContent.includes('已连接'));
  await revived.locator('#online-leave').click();
  const newcomer=await b.newPage();await newcomer.goto(link);await newcomer.locator('#online-join-form button').click();
  await host.waitForFunction(()=>document.querySelector('#online-player-right').textContent.includes('已连接'));
  await newcomer.locator('#online-ready').click();await host.locator('#online-ready').click();
  await host.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='running',{timeout:7000});
  await newcomer.locator('#online-leave').click();await host.waitForFunction(()=>document.querySelector('#online-arena').dataset.state==='waiting');
  await host.locator('#online-leave').click();
  await host.locator('#online-code').fill('OOOOOO');await host.locator('#online-join-form button').click();assert.match(await host.locator('#online-error').textContent(),/六位/);
  assert.deepEqual(errors,[]);
  console.log('PASS: two devices create/join, authorization by roles, simultaneous sync, authoritative victory, rematch ready, disconnect, resume, guest leave and replacement, room validation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
