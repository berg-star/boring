"use strict";
const pad = document.querySelector("#reaction-pad");
const title = document.querySelector("#reaction-title");
const hint = document.querySelector("#reaction-hint");
let state = "idle";
let timer;
let readyFrame;
let startedAt = 0;
let best = null;
try { const value = Number(sessionStorage.getItem("boring-lab-best")); if (value > 0 && Number.isFinite(value)) best = value; } catch (_) {}
const showBest = () => { document.querySelector("#best-score").textContent = best === null ? "还没有成绩" : best + " ms"; };
showBest();
function setPad(next, headline, description) {
  state = next;
  pad.className = "reaction-pad " + next;
  title.textContent = headline;
  hint.textContent = description;
}
function cancelWait() { clearTimeout(timer); cancelAnimationFrame(readyFrame); }
function play() {
  if (state === "waiting") {
    cancelWait();
    window.BoringAchievements?.record("early");
    setPad("early", "太早了！", "还没变绿呢。点击这里，再试一次。");
  } else if (state === "ready") {
    const score = Math.max(1, Math.round(performance.now() - startedAt));
    window.BoringAchievements?.record("reaction",score);
    const comment = score < 180 ? "你是不是提前知道了？" : score < 250 ? "反应很快" : score < 350 ? "正常发挥" : "刚睡醒？";
    setPad("result", score + " ms", comment + " · 点击再试一次");
    document.querySelector("#last-score").textContent = score + " ms";
    if (best === null || score < best) {
      best = score;
      try { sessionStorage.setItem("boring-lab-best", String(best)); } catch (_) {}
      showBest();
    }
  } else {
    setPad("waiting", "等它变色再点！", "保持专注，绿色随时会出现……");
    timer = setTimeout(() => {
      readyFrame = requestAnimationFrame(() => {
        setPad("ready", "就是现在！", "快点！");
        startedAt = performance.now();
      });
    }, 1500 + Math.random() * 3500);
  }
}
pad.addEventListener("pointerdown", event => {
  if (event.isPrimary && event.button === 0) { event.preventDefault(); pad.focus(); play(); }
});
pad.addEventListener("keydown", event => {
  if ((event.code === "Space" || event.code === "Enter") && !event.repeat) { event.preventDefault(); play(); }
});
// 支持辅助技术触发的虚拟点击，避免与真实指针重复计分。
pad.addEventListener("click", event => { if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) play(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (state === "waiting" || state === "ready")) {
    cancelWait();
    setPad("idle", "这轮先暂停", "切换页面会影响计时。点击重新开始。");
  }
});
addEventListener("pagehide", cancelWait);
