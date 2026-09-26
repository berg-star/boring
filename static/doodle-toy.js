"use strict";
window.createDoodleToy = function (ctx) {
  const stages = {
    desk: { gravity: 1000, bounce: 0.38 },
    trampoline: { gravity: 1250, bounce: 0.88 },
    moon: { gravity: 220, bounce: 0.58 },
  };
  let stage = "desk",
    w = 200,
    h = 200,
    x = 320,
    y = 354,
    vx = 0,
    vy = 0,
    held = false,
    flying = false,
    last = null,
    offset = [0, 0],
    impact = 0;
  const limit = (n, a, b) => Math.max(a, Math.min(b, n));
  function reset(width = w, height = h) {
    w = width;
    h = height;
    x = 320;
    y = 354;
    vx = vy = impact = 0;
    held = flying = false;
    last = null;
  }
  function clamp() {
    x = limit(x, w * 0.65 + 8, 632 - w * 0.65);
    y = limit(y, h * 1.12 + 10, 354);
  }
  function update(dt) {
    impact = Math.max(0, impact - dt * 3);
    if (held || !flying) return;
    const model = stages[stage];
    vy += model.gravity * dt;
    x += vx * dt;
    y += vy * dt;
    vx *= Math.pow(0.998, dt * 60);
    const left = w * 0.65 + 8,
      right = 632 - w * 0.65;
    if (x < left || x > right) {
      x = limit(x, left, right);
      vx *= -0.55;
    }
    if (y < h * 1.12 + 10) {
      y = h * 1.12 + 10;
      vy = Math.max(0, vy) * 0.4;
    }
    if (y >= 354) {
      y = 354;
      impact = Math.min(0.28, Math.abs(vy) / 2400);
      const speed = Math.abs(vy);
      vy = -speed * model.bounce;
      vx *= 0.8;
      if (stage === "trampoline" && speed > 90)
        vy = -Math.max(440, Math.min(620, speed * model.bounce));
      if (Math.abs(vy) < 45) {
        vy = 0;
        if (Math.abs(vx) < 12) {
          vx = 0;
          flying = false;
        }
      }
    }
  }
  return {
    reset,
    stage(value) {
      if (!Object.hasOwn(stages, value)) return;
      stage = value;
      reset();
    },
    update,
    get moving() {
      return held || flying;
    },
    get holding() {
      return held;
    },
    pose() {
      return { x, y, sx: held ? 0.91 : 1 + impact, sy: held ? 1.1 : 1 - impact };
    },
    down(px, py, render) {
      if (
        px < render.x - render.w * 0.65 ||
        px > render.x + render.w * 0.65 ||
        py < render.y - render.h * 1.2 ||
        py > render.y + 15
      )
        return false;
      x = render.x;
      y = render.y;
      clamp();
      held = true;
      flying = false;
      vx = vy = 0;
      offset = [px - x, py - y];
      last = { x: px, y: py, time: performance.now() };
      return true;
    },
    move(px, py) {
      if (!held) return;
      const now = performance.now(),
        dt = Math.max(0.016, (now - last.time) / 1000);
      vx = limit((px - last.x) / dt, -750, 750);
      vy = limit((py - last.y) / dt, -800, 800);
      x = px - offset[0];
      y = py - offset[1];
      clamp();
      last = { x: px, y: py, time: now };
    },
    release(cancel = false, still = false) {
      if (!held) return;
      held = false;
      if (cancel || performance.now() - last.time > 100) vx = vy = 0;
      flying = !still;
      if (still) vx = vy = 0;
      last = null;
    },
    toss(still = false) {
      if (still) return;
      x = 320;
      y = 354;
      vx = (Math.random() - 0.5) * 220;
      vy = stage === "moon" ? -240 : -540;
      flying = true;
    },
    background() {
      ctx.save();
      if (stage === "moon") {
        ctx.fillStyle = "#e3e4df";
        ctx.fillRect(0, 0, 640, 440);
        ctx.fillStyle = "#c5c8c2";
        for (const [cx, cy, r] of [
          [65, 389, 22],
          [542, 402, 33],
          [416, 384, 12],
        ]) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#a4ada4";
        for (const [cx, cy] of [
          [60, 54],
          [540, 77],
          [455, 31],
        ]) {
          ctx.beginPath();
          ctx.arc(cx, cy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (stage === "trampoline") {
        ctx.strokeStyle = "#577b60";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(320, 365, 270, 17, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          ctx.beginPath();
          ctx.moveTo(70 + i * 45, 359);
          ctx.lineTo(87 + i * 42, 373);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(94, 377);
        ctx.lineTo(82, 407);
        ctx.moveTo(546, 377);
        ctx.lineTo(558, 407);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#bdc5b5";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, 365);
        ctx.lineTo(610, 365);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
};
