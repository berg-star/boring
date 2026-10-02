"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const entry = $("word-entry"), session = $("word-session"), error = $("word-error");
  const select = $("word-select"), submit = $("word-submit"), form = $("word-play-form");
  const ready = $("word-ready"), reconnect = $("word-reconnect"), status = $("word-status");
  const players = [$("word-player-left"), $("word-player-right")];
  const names = ["青柠队", "蓝莓队"], storageKey = "boring-lab-word-online-v1";
  let identity = null, socket = null, snapshot = null, generation = 0, quitting = false, pending = false, mode = "ask";
  function showError(message) { error.textContent = message; error.hidden = !message; }
  function save() {
    try { if (identity) localStorage.setItem(storageKey, JSON.stringify(identity)); else localStorage.removeItem(storageKey); } catch {}
  }
  function shareUrl(room) {
    const url = new URL("/word-online.html", location.href);
    url.searchParams.set("room", room);
    return url.toString();
  }
  function showSession() {
    entry.hidden = true; session.hidden = false; showError("");
    $("word-room-code").textContent = identity.room;
    $("word-share-link").value = shareUrl(identity.room);
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
    select.disabled = submit.disabled = ready.disabled = true; reconnect.hidden = true;
    status.textContent = "正在连接房间……";
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/word`);
    socket = ws;
    ws.onopen = () => { if (turn === generation) ws.send(JSON.stringify({type:"auth",room:identity.room,token:identity.token})); };
    ws.onmessage = event => {
      if (turn !== generation) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "error") { pending = false; showError(message.message); if (snapshot) render(); return; }
      if (message.type !== "state" || message.room !== identity.room || message.self !== identity.side) return;
      const newCase = !snapshot || snapshot.run !== message.run;
      const myCount = identity.side ? message.rightCount : message.leftCount;
      const actionDone = !newCase && myCount !== (identity.side ? snapshot.rightCount : snapshot.leftCount);
      if (newCase || actionDone) { select.value = ""; showError(""); }
      snapshot = message; pending = false;
      render(newCase || actionDone);
    };
    ws.onclose = event => {
      if (turn !== generation || quitting) return;
      if (event.code === 1000 && event.reason === "Room closed") { reset(false); showError("房主已离开，房间关闭。"); return; }
      snapshot = null; select.disabled = submit.disabled = ready.disabled = true;
      reconnect.hidden = false;
      status.textContent = event.code === 1008 ? "房间已过期或身份失效，可以离开后重新创建。" : "连接中断，请点“重新连接”。";
    };
  }
  function render(clearSelection = false) {
    const s = snapshot, side = identity.side, both = s.leftConnected && s.rightConnected;
    const mine = side ? s.rightSolved : s.leftSolved, other = side ? s.leftSolved : s.rightSolved;
    const myCount = side ? s.rightCount : s.leftCount;
    players.forEach((element, index) => {
      const connected = s[index ? "rightConnected" : "leftConnected"];
      const count = s[index ? "rightCount" : "leftCount"];
      const solved = s[index ? "rightSolved" : "leftSolved"];
      element.textContent = `${names[index]} · ${index === side ? "你" : "对方"} · ${connected ? "在线" : "离线"} · ${count}/10${solved ? " · 已猜中" : ""}`;
    });
    $("word-cue").textContent = s.phase === "finished" ? s.winner === -1 ? "平局！" : s.winner === side ? "你赢啦！" : "对方赢啦！"
      : !both ? "等朋友进入房间。" : s.turn === side ? "轮到你行动。" : "对方正在思考……";
    $("word-hint").textContent = s.phase === "finished" ? `隐藏词是「${s.answer}」。双方准备好可以再玩。`
      : mine ? "你已猜中！等对方完成这一轮。" : other ? "对方已猜中，这一轮还有一次机会。" : "问是非问题，或直接从候选词里猜一个。";
    const canAct = s.phase === "playing" && both && s.turn === side && !mine && !pending;
    form.hidden = s.phase === "finished";
    ready.hidden = s.phase !== "finished";
    ready.disabled = side ? s.rightReady : s.leftReady;
    ready.textContent = ready.disabled ? "已准备，等待对方" : "再来一局";
    $("word-mode-ask").classList.toggle("selected", mode === "ask");
    $("word-mode-guess").classList.toggle("selected", mode === "guess");
    $("word-mode-ask").setAttribute("aria-pressed", String(mode === "ask"));
    $("word-mode-guess").setAttribute("aria-pressed", String(mode === "guess"));
    $("word-select-label").textContent = mode === "ask" ? "选择一个“是或否”问题" : "选择你要猜的词";
    const old = clearSelection ? "" : select.value;
    select.replaceChildren();
    const hint = document.createElement("option"); hint.value = ""; hint.textContent = mode === "ask" ? "请选择一个问题" : "请选择一个候选词";
    select.append(hint);
    (mode === "ask" ? s.questions : s.words).forEach((label, id) => {
      const option = document.createElement("option"); option.value = String(id); option.textContent = label;
      option.disabled = s.history.some(step => step.kind === mode && step.id === id);
      select.append(option);
    });
    if (old && !select.querySelector(`option[value="${old}"]`)?.disabled) select.value = old;
    select.disabled = !canAct;
    submit.disabled = !canAct || !select.value;
    submit.textContent = mode === "ask" ? "确认提问" : "确认猜词";
    const eliminated = new Set(s.history.filter(step => step.kind === "guess" && !step.yes).map(step => step.id));
    const words = $("word-words"); words.replaceChildren();
    s.words.forEach((word, index) => {
      const span = document.createElement("span"); span.className = "word-chip" + (eliminated.has(index) ? " eliminated" : "");
      span.textContent = word; words.append(span);
    });
    const history = $("word-history-list"); history.replaceChildren();
    if (!s.history.length) { const item = document.createElement("li"); item.className = "empty"; item.textContent = "还没有行动"; history.append(item); }
    s.history.forEach((step, index) => {
      const item = document.createElement("li"); if (!step.yes) item.className = "negative";
      const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2, "0");
      const label = document.createElement("strong"); label.textContent = step.kind === "ask" ? s.questions[step.id] : `猜「${s.words[step.id]}」`;
      const response = document.createElement("b"); response.textContent = step.kind === "ask" ? step.yes ? "是" : "否" : step.yes ? "猜中了" : "猜错了";
      item.append(number, label, response); history.append(item);
    });
    status.textContent = s.notice || (s.phase === "finished" ? s.winner === -1 ? "双方都猜中或都没有猜中，再来一次？" : `${names[s.winner]}猜中了！再来一次？`
      : !both ? "把链接发给朋友，等他加入；断线进度会保留。" : s.turn === side ? `你用了 ${myCount}/10 次行动，想好这次问什么。` : `你用了 ${myCount}/10 次行动，等对方完成本轮。`);
  }
  function reset(leave) {
    generation++; quitting = true;
    if (leave && socket?.readyState === WebSocket.OPEN) socket.send('{"type":"leave"}');
    socket?.close(); socket = null; identity = null; snapshot = null; pending = false; select.value = ""; save();
    session.hidden = true; entry.hidden = false;
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  async function startSession(makeRoom) {
    if (identity) return;
    const create = $("word-create"), join = $("word-join-form").querySelector("button");
    create.disabled = join.disabled = true; showError("");
    try {
      const code = $("word-code").value.trim().toUpperCase();
      if (!makeRoom && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("请输入正确的六位房间码。");
      identity = await api(makeRoom ? "/api/word/rooms" : "/api/word/join", makeRoom ? {} : {room:code});
      save(); showSession(); connect();
    } catch (reason) { showError(reason.name === "AbortError" ? "连接超时，请稍后再试。" : reason.message || "连接失败，请重试。"); }
    finally { create.disabled = join.disabled = false; }
  }
  $("word-mode-ask").addEventListener("click", () => { mode = "ask"; if (snapshot) render(true); });
  $("word-mode-guess").addEventListener("click", () => { mode = "guess"; if (snapshot) render(true); });
  select.addEventListener("change", () => { submit.disabled = !select.value || !snapshot || snapshot.turn !== identity.side || pending; });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (submit.disabled || !snapshot || socket?.readyState !== WebSocket.OPEN) return;
    const id = Number(select.value);
    if (!select.value || !Number.isInteger(id)) return;
    showError(""); pending = true; submit.disabled = true;
    socket.send(JSON.stringify({type:mode,id,move:snapshot.move,run:snapshot.run}));
  });
  $("word-create").addEventListener("click", () => startSession(true));
  $("word-join-form").addEventListener("submit", event => { event.preventDefault(); startSession(false); });
  $("word-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("word-share-link").value); $("word-copy").textContent = "已复制"; }
    catch { $("word-share-link").focus(); $("word-share-link").select(); status.textContent = "自动复制失败，长按链接手动复制。"; }
  });
  ready.addEventListener("click", () => {
    if (!ready.disabled && socket?.readyState === WebSocket.OPEN) { ready.disabled = true; socket.send('{"type":"ready"}'); }
  });
  reconnect.addEventListener("click", connect);
  $("word-leave").addEventListener("click", () => reset(true));
  const urlCode = new URLSearchParams(location.search).get("room");
  if (urlCode && /^[A-HJ-NP-Z2-9]{6}$/i.test(urlCode)) $("word-code").value = urlCode.toUpperCase();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && /^[A-HJ-NP-Z2-9]{6}$/.test(saved.room) && /^[0-9a-f]{32}$/.test(saved.token)
        && [0, 1].includes(saved.side) && (!urlCode || saved.room === urlCode.toUpperCase())) {
      identity = saved; showSession(); connect();
    }
  } catch {}
})();
