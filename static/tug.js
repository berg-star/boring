"use strict";
(() => {
  const arena = document.getElementById("tug-arena");
  const buttons = [document.getElementById("pull-left"), document.getElementById("pull-right")];
  const feedback = [document.getElementById("feedback-left"), document.getElementById("feedback-right")];
  const start = document.getElementById("tug-start"), pauseButton = document.getElementById("tug-pause");
  const status = document.getElementById("tug-status"), time = document.getElementById("tug-time"), cue = document.getElementById("tug-cue");
  const names = ["青柠队", "蓝莓队"], duration = 20000, interval = 850, windowMs = 170, limit = 40;
  let mode = "rhythm", state = "idle", previousState, pausedAt, countdownAt, runningAt;
  let scores = [0, 0], usedBeat = [-1, -1], lastTap = [-Infinity, -Infinity];
  let frameId = 0;
  const pointers = new Map(), heldKeys = new Set();
  function setState(next) {
    state = next; arena.dataset.state = next;
    buttons.forEach(b => b.disabled = next !== "running");
    pauseButton.disabled = !["running", "countdown", "paused"].includes(next);
    pauseButton.textContent = next === "paused" ? "继续比赛" : "暂停";
    start.textContent = ["running", "countdown", "paused"].includes(next) ? "重新开局" : next === "finished" ? "再来一局 ↻" : "开始拔河 · 3 秒准备";
  }
  function renderScore() {
    const position = Math.max(-limit, Math.min(limit, scores[1] - scores[0]));
    arena.dataset.position = position; arena.dataset.left = scores[0]; arena.dataset.right = scores[1];
    arena.style.setProperty("--pull", `${position}%`);
    arena.style.setProperty("--body-pull", `${position / 2}px`);
    return position;
  }
  function clearInput() { pointers.clear(); heldKeys.clear(); }
  function stopFrame() { cancelAnimationFrame(frameId); frameId = 0; arena.classList.remove("beat-open"); }
  function finish(winner) {
    setState("finished"); stopFrame(); clearInput();
    cue.textContent = winner === null ? "势均力敌" : `${names[winner]}胜利`;
    status.textContent = winner === null ? "平局！谁也没让谁，友谊保住了。" : `${names[winner]}赢啦！换个位置，再较量一局？`;
    arena.style.setProperty("--beat-opacity", 0);
  }
  function tick(now) {
    if (state === "countdown") {
      const remaining = 3000 - (now - countdownAt);
      cue.textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
      if (remaining <= 0) {
        runningAt = countdownAt + 3000; setState("running");
        status.textContent = mode === "rhythm" ? "盯住圆环，两边都能同时使劲！" : "各按各的按钮，每按一下就拉一把！";
      }
    }
    if (state === "running") {
      const elapsed = now - runningAt;
      time.textContent = (Math.max(0, duration - elapsed) / 1000).toFixed(1);
      if (elapsed >= duration) { finish(scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1); return; }
      if (mode === "rhythm") {
        const nearest = Math.max(0, Math.round((elapsed - 500) / interval));
        const diff = elapsed - (500 + nearest * interval);
        const open = Math.abs(diff) <= windowMs;
        arena.classList.toggle("beat-open", open);
        arena.style.setProperty("--beat-opacity", .8);
        arena.style.setProperty("--beat-scale", Math.min(2.6, 1 + Math.abs(diff) / 300));
        cue.textContent = open ? "现在，拉！" : "等圆环收拢";
      } else { cue.textContent = "每按一下，拉一把"; }
    }
    if (["countdown", "running"].includes(state)) frameId = requestAnimationFrame(tick);
  }
  function begin() {
    stopFrame(); clearInput(); scores = [0, 0]; usedBeat = [-1, -1]; lastTap = [-Infinity, -Infinity];
    renderScore(); time.textContent = "20.0"; feedback.forEach(f => f.textContent = "准备使劲");
    arena.style.setProperty("--beat-opacity", 0); setState("countdown"); countdownAt = performance.now();
    status.textContent = "三秒准备：青柠守左，蓝莓守右。"; tick(countdownAt);
  }
  function pull(side) {
    if (state !== "running") return;
    const now = performance.now(), elapsed = now - runningAt;
    if (elapsed >= duration) { tick(now); return; }
    let strength = 1;
    if (mode === "rhythm") {
      const beat = Math.max(0, Math.round((elapsed - 500) / interval));
      const distance = Math.abs(elapsed - (500 + beat * interval));
      if (distance > windowMs) { feedback[side].textContent = "早了或晚了，等下一拍"; return; }
      if (usedBeat[side] === beat) { feedback[side].textContent = "这一拍已经拉过啦"; return; }
      usedBeat[side] = beat;
      strength = distance <= 60 ? 5 : distance <= 110 ? 3 : 1;
      feedback[side].textContent = strength === 5 ? "正中节拍！+5" : strength === 3 ? "很准！+3" : "赶上了！+1";
    } else {
      if (now - lastTap[side] < 70) return;
      lastTap[side] = now; feedback[side].textContent = `使劲！已拉 ${scores[side] + 1} 下`;
    }
    scores[side] += strength;
    const position = renderScore();
    if (Math.abs(position) >= limit) finish(position < 0 ? 0 : 1);
  }
  buttons.forEach((button, side) => {
    button.addEventListener("pointerdown", e => {
      if (e.button !== 0 || state !== "running") return;
      e.preventDefault();
      if ([...pointers.values()].includes(side)) return;
      pointers.set(e.pointerId, side); button.setPointerCapture(e.pointerId); pull(side);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(event, e => pointers.delete(e.pointerId));
    button.addEventListener("contextmenu", e => e.preventDefault());
    button.addEventListener("keydown", e => {
      if (!["Space", "Enter"].includes(e.code)) return;
      e.preventDefault();
      const key = `${side}:${e.code}`;
      if (e.repeat || heldKeys.has(key)) return;
      heldKeys.add(key); pull(side);
    });
    button.addEventListener("keyup", e => {
      if (["Space", "Enter"].includes(e.code)) { e.preventDefault(); heldKeys.delete(`${side}:${e.code}`); }
    });
    // Keyboard/assistive activation uses click with detail=0. Mouse/touch already scored on pointerdown.
    button.addEventListener("click", e => { if (e.detail === 0) pull(side); });
  });
  addEventListener("keydown", e => {
    const side = e.code === "KeyA" ? 0 : e.code === "KeyL" ? 1 : -1;
    if (side < 0 || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    e.preventDefault(); if (e.repeat || heldKeys.has(e.code)) return;
    heldKeys.add(e.code); pull(side);
  });
  addEventListener("keyup", e => heldKeys.delete(e.code));
  function pause() {
    if (!["running", "countdown"].includes(state)) return;
    previousState = state; pausedAt = performance.now(); setState("paused"); stopFrame(); clearInput();
    cue.textContent = "休息一下"; status.textContent = "比赛已暂停，双方准备好后点“继续比赛”。";
  }
  pauseButton.addEventListener("click", () => {
    if (state !== "paused") { pause(); return; }
    const now = performance.now(), shift = now - pausedAt;
    if (previousState === "running") { runningAt += shift; lastTap = lastTap.map(t => t + shift); }
    else countdownAt += shift;
    setState(previousState); status.textContent = "继续！各守各的一边。"; tick(now);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  addEventListener("blur", pause);
  screen.orientation?.addEventListener("change", pause);
  start.addEventListener("click", begin);
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
    if (button.dataset.mode === mode) return;
    stopFrame(); clearInput(); mode = button.dataset.mode; setState("idle"); scores = [0, 0]; renderScore(); time.textContent = "20.0";
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    document.getElementById("tug-rule").textContent = mode === "rhythm" ? "圆环收拢、按钮亮起时各按一下；越准越有力，每拍只算一次。" : "各点各自的按钮，连点把红色标记拉过自己的线；同一侧多根手指也只算一次按下。";
    status.textContent = "两个人各守一边，拉过自己一侧的线就赢。"; cue.textContent = "准备好了吗";
    arena.style.setProperty("--beat-opacity", 0); feedback.forEach(f => f.textContent = "选手就位");
  }));
  const full = document.getElementById("tug-fullscreen"), room = document.querySelector(".tug-room");
  if (!room.requestFullscreen) { full.hidden = true; }
  else full.addEventListener("click", async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await room.requestFullscreen(); }
    catch { status.textContent = "浏览器暂不支持全屏，横着放也能正常玩。"; }
  });
  document.addEventListener("fullscreenchange", () => { full.textContent = document.fullscreenElement ? "退出全屏 ↙" : "赛场全屏 ↗"; pause(); });
  addEventListener("pagehide", () => { pause(); stopFrame(); });
  setState("idle");
})();
