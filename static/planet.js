"use strict";
(() => {
  const canvas = document.getElementById("planet"),
    ctx = canvas.getContext("2d");
  const message = document.getElementById("planet-message");
  if (!ctx) {
    message.textContent = "暂时无法绘制星球，请换个浏览器试试。";
    return;
  }
  // 音效在用户互动后用 Web Audio 合成，无需下载音频或访问外部服务。
  const soundButton = document.getElementById("sound");
  let soundOn = true,
    audioContext = null,
    master = null,
    noiseBuffer = null,
    audioToken = 0;
  const voices = new Set();
  try {
    soundOn = localStorage.getItem("boring-lab-planet-sound") !== "off";
  } catch (_) {}
  function soundLabel() {
    soundButton.textContent = soundOn ? "声音：开 ♫" : "声音：关";
    soundButton.setAttribute("aria-pressed", String(soundOn));
  }
  function stopSound() {
    audioToken++;
    for (const source of voices) {
      try {
        source.stop();
      } catch (_) {}
    }
    voices.clear();
  }
  function unavailable() {
    stopSound();
    soundOn = false;
    soundButton.textContent = "音效暂不可用";
    soundButton.setAttribute("aria-pressed", "false");
    soundButton.disabled = true;
  }
  function envelope(source, filter, when, duration, volume) {
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + Math.min(0.025, duration / 5));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    if (filter) {
      source.connect(filter);
      filter.connect(gain);
    } else source.connect(gain);
    gain.connect(master);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      if (filter) filter.disconnect();
      gain.disconnect();
    };
    source.start(when);
    source.stop(when + duration + 0.02);
  }
  function tone(at, duration, from, to, volume = 0.2, type = "sine") {
    const oscillator = audioContext.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
    envelope(oscillator, null, at, duration, volume);
  }
  function noise(at, duration, frequency, volume) {
    const source = audioContext.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.6;
    envelope(source, filter, at, duration, volume);
  }
  async function playSound(kind) {
    if (!soundOn || document.hidden) return;
    stopSound();
    const token = audioToken;
    try {
      if (!audioContext) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) {
          unavailable();
          return;
        }
        audioContext = new Audio();
        master = audioContext.createGain();
        master.gain.value = 0.38;
        master.connect(audioContext.destination);
        noiseBuffer = audioContext.createBuffer(
          1,
          Math.ceil(audioContext.sampleRate * 2.5),
          audioContext.sampleRate,
        );
        const samples = noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (audioContext.state !== "running") await audioContext.resume();
      if (token !== audioToken || !soundOn || document.hidden || audioContext.state !== "running")
        return;
      const t = audioContext.currentTime + 0.01;
      if (kind === "tree") {
        tone(t, 0.18, 360, 110, 0.45);
        tone(t + 0.09, 0.25, 620, 950, 0.15);
      } else if (kind === "rain") {
        noise(t, 2.2, 2300, 0.5);
        for (let i = 0; i < 7; i++) tone(t + i * 0.22, 0.08, 1200 + i * 75, 650, 0.07);
      } else if (kind === "volcano") {
        noise(t, 0.22, 700, 0.22);
        tone(t, 0.2, 150, 260, 0.2);
        noise(t + 0.24, 0.65, 1800, 0.65);
        tone(t + 0.25, 0.38, 420, 85, 0.28, "triangle");
      } else if (kind === "water") {
        for (let i = 0; i < 3; i++) tone(t + i * 0.15, 0.19, 180 + i * 65, 620 + i * 90, 0.3);
      } else {
        tone(t, 0.22, 660, 660, 0.18);
        tone(t + 0.12, 0.3, 880, 880, 0.16);
      }
    } catch (_) {
      unavailable();
    }
  }
  soundButton.addEventListener("click", () => {
    soundOn = !soundOn;
    stopSound();
    soundLabel();
    try {
      localStorage.setItem("boring-lab-planet-sound", soundOn ? "on" : "off");
    } catch (_) {}
    if (soundOn) playSound("hello");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopSound();
      if (audioContext) audioContext.suspend().catch(() => {});
    }
  });
  addEventListener("pagehide", stopSound);
  soundLabel();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let yaw = 0,
    pitch = -0.08,
    night = false,
    tool = "explore",
    drag = null,
    frame = 0;
  const R = 168,
    CX = 300,
    CY = 253;
  const trees = [],
    effects = [],
    ponds = [],
    residents = [];
  const KEY = "boring-lab-planet-v1",
    MAX_PLANTS = 80;
  let storageBlocked = false,
    undo = null,
    undoTimer = null,
    lastDraw = 0,
    lastSim = 0,
    cloudPoint = null;
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const normalize = (p) => {
    const n = Math.hypot(p.x, p.y, p.z) || 1;
    return { x: p.x / n, y: p.y / n, z: p.z / n };
  };
  function validPoint(p) {
    return (
      p &&
      ["x", "y", "z"].every((k) => Number.isFinite(p[k])) &&
      Math.abs(Math.hypot(p.x, p.y, p.z) - 1) < 0.02
    );
  }
  function updateUndo() {
    clearTimeout(undoTimer);
    undoTimer = null;
    const remaining = undo ? Math.max(0, undo.until - Date.now()) : 0;
    document.getElementById("planet-undo").hidden = remaining === 0;
    document.getElementById("undo-plant").hidden = remaining === 0;
    if (remaining === 0) {
      undo = null;
      return;
    }
    document.getElementById("undo-seconds").textContent = Math.ceil(remaining / 1000) + " 秒";
    if (!document.hidden) undoTimer = setTimeout(updateUndo, Math.min(250, remaining));
  }
  const toolHints = {
    explore: ["随便点点", "拖动旋转星球；轻点居民、树木、海水或火山，看看会发生什么。"],
    tree: ["种点东西", "轻点绿色陆地上的空位种苗，不能种在水里；拖动可以旋转星球。"],
    dig: ["小铲子", "轻点树根或树冠铲除植物；8 秒内可用画布下方的按钮撤销。拖动仍可旋转。"],
    rain: ["下场雨", "按住星球拖动小云，松手在落点下雨；可在下方选择普通雨或爆米花。"],
    volcano: ["火山喷嚏", "轻点星球，火山就会打喷嚏；拖动仍可旋转。"],
  };
  function updateToolHint() {
    const [name, hint] = toolHints[tool];
    document.getElementById("planet-tool-name").textContent = "当前：" + name;
    document.getElementById("planet-tool-hint").textContent = hint;
  }
  addEventListener("pagehide", () => clearTimeout(undoTimer));
  addEventListener("pageshow", updateUndo);
  let previousStatus = "";
  function status() {
    const signature = [
      trees.length,
      residents.length,
      storageBlocked,
      undo?.until || 0,
      !!undo && Date.now() < undo.until,
    ].join(":");
    if (signature === previousStatus) return;
    previousStatus = signature;
    canvas.dataset.treeCount = trees.length;
    document.getElementById("planet-count").textContent =
      trees.length + " / " + MAX_PLANTS + " 株 · " + residents.length + " 位居民";
    document.getElementById("planet-save").textContent = storageBlocked
      ? "本次可继续玩，但存储不可用或旧记录损坏，暂不覆盖旧记录。"
      : "星球自动保存在当前浏览器，清除网站数据会丢失。";
    updateUndo();
  }
  function saveWorld() {
    if (!storageBlocked)
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({
            version: 1,
            trees,
            ponds,
            residents: residents.map((r) => ({ p: r.p, color: r.color })),
            night,
            yaw,
            pitch,
          }),
        );
      } catch (_) {
        storageBlocked = true;
      }
    status();
  }
  function loadWorld() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      if (raw.length > 100000) throw Error();
      const data = JSON.parse(raw);
      if (
        data.version !== 1 ||
        !Array.isArray(data.trees) ||
        data.trees.length > MAX_PLANTS ||
        !Array.isArray(data.ponds) ||
        data.ponds.length > 12 ||
        !Array.isArray(data.residents) ||
        data.residents.length !== 5
      )
        throw Error();
      if (
        data.trees.some(
          (t) =>
            !validPoint(t) ||
            !["tree", "mushroom", "lamp"].includes(t.type) ||
            ![0, 1, 2].includes(t.growth),
        )
      )
        throw Error();
      if (
        data.ponds.some(
          (t) => !validPoint(t) || !Number.isInteger(t.water) || t.water < 1 || t.water > 3,
        )
      )
        throw Error();
      if (
        data.residents.some(
          (r) =>
            !validPoint(r.p) ||
            !["#f5cb8e", "#e8a7ad", "#b7a8e7", "#d5e9aa", "#99d9ce"].includes(r.color),
        )
      )
        throw Error();
      if (
        typeof data.night !== "boolean" ||
        ![data.yaw, data.pitch].every(Number.isFinite) ||
        Math.abs(data.yaw) > 1e6 ||
        Math.abs(data.pitch) > 1.25
      )
        throw Error();
      trees.splice(0, trees.length, ...data.trees);
      ponds.push(...data.ponds);
      residents.splice(
        0,
        residents.length,
        ...data.residents.map((r, i) => ({ ...r, mood: "", until: 0, seed: i * 1.9 })),
      );
      night = data.night;
      yaw = data.yaw;
      pitch = data.pitch;
    } catch (_) {
      storageBlocked = true;
    }
  }

  const volcano = { x: 0.3, y: 0.22, z: Math.sqrt(1 - 0.3 * 0.3 - 0.22 * 0.22) };
  const point = (lat, lon) => ({
    x: Math.cos(lat) * Math.sin(lon),
    y: Math.sin(lat),
    z: Math.cos(lat) * Math.cos(lon),
  });
  const terrainNoise = (p) =>
    Math.sin(p.x * 5 + p.z * 2) + Math.cos(p.y * 7 - p.z * 3) + Math.sin(p.z * 5 + p.x * 2) > 0.45;
  // Use the same latitude/longitude cells as the visible green terrain.
  const land = (p) => {
    const latitude = Math.asin(Math.max(-1, Math.min(1, p.y)));
    const longitude = Math.atan2(p.x, p.z);
    const row = Math.min(29, Math.floor((latitude + Math.PI / 2) / (Math.PI / 30)));
    const col = Math.min(79, Math.floor((longitude + Math.PI) / (Math.PI / 40)));
    return terrainNoise(
      point(-Math.PI / 2 + ((row + 0.5) * Math.PI) / 30, -Math.PI + ((col + 0.5) * Math.PI) / 40),
    );
  };
  function dry(p) {
    if (!land(p) || ponds.some((q) => near(p, q) < (6 + q.water * 5) / R + 0.035)) return false;
    // A small shoreline margin keeps feet and plant bases visibly on the ground.
    return [
      [0.035, 0, 0],
      [-0.035, 0, 0],
      [0, 0.035, 0],
      [0, -0.035, 0],
      [0, 0, 0.035],
      [0, 0, -0.035],
    ].every(([x, y, z]) => land(normalize({ x: p.x + x, y: p.y + y, z: p.z + z })));
  }
  function clearPath(a, b) {
    const steps = Math.max(1, Math.ceil(near(a, b) / 0.015));
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      if (
        !dry(
          normalize({
            x: a.x + (b.x - a.x) * f,
            y: a.y + (b.y - a.y) * f,
            z: a.z + (b.z - a.z) * f,
          }),
        )
      )
        return false;
    }
    return true;
  }
  const groundPoints = Array.from({ length: 3000 }, (_, i) =>
    point(Math.asin(1 - (2 * (i + 0.5)) / 3000), i * 2.399963),
  );
  function nearestGround(p, occupied = []) {
    let best = null,
      distance = Infinity;
    for (const q of groundPoints) {
      const d = near(p, q);
      if (
        d < distance &&
        dry(q) &&
        near(q, volcano) > 0.24 &&
        occupied.every((t) => near(t, q) > 0.17)
      ) {
        best = q;
        distance = d;
      }
    }
    return best;
  }
  function repairGround() {
    let moved = 0;
    const placed = trees.filter(dry);
    for (const t of trees)
      if (!dry(t)) {
        const ground = nearestGround(t, placed);
        if (ground) {
          Object.assign(t, ground);
          placed.push(t);
          moved++;
        }
      }
    for (const r of residents)
      if (!dry(r.p)) {
        const ground = nearestGround(r.p);
        if (ground) {
          r.p = { ...ground };
          moved++;
        }
      }
    return moved;
  }
  function rotate(p) {
    const x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw),
      z = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
    return {
      x,
      y: p.y * Math.cos(pitch) - z * Math.sin(pitch),
      z: p.y * Math.sin(pitch) + z * Math.cos(pitch),
    };
  }
  function project(p) {
    const q = rotate(p);
    return { x: CX + q.x * R, y: CY - q.y * R, z: q.z };
  }
  function inverse(x, y) {
    const a = (x - CX) / R,
      b = (CY - y) / R;
    if (a * a + b * b > 0.97) return null;
    const c = Math.sqrt(1 - a * a - b * b);
    const yy = b * Math.cos(pitch) + c * Math.sin(pitch),
      zz = -b * Math.sin(pitch) + c * Math.cos(pitch);
    return {
      x: a * Math.cos(yaw) - zz * Math.sin(yaw),
      y: yy,
      z: a * Math.sin(yaw) + zz * Math.cos(yaw),
    };
  }
  for (let i = 0; i < 55; i++) {
    const p = point(Math.asin(1 - (2 * (i + 0.5)) / 55), i * 2.39996);
    if (dry(p)) trees.push({ ...p, type: "tree", growth: 2 });
  }
  const colors = ["#f5cb8e", "#e8a7ad", "#b7a8e7", "#d5e9aa", "#99d9ce"];
  for (let i = 0; i < 5; i++)
    residents.push({
      p: point(-0.3 + i * 0.14, -0.65 + i * 0.32),
      color: colors[i],
      mood: "",
      until: 0,
      seed: i * 1.9,
    });
  loadWorld();
  if (repairGround())
    message.textContent = "已经把水上的居民和植物搬回陆地，原来的品种和生长状态都保留了。";

  // Visitors and wishes are temporary visual events. Saved plants are never removed.
  let ufo = null,
    egg = null,
    guest = null,
    meteor = null,
    wish = null;
  const inverted = new Map();
  let nextVisitor = performance.now() + 35000 + Math.random() * 25000;
  let nextMeteor = performance.now() + 22000 + Math.random() * 18000;
  function eventUI() {
    document.getElementById("call-ufo").disabled = !!ufo;
    document.getElementById("call-egg").disabled = !!ufo || !!egg || !!guest;
    document.getElementById("hatch-egg").hidden = !egg;
    document.getElementById("catch-meteor").hidden = !meteor;
    document.getElementById("call-meteor").disabled = !night || !!meteor;
    document.getElementById("call-meteor").title = night ? "" : "先切到夜晚，再来许愿";
  }
  function visibleGround() {
    const candidates = groundPoints.filter(
      (p) => project(p).z > 0.4 && dry(p) && near(p, volcano) > 0.25,
    );
    return (
      candidates[Math.floor(Math.random() * candidates.length)] || nearestGround(inverse(CX, CY))
    );
  }
  function callUfo(cargo = "random") {
    if (ufo) return;
    const available = trees.filter((t) => t.type === "tree" && project(t).z > 0.2);
    const takeTree =
      cargo !== "egg" && available.length && (cargo === "tree" || Math.random() < 0.55);
    if (!takeTree && (egg || guest)) {
      message.textContent = "上一位客人还没离开，稍等它玩一会儿。";
      return;
    }
    const target = takeTree
      ? available[Math.floor(Math.random() * available.length)]
      : visibleGround();
    if (!target) {
      message.textContent = "这一面没有合适的陆地，转到绿色的一面再试试。";
      return;
    }
    ufo = { start: performance.now(), target, tree: !!takeTree };
    message.textContent = takeTree
      ? "UFO 想借一棵树研究一下，保证归还。"
      : "UFO 带来一颗神秘蛋，等它放下后点开看看。";
    playSound("hello");
    if (reduced.matches) finishUfo();
    eventUI();
    draw();
  }
  function finishUfo() {
    if (!ufo) return;
    if (ufo.tree) {
      if (trees.includes(ufo.target)) inverted.set(ufo.target, performance.now() + 18000);
      message.textContent = "树还回来了……它们是不是把说明书拿反了？一会儿就会恢复。";
    } else {
      const p = dry(ufo.target) ? ufo.target : nearestGround(ufo.target);
      if (p) egg = { p: { ...p } };
      message.textContent = "神秘蛋落在陆地上了。点它一下，看看里面住着谁。";
    }
    ufo = null;
    eventUI();
  }
  function hatch() {
    if (!egg) return;
    const p = dry(egg.p) ? egg.p : nearestGround(egg.p);
    guest = { p: { ...p }, until: performance.now() + 18000, kind: Math.floor(Math.random() * 3) };
    egg = null;
    message.textContent = [
      "孵出一只三眼团子，它来这里度个短假。",
      "一颗会打招呼的小星星，决定在陆地上歇会儿。",
      "蛋里居然是一只迷你飞碟。外星快递，套娃配送。",
    ][guest.kind];
    playSound("hello");
    eventUI();
    draw();
  }
  function callMeteor() {
    if (!night) {
      message.textContent = "先切到夜晚，流星才会来值班。";
      return;
    }
    if (meteor) return;
    meteor = { start: performance.now() };
    message.textContent = "流星来了！点天空里的亮星，或者按“抓住流星许愿”。";
    eventUI();
    draw();
  }
  function meteorPosition(now = performance.now()) {
    const t = reduced.matches ? 0.45 : Math.min(1, (now - meteor.start) / 12000);
    return { x: 75 + t * 450, y: 36 + t * 80 };
  }
  function catchMeteor() {
    if (!meteor) return;
    wish = {
      kind: ["pink", "dance", "glow"][Math.floor(Math.random() * 3)],
      until: performance.now() + 14000,
    };
    meteor = null;
    message.textContent = {
      pink: "愿望生效：所有树都换上了粉色外套，14 秒后恢复。",
      dance: "愿望生效：居民集体跳舞，今晚先不睡了。",
      glow: "愿望生效：整颗星球亮晶晶，像一颗宇宙糖果。",
    }[wish.kind];
    playSound("hello");
    eventUI();
    draw();
  }
  function tickVisitors(now) {
    if (document.hidden) return;
    if (ufo && now - ufo.start > 8000) finishUfo();
    if (meteor && (!night || (!reduced.matches && now - meteor.start > 12000))) meteor = null;
    if (wish && now > wish.until) wish = null;
    if (guest && now > guest.until) guest = null;
    if (egg && !dry(egg.p)) egg.p = nearestGround(egg.p);
    if (guest && !dry(guest.p)) guest.p = nearestGround(guest.p);
    for (const [plant, until] of inverted)
      if (now > until || !trees.includes(plant)) inverted.delete(plant);
    if (!reduced.matches) {
      if (now > nextVisitor) {
        nextVisitor = now + 45000 + Math.random() * 30000;
        if (!ufo && !egg && !guest) callUfo();
      }
      if (now > nextMeteor) {
        nextMeteor = now + 30000 + Math.random() * 25000;
        if (night && !meteor) callMeteor();
      }
    }
    eventUI();
  }
  function drawVisitors(now) {
    if (wish?.kind === "glow") {
      ctx.strokeStyle = "#f5dfa9";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(CX, CY, R + 12, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        circle(CX + Math.cos(a) * (R + 22), CY + Math.sin(a) * (R + 22), 3, "#ffeab7");
      }
    }
    if (egg) {
      const p = project(egg.p);
      if (p.z > 0.08) {
        ctx.fillStyle = "#f4e5be";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 12, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        circle(p.x - 3, p.y - 17, 3, "#bc9bdd");
        circle(p.x + 3, p.y - 8, 3, "#bc9bdd");
      }
    }
    if (guest) {
      const p = project(guest.p);
      if (p.z > 0.08) {
        circle(
          p.x,
          p.y - 10,
          guest.kind === 1 ? 11 : 13,
          ["#c6b0ee", "#ffe8a2", "#a5e1d7"][guest.kind],
        );
        for (let i = 0; i < (guest.kind === 0 ? 3 : 2); i++)
          circle(p.x - 5 + i * 5, p.y - 12, 2, "#384350");
        ctx.font = "12px sans-serif";
        ctx.fillStyle = "#f6efd7";
        ctx.fillText("你好，地球邻居", p.x - 38, p.y - 30);
      }
    }
    if (ufo) {
      const p = project(ufo.target),
        t = (now - ufo.start) / 8000;
      const x = reduced.matches
          ? p.x
          : p.x + (t < 0.2 ? (0.2 - t) * -1000 : t > 0.8 ? (t - 0.8) * 1000 : 0),
        y = p.y - 100;
      ctx.fillStyle = "#b9f87930";
      ctx.beginPath();
      ctx.moveTo(x - 12, y);
      ctx.lineTo(p.x - 24, p.y);
      ctx.lineTo(p.x + 24, p.y);
      ctx.lineTo(x + 12, y);
      ctx.fill();
      if (ufo.tree && p.z > 0.08 && t > 0.2 && t < 0.8) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.translate(0, -Math.sin(((t - 0.2) / 0.6) * Math.PI) * 65);
        tree({ x: 0, y: 0, z: p.z, type: ufo.target.type, growth: ufo.target.growth });
        ctx.restore();
      }
      circle(x, y - 9, 17, "#bce8e0");
      ctx.fillStyle = "#9a91b5";
      ctx.beginPath();
      ctx.ellipse(x, y, 33, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = -1; i <= 1; i++) circle(x + i * 17, y + 1, 3, "#ecf5b4");
    }
    if (meteor) {
      const p = meteorPosition(now);
      ctx.strokeStyle = "#ffeac2";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x - 42, p.y - 18);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      circle(p.x, p.y, 7, "#fff5c7");
      circle(p.x, p.y, 15, "#ffe8b233");
    }
  }
  document.getElementById("call-ufo").addEventListener("click", () => callUfo("tree"));
  document.getElementById("call-egg").addEventListener("click", () => callUfo("egg"));
  document.getElementById("hatch-egg").addEventListener("click", hatch);
  document.getElementById("call-meteor").addEventListener("click", callMeteor);
  document.getElementById("catch-meteor").addEventListener("click", catchMeteor);
  // Refresh quiet scenes too, so temporary wishes expire with reduced motion enabled.
  let visitorTimer = setInterval(() => {
    if (!document.hidden && (ufo || wish || guest || inverted.size)) draw();
  }, 500);
  addEventListener("pagehide", () => clearInterval(visitorTimer));
  addEventListener("pageshow", () => {
    clearInterval(visitorTimer);
    visitorTimer = setInterval(() => {
      if (!document.hidden && (ufo || wish || guest || inverted.size)) draw();
    }, 500);
  });
  function residentMood(r, text, seconds = 4) {
    r.mood = text;
    r.until = performance.now() + seconds * 1000;
  }
  function wet(p) {
    let grown = 0;
    for (const t of trees)
      if (near(t, p) < 0.48 && t.growth < 2) {
        t.growth++;
        grown++;
      }
    let pond = ponds.find((t) => near(t, p) < 0.25);
    if (land(p)) {
      if (pond) pond.water = Math.min(3, pond.water + 1);
      else if (ponds.length < 12) {
        const basin = nearestGround(p, trees);
        if (basin && near(basin, p) < 0.45) {
          pond = { ...basin, water: 1 };
          ponds.push(pond);
        }
      }
    }
    if (pond?.water === 3 && trees.length < MAX_PLANTS) {
      const candidate = normalize({ x: p.x + 0.28, y: p.y + 0.05, z: p.z + 0.06 });
      if (
        dry(candidate) &&
        trees.every((t) => near(t, candidate) > 0.16) &&
        near(candidate, volcano) > 0.24
      )
        trees.push({ ...candidate, type: "mushroom", growth: 1 });
    }
    repairGround();
    residents.forEach((r) => {
      if (near(r.p, p) < 0.9) residentMood(r, "找树躲雨！");
    });
    message.textContent = grown
      ? "雨水让附近的 " + grown + " 株植物长大了。居民正在找地方躲雨。"
      : pond?.water === 3
        ? "雨积成了小池塘，边上说不定会冒出蘑菇。"
        : "小云下起雨来，附近的居民开始找树躲雨。";
  }
  function simulate(dt, now) {
    for (const r of residents) {
      if (r.mood === "吓一跳！" && now < r.until) continue;
      const raining = effects.some((e) => e.kind === "rain" && near(e.p, r.p) < 0.9);
      const snack = effects.find(
        (e) => e.kind === "popcorn" && near(e.p, r.p) < 0.8 && dry(e.p) && clearPath(r.p, e.p),
      );
      const shelter = (raining ? trees : [])
        .filter(
          (t) => t.type === "tree" && t.growth === 2 && near(t, r.p) < 0.9 && clearPath(r.p, t),
        )
        .sort((a, b) => near(a, r.p) - near(b, r.p))[0];
      let target;
      if (snack) {
        target = snack.p;
        residentMood(r, "接住爆米花！", 1);
      } else if (raining && shelter) {
        target = shelter;
        if (near(r.p, shelter) < 0.12) residentMood(r, "这里不漏雨");
      } else if (night) {
        residentMood(r, "Zzz", 1);
        continue;
      } else
        target = normalize({
          x: r.p.x + Math.sin(now / 2400 + r.seed) * 0.1,
          y: r.p.y + Math.cos(now / 3100 + r.seed) * 0.06,
          z: r.p.z + Math.sin(now / 2800 + r.seed) * 0.07,
        });
      if (target) {
        const distance = near(target, r.p);
        const step = Math.min(
          1,
          (dt * (raining || snack ? 0.2 : 0.045)) / Math.max(0.02, distance),
        );
        const next = normalize({
          x: r.p.x + (target.x - r.p.x) * step,
          y: r.p.y + (target.y - r.p.y) * step,
          z: r.p.z + (target.z - r.p.z) * step,
        });
        if (clearPath(r.p, next)) r.p = next;
        else {
          // Turn along the shore instead of walking through water.
          for (let turn = 0; turn < 8; turn++) {
            const a = r.seed + (turn * Math.PI) / 4;
            const candidate = normalize({
              x: r.p.x + Math.cos(a) * dt * 0.06,
              y: r.p.y + Math.sin(a) * dt * 0.06,
              z: r.p.z + Math.sin(a + 0.8) * dt * 0.06,
            });
            if (clearPath(r.p, candidate)) {
              r.p = candidate;
              break;
            }
          }
        }
      }
      if (
        !raining &&
        !night &&
        trees.some((t) => t.type === "mushroom" && near(t, r.p) < 0.16) &&
        now > r.until
      )
        residentMood(r, "蘑菇帽真合适", 5);
    }
  }
  function resident(p, r, now) {
    const s = 0.55 + p.z * 0.5;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    const dancing = wish?.kind === "dance";
    const bob =
      reduced.matches || (night && !dancing)
        ? 0
        : Math.sin(now / (dancing ? 95 : 220) + r.seed) * (dancing ? 6 : 2);
    if (dancing) {
      ctx.rotate(reduced.matches ? 0 : Math.sin(now / 120 + r.seed) * 0.25);
      r.mood = "一起跳舞！";
      r.until = now + 500;
    }
    ctx.translate(0, bob);
    circle(0, -5, 7, r.color);
    circle(-2, -7, 1, "#273634");
    circle(3, -7, 1, "#273634");
    ctx.strokeStyle = "#344940";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, 1);
    ctx.lineTo(-4, 5);
    ctx.moveTo(3, 1);
    ctx.lineTo(4, 5);
    ctx.stroke();
    if (r.mood.includes("蘑菇帽") && now < r.until) {
      circle(0, -15, 7, "#e58a86");
      ctx.fillStyle = "#f5dbbe";
      ctx.fillRect(-7, -15, 14, 3);
    }
    if (now < r.until) {
      ctx.font = "11px sans-serif";
      const w = ctx.measureText(r.mood).width;
      ctx.fillStyle = "#f2efdb";
      ctx.fillRect(-w / 2 - 4, -37, w + 8, 17);
      ctx.fillStyle = "#314339";
      ctx.fillText(r.mood, -w / 2, -25);
    }
    ctx.restore();
  }

  const patches = [];
  for (let a = -Math.PI / 2; a < Math.PI / 2 - 0.01; a += Math.PI / 30)
    for (let b = -Math.PI; b < Math.PI; b += Math.PI / 40) {
      const mid = point(a + Math.PI / 60, b + Math.PI / 80);
      if (terrainNoise(mid))
        patches.push({
          mid,
          points: [
            point(a, b),
            point(a + Math.PI / 30, b),
            point(a + Math.PI / 30, b + Math.PI / 40),
            point(a, b + Math.PI / 40),
          ],
        });
    }
  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function tree(p) {
    const s = (0.45 + p.z * 0.7) * [0.35, 0.65, 1][p.growth ?? 2];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    if (p.inverted) {
      ctx.translate(0, -20);
      ctx.scale(1, -1);
    }
    if (p.type === "mushroom") {
      ctx.fillStyle = "#f0d6b0";
      ctx.fillRect(-3, -12, 6, 17);
      ctx.fillStyle = night ? "#bac8ed" : "#df948c";
      ctx.beginPath();
      ctx.ellipse(0, -13, 13, 8, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      circle(-5, -16, 2, "#fff4db");
      circle(5, -17, 2, "#fff4db");
      ctx.restore();
      return;
    }
    if (p.type === "lamp") {
      ctx.strokeStyle = "#566765";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -28);
      ctx.lineTo(10, -28);
      ctx.stroke();
      circle(10, -25, 6, night ? "#ffe8a2" : "#dbd9a9");
      if (night) circle(10, -25, 15, "#ffe5a330");
      ctx.restore();
      return;
    }
    ctx.fillStyle = "#775747";
    ctx.fillRect(-2, -4, 4, 13);
    circle(-5, -10, 8, wish?.kind === "pink" ? "#dc87ae" : night ? "#418269" : "#558d52");
    circle(5, -11, 8, wish?.kind === "pink" ? "#f2a7c8" : night ? "#509d73" : "#70ac59");
    circle(0, -18, 9, wish?.kind === "pink" ? "#ffd0e3" : night ? "#73af8c" : "#b5d779");
    ctx.restore();
  }
  function mountain(p, sneeze) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const s = 0.6 + p.z * 0.5;
    ctx.scale(s, s);
    ctx.fillStyle = "#ae8679";
    ctx.beginPath();
    ctx.moveTo(-25, 12);
    ctx.lineTo(-10, -29);
    ctx.lineTo(10, -29);
    ctx.lineTo(29, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#765b60";
    ctx.beginPath();
    ctx.moveTo(10, -29);
    ctx.lineTo(29, 12);
    ctx.lineTo(4, 12);
    ctx.fill();
    ctx.fillStyle = "#f4ac82";
    ctx.beginPath();
    ctx.ellipse(0, -28, 10, 4, 0, 0, 7);
    ctx.fill();
    circle(-7, -2, 2, "#312e37");
    circle(7, -2, 2, "#312e37");
    ctx.fillStyle = "#312e37";
    ctx.fillRect(-3, 5, 6, sneeze ? 5 : 2);
    ctx.restore();
  }
  function addEffect(kind, p) {
    effects.push({ kind, p, time: performance.now(), seed: Math.random() * 10 });
    if (effects.length > 12) effects.shift();
    draw();
    setTimeout(draw, 2650);
  }
  function draw() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    const now = performance.now();
    tickVisitors(now);
    if (!document.hidden && !reduced.matches) {
      simulate(Math.min(0.05, (now - (lastSim || now)) / 1000), now);
    }
    lastSim = now;
    status();
    while (effects.length && now - effects[0].time > 2600) effects.shift();
    ctx.clearRect(0, 0, 600, 510);
    for (let i = 0; i < 45; i++) {
      const x = (i * 137.5 + 27) % 590,
        y = (i * i * 19 + 31) % 480;
      circle(x, y, i % 7 === 0 ? 1.6 : 0.8, night ? "#d9d4fc88" : "#c5dde540");
    }
    ctx.save();
    ctx.translate(CX, CY + R + 28);
    ctx.scale(1, 0.16);
    circle(0, 0, R * 0.8, "#00000038");
    ctx.restore();
    const glow = ctx.createRadialGradient(CX, CY, R * 0.7, CX, CY, R * 1.17);
    glow.addColorStop(0, "#8ac5d600");
    glow.addColorStop(0.8, night ? "#9b9cff24" : "#a0d8dd24");
    glow.addColorStop(1, "#8ac5d600");
    circle(CX, CY, R * 1.17, glow);
    circle(CX, CY, R, night ? "#31597c" : "#69acbc");
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, 7);
    ctx.clip();
    for (const patch of patches) {
      if (rotate(patch.mid).z < 0) continue;
      const pts = patch.points.map(project);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = night ? "#477967" : "#9bb978";
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    const shade = ctx.createRadialGradient(CX - 65, CY - 70, 10, CX + 25, CY + 20, R * 1.2);
    shade.addColorStop(0, "#ffffff18");
    shade.addColorStop(0.55, "#ffffff00");
    shade.addColorStop(1, "#071d4266");
    circle(CX, CY, R, shade);
    ctx.restore();
    const vp = project(volcano);
    for (const pond of ponds) {
      const p = project(pond);
      if (p.z < 0.08) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = night ? "#558697" : "#79c9cb";
      ctx.beginPath();
      ctx.ellipse(0, 0, 6 + pond.water * 5, (3 + pond.water * 3) * p.z, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    const things = trees
      .filter(
        (p) => !(ufo?.tree && ufo.target === p && now - ufo.start > 1600 && now - ufo.start < 6400),
      )
      .map((p) => ({
        ...project(p),
        kind: "tree",
        type: p.type,
        growth: p.growth,
        inverted: inverted.has(p),
      }));
    residents.forEach((r) => things.push({ ...project(r.p), kind: "resident", r }));
    things.push({ ...vp, kind: "volcano" });
    things.sort((a, b) => a.z - b.z);
    for (const p of things) {
      if (p.z < 0.08) continue;
      if (p.kind === "tree") tree(p);
      else if (p.kind === "resident") resident(p, p.r, now);
      else
        mountain(
          p,
          effects.some((e) => e.kind === "volcano"),
        );
    }
    for (const e of effects) {
      const p = project(e.p);
      if (p.z < 0.04) continue;
      const t = (now - e.time) / 2600;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - t) * 2);
      if (e.kind === "rain" || e.kind === "popcorn") {
        for (let j = 0; j < 12; j++) {
          const x = p.x - 35 + ((j * 17) % 70),
            y = p.y - 55 + ((t * 160 + j * 13) % 75);
          if (e.kind === "popcorn") {
            circle(x, y, 4, "#fff0bc");
            circle(x - 3, y - 2, 3, "#fff9db");
            circle(x + 3, y - 2, 3, "#ffe8a1");
            continue;
          }
          ctx.strokeStyle = "#b2e9ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 3, y + 8);
          ctx.stroke();
        }
        circle(p.x - 15, p.y - 63, 13, "#e1edf4");
        circle(p.x + 4, p.y - 69, 17, e.kind === "popcorn" ? "#fff1cb" : "#f0f3f5");
        circle(p.x + 20, p.y - 61, 12, "#dde7ef");
      } else if (e.kind === "volcano") {
        for (let j = 0; j < 15; j++) {
          const a = j * 2.4;
          circle(
            p.x + Math.sin(a) * t * 75,
            p.y - 35 - t * 75 + Math.cos(a) * t * 40,
            3 + (j % 3),
            ["#ffbf91", "#e5dcfc", "#b9f879"][j % 3],
          );
        }
        ctx.font = "bold 19px sans-serif";
        ctx.fillStyle = "#fff3dc";
        ctx.fillText("阿嚏！", p.x - 24, p.y - 50 - t * 30);
      } else if (e.kind === "water") {
        ctx.strokeStyle = "#cef9f0";
        ctx.lineWidth = 2;
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 8 + t * 38 + j * 8, 4 + t * 12 + j * 3, 0, 0, 7);
          ctx.stroke();
        }
        ctx.font = "26px sans-serif";
        ctx.fillStyle = "#d7f6ec";
        ctx.fillText("♪", p.x - 7, p.y - 12 - t * 25);
      } else if (e.kind === "dig") {
        if (!reduced.matches && t < 0.18) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(1 - t / 0.18, 1 - t / 0.18);
          tree({ x: 0, y: 0, z: p.z, type: e.p.type, growth: e.p.growth });
          ctx.restore();
        }
        for (let j = 0; j < 9; j++)
          circle(
            p.x + Math.sin(j * 2.3) * t * 28,
            p.y - t * 24 + Math.cos(j) * t * 12,
            2,
            "#b69a74",
          );
      } else {
        ctx.font = "24px sans-serif";
        ctx.fillStyle = "#e2f7b4";
        ctx.fillText(e.kind === "tree" ? "✦" : "♡", p.x - 8, p.y - 25 - t * 35);
      }
      ctx.restore();
    }
    drawVisitors(now);
    if (cloudPoint) {
      const p = project(cloudPoint);
      if (p.z > 0) {
        circle(p.x - 14, p.y - 45, 12, "#dce7ec");
        circle(p.x, p.y - 52, 16, "#eef3f4");
        circle(p.x + 16, p.y - 45, 12, "#dce7ec");
      }
    }
    if (!document.hidden && !reduced.matches)
      frame = requestAnimationFrame(() => {
        if (performance.now() - lastDraw > 32) {
          lastDraw = performance.now();
          draw();
        } else frame = requestAnimationFrame(draw);
      });
  }
  function act(p) {
    let kind = tool;
    const closestResident = residents.find((r) => near(r.p, p) < 0.12);
    if (kind === "explore") {
      if (closestResident) {
        residentMood(closestResident, night ? "再睡五分钟" : "你好呀！");
        message.textContent = night ? "它翻了个身，继续做梦。" : "小居民停下脚步，向你打了个招呼。";
        playSound("hello");
        draw();
        return;
      }
      kind =
        near(p, volcano) < 0.24
          ? "volcano"
          : trees.some((t) => near(t, p) < 0.13)
            ? "hello"
            : land(p)
              ? "tree"
              : "water";
    }
    if (kind === "dig") {
      const target = trees
        .map((t, i) => ({ t, i, d: near(t, p) }))
        .filter((t) => project(t.t).z > 0.08 && t.d < 0.2)
        .sort((a, b) => a.d - b.d)[0];
      if (!target) {
        message.textContent = "这里没有植物。轻点树根或树冠，就能铲掉。";
        return;
      }
      if (ufo?.tree && ufo.target === target.t) {
        message.textContent = "这棵树正在外星飞船里做客，等它回来再铲吧。";
        return;
      }
      trees.splice(target.i, 1);
      undo = { plant: target.t, until: Date.now() + 8000 };
      residents.forEach((r) => {
        if (near(r.p, target.t) < 0.65) residentMood(r, "咦，我的树呢？");
      });
      message.textContent = "噗，空出一个位置。铲错了？点画布下方的“撤销铲除”，8 秒内可放回。";
      p = target.t;
    } else if (kind === "volcano") {
      yaw = -Math.atan2(volcano.x, volcano.z);
      pitch = Math.asin(volcano.y);
      p = volcano;
      residents.forEach((r) => residentMood(r, "吓一跳！"));
      message.textContent = "阿——嚏！居民吓得停住了脚步。";
    } else if (kind === "tree") {
      if (!dry(p)) {
        message.textContent = "这里是水面或岸边，植物要种在陆地里。换块绿色的空地吧。";
        return;
      }
      if (
        trees.length >= MAX_PLANTS ||
        trees.some((t) => near(t, p) < 0.17) ||
        near(p, volcano) < 0.24
      ) {
        message.textContent = "这里有点挤，换个位置，或用小铲子腾出空地吧。";
        return;
      }
      const selected = document.getElementById("seed-kind").value;
      const type =
        selected === "surprise"
          ? ["tree", "mushroom", "lamp"][Math.floor(Math.random() * 3)]
          : selected;
      trees.push({ ...p, type, growth: 0 });
      window.BoringAchievements?.record("tree");
      message.textContent = "种下一株小苗。把云拖过来下两场雨，看看它会长成什么。";
    } else if (kind === "rain") {
      const weather = document.getElementById("weather-kind").value;
      if (weather === "popcorn" || (weather === "random" && Math.random() < 0.22)) {
        kind = "popcorn";
        residents.forEach((r) => {
          if (near(r.p, p) < 0.9) residentMood(r, "接住爆米花！", 4);
        });
        message.textContent = "这朵云今天不浇水，只管开饭！爆米花不会积成池塘。";
      } else wet(p);
    } else if (kind === "water") message.textContent = "海里传来一声咕噜。可能有条鱼在唱歌。";
    else message.textContent = "小树晃了晃叶子：你好呀。";
    playSound(kind);
    canvas.dataset.lastEvent = kind;
    saveWorld();
    addEffect(kind, p);
  }
  document.getElementById("undo-plant").addEventListener("click", () => {
    if (!undo || Date.now() >= undo.until) {
      undo = null;
      status();
      return;
    }
    if (
      !dry(undo.plant) ||
      trees.length >= MAX_PLANTS ||
      trees.some((t) => near(t, undo.plant) < 0.17)
    ) {
      message.textContent = "原来的位置已被植物或池塘占用，暂时不能放回去。";
      return;
    }
    trees.push(undo.plant);
    undo = null;
    message.textContent = "植物已经放回原处。";
    saveWorld();
    playSound("tree");
    draw();
  });
  function coords(event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) * 600) / r.width,
      y: ((event.clientY - r.top) * 510) / r.height,
    };
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    const p = coords(e);
    if (tool === "rain") cloudPoint = inverse(p.x, p.y);
    drag = { id: e.pointerId, x: p.x, y: p.y, startX: p.x, startY: p.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const p = coords(e);
    if (Math.hypot(p.x - drag.startX, p.y - drag.startY) > 6) drag.moved = true;
    if (tool === "rain") {
      cloudPoint = inverse(p.x, p.y);
      draw();
    } else if (drag.moved) {
      yaw += (p.x - drag.x) * 0.008;
      pitch = Math.max(-1.25, Math.min(1.25, pitch + (p.y - drag.y) * 0.008));
      draw();
    }
    drag.x = p.x;
    drag.y = p.y;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const click = !drag.moved || tool === "rain";
    drag = null;
    cloudPoint = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (click) {
      const c = coords(e),
        p = inverse(c.x, c.y);
      if (meteor && Math.hypot(c.x - meteorPosition().x, c.y - meteorPosition().y) < 30) {
        catchMeteor();
        draw();
        return;
      }
      if (egg) {
        const ep = project(egg.p);
        if (ep.z > 0.08 && Math.hypot(c.x - ep.x, c.y - (ep.y - 12)) < 24) {
          hatch();
          draw();
          return;
        }
      }
      if (p) {
        if (tool === "dig" || tool === "explore") {
          const hit = trees
            .map((t) => ({ t, p: project(t) }))
            .filter(
              (t) =>
                t.p.z > 0.08 && Math.abs(t.p.x - c.x) < 15 && c.y > t.p.y - 32 && c.y < t.p.y + 12,
            )
            .sort((a, b) => b.p.z - a.p.z)[0];
          act(hit ? hit.t : p);
        } else act(p);
      } else message.textContent = "点在圆圆的星球上，小事才会发生。";
    } else saveWorld();
    draw();
  });
  canvas.addEventListener("pointercancel", () => {
    drag = null;
    cloudPoint = null;
    draw();
  });
  canvas.addEventListener("lostpointercapture", () => {
    drag = null;
    cloudPoint = null;
    draw();
  });
  canvas.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      if (e.key === "Enter" || e.key === " ") act(inverse(CX, CY));
      else {
        yaw += e.key === "ArrowLeft" ? -0.18 : e.key === "ArrowRight" ? 0.18 : 0;
        pitch = Math.max(
          -1.25,
          Math.min(1.25, pitch + (e.key === "ArrowUp" ? -0.18 : e.key === "ArrowDown" ? 0.18 : 0)),
        );
        saveWorld();
        draw();
      }
    }
  });
  document.querySelectorAll("[data-tool]").forEach((button) =>
    button.addEventListener("click", () => {
      tool = button.dataset.tool;
      document.querySelectorAll("[data-tool]").forEach((b) => {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
      updateToolHint();
      message.textContent = "已切换到“" + toolHints[tool][0] + "”，按画布下方的提示试试吧。";
      document.getElementById("seed-controls").hidden = tool !== "tree";
      document.getElementById("weather-controls").hidden = tool !== "rain";
    }),
  );
  document.getElementById("night").addEventListener("click", (e) => {
    night = !night;
    if (!night) meteor = null;
    eventUI();
    e.currentTarget.setAttribute("aria-pressed", String(night));
    e.currentTarget.textContent = night ? "切到白天 ☀" : "切到夜晚 ☾";
    document.querySelector(".planet-room").classList.toggle("is-night", night);
    message.textContent = night ? "灯暗下来，星星就开始值班了。" : "太阳回来了，继续无所事事吧。";
    saveWorld();
    draw();
  });
  document.getElementById("surprise-event").addEventListener("click", () => {
    const previous = tool;
    tool = ["tree", "rain", "volcano", "water"][Math.floor(Math.random() * 4)];
    act(inverse(CX, CY));
    tool = previous;
  });
  document.querySelector(".planet-room").classList.toggle("is-night", night);
  document.getElementById("night").setAttribute("aria-pressed", String(night));
  document.getElementById("night").textContent = night ? "切到白天 ☀" : "切到夜晚 ☾";
  updateToolHint();
  saveWorld();
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = 600 * dpr;
    canvas.height = 510 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    updateUndo();
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      drag = null;
      cloudPoint = null;
    } else {
      lastSim = 0;
      draw();
    }
  });
  reduced.addEventListener("change", draw);
  resize();
})();
