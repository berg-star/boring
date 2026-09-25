"use strict";
(() => {
const $ = id => document.getElementById(id);
const {scenes, brands: builtins} = window.WheelPresets;
const key = "boring-lab-wheel-v1";
const colors = ["#b9f879","#ffe6a7","#b8d8fa","#e5c5ed","#ffbb9c","#b5e5cf","#f2c6cf","#dedca0","#c9ccf6","#9edbdc","#f6d2a4","#d4e6ba"];
let state = {scene:"food", brand:"choose", custom:[], lists:{}}, writable = true;
const validText = t => typeof t === "string" && t.trim() === t && t.length > 0 && t.length <= 12;
try {
  const raw = localStorage.getItem(key);
  if (raw) {
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1 || !Array.isArray(saved.custom) || saved.custom.length > 8 || !saved.lists || typeof saved.lists !== "object") throw Error();
    const names = new Set(Object.values(builtins).map(b => b.name)), ids = new Set();
    for (const b of saved.custom) {
      if (!b || !/^custom-[a-z0-9-]+$/.test(b.id) || ids.has(b.id) || !validText(b.name) || names.has(b.name)) throw Error();
      names.add(b.name); ids.add(b.id);
    }
    const scopes = new Set([...Object.keys(scenes), ...Object.keys(builtins).map(id=>"drink:"+id), ...[...ids].map(id=>"drink:"+id), "shops"]);
    const lists = {};
    for (const [scope, list] of Object.entries(saved.lists)) {
      if (!scopes.has(scope)) continue;
      if (!Array.isArray(list) || list.length < 2 || list.length > 12 || list.some(x=>!x || !validText(x.text) || typeof x.on !== "boolean") || list.filter(x=>x.on).length < 2 || new Set(list.map(x=>x.text)).size !== list.length) throw Error();
      lists[scope] = list.map(x=>({text:x.text,on:x.on}));
    }
    state = {scene:Object.hasOwn(scenes,saved.scene)?saved.scene:"food", brand:saved.brand, custom:saved.custom, lists};
  }
} catch { writable = false; }
let rotation = 0, spinning = false, last = null;
const canvas = $("wheel"), ctx = canvas.getContext("2d");
function brands() { return {...builtins, ...Object.fromEntries(state.custom.map(b=>[b.id,{name:b.name,items:["招牌奶茶","柠檬茶","纯茶"]}]))}; }
function scope() { return state.scene !== "drink" ? state.scene : state.brand === "choose" ? "shops" : state.brand === "general" ? "drink" : "drink:"+state.brand; }
function defaults() { const s=scope(); return s === "shops" ? Object.values(brands()).map(b=>b.name) : s.startsWith("drink:") ? brands()[state.brand].items : scenes[s].items; }
function list() {
  const s=scope();
  if (!state.lists[s]) state.lists[s]=defaults().map(text=>({text,on:true}));
  if (s === "shops") {
    const names=defaults(), old=state.lists[s];
    state.lists[s]=names.map(text=>({text,on:old.find(x=>x.text===text)?.on ?? true}));
    if (state.lists[s].filter(x=>x.on).length<2) state.lists[s].forEach(x=>x.on=true);
  }
  return state.lists[s];
}
function save() {
  if (writable) try { localStorage.setItem(key,JSON.stringify({version:1,...state})); } catch { writable=false; }
  $("save-status").textContent=writable?"已自动保存在此浏览器，清除网站数据会重置。":"浏览器存储不可用或旧记录损坏；本次仍可玩，暂不覆盖原记录。";
}
function fail(text) { $("wheel-error").textContent=text; }
function draw() {
  const items=list().filter(x=>x.on), step=2*Math.PI/items.length;
  ctx.clearRect(0,0,600,600);
  items.forEach((item,i)=>{
    const a=-Math.PI/2+i*step;
    ctx.beginPath();ctx.moveTo(300,300);ctx.arc(300,300,286,a,a+step);ctx.closePath();ctx.fillStyle=colors[i];ctx.fill();ctx.strokeStyle="#1c1f1f";ctx.lineWidth=3;ctx.stroke();
    ctx.save();ctx.translate(300,300);ctx.rotate(a+step/2);ctx.fillStyle="#20251e";ctx.font="bold 25px sans-serif";ctx.textAlign="right";ctx.textBaseline="middle";ctx.fillText(item.text,256,0,194);ctx.restore();
  });
  ctx.beginPath();ctx.arc(300,300,40,0,Math.PI*2);ctx.fillStyle="#1c1f1f";ctx.fill();ctx.fillStyle="#b9f879";ctx.font="32px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("✳",300,301);
  canvas.setAttribute("aria-label","转盘选项："+items.map(x=>x.text).join("、"));
}
function reset() {
  last=null;rotation=0;canvas.style.transition="none";canvas.style.transform="rotate(0deg)";
  $("wheel-result").textContent=scope()==="shops"?"先选一家店，再抽它的饮品。":"准备好了吗？让命运转一圈。";
  $("choose-drink").hidden=true;$("exclude-last").hidden=true;fail("");render();save();
}
function render() {
  const items=list(), shops=scope()==="shops";
  $("options-caption").textContent=`已勾选 ${items.filter(x=>x.on).length} / ${items.length} 项 · 每项最多 12 个字`;
  $("options-list").replaceChildren();
  items.forEach((item,index)=>{
    const chip=document.createElement("div");chip.className="option-chip"+(item.on?"":" is-excluded");
    const check=document.createElement("input");check.type="checkbox";check.checked=item.on;check.setAttribute("aria-label","参与抽取："+item.text);
    check.addEventListener("change",()=>{
      if(spinning)return;
      if(!check.checked && items.filter(x=>x.on).length<=2){check.checked=true;fail("至少留两个勾选项，命运才有得选。");return;}
      item.on=check.checked;reset();
    });
    const text=document.createElement("span");text.textContent=item.text;chip.append(check,text);
    if(!shops){const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","删除"+item.text);remove.addEventListener("click",()=>{
      if(spinning)return;
      if(items.length<=2 || item.on && items.filter(x=>x.on).length<=2){fail("至少留两个勾选项，命运才有得选。");return;}
      items.splice(index,1);reset();
    });chip.append(remove);}
    $("options-list").append(chip);
  });
  $("brand-controls").hidden=state.scene!=="drink";$("custom-store").hidden=state.scene!=="drink";
  $("add-option").hidden=shops;$("delete-brand").hidden=state.scene!=="drink" || !state.custom.some(b=>b.id===state.brand);
  draw();
}
function fillBrands() {
  const all=brands();if(state.brand!=="choose"&&state.brand!=="general"&&!Object.hasOwn(all,state.brand))state.brand="choose";
  $("brand").replaceChildren();
  for(const [id,name] of [["choose","🎲 先抽一家店"],["general","不限品牌，抽饮品种类"],...Object.entries(all).map(([id,b])=>[id,b.name])]) $("brand").add(new Option(name,id));
  $("brand").value=state.brand;
}
for(const [id,s] of Object.entries(scenes))$("template").add(new Option(s.name,id));
$("template").value=state.scene;fillBrands();
$("template").addEventListener("change",()=>{if(spinning)return;state.scene=$("template").value;reset();});
$("brand").addEventListener("change",()=>{if(spinning)return;state.brand=$("brand").value;reset();});
$("add-option").addEventListener("submit",e=>{
  e.preventDefault();if(spinning)return;const text=$("option-input").value.trim(),items=list();
  if(!validText(text)){fail("请填写 1–12 个字的选项。");return;}
  if(items.some(x=>x.text===text)){fail("这个选项已经在转盘里啦。");return;}
  if(items.length>=12){fail("最多放 12 项，先删掉一个吧。");return;}
  items.push({text,on:true});$("option-input").value="";reset();$("option-input").focus();
});
$("restore").addEventListener("click",()=>{if(!spinning&&confirm("只恢复当前这一组的默认选项，其他分类不受影响。继续吗？")){delete state.lists[scope()];reset();}});
$("add-brand").addEventListener("submit",e=>{
  e.preventDefault();if(spinning)return;const name=$("brand-input").value.trim();
  if(!validText(name)){fail("店名请填写 1–12 个字。");return;}
  if(Object.values(brands()).some(b=>b.name===name)){fail("这家店已经存在啦。");return;}
  if(state.custom.length>=8){fail("最多添加 8 家自己的店。");return;}
  const id="custom-"+crypto.randomUUID();state.custom.push({id,name});state.brand=id;fillBrands();$("brand-input").value="";reset();fail("已放入三个示例饮品，可删除或添加你喜欢的菜单。");
});
$("delete-brand").addEventListener("click",()=>{
  if(spinning||!state.custom.some(b=>b.id===state.brand)||!confirm("删除这家自定义店和它保存的菜单？"))return;
  delete state.lists["drink:"+state.brand];state.custom=state.custom.filter(b=>b.id!==state.brand);state.brand="choose";fillBrands();reset();
});
$("choose-drink").addEventListener("click",()=>{if(spinning||!last)return;const match=Object.entries(brands()).find(([,b])=>b.name===last);if(match){state.brand=match[0];fillBrands();reset();}});
$("exclude-last").addEventListener("click",()=>{
  if(spinning||!last)return;const items=list();if(items.filter(x=>x.on).length<=2){fail("至少保留两个勾选项，暂时不能排除它。");return;}items.find(x=>x.text===last).on=false;reset();
});
$("spin").addEventListener("click",()=>{
  if(spinning)return;const items=list().filter(x=>x.on),index=Math.floor(Math.random()*items.length),chosen=items[index].text;
  spinning=true;fail("");$("choose-drink").hidden=true;$("exclude-last").hidden=true;$("wheel-result").textContent="命运正在认真纠结……";
  const controls=[...document.querySelectorAll(".wheel-controls input,.wheel-controls select,.wheel-controls button,.game-actions button")];controls.forEach(c=>c.disabled=true);
  const target=(360-(index+.5)*360/items.length)%360;rotation+=1800+(target-rotation%360+360)%360;
  const duration=matchMedia("(prefers-reduced-motion: reduce)").matches?0:4000;
  void canvas.offsetWidth;canvas.style.transition=`transform ${duration}ms cubic-bezier(.12,.72,.15,1)`;canvas.style.transform=`rotate(${rotation}deg)`;
  let timer;
  function finish(){if(!spinning)return;clearTimeout(timer);canvas.removeEventListener("transitionend",onEnd);spinning=false;last=chosen;$("wheel-result").textContent="命运替你决定了："+chosen;controls.forEach(c=>c.disabled=false);$("exclude-last").hidden=false;$("choose-drink").hidden=scope()!=="shops";window.BoringAchievements?.record("wheel");}
  function onEnd(e){if(e.target===canvas&&e.propertyName==="transform")finish();}
  canvas.addEventListener("transitionend",onEnd);timer=setTimeout(finish,duration+100);
});
reset();
})();
