"use strict";
(() => {
 const canvas=document.getElementById('planet'), ctx=canvas.getContext('2d');
 const message=document.getElementById('planet-message');
 if(!ctx){message.textContent='暂时无法绘制星球，请换个浏览器试试。';return;}
 // 音效在用户互动后用 Web Audio 合成，无需下载音频或访问外部服务。
 const soundButton=document.getElementById('sound');
 let soundOn=true,audioContext=null,master=null,noiseBuffer=null,audioToken=0;
 const voices=new Set();
 try{soundOn=localStorage.getItem('boring-lab-planet-sound')!=='off';}catch(_){}
 function soundLabel(){soundButton.textContent=soundOn?'声音：开 ♫':'声音：关';soundButton.setAttribute('aria-pressed',String(soundOn));}
 function stopSound(){audioToken++;for(const source of voices){try{source.stop();}catch(_){}}voices.clear();}
 function unavailable(){stopSound();soundOn=false;soundButton.textContent='音效暂不可用';soundButton.setAttribute('aria-pressed','false');soundButton.disabled=true;}
 function envelope(source,filter,when,duration,volume){
  const gain=audioContext.createGain();gain.gain.setValueAtTime(0,when);
  gain.gain.linearRampToValueAtTime(volume,when+Math.min(.025,duration/5));
  gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
  if(filter){source.connect(filter);filter.connect(gain);}else source.connect(gain);
  gain.connect(master);voices.add(source);
  source.onended=()=>{voices.delete(source);source.disconnect();if(filter)filter.disconnect();gain.disconnect();};
  source.start(when);source.stop(when+duration+.02);
 }
 function tone(at,duration,from,to,volume=.2,type='sine'){
  const oscillator=audioContext.createOscillator();oscillator.type=type;
  oscillator.frequency.setValueAtTime(from,at);oscillator.frequency.exponentialRampToValueAtTime(to,at+duration);
  envelope(oscillator,null,at,duration,volume);
 }
 function noise(at,duration,frequency,volume){
  const source=audioContext.createBufferSource();source.buffer=noiseBuffer;
  const filter=audioContext.createBiquadFilter();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.6;
  envelope(source,filter,at,duration,volume);
 }
 async function playSound(kind){
  if(!soundOn||document.hidden)return;
  stopSound();const token=audioToken;
  try{
   if(!audioContext){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){unavailable();return;}
    audioContext=new Audio();master=audioContext.createGain();master.gain.value=.38;master.connect(audioContext.destination);
    noiseBuffer=audioContext.createBuffer(1,Math.ceil(audioContext.sampleRate*2.5),audioContext.sampleRate);
    const samples=noiseBuffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
   }
   if(audioContext.state!=='running')await audioContext.resume();
   if(token!==audioToken||!soundOn||document.hidden||audioContext.state!=='running')return;
   const t=audioContext.currentTime+.01;
   if(kind==='tree'){tone(t,.18,360,110,.45);tone(t+.09,.25,620,950,.15);}
   else if(kind==='rain'){noise(t,2.2,2300,.5);for(let i=0;i<7;i++)tone(t+i*.22,.08,1200+i*75,650,.07);}
   else if(kind==='volcano'){noise(t,.22,700,.22);tone(t,.2,150,260,.2);noise(t+.24,.65,1800,.65);tone(t+.25,.38,420,85,.28,'triangle');}
   else if(kind==='water'){for(let i=0;i<3;i++)tone(t+i*.15,.19,180+i*65,620+i*90,.3);}
   else{tone(t,.22,660,660,.18);tone(t+.12,.3,880,880,.16);}
  }catch(_){unavailable();}
 }
 soundButton.addEventListener('click',()=>{soundOn=!soundOn;stopSound();soundLabel();try{localStorage.setItem('boring-lab-planet-sound',soundOn?'on':'off');}catch(_){}if(soundOn)playSound('hello');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopSound();if(audioContext)audioContext.suspend().catch(()=>{});}});
 addEventListener('pagehide',stopSound);soundLabel();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let yaw=0,pitch=-.08,night=false,tool='explore',drag=null,frame=0;
 const R=168,CX=300,CY=253;
 const trees=[],effects=[];
 const volcano={x:.3,y:.22,z:Math.sqrt(1-.3*.3-.22*.22)};
 const point=(lat,lon)=>({x:Math.cos(lat)*Math.sin(lon),y:Math.sin(lat),z:Math.cos(lat)*Math.cos(lon)});
 const land=p=>Math.sin(p.x*5+p.z*2)+Math.cos(p.y*7-p.z*3)+Math.sin(p.z*5+p.x*2)>.45;
 function rotate(p){const x=p.x*Math.cos(yaw)+p.z*Math.sin(yaw),z=-p.x*Math.sin(yaw)+p.z*Math.cos(yaw);return{x,y:p.y*Math.cos(pitch)-z*Math.sin(pitch),z:p.y*Math.sin(pitch)+z*Math.cos(pitch)};}
 function project(p){const q=rotate(p);return{x:CX+q.x*R,y:CY-q.y*R,z:q.z};}
 function inverse(x,y){const a=(x-CX)/R,b=(CY-y)/R;if(a*a+b*b>.97)return null;const c=Math.sqrt(1-a*a-b*b);const yy=b*Math.cos(pitch)+c*Math.sin(pitch),zz=-b*Math.sin(pitch)+c*Math.cos(pitch);return{x:a*Math.cos(yaw)-zz*Math.sin(yaw),y:yy,z:a*Math.sin(yaw)+zz*Math.cos(yaw)};}
 for(let i=0;i<95;i++){const p=point(Math.asin(1-2*(i+.5)/95),i*2.39996);if(land(p))trees.push(p);}
 const patches=[];
 for(let a=-Math.PI/2;a<Math.PI/2-.01;a+=Math.PI/30)for(let b=-Math.PI;b<Math.PI;b+=Math.PI/40){const mid=point(a+Math.PI/60,b+Math.PI/80);if(land(mid))patches.push({mid,points:[point(a,b),point(a+Math.PI/30,b),point(a+Math.PI/30,b+Math.PI/40),point(a,b+Math.PI/40)]});}
 function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
 function tree(p){const s=.45+p.z*.7;ctx.save();ctx.translate(p.x,p.y);ctx.scale(s,s);ctx.fillStyle='#775747';ctx.fillRect(-2,-4,4,13);circle(-5,-10,8,night?'#418269':'#558d52');circle(5,-11,8,night?'#509d73':'#70ac59');circle(0,-18,9,night?'#73af8c':'#b5d779');ctx.restore();}
 function mountain(p,sneeze){ctx.save();ctx.translate(p.x,p.y);const s=.6+p.z*.5;ctx.scale(s,s);ctx.fillStyle='#ae8679';ctx.beginPath();ctx.moveTo(-25,12);ctx.lineTo(-10,-29);ctx.lineTo(10,-29);ctx.lineTo(29,12);ctx.closePath();ctx.fill();ctx.fillStyle='#765b60';ctx.beginPath();ctx.moveTo(10,-29);ctx.lineTo(29,12);ctx.lineTo(4,12);ctx.fill();ctx.fillStyle='#f4ac82';ctx.beginPath();ctx.ellipse(0,-28,10,4,0,0,7);ctx.fill();circle(-7,-2,2,'#312e37');circle(7,-2,2,'#312e37');ctx.fillStyle='#312e37';ctx.fillRect(-3,5,6,sneeze?5:2);ctx.restore();}
 function addEffect(kind,p){effects.push({kind,p,time:performance.now(),seed:Math.random()*10});if(effects.length>12)effects.shift();draw();setTimeout(draw,2650);}
 function draw(){
  if(frame){cancelAnimationFrame(frame);frame=0;}
  const now=performance.now();while(effects.length&&now-effects[0].time>2600)effects.shift();
  ctx.clearRect(0,0,600,510);
  for(let i=0;i<45;i++){const x=(i*137.5+27)%590,y=(i*i*19+31)%480;circle(x,y,i%7===0?1.6:.8,night?'#d9d4fc88':'#c5dde540');}
  ctx.save();ctx.translate(CX,CY+R+28);ctx.scale(1,.16);circle(0,0,R*.8,'#00000038');ctx.restore();
  const glow=ctx.createRadialGradient(CX,CY,R*.7,CX,CY,R*1.17);glow.addColorStop(0,'#8ac5d600');glow.addColorStop(.8,night?'#9b9cff24':'#a0d8dd24');glow.addColorStop(1,'#8ac5d600');circle(CX,CY,R*1.17,glow);
  circle(CX,CY,R,night?'#31597c':'#69acbc');
  ctx.save();ctx.beginPath();ctx.arc(CX,CY,R,0,7);ctx.clip();
  for(const patch of patches){if(rotate(patch.mid).z<0)continue;const pts=patch.points.map(project);ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=night?'#477967':'#9bb978';ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.6;ctx.stroke();}
  const shade=ctx.createRadialGradient(CX-65,CY-70,10,CX+25,CY+20,R*1.2);shade.addColorStop(0,'#ffffff18');shade.addColorStop(.55,'#ffffff00');shade.addColorStop(1,'#071d4266');circle(CX,CY,R,shade);ctx.restore();
  const vp=project(volcano);const things=trees.map(p=>({...project(p),kind:'tree'}));things.push({...vp,kind:'volcano'});things.sort((a,b)=>a.z-b.z);
  for(const p of things){if(p.z<.08)continue;if(p.kind==='tree')tree(p);else mountain(p,effects.some(e=>e.kind==='volcano'));}
  for(const e of effects){const p=project(e.p);if(p.z<.04)continue;const t=(now-e.time)/2600;ctx.save();ctx.globalAlpha=Math.min(1,(1-t)*2);if(e.kind==='rain'){
    for(let j=0;j<12;j++){const x=p.x-35+(j*17)%70,y=p.y-55+((t*160+j*13)%75);ctx.strokeStyle='#b2e9ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3,y+8);ctx.stroke();}
    circle(p.x-15,p.y-63,13,'#e1edf4');circle(p.x+4,p.y-69,17,'#f0f3f5');circle(p.x+20,p.y-61,12,'#dde7ef');
   }else if(e.kind==='volcano'){
    for(let j=0;j<15;j++){const a=j*2.4;circle(p.x+Math.sin(a)*t*75,p.y-35-t*75+Math.cos(a)*t*40,3+(j%3),['#ffbf91','#e5dcfc','#b9f879'][j%3]);}ctx.font='bold 19px sans-serif';ctx.fillStyle='#fff3dc';ctx.fillText('阿嚏！',p.x-24,p.y-50-t*30);
   }else if(e.kind==='water'){
    ctx.strokeStyle='#cef9f0';ctx.lineWidth=2;for(let j=0;j<3;j++){ctx.beginPath();ctx.ellipse(p.x,p.y,8+t*38+j*8,4+t*12+j*3,0,0,7);ctx.stroke();}ctx.font='26px sans-serif';ctx.fillStyle='#d7f6ec';ctx.fillText('♪',p.x-7,p.y-12-t*25);
   }else{ctx.font='24px sans-serif';ctx.fillStyle='#e2f7b4';ctx.fillText(e.kind==='tree'?'✦':'♡',p.x-8,p.y-25-t*35);}ctx.restore();
  }
  if(effects.length&&!document.hidden&&!reduced.matches)frame=requestAnimationFrame(draw);
 }
 function act(p){
  let kind=tool;
  if(kind==='explore'){
   const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
   kind=near(p,volcano)<.24?'volcano':trees.some(t=>near(t,p)<.11)?'hello':land(p)?'tree':'water';
  }
  if(kind==='volcano'){yaw=-Math.atan2(volcano.x,volcano.z);pitch=Math.asin(volcano.y);p=volcano;message.textContent='阿——嚏！今天喷出来的是快乐，不是熔岩。';}
  else if(kind==='tree'){if(trees.length>=100){message.textContent='森林够热闹啦。给小树下一场雨吧。';return;}trees.push(p);window.BoringAchievements?.record('tree');message.textContent=land(p)?'一棵小树决定在这里定居。':'海上长出了一棵勇敢的漂浮树。';}
  else if(kind==='rain')message.textContent='给这一小块世界，下了一场刚刚好的雨。';
  else if(kind==='water')message.textContent='海里传来一声咕噜。可能有条鱼在唱歌。';
  else message.textContent='小树晃了晃叶子：你好呀。';
  playSound(kind);canvas.dataset.lastEvent=kind;canvas.dataset.treeCount=trees.length;addEffect(kind,p);
 }
 function coords(event){const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)*600/r.width,y:(event.clientY-r.top)*510/r.height};}
 canvas.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;const p=coords(e);drag={id:e.pointerId,x:p.x,y:p.y,startX:p.x,startY:p.y,moved:false};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const p=coords(e);if(Math.hypot(p.x-drag.startX,p.y-drag.startY)>6)drag.moved=true;if(drag.moved){yaw+=(p.x-drag.x)*.008;pitch=Math.max(-1.25,Math.min(1.25,pitch+(p.y-drag.y)*.008));draw();}drag.x=p.x;drag.y=p.y;});
 canvas.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const click=!drag.moved;drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(click){const c=coords(e),p=inverse(c.x,c.y);if(p)act(p);else message.textContent='点在圆圆的星球上，小事才会发生。';}});
 canvas.addEventListener('pointercancel',()=>{drag=null;});canvas.addEventListener('lostpointercapture',()=>{drag=null;});
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)){e.preventDefault();if(e.key==='Enter'||e.key===' ')act(inverse(CX,CY));else{yaw+=e.key==='ArrowLeft'?-.18:e.key==='ArrowRight'?.18:0;pitch=Math.max(-1.25,Math.min(1.25,pitch+(e.key==='ArrowUp'?-.18:e.key==='ArrowDown'?.18:0)));draw();}}});
 document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>{tool=button.dataset.tool;document.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});message.textContent='选好啦，点一下星球试试。';}));
 document.getElementById('night').addEventListener('click',e=>{night=!night;e.currentTarget.setAttribute('aria-pressed',String(night));e.currentTarget.textContent=night?'切到白天 ☀':'切到夜晚 ☾';document.querySelector('.planet-room').classList.toggle('is-night',night);message.textContent=night?'灯暗下来，星星就开始值班了。':'太阳回来了，继续无所事事吧。';draw();});
 document.getElementById('surprise-event').addEventListener('click',()=>{const previous=tool;tool=['tree','rain','volcano','water'][Math.floor(Math.random()*4)];act(inverse(CX,CY));tool=previous;});
 function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=600*dpr;canvas.height=510*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
 addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else draw();});reduced.addEventListener('change',draw);resize();
})();