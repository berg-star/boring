"use strict";
(() => {
  const installButton = document.getElementById("pwa-install");
  const installRow = document.querySelector(".pwa-install-row");
  const feedback = document.getElementById("pwa-install-feedback");
  const standalone =
    matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let installPrompt = null;
  if (standalone && installRow) installRow.hidden = true;

  addEventListener("beforeinstallprompt", (event) => {
    if (!installButton || standalone) return;
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });
  installButton?.addEventListener("click", async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    installButton.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent =
          choice.outcome === "accepted"
            ? "请按浏览器提示完成安装，下次可以从主屏幕打开。"
            : "可以稍后从浏览器菜单添加到主屏幕。";
      }
    } catch {
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = "请从浏览器菜单选择“安装应用”或“添加到主屏幕”。";
      }
    } finally {
      installButton.hidden = true;
      installButton.disabled = false;
    }
  });
  addEventListener("appinstalled", () => {
    installPrompt = null;
    if (installRow) installRow.hidden = true;
    if (feedback) feedback.hidden = true;
  });

  const main = document.querySelector("main");
  const offlineNotice = document.createElement("p");
  offlineNotice.className = "pwa-network-note";
  offlineNotice.setAttribute("role", "status");
  offlineNotice.hidden = true;
  offlineNotice.textContent =
    "当前离线：已缓存的页面仍可打开，联机对局和需要联网的抽取暂时不可用。联网后可继续。";
  if (main) main.prepend(offlineNotice);
  function networkStatus() {
    offlineNotice.hidden = navigator.onLine;
  }
  networkStatus();
  addEventListener("online", networkStatus);
  addEventListener("offline", networkStatus);

  if (!("serviceWorker" in navigator) || !isSecureContext) return;
  function register() {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.warn("PWA registration unavailable:", error));
  }
  if (document.readyState === "complete") register();
  else addEventListener("load", register, { once: true });
})();
