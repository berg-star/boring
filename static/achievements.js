"use strict";
(() => {
 const KEY='boring-lab-achievements-v1';
 const games=['reaction','wheel','card','question','fun','truth','pet','planet','book'];
 const kinds=['report','notice','wanted','patch','ad','invention'];
 const catalog=[
  ['explorer','不务正业初学者','你已经掌握了三种消磨时间的方法。','去不同的房间逛逛。',s=>s.visits.length>=3],
  ['resident','研究所常驻人口','每个房间都留下了你的脚印。','研究所里还有没去过的地方吗？',s=>s.visits.length>=9],
  ['hesitate','犹豫大师','转盘都准备好了，你还没想好。','有时，待一会儿也会有发现。',s=>s.wheelMs>=180000],
  ['destiny','命运外包专家','这件事，交给命运负责。','多给命运几次表现机会。',s=>s.spins>=10],
  ['early','人类极限','你比开始信号还着急。','有一种速度，叫还没开始。',s=>s.early],
  ['fast','手比脑子快','刚刚发生了什么？你的手知道。','等绿灯，然后快一点。',s=>s.fast],
  ['cards','惊喜批发商','别人抽一张，你按箱进货。','惊喜也可以积少成多。',s=>s.cards>=10],
  ['critic','胡说八道鉴赏家','你对本所的精神状态已有全面了解。','每种胡说八道都有自己的风格。',s=>s.kinds.length>=6],
  ['secret','保密局编外人员','有些事，连这个网页都不能知道。','不想回答，也是你的自由。',s=>s.skips>=5],
  ['keeper','正式成为饲养员','从今天起，它就是有名字的小东西了。','给那个小东西一个称呼。',s=>s.named],
  ['forest','星球绿化承包商','随便玩玩，结果开始植树造林。','让星球多一点绿色。',s=>s.trees>=10],
  ['reader','宇宙客服常客','宇宙正在努力组织语言。','和书里的句子多见几次面。',s=>s.books>=10]
 ];
 const fresh=()=>({version:1,visits:[],kinds:[],wheelMs:0,spins:0,cards:0,skips:0,trees:0,books:0,early:false,fast:false,named:false,unlocked:{}});
 let memory=fresh(),warning='',blocked=false,chain=Promise.resolve(),streak=0;
 function parse(raw){
  const s=JSON.parse(raw);if(!s||s.version!==1)throw Error('Invalid version');
  for(const [key,allowed] of [['visits',games],['kinds',kinds]])if(!Array.isArray(s[key])||s[key].some(x=>!allowed.includes(x))||new Set(s[key]).size!==s[key].length)throw Error('Invalid list');
  for(const key of ['wheelMs','spins','cards','skips','trees','books'])if(!Number.isFinite(s[key])||s[key]<0||s[key]>1000000000)throw Error('Invalid count');
  for(const key of ['early','fast','named'])if(typeof s[key]!=='boolean')throw Error('Invalid flag');
  if(!s.unlocked||typeof s.unlocked!=='object'||Array.isArray(s.unlocked)||Object.entries(s.unlocked).some(([id,date])=>!catalog.some(x=>x[0]===id)||!Number.isSafeInteger(date)||date<=0))throw Error('Invalid unlock');
  return s;
 }
 function read(){if(blocked)return memory;try{const raw=localStorage.getItem(KEY);return raw?parse(raw):fresh();}catch(_){blocked=true;warning='无法读取已有成就记录，本次暂存于页面，未覆盖旧数据。';return memory;}}
 const queue=[];let toast=null,toastTimer=null;
 function dismiss(){clearTimeout(toastTimer);if(toast){toast.remove();toast=null;}showToast();}
 function showToast(){
  if(toast||!queue.length||document.hidden)return;const item=queue.shift();
  toast=document.createElement('aside');toast.className='achievement-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
  const icon=document.createElement('span');icon.className='achievement-spark';icon.textContent='✦';
  const text=document.createElement('div'),tag=document.createElement('small'),title=document.createElement('strong'),copy=document.createElement('p'),link=document.createElement('a'),close=document.createElement('button');
  tag.textContent='成就解锁';title.textContent=item[1];copy.textContent=item[2];link.href='/achievements.html';link.textContent='查看成就册 ↗';close.textContent='×';close.type='button';close.setAttribute('aria-label','关闭成就提示');close.addEventListener('click',dismiss);text.append(tag,title,copy,link);toast.append(icon,text,close);document.body.append(toast);toastTimer=setTimeout(dismiss,5000);
 }
 function render(){
  const count=Object.keys(memory.unlocked).length;
  document.querySelectorAll('[data-achievement-count]').forEach(el=>el.textContent=`✦ 我的成就 ${count} / 12`);
  const grid=document.getElementById('achievement-grid');if(!grid)return;
  document.getElementById('achievement-total').textContent=`已解锁 ${count} / 12`;
  document.getElementById('achievement-progress').value=count;
  document.getElementById('achievement-save').textContent=warning||'保存在当前浏览器；换设备不会同步，清除网站数据会丢失。从本次更新起开始记录。';
  grid.replaceChildren();for(const item of catalog){const date=memory.unlocked[item[0]],card=document.createElement('article');card.className='achievement-card'+(date?' unlocked':'');card.dataset.achievement=item[0];
   const icon=document.createElement('span'),title=document.createElement('h2'),copy=document.createElement('p'),stamp=document.createElement('small');icon.className='achievement-badge';icon.textContent=date?'✦':'◇';title.textContent=date?item[1]:'未发现的成就';copy.textContent=date?item[2]:item[3];stamp.textContent=date?'解锁于 '+new Date(date).toLocaleDateString('zh-CN'):'等待偶然相遇';card.append(icon,title,copy,stamp);grid.append(card);
  }
 }
 function commit(change){
  memory=read();change(memory);const newly=[];
  for(const item of catalog)if(!memory.unlocked[item[0]]&&item[4](memory)){memory.unlocked[item[0]]=Date.now();newly.push(item);}
  if(!blocked)try{localStorage.setItem(KEY,JSON.stringify(memory));}catch(_){blocked=true;warning='浏览器无法保存成就，离开页面后可能丢失。';}
  render();queue.push(...newly);showToast();
 }
 function update(change){
  chain=chain.then(()=>navigator.locks?.request?navigator.locks.request(KEY,()=>commit(change)):commit(change)).catch(()=>{warning='成就记录暂时不可用，不影响继续游玩。';render();});return chain;
 }
 function record(event,value){
  return update(s=>{
   const counters={wheel:'spins',card:'cards',skip:'skips',tree:'trees',book:'books'};
   if(Object.hasOwn(counters,event)){const key=counters[event];s[key]=Math.min(10,s[key]+1);}
   else if(event==='fun'&&kinds.includes(value)&&!s.kinds.includes(value))s.kinds.push(value);
   else if(event==='name')s.named=true;
   else if(event==='early'){streak++;if(streak>=3)s.early=true;}
   else if(event==='reaction'){streak=0;if(Number.isFinite(value)&&value>0&&value<250)s.fast=true;}
  });
 }
 window.BoringAchievements={record};
 memory=read();
 const footer=document.querySelector('footer');if(footer){const link=document.createElement('a');link.href='/achievements.html';link.className='achievement-link';link.dataset.achievementCount='';footer.append(link);}
 const section=document.querySelector('.section-head');if(section){const link=document.createElement('a');link.href='/achievements.html';link.className='achievement-link';link.dataset.achievementCount='';section.append(link);}
 render();
 const page=location.pathname.split('/').pop().replace('.html','');
 let visited=false;
 function visit(){if(!visited&&!document.hidden&&games.includes(page)){visited=true;update(s=>{if(!s.visits.includes(page))s.visits.push(page);});}}
 visit();
 let last=performance.now(),visible=!document.hidden,pending=0;
 function wheelTick(){const now=performance.now();if(visible)pending+=Math.min(2000,Math.max(0,now-last));last=now;visible=!document.hidden;if(pending>=5000||!visible){const elapsed=pending;pending=0;if(elapsed&&memory.wheelMs<180000)update(s=>{s.wheelMs=Math.min(180000,s.wheelMs+elapsed);});}}
 if(page==='wheel')setInterval(wheelTick,1000);
 document.addEventListener('visibilitychange',()=>{if(page==='wheel')wheelTick();visit();if(document.hidden&&toast){clearTimeout(toastTimer);toast.remove();toast=null;}if(!document.hidden)showToast();});
 addEventListener('pagehide',()=>{streak=0;if(page==='wheel'){const now=performance.now();if(visible)pending+=Math.min(2000,Math.max(0,now-last));last=now;visible=false;const elapsed=pending;pending=0;if(elapsed)update(s=>{s.wheelMs=Math.min(180000,s.wheelMs+elapsed);});}});
 addEventListener('pageshow',()=>{last=performance.now();visible=!document.hidden;});
 addEventListener('storage',e=>{if(e.key===KEY){blocked=false;warning='';memory=read();render();}});
})();