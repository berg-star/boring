"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const entry = $("online-entry"), session = $("online-session"), error = $("online-error");
  const arena = $("online-arena"), status = $("online-status"), ready = $("online-ready"), reconnect = $("online-reconnect");
  const buttons = [$("online-pull-left"), $("online-pull-right")];
  const players = [$("online-player-left"), $("online-player-right")];
  const feedback = [$("online-feedback-left"), $("online-feedback-right")];
  const names = ["青柠队", "蓝莓队"], storageKey = "boring-lab-tug-online-v1";
  let identity = null, socket = null, snapshot = null, lastPull = -Infinity, activePointer = null, held = new Set(), generation = 0, quitting = false;
  function showError(text) { error.textContent = text; error.hidden = !text; }
  function save() { try { if (identity) localStorage.setItem(storageKey, JSON.stringify(identity)); else localStorage.removeItem(storageKey); } catch {} }
  function setInputs(enabled) {
    buttons.forEach((button, side) => button.disabled = !enabled || identity?.side !== side);
  }
  function shareUrl(code) { const url = new URL("/tug-online.html", location.href); url.searchParams.set("room", code); return url.toString(); }
  function showSession() {
    entry.hidden = true; session.hidden = false; showError("");
    $("online-room-code").textContent = identity.room;
    $("online-share-link").value = shareUrl(identity.room);
    if (location.search !== `?room=${identity.room}`) history.replaceState(null, "", `?room=${identity.room}`);
  }
  async function api(path, body) {
    const control = new AbortController(), timeout = setTimeout(() => control.abort(), 9000);
    try {
      const response = await fetch(path, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:control.signal,cache:"no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "房间暂时不可用。");
      return data;
    } finally { clearTimeout(timeout); }
  }
  function connect() {
    if (!identity || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    const turn = ++generation; quitting = false; snapshot = null; setInputs(false); ready.disabled = true;
    reconnect.hidden = true; status.textContent = "正在连接房间……";
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/tug`);
    socket = ws;
    ws.onopen = () => { if (turn === generation) ws.send(JSON.stringify({type:"auth",room:identity.room,token:identity.token})); };
    ws.onmessage = event => {
      if (turn !== generation) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "closed") { showError(message.message); reset(false); return; }
      if (message.type !== "state") return;
      snapshot = message; render();
    };
    ws.onclose = event => {
      if (turn !== generation || quitting) return;
      snapshot = null; setInputs(false); ready.disabled = true;
      reconnect.hidden = false;
      status.textContent = event.code === 1008 ? "房间已过期或登录失效，可以离开后重新创建。" : "连接中断，请点“重新连接”。";
    };
    ws.onerror = () => { /* 关闭事件负责提示。 */ };
  }
  function render() {
    const s = snapshot;
    if (!s || !identity) return;
    if (s.self !== identity.side || s.room !== identity.room) return;
    const position = Math.max(-40, Math.min(40, s.right - s.left));
    arena.dataset.position = String(position); arena.dataset.left = String(s.left); arena.dataset.right = String(s.right);
    arena.dataset.state = s.phase; arena.style.setProperty("--pull", `${position}%`);
    $("online-time").textContent = (Math.max(0, s.remainingMs) / 1000).toFixed(1);
    players.forEach((element, side) => element.textContent = `${names[side]} · ${side === identity.side ? "你" : s[side ? "rightConnected" : "leftConnected"] ? "已连接" : "等待连接"}${s[side ? "rightReady" : "leftReady"] && s.phase === "waiting" ? " · 已准备" : ""}`);
    const mineReady = identity.side === 0 ? s.leftReady : s.rightReady;
    ready.disabled = !["waiting", "finished"].includes(s.phase) || (s.phase === "waiting" && mineReady);
    ready.textContent = s.phase === "finished" ? "再来一局 · 我准备好了" : s.phase === "running" ? "正在比赛" : s.phase === "countdown" ? "马上开始" : mineReady ? "已准备，等待对方" : "我准备好了";
    setInputs(s.phase === "running" && socket?.readyState === WebSocket.OPEN);
    $("online-cue").textContent = s.phase === "countdown" ? `${Math.max(1,Math.ceil(s.remainingMs / 1000))}` : s.phase === "running" ? "连点拉绳！" : s.phase === "finished" ? "本局结束" : "等待双方准备";
    status.textContent = s.notice || (s.phase === "finished" ? s.winner === -1 ? "平局！再来一局？" : s.winner === identity.side ? "你赢啦！再来一局？" : "对方赢啦！再来一局？" : s.phase === "countdown" ? "双方已准备，倒数结束就开拉！" : s.phase === "running" ? "连续点击你的按钮，把红色标记拉过自己的线。" : s.leftConnected && s.rightConnected ? "两个人都在房间，准备好就开局。" : "把链接发给朋友，等他加入房间。" );
    feedback.forEach((element, side) => element.textContent = side === identity.side ? s.phase === "running" ? `已拉 ${side === 0 ? s.left : s.right} 次` : "这是你的按钮" : "这是对方的按钮");
  }
  function reset(leave) {
    generation++; quitting = true;
    if (leave && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type:"leave"}));
    socket?.close(); socket = null; identity = null; snapshot = null; save(); activePointer = null; held.clear();
    session.hidden = true; entry.hidden = false;
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  async function startSession(makeRoom) {
    if (identity) return;
    const create = $("online-create"), join = $("online-join-form").querySelector("button");
    create.disabled = join.disabled = true; showError("");
    try {
      const code = $("online-code").value.trim().toUpperCase();
      if (!makeRoom && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("请输入正确的六位房间码。");
      identity = await api(makeRoom ? "/api/tug/rooms" : "/api/tug/join", makeRoom ? {} : {room:code});
      save(); showSession(); connect();
    } catch (reason) { showError(reason.name === "AbortError" ? "连接超时，请稍后再试。" : reason.message || "连接失败，请重试。"); }
    finally { create.disabled = join.disabled = false; }
  }
  $("online-create").addEventListener("click", () => startSession(true));
  $("online-join-form").addEventListener("submit", event => { event.preventDefault(); startSession(false); });
  $("online-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("online-share-link").value); $("online-copy").textContent = "已复制"; }
    catch { $("online-share-link").focus(); $("online-share-link").select(); status.textContent = "自动复制失败，长按链接手动复制。"; }
  });
  ready.addEventListener("click", () => { if (socket?.readyState === WebSocket.OPEN) socket.send('{"type":"ready"}'); });
  reconnect.addEventListener("click", connect);
  $("online-leave").addEventListener("click", () => { reset(true); showError(""); });
  function pull() {
    if (!identity || socket?.readyState !== WebSocket.OPEN || snapshot?.phase !== "running") return;
    const now = performance.now(); if (now - lastPull < 70) return;
    lastPull = now; socket.send('{"type":"pull"}');
  }
  buttons.forEach((button, side) => {
    button.addEventListener("pointerdown", e => {
      if (button.disabled || e.button !== 0 || activePointer !== null) return;
      e.preventDefault(); activePointer = e.pointerId; button.setPointerCapture(e.pointerId); pull();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(name, e => { if (activePointer === e.pointerId) activePointer = null; });
    button.addEventListener("contextmenu", e => e.preventDefault());
    button.addEventListener("keydown", e => {
      if (!["Enter", "Space"].includes(e.code)) return;
      e.preventDefault(); if (button.disabled || e.repeat || held.has(e.code)) return;
      held.add(e.code); pull();
    });
    button.addEventListener("keyup", e => { if (["Enter", "Space"].includes(e.code)) { e.preventDefault(); held.delete(e.code); } });
    button.addEventListener("click", e => { if (e.detail === 0 && !held.size && !button.disabled) pull(); });
  });
  const urlCode = new URLSearchParams(location.search).get("room");
  if (urlCode && /^[A-HJ-NP-Z2-9]{6}$/i.test(urlCode)) $("online-code").value = urlCode.toUpperCase();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && /^[A-HJ-NP-Z2-9]{6}$/.test(saved.room) && /^[0-9a-f]{32}$/.test(saved.token) && [0,1].includes(saved.side) && (!urlCode || saved.room === urlCode.toUpperCase())) {
      identity = saved; showSession(); connect();
    }
  } catch {}
})();
