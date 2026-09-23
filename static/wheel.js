"use strict";
const templates = {food:["火锅","烧烤","米饭","面","汉堡","随便"],activity:["打游戏","看电影","出去走走","睡觉","学半小时","什么都不干"]};
const colors = ["#b9f879","#ffbc8b","#cab5fa","#9fd2ed","#f4acc7","#f4de8b","#83d6bd","#cdcfed","#e5bc8f","#b8dca5","#f4bcc1","#afcee3"];
let options = [...templates.food];
let rotation = 0;
let spinning = false;
const canvas = document.querySelector("#wheel");
const ctx = canvas.getContext("2d");
const result = document.querySelector("#wheel-result");
const error = document.querySelector("#wheel-error");
const spin = document.querySelector("#spin");
function drawWheel() {
  const step = 2 * Math.PI / options.length;
  ctx.clearRect(0,0,600,600);
  options.forEach((label,index) => {
    const angle = -Math.PI / 2 + index * step;
    ctx.beginPath();ctx.moveTo(300,300);ctx.arc(300,300,286,angle,angle + step);ctx.closePath();
    ctx.fillStyle = colors[index];ctx.fill();ctx.strokeStyle = "#1c1f1f";ctx.lineWidth = 3;ctx.stroke();
    ctx.save();ctx.translate(300,300);ctx.rotate(angle + step / 2);ctx.fillStyle = "#172111";
    ctx.font = "bold 25px 'Microsoft YaHei', sans-serif";ctx.textAlign = "right";ctx.textBaseline = "middle";
    ctx.fillText(label,256,0,194);ctx.restore();
  });
  ctx.beginPath();ctx.arc(300,300,40,0,Math.PI * 2);ctx.fillStyle = "#1c1f1f";ctx.fill();
  ctx.fillStyle = "#f0f2ed";ctx.font = "32px sans-serif";ctx.textAlign = "center";ctx.textBaseline = "middle";ctx.fillText("✳",300,302);
  canvas.setAttribute("aria-label", "转盘选项：" + options.join("、"));
}
function updateOptions() {
  const list = document.querySelector("#options-list");list.replaceChildren();
  options.forEach((label,index) => {
    const chip = document.createElement("span");chip.className = "option-chip";
    const text = document.createElement("span");text.textContent = label;
    const remove = document.createElement("button");remove.type = "button";remove.textContent = "×";remove.setAttribute("aria-label", "删除" + label);
    remove.addEventListener("click", () => {
      if (spinning) return;
      if (options.length <= 2) {error.textContent = "至少留两个选项，命运才有得选。";return;}
      options.splice(index,1);resetWheel();
    });
    chip.append(text,remove);list.append(chip);
  });
  drawWheel();
}
function resetWheel() {
  error.textContent = "";result.textContent = "准备好了吗？让命运转一圈。";
  rotation = 0;canvas.style.transition = "none";canvas.style.transform = "rotate(0deg)";updateOptions();
}
document.querySelector("#template").addEventListener("change", event => {if (!spinning) {options = [...templates[event.target.value]];resetWheel();}});
document.querySelector("#add-option").addEventListener("submit", event => {
  event.preventDefault();if (spinning) return;
  const input = document.querySelector("#option-input");const value = input.value.trim();
  if (!value) {error.textContent = "先写一个选项吧。";return;}
  if (value.length > 8) {error.textContent = "选项最多 8 个字，转盘才能装得下。";return;}
  if (options.includes(value)) {error.textContent = "这个选项已经在转盘里啦。";return;}
  if (options.length >= 12) {error.textContent = "最多放 12 个选项，先删掉一个吧。";return;}
  options.push(value);input.value = "";resetWheel();input.focus();
});
spin.addEventListener("click", () => {
  if (spinning) return;
  spinning = true;error.textContent = "";result.textContent = "命运正在认真纠结……";
  document.querySelectorAll(".wheel-controls input,.wheel-controls button,.wheel-controls select,#spin").forEach(item => {item.disabled = true;});
  const index = Math.floor(Math.random() * options.length);
  const segment = 360 / options.length;
  // 指针固定向上；所选扇区中线转到 12 点，动画和结果使用同一索引。
  const target = (360 - (index + .5) * segment) % 360;
  rotation += 5 * 360 + (target - rotation % 360 + 360) % 360;
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 4000;
  canvas.style.transition = duration ? "transform 4s cubic-bezier(.12,.72,.15,1)" : "none";
  canvas.style.transform = `rotate(${rotation}deg)`;
  let fallback;
  const finish = () => {
    if (!spinning) return;
    clearTimeout(fallback);
    canvas.removeEventListener("transitionend", finish);
    spinning = false;result.textContent = "命运替你决定了：" + options[index];
    document.querySelectorAll(".wheel-controls input,.wheel-controls button,.wheel-controls select,#spin").forEach(item => {item.disabled = false;});
  };
  canvas.addEventListener("transitionend", finish, {once:true});
  // 隐藏页签或系统禁用动画时仍然能恢复按钮。
  fallback = setTimeout(finish, duration + 100);
});
updateOptions();
