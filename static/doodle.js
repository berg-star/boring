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
  let motion = "rest",
    frame = 0,
    phase = 0,
    previous = 0,
    pokeUntil = 0,
    blocked = false;
  let sprite = document.createElement("canvas"),
    sw = 0,
    sh = 0;
  const toy = createDoodleToy(ctx);
  const soft = createDoodleSoft();
  let liveStrokes = [],
    tool = "pull",
    grip = null;
  function deformGrip() {
    if (!grip) return;
    const body = toy.pose();
    soft.hold(
      grip.x,
      grip.y,
      tool === "press" ? 0 : grip.px - body.x - grip.x,
      tool === "press" ? 48 : grip.py - body.y - grip.y,
    );
    if (paused || reduced.matches) soft.update(0, true);
  }
  let lastModel = "",
    grabbed = false,
    renderPose = { x: 320, y: 354, w: 200, h: 200 };
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
      if (data?.version !== 1) throw Error();
      validateStrokes(data.strokes);
      strokes = data.strokes;
    }
  } catch {
    blocked = true;
  }
  function validateStrokes(list) {
    if (!Array.isArray(list) || list.length > 100) throw Error();
    let total = 0;
    for (const s of list) {
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
    toy.reset(sw, sh);
    soft.reset(sw, sh);
    // Resample long straight lines so their middle can bend too.
    liveStrokes = strokes.map((s) => {
      const points = [];
      for (let i = 0; i < s.points.length; i++) {
        const p = s.points[i],
          prev = s.points[Math.max(0, i - 1)];
        const steps = i
          ? Math.max(1, Math.ceil((Math.hypot(p[0] - prev[0], p[1] - prev[1]) * scale) / 5))
          : 1;
        for (let j = 1; j <= steps; j++)
          points.push([
            (prev[0] + ((p[0] - prev[0]) * j) / steps - x0) * scale - sw / 2,
            (prev[1] + ((p[1] - prev[1]) * j) / steps - y0) * scale - sh,
          ]);
      }
      return { color: s.color, width: s.width * scale, points };
    });
  }
  function drawLive(now = performance.now()) {
    ctx.clearRect(0, 0, 640, 440);
    toy.background();
    const moving = !paused && !reduced.matches && !toy.moving && !grabbed;
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
    const body = toy.pose();
    if (toy.moving) {
      sx = body.sx;
      sy = body.sy;
    }
    renderPose = { x: body.x, y: body.y - lift, w: sw * sx, h: sh * sy };
    ctx.fillStyle = "rgba(45,60,37,.12)";
    ctx.beginPath();
    ctx.ellipse(body.x, 365, Math.max(25, sw * 0.4 - lift * 0.2), 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(body.x, body.y - lift);
    ctx.rotate(angle);
    ctx.transform(sx, 0, skew, sy, 0, 0);
    for (const s of liveStrokes) paint(ctx, { ...s, points: s.points.map((p) => soft.map(...p)) });
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
    if (previous) {
      const dt = Math.min((now - previous) / 1000, 0.032);
      phase += dt;
      toy.update(dt);
      deformGrip();
      soft.update(dt);
    }
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
    if (!paused && !reduced.matches && !grabbed) {
      soft.hold(0, -sh * 0.55, 0, 65);
      soft.update(0.032);
      soft.release();
    }
    pokeUntil = performance.now() + 250;
    $("doodle-speech").textContent = "嘿！没有骨头也是有脾气的。";
    if (paused || reduced.matches) drawLive();
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    if (live) {
      if (pointer !== null) return;
      const [x, y] = point(e);
      if (toy.down(x, y, renderPose)) {
        motion = "rest";
        document
          .querySelectorAll("[data-motion]")
          .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.motion === "rest")));
        const body = toy.pose();
        grip = { x: x - body.x, y: y - body.y, px: x, py: y };
        deformGrip();
        e.preventDefault();
        pointer = e.pointerId;
        grabbed = true;
        canvas.setPointerCapture(pointer);
        canvas.classList.add("is-grabbed");
        drawLive();
      } else poke();
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
    if (pointer !== e.pointerId) return;
    if (grabbed) {
      const [x, y] = point(e);
      grip.px = x;
      grip.py = y;
      if (tool === "pull") toy.move(x, y);
      deformGrip();
      drawLive();
      return;
    }
    if (!active) return;
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
    if (grabbed) {
      grabbed = false;
      grip = null;
      soft.release();
      if (discard || paused || reduced.matches) soft.reset(sw, sh);
      toy.release(discard, paused || reduced.matches);
      canvas.classList.remove("is-grabbed");
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      start();
      return;
    }
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
    if (strokes.length && !confirm("随机造型会替换当前画纸。喜欢的作品可以先收藏，继续吗？"))
      return;
    const kind = $("model-kind").value;
    const choices = DoodlePresets.models.filter(
      (m) => (kind === "all" || m[2] === kind) && m[0] !== lastModel,
    );
    const model = choices[Math.floor(Math.random() * choices.length)];
    lastModel = model[0];
    strokes = DoodlePresets.make(model[0]);
    validateStrokes(strokes);
    $("doodle-speech").textContent = "抽到了「" + model[1] + "」。补几笔，它就是你的版本。";
    $("art-name").value = model[1];
    error();
    drawEditor();
    save();
  });
  $("recolor").addEventListener("click", () => {
    strokes.forEach((s) => (s.color = ink));
    drawEditor();
    save();
  });
  document.querySelectorAll("[data-stage]").forEach((b) =>
    b.addEventListener("click", () => {
      if (pointer !== null) finish({ pointerId: pointer }, true);
      toy.stage(b.dataset.stage);
      soft.reset(sw, sh);
      document
        .querySelectorAll("[data-stage]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $("stage-help").textContent = {
        desk: "抓起来再松手，落地会压扁、弹两下。",
        trampoline: "抛起来，蹦床会接住它继续弹。",
        moon: "这里重力很小，抛起后会慢慢落下。",
      }[b.dataset.stage];
      start();
    }),
  );
  $("toss").addEventListener("click", () => {
    toy.toss(paused || reduced.matches);
    start();
  });
  $("alive").addEventListener("click", () => {
    if (!strokes.length) {
      error("先画一笔，或者随机载入一个造型吧。");
      return;
    }
    live = true;
    phase = 0;
    error();
    buildSprite();
    $("paint-tools").hidden = $("edit-actions").hidden = $("model-picker").hidden = true;
    $("live-actions").hidden = false;
    $("paper-hint").hidden = true;
    canvas.classList.add("is-live");
    canvas.setAttribute("aria-label", "活动中的涂鸦，可以拖动抛掷，也可以用下方抛起按钮。");
    $("mode-label").textContent = "02 / 它有自己的想法了";
    $("doodle-speech").textContent = "抓住一个角拉一拉，松手看看它怎么弹回来。";
    start();
    $("poke").focus();
  });
  $("edit").addEventListener("click", () => {
    if (pointer !== null) finish({ pointerId: pointer }, true);
    live = false;
    stop();
    toy.reset();
    $("paint-tools").hidden = $("edit-actions").hidden = $("model-picker").hidden = false;
    $("live-actions").hidden = true;
    canvas.classList.remove("is-live");
    canvas.setAttribute("aria-label", "涂鸦画纸，可用鼠标或手指绘画。不会画也可以用下方示例。");
    $("mode-label").textContent = "01 / 画一个小东西";
    $("doodle-speech").textContent = "给它补两笔，它会不会更有精神？";
    drawEditor();
    canvas.focus();
  });
  const sayings = {
    rest: "抓住一个角拉一拉，或者换成按压，揉出一个小凹坑。",
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
  document.querySelectorAll("[data-tool]").forEach((b) =>
    b.addEventListener("click", () => {
      if (pointer !== null) finish({ pointerId: pointer }, true);
      tool = b.dataset.tool;
      document
        .querySelectorAll("[data-tool]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $("doodle-speech").textContent =
        tool === "press" ? "按住涂鸦，局部会凹下去；松手恢复。" : "抓住一个角，慢慢拉开，再松手。";
    }),
  );
  document.querySelectorAll("[data-material]").forEach((b) =>
    b.addEventListener("click", () => {
      soft.material(b.dataset.material);
      document
        .querySelectorAll("[data-material]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
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
    $("toss").disabled = paused || reduced.matches;
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
      if (pointer !== null) finish({ pointerId: pointer }, true);
    } else start();
  });
  addEventListener("pagehide", () => {
    if (pointer !== null) finish({ pointerId: pointer }, true);
    stop();
  });
  addEventListener("pageshow", start);
  createDoodleShelf({
    validate: validateStrokes,
    paint,
    getStrokes: () => strokes,
    open: (list) => {
      if (live) $("edit").click();
      strokes = list;
      error();
      drawEditor();
      save();
      $("drawing").scrollIntoView({ block: "center" });
    },
  });
  pauseLabel();
  drawEditor();
  save();
})();
