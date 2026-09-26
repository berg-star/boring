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
    impact = 0,
    target = null,
    landing = 0,
    weight = 1,
    windActive = false;
  const limit = (n, a, b) => Math.max(a, Math.min(b, n));
  function reset(width = w, height = h) {
    w = width;
    h = height;
    x = 320;
    y = 354;
    vx = vy = impact = landing = 0;
    windActive = false;
    held = flying = false;
    target = null;
    last = null;
  }
  function clamp() {
    x = limit(x, w * 0.65 + 8, 632 - w * 0.65);
    y = limit(y, h * 1.12 + 10, 354);
  }
  function update(dt) {
    const windy = windActive;
    windActive = false;
    impact = Math.max(0, impact - dt * 3);
    if (held) {
      if (target) {
        const blend = 1 - Math.exp(-dt * 6);
        x += (target[0] - x) * blend;
        y += (target[1] - y) * blend;
        clamp();
      }
      return;
    }
    if (!flying) return;
    const model = stages[stage];
    vy += model.gravity * weight * dt;
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
      if (speed > 80) landing = speed;
      vy = -speed * model.bounce;
      vx *= windy ? 0.99 : 0.8;
      if (stage === "trampoline" && speed > 90)
        vy = -Math.max(440, Math.min(620, speed * model.bounce));
      if (Math.abs(vy) < 45) {
        vy = 0;
        if (Math.abs(vx) < 12 && !windy) {
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
      return { x, y, sx: 1, sy: 1 };
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
      target = null;
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
      target = [px - offset[0], py - offset[1]];
      clamp();
      last = { x: px, y: py, time: now };
    },
    release(cancel = false, still = false) {
      if (!held) return;
      held = false;
      target = null;
      if (cancel || performance.now() - last.time > 100) vx = vy = 0;
      flying = !still;
      if (still) vx = vy = 0;
      last = null;
    },
    material(value) {
      weight = value === "paper" ? 0.48 : 1;
    },
    takeLanding() {
      const speed = landing;
      landing = 0;
      return speed;
    },
    shake() {
      if (held) return;
      vx = (Math.random() < 0.5 ? -1 : 1) * 170;
      vy = stage === "moon" ? -170 : -300;
      flying = true;
    },
    wind(force, dt) {
      if (held || !force) return;
      windActive = true;
      vx = limit(vx + ((force * 450) / weight) * dt, -230, 230);
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

// A small spring field deforms drawing points without changing the saved artwork.
window.createDoodleSoft = function () {
  const nodes = [];
  let width = 200,
    height = 200,
    grip = null,
    material = "soft",
    breeze = 0,
    clock = 0,
    inertiaX = 0,
    inertiaY = 0,
    impactWave = null;
  const clamp = (v, n) => Math.max(-n, Math.min(n, v));
  function reset(w = width, h = height) {
    width = w;
    height = h;
    grip = null;
    breeze = 0;
    clock = 0;
    inertiaX = inertiaY = 0;
    impactWave = null;
    nodes.length = 0;
    for (let row = 0; row <= 8; row++)
      for (let col = 0; col <= 8; col++)
        nodes.push({
          x: (col * width) / 8 - width / 2,
          y: (row * height) / 8 - height,
          dx: 0,
          dy: 0,
          vx: 0,
          vy: 0,
        });
  }
  function update(dt, instant = false) {
    dt = Math.max(0, Math.min(dt, 0.032));
    clock += dt;
    if (impactWave) {
      impactWave.age += dt;
      if (impactWave.age > 0.65) impactWave = null;
    }
    const stiff = material === "firm",
      spring = stiff ? 210 : material === "paper" ? 135 : 90;
    for (const n of nodes) {
      let tx = 0,
        ty = 0;
      const heightRatio = -n.y / height;
      tx =
        breeze *
        (stiff ? 19 : material === "paper" ? 58 : 38) *
        (0.2 + heightRatio) *
        (1 + 0.24 * Math.sin(clock * 11 + n.y / 35));
      ty = Math.abs(breeze) * 7 * Math.sin(clock * 9 + n.x / 28) * heightRatio;
      if (grip) {
        const radius = Math.max(24, Math.min(width, height) * 0.48);
        const weight = Math.exp(-((n.x - grip.x) ** 2 + (n.y - grip.y) ** 2) / (2 * radius ** 2));
        const strength = stiff ? 0.52 : 1;
        tx = clamp(grip.dx, 95) * weight * strength;
        ty = clamp(grip.dy, 95) * weight * strength;
      }
      // The lower edge compresses first; the impulse travels upward over time.
      if (impactWave) {
        const delay = heightRatio * 0.14,
          age = impactWave.age - delay;
        if (age >= 0) {
          const pulse = Math.sin(Math.min(1, age / 0.2) * Math.PI) * Math.exp(-age * 5);
          const strength = impactWave.strength * (stiff ? 0.55 : 1);
          tx += (n.x / Math.max(1, width)) * strength * pulse;
          ty += strength * pulse * Math.sin(Math.PI * heightRatio) * 0.75;
        }
      }
      const freeEdge = 0.25 + (0.75 * Math.abs(n.x)) / (width / 2);
      tx += inertiaX * freeEdge * (stiff ? 0.45 : 1);
      ty += inertiaY * (0.3 + 0.7 * heightRatio) * (stiff ? 0.45 : 1);
      if (instant) {
        n.dx = tx;
        n.dy = ty;
        n.vx = n.vy = 0;
        continue;
      }
      // Substeps keep even rapid pointer changes bounded.
      for (let i = 0; i < 4; i++) {
        const step = dt / 4;
        n.vx += ((tx - n.dx) * spring - n.vx * (stiff ? 19 : 10)) * step;
        n.vy += ((ty - n.dy) * spring - n.vy * (stiff ? 19 : 10)) * step;
        n.dx = clamp(n.dx + n.vx * step, 120);
        n.dy = clamp(n.dy + n.vy * step, 120);
      }
    }
  }
  function map(x, y) {
    const u = Math.max(0, Math.min(8, ((x + width / 2) / width) * 8));
    const v = Math.max(0, Math.min(8, ((y + height) / height) * 8));
    const col = Math.min(7, Math.floor(u)),
      row = Math.min(7, Math.floor(v));
    const fx = u - col,
      fy = v - row;
    let dx = 0,
      dy = 0;
    for (const [index, weight] of [
      [row * 9 + col, (1 - fx) * (1 - fy)],
      [row * 9 + col + 1, fx * (1 - fy)],
      [(row + 1) * 9 + col, (1 - fx) * fy],
      [(row + 1) * 9 + col + 1, fx * fy],
    ]) {
      dx += nodes[index].dx * weight;
      dy += nodes[index].dy * weight;
    }
    return [x + dx, y + dy];
  }
  reset();
  return {
    reset,
    update,
    map,
    inertia(dx, dy) {
      inertiaX = clamp(dx, 35);
      inertiaY = clamp(dy, 30);
    },
    land(speed) {
      impactWave = { age: 0, strength: Math.min(70, speed * 0.09) };
    },
    wind(force) {
      breeze = clamp(force, 1.6);
    },
    material(value) {
      material = value;
    },
    hold(x, y, dx, dy) {
      grip = { x, y, dx, dy };
    },
    release() {
      grip = null;
    },
  };
};
