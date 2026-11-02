"use strict";
// Apply the saved palette before styles paint; no game state is read or changed.
(() => {
  const KEY = "boring-lab-theme-v1";
  const DEFAULT_THEME = "cloud";
  const themes = [
    { id: "cloud", name: "云朵糖纸", note: "奶白底色，蜜桃和薰衣草，轻轻的一层云。", color: "#faf5f2", swatches: ["#ffd7c3", "#dfd4ff", "#c6e8df"], gradient: true },
    { id: "lime", name: "青柠夜游", note: "熟悉的深色底，配一点青柠绿。", color: "#121414", swatches: ["#121414", "#b9f879", "#cab5fa"] },
    { id: "cream", name: "奶油午后", note: "暖白纸张、抹茶和一杯慢慢喝的咖啡。", color: "#f6f1e7", swatches: ["#f6f1e7", "#c6dfa1", "#e6c2a1"] },
    { id: "violet", name: "紫电游戏厅", note: "深紫夜色，粉色霓虹，偷偷多玩一局。", color: "#191326", swatches: ["#191326", "#e5b5ff", "#ffafd0"] },
    { id: "ocean", name: "深海电台", note: "蓝色海面，薄荷微光，让脑袋安静一下。", color: "#101e2c", swatches: ["#101e2c", "#8ee4d4", "#a8cfff"] },
    { id: "aurora", name: "极光漫游", note: "青绿、紫雾和一点桃粉，给夜色加一道渐变。", color: "#101626", swatches: ["#8ce8d0", "#b8adff", "#ffc4cf"], gradient: true },
    { id: "sunset", name: "落日汽水", note: "橘子落日、珊瑚和玫瑰，暖暖地放个假。", color: "#24171f", swatches: ["#ffcf8e", "#ffadab", "#e8b3e5"], gradient: true },
    { id: "berry", name: "莓果霓虹", note: "莓红撞上电光紫，今晚的游戏厅有点甜。", color: "#201329", swatches: ["#ffacd9", "#c6adff", "#a6d8ff"], gradient: true },
    { id: "lagoon", name: "薄荷海岸", note: "薄荷绿、浅海蓝与柠檬光，吹一阵海风。", color: "#102424", swatches: ["#abedd0", "#9edfff", "#e5eca6"], gradient: true },
  ];
  const defaultTheme = themes.find(theme => theme.id === DEFAULT_THEME);
  const find = (id) => themes.find((theme) => theme.id === id) || defaultTheme;
  // A shared preview link does not overwrite the visitor's saved choice.
  let previewTheme = themes.find(theme => theme.id === new URLSearchParams(location.search).get("preview-theme"));
  const read = () => { try { return previewTheme || find(localStorage.getItem(KEY)); } catch { return previewTheme || defaultTheme; } };
  let current = read();
  let buttons = [], trigger, status;
  function apply(theme) {
    current = theme;
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.toggleAttribute("data-gradient", !!theme.gradient);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.color);
    if (trigger) trigger.setAttribute("aria-label", "切换主题，当前：" + theme.name);
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme.id));
  }
  apply(current);
  function mount() {
    const header = document.querySelector(".header");
    if (!header || !("HTMLDialogElement" in window) || !HTMLDialogElement.prototype.showModal) return;
    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "theme-trigger";
    trigger.innerHTML = '<span aria-hidden="true">◐</span><span class="theme-trigger-label">主题</span>';
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-controls", "theme-picker");
    header.append(trigger);
    const dialog = document.createElement("dialog");
    dialog.id = "theme-picker";
    dialog.className = "theme-picker";
    dialog.setAttribute("aria-labelledby", "theme-title");
    dialog.innerHTML = '<div class="theme-heading"><div><p class="eyebrow">CHANGE THE MOOD</p><h2 id="theme-title">给无聊换个颜色。</h2></div><button class="theme-close" type="button" aria-label="关闭主题选择">×</button></div><p class="theme-intro">选一个现在喜欢的样子。随时可换，游戏记录照旧。</p><div class="theme-options"></div><p class="theme-status" role="status" aria-live="polite"></p>';
    document.body.append(dialog);
    status = dialog.querySelector(".theme-status");
    const options = dialog.querySelector(".theme-options");
    for (const theme of themes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-option";
      button.dataset.themeChoice = theme.id;
      const preview = document.createElement("span");
      preview.className = "theme-swatches";
      if (theme.gradient) {
        preview.classList.add("theme-swatches-gradient");
        preview.style.background = `linear-gradient(100deg, ${theme.swatches.join(", ")})`;
      }
      preview.setAttribute("aria-hidden", "true");
      for (const color of theme.swatches) {
        const swatch = document.createElement("i");
        swatch.style.backgroundColor = color;
        preview.append(swatch);
      }
      const name = document.createElement("strong");
      name.textContent = theme.name + (theme.id === DEFAULT_THEME ? " · 默认" : "");
      const note = document.createElement("span");
      note.className = "theme-option-note";
      note.textContent = theme.note;
      button.append(preview, name, note);
      button.addEventListener("click", () => {
        if (window.BoringStorage?.canWrite() === false) {
          status.textContent = "存档正在恢复，请稍后再换主题。";
          return;
        }
        previewTheme = null;
        apply(theme);
        try {
          localStorage.setItem(KEY, theme.id);
          status.textContent = "已换成「" + theme.name + "」，下次打开也会记住。";
        } catch {
          status.textContent = "已换成「" + theme.name + "」。浏览器暂时不能保存，下次可能需要重选。";
        }
      });
      options.append(button);
      buttons.push(button);
    }
    trigger.addEventListener("click", () => {
      status.textContent = previewTheme ? "正在预览「" + current.name + "」，还未保存。点选任意主题后会记住选择。" : "当前：" + current.name + "。选择后可直接预览。";
      dialog.showModal();
      buttons.find((button) => button.dataset.themeChoice === current.id)?.focus();
    });
    dialog.querySelector(".theme-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => trigger.focus({ preventScroll: true }));
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    apply(current);
  }
  addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) { previewTheme = null; apply(read()); }
  });
  addEventListener("pageshow", () => apply(read()));
  addEventListener("boring-luggage-restored", () => { previewTheme = null; apply(read()); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
