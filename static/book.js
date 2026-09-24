"use strict";
(() => {
 const $=id=>document.getElementById(id),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let state='closed',answers=null,deck=[],last='',current='',revision=0;
 let soundOn=true,audio=null,source=null,noise=null;
 try{soundOn=localStorage.getItem('boring-lab-book-sound')!=='off';}catch(_){}
 function soundLabel(){$('book-sound').textContent=soundOn?'翻页声：开':'翻页声：关';$('book-sound').setAttribute('aria-pressed',String(soundOn));}
 function stopSound(){if(source){try{source.stop();}catch(_){}source=null;}}
 function unlockSound(){
  if(!soundOn)return;
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
   if(!audio){audio=new Audio();noise=audio.createBuffer(1,Math.ceil(audio.sampleRate*.5),audio.sampleRate);const values=noise.getChannelData(0);for(let i=0;i<values.length;i++)values[i]=Math.random()*2-1;}
   if(audio.state!=='running')audio.resume().catch(()=>{});
  }catch(_){}
 }
 function flipSound(){
  if(!soundOn||!audio||audio.state!=='running'||document.hidden)return;
  try{stopSound();const s=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source=s;s.buffer=noise;filter.type='bandpass';filter.frequency.value=1500;filter.Q.value=.65;
   const t=audio.currentTime;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.2,t+.07);gain.gain.exponentialRampToValueAtTime(.0001,t+.43);s.connect(filter);filter.connect(gain);gain.connect(audio.destination);s.onended=()=>{s.disconnect();filter.disconnect();gain.disconnect();if(source===s)source=null;};s.start(t);s.stop(t+.45);
  }catch(_){}
 }
 $('book-sound').addEventListener('click',()=>{soundOn=!soundOn;if(!soundOn)stopSound();else unlockSound();soundLabel();try{localStorage.setItem('boring-lab-book-sound',soundOn?'on':'off');}catch(_){}});soundLabel();
 function delay(ms){return new Promise(resolve=>setTimeout(resolve,reduced.matches?0:ms));}
 async function load(){
  if(answers)return;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{const r=await fetch('/api/book-answers',{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error('Request failed');const data=await r.json();if(!Array.isArray(data)||data.length<2||data.some(row=>!row||typeof row.answer!=='string'||!row.answer.trim()||row.answer.length>100))throw new Error('Invalid answers');const unique=[...new Set(data.map(row=>row.answer.trim()))];if(unique.length<2)throw new Error('Not enough answers');answers=unique;}
  finally{clearTimeout(timer);}
 }
 function take(){
  if(!deck.length){deck=answers.map((_,i)=>i);for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}if(answers[deck.at(-1)]===last)[deck[0],deck[deck.length-1]]=[deck.at(-1),deck[0]];}
  const index=deck.pop();last=answers[index];return{answer:last,page:index+1};
 }
 $('book').querySelector('.book-page').setAttribute('aria-hidden','true');
 $('open-book').addEventListener('click',async()=>{
  if(state==='busy')return;unlockSound();revision++;$('book-error').textContent='';$('book-copy-text').hidden=true;$('copy-answer').disabled=true;$('open-book').disabled=true;
  if(state==='open'){
   state='busy';$('book-status').textContent='把这句话留一会儿，再想一个问题。';$('book').classList.remove('is-open');$('book').querySelector('.book-page').setAttribute('aria-hidden','true');flipSound();await delay(800);current='';$('book-answer').textContent='';state='closed';$('open-book').textContent='翻开答案 ✧';$('open-book').disabled=false;return;
  }
  state='busy';$('book-status').textContent='正在为你翻开一页……';$('book').setAttribute('aria-busy','true');
  try{await load();const choice=take();current=choice.answer;$('book-answer').textContent=current;$('book-page-number').textContent='— '+String(choice.page).padStart(3,'0')+' —';$('book').classList.add('is-open');flipSound();await delay(800);$('book').querySelector('.book-page').setAttribute('aria-hidden','false');state='open';$('book-status').textContent='这一页留给你：'+current;$('open-book').textContent='合上再问 ↻';$('copy-answer').disabled=false;}
  catch(_){state='closed';current='';$('book-status').textContent='问题可以先留在心里。';$('book-error').textContent='答案暂时没有送到，请检查网络后重试。';$('open-book').textContent='再试一次 ✧';}
  finally{$('open-book').disabled=false;$('book').setAttribute('aria-busy','false');}
 });
 $('copy-answer').addEventListener('click',async()=>{
  if(state!=='open'||!current)return;const text=current,version=revision;
  try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(text+'\n—— 无聊研究所 · 答案之书');if(version===revision)$('book-status').textContent='已复制，留给自己或分享给朋友。';}
  catch(_){if(version!==revision)return;$('book-copy-text').value=text;$('book-copy-text').hidden=false;$('book-copy-text').focus();$('book-copy-text').select();$('book-status').textContent='自动复制未成功，可以在下方长按或全选复制。';}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopSound();if(audio)audio.suspend().catch(()=>{});}});addEventListener('pagehide',stopSound);
})();