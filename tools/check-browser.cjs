// 可选开发验收：npm install --prefix tools && node tools/check-browser.cjs
// 仅测试工具使用 Node；网站后端始终为 C++。
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const base = 'http://127.0.0.1:18080';
async function main() {
  fs.mkdirSync('.qa',{recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1050}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const api = page.request;
    assert.deepEqual(await (await api.get(base+'/api/hello')).json(), {message:'Hello from C++'});
    for (const endpoint of ['random-card','random-question','random-fun']) {
      const records = await Promise.all(Array.from({length:24},async()=> {
        const response = await api.get(base+'/api/'+endpoint);
        assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/application\/json/);
        const data = await response.json();
        for (const key of ['lazyIndex','luck','energy','workIndex']) if (key in data) assert.ok(data[key]>=0&&data[key]<=100);
        return JSON.stringify(data);
      }));
      assert.ok(new Set(records).size>1,endpoint+' must return varied records');
    }
    for (const route of ['/missing.html','/static/main.cpp','/static/cards.json','/api/missing','/data/cards.json','/static/../CMakeLists.txt']) assert.equal((await api.get(base+route)).status(),404,route);
    const pages = ['','reaction.html','wheel.html','card.html','question.html','fun.html','truth.html','pet.html','planet.html','book.html','doodle.html','achievements.html'];
    for (const route of pages) {
      const response = await page.goto(base+'/'+route);assert.equal(response.status(),200);
      const assets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(n=>n.src||n.href));
      for (const asset of assets) assert.equal((await api.get(asset)).status(),200,asset);
    }
    await page.goto(base);assert.equal(await page.locator('.game-card').count(),10);
    await page.screenshot({path:'.qa/home-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'🧠 测试',exact:true}).click();assert.equal(await page.locator('.game-card:visible').count(),1);
    await page.getByRole('button',{name:'全部玩法',exact:true}).click();
    await page.getByRole('button',{name:/随便给我来一个/}).click();await page.waitForURL(/\/(reaction|wheel|card|question|fun|truth|pet|planet|book|doodle)\.html$/);
    await page.goto(base+'/reaction.html');
    await page.locator('#reaction-pad').click();assert.match(await page.locator('#reaction-title').textContent(),/等它/);
    await page.locator('#reaction-pad').click();assert.equal(await page.locator('#reaction-title').textContent(),'太早了！');
    await page.locator('#reaction-pad').click();await page.waitForSelector('.reaction-pad.ready',{timeout:7000});
    await page.locator('#reaction-pad').click();assert.match(await page.locator('#reaction-title').textContent(),/\d+ ms/);
    const best = await page.locator('#best-score').textContent();await page.reload();assert.equal(await page.locator('#best-score').textContent(),best);
    await page.locator('#reaction-pad').focus();await page.keyboard.press('Space');assert.match(await page.locator('#reaction-title').textContent(),/等它/);
    await page.keyboard.press('Enter');assert.equal(await page.locator('#reaction-title').textContent(),'太早了！');
    await page.goto(base+'/wheel.html');
    await page.locator('#option-input').fill('螺蛳粉');await page.getByRole('button',{name:'添加 +',exact:true}).click();assert.equal(await page.locator('.option-chip').count(),7);
    await page.getByRole('button',{name:'删除螺蛳粉',exact:true}).click();assert.equal(await page.locator('.option-chip').count(),6);
    await page.locator('#template').selectOption('activity');assert.match(await page.locator('#options-list').textContent(),/什么都不干/);
    await page.locator('#template').selectOption('food');
    await page.locator('#spin').click();assert.equal(await page.locator('#spin').isDisabled(),true);
    await page.waitForFunction(()=>document.querySelector('#wheel-result').textContent.startsWith('命运替你决定了：'),{},{timeout:6000});
    const wheelState = await page.evaluate(()=>({transform:document.querySelector('#wheel').style.transform,labels:[...document.querySelectorAll('.option-chip>span')].map(n=>n.textContent),result:document.querySelector('#wheel-result').textContent}));
    const degrees = Number(wheelState.transform.match(/[\d.]+/)[0]);const index = Math.floor(((360-degrees%360)%360)/(360/wheelState.labels.length));
    assert.equal(wheelState.result,'命运替你决定了：'+wheelState.labels[index]);
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#spin').click();await page.waitForTimeout(180);assert.equal(await page.locator('#spin').isDisabled(),false);
    for(let i=0;i<4;i++) await page.locator('.option-chip button').first().click();
    await page.locator('.option-chip button').first().click();assert.equal(await page.locator('.option-chip').count(),2);assert.match(await page.locator('#wheel-error').textContent(),/至少/);
    await page.goto(base+'/card.html');await page.locator('#draw').click();await page.locator('#card-back').click();await page.waitForFunction(()=>document.querySelector('#keyword').textContent.length>0);
    assert.match(await page.locator('#luck').textContent(),/\d+ \/ 100/);
    await page.screenshot({path:'.qa/card-desktop.png',fullPage:true});
    await page.route('**/api/random-card',route=>route.fulfill({status:503,body:'unavailable'}));
    await page.locator('#draw').click();await page.waitForFunction(()=>document.querySelector('#draw').textContent.includes('重试'));assert.match(await page.locator('#api-error').textContent(),/暂时/);
    await page.unroute('**/api/random-card');await page.locator('#draw').click();await page.locator('#card-back').click();await page.waitForFunction(()=>document.querySelector('#draw').textContent.includes('再抽'));assert.equal(await page.locator('#api-error').textContent(),'');
    for(const route of ['question','fun']) {await page.goto(base+'/'+route+'.html');await page.waitForFunction(()=>!document.querySelector('#draw').disabled);assert.equal(await page.locator('#api-error').textContent(),'');await page.locator('#draw').click();await page.waitForFunction(()=>!document.querySelector('#draw').disabled);}
    await page.goto(base+'/truth.html');
    await page.waitForFunction(()=>!document.querySelector('#skip').disabled);
    const seen = new Set();
    for(let i=0;i<20;i++) {
      const text = await page.locator('#question').textContent();
      assert.ok(!seen.has(text),'truth repeats within a round');seen.add(text);
      await page.locator(i%2 ? '#skip' : '#draw').click();
    }
    assert.match(await page.locator('#truth-progress').textContent(),/2.*1 \/ 20/);
    await page.locator('[data-level="deep"]').click();
    assert.ok(!seen.has(await page.locator('#question').textContent()));
    const deepQuestion = await page.locator('#question').textContent();
    await page.locator('[data-level="light"]').click();
    await page.locator('[data-level="deep"]').click();
    assert.equal(await page.locator('#question').textContent(),deepQuestion);
    await page.screenshot({path:'.qa/truth-desktop.png',fullPage:true});
    await page.route('**/api/truth-questions',route=>route.fulfill({status:503,body:'unavailable'}));
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#draw').disabled);
    assert.equal(await page.locator('#skip').isDisabled(),true);
    await page.unroute('**/api/truth-questions');await page.locator('#draw').click();
    await page.waitForFunction(()=>!document.querySelector('#skip').disabled);
    assert.equal(await page.locator('#api-error').textContent(),'');
    for (const width of [390,320,768]) {
      await page.setViewportSize({width,height:844});
      for (const route of pages) {
        await page.goto(base+'/'+route);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow at '+width+'/'+route);
        if(width===390) await page.screenshot({path:'.qa/'+(route||'home')+'-mobile.png',fullPage:true});
      }
    }
    assert.deepEqual(errors,[],'browser runtime errors');
    await browser.close();
    const executable = path.resolve('build/Release/boring_lab.exe');
    if(fs.existsSync(executable)) {
      const brokenRoot = path.resolve('.qa/bad-data');fs.mkdirSync(path.join(brokenRoot,'data'),{recursive:true});
      for(const content of ['{not-json','[]','[{"keyword":"test","message":"test","luck":150,"lazyIndex":3}]']) {
        fs.writeFileSync(path.join(brokenRoot,'data/cards.json'),content);
        const result = spawnSync(executable,[brokenRoot],{encoding:'utf8',timeout:5000});assert.equal(result.status,1);assert.match(result.stderr,/could not start/);
      }
      const missing = spawnSync(executable,[path.resolve('.qa/missing-root')],{encoding:'utf8',timeout:5000});assert.equal(missing.status,1);
    }
    console.log('PASS: APIs, random variety, missing routes, resources, all ten games, keyboard, wheel pointer, retry, 320/390/768px layouts, invalid data.');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exit(1);});
