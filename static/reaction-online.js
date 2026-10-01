"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const entry = $("reaction-entry"), session = $("reaction-session");
  const error = $("reaction-error"), pad = $("reaction-pad"), ready = $("reaction-ready");
  const reconnect = $("reaction-reconnect"), status = $("reaction-status");
  const players = [$("reaction-player-left"), $("reaction-player-right")];
  const names = ["青柠队", "蓝莓队"];
  const storageKey = "boring-lab-reaction-online-v1";
  let identity = null, socket = null, snapshot = null, sentTap = false, generation = 0, quitting = false;
  let held = new Set();
  function showError(message) { error.textContent = message; error.hidden = !message; }
  function save() {
    try { if (identity) localStorage.setItem(storageKey, JSON.stringify(identity)); else localStorage.removeItem(storageKey); } catch {}
  }
  function shareUrl(room) {
    const url = new URL("/reaction-online.html", location.href);
    url.searchParams.set("room", room);
    return url.toString();
  }
  function showSession() {
    entry.hidden = true; session.hidden = false; showError("");
    $("reaction-room-code").textContent = identity.room;
    $("reaction-share-link").value = shareUrl(identity.room);
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
    const turn = ++generation; quitting = false; snapshot = null; sentTap = false;
    pad.disabled = true; ready.disabled = true; reconnect.hidden = true;
    status.textContent = "正在连接房间……";
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/reaction`);
    socket = ws;
    ws.onopen = () => { if (turn === generation) ws.send(JSON.stringify({type:"auth",room:identity.room,token:identity.token})); };
    ws.onmessage = event => {
      if (turn !== generation) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "closed") { showError(message.message); reset(false); return; }
      if (message.type !== "state" || message.room !== identity.room || message.self !== identity.side) return;
      if (snapshot?.phase !== message.phase && message.phase === "countdown") sentTap = false;
      snapshot = message; render();
    };
    ws.onclose = event => {
      if (turn !== generation || quitting) return;
      snapshot = null; pad.disabled = true; ready.disabled = true;
      reconnect.hidden = false;
      status.textContent = event.code === 1008 ? "房间已过期或身份失效，可以离开后重新创建。" : "连接中断，请点“重新连接”。";
    };
  }
  function format(ms) { return ms < 0 ? "—" : `${ms} ms`; }
  function render() {
    const s = snapshot, side = identity.side;
    const myResult = side === 0 ? s.leftMs : s.rightMs;
    players.forEach((element, index) => {
      const connected = s[index ? "rightConnected" : "leftConnected"];
      const isReady = s[index ? "rightReady" : "leftReady"];
      element.textContent = `${names[index]} · ${index === side ? "你" : connected ? "已连接" : "等待连接"}${isReady && s.phase === "waiting" ? " · 已准备" : ""}`;
    });
    $("reaction-left-ms").textContent = s.falseStart === 0 ? "抢跑" : format(s.leftMs);
    $("reaction-right-ms").textContent = s.falseStart === 1 ? "抢跑" : format(s.rightMs);
    pad.className = "reaction-pad reaction-online-pad " + s.phase;
    pad.disabled = !["countdown", "armed", "go"].includes(s.phase) || myResult >= 0 || sentTap;
    const mineReady = side ? s.rightReady : s.leftReady;
    ready.disabled = !["waiting", "finished"].includes(s.phase) || (s.phase === "waiting" && mineReady);
    ready.textContent = s.phase === "finished" ? "再来一局 · 我准备好了" : mineReady ? "已准备，等待对方" : "我准备好了";
    if (s.phase === "countdown") {
      $("reaction-cue").textContent = String(Math.max(1, Math.ceil(s.remainingMs / 1000)));
      $("reaction-hint").textContent = "先别按！倒数后还要等绿灯";
    } else if (s.phase === "armed") {
      $("reaction-cue").textContent = "等绿灯……";
      $("reaction-hint").textContent = "提前按会判负";
    } else if (s.phase === "go") {
      $("reaction-cue").textContent = "现在点！";
      $("reaction-hint").textContent = myResult >= 0 || sentTap ? "已记录，等待对方" : "快按下去！";
    } else if (s.phase === "finished") {
      $("reaction-cue").textContent = s.falseStart >= 0 ? "抢跑！" : s.winner < 0 ? "平局！" : s.winner === side ? "你赢啦！" : "对方赢啦！";
      $("reaction-hint").textContent = "双方都点准备，就能再来一局";
    } else {
      $("reaction-cue").textContent = "等待双方准备";
      $("reaction-hint").textContent = "两部手机，共用一个房间";
    }
    status.textContent = s.notice || (s.phase === "finished"
      ? s.falseStart >= 0 ? `${names[s.falseStart]}抢跑，${names[s.winner]}获胜。`
        : s.winner < 0 ? "这轮平局，再来一次？" : `${names[s.winner]}更快！再来一局？`
      : s.phase === "go" ? "服务器已发出信号，正在记录双方反应时间。"
      : s.phase === "countdown" || s.phase === "armed" ? "看到绿色再点，提前按会判负。"
      : s.leftConnected && s.rightConnected ? "双方都在房间，准备好就开局。" : "把链接发给朋友，等他加入房间。");
  }
  function reset(leave) {
    generation++; quitting = true;
    if (leave && socket?.readyState === WebSocket.OPEN) socket.send('{"type":"leave"}');
    socket?.close(); socket = null; identity = null; snapshot = null; sentTap = false; held.clear(); save();
    session.hidden = true; entry.hidden = false;
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  async function startSession(makeRoom) {
    if (identity) return;
    const create = $("reaction-create"), join = $("reaction-join-form").querySelector("button");
    create.disabled = join.disabled = true; showError("");
    try {
      const code = $("reaction-code").value.trim().toUpperCase();
      if (!makeRoom && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("请输入正确的六位房间码。");
      identity = await api(makeRoom ? "/api/reaction/rooms" : "/api/reaction/join", makeRoom ? {} : {room:code});
      save(); showSession(); connect();
    } catch (reason) { showError(reason.name === "AbortError" ? "连接超时，请稍后再试。" : reason.message || "连接失败，请重试。"); }
    finally { create.disabled = join.disabled = false; }
  }
  function tap() {
    if (pad.disabled || !snapshot || !["countdown", "armed", "go"].includes(snapshot.phase)
        || socket?.readyState !== WebSocket.OPEN || sentTap) return;
    sentTap = true; pad.disabled = true; socket.send('{"type":"tap"}');
  }
  $("reaction-create").addEventListener("click", () => startSession(true));
  $("reaction-join-form").addEventListener("submit", event => { event.preventDefault(); startSession(false); });
  $("reaction-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("reaction-share-link").value); $("reaction-copy").textContent = "已复制"; }
    catch { $("reaction-share-link").focus(); $("reaction-share-link").select(); status.textContent = "自动复制失败，长按链接手动复制。"; }
  });
  ready.addEventListener("click", () => {
    if (!ready.disabled && socket?.readyState === WebSocket.OPEN) { ready.disabled = true; socket.send('{"type":"ready"}'); }
  });
  reconnect.addEventListener("click", connect);
  $("reaction-leave").addEventListener("click", () => reset(true));
  pad.addEventListener("pointerdown", event => {
    if (event.isPrimary && event.button === 0 && !pad.disabled) { event.preventDefault(); tap(); }
  });
  pad.addEventListener("keydown", event => {
    if (!["Space", "Enter"].includes(event.code)) return;
    event.preventDefault();
    if (event.repeat || held.has(event.code)) return;
    held.add(event.code); tap();
  });
  pad.addEventListener("keyup", event => {
    if (["Space", "Enter"].includes(event.code)) { event.preventDefault(); held.delete(event.code); }
  });
  pad.addEventListener("click", event => {
    if (event.detail === 0 && event.clientX === 0 && event.clientY === 0 && !held.size) tap();
  });
  pad.addEventListener("contextmenu", event => event.preventDefault());
  const urlCode = new URLSearchParams(location.search).get("room");
  if (urlCode && /^[A-HJ-NP-Z2-9]{6}$/i.test(urlCode)) $("reaction-code").value = urlCode.toUpperCase();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && /^[A-HJ-NP-Z2-9]{6}$/.test(saved.room) && /^[0-9a-f]{32}$/.test(saved.token)
        && [0, 1].includes(saved.side) && (!urlCode || saved.room === urlCode.toUpperCase())) {
      identity = saved; showSession(); connect();
    }
  } catch {}
})();
