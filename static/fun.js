"use strict";
(() => {
 const $=id=>document.getElementById(id);
 const types={report:['今日胡闹报告','☺','TODAY’S NONSENSE'],notice:['脑内公告','✳','OFFICIAL-ISH NOTICE'],wanted:['离谱通缉令','◎','WANTED · JUST KIDDING'],patch:['人生补丁说明','↻','LIFE UPDATE LOG'],ad:['荒谬小广告','✧','ABSOLUTELY UNNECESSARY'],invention:['无用发明','⚙','PATENT NOT PENDING']};
 let busy=false,current=null;
 function validate(data){
  const fields=['kind','title','intro','label1','value1','label2','value2','label3','value3','footer'];
  if(!data||fields.some(key=>typeof data[key]!=='string'||!data[key].trim()||data[key].length>300)||!Object.hasOwn(types,data.kind))throw new Error('Invalid show');
 }
 function show(data){
  current=data;const [label,icon,kicker]=types[data.kind];$('result').dataset.kind=data.kind;
  $('show-type').textContent=label;$('show-icon').textContent=icon;$('show-kicker').textContent=kicker;
  $('show-title').textContent=data.title;$('show-intro').textContent=data.intro;$('show-footer').textContent=data.footer;
  $('show-details').replaceChildren();for(let i=1;i<=3;i++){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=data['label'+i];dd.textContent=data['value'+i];row.append(dt,dd);$('show-details').append(row);}
  $('result').classList.remove('pop');void $('result').offsetWidth;$('result').classList.add('pop');
 }
 async function draw(){
  if(busy)return;busy=true;$('draw').disabled=true;$('copy-show').disabled=true;$('draw').textContent='正在接通整活频道……';$('api-error').textContent='';$('copy-status').textContent='';$('copy-fallback').hidden=true;$('result').setAttribute('aria-busy','true');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{const response=await fetch('/api/random-fun',{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('HTTP error');const data=await response.json();validate(data);show(data);$('draw').textContent='再整一个 ↻';}
  catch(_){$('api-error').textContent='研究所暂时没接上信号，请稍后重试。';$('draw').textContent='重试一下 ↻';}
  finally{clearTimeout(timer);busy=false;$('draw').disabled=false;$('copy-show').disabled=!current;$('result').setAttribute('aria-busy','false');}
 }
 $('draw').addEventListener('click',draw);
 $('copy-show').addEventListener('click',async()=>{
  if(!current||busy)return;const snapshot=current;
  const text=[`【${types[current.kind][0]}】`,current.title,current.intro,'',...[1,2,3].map(i=>current['label'+i]+'：'+current['value'+i]),'',current.footer,'—— 无聊研究所 · 纯属整活'].join('\n');
  try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(text);if(current===snapshot&&!busy)$('copy-status').textContent='已复制，可以发给朋友啦。';}
  catch(_){if(current!==snapshot||busy)return;$('copy-fallback').value=text;$('copy-fallback').hidden=false;$('copy-fallback').focus();$('copy-fallback').select();$('copy-status').textContent='自动复制未成功，可在下方长按或全选复制。';}
 });
 draw();
})();