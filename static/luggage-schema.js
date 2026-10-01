"use strict";
(() => {
  const FORMAT = "boring-lab-luggage",
    MAX_FILE = 8 * 1024 * 1024;
  const object = (s) => !!s && typeof s === "object" && !Array.isArray(s);
  const number = (v, low, high) => Number.isFinite(v) && v >= low && v <= high;
  const integer = (v, low, high) => Number.isSafeInteger(v) && v >= low && v <= high;
  const text = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const point = (p) =>
    object(p) &&
    [p.x, p.y, p.z].every(Number.isFinite) &&
    Math.abs(Math.hypot(p.x, p.y, p.z) - 1) < 0.02;
  const colors = ["#28352f", "#638c40", "#dc7050", "#598cae", "#9b70ac"];
  function strokes(list) {
    if (!Array.isArray(list) || list.length > 100) return false;
    let count = 0;
    return list.every(
      (s) =>
        object(s) &&
        colors.includes(s.color) &&
        [4, 9, 16].includes(s.width) &&
        Array.isArray(s.points) &&
        s.points.length > 0 &&
        (count += s.points.length) <= 16000 &&
        s.points.every(
          (p) => Array.isArray(p) && p.length === 2 && number(p[0], 0, 640) && number(p[1], 0, 440),
        ),
    );
  }
  const cardId = (id) =>
    typeof id === "string" && /^(relax|courage|idea|luck|company|funny)-(0[1-9]|1[0-5])$/.test(id);
  const games = [
    "reaction",
    "wheel",
    "card",
    "question",
    "fun",
    "truth",
    "pet",
    "planet",
    "book",
    "doodle",
    "smash",
    "tug",
  ];
  const kinds = ["report", "notice", "wanted", "patch", "ad", "invention"];
  const achievementIds = [
    "explorer",
    "resident",
    "hesitate",
    "destiny",
    "early",
    "fast",
    "cards",
    "critic",
    "secret",
    "keeper",
    "forest",
    "reader",
  ];
  const uniqueList = (v, allowed) =>
    Array.isArray(v) && v.every((x) => allowed.includes(x)) && new Set(v).size === v.length;
  function wheel(s) {
    if (
      !object(s) ||
      s.version !== 1 ||
      !Array.isArray(s.custom) ||
      s.custom.length > 8 ||
      !object(s.lists)
    )
      return false;
    const presets = window.WheelPresets,
      names = new Set(Object.values(presets.brands).map((b) => b.name)),
      ids = new Set();
    for (const b of s.custom) {
      if (
        !object(b) ||
        typeof b.id !== "string" ||
        !/^custom-[a-z0-9-]+$/.test(b.id) ||
        ids.has(b.id) ||
        !text(b.name, 12) ||
        b.name.trim() !== b.name ||
        names.has(b.name)
      )
        return false;
      ids.add(b.id);
      names.add(b.name);
    }
    const brands = ["choose", "general", ...Object.keys(presets.brands), ...ids];
    const scopes = new Set([
      ...Object.keys(presets.scenes),
      "shops",
      ...Object.keys(presets.brands).map((id) => "drink:" + id),
      ...[...ids].map((id) => "drink:" + id),
    ]);
    return (
      Object.hasOwn(presets.scenes, s.scene) &&
      brands.includes(s.brand) &&
      Object.entries(s.lists).every(
        ([scope, list]) =>
          scopes.has(scope) &&
          Array.isArray(list) &&
          list.length >= 2 &&
          list.length <= 12 &&
          list.every(
            (x) =>
              object(x) &&
              text(x.text, 12) &&
              x.text.trim() === x.text &&
              typeof x.on === "boolean",
          ) &&
          list.filter((x) => x.on).length >= 2 &&
          new Set(list.map((x) => x.text)).size === list.length,
      )
    );
  }
  const registry = [
    {
      key: "boring-lab-pet-v1",
      name: "奇怪小宠物",
      max: 16384,
      valid: (s) =>
        object(s) &&
        s.version === 1 &&
        text(s.name, 12) &&
        ["color", "shape", "personality"].every((k, i) => integer(s[k], 0, [4, 2, 3][i])) &&
        ["food", "joy", "weight"].every((k) => number(s[k], 0, 100)) &&
        ["born", "updated", "awayUntil"].every((k) => integer(s[k], 0, Date.now() + 300000)) &&
        s.born <= s.updated,
      describe: (s) =>
        s.name +
        " · 相遇第 " +
        (Math.floor(Math.max(0, Date.now() - s.born) / 86400000) + 1) +
        " 天",
    },
    {
      key: "boring-lab-cards-v1",
      name: "卡片收藏",
      max: 30000,
      valid: (s) =>
        object(s) &&
        s.version === 1 &&
        Array.isArray(s.owned) &&
        s.owned.length <= 90 &&
        Array.isArray(s.favorites) &&
        s.favorites.length <= 90 &&
        [...s.owned, ...s.favorites].every(cardId) &&
        s.favorites.every((id) => s.owned.includes(id)),
      describe: (s) =>
        new Set(s.owned).size + " / 90 张 · " + new Set(s.favorites).size + " 张爱心收藏",
    },
    {
      key: "boring-lab-planet-v1",
      name: "无聊星球",
      max: 100000,
      valid: (s) =>
        object(s) &&
        s.version === 1 &&
        Array.isArray(s.trees) &&
        s.trees.length <= 80 &&
        s.trees.every(
          (t) =>
            point(t) &&
            ["tree", "mushroom", "lamp"].includes(t.type) &&
            [0, 1, 2].includes(t.growth),
        ) &&
        Array.isArray(s.ponds) &&
        s.ponds.length <= 12 &&
        s.ponds.every((t) => point(t) && integer(t.water, 1, 3)) &&
        Array.isArray(s.residents) &&
        s.residents.length === 5 &&
        s.residents.every(
          (r) =>
            object(r) &&
            point(r.p) &&
            ["#f5cb8e", "#e8a7ad", "#b7a8e7", "#d5e9aa", "#99d9ce"].includes(r.color),
        ) &&
        typeof s.night === "boolean" &&
        number(s.yaw, -1e6, 1e6) &&
        number(s.pitch, -1.25, 1.25),
      describe: (s) =>
        s.trees.length + " 株植物 · " + s.ponds.length + " 个池塘 · " + (s.night ? "夜晚" : "白天"),
    },
    {
      key: "boring-lab-doodle-v1",
      name: "涂鸦画纸",
      max: 1000000,
      valid: (s) => object(s) && s.version === 1 && strokes(s.strokes),
      describe: (s) =>
        s.strokes.length +
        " 笔 · " +
        s.strokes.reduce((n, t) => n + t.points.length, 0) +
        " 个线条点",
    },
    {
      key: "boring-lab-doodle-shelf-v1",
      name: "涂鸦作品架",
      max: 3000000,
      valid: (s) =>
        object(s) &&
        s.version === 1 &&
        Array.isArray(s.items) &&
        s.items.length <= 12 &&
        new Set(s.items.map((i) => i?.id)).size === s.items.length &&
        s.items.every(
          (i) =>
            object(i) &&
            typeof i.id === "string" &&
            i.id.length <= 80 &&
            text(i.name, 24) &&
            integer(i.created, 1, Number.MAX_SAFE_INTEGER) &&
            strokes(i.strokes) &&
            i.strokes.length > 0,
        ),
      describe: (s) => s.items.length + " / 12 幅作品",
    },
    {
      key: "boring-lab-achievements-v1",
      name: "荒谬成就",
      max: 30000,
      valid: (s) =>
        object(s) &&
        s.version === 1 &&
        uniqueList(s.visits, games) &&
        uniqueList(s.kinds, kinds) &&
        ["wheelMs", "spins", "cards", "skips", "trees", "books"].every((k) =>
          number(s[k], 0, 1e9),
        ) &&
        ["early", "fast", "named"].every((k) => typeof s[k] === "boolean") &&
        object(s.unlocked) &&
        Object.entries(s.unlocked).every(
          ([id, date]) => achievementIds.includes(id) && integer(date, 1, Number.MAX_SAFE_INTEGER),
        ),
      describe: (s) =>
        Object.keys(s.unlocked).length + " / 12 个成就 · 到访 " + s.visits.length + " 个玩法",
    },
    {
      key: "boring-lab-wheel-v1",
      name: "命运转盘",
      max: 100000,
      valid: wheel,
      describe: (s) =>
        Object.keys(s.lists).length + " 组选项 · " + s.custom.length + " 家自定义店铺",
    },
    {
      key: "boring-lab-smash-settings-v1",
      name: "破坏王偏好",
      max: 1024,
      valid: (s) =>
        object(s) && ["sound", "vibration", "regenerate"].every((k) => typeof s[k] === "boolean"),
      describe: (s) =>
        "声音" + (s.sound ? "开" : "关") + " · 气泡再生" + (s.regenerate ? "开" : "关"),
    },
    {
      key: "boring-lab-planet-sound",
      name: "星球声音",
      max: 10,
      plain: true,
      valid: (s) => s === "on" || s === "off",
      describe: (s) => (s === "on" ? "声音开启" : "声音关闭"),
    },
    {
      key: "boring-lab-book-sound",
      name: "答案之书声音",
      max: 10,
      plain: true,
      valid: (s) => s === "on" || s === "off",
      describe: (s) => (s === "on" ? "声音开启" : "声音关闭"),
    },
  ];
  function check(key, raw) {
    const entry = registry.find((e) => e.key === key);
    if (!entry || typeof raw !== "string" || raw.length > entry.max)
      throw Error("记录不属于本网站，或大小超出限制。");
    let data;
    try {
      data = entry.plain ? raw : JSON.parse(raw);
    } catch {
      throw Error(entry.name + "的记录无法读取。");
    }
    if (!entry.valid(data)) throw Error(entry.name + "的记录格式不正确。");
    return { key, value: raw, name: entry.name, description: entry.describe(data) };
  }
  function archive(text) {
    if (typeof text !== "string" || new Blob([text]).size > MAX_FILE)
      throw Error("请选择不超过 8 MB 的存档文件。");
    let data;
    try {
      data = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
      throw Error("文件无法读取，请选择导出的 JSON 存档。");
    }
    if (object(data) && !Object.hasOwn(data, "format") && registry[0].valid(data))
      return {
        exportedAt: null,
        legacy: true,
        records: [check(registry[0].key, JSON.stringify(data))],
      };
    if (
      !object(data) ||
      data.format !== FORMAT ||
      data.version !== 1 ||
      typeof data.exportedAt !== "string" ||
      !Number.isFinite(Date.parse(data.exportedAt)) ||
      !Array.isArray(data.records) ||
      data.records.length < 1 ||
      data.records.length > registry.length
    )
      throw Error("这不是支持的无聊研究所行李箱，或文件版本不兼容。");
    const seen = new Set();
    const records = data.records.map((record) => {
      if (!object(record) || seen.has(record.key)) throw Error("存档里有重复或无法识别的项目。");
      seen.add(record.key);
      return check(record.key, record.value);
    });
    return { exportedAt: data.exportedAt, legacy: false, records };
  }
  window.BoringLuggage = { FORMAT, MAX_FILE, registry, check, archive };
})();
