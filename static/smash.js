"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    canvas = $("desk"),
    ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const KEY = "boring-lab-smash-settings-v1",
    colors = ["#b9dc96", "#e5b078", "#aabce4", "#df9c98", "#88beb9"];
  let scene = "glass",
    cracks = [],
    shards = [],
    bubbles = [],
    blocks = [],
    broken = false;
  let pointer = null,
    drag = null,
    lastPoint = null,
    frame = 0,
    lastTime = 0,
    activeUntil = 0;
  let glassStrength = 10,
    glassDamage = 0,
    previousLayout = -1;
  let regenerate = true;
  let sound = true,
    vibration = false,
    audio = null,
    audioFailed = false,
    lastSound = 0,
    lastHaptic = 0;
  const voices = new Set();
  const supportsHaptic = typeof navigator.vibrate === "function";
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (typeof s?.regenerate === "boolean") regenerate = s.regenerate;
    if (typeof s?.sound === "boolean") sound = s.sound;
    if (typeof s?.vibration === "boolean") vibration = s.vibration && supportsHaptic;
  } catch {}
  function labels() {
    $("regenerate").hidden = scene !== "bubbles";
    $("regenerate").textContent = "自动再生：" + (regenerate ? "开" : "关");
    $("regenerate").setAttribute("aria-pressed", String(regenerate));
    $("sound").textContent = audioFailed ? "音效暂不可用" : "声音：" + (sound ? "开" : "关");
    $("sound").setAttribute("aria-pressed", String(sound && !audioFailed));
    $("haptic").textContent = supportsHaptic
      ? "震动：" + (vibration ? "开" : "关")
      : "此浏览器不支持震动";
    $("haptic").disabled = !supportsHaptic;
    $("haptic").setAttribute("aria-pressed", String(vibration));
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ sound, vibration, regenerate }));
    } catch {
      $("smash-note").textContent = "设置暂时无法保存，不影响继续玩。";
    }
  }
  function silence() {
    for (const source of voices)
      try {
        source.stop();
      } catch {}
    voices.clear();
    if (supportsHaptic) navigator.vibrate(0);
  }
  function feedback(kind, size = 2500) {
    const now = performance.now();
    if (vibration && supportsHaptic && now - lastHaptic > 65) {
      navigator.vibrate(kind === "glass" ? 24 : 10);
      lastHaptic = now;
    }
    if (!sound || audioFailed || document.hidden || now - lastSound < 45) return;
    lastSound = now;
    try {
      if (!audio) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw Error();
        audio = new Audio();
      }
      if (audio.state !== "running") audio.resume().catch(() => {});
      if (voices.size >= 6) return;
      const t = audio.currentTime,
        gain = audio.createGain(),
        duration = kind === "glass" ? 0.24 : 0.1;
      let source,
        filter = null;
      if (kind === "glass") {
        source = audio.createBufferSource();
        const buffer = audio.createBuffer(
            1,
            Math.ceil(audio.sampleRate * duration),
            audio.sampleRate,
          ),
          samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++)
          samples[i] = (Math.random() * 2 - 1) * Math.exp((-i / samples.length) * 4);
        source.buffer = buffer;
        filter = audio.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 1600 + Math.min(1, glassDamage / glassStrength) * 1800;
        source.connect(filter);
        filter.connect(gain);
      } else {
        source = audio.createOscillator();
        source.type = "sine";
        const high =
          kind === "pop"
            ? 500 + Math.random() * 500
            : Math.max(85, 210 - size / 70) + Math.random() * 15;
        source.frequency.setValueAtTime(high, t);
        source.frequency.exponentialRampToValueAtTime(60, t + duration);
        source.connect(gain);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(kind === "glass" ? 0.11 : 0.08, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      gain.connect(audio.destination);
      voices.add(source);
      source.onended = () => {
        voices.delete(source);
        source.disconnect();
        gain.disconnect();
        filter?.disconnect();
      };
      source.start(t);
      source.stop(t + duration);
    } catch {
      audioFailed = true;
      sound = false;
      silence();
      labels();
      $("smash-note").textContent = "音效未能启动，可以继续安静地玩。";
    }
  }
  const descriptions = {
    glass: [
      "易碎的，交给这里。",
      "轻敲玻璃，裂纹会从指尖散开。每块耐敲程度不同，连续敲同一处更容易破开。",
      "随手敲一下",
    ],
    blocks: [
      "搭得整齐，是为了推倒。",
      "抓住一块积木，拖动后松手。甩得快一点，撞得远一点。",
      "推一把积木",
    ],
    bubbles: [
      "一颗一颗，把烦躁戳掉。",
      "点击气泡，或按住划过一排。每一颗都有自己的啵声。",
      "戳破一颗",
    ],
  };
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }
  function release() {
    const id = pointer;
    pointer = null;
    drag = null;
    lastPoint = null;
    canvas.dataset.dragging = "false";
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function makeBlocks() {
    // Four supported arrangements; rectangles use their actual width and height in collisions.
    const choices = [0, 1, 2, 3].filter((i) => i !== previousLayout);
    const layout = choices[Math.floor(Math.random() * choices.length)];
    previousLayout = layout;
    canvas.dataset.layout = ["towers", "stairs", "wall", "leaning"][layout];
    const result = [];
    const add = (x, y, w, h) =>
      result.push({
        x,
        y,
        w,
        h,
        vx: 0,
        vy: 0,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    if (layout === 0) {
      for (let col = 0; col < 3; col++) {
        const height = 3 + Math.floor(Math.random() * 4),
          width = 68 + Math.floor(Math.random() * 30);
        let y = 407;
        for (let row = 0; row < height; row++) {
          const h = row % 2 ? 30 : 48,
            w = width - row * 3;
          y -= h;
          add(200 + col * 155, y + h / 2, w, h);
        }
      }
    } else if (layout === 1) {
      const reverse = Math.random() < 0.5,
        columns = 5 + Math.floor(Math.random() * 2);
      for (let col = 0; col < columns; col++) {
        const height = reverse ? columns - col : col + 1;
        for (let row = 0; row < height; row++) add(180 + col * 64, 407 - 22 - row * 44, 60, 44);
      }
    } else if (layout === 2) {
      const rows = 4 + Math.floor(Math.random() * 2);
      for (let row = 0; row < rows; row++) {
        let unit = 0;
        while (unit < 10) {
          const span = unit < 9 && Math.random() < 0.55 ? 2 : 1;
          add(120 + (unit + span / 2) * 48, 407 - 21 - row * 42, span * 48 - 2, 42);
          unit += span;
        }
      }
    } else {
      const direction = Math.random() < 0.5 ? -1 : 1,
        levels = 5 + Math.floor(Math.random() * 2);
      for (let row = 0; row < levels; row++)
        add(355 + direction * row * 8, 407 - 23 - row * 46, 128 - row * 8, 46);
      for (let col = 0; col < 3; col++) add(160 + col * 44, 390, 40, 34);
    }
    return result;
  }
  function updateBubbles(now) {
    if (scene !== "bubbles" || !regenerate) return;
    for (const b of bubbles)
      if (b.popped && now >= b.restoreAt + (reduced.matches ? 0 : 250)) b.popped = false;
    canvas.dataset.popped = String(bubbles.filter((b) => b.popped).length);
  }
  function bubblesPending() {
    return scene === "bubbles" && regenerate && bubbles.some((b) => b.popped);
  }
  function reset() {
    stop();
    release();
    silence();
    cracks = [];
    shards = [];
    broken = false;
    glassStrength = 6 + Math.floor(Math.random() * 9);
    glassDamage = 0;
    bubbles = Array.from({ length: 40 }, (_, i) => ({
      x: 94 + (i % 8) * 76,
      y: 74 + Math.floor(i / 8) * 76,
      popped: false,
      at: 0,
      restoreAt: Infinity,
    }));
    blocks = scene === "blocks" ? makeBlocks() : [];
    labels();
    canvas.dataset.scene = scene;
    canvas.dataset.broken = "false";
    canvas.dataset.popped = "0";
    const d = descriptions[scene];
    $("scene-name").textContent =
      scene === "blocks"
        ? {
            towers: "今天是几座小塔。",
            stairs: "一级一级，推倒快乐。",
            wall: "这一面墙，随你拆。",
            leaning: "歪歪的，也有自己的平衡。",
          }[canvas.dataset.layout]
        : d[0];
    $("scene-help").textContent = d[1];
    $("action").textContent = d[2];
    canvas.setAttribute(
      "aria-label",
      { glass: "可敲碎的玻璃", blocks: "可以拖动和推倒的积木", bubbles: "可以连续戳破的气泡" }[
        scene
      ],
    );
    $("smash-message").textContent = "今天不必小心翼翼。";
    draw();
    if (scene === "blocks") wake(1800);
  }
  function polygon(points) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const p of points.slice(1)) ctx.lineTo(...p);
    ctx.closePath();
  }
  function draw() {
    ctx.clearRect(0, 0, 720, 460);
    ctx.fillStyle = "#15232a";
    ctx.fillRect(0, 0, 720, 460);
    if (scene === "glass") {
      ctx.strokeStyle = "#52717c";
      ctx.lineWidth = 9;
      ctx.strokeRect(58, 43, 604, 374);
      if (!broken) {
        const g = ctx.createLinearGradient(70, 50, 600, 400);
        g.addColorStop(0, "#72939c");
        g.addColorStop(0.45, "#314f5c");
        g.addColorStop(1, "#668b90");
        ctx.fillStyle = g;
        ctx.fillRect(64, 49, 592, 362);
        ctx.save();
        ctx.beginPath();
        ctx.rect(64, 49, 592, 362);
        ctx.clip();
        ctx.strokeStyle = "rgba(216,246,241,.16)";
        ctx.lineWidth = 28;
        ctx.beginPath();
        ctx.moveTo(100, 420);
        ctx.lineTo(360, 40);
        ctx.moveTo(180, 420);
        ctx.lineTo(440, 40);
        ctx.stroke();
        ctx.lineWidth = 1 + Math.min(1.6, (glassDamage / glassStrength) * 1.6);
        ctx.strokeStyle = "#d2eeee";
        for (const c of cracks)
          for (const ray of c.rays) {
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(c.x + ray.dx * 0.4 + ray.bend, c.y + ray.dy * 0.4);
            ctx.lineTo(c.x + ray.dx, c.y + ray.dy);
            ctx.stroke();
          }
        ctx.restore();
      }
      for (const s of shards) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        polygon(s.points);
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.strokeStyle = "#b8dfdf";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      if (broken && !shards.length) {
        ctx.fillStyle = "#95b0b5";
        ctx.font = "18px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("好了，它替你承受了。", 360, 225);
      }
    } else if (scene === "blocks") {
      ctx.fillStyle = "#334338";
      ctx.fillRect(0, 407, 720, 53);
      ctx.strokeStyle = "#729579";
      ctx.beginPath();
      ctx.moveTo(0, 407);
      ctx.lineTo(720, 407);
      ctx.stroke();
      for (const b of blocks) {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
        ctx.fillStyle = "rgba(255,255,255,.22)";
        ctx.fillRect(b.x - b.w / 2 + 4, b.y - b.h / 2 + 4, b.w - 8, 5);
        ctx.strokeStyle = "rgba(0,0,0,.2)";
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      }
    } else {
      for (const b of bubbles) {
        const inflation =
          b.popped && regenerate && !reduced.matches
            ? Math.max(0, Math.min(1, (performance.now() - b.restoreAt) / 250))
            : 0;
        const radius = inflation > 0 ? 10 + 18 * inflation : 28;
        ctx.beginPath();
        ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
        if (b.popped && inflation === 0) {
          ctx.fillStyle = "#243940";
          ctx.fill();
          ctx.strokeStyle = "#425d64";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(b.x - 8, b.y + 3);
          ctx.lineTo(b.x, b.y - 3);
          ctx.lineTo(b.x + 8, b.y + 2);
          ctx.stroke();
        } else {
          const g = ctx.createRadialGradient(
            b.x - radius / 3,
            b.y - radius / 3,
            1,
            b.x,
            b.y,
            radius + 1,
          );
          g.addColorStop(0, "#dbf1d7");
          g.addColorStop(0.4, "#87b6a9");
          g.addColorStop(1, "#3e6c72");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = "#a2d3c3";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        const age = performance.now() - b.at;
        if (b.popped && age < 240 && !reduced.matches) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, 28 + age / 14, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(208,249,194,${1 - age / 240})`;
          ctx.stroke();
        }
      }
    }
  }
  function physics(dt) {
    for (const b of blocks) {
      if (b === drag) continue;
      b.vy += 780 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= Math.pow(0.98, dt * 60);
      if (b.x < b.w / 2 + 1 || b.x > 719 - b.w / 2) {
        b.x = Math.max(b.w / 2 + 1, Math.min(719 - b.w / 2, b.x));
        b.vx *= -0.35;
      }
      if (b.y > 407 - b.h / 2) {
        if (b.vy > 130) feedback("block", b.w * b.h);
        b.y = 407 - b.h / 2;
        b.vy = Math.abs(b.vy) > 45 ? -b.vy * 0.2 : 0;
        b.vx *= 0.9;
      }
      if (b.y < b.h / 2 + 1) {
        b.y = b.h / 2 + 1;
        b.vy = Math.abs(b.vy) * 0.2;
      }
    }
    for (let pass = 0; pass < 4; pass++)
      for (let i = 0; i < blocks.length; i++)
        for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i],
            b = blocks[j],
            dx = b.x - a.x,
            dy = b.y - a.y,
            ox = (a.w + b.w) / 2 - Math.abs(dx),
            oy = (a.h + b.h) / 2 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          const nx = ox < oy ? (dx >= 0 ? 1 : -1) : 0,
            ny = ox < oy ? 0 : dy >= 0 ? 1 : -1,
            depth = Math.min(ox, oy);
          const wa = a === drag ? 0 : 1,
            wb = b === drag ? 0 : 1,
            total = wa + wb;
          if (!total) continue;
          a.x -= (nx * depth * wa) / total;
          a.y -= (ny * depth * wa) / total;
          b.x += (nx * depth * wb) / total;
          b.y += (ny * depth * wb) / total;
          const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (relative < 0) {
            const impulse = (-relative * 1.12) / total;
            a.vx -= impulse * nx * wa;
            a.vy -= impulse * ny * wa;
            b.vx += impulse * nx * wb;
            b.vy += impulse * ny * wb;
            if (relative < -150) feedback("block", (a.w * a.h + b.w * b.h) / 2);
          }
        }
    for (const b of blocks) {
      b.x = Math.max(b.w / 2 + 1, Math.min(719 - b.w / 2, b.x));
      b.y = Math.max(b.h / 2 + 1, Math.min(407 - b.h / 2, b.y));
    }
  }
  function tick(now) {
    frame = 0;
    if (document.hidden) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.032) : 0.016;
    lastTime = now;
    if (scene === "blocks") {
      physics(dt / 2);
      physics(dt / 2);
    }
    for (const s of shards) {
      s.vy += 700 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.a += s.spin * dt;
    }
    shards = shards.filter((s) => s.y < 570);
    updateBubbles(now);
    draw();
    if (bubblesPending() || now < activeUntil || drag || shards.length)
      frame = requestAnimationFrame(tick);
    else lastTime = 0;
  }
  function wake(ms = 1800) {
    activeUntil = performance.now() + ms;
    if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function shatter(x, y) {
    broken = true;
    canvas.dataset.broken = "true";
    if (!reduced.matches)
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 6; col++)
          for (let side = 0; side < 2; side++) {
            const cx = 64 + col * 98.7 + 49,
              cy = 49 + row * 90.5 + 45;
            shards.push({
              x: cx,
              y: cy,
              points: side
                ? [
                    [-49, -45],
                    [49, 45],
                    [-49, 45],
                  ]
                : [
                    [-49, -45],
                    [49, -45],
                    [49, 45],
                  ],
              vx: (cx - x) * 0.75 + Math.random() * 70 - 35,
              vy: -80 + (cy - y) * 0.25,
              a: 0,
              spin: Math.random() * 4 - 2,
              color: side ? "#6d959f" : "#476e7e",
            });
          }
    $("smash-message").textContent = "好了，这块玻璃替你承受了。";
    wake();
  }
  function hit(x, y) {
    if (scene === "glass") {
      if (broken || x < 64 || x > 656 || y < 49 || y > 411) return;
      const localHits = cracks.filter((c) => Math.hypot(c.x - x, c.y - y) < 65).length;
      glassDamage += 1 + Math.min(0.45, localHits * 0.12);
      cracks.push({
        x,
        y,
        rays: Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3,
            length = 28 + Math.random() * 70 + (glassDamage / glassStrength) * 125;
          return {
            dx: Math.cos(a) * length,
            dy: Math.sin(a) * length,
            bend: Math.random() * 24 - 12,
          };
        }),
      });
      feedback("glass");
      $("smash-message").textContent = "再敲一下也没关系。";
      if (cracks.length >= 6 && glassDamage >= glassStrength) shatter(x, y);
      draw();
    } else if (scene === "bubbles") {
      const b = bubbles.find((b) => !b.popped && Math.hypot(b.x - x, b.y - y) < 32);
      if (!b) return;
      b.popped = true;
      b.at = performance.now();
      b.restoreAt = regenerate ? b.at + 500 + Math.random() * 700 : Infinity;
      feedback("pop");
      const remaining = bubbles.filter((b) => !b.popped).length;
      canvas.dataset.popped = String(40 - remaining);
      $("smash-message").textContent = remaining
        ? "啵。又松了一小口气。"
        : regenerate
          ? "喘口气，它们马上又鼓起来。"
          : "这一桌的烦躁，戳完了。";
      draw();
      if (regenerate || !reduced.matches) wake(280);
    }
  }
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * 720) / r.width,
      y: ((e.clientY - r.top) * 460) / r.height,
      time: performance.now(),
    };
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0 || pointer !== null) return;
    e.preventDefault();
    pointer = e.pointerId;
    lastPoint = point(e);
    canvas.setPointerCapture(pointer);
    if (scene === "blocks") {
      drag =
        [...blocks]
          .reverse()
          .find(
            (b) => Math.abs(b.x - lastPoint.x) < b.w / 2 && Math.abs(b.y - lastPoint.y) < b.h / 2,
          ) || null;
      canvas.dataset.dragging = String(!!drag);
      if (drag) {
        feedback("block");
        drag.vx = drag.vy = 0;
        wake(5000);
      }
    } else hit(lastPoint.x, lastPoint.y);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointer || !lastPoint) return;
    const p = point(e);
    if (drag) {
      const dt = Math.max(0.016, (p.time - lastPoint.time) / 1000);
      drag.vx = Math.max(-700, Math.min(700, (p.x - lastPoint.x) / dt));
      drag.vy = Math.max(-700, Math.min(700, (p.y - lastPoint.y) / dt));
      drag.x = Math.max(drag.w / 2 + 1, Math.min(719 - drag.w / 2, p.x));
      drag.y = Math.max(drag.h / 2 + 1, Math.min(407 - drag.h / 2, p.y));
      wake(5000);
    } else if (scene === "bubbles") {
      const steps = Math.ceil(Math.hypot(p.x - lastPoint.x, p.y - lastPoint.y) / 12);
      for (let i = 1; i <= steps; i++)
        hit(
          lastPoint.x + ((p.x - lastPoint.x) * i) / steps,
          lastPoint.y + ((p.y - lastPoint.y) * i) / steps,
        );
    }
    lastPoint = p;
  });
  function end(e, cancelled = false) {
    if (e.pointerId !== pointer) return;
    if (drag && (cancelled || performance.now() - lastPoint.time > 100)) drag.vx = drag.vy = 0;
    release();
    if (scene === "blocks") wake(5000);
  }
  canvas.addEventListener("pointerup", (e) => end(e));
  canvas.addEventListener("pointercancel", (e) => end(e, true));
  canvas.addEventListener("lostpointercapture", (e) => end(e, true));
  function action() {
    if (scene === "blocks") {
      for (const b of blocks) {
        b.vx += 180 + Math.random() * 150;
        b.vy -= 60 + Math.random() * 100;
      }
      feedback("block");
      $("smash-message").textContent = "推倒了也没关系，再搭就是了。";
      wake(6000);
    } else if (scene === "bubbles") {
      const b = bubbles.find((b) => !b.popped);
      if (b) hit(b.x, b.y);
    } else hit(300 + Math.random() * 120, 180 + Math.random() * 100);
  }
  $("action").addEventListener("click", action);
  canvas.addEventListener("keydown", (e) => {
    if ([" ", "Enter"].includes(e.key) && !e.repeat) {
      e.preventDefault();
      action();
    }
  });
  $("again").addEventListener("click", reset);
  document.querySelectorAll("[data-scene]").forEach((b) =>
    b.addEventListener("click", () => {
      scene = b.dataset.scene;
      document
        .querySelectorAll("[data-scene]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      reset();
    }),
  );
  $("sound").addEventListener("click", () => {
    sound = !sound;
    audioFailed = false;
    if (!sound) silence();
    labels();
    save();
  });
  $("regenerate").addEventListener("click", () => {
    regenerate = !regenerate;
    const now = performance.now();
    for (const b of bubbles)
      if (b.popped) b.restoreAt = regenerate ? now + 500 + Math.random() * 700 : Infinity;
    labels();
    save();
    draw();
    if (bubblesPending()) wake(1500);
    $("smash-message").textContent = regenerate
      ? "它们会很快鼓回来，慢慢戳。"
      : "这一桌可以一颗不剩地戳完。";
  });
  $("haptic").addEventListener("click", () => {
    vibration = !vibration && supportsHaptic;
    if (!vibration && supportsHaptic) navigator.vibrate(0);
    labels();
    save();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (drag) drag.vx = drag.vy = 0;
      release();
      stop();
      silence();
      audio?.suspend().catch(() => {});
    } else if (scene === "blocks" || shards.length || bubblesPending()) wake(2000);
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) shards = [];
    draw();
  });
  addEventListener("pagehide", () => {
    release();
    stop();
    silence();
    audio?.suspend().catch(() => {});
  });
  addEventListener("pageshow", () => {
    if (scene === "blocks" || bubblesPending()) wake(2000);
  });
  labels();
  reset();
})();
