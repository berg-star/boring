"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const entry = $("light-entry"), session = $("light-session"), error = $("light-error");
  const status = $("light-status"), ready = $("light-ready"), reconnect = $("light-reconnect");
  const board = $("light-board"), context = board.getContext("2d");
  const left = $("light-left"), right = $("light-right");
  const storageKey = "boring-lab-light-online-v1", soundKey = "boring-lab-light-sound";
  const names = ["青柠队", "蓝莓队"], colors = ["#b9f879", "#93b9ff"], marks = ["✳", "◆"];
  const arrows = ["↑", "→", "↓", "←"];
  let identity = null, socket = null, snapshot = null, generation = 0, quitting = false;
  let pendingSeq = null, sequence = 0, readyPending = false, sound = true, audio = null;
  let previousHeads = null, frameStart = 0, frame = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  try { sound = localStorage.getItem(soundKey) !== "off"; } catch {}
  function showError(message) { error.textContent = message; error.hidden = !message; }
  function save() {
    try {
      if (identity) localStorage.setItem(storageKey, JSON.stringify(identity));
      else localStorage.removeItem(storageKey);
    } catch {}
  }
  function unlockAudio() {
    if (!sound) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio ||= new Context();
      if (audio.state === "suspended") audio.resume().catch(() => {});
    } catch {}
  }
  function tone(crash = false) {
    if (!sound || !audio || audio.state !== "running") return;
    try {
      const osc = audio.createOscillator(), volume = audio.createGain(), time = audio.currentTime;
      osc.type = crash ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(crash ? 180 : 560, time);
      osc.frequency.exponentialRampToValueAtTime(crash ? 45 : 800, time + .12);
      volume.gain.setValueAtTime(.055, time); volume.gain.exponentialRampToValueAtTime(.001, time + .18);
      osc.connect(volume); volume.connect(audio.destination); osc.start(time); osc.stop(time + .19);
    } catch {}
  }
  function soundLabel() {
    $("light-sound").textContent = sound ? "声音：开 ♪" : "声音：关";
    $("light-sound").setAttribute("aria-pressed", String(sound));
  }
  function shareUrl(room) {
    const url = new URL("/light-online.html", location.href); url.searchParams.set("room", room); return url.toString();
  }
  function showSession() {
    entry.hidden = true; session.hidden = false; showError("");
    $("light-room-code").textContent = identity.room; $("light-share-link").value = shareUrl(identity.room);
    if (location.search !== `?room=${identity.room}`) history.replaceState(null, "", `?room=${identity.room}`);
  }
  async function api(path, body) {
    const control = new AbortController(), timeout = setTimeout(() => control.abort(), 9000);
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: control.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "房间暂时不可用。");
      return data;
    } finally { clearTimeout(timeout); }
  }

  function canTurn() {
    return snapshot?.phase === "running" && snapshot.leftConnected && snapshot.rightConnected
      && !snapshot.myTurn && pendingSeq === null && socket?.readyState === WebSocket.OPEN;
  }
  function connect() {
    if (!identity || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    const turn = ++generation; quitting = false; snapshot = null; pendingSeq = null; readyPending = false;
    ready.disabled = left.disabled = right.disabled = true; reconnect.hidden = true;
    status.textContent = "正在连接房间……";
    document.body.classList.remove("light-disconnected");
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/light`);
    socket = ws;
    ws.onopen = () => { if (turn === generation) ws.send(JSON.stringify({ type: "auth", room: identity.room, token: identity.token })); };
    ws.onmessage = event => {
      if (turn !== generation) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "error") { pendingSeq = null; readyPending = false; showError(message.message); if (snapshot) render(); return; }
      if (message.type !== "state" || message.room !== identity.room || message.self !== identity.side) return;
      const previous = snapshot;
      const newEpoch = !previous || previous.run !== message.run || previous.epoch !== message.epoch;
      if (newEpoch) { sequence = message.ack; pendingSeq = null; }
      else { sequence = Math.max(sequence, message.ack); if (pendingSeq !== null && message.ack >= pendingSeq) pendingSeq = null; }
      if (message[identity.side ? "rightReady" : "leftReady"] || message.phase !== "waiting" && message.phase !== "finished") readyPending = false;
      const moved = previous && !newEpoch && message.step > previous.step;
      if (moved) { previousHeads = previous.heads; frameStart = performance.now(); }
      else if (newEpoch || message.phase !== "running") previousHeads = null;
      snapshot = message; showError(""); render(); draw();
      if (previous && message.phase === "finished" && previous.phase !== "finished") tone(true);
      if (["countdown", "running", "paused", "finished"].includes(message.phase)) $("light-room-info").open = false;
      if (message.phase === "waiting" && previous?.phase !== "waiting") $("light-room-info").open = true;
    };
    ws.onclose = event => {
      if (turn !== generation || quitting) return;
      if (event.code === 1000 && event.reason === "Room closed") { reset(false); showError("房主已离开，房间关闭。"); return; }
      snapshot = null; pendingSeq = null; readyPending = false; previousHeads = null;
      document.body.classList.add("light-disconnected");
      ready.disabled = left.disabled = right.disabled = true; reconnect.hidden = false;
      $("light-overlay").hidden = false; $("light-overlay-title").textContent = "连接中断";
      $("light-overlay-tip").textContent = "赛场已暂停，重新连接后继续。";
      status.textContent = event.code === 1000 && event.reason === "Reconnected elsewhere" ? "你已在另一个页面连接。切回此页时再点重新连接。" : event.code === 1008 ? "房间已过期或身份失效，请离开后重新创建。" : "连接中断，点“重新连接”继续。";
    };
  }
  function sendTurn(direction) {
    unlockAudio();
    if (!canTurn()) return;
    pendingSeq = ++sequence; showError("");
    socket.send(JSON.stringify({ type: "turn", run: snapshot.run, epoch: snapshot.epoch, step: snapshot.step, seq: pendingSeq, direction }));
    render(); tone();
  }
  function sendReady() {
    if (!snapshot || readyPending || socket?.readyState !== WebSocket.OPEN) return;
    readyPending = true; showError(""); socket.send(JSON.stringify({ type: "ready", run: snapshot.run })); render();
  }
  function render() {
    const s = snapshot, side = identity.side, both = s.leftConnected && s.rightConnected;
    for (const key of ["phase", "run", "epoch", "step"]) board.dataset[key] = s[key];
    document.body.classList.toggle("light-playing", s.phase !== "waiting");
    document.querySelector(".light-race").dataset.phase = s.phase;
    for (let i = 0; i < 2; i++) $("light-player-" + (i ? "right" : "left")).textContent = `${marks[i]} ${names[i]} · ${i === side ? "你" : "对方"} · ${s[i ? "rightConnected" : "leftConnected"] ? s[i ? "rightReady" : "leftReady"] ? "已准备" : "在线" : "离线"}`;
    $("light-heading").textContent = arrows[s.directions[side]];
    left.disabled = right.disabled = !canTurn();
    const myReady = s[side ? "rightReady" : "leftReady"];
    ready.hidden = !["waiting", "finished"].includes(s.phase);
    ready.disabled = !both || readyPending || myReady;
    ready.textContent = myReady || readyPending ? "已准备，等待朋友" : s.phase === "finished" ? "再来一局 · 交换位置" : "我准备好了";
    const overlay = $("light-overlay"), title = $("light-overlay-title"), tip = $("light-overlay-tip");
    overlay.hidden = s.phase === "running";
    if (s.phase === "countdown") { title.textContent = String(Math.max(1, Math.ceil(s.remainingMs / 1000))); tip.textContent = s.step ? "回到刚才的位置，倒数后继续" : "准备好转弯，车会自动前进"; }
    else if (s.phase === "paused") { title.textContent = "等朋友回来"; tip.textContent = "光轨保留，重连后倒数继续"; }
    else if (s.phase === "finished") {
      title.textContent = s.winner < 0 ? "同时撞车，平局！" : s.winner === side ? "你赢了！" : "朋友赢了这局";
      const reason = { wall: "撞到墙了", trail: "撞上光轨了", "head-on": "迎头相撞了" };
      tip.textContent = s.winner < 0 ? "同一步结束，下局交换出发位置" : `${names[1 - s.winner]}${reason[s.reasons[1 - s.winner]] || "停下了"}。下局交换位置`;
    } else { title.textContent = "等待准备"; tip.textContent = "车会自动跑，你只管转弯"; }
    if (!both) status.textContent = s.notice || "邀请朋友加入，双方在线后一起准备。";
    else if (s.phase === "waiting") status.textContent = myReady ? "你准备好了，等朋友确认。" : "双方点准备后开始，先看看你的出发方向。";
    else if (s.phase === "countdown") status.textContent = s.step ? "赛场保留，倒数后继续。" : "三秒倒数，留意车头方向。";
    else if (s.phase === "finished") status.textContent = myReady ? "等朋友也确认，再来一局。" : title.textContent + " 下局交换出发位置。";
    else status.textContent = pendingSeq !== null || s.myTurn ? "转弯已排好，下一格生效。" : "提前转弯，给自己留一条路。";
  }
  // Only interpolate confirmed positions. The browser never advances the match or decides a winner.
  function draw() {
    cancelAnimationFrame(frame); frame = 0;
    const s = snapshot; if (!s) return;
    const cell = 20, progress = previousHeads && !reduced.matches && s.phase === "running" ? Math.min(1, (performance.now() - frameStart) / s.tickMs) : 1;
    context.fillStyle = "#101a22"; context.fillRect(0, 0, 360, 480);
    context.strokeStyle = "#1d2a34"; context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= 360; x += cell) { context.moveTo(x, 0); context.lineTo(x, 480); }
    for (let y = 0; y <= 480; y += cell) { context.moveTo(0, y); context.lineTo(360, y); }
    context.stroke();
    for (let index = 0; index < s.trail.length; index++) {
      if (s.trail[index] === ".") continue;
      const owner = Number(s.trail[index]), x = index % s.width, y = Math.floor(index / s.width);
      if (progress < 1 && s.heads[owner].x === x && s.heads[owner].y === y) continue;
      context.fillStyle = owner ? "#486b9a" : "#4e784a";
      context.fillRect(x * cell + 2, y * cell + 2, 16, 16);
      context.fillStyle = colors[owner]; context.fillRect(x * cell + 6, y * cell + 6, 8, 8);
    }
    s.heads.forEach((head, i) => {
      const old = previousHeads?.[i] || head;
      const x = (old.x + (head.x - old.x) * progress + .5) * cell;
      const y = (old.y + (head.y - old.y) * progress + .5) * cell;
      context.save(); context.translate(x, y); context.rotate(s.directions[i] * Math.PI / 2);
      context.shadowColor = colors[i]; context.shadowBlur = 10; context.fillStyle = colors[i];
      context.beginPath(); context.moveTo(0, -9); context.lineTo(8, 7); context.lineTo(0, 4); context.lineTo(-8, 7); context.closePath(); context.fill();
      context.shadowBlur = 0; context.fillStyle = "#101a22"; context.fillRect(-2, -1, 4, 4); context.restore();
      if (s.phase === "finished" && s.reasons[i]) {
        const hit = s.hits[i], hx = Math.max(7, Math.min(353, (hit.x + .5) * cell)), hy = Math.max(7, Math.min(473, (hit.y + .5) * cell));
        context.strokeStyle = "#ff9a84"; context.lineWidth = 3; context.beginPath();
        context.moveTo(hx - 6, hy - 6); context.lineTo(hx + 6, hy + 6); context.moveTo(hx - 6, hy + 6); context.lineTo(hx + 6, hy - 6); context.stroke();
      }
    });
    if (progress < 1) frame = requestAnimationFrame(draw);
  }
  for (const [button, direction] of [[left, -1], [right, 1]]) {
    button.addEventListener("pointerdown", event => { if (event.button === 0 && event.isPrimary) sendTurn(direction); });
    button.addEventListener("click", event => { if (event.detail === 0) sendTurn(direction); });
  }
  document.addEventListener("keydown", event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target.closest("input, textarea, select, [contenteditable], dialog[open]")) return;
    const key = event.key.toLowerCase(), direction = ["arrowleft", "a"].includes(key) ? -1 : ["arrowright", "d"].includes(key) ? 1 : 0;
    if (direction && canTurn()) { event.preventDefault(); sendTurn(direction); }
  });
  function reset(leave) {
    generation++; quitting = true;
    if (leave && socket?.readyState === WebSocket.OPEN) socket.send('{"type":"leave"}');
    socket?.close(); socket = null; identity = null; snapshot = null; pendingSeq = null; readyPending = false; save(); document.body.classList.remove("light-playing", "light-disconnected");
    session.hidden = true; entry.hidden = false;
    if (location.search) history.replaceState(null, "", location.pathname);
  }
  async function startSession(makeRoom) {
    if (identity) return;
    const create = $("light-create"), join = $("light-join-form").querySelector("button");
    create.disabled = join.disabled = true; showError(""); unlockAudio();
    try {
      const code = $("light-code").value.trim().toUpperCase();
      if (!makeRoom && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("请输入正确的六位房间码。");
      identity = await api(makeRoom ? "/api/light/rooms" : "/api/light/join", makeRoom ? {} : { room: code });
      save(); showSession(); connect();
    } catch (reason) { showError(reason.name === "AbortError" ? "连接超时，请稍后再试。" : (reason instanceof TypeError || reason instanceof SyntaxError) ? "暂时无法连接房间，请检查网络后重试。" : reason.message || "连接失败，请重试。"); }
    finally { create.disabled = join.disabled = false; }
  }
  ready.addEventListener("click", () => { unlockAudio(); if (!ready.disabled) sendReady(); });
  $("light-create").addEventListener("click", () => startSession(true));
  $("light-join-form").addEventListener("submit", event => { event.preventDefault(); startSession(false); });
  $("light-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("light-share-link").value); $("light-copy").textContent = "已复制"; }
    catch { $("light-share-link").focus(); $("light-share-link").select(); status.textContent = "自动复制失败，长按链接手动复制。"; }
  });
  $("light-sound").addEventListener("click", () => {
    sound = !sound; try { if (window.BoringStorage?.canWrite() !== false) localStorage.setItem(soundKey, sound ? "on" : "off"); } catch {}
    soundLabel(); unlockAudio();
  });
  reconnect.addEventListener("click", connect);
  $("light-leave").addEventListener("click", () => reset(true));
  const urlCode = new URLSearchParams(location.search).get("room");
  if (urlCode && /^[A-HJ-NP-Z2-9]{6}$/i.test(urlCode)) $("light-code").value = urlCode.toUpperCase();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && /^[A-HJ-NP-Z2-9]{6}$/.test(saved.room) && /^[0-9a-f]{32}$/.test(saved.token)
        && [0, 1].includes(saved.side) && (!urlCode || saved.room === urlCode.toUpperCase())) {
      identity = saved; showSession(); connect();
    }
  } catch {}
  soundLabel();
})();
