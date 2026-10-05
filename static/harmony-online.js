"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const entry = $("harmony-entry"), session = $("harmony-session"), error = $("harmony-error");
  const status = $("harmony-status"), submit = $("harmony-submit"), next = $("harmony-next"), ready = $("harmony-ready");
  const reconnect = $("harmony-reconnect"), storageKey = "boring-lab-harmony-online-v1";
  const names = ["青柠队", "蓝莓队"];
  let identity = null, socket = null, snapshot = null, order = [], generation = 0, quitting = false, pending = false;
  function showError(message) { error.textContent = message; error.hidden = !message; }
  function save() {
    try { if (identity) localStorage.setItem(storageKey, JSON.stringify(identity)); else localStorage.removeItem(storageKey); } catch {}
  }
  function shareUrl(room) {
    const url = new URL("/harmony-online.html", location.href);
    url.searchParams.set("room", room);
    return url.toString();
  }
  function showSession() {
    entry.hidden = true; session.hidden = false; showError("");
    $("harmony-room-code").textContent = identity.room;
    $("harmony-share-link").value = shareUrl(identity.room);
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
    const turn = ++generation; quitting = false; snapshot = null; order = []; pending = false;
    submit.disabled = next.disabled = ready.disabled = true; reconnect.hidden = true;
    status.textContent = "正在连接房间……";
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/harmony`);
    socket = ws;
    ws.onopen = () => { if (turn === generation) ws.send(JSON.stringify({type:"auth",room:identity.room,token:identity.token})); };
    ws.onmessage = event => {
      if (turn !== generation) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "error") { pending = false; showError(message.message); if (snapshot) render(); return; }
      if (message.type !== "state" || message.room !== identity.room || message.self !== identity.side) return;
      if (!snapshot || snapshot.run !== message.run || snapshot.round !== message.round || message[identity.side ? "rightSubmitted" : "leftSubmitted"]) {
        order = message.myOrder.slice();
        showError("");
      }
      snapshot = message; pending = false; render();
    };
    ws.onclose = event => {
      if (turn !== generation || quitting) return;
      if (event.code === 1000 && event.reason === "Room closed") { reset(false); showError("房主已离开，房间关闭。"); return; }
      snapshot = null; submit.disabled = next.disabled = ready.disabled = true;
      reconnect.hidden = false;
      status.textContent = event.code === 1008 ? "房间已过期或身份失效，可以离开后重新创建。" : "连接中断，请点“重新连接”。";
    };
  }
  function sendAction(type, extra = {}) {
    if (!snapshot || pending || socket?.readyState !== WebSocket.OPEN) return;
    pending = true; showError("");
    socket.send(JSON.stringify({type,run:snapshot.run,round:snapshot.round,...extra}));
    render();
  }
  function fillOrder(list, values, options, controls = false) {
    list.replaceChildren();
    values.forEach((id, index) => {
      const item = document.createElement("li"), rank = document.createElement("span"), name = document.createElement("strong");
      rank.className = "rank"; rank.textContent = String(index + 1).padStart(2, "0");
      name.textContent = options[id]; item.append(rank, name);
      if (controls) {
        const buttons = document.createElement("div"); buttons.className = "harmony-order-controls";
        for (const [direction, label, disabled] of [[-1, "↑", index === 0], [1, "↓", index === 4]]) {
          const button = document.createElement("button"); button.type = "button"; button.textContent = label;
          button.setAttribute("aria-label", `将${options[id]}${direction < 0 ? "上移" : "下移"}`);
          button.disabled = disabled || pending;
          button.addEventListener("click", () => {
            const nextOrder = order.slice(); [nextOrder[index], nextOrder[index + direction]] = [nextOrder[index + direction], nextOrder[index]];
            order = nextOrder; render();
          });
          buttons.append(button);
        }
        item.append(buttons);
      }
      list.append(item);
    });
  }
  function render() {
    const s = snapshot, side = identity.side, both = s.leftConnected && s.rightConnected;
    const mine = side ? s.rightSubmitted : s.leftSubmitted;
    const myReady = side ? s.rightReady : s.leftReady;
    for (let index = 0; index < 2; ++index) {
      const connected = s[index ? "rightConnected" : "leftConnected"];
      const submitted = s[index ? "rightSubmitted" : "leftSubmitted"];
      $(index ? "harmony-player-right" : "harmony-player-left").textContent = `${names[index]} · ${index === side ? "你" : "对方"} · ${connected ? "在线" : "离线"}${submitted ? " · 已提交" : ""}`;
    }
    const progress = $("harmony-progress"); progress.replaceChildren();
    s.roundScores.forEach((score, index) => {
      const chip = document.createElement("span"); chip.className = score >= 0 ? "done" : index === s.round ? "active" : "";
      chip.textContent = `第 ${index + 1} 轮 · ${score < 0 ? "待排序" : score + " / 10"}`;
      progress.append(chip);
    });
    $("harmony-round").textContent = `ROUND ${String(s.round + 1).padStart(2, "0")} / 03`;
    $("harmony-title").textContent = s.title;
    $("harmony-guide").textContent = s.phase === "finished" ? `三轮合计 ${s.total} / 30 分。你们可以聊聊哪一项排得最不一样。`
      : s.phase === "reveal" ? "看看哪几个选择最出乎意料。聊完以后，两人都点下一轮。"
      : "根据题意排序：第 1 名最符合你，第 5 名最不符合你。提交前先别商量。";
    $("harmony-ranking").hidden = s.phase !== "ranking" || mine;
    $("harmony-wait").hidden = s.phase !== "ranking" || !mine;
    $("harmony-reveal").hidden = s.phase === "ranking";
    if (s.phase === "ranking" && !mine) fillOrder($("harmony-order"), order, s.options, true);
    submit.disabled = !both || pending || mine;
    if (s.phase !== "ranking") {
      $("harmony-round-score").textContent = s.roundScores[s.round] === 10 ? "完全同频！这一轮 10 / 10 分" : `这一轮默契得分：${s.roundScores[s.round]} / 10`;
      fillOrder($("harmony-left-order"), s.leftOrder, s.options);
      fillOrder($("harmony-right-order"), s.rightOrder, s.options);
    }
    next.hidden = s.phase !== "reveal"; ready.hidden = s.phase !== "finished";
    next.disabled = pending || myReady; ready.disabled = pending || myReady;
    next.textContent = myReady ? "已准备，等待朋友" : "进入下一轮";
    ready.textContent = myReady ? "已准备，等待朋友" : "再玩三轮";
    status.textContent = s.notice || (s.phase === "finished" ? s.total >= 24 ? `你们拿到 ${s.total}/30 分，默契满格！想再玩一局吗？` : `你们拿到 ${s.total}/30 分，看看下次会不会更同步。`
      : !both ? "对方暂时不在线。邀请朋友加入；断线后进度会保留。"
      : s.phase === "reveal" ? myReady ? "等朋友准备好，再进入下一轮。" : "聊聊这轮的意外答案，再点下一轮。"
      : mine ? "你已经提交，朋友提交之前彼此都看不到排序。" : "用箭头调整顺序，确认后就不能更改。互相都提交才揭晓。");
  }
  function reset(leave) {
    generation++; quitting = true;
    if (leave && socket?.readyState === WebSocket.OPEN) socket.send('{"type":"leave"}');
    socket?.close(); socket = null; identity = null; snapshot = null; order = []; pending = false; save();
    session.hidden = true; entry.hidden = false;
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  async function startSession(makeRoom) {
    if (identity) return;
    const create = $("harmony-create"), join = $("harmony-join-form").querySelector("button");
    create.disabled = join.disabled = true; showError("");
    try {
      const code = $("harmony-code").value.trim().toUpperCase();
      if (!makeRoom && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("请输入正确的六位房间码。");
      identity = await api(makeRoom ? "/api/harmony/rooms" : "/api/harmony/join", makeRoom ? {} : {room:code});
      save(); showSession(); connect();
    } catch (reason) { showError(reason.name === "AbortError" ? "连接超时，请稍后再试。" : reason.message || "连接失败，请重试。"); }
    finally { create.disabled = join.disabled = false; }
  }
  submit.addEventListener("click", () => {
    if (!submit.disabled && order.length === 5 && snapshot?.phase === "ranking") sendAction("submit", {order});
  });
  next.addEventListener("click", () => { if (!next.disabled && snapshot?.phase === "reveal") sendAction("next"); });
  ready.addEventListener("click", () => { if (!ready.disabled && snapshot?.phase === "finished") sendAction("ready"); });
  $("harmony-create").addEventListener("click", () => startSession(true));
  $("harmony-join-form").addEventListener("submit", event => { event.preventDefault(); startSession(false); });
  $("harmony-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("harmony-share-link").value); $("harmony-copy").textContent = "已复制"; }
    catch { $("harmony-share-link").focus(); $("harmony-share-link").select(); status.textContent = "自动复制失败，长按链接手动复制。"; }
  });
  reconnect.addEventListener("click", connect);
  $("harmony-leave").addEventListener("click", () => reset(true));
  const urlCode = new URLSearchParams(location.search).get("room");
  if (urlCode && /^[A-HJ-NP-Z2-9]{6}$/i.test(urlCode)) $("harmony-code").value = urlCode.toUpperCase();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && /^[A-HJ-NP-Z2-9]{6}$/.test(saved.room) && /^[0-9a-f]{32}$/.test(saved.token)
        && [0, 1].includes(saved.side) && (!urlCode || saved.room === urlCode.toUpperCase())) {
      identity = saved; showSession(); connect();
    }
  } catch {}
})();
