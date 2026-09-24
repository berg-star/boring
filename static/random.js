"use strict";
const mode = document.body.dataset.mode;
const action = document.querySelector("#draw");
const errorMessage = document.querySelector("#api-error");
const resultPanel = document.querySelector("#result");
const endpoints = {card:"/api/random-card",question:"/api/random-question"};
let busy = false;
function text(id, value) { document.getElementById(id).textContent = value; }
function metric(id, value) {
  text(id, value + "%");
  const bar = document.getElementById(id + "-bar");bar.style.width = value + "%";
}
function validate(data) {
  const strings = mode === "card" ? ["keyword","message"] : ["question"];
  const numbers = mode === "card" ? ["lazyIndex","luck"] : [];
  if (!data || strings.some(key => typeof data[key] !== "string" || !data[key].trim()) || numbers.some(key => !Number.isFinite(data[key]) || data[key] < 0 || data[key] > 100)) throw new Error("invalid-data");
}
async function draw() {
  if (busy) return;
  busy = true;action.disabled = true;action.textContent = "正在准备惊喜……";errorMessage.textContent = "";
  resultPanel.setAttribute("aria-busy","true");
  const controller = new AbortController();const timeout = setTimeout(() => controller.abort(),8000);
  try {
    const response = await fetch(endpoints[mode], {cache:"no-store",signal:controller.signal});
    if (!response.ok) throw new Error("http-error");
    const data = await response.json();validate(data);
    if (mode === "card") {
      text("keyword",data.keyword);metric("lazy",data.lazyIndex);metric("luck",data.luck);text("message",data.message);
    } else if (mode === "question") text("question",data.question);
    resultPanel.classList.remove("pop");void resultPanel.offsetWidth;resultPanel.classList.add("pop");
    action.textContent = mode === "card" ? "再抽一张 ✧" : "再来一个 ↻";
    return data;
  } catch (_) {
    errorMessage.textContent = "研究所暂时没接上信号。请确认网站服务已启动，再试一次。";
    action.textContent = "重试一下 ↻";
  } finally {
    clearTimeout(timeout);busy = false;action.disabled = false;resultPanel.setAttribute("aria-busy","false");
  }
}
action.addEventListener("click", draw);
if (mode !== "card") draw();
