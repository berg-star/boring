"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $("drawing"),
    ctx = canvas.getContext("2d"),
    KEY = "boring-lab-doodle-v1";
  const inks = [
    ["墨黑", "#28352f"],
    ["草绿", "#638c40"],
    ["橘红", "#dc7050"],
    ["蓝色", "#598cae"],
    ["紫色", "#9b70ac"],
  ];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let strokes = [],
    active = null,
    pointer = null,
    ink = inks[0][1],
    live = false,
    paused = reduced.matches;
  let motion = "jelly",
    frame = 0,
    phase = 0,
    previous = 0,
    pokeUntil = 0,
    blocked = false;
  let sprite = document.createElement("canvas"),
    sw = 0,
    sh = 0;
  const maxPoints = 16000;
  const count = () => strokes.reduce((n, s) => n + s.points.length, 0);
  function error(message = "") {
    $("doodle-error").textContent = message;
  }
  function save() {
    if (!blocked)
      try {
        localStorage.setItem(KEY, JSON.stringify({ version: 1, strokes }));
      } catch {
        blocked = true;
      }
    $("doodle-save").textContent = blocked
      ? "存储不可用或旧画作损坏，本次可继续画，但暂不覆盖旧记录。"
      : "画作已自动保存在这个浏览器。";
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      if (raw.length > 1000000) throw Error();
      const data = JSON.parse(raw);
      if (data?.version !== 1 || !Array.isArray(data.strokes) || data.strokes.length > 100)
        throw Error();
      let total = 0;
      for (const s of data.strokes) {
        if (
          !s ||
          !inks.some((i) => i[1] === s.color) ||
          ![4, 9, 16].includes(s.width) ||
          !Array.isArray(s.points) ||
          !s.points.length
        )
          throw Error();
        total += s.points.length;
        if (
          total > maxPoints ||
          s.points.some(
            (p) =>
              !Array.isArray(p) ||
              p.length !== 2 ||
              !p.every(Number.isFinite) ||
              p[0] < 0 ||
              p[0] > 640 ||
              p[1] < 0 ||
              p[1] > 440,
          )
        )
          throw Error();
      }
      strokes = data.strokes;
    }
  } catch {
    blocked = true;
  }
  function paint(c, s) {
    c.strokeStyle = c.fillStyle = s.color;
    c.lineWidth = s.width;
    c.lineCap = c.lineJoin = "round";
    if (s.points.length === 1) {
      c.beginPath();
      c.arc(...s.points[0], s.width / 2, 0, Math.PI * 2);
      c.fill();
      return;
    }
    c.beginPath();
    c.moveTo(...s.points[0]);
    for (const p of s.points.slice(1)) c.lineTo(...p);
    c.stroke();
  }
  function drawEditor() {
    ctx.clearRect(0, 0, 640, 440);
    strokes.forEach((s) => paint(ctx, s));
    if (active) paint(ctx, active);
    $("paper-hint").hidden = strokes.length > 0 || !!active;
    $("undo").disabled = !strokes.length;
    $("clear").disabled = !strokes.length;
  }
  function buildSprite() {
    let x0 = 640,
      x1 = 0,
      y0 = 440,
      y1 = 0;
    for (const s of strokes)
      for (const [x, y] of s.points) {
        x0 = Math.min(x0, x - s.width);
        x1 = Math.max(x1, x + s.width);
        y0 = Math.min(y0, y - s.width);
        y1 = Math.max(y1, y + s.width);
      }
    sprite.width = Math.ceil(x1 - x0);
    sprite.height = Math.ceil(y1 - y0);
    const c = sprite.getContext("2d");
    c.translate(-x0, -y0);
    strokes.forEach((s) => paint(c, s));
    const scale = Math.min(280 / sprite.width, 220 / sprite.height, 3);
    sw = sprite.width * scale;
    sh = sprite.height * scale;
  }
  function drawLive(now = performance.now()) {
    ctx.clearRect(0, 0, 640, 440);
    const moving = !paused && !reduced.matches;
    const t = moving ? phase : 0;
    const selected =
      motion === "random" ? ["jelly", "jump", "flop"][Math.floor(t / 4) % 3] : motion;
    let sx = 1,
      sy = 1,
      angle = 0,
      lift = 0,
      skew = 0;
    if (moving) {
      if (selected === "jelly") {
        sx = 1 + 0.12 * Math.sin(t * 5);
        sy = 1 - 0.12 * Math.sin(t * 5);
        skew = 0.12 * Math.sin(t * 3);
      }
      if (selected === "jump") {
        const jump = Math.abs(Math.sin(t * 3));
        lift = jump * 65;
        sx = 1.15 - jump * 0.24;
        sy = 0.82 + jump * 0.3;
        angle = 0.07 * Math.sin(t * 3);
      }
      if (selected === "flop") {
        const f = (1 - Math.cos(t * 1.7)) / 2;
        sx = 1 + 0.3 * f;
        sy = 1 - 0.68 * f;
        angle = 0.28 * f;
      }
      if (now < pokeUntil) {
        lift += 25 * Math.abs(Math.sin((pokeUntil - now) / 90));
        angle += 0.14 * Math.sin(now / 35);
      }
    }
    ctx.fillStyle = "rgba(45,60,37,.12)";
    ctx.beginPath();
    ctx.ellipse(320, 345, Math.max(25, sw * 0.4 - lift * 0.2), 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(320, 337 - lift);
    ctx.rotate(angle);
    ctx.transform(sx, 0, skew, sy, 0, 0);
    ctx.drawImage(sprite, -sw / 2, -sh, sw, sh);
    ctx.restore();
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  }
  function tick(now) {
    frame = 0;
    if (reduced.matches) {
      paused = true;
      pauseLabel();
      if (live) drawLive(now);
      return;
    }
    if (!live || paused || document.hidden) return;
    if (previous) phase += Math.min((now - previous) / 1000, 0.05);
    previous = now;
    drawLive(now);
    frame = requestAnimationFrame(tick);
  }
  function start() {
    stop();
    if (live) {
      drawLive();
      if (!paused && !reduced.matches && !document.hidden) frame = requestAnimationFrame(tick);
    }
  }
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return [
      Math.round(Math.max(0, Math.min(640, ((e.clientX - r.left) * 640) / r.width))),
      Math.round(Math.max(0, Math.min(440, ((e.clientY - r.top) * 440) / r.height))),
    ];
  }
  function poke() {
    pokeUntil = performance.now() + 650;
    $("doodle-speech").textContent = "嘿！没有骨头也是有脾气的。";
    if (paused || reduced.matches) drawLive();
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    if (live) {
      poke();
      return;
    }
    if (pointer !== null) return;
    error();
    if (strokes.length >= 100 || count() >= maxPoints) {
      error("画纸记住的笔画够多啦，先撤销几笔或让它活过来吧。");
      return;
    }
    e.preventDefault();
    pointer = e.pointerId;
    active = { color: ink, width: Number($("brush").value), points: [point(e)] };
    canvas.setPointerCapture(pointer);
    drawEditor();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointer !== e.pointerId || !active) return;
    const p = point(e),
      last = active.points.at(-1);
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
    if (count() + active.points.length >= maxPoints) {
      error("这张画已经很丰富啦，完成后让它动起来吧。");
      return;
    }
    active.points.push(p);
    drawEditor();
  });
  function finish(e, discard = false) {
    if (pointer !== e.pointerId) return;
    const id = pointer;
    pointer = null;
    if (!discard && active) strokes.push(active);
    active = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    drawEditor();
    save();
  }
  canvas.addEventListener("pointerup", (e) => finish(e));
  canvas.addEventListener("pointercancel", (e) => finish(e, true));
  canvas.addEventListener("lostpointercapture", (e) => finish(e));
  for (const [name, color] of inks) {
    const button = document.createElement("button");
    button.type = "button";
    button.style.setProperty("--ink", color);
    button.setAttribute("aria-label", name);
    button.setAttribute("aria-pressed", String(color === ink));
    button.addEventListener("click", () => {
      ink = color;
      for (const b of $("palette").children) b.setAttribute("aria-pressed", String(b === button));
    });
    $("palette").append(button);
  }
  $("undo").addEventListener("click", () => {
    strokes.pop();
    error();
    drawEditor();
    save();
  });
  $("clear").addEventListener("click", () => {
    if (confirm("清空这张画纸？当前画作会被移除。")) {
      strokes = [];
      error();
      drawEditor();
      save();
    }
  });
  $("sample").addEventListener("click", () => {
    if (strokes.length && !confirm("用示例小怪物替换当前画作？")) return;
    strokes = [
      {
        color: inks[0][1],
        width: 9,
        points: [
          [220, 310],
          [204, 260],
          [213, 192],
          [236, 155],
          [241, 112],
          [279, 143],
          [320, 135],
          [350, 145],
          [390, 111],
          [393, 161],
          [422, 202],
          [432, 270],
          [411, 310],
          [376, 302],
          [352, 317],
          [323, 303],
          [292, 317],
          [267, 303],
          [242, 315],
          [220, 310],
        ],
      },
      { color: inks[0][1], width: 16, points: [[272, 211]] },
      { color: inks[0][1], width: 16, points: [[368, 211]] },
      {
        color: inks[2][1],
        width: 9,
        points: [
          [292, 247],
          [306, 258],
          [325, 262],
          [342, 256],
          [354, 246],
        ],
      },
    ];
    error();
    drawEditor();
    save();
  });
  $("alive").addEventListener("click", () => {
    if (!strokes.length) {
      error("先画一笔，或者借一只小怪物吧。");
      return;
    }
    live = true;
    phase = 0;
    error();
    buildSprite();
    $("paint-tools").hidden = $("edit-actions").hidden = true;
    $("live-actions").hidden = false;
    $("paper-hint").hidden = true;
    canvas.classList.add("is-live");
    canvas.setAttribute("aria-label", "活动中的涂鸦，点击或用下方按钮戳它一下。");
    $("mode-label").textContent = "02 / 它有自己的想法了";
    $("doodle-speech").textContent = "它刚出生，就已经不想上班了。";
    start();
    $("poke").focus();
  });
  $("edit").addEventListener("click", () => {
    live = false;
    stop();
    $("paint-tools").hidden = $("edit-actions").hidden = false;
    $("live-actions").hidden = true;
    canvas.classList.remove("is-live");
    canvas.setAttribute("aria-label", "涂鸦画纸，可用鼠标或手指绘画。不会画也可以用下方示例。");
    $("mode-label").textContent = "01 / 画一个小东西";
    $("doodle-speech").textContent = "给它补两笔，它会不会更有精神？";
    drawEditor();
    canvas.focus();
  });
  const sayings = {
    jelly: "软乎乎的，也要坚持晃来晃去。",
    jump: "没有腿，但有蹦跶的梦想。",
    flop: "努力站起来，算了，再躺一会儿。",
    random: "它的精神状态，现在是随机的。",
  };
  document.querySelectorAll("[data-motion]").forEach((b) =>
    b.addEventListener("click", () => {
      motion = b.dataset.motion;
      phase = 0;
      document
        .querySelectorAll("[data-motion]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $("doodle-speech").textContent = sayings[motion];
      start();
    }),
  );
  $("poke").addEventListener("click", poke);
  canvas.addEventListener("keydown", (e) => {
    if (live && ["Enter", " "].includes(e.key)) {
      e.preventDefault();
      poke();
    }
  });
  function pauseLabel() {
    $("pause").textContent = reduced.matches
      ? "已遵循减少动态效果"
      : paused
        ? "继续活动"
        : "暂停动作";
    $("pause").disabled = reduced.matches;
    $("pause").setAttribute("aria-pressed", String(paused || reduced.matches));
  }
  $("pause").addEventListener("click", () => {
    paused = !paused;
    pauseLabel();
    start();
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) paused = true;
    pauseLabel();
    start();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
      if (active) finish({ pointerId: pointer });
    } else start();
  });
  addEventListener("pagehide", stop);
  addEventListener("pageshow", start);
  pauseLabel();
  drawEditor();
  save();
})();
