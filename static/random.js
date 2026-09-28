"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const labels = {
    all: "全部",
    imagination: "脑洞大开",
    life: "生活小事",
    choice: "离谱选择",
    objects: "万物开口",
  };
  const categories = Object.keys(labels).filter((key) => key !== "all");
  const buttons = [...document.querySelectorAll("[data-theme]")];
  const RECENT_KEY = "boring-lab-question-recent-v1",
    RECENT_LIMIT = 8;
  const decks = new Map();
  let catalog = null,
    theme = "all",
    recent = [],
    busy = false,
    request = null;
  function validate(data) {
    if (!Array.isArray(data) || data.length < 36 || data.length > 500)
      throw Error("Invalid questions");
    const ids = new Set(),
      texts = new Set();
    for (const row of data) {
      if (
        !row ||
        typeof row.id !== "string" ||
        !/^q-(?!000)\d{3}$/.test(row.id) ||
        ids.has(row.id) ||
        !categories.includes(row.category) ||
        typeof row.question !== "string" ||
        !row.question.trim() ||
        row.question.length > 100 ||
        texts.has(row.question.trim())
      )
        throw Error("Invalid question");
      ids.add(row.id);
      texts.add(row.question.trim());
    }
    if (categories.some((key) => data.filter((row) => row.category === key).length <= RECENT_LIMIT))
      throw Error("Incomplete categories");
    return data.map((row) => ({
      id: row.id,
      category: row.category,
      question: row.question.trim(),
    }));
  }
  function readRecent() {
    try {
      const raw = sessionStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      const saved = JSON.parse(raw);
      if (
        saved?.version !== 1 ||
        !Array.isArray(saved.ids) ||
        saved.ids.length > RECENT_LIMIT ||
        new Set(saved.ids).size !== saved.ids.length ||
        saved.ids.some((id) => !catalog.some((row) => row.id === id))
      )
        return [];
      return saved.ids;
    } catch {
      return [];
    }
  }
  function remember(id) {
    recent = [...recent.filter((value) => value !== id), id].slice(-RECENT_LIMIT);
    try {
      sessionStorage.setItem(RECENT_KEY, JSON.stringify({ version: 1, ids: recent }));
    } catch {}
  }
  async function load() {
    if (catalog) return;
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/questions", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw Error("Request failed");
      catalog = validate(await response.json());
      recent = readRecent();
      for (const el of document.querySelectorAll("[data-question-count]")) {
        const key = el.dataset.questionCount;
        el.textContent =
          key === "all" ? catalog.length : catalog.filter((row) => row.category === key).length;
      }
      $("question-total").textContent = catalog.length + " 道问题 · 四种主题";
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
    }
  }
  function shuffle(rows) {
    const deck = [...rows];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  function eligibleIndex(deck) {
    for (let index = deck.length - 1; index >= 0; index--) {
      if (!recent.includes(deck[index].id)) return index;
    }
    return -1;
  }
  function nextQuestion() {
    const pool = catalog.filter((row) => theme === "all" || row.category === theme);
    let deck = decks.get(theme) || [];
    let index = eligibleIndex(deck);
    // 切换主题可能让剩余题目都刚出现过；重新洗牌，优先避开最近八道。
    if (index < 0) {
      deck = shuffle(pool);
      index = eligibleIndex(deck);
    }
    const [row] = deck.splice(index, 1);
    decks.set(theme, deck);
    return row;
  }
  function selection() {
    for (const button of buttons) {
      const selected = button.dataset.theme === theme;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("active", selected);
    }
  }
  async function draw() {
    if (busy) return;
    busy = true;
    $("draw").disabled = true;
    buttons.forEach((button) => (button.disabled = true));
    $("draw").textContent = "问题正在赶来……";
    $("api-error").textContent = "";
    $("result").setAttribute("aria-busy", "true");
    try {
      await load();
      const row = nextQuestion();
      $("question").textContent = row.question;
      $("question-theme-label").textContent = labels[row.category];
      $("question-theme-label").dataset.category = row.category;
      $("result").dataset.questionId = row.id;
      $("result").classList.remove("pop");
      void $("result").offsetWidth;
      $("result").classList.add("pop");
      remember(row.id);
      $("draw").textContent = "再来一个 ↻";
    } catch {
      $("api-error").textContent = "题目暂时没加载出来，点“重试一下”再试一次。";
      $("draw").textContent = "重试一下 ↻";
    } finally {
      busy = false;
      $("draw").disabled = false;
      buttons.forEach((button) => (button.disabled = false));
      $("result").setAttribute("aria-busy", "false");
    }
  }
  for (const button of buttons)
    button.addEventListener("click", () => {
      const key = button.dataset.theme;
      if (busy || theme === key || !Object.hasOwn(labels, key)) return;
      theme = key;
      selection();
      draw();
    });
  $("draw").addEventListener("click", draw);
  addEventListener("pagehide", () => request?.abort());
  selection();
  draw();
})();
