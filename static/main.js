"use strict";
window.BoringStorage = (() => {
  const KEY = "boring-lab-restore-notice-v1";
  let startup;
  try {
    startup = localStorage.getItem(KEY);
  } catch {}
  function canWrite() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw !== startup) return false;
      return !raw || JSON.parse(raw)?.phase !== "restoring";
    } catch {
      return true;
    }
  }
  function refreshRestored() {
    if (location.pathname.endsWith("/luggage.html")) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw !== startup && raw && JSON.parse(raw)?.phase === "complete") location.reload();
    } catch {}
  }
  addEventListener("storage", (e) => {
    if (e.key === KEY) refreshRestored();
  });
  addEventListener("pageshow", refreshRestored);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshRestored();
  });
  return { canWrite };
})();
if (!location.pathname.endsWith("/luggage.html")) {
  for (const container of [
    document.querySelector("footer"),
    document.querySelector(".section-head"),
  ]) {
    if (!container) continue;
    const link = document.createElement("a");
    link.href = "/luggage.html";
    link.className = "luggage-link";
    link.textContent = "我的行李箱 ↗";
    container.append(link);
  }
}

const gamePages = [
  "reaction.html",
  "wheel.html",
  "card.html",
  "question.html",
  "fun.html",
  "truth.html",
  "pet.html",
  "planet.html",
  "book.html",
  "doodle.html",
  "smash.html",
  "tug-online.html",
  "reaction-online.html",
  "password-online.html",
];
function randomGame() {
  const soloPages = gamePages.filter(page => !page.endsWith("-online.html"));
  location.href = "/" + soloPages[Math.floor(Math.random() * soloPages.length)];
}
document
  .querySelectorAll(".surprise")
  .forEach((button) => button.addEventListener("click", randomGame));
document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("[data-category]").forEach((card) => {
      card.hidden =
        button.dataset.filter !== "all" &&
        !card.dataset.category.split(" ").includes(button.dataset.filter);
    });
  }),
);
// 只在支持 WebMCP 的浏览器注册，普通浏览器完全不受影响。
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: "navigate_to_game",
          description: "打开无聊研究所中指定的玩法页面。",
          inputSchema: {
            type: "object",
            properties: {
              game: {
                type: "string",
                enum: [
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
                  "tug-online",
                  "reaction-online",
                  "password-online",
                ],
              },
            },
            required: ["game"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute(input) {
            if (
              !input ||
              Object.keys(input).length !== 1 ||
              !gamePages.includes(input.game + ".html")
            )
              throw new Error("未知玩法");
            location.href = "/" + input.game + ".html";
            return { navigatingTo: input.game };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  } catch (_) {
    /* 不支持的实验性浏览器忽略注册。 */
  }
}
