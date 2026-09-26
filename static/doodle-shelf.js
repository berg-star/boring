"use strict";
window.createDoodleShelf = function ({ validate, paint, getStrokes, open }) {
  const $ = (id) => document.getElementById(id),
    KEY = "boring-lab-doodle-shelf-v1";
  let items = [],
    blocked = false,
    chain = Promise.resolve();
  function message(text) {
    $("shelf-status").textContent = text;
  }
  function read() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    if (raw.length > 3000000) throw Error();
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.items) || data.items.length > 12) throw Error();
    const ids = new Set();
    for (const item of data.items) {
      if (
        !item ||
        typeof item.id !== "string" ||
        item.id.length > 80 ||
        ids.has(item.id) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 24 ||
        !Number.isSafeInteger(item.created) ||
        item.created <= 0
      )
        throw Error();
      validate(item.strokes);
      if (!item.strokes.length) throw Error();
      ids.add(item.id);
    }
    return data.items;
  }
  function reload() {
    try {
      items = read();
      blocked = false;
      message("保存在当前浏览器，最多 12 幅；打开后修改不会覆盖收藏原稿。");
    } catch {
      blocked = true;
      items = [];
      message("收藏记录无法读取，未覆盖旧数据。当前画纸仍可使用。");
    }
    render();
  }
  function mutate(change) {
    chain = chain
      .then(() => {
        const commit = () => {
          try {
            const next = read();
            if (!change(next)) return;
            const json = JSON.stringify({ version: 1, items: next });
            if (json.length > 3000000) {
              message("收藏空间不足，请先删除不需要的作品。");
              return;
            }
            localStorage.setItem(KEY, json);
            items = next;
            blocked = false;
            render();
            message("收藏已保存。打开作品后，还可以补画或换舞台。");
          } catch {
            message("收藏暂时无法保存，原有记录未覆盖。当前画纸仍然保留。");
          }
        };
        return navigator.locks?.request ? navigator.locks.request(KEY, commit) : commit();
      })
      .catch(() => message("收藏暂时无法保存，请稍后再试。"));
  }
  function render() {
    $("shelf-count").textContent = items.length + " / 12";
    $("shelf-grid").replaceChildren();
    $("save-art").disabled = blocked;
    for (const item of items) {
      const card = document.createElement("article");
      card.className = "doodle-art";
      const preview = document.createElement("canvas");
      preview.width = 192;
      preview.height = 132;
      preview.setAttribute("role", "img");
      preview.setAttribute("aria-label", item.name + "的缩略图");
      const c = preview.getContext("2d");
      c.fillStyle = "#f3efde";
      c.fillRect(0, 0, 192, 132);
      c.scale(0.3, 0.3);
      item.strokes.forEach((s) => paint(c, s));
      const name = document.createElement("strong");
      name.textContent = item.name;
      const actions = document.createElement("div");
      for (const [label, fn] of [
        [
          "打开",
          () => {
            if (confirm("打开这幅收藏会替换当前画纸，未收藏的修改将被替换。继续吗？")) {
              open(structuredClone(item.strokes));
              $("art-name").value = item.name;
              $("shelf").open = false;
            }
          },
        ],
        [
          "改名",
          () => {
            const value = prompt("新的作品名称（最多 24 个字）", item.name);
            if (value === null) return;
            const next = value.trim();
            if (!next || next.length > 24) {
              message("名称需为 1–24 个字。");
              return;
            }
            mutate((list) => {
              const found = list.find((x) => x.id === item.id);
              if (!found) return false;
              found.name = next;
              return true;
            });
          },
        ],
        [
          "删除",
          () => {
            if (confirm("删除收藏《" + item.name + "》？当前画纸不受影响。"))
              mutate((list) => {
                const index = list.findIndex((x) => x.id === item.id);
                if (index < 0) return false;
                list.splice(index, 1);
                return true;
              });
          },
        ],
      ]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "secondary";
        b.textContent = label;
        b.setAttribute("aria-label", label + "：" + item.name);
        b.addEventListener("click", fn);
        actions.append(b);
      }
      card.append(preview, name, actions);
      $("shelf-grid").append(card);
    }
  }
  $("save-art-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const strokes = structuredClone(getStrokes());
    if (!strokes.length) {
      message("先画点什么，或随机载入一个造型。");
      return;
    }
    const name = $("art-name").value.trim();
    if (!name || name.length > 24) {
      message("给作品起个 1–24 个字的名字吧。");
      return;
    }
    mutate((list) => {
      if (list.length >= 12) {
        message("已经放满 12 幅，请先删除一幅再收藏。");
        return false;
      }
      list.push({ id: crypto.randomUUID(), name, created: Date.now(), strokes });
      return true;
    });
  });
  addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) reload();
  });
  reload();
};
