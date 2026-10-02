"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const entry = $("password-entry"), session = $("password-session");
  const error = $("password-error"), ready = $("password-ready");
  const input = $("password-digits"), submit = $("password-submit"), form = $("password-play-form");
  const reconnect = $("password-reconnect"), status = $("password-status");
  const players = [$("password-player-left"), $("password-player-right")];
  const names = ["青柠队", "蓝莓队"];
  const storageKey = "boring-lab-password-online-v1";
  let identity = null, socket = null, snapshot = null, generation = 0, quitting = false;
  let pending = false;
  function showError(message) { error.textContent = message; error.hidden = !message; }
  function save() {
    try { if (identity) localStorage.setItem(storageKey, JSON.stringify(identity)); else localStorage.removeItem(storageKey); } catch {}
  }
  function shareUrl(room) {
    const url = new URL("/password-online.html", location.href);
    url.searchParams.set("room", room);
    return url.toString();
  }
  function showSession() {
    entry.hidden = true; session.hidden = false; showError("");
    $("password-room-code").textContent = identity.room;
    $("password-share-link").value = shareUrl(identity.room);
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
    const turn = ++generation; quitting = false; snapshot = null; pending = false;
    input.disabled = submit.disabled = true; ready.disabled = true; reconnect.hidden = true;
    status.textContent = "正在连接房间……";
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/password`);
    socket = ws;
    ws.onopen = () => { if (turn === generation) ws.send(JSON.stringify({type:"auth",room:identity.room,token:identity.token})); };
    ws.onmessage = event => {
      if (turn !== generation) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "closed") { showError(message.message); reset(false); return; }
      if (message.type === "error") { pending = false; showError(message.message); if (snapshot) render(); return; }
      if (message.type !== "state" || message.room !== identity.room || message.self !== identity.side) return;
      const changed = !snapshot || snapshot.round !== message.round || snapshot.move !== message.move;
      if (changed) input.value = "";
      snapshot = message;
      pending = false;
      render();
    };
    ws.onclose = event => {
      if (turn !== generation || quitting) return;
      if (event.code === 1000 && event.reason === "Room closed") { reset(false); showError("房主已离开，房间关闭。"); return; }
      snapshot = null; input.disabled = submit.disabled = true; ready.disabled = true;
      reconnect.hidden = false;
      status.textContent = event.code === 1008 ? "房间已过期或身份失效，可以离开后重新创建。" : "连接中断，请点“重新连接”。";
    };
  }
  function render() {
    const s = snapshot, side = identity.side, mineReady = side ? s.rightReady : s.leftReady;
    const both = s.leftConnected && s.rightConnected;
    players.forEach((element, index) => {
      const connected = s[index ? "rightConnected" : "leftConnected"];
      const locked = s[index ? "rightReady" : "leftReady"];
      element.textContent = `${names[index]} · ${index === side ? "你" : "对方"} · ${connected ? "在线" : "离线"}${s.phase === "waiting" && locked ? " · 密码已锁定" : ""}`;
    });
    form.hidden = s.phase === "finished";
    $("password-input-label").textContent = s.phase === "waiting" ? "设定你的秘密密码" : "猜对方的四位密码";
    input.type = s.phase === "waiting" ? "password" : "text";
    input.disabled = submit.disabled = pending || (s.phase === "waiting" ? mineReady : s.phase !== "playing" || s.turn !== side || !both);
    submit.textContent = s.phase === "waiting" ? mineReady ? "密码已锁定" : "锁定密码并准备" : "提交猜测";
    ready.hidden = s.phase !== "finished";
    ready.disabled = mineReady;
    ready.textContent = mineReady ? "已准备，等待对方" : "再来一局";
    const count = s.history.filter(g => g.side === side).length;
    $("password-cue").textContent = s.phase === "waiting" ? "先藏好你的密码。"
      : s.phase === "finished" ? s.winner === -1 ? "这局平手！" : s.winner === side ? "密码破译成功！" : "对方先破译了！"
      : !both ? "对局暂停，等朋友回来。" : s.turn === side ? "轮到你推理了。" : "对方正在推理……";
    $("password-hint").textContent = s.phase === "waiting" ? "四个不重复的数字，允许 0 开头。锁定后本局不能修改。"
      : s.phase === "finished" ? `青柠队的密码：${s.leftSecret} · 蓝莓队的密码：${s.rightSecret}`
      : s.firstSolved ? "先手已猜中！后手本轮还有一次机会，猜中即平局。" : `你已猜 ${count} / 20 次 · 慢慢想，没有倒计时`;
    status.textContent = s.notice || (s.phase === "waiting" ? mineReady ? "你的密码已锁定，等待对方设定。" : "双方锁定密码后自动开始。" : s.phase === "finished" ? "双方点击再来一局，交换先后手并重新设密码。" : "A = 数字和位置都对；B = 数字对，位置不对。两列分别记录你们的推理。");
    [0,1].forEach(index => {
      const list = $(index ? "password-right-history" : "password-left-history");
      list.replaceChildren();
      const guesses = s.history.filter(g => g.side === index);
      if (!guesses.length) { const empty = document.createElement("li"); empty.className = "empty"; empty.textContent = "还没有猜测"; list.append(empty); }
      guesses.forEach((g, i) => {
        const row = document.createElement("li");
        const number = document.createElement("span"); number.textContent = String(i+1).padStart(2,"0");
        const digits = document.createElement("strong"); digits.textContent = g.digits;
        const hint = document.createElement("b"); hint.textContent = `${g.exact}A ${g.misplaced}B`;
        hint.title = `${g.exact} 个数字和位置都对，${g.misplaced} 个数字对但位置不对`;
        if (g.exact === 4) row.className = "solved";
        row.append(number, digits, hint); list.append(row);
      });
    });
  }
  function reset(leave) {
    generation++; quitting = true;
    if (leave && socket?.readyState === WebSocket.OPEN) socket.send('{"type":"leave"}');
    socket?.close(); socket = null; identity = null; snapshot = null; pending = false; input.value = ""; save();
    session.hidden = true; entry.hidden = false;
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  async function startSession(makeRoom) {
    if (identity) return;
    const create = $("password-create"), join = $("password-join-form").querySelector("button");
    create.disabled = join.disabled = true; showError("");
    try {
      const code = $("password-code").value.trim().toUpperCase();
      if (!makeRoom && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("请输入正确的六位房间码。");
      identity = await api(makeRoom ? "/api/password/rooms" : "/api/password/join", makeRoom ? {} : {room:code});
      save(); showSession(); connect();
    } catch (reason) { showError(reason.name === "AbortError" ? "连接超时，请稍后再试。" : reason.message || "连接失败，请重试。"); }
    finally { create.disabled = join.disabled = false; }
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (submit.disabled || !snapshot || socket?.readyState !== WebSocket.OPEN) return;
    const digits = input.value.trim();
    if (!/^\d{4}$/.test(digits) || new Set(digits).size !== 4) { showError("请输入四个不重复的数字，例如 0123。"); return; }
    showError(""); pending = true; submit.disabled = true;
    socket.send(JSON.stringify(snapshot.phase === "waiting" ? {type:"secret",digits} : {type:"guess",digits,round:snapshot.round,move:snapshot.move}));
    input.value = "";
  });
  $("password-create").addEventListener("click", () => startSession(true));
  $("password-join-form").addEventListener("submit", event => { event.preventDefault(); startSession(false); });
  $("password-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("password-share-link").value); $("password-copy").textContent = "已复制"; }
    catch { $("password-share-link").focus(); $("password-share-link").select(); status.textContent = "自动复制失败，长按链接手动复制。"; }
  });
  ready.addEventListener("click", () => {
    if (!ready.disabled && socket?.readyState === WebSocket.OPEN) { ready.disabled = true; socket.send('{"type":"ready"}'); }
  });
  reconnect.addEventListener("click", connect);
  $("password-leave").addEventListener("click", () => reset(true));
  const urlCode = new URLSearchParams(location.search).get("room");
  if (urlCode && /^[A-HJ-NP-Z2-9]{6}$/i.test(urlCode)) $("password-code").value = urlCode.toUpperCase();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && /^[A-HJ-NP-Z2-9]{6}$/.test(saved.room) && /^[0-9a-f]{32}$/.test(saved.token)
        && [0, 1].includes(saved.side) && (!urlCode || saved.room === urlCode.toUpperCase())) {
      identity = saved; showSession(); connect();
    }
  } catch {}
})();
