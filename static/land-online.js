"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const entry = $("land-entry"), session = $("land-session"), error = $("land-error");
  const status = $("land-status"), ready = $("land-ready"), reconnect = $("land-reconnect");
  const board = $("land-board"), svg = $("land-lines");
  const storageKey = "boring-lab-land-online-v1", soundKey = "boring-lab-land-sound";
  const names = ["青柠队", "蓝莓队"], marks = ["✳", "◆"];
  const edgeNodes = [], boxNodes = [], segments = [];
  let identity = null, socket = null, snapshot = null, generation = 0, quitting = false, pending = false;
  let sound = true, audio = null;
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
  function tone(gain) {
    if (!sound || !audio || audio.state !== "running") return;
    try {
      const osc = audio.createOscillator(), volume = audio.createGain(), time = audio.currentTime;
      osc.type = "sine"; osc.frequency.setValueAtTime(gain ? 660 : 300, time);
      osc.frequency.exponentialRampToValueAtTime(gain ? 880 : 180, time + .1);
      volume.gain.setValueAtTime(.08, time); volume.gain.exponentialRampToValueAtTime(.001, time + .13);
      osc.connect(volume); volume.connect(audio.destination); osc.start(time); osc.stop(time + .14);
    } catch {}
  }
  function soundLabel() {
    $("land-sound").textContent = sound ? "声音：开 ♪" : "声音：关";
    $("land-sound").setAttribute("aria-pressed", String(sound));
  }
  function svgNode(type, attributes) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", type);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    svg.append(node); return node;
  }
  for (let edge = 0; edge < 24; ++edge) {
    const horizontal = edge < 12, index = horizontal ? edge : edge - 12;
    const row = Math.floor(index / (horizontal ? 3 : 4)), col = index % (horizontal ? 3 : 4);
    const x1 = 24 + col * 104, y1 = 24 + row * 104;
    const x2 = x1 + (horizontal ? 104 : 0), y2 = y1 + (horizontal ? 0 : 104);
    segments.push({ x1, y1, x2, y2 });
    const line = svgNode("line", { x1, y1, x2, y2, class: "land-line", "data-owner": -1 });
    const button = document.createElement("button");
    button.type = "button"; button.className = "land-edge"; button.dataset.edge = edge;
    button.style.left = ((x1 + x2) / 720 * 100) + "%";
    button.style.top = ((y1 + y2) / 720 * 100) + "%";
    const label = `第${row + 1}行第${col + 1}条${horizontal ? "横" : "竖"}线`;
    button.setAttribute("aria-label", label + "，空线"); button.disabled = true;
    button.addEventListener("click", () => { unlockAudio(); if (!button.disabled) sendAction("move", { edge }); });
    board.append(button); edgeNodes.push({ button, line, label });
  }
  for (let row = 0; row < 4; ++row)
    for (let col = 0; col < 4; ++col) svgNode("circle", { cx: 24 + col * 104, cy: 24 + row * 104, r: 6, class: "land-dot" });
  for (let box = 0; box < 9; ++box) {
    const node = document.createElement("span"); node.className = "land-box";
    node.dataset.owner = -1;
    node.style.left = ((76 + box % 3 * 104) / 360 * 100) + "%";
    node.style.top = ((76 + Math.floor(box / 3) * 104) / 360 * 100) + "%";
    node.setAttribute("aria-label", `第${Math.floor(box / 3) + 1}行第${box % 3 + 1}块地，尚未圈定`);
    board.append(node); boxNodes.push(node);
  }
  // The full visible line also accepts taps; choose the closest segment and ignore dots/box centers.
  board.addEventListener("click", (event) => {
    if (event.target.closest("button") || !canMove()) return;
    const bounds = board.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * 360;
    const y = (event.clientY - bounds.top) / bounds.height * 360;
    let chosen = -1, distance = 22 * 360 / bounds.width;
    segments.forEach((s, edge) => {
      if (snapshot.edges[edge] !== -1) return;
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const position = ((x - s.x1) * dx + (y - s.y1) * dy) / (104 * 104);
      if (position < .16 || position > .84) return;
      const d = Math.hypot(x - s.x1 - position * dx, y - s.y1 - position * dy);
      if (d < distance) { distance = d; chosen = edge; }
    });
    if (chosen >= 0) { unlockAudio(); sendAction("move", { edge: chosen }); }
  });
  function canMove() {
    return snapshot?.phase === "playing" && snapshot.leftConnected && snapshot.rightConnected
      && snapshot.turn === identity?.side && !pending && socket?.readyState === WebSocket.OPEN;
  }
  function shareUrl(room) {
    const url = new URL("/land-online.html", location.href); url.searchParams.set("room", room); return url.toString();
  }
  function showSession() {
    entry.hidden = true; session.hidden = false; showError("");
    $("land-room-code").textContent = identity.room; $("land-share-link").value = shareUrl(identity.room);
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
  function connect() {
    if (!identity || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    const turn = ++generation; quitting = false; snapshot = null; pending = false;
    ready.disabled = true; reconnect.hidden = true; edgeNodes.forEach(n => n.button.disabled = true);
    status.textContent = "正在连接房间……";
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/land`);
    socket = ws;
    ws.onopen = () => { if (turn === generation) ws.send(JSON.stringify({ type: "auth", room: identity.room, token: identity.token })); };
    ws.onmessage = event => {
      if (turn !== generation) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "error") { pending = false; showError(message.message); if (snapshot) render(snapshot); return; }
      if (message.type !== "state" || message.room !== identity.room || message.self !== identity.side) return;
      const previous = snapshot;
      snapshot = message; pending = false; showError(""); render(previous);
      if (previous && previous.run === message.run && message.ply > previous.ply) tone(message.scores.reduce((a, b) => a + b, 0) > previous.scores.reduce((a, b) => a + b, 0));
      if (message.phase === "playing" && previous?.phase !== "playing") $("land-room-info").open = false;
      if (message.phase === "waiting" && previous?.phase !== "waiting") $("land-room-info").open = true;
    };
    ws.onclose = event => {
      if (turn !== generation || quitting) return;
      if (event.code === 1000 && event.reason === "Room closed") { reset(false); showError("房主已离开，房间关闭。"); return; }
      snapshot = null; pending = false; ready.disabled = true;
      edgeNodes.forEach(n => n.button.disabled = true); reconnect.hidden = false;
      status.dataset.mine = "false";
      status.textContent = event.code === 1000 && event.reason === "Reconnected elsewhere" ? "你已在另一个页面连接。需要切回此页时再点重新连接。" : event.code === 1008 ? "房间已过期或身份失效，可以离开后重新创建。" : "连接中断，棋盘暂时锁住了。点“重新连接”继续。";
    };
  }
  function sendAction(type, extra = {}) {
    if (!snapshot || pending || socket?.readyState !== WebSocket.OPEN) return;
    pending = true; showError("");
    socket.send(JSON.stringify({ type, run: snapshot.run, ply: snapshot.ply, ...extra })); render(snapshot);
  }
  function render(previous) {
    const s = snapshot, side = identity.side, both = s.leftConnected && s.rightConnected;
    board.dataset.phase = s.phase; board.dataset.run = s.run; board.dataset.ply = s.ply; board.dataset.turn = s.turn;
    const newMove = previous && previous.run === s.run && s.ply > previous.ply;
    edgeNodes.forEach(({ button, line, label }, edge) => {
      const owner = s.edges[edge]; line.dataset.owner = owner;
      button.disabled = !canMove() || owner !== -1;
      button.setAttribute("aria-label", label + (owner === -1 ? "，空线" : "，已由" + names[owner] + "连接"));
    });
    boxNodes.forEach((node, box) => {
      const owner = s.boxes[box]; node.dataset.owner = owner; node.textContent = owner < 0 ? "" : marks[owner];
      node.classList.toggle("is-new", !!newMove && previous.boxes[box] < 0 && owner >= 0);
      node.setAttribute("aria-label", `第${Math.floor(box / 3) + 1}行第${box % 3 + 1}块地，${owner < 0 ? "尚未圈定" : names[owner] + "的地盘"}`);
    });
    for (let i = 0; i < 2; ++i) {
      const position = i ? "right" : "left";
      $("land-player-" + position).textContent = `${marks[i]} ${names[i]} · ${i === side ? "你" : "对方"}`;
      $("land-score-" + position).textContent = s.scores[i];
      $("land-connection-" + position).textContent = s[i ? "rightConnected" : "leftConnected"] ? s.phase === "waiting" && s[i ? "rightReady" : "leftReady"] ? "已准备" : "在线" : "离线";
      document.querySelector(`.land-scoreboard [data-side="${i}"]`).dataset.turn = s.phase === "playing" && s.turn === i;
    }
    const myReady = s[side ? "rightReady" : "leftReady"];
    ready.hidden = s.phase === "playing";
    ready.disabled = !both || pending || myReady;
    ready.textContent = myReady ? "已准备，等待朋友" : s.phase === "finished" ? "再来一局 · 交换先手" : "我准备好了";
    $("land-result").hidden = s.phase !== "finished";
    if (s.phase === "finished") $("land-result").textContent = `${s.winner === side ? "你赢了！" : "这次朋友多圈了一点。"}你圈下 ${s.scores[side]} 块地盘，朋友拿到 ${s.scores[1 - side]} 块。下一局交换先手。`;
    status.dataset.mine = s.phase === "playing" && both && s.turn === side;
    if (!both) status.textContent = s.notice || (s.phase === "waiting" ? "邀请朋友加入；双方在线后才能继续。" : "朋友暂时离线，棋盘保留，等他重连后继续。");
    else if (s.phase === "waiting") status.textContent = myReady ? "你准备好了，等朋友确认就开局。" : "双方点准备后开始，青柠队先画第一条线。";
    else if (s.phase === "finished") status.textContent = myReady ? "你想再来一局，等朋友也确认。" : "九块地都分好了。要不要换个先手，再来一局？";
    else if (pending) status.textContent = "正在确认这条线……";
    else {
      const gain = s.lastSide >= 0 && s.lastEdge >= 0 ? s.boxes.filter((owner, box) => {
        const r = Math.floor(box / 3), c = box % 3;
        return owner === s.lastSide && [r * 3 + c, (r + 1) * 3 + c, 12 + r * 4 + c, 12 + r * 4 + c + 1].includes(s.lastEdge);
      }).length : 0;
      status.textContent = s.turn === side ? gain > 0 ? `这 ${gain === 1 ? "块" : "两块"}地归你了！还能继续画。` : "轮到你了，点一条空线，看看能不能圈到地。"
        : gain > 0 ? "朋友圈到了地盘，还能继续画。" : "朋友正在考虑往哪里画……";
    }
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
    const create = $("land-create"), join = $("land-join-form").querySelector("button");
    create.disabled = join.disabled = true; showError(""); unlockAudio();
    try {
      const code = $("land-code").value.trim().toUpperCase();
      if (!makeRoom && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("请输入正确的六位房间码。");
      identity = await api(makeRoom ? "/api/land/rooms" : "/api/land/join", makeRoom ? {} : { room: code });
      save(); showSession(); connect();
    } catch (reason) { showError(reason.name === "AbortError" ? "连接超时，请稍后再试。" : (reason instanceof TypeError || reason instanceof SyntaxError) ? "暂时无法连接房间，请检查网络后重试。" : reason.message || "连接失败，请重试。"); }
    finally { create.disabled = join.disabled = false; }
  }
  ready.addEventListener("click", () => { unlockAudio(); if (!ready.disabled) sendAction("ready"); });
  $("land-create").addEventListener("click", () => startSession(true));
  $("land-join-form").addEventListener("submit", event => { event.preventDefault(); startSession(false); });
  $("land-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("land-share-link").value); $("land-copy").textContent = "已复制"; }
    catch { $("land-share-link").focus(); $("land-share-link").select(); status.textContent = "自动复制失败，长按链接手动复制。"; }
  });
  $("land-sound").addEventListener("click", () => {
    sound = !sound; try { if (window.BoringStorage?.canWrite() !== false) localStorage.setItem(soundKey, sound ? "on" : "off"); } catch {}
    soundLabel(); unlockAudio();
  });
  reconnect.addEventListener("click", connect);
  $("land-leave").addEventListener("click", () => reset(true));
  const urlCode = new URLSearchParams(location.search).get("room");
  if (urlCode && /^[A-HJ-NP-Z2-9]{6}$/i.test(urlCode)) $("land-code").value = urlCode.toUpperCase();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && /^[A-HJ-NP-Z2-9]{6}$/.test(saved.room) && /^[0-9a-f]{32}$/.test(saved.token)
        && [0, 1].includes(saved.side) && (!urlCode || saved.room === urlCode.toUpperCase())) {
      identity = saved; showSession(); connect();
    }
  } catch {}
  soundLabel();
})();
