"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    KEY = "boring-lab-cards-v1";
  const series = {
    relax: ["松弛", "☁", "#c0d8b0"],
    courage: ["勇气", "✦", "#ffc29a"],
    idea: ["灵感", "✧", "#cbb9f5"],
    luck: ["好运", "☀", "#efda9c"],
    company: ["陪伴", "♡", "#f1b8c7"],
    funny: ["搞怪", "☺", "#a7d9e8"],
  };
  const CARDS_PER_SERIES = 15,
    CARD_COUNT = Object.keys(series).length * CARDS_PER_SERIES;
  const fields = [
    "id",
    "series",
    "rarity",
    "keyword",
    "tagline",
    "message",
    "skill",
    "skillText",
    "good",
    "avoid",
    "luckyItem",
    "bonusLabel",
    "bonus",
  ];
  let current = null,
    pending = null,
    catalog = null,
    busy = false,
    loadingCatalog = false,
    imageURL = null,
    revision = 0;
  let memory = { version: 1, owned: [], favorites: [] },
    blocked = false,
    storageMessage = "",
    writes = Promise.resolve();
  function validate(card) {
    if (
      !card ||
      fields.some((k) => typeof card[k] !== "string" || !card[k].trim() || card[k].length > 200) ||
      !Object.hasOwn(series, card.series) ||
      !["R", "SR", "SSR"].includes(card.rarity) ||
      !validId(card.id) ||
      !card.id.startsWith(card.series + "-") ||
      !Number.isFinite(card.luck) ||
      card.luck < 0 ||
      card.luck > 100
    )
      throw Error("Invalid card");
    return card;
  }
  const validId = (id) =>
    typeof id === "string" && /^(relax|courage|idea|luck|company|funny)-(0[1-9]|1[0-5])$/.test(id);
  function read() {
    if (blocked) return memory;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { version: 1, owned: [], favorites: [] };
      const data = JSON.parse(raw);
      if (
        data.version !== 1 ||
        !Array.isArray(data.owned) ||
        !Array.isArray(data.favorites) ||
        data.owned.length > CARD_COUNT ||
        data.favorites.length > CARD_COUNT ||
        [...data.owned, ...data.favorites].some((id) => !validId(id)) ||
        data.favorites.some((id) => !data.owned.includes(id))
      )
        throw Error("Invalid collection");
      return {
        version: 1,
        owned: [...new Set(data.owned)],
        favorites: [...new Set(data.favorites)],
      };
    } catch (_) {
      blocked = true;
      storageMessage = "无法读取旧收藏，未覆盖原数据。本次记录暂留在页面中。";
      return memory;
    }
  }
  function persist(change) {
    writes = writes
      .then(() => {
        const commit = () => {
          memory = read();
          change(memory);
          if (!blocked)
            try {
              localStorage.setItem(KEY, JSON.stringify(memory));
            } catch (_) {
              blocked = true;
              storageMessage = "浏览器无法保存收藏，离开后可能丢失。喜欢的卡可以先生成图片。";
            }
          renderCollection();
          updateFavorite();
        };
        return navigator.locks?.request ? navigator.locks.request(KEY, commit) : commit();
      })
      .catch(() => {
        storageMessage = "收藏暂时无法保存，请稍后再试。";
        renderCollection();
      });
    return writes;
  }
  function clearImage() {
    revision++;
    if (imageURL) {
      URL.revokeObjectURL(imageURL);
      imageURL = null;
    }
    $("card-image").hidden = true;
    $("share-card").setAttribute("aria-expanded", "false");
    $("share-preview").removeAttribute("src");
    $("download-card").removeAttribute("href");
  }
  function updateFavorite() {
    const selected = !!current && memory.favorites.includes(current.id);
    $("favorite").textContent = selected ? "♥ 已收藏" : "♡ 收藏这张";
    $("favorite").setAttribute("aria-pressed", String(selected));
    $("favorite").disabled = !current || busy || !!pending;
  }
  function display(card) {
    current = card;
    pending = null;
    clearImage();
    const [label, symbol, color] = series[card.series];
    $("result").style.setProperty("--card-tint", color);
    $("result").dataset.series = card.series;
    for (const [id, value] of Object.entries({
      "card-series": label + "系列",
      "card-rarity": card.rarity,
      "card-symbol": symbol,
      "card-id": "NO. " + card.id.toUpperCase(),
      keyword: card.keyword,
      "card-tagline": card.tagline,
      message: card.message,
      "card-skill": card.skill,
      "card-skill-text": card.skillText,
      "card-good": card.good,
      "card-avoid": card.avoid,
      "card-item": card.luckyItem,
      "card-bonus-label": card.bonusLabel,
      "card-bonus": card.bonus,
      luck: card.luck + " / 100",
    }))
      $(id).textContent = value;
    $("card-back").hidden = true;
    $("result").hidden = false;
    $("result").classList.remove("card-reveal");
    void $("result").offsetWidth;
    $("result").classList.add("card-reveal");
    $("share-card").disabled = false;
    updateFavorite();
  }
  async function request(url) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw Error("HTTP");
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
  async function draw() {
    if (busy) return;
    busy = true;
    pending = null;
    clearImage();
    $("draw").disabled = true;
    $("card-back").disabled = true;
    $("share-card").disabled = true;
    $("favorite").disabled = true;
    $("api-error").textContent = "";
    $("draw").textContent = "正在准备惊喜……";
    $("result").setAttribute("aria-busy", "true");
    try {
      pending = validate(await request("/api/random-card"));
      $("result").hidden = true;
      $("card-back").hidden = false;
      $("card-back").disabled = false;
      $("back-hint").textContent = "卡片已到，点这里翻开";
      $("card-status").textContent = "新的惊喜藏在背面。";
      $("draw").textContent = "等待翻开 ✧";
      $("card-back").focus();
    } catch (_) {
      $("api-error").textContent = "研究所暂时没接上信号，请稍后重试。";
      $("draw").textContent = "重试一下 ↻";
      $("draw").disabled = false;
      $("share-card").disabled = !current;
    } finally {
      busy = false;
      $("result").setAttribute("aria-busy", "false");
      updateFavorite();
    }
  }
  $("draw").addEventListener("click", draw);
  $("card-back").addEventListener("click", () => {
    if (!pending || busy) return;
    const card = pending,
      isNew = !memory.owned.includes(card.id);
    display(card);
    $("draw").disabled = false;
    $("draw").textContent = "再抽一张 ✧";
    $("card-status").textContent = isNew
      ? "新卡已收入收藏册。"
      : "又遇见了这张卡，收藏册不会重复计数。";
    persist((s) => {
      if (!s.owned.includes(card.id)) s.owned.push(card.id);
    });
    window.BoringAchievements?.record("card");
    $("draw").focus();
  });
  $("favorite").addEventListener("click", () => {
    if (!current || busy || pending) return;
    const id = current.id;
    persist((s) => {
      if (!s.owned.includes(id)) s.owned.push(id);
      s.favorites = s.favorites.includes(id)
        ? s.favorites.filter((x) => x !== id)
        : [...s.favorites, id];
    });
  });
  function renderCollection() {
    $("collection-count").textContent =
      `已收集 ${memory.owned.length} / ${CARD_COUNT} · 收藏 ${memory.favorites.length}`;
    $("collection-storage").textContent =
      storageMessage || "已保存在这个浏览器；收藏不会同步到其他设备。";
    if (!catalog) return;
    const grid = $("collection-grid");
    grid.replaceChildren();
    const filter = $("collection-filter").value,
      category = $("collection-series").value;
    for (const card of catalog) {
      const owned = memory.owned.includes(card.id),
        favorite = memory.favorites.includes(card.id);
      if (
        (category !== "all" && card.series !== category) ||
        (filter === "owned" && !owned) ||
        (filter === "favorite" && !favorite)
      )
        continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "collection-card" + (owned ? " owned" : "");
      button.disabled = !owned || busy || !!pending;
      button.style.setProperty("--card-tint", series[card.series][2]);
      const emblem = document.createElement("span"),
        name = document.createElement("strong"),
        caption = document.createElement("small");
      emblem.textContent = owned ? series[card.series][1] : "◇";
      name.textContent = owned ? card.keyword : "尚未遇见";
      caption.textContent =
        series[card.series][0] + " · " + (owned ? card.rarity : "???") + (favorite ? " ♥" : "");
      button.append(emblem, name, caption);
      button.addEventListener("click", () => {
        if (busy || pending) return;
        display(card);
        $("card-status").textContent = "正在翻看收藏里的老朋友。";
        $("draw").textContent = "再抽一张 ✧";
        $("draw").disabled = false;
        $("result").scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start",
        });
      });
      grid.append(button);
    }
    if (!grid.childElementCount) {
      const p = document.createElement("p");
      p.className = "help";
      p.textContent = "这里还没有卡片，去抽一张试试吧。";
      grid.append(p);
    }
  }
  async function loadCatalog() {
    if (catalog || loadingCatalog) return;
    loadingCatalog = true;
    $("collection-error").textContent = "正在打开收藏册……";
    $("collection-retry").hidden = true;
    try {
      const data = await request("/api/cards");
      if (!Array.isArray(data) || data.length !== CARD_COUNT) throw Error("Invalid catalog");
      data.forEach(validate);
      if (new Set(data.map((c) => c.id)).size !== CARD_COUNT) throw Error("Duplicate IDs");
      if (
        Object.keys(series).some(
          (key) => data.filter((card) => card.series === key).length !== CARDS_PER_SERIES,
        )
      )
        throw Error("Incomplete series");
      catalog = data;
      $("collection-error").textContent = "";
      renderCollection();
    } catch (_) {
      $("collection-error").textContent = "收藏册暂时没加载出来，已有收藏仍保留。";
      $("collection-retry").hidden = false;
    } finally {
      loadingCatalog = false;
    }
  }
  $("collection").addEventListener("toggle", () => {
    if ($("collection").open) loadCatalog();
  });
  $("open-collection").addEventListener("click", () => {
    $("collection").open = true;
  });
  $("collection-retry").addEventListener("click", loadCatalog);
  for (const id of ["collection-filter", "collection-series"])
    $(id).addEventListener("change", renderCollection);
  $("share-card").addEventListener("click", async () => {
    if (!current || busy || pending) return;
    const card = current,
      version = revision;
    $("share-card").disabled = true;
    $("api-error").textContent = "";
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      if (version !== revision) return;
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Canvas unavailable");
      const [label, symbol, color] = series[card.series];
      const commands = [];
      let y = 92;
      function line(text, size = 27, fill = "#e6ece7", gap = 18, center = false, bold = false) {
        const font =
          (bold ? "bold " : "") + size + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.font = font;
        const textWidth = ctx.measureText(text).width,
          rows = Math.max(1, Math.ceil(textWidth / 736));
        const wrapWidth = rows > 1 ? Math.min(736, textWidth / rows + size * 0.65) : 736;
        let part = "";
        function commit() {
          commands.push({
            text: part,
            font,
            fill,
            x: center ? 450 : 82,
            y,
            align: center ? "center" : "left",
          });
          y += size * 1.55;
        }
        for (const char of text) {
          if (ctx.measureText(part + char).width > wrapWidth && !/[，。！？、；：]/.test(char)) {
            commit();
            part = char;
          } else part += char;
        }
        if (part) commit();
        y += gap;
      }
      line("无聊研究所  /  BORING LAB.", 25, color, 4, false, true);
      line(
        label + "系列  ·  " + card.rarity + "    /    NO. " + card.id.toUpperCase(),
        20,
        "#aebbb2",
        30,
      );
      line(symbol, 76, color, 4, true);
      line(card.keyword, 48, color, 6, true, true);
      line(card.tagline, 27, "#bdcbbf", 30, true);
      line(card.message, 29, "#eff1e8", 24);
      const skillTop = y - 24;
      line("专属技能", 20, "#aebbb2", 4);
      line(card.skill, 32, color, 5, false, true);
      line(card.skillText, 27, "#e6ece7", 30);
      const skillBottom = y - 18;
      y += 20;
      for (const [tag, value] of [
        ["今日宜", card.good],
        ["今日忌", card.avoid],
        ["幸运物", card.luckyItem],
      ])
        line(tag + "  /  " + value, 26, "#e6ece7", 14);
      line(card.bonusLabel + " · " + card.bonus, 27, color, 18);
      line("娱乐幸运值 " + card.luck + " / 100 · 纯属娱乐，不是占卜", 20, "#a0b0a7", 22);
      const footerY = y;
      y += 32;
      line("快乐不必有意义。", 29, color, 7, false, true);
      line("来这里，抽一张属于你的今日画风。", 23, "#c5d0c8", 10);
      line("boring-lab-production.up.railway.app/card.html", 23, "#aebdb3", 0);
      // Measure first, then allocate the exact height: long cards never get cropped.
      canvas.height = Math.ceil(y + 52);
      const background = ctx.createLinearGradient(0, 0, 900, canvas.height);
      background.addColorStop(0, "#26372f");
      background.addColorStop(0.45, "#18221e");
      background.addColorStop(1, "#101914");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 900, canvas.height);
      ctx.fillStyle = color + "10";
      ctx.fillRect(58, skillTop, 784, skillBottom - skillTop);
      ctx.fillStyle = color;
      ctx.fillRect(58, skillTop, 4, skillBottom - skillTop);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, 840, canvas.height - 60);
      ctx.strokeStyle = color + "55";
      ctx.beginPath();
      ctx.moveTo(82, footerY);
      ctx.lineTo(818, footerY);
      ctx.stroke();
      for (const command of commands) {
        ctx.font = command.font;
        ctx.fillStyle = command.fill;
        ctx.textAlign = command.align;
        ctx.fillText(command.text, command.x, command.y);
      }
      const cropped = canvas;
      const blob = await new Promise((resolve) => cropped.toBlob(resolve, "image/png"));
      if (!blob) throw Error("Export failed");
      if (version !== revision) return;
      if (imageURL) URL.revokeObjectURL(imageURL);
      imageURL = URL.createObjectURL(blob);
      $("share-preview").src = imageURL;
      $("download-card").href = imageURL;
      $("download-card").download = "boring-lab-" + card.id + ".png";
      $("card-image").hidden = false;
      $("share-card").setAttribute("aria-expanded", "true");
      $("share-preview").alt =
        card.keyword + "：" + card.tagline + "。完整分享卡片，含无聊研究所网站地址。";
      $("card-image").scrollIntoView({ block: "start", behavior: "auto" });
      $("card-status").textContent = "分享图已生成，可以下载或长按保存。";
    } catch (_) {
      if (version === revision)
        $("api-error").textContent = "图片暂时没有生成成功，请重试，也可以直接截图保存。";
    } finally {
      if (version === revision) $("share-card").disabled = false;
    }
  });
  addEventListener("storage", (e) => {
    if (e.key === KEY) {
      blocked = false;
      storageMessage = "";
      memory = read();
      renderCollection();
      updateFavorite();
    }
  });
  $("close-card-image").addEventListener("click", () => {
    clearImage();
    $("share-card").focus();
  });
  memory = read();
  renderCollection();
  if (location.hash === "#collection") $("collection").open = true;
})();
