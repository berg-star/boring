"use strict";
(() => {
  const KEY = 'boring-lab-pet-v1';
  const $ = id => document.getElementById(id);
  const colors = ['#b9f879','#c7afff','#ffbfa4','#99dbed','#f4b9d5'];
  const shapes = ['圆滚滚','小长条','软团子'];
  const personalities = ['喜欢发呆','热爱散步','零食雷达','有点害羞'];
  const pick = n => Math.floor(Math.random() * n);
  const clamp = n => Math.max(0, Math.min(100, n));
  let state, blocked = false, lastAction = 0, bounceTimer;
  function valid(s) {
    const now = Date.now();
    return s && s.version === 1 && typeof s.name === 'string' && s.name.trim().length > 0 && s.name.length <= 12 &&
      ['color','shape','personality'].every((k,i) => Number.isInteger(s[k]) && s[k]>=0 && s[k]<[5,3,4][i]) &&
      ['food','joy','weight'].every(k => Number.isFinite(s[k]) && s[k]>=0 && s[k]<=100) &&
      ['born','updated','awayUntil'].every(k => Number.isSafeInteger(s[k]) && s[k]>=0 && s[k]<=now+300000) && s.born<=s.updated;
  }
  function fresh() {
    const now = Date.now();
    return {version:1,name:'小东西',color:pick(5),shape:pick(3),personality:pick(4),food:65,joy:75,weight:25,born:now,updated:now,awayUntil:0};
  }
  function save() {
    if (blocked) { $('save-status').textContent='旧存档无法读取，暂未覆盖。可导出当前宠物备份，或导入有效存档恢复。'; return; }
    try { localStorage.setItem(KEY,JSON.stringify(state)); $('save-status').textContent='已自动保存在这个浏览器 ♡'; }
    catch (_) { $('save-status').textContent='浏览器无法保存，关闭后可能丢失。请导出存档备份。'; }
  }
  function advance(allowTrip=false) {
    const now=Date.now();
    const elapsed=Math.max(0,now-state.updated);
    const hours=Math.min(elapsed/3600000,168);
    state.food=clamp(state.food-hours*3);
    state.joy=Math.max(20,state.joy-hours*1.5);
    state.weight=clamp(state.weight-hours*.4);
    if(allowTrip && elapsed>6*3600000) state.awayUntil=now+60000;
    state.updated=Math.max(state.updated,now);
    if(state.awayUntil && now>=state.awayUntil) { state.awayUntil=0; say('回来啦！给你带了一颗看不见的石头。'); }
  }
  function say(text) { $('pet-speech').textContent=text; }
  function render() {
    const away=state.awayUntil>Date.now();
    $('pet').hidden=away; $('away-note').hidden=!away;
    $('feed').disabled=$('play').disabled=away;
    $('pet-name').textContent=state.name;
    $('pet').setAttribute('aria-label','戳一戳'+state.name);
    $('pet-traits').textContent=shapes[state.shape]+' · '+personalities[state.personality];
    $('pet-age').textContent='相遇第 '+(Math.floor(Math.max(0,Date.now()-state.born)/86400000)+1)+' 天';
    $('pet').style.setProperty('--pet-color',colors[state.color]);
    $('pet').dataset.shape=state.shape;
    $('pet').style.setProperty('--pet-width',`${150+state.weight*.6}px`);
    $('pet').dataset.mood=state.food<20?'hungry':state.joy>80?'happy':'calm';
    for(const [key,id] of [['food','food'],['joy','joy']]) { $('pet-'+id).value=state[key]; $(id+'-value').textContent=Math.round(state[key])+' / 100'; }
  }
  function animate() { clearTimeout(bounceTimer); $('pet').classList.remove('wiggle'); void $('pet').offsetWidth; $('pet').classList.add('wiggle'); bounceTimer=setTimeout(()=>$('pet').classList.remove('wiggle'),650); }
  function interact(kind) {
    advance();
    if(state.awayUntil>Date.now() || Date.now()-lastAction<650) return;
    lastAction=Date.now();
    if(kind==='feed') {
      if(state.food>90) say('肚子已经圆圆的啦，陪我玩一会儿吧。');
      else { state.food=clamp(state.food+15); state.weight=clamp(state.weight+6); state.joy=clamp(state.joy+4); say('啊呜！这一口要记在快乐账本里。'); }
    } else {
      state.joy=clamp(state.joy+(kind==='play'?12:5));
      say(kind==='play'?'和你待着，发呆也好玩。':['嘿！被你发现我在装镇定。','再戳一下就要收拥抱费了。','咕叽。意思是：很高兴见到你。'][pick(3)]);
    }
    animate();render();save();
  }
  try {
    const raw=localStorage.getItem(KEY);
    if(raw) { const parsed=JSON.parse(raw); if(!valid(parsed)) throw new Error('Invalid save'); state=parsed; }
  } catch (_) { blocked=true; }
  if(!state) state=fresh();
  advance(true);render();save();$('name-input').value=state.name;
  if(state.awayUntil>Date.now()) say('它留了一张小纸条。也可以现在喊它回来。');
  $('feed').addEventListener('click',()=>interact('feed'));
  $('play').addEventListener('click',()=>interact('play'));
  $('pet').addEventListener('click',()=>interact('poke'));
  $('call-home').addEventListener('click',()=>{advance();state.awayUntil=0;say('听见你叫我，就跑回来啦。');render();save();});
  $('name-form').addEventListener('submit',event=>{
    event.preventDefault();const name=$('name-input').value.trim();
    if(!name || name.length>12) {say('名字要有 1 到 12 个字哦。');return;}
    advance();state.name=name;say('记住啦！以后我就叫'+name+'。');render();save();
  });
  document.addEventListener('pointermove',event=>{
    const rect=$('pet').getBoundingClientRect();
    const x=Math.max(-7,Math.min(7,(event.clientX-rect.x-rect.width/2)/22));
    const y=Math.max(-5,Math.min(5,(event.clientY-rect.y-rect.height/2)/22));
    $('pet').style.setProperty('--look-x',x+'px');$('pet').style.setProperty('--look-y',y+'px');
  },{passive:true});
  $('export-pet').addEventListener('click',()=>{
    advance();render();save();
    const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='boring-lab-pet.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    $('backup-status').textContent='存档已准备下载，请妥善保管。';
  });
  $('import-pet').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try {
      if(file.size>16384)throw new Error('Too large');
      const incoming=JSON.parse(await file.text());if(!valid(incoming))throw new Error('Invalid save');
      if(!confirm('导入后会替换当前宠物。建议先导出备份，确定继续吗？'))return;
      state=incoming;blocked=false;advance();render();save();$('name-input').value=state.name;
      say('搬家成功！还是熟悉的你。');$('backup-status').textContent='存档导入成功。';
    } catch (_) { $('backup-status').textContent='无法导入：请选择有效的宠物 JSON 存档（不超过 16 KB）。当前宠物没有改变。'; }
    finally {event.target.value='';}
  });
  addEventListener('storage',event=>{
    if(event.key!==KEY)return;
    if(event.newValue===null){blocked=true;$('save-status').textContent='存档已在其他页面清除。请导出备份或刷新页面。';return;}
    try{const incoming=JSON.parse(event.newValue);if(valid(incoming)){state=incoming;blocked=false;advance();render();$('name-input').value=state.name;$('save-status').textContent='已同步这个浏览器中另一页面的进度。';}}catch(_){}
  });
  setInterval(()=>{if(!document.hidden){advance();render();save();}},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){advance(true);render();save();}});
})();