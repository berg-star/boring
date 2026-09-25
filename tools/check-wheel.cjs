const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:1000},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const base=process.env.BASE_URL||'http://127.0.0.1:18080';
 await page.goto(base+'/wheel.html');
 assert.equal(await page.locator('#template option').count(),9);
 await page.locator('#option-input').fill('测试午饭');await page.getByRole('button',{name:'添加 +',exact:true}).click();
 await page.locator('#template').selectOption('dinner');assert.equal(await page.getByText('测试午饭',{exact:true}).count(),0);
 await page.locator('#template').selectOption('food');assert.equal(await page.getByText('测试午饭',{exact:true}).count(),1);
 await page.getByRole('checkbox',{name:'参与抽取：测试午饭',exact:true}).uncheck();await page.reload();assert.equal(await page.getByRole('checkbox',{name:'参与抽取：测试午饭',exact:true}).isChecked(),false);
 await page.locator('#template').selectOption('drink');
 assert.equal(await page.locator('.option-chip').count(),4);
 await page.locator('#spin').click();await page.waitForFunction(()=>!document.getElementById('spin').disabled);
 const shop=(await page.locator('#wheel-result').innerText()).split('：')[1];await page.locator('#choose-drink').click();assert.equal(await page.locator('#brand option:checked').innerText(),shop);
 await page.locator('#brand').selectOption('mixue');assert.equal(await page.locator('.option-chip').count(),4);
 await page.locator('#spin').click();await page.waitForFunction(()=>!document.getElementById('spin').disabled);const picked=(await page.locator('#wheel-result').innerText()).split('：')[1];await page.locator('#exclude-last').click();assert.equal(await page.getByRole('checkbox',{name:'参与抽取：'+picked,exact:true}).isChecked(),false);
 await page.locator('#custom-store summary').click();await page.locator('#brand-input').fill('我的奶茶店');await page.getByRole('button',{name:'添加店铺',exact:true}).click();
 const custom=await page.locator('#brand').inputValue();assert.match(custom,/^custom-/);
 await page.locator('#option-input').fill('芋泥奶茶');await page.getByRole('button',{name:'添加 +',exact:true}).click();await page.reload();assert.equal(await page.locator('#brand').inputValue(),custom);assert.equal(await page.getByText('芋泥奶茶',{exact:true}).count(),1);
 await page.locator('#restore').click();assert.equal(await page.getByText('芋泥奶茶',{exact:true}).count(),0);
 await page.locator('#template').selectOption('food');assert.equal(await page.getByText('测试午饭',{exact:true}).count(),1);
 await page.locator('#template').selectOption('drink');await page.locator('#delete-brand').click();assert.equal(await page.locator('#brand option').filter({hasText:'我的奶茶店'}).count(),0);
 await page.locator('#brand').selectOption('chagee');await page.screenshot({path:'.qa/wheel-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.qa/wheel-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.evaluate(()=>localStorage.setItem('boring-lab-wheel-v1','broken'));await page.reload();assert.match(await page.locator('#save-status').innerText(),/暂不覆盖/);assert.equal(await page.evaluate(()=>localStorage.getItem('boring-lab-wheel-v1')),'broken');
 assert.deepEqual(errors,[]);console.log('PASS: wheel categories, brand stages, custom shops, exclusions, isolated persistence/reset, corrupt storage and mobile layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
