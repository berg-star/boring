"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const entry = $("word-entry"), session = $("word-session"), error = $("word-error");
  const ready = $("word-ready"), reconnect = $("word-reconnect"), status = $("word-status");
  const input = $("word-input"), submit = $("word-submit"), secret = $("word-secret");
  const names = ["青柠队", "蓝莓队"], storageKey = "boring-lab-word-online-v2";
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
    submit.disabled = ready.disabled = true; reconnect.hidden = true;
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
      const changedRound = !snapshot || snapshot.run !== message.run || snapshot.stage !== message.stage;
      const consumed = !changedRound && snapshot.move !== message.move;
      if (changedRound || consumed) { input.value = ""; secret.value = ""; $("word-category").value = ""; showError(""); }
      if (changedRound || snapshot?.phase === "reply" && message.phase !== "reply") {
        $("word-reject-reason").value = ""; $("word-reject-note").value = "";
      }
      snapshot = message; pending = false; render();
    };
    ws.onclose = event => {
      if (turn !== generation || quitting) return;
      if (event.code === 1000 && event.reason === "Room closed") { reset(false); showError("房主已离开，房间关闭。"); return; }
      snapshot = null; submit.disabled = ready.disabled = true;
      reconnect.hidden = false;
      status.textContent = event.code === 1008 ? "房间已过期或身份失效，可以离开后重新创建。" : "连接中断，请点“重新连接”。";
    };
  }
  function sendAction(type, data = {}) {
    if (!snapshot || pending || socket?.readyState !== WebSocket.OPEN) return;
    pending = true; showError("");
    socket.send(JSON.stringify({type,run:snapshot.run,stage:snapshot.stage,move:snapshot.move,...data}));
    render();
  }
  function render() {
    const s = snapshot, side = identity.side, both = s.leftConnected && s.rightConnected;
    const isSetter = s.setter === side, isGuesser = s.guesser === side;
    const scoreText = value => value < 0 ? "待猜" : value === 11 ? "未猜中" : `${value} 次`;
    [0, 1].forEach(index => {
      const connected = s[index ? "rightConnected" : "leftConnected"];
      const score = s[index ? "rightScore" : "leftScore"];
      $(index ? "word-player-right" : "word-player-left").textContent = `${names[index]} · ${index === side ? "你" : "对方"} · ${connected ? "在线" : "离线"} · ${scoreText(score)}`;
    });
    $("word-round").textContent = `第 ${s.stage + 1} / 2 轮 · ${names[s.setter]}出题`;
    $("word-score").textContent = `青柠 ${scoreText(s.leftScore)} · 蓝莓 ${scoreText(s.rightScore)}`;
    const clue = s.category ? `${s.category} · ${s.length} 个字` : "";
    $("word-cue").textContent = s.phase === "finished" ? s.winner === -1 ? "平局！" : s.winner === side ? "你赢啦！" : "对方赢啦！"
      : s.phase === "setting" ? isSetter ? "轮到你出题。" : "等对方出一个词。"
      : isSetter ? `你出的词：${s.answer}` : `隐藏词：${clue}`;
    $("word-hint").textContent = s.phase === "finished" ? `本轮答案是「${s.answer}」。${s.previousWord ? `上一轮是「${s.previousWord}」。` : ""}`
      : s.phase === "setting" ? `${s.previousWord ? `上一轮答案是「${s.previousWord}」。` : ""}选大家都认识的名词，再选一个分类。`
      : s.phase === "reply" ? isSetter ? "回答这个问题；答不上来可以退回，让对方重问。" : "已发出问题，等出题者回答。"
      : isSetter ? "看对方的问题，尽量如实作答。" : "自由问一个是非问题，也可以直接猜词。";
    $("word-set-form").hidden = s.phase !== "setting" || !isSetter;
    secret.disabled = !both || pending;
    $("word-category").disabled = !both || pending;
    $("word-set-submit").disabled = !both || pending;
    $("word-play").hidden = s.phase !== "playing" || !isGuesser;
    $("word-reply").hidden = s.phase !== "reply" || !isSetter;
    $("word-pending-question").textContent = s.pendingQuestion || "";
    document.querySelectorAll(".word-reply-actions button").forEach(button => { button.disabled = !both || pending; });
    $("word-mode-ask").classList.toggle("selected", mode === "ask");
    $("word-mode-guess").classList.toggle("selected", mode === "guess");
    $("word-mode-ask").setAttribute("aria-pressed", String(mode === "ask"));
    $("word-mode-guess").setAttribute("aria-pressed", String(mode === "guess"));
    $("word-input-label").textContent = mode === "ask" ? "问一个能回答“是／否”的问题" : "直接猜完整词语（2～12 个汉字）";
    input.placeholder = mode === "ask" ? "例如：它是动物吗？" : "例如：小熊猫";
    input.maxLength = mode === "ask" ? 60 : 12;
    input.disabled = !both || pending || s.phase !== "playing" || !isGuesser;
    submit.disabled = input.disabled;
    submit.textContent = mode === "ask" ? "发出问题" : "提交猜测";
    $("word-rejection").hidden = !isGuesser || s.phase !== "playing" || !s.rejectedQuestion;
    $("word-rejection-detail").textContent = s.rejectedQuestion ? `「${s.rejectedQuestion}」：${s.rejectionReason}。请换一种问法。` : "";
    $("word-reject-reason").disabled = !both || pending;
    $("word-reject-note").disabled = !both || pending;
    $("word-reject-submit").disabled = !both || pending;
    $("word-count").textContent = `${s.move} / 10`;
    function fillHistory(list, steps) {
      list.replaceChildren();
      if (!steps.length) { const item = document.createElement("li"); item.className = "empty"; item.textContent = "还没有行动"; list.append(item); }
      steps.forEach((step, index) => {
        const item = document.createElement("li"); if (step.reply === "否" || step.reply === "猜错了") item.className = "negative";
        const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2, "0");
        const label = document.createElement("strong"); label.textContent = step.kind === "ask" ? step.text : `猜「${step.text}」`;
        const response = document.createElement("b"); response.textContent = step.reply;
        item.append(number, label, response); list.append(item);
      });
    }
    fillHistory($("word-history-list"), s.history);
    $("word-previous").hidden = !s.previousWord;
    if (s.previousWord) {
      $("word-previous-title").textContent = `查看上一轮问答 · ${s.previousCategory}「${s.previousWord}」`;
      fillHistory($("word-previous-list"), s.previousHistory);
    } else $("word-previous").open = false;
    ready.hidden = s.phase !== "finished";
    ready.disabled = side ? s.rightReady : s.leftReady;
    ready.textContent = ready.disabled ? "已准备，等待对方" : "再来一局";
    status.textContent = s.notice || (s.phase === "finished" ? `青柠 ${scoreText(s.leftScore)}，蓝莓 ${scoreText(s.rightScore)}。双方同意后可重赛。`
      : !both ? "对方暂时不在线。把链接发给朋友，断线进度会保留。"
      : s.phase === "setting" ? isSetter ? "输入一个 2～12 字的中文词语或作品名，朋友只会看到分类与字数。" : "等对方锁定词语。"
      : s.phase === "reply" ? isSetter ? "请回答问题；退回重问不消耗次数。" : "正在等对方回答。"
      : isSetter ? "等对方提问或猜词。" : s.rejectedQuestion ? `问题被退回：${s.rejectionReason}。本次不扣次数。` : `你已使用 ${s.move}/10 次，认真提问吧。`);
  }
  function reset(leave) {
    generation++; quitting = true;
    if (leave && socket?.readyState === WebSocket.OPEN) socket.send('{"type":"leave"}');
    socket?.close(); socket = null; identity = null; snapshot = null; pending = false; save();
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
  $("word-mode-ask").addEventListener("click", () => { mode = "ask"; input.value = ""; if (snapshot) render(); });
  $("word-mode-guess").addEventListener("click", () => { mode = "guess"; input.value = ""; if (snapshot) render(); });
  $("word-set-form").addEventListener("submit", event => {
    event.preventDefault();
    const word = secret.value.trim(), category = $("word-category").value;
    if (!/^[\u4e00-\u9fff]{2,12}$/.test(word) || !category) { showError("词语须是 2～12 个汉字，并选择分类。"); return; }
    if (snapshot?.phase === "setting" && snapshot.setter === identity.side) sendAction("set", {word,category});
  });
  $("word-play-form").addEventListener("submit", event => {
    event.preventDefault();
    const value = input.value.trim();
    if (mode === "guess" && !/^[\u4e00-\u9fff]{2,12}$/.test(value)) { showError("请猜 2～12 个汉字的词语。"); return; }
    if (mode === "ask" && (!value || new TextEncoder().encode(value).length > 180)) { showError("问题不能超过 60 字。"); return; }
    if (snapshot?.phase === "playing" && snapshot.guesser === identity.side) sendAction(mode, {text:value});
  });
  document.querySelectorAll(".word-reply-actions button").forEach(button => button.addEventListener("click", () => {
    if (snapshot?.phase === "reply" && snapshot.setter === identity.side) sendAction("reply", {answer:button.dataset.answer});
  }));
  $("word-reject-submit").addEventListener("click", () => {
    const reason = $("word-reject-reason").value, note = $("word-reject-note").value.trim();
    if (!reason) { showError("请先选择退回原因。"); return; }
    if (new TextEncoder().encode(note).length > 90) { showError("补充提示不能超过 30 字。"); return; }
    if (snapshot?.phase === "reply" && snapshot.setter === identity.side) sendAction("reply", {answer:"重问",reason,note});
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
