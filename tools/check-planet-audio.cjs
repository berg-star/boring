const {chromium}=require('playwright');const assert=require('node:assert/strict');
const base=process.env.TEST_BASE||'http://127.0.0.1:18080';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
  const Native=window.AudioContext;window.__sound={contexts:0,starts:0};
  window.AudioContext=class extends Native{constructor(...args){super(...args);window.__sound.contexts++;window.__sound.context=this;const analyser=this.createAnalyser();analyser.fftSize=2048;window.__sound.analyser=analyser;const make=this.createGain.bind(this);this.createGain=()=>{const gain=make();const connect=gain.connect.bind(gain);gain.connect=(target,...rest)=>{if(target===this.destination)connect(analyser);return connect(target,...rest);};return gain;};}};
  for(const cls of [OscillatorNode,AudioBufferSourceNode]){const start=cls.prototype.start;cls.prototype.start=function(...args){window.__sound.starts++;return start.apply(this,args);};}
 });
 await p.goto(base+'/planet.html');assert.equal(await p.evaluate(()=>__sound.contexts),0,'no autoplay');
 for(const kind of ['tree','rain','volcano']){
  await p.locator('[data-tool='+kind+']').click();await p.locator('#planet').focus();await p.keyboard.press('Enter');
  await p.waitForFunction(()=>{if(!__sound.analyser)return false;const data=new Float32Array(2048);__sound.analyser.getFloatTimeDomainData(data);return data.some(x=>Math.abs(x)>.0005);});
 }
 await p.locator('#sound').click();assert.equal(await p.locator('#sound').getAttribute('aria-pressed'),'false');await p.waitForTimeout(150);
 const starts=await p.evaluate(()=>__sound.starts);await p.locator('#planet').focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>__sound.starts),starts,'muted does not start sounds');
 const peak=await p.evaluate(()=>{const d=new Float32Array(2048);__sound.analyser.getFloatTimeDomainData(d);return Math.max(...d.map(Math.abs));});assert.ok(peak<.0005,'mute stops current audio');
 await p.reload();assert.equal(await p.locator('#sound').getAttribute('aria-pressed'),'false');assert.equal(await p.evaluate(()=>__sound.contexts),0);
 await p.locator('#sound').click();await p.waitForFunction(()=>__sound.starts>0);
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await p.waitForFunction(()=>__sound.context.state==='suspended');
 const fallback=await browser.newPage();await fallback.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});await fallback.goto(base+'/planet.html');await fallback.locator('[data-tool=tree]').click();await fallback.locator('#planet').focus();await fallback.keyboard.press('Enter');assert.equal(await fallback.locator('#sound').isDisabled(),true);assert.equal(await fallback.locator('#planet').getAttribute('data-last-event'),'tree');
 assert.deepEqual(errors,[]);console.log('PASS audio: no autoplay, real nonzero samples, mute stops immediately, preference persists, re-enable, background suspension, unsupported fallback');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});