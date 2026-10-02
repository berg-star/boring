"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const entry = $("puzzle-entry"), session = $("puzzle-session"), error = $("puzzle-error");
  const input = $("puzzle-answer"), submit = $("puzzle-submit"), form = $("puzzle-play-form");
  const ready = $("puzzle-ready"), reconnect = $("puzzle-reconnect"), status = $("puzzle-status");
  const players = [$("puzzle-player-left"), $("puzzle-player-right")];
  const names = ["青柠队", "蓝莓队"], chapters = ["符号门", "档案柜", "控制台"];
  const storageKey = "boring-lab-puzzle-online-v1";
  let identity = null, socket = null, snapshot = null, generation = 0, quitting = false, pending = false;
  function showError(message) { error.textContent = message; error.hidden = !message; }
  function save() {
    try { if (identity) localStorage.setItem(storageKey, JSON.stringify(identity)); else localStorage.removeItem(storageKey); } catch {}
  }
  function shareUrl(room) {
    const url = new URL("/puzzle-online.html", location.href);
    url.searchParams.set("room", room);
    return url.toString();
  }
  function showSession() {
    entry.hidden = true; session.hidden = false; showError("");
    $("puzzle-room-code").textContent = identity.room;
    $("puzzle-share-link").value = shareUrl(identity.room);
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
    input.disabled = submit.disabled = ready.disabled = true; reconnect.hidden = true;
    status.textContent = "正在连接房间……";
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/puzzle`);
    socket = ws;
    ws.onopen = () => { if (turn === generation) ws.send(JSON.stringify({type:"auth",room:identity.room,token:identity.token})); };
    ws.onmessage = event => {
      if (turn !== generation) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "error") { pending = false; showError(message.message); if (snapshot) render(); return; }
      if (message.type !== "state" || message.room !== identity.room || message.self !== identity.side) return;
      if (!snapshot || snapshot.run !== message.run || snapshot.stage !== message.stage) {
        input.value = ""; showError("");
      }
      snapshot = message; pending = false;
      render();
    };
    ws.onclose = event => {
      if (turn !== generation || quitting) return;
      if (event.code === 1000 && event.reason === "Room closed") { reset(false); showError("房主已离开，房间关闭。"); return; }
      snapshot = null; input.disabled = submit.disabled = ready.disabled = true;
      reconnect.hidden = false;
      status.textContent = event.code === 1008 ? "房间已过期或身份失效，可以离开后重新创建。" : "连接中断，请点“重新连接”。";
    };
  }
  function render() {
    const s = snapshot, side = identity.side, both = s.leftConnected && s.rightConnected;
    const mine = side ? s.rightApproved : s.leftApproved, other = side ? s.leftApproved : s.rightApproved;
    players.forEach((element, index) => {
      const connected = s[index ? "rightConnected" : "leftConnected"];
      const approved = s[index ? "rightApproved" : "leftApproved"];
      element.textContent = `${names[index]} · ${index === side ? "你" : "队友"} · ${connected ? "在线" : "离线"}${s.phase === "playing" && approved ? " · 已解开" : ""}`;
    });
    for (let index = 0; index < 3; index++) $("puzzle-step-" + index).className = index < s.stage ? "done" : index === s.stage ? "active" : "";
    $("puzzle-chapter").textContent = s.phase === "finished" ? "密室已开启" : `第 ${s.stage + 1} 关 / ${chapters[s.stage]}`;
    $("puzzle-cue").textContent = s.phase === "finished" ? "三道门都打开了！" : !both ? "等队友一起读线索。" : mine ? "你已解开这道锁。" : "两份线索，拼成一个答案。";
    $("puzzle-guide").textContent = s.phase === "finished" ? "配合成功！再来一局会生成新的谜题。" : mine ? "等待队友输入同一个答案。" : "把你看到的线索说给朋友听，再听他说他的部分。";
    $("puzzle-role").textContent = side ? "你的线索 · 蓝莓档案" : "你的线索 · 青柠档案";
    $("puzzle-clue").textContent = s.phase === "finished" ? "任务完成。你们的配合刚刚好。" : s.clue;
    form.hidden = s.phase === "finished";
    const needed = s.stage === 2 ? 2 : 4;
    input.maxLength = needed; input.minLength = needed;
    input.inputMode = s.stage === 1 ? "text" : "numeric";
    input.placeholder = s.stage === 1 ? "四个字母" : s.stage === 2 ? "两位数字" : "四位数字";
    input.disabled = submit.disabled = pending || s.phase !== "playing" || !both || mine;
    submit.textContent = mine ? "已解开，等待队友" : "提交答案";
    ready.hidden = s.phase !== "finished";
    ready.disabled = mine;
    ready.textContent = mine ? "已准备，等待队友" : "再解一次";
    const wrong = side ? s.rightAttempts : s.leftAttempts;
    status.textContent = s.notice || (s.phase === "finished" ? "双方点“再解一次”会生成新的谜题。" : !both ? "邀请朋友加入或等待他重新连接。" : mine ? "你答对了。" + (other ? "正在打开下一道门……" : "等队友输入答案。") : `你本关尝试了 ${wrong} 次；没有倒计时，可以慢慢讨论。`);
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
    const create = $("puzzle-create"), join = $("puzzle-join-form").querySelector("button");
    create.disabled = join.disabled = true; showError("");
    try {
      const code = $("puzzle-code").value.trim().toUpperCase();
      if (!makeRoom && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("请输入正确的六位房间码。");
      identity = await api(makeRoom ? "/api/puzzle/rooms" : "/api/puzzle/join", makeRoom ? {} : {room:code});
      save(); showSession(); connect();
    } catch (reason) { showError(reason.name === "AbortError" ? "连接超时，请稍后再试。" : reason.message || "连接失败，请重试。"); }
    finally { create.disabled = join.disabled = false; }
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (submit.disabled || !snapshot || socket?.readyState !== WebSocket.OPEN) return;
    const answer = input.value.trim().toUpperCase(), stage = snapshot.stage;
    if (!(stage === 1 ? /^[A-Z]{4}$/.test(answer) : stage === 2 ? /^\d{2}$/.test(answer) : /^\d{4}$/.test(answer))) {
      showError(stage === 1 ? "请输入四个英文字母。" : `请输入${stage === 2 ? "两" : "四"}位数字。`); return;
    }
    showError(""); pending = true; submit.disabled = true;
    socket.send(JSON.stringify({type:"solve",answer,stage,run:snapshot.run}));
  });
  $("puzzle-create").addEventListener("click", () => startSession(true));
  $("puzzle-join-form").addEventListener("submit", event => { event.preventDefault(); startSession(false); });
  $("puzzle-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("puzzle-share-link").value); $("puzzle-copy").textContent = "已复制"; }
    catch { $("puzzle-share-link").focus(); $("puzzle-share-link").select(); status.textContent = "自动复制失败，长按链接手动复制。"; }
  });
  ready.addEventListener("click", () => {
    if (!ready.disabled && socket?.readyState === WebSocket.OPEN) { ready.disabled = true; socket.send('{"type":"ready"}'); }
  });
  reconnect.addEventListener("click", connect);
  $("puzzle-leave").addEventListener("click", () => reset(true));
  const urlCode = new URLSearchParams(location.search).get("room");
  if (urlCode && /^[A-HJ-NP-Z2-9]{6}$/i.test(urlCode)) $("puzzle-code").value = urlCode.toUpperCase();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && /^[A-HJ-NP-Z2-9]{6}$/.test(saved.room) && /^[0-9a-f]{32}$/.test(saved.token)
        && [0, 1].includes(saved.side) && (!urlCode || saved.room === urlCode.toUpperCase())) {
      identity = saved; showSession(); connect();
    }
  } catch {}
})();
