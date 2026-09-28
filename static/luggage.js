"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    schema = window.BoringLuggage;
  const RESTORE_KEY = "boring-lab-restore-notice-v1";
  let staged = null,
    fileRevision = 0,
    busy = false,
    urls = [];
  function status(text) {
    $("luggage-status").textContent = text;
  }
  function inventory() {
    return schema.registry.map((entry) => {
      const raw = localStorage.getItem(entry.key);
      if (raw === null) return { ...entry, raw, valid: false, description: "还没有保存记录" };
      try {
        return {
          ...entry,
          raw,
          valid: true,
          description: schema.check(entry.key, raw).description,
        };
      } catch (error) {
        return { ...entry, raw, valid: false, description: "记录无法读取，原始数据保留" };
      }
    });
  }
  function refresh() {
    try {
      const items = inventory();
      $("luggage-count").textContent =
        "可以带走 " + items.filter((item) => item.valid).length + " 项记录";
      $("export-luggage").disabled = $("export-text").disabled =
        busy || !items.some((item) => item.valid);
      const grid = $("luggage-inventory");
      grid.replaceChildren();
      for (const item of items) {
        const row = document.createElement("article"),
          title = document.createElement("h3"),
          text = document.createElement("p"),
          flag = document.createElement("small");
        row.className = "luggage-item";
        title.textContent = item.name;
        text.textContent = item.description;
        flag.textContent = item.valid ? "已装好" : item.raw === null ? "空位" : "未加入备份";
        row.dataset.state = item.valid ? "ready" : item.raw === null ? "empty" : "invalid";
        row.append(title, text, flag);
        grid.append(row);
      }
      $("inventory-note").textContent = items.some((item) => item.raw !== null && !item.valid)
        ? "有记录暂时无法读取，导出只包含已检查的有效项目；原始记录不会被删除或覆盖。"
        : "备份只带走已经保存的记录，不会为没玩过的功能创建进度。";
      return items;
    } catch {
      $("export-luggage").disabled = $("export-text").disabled = true;
      $("luggage-count").textContent = "暂时无法读取本地存档";
      $("inventory-note").textContent =
        "这个浏览器不允许读取存储，请在允许网站保存数据的浏览器中打开。";
      return null;
    }
  }
  async function withLocks(keys, work) {
    const names = ["boring-lab-luggage-transaction", ...new Set(keys)].sort();
    const lock = (index) =>
      index === names.length
        ? work()
        : navigator.locks.request(names[index], () => lock(index + 1));
    return navigator.locks?.request ? lock(0) : work();
  }
  function download(text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    urls.push(url);
    const a = $("backup-download");
    a.href = url;
    a.download =
      "boring-lab-luggage-" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".json";
    a.hidden = false;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      urls = urls.filter((value) => value !== url);
      if (a.getAttribute("href") === url) {
        a.hidden = true;
        a.removeAttribute("href");
      }
    }, 60000);
  }
  function pack() {
    const items = inventory(),
      records = items
        .filter((item) => item.valid)
        .map((item) => ({ key: item.key, value: item.raw }));
    if (!records.length) throw Error("还没有可以导出的有效记录，先去玩一会儿吧。");
    const text = JSON.stringify(
      { format: schema.FORMAT, version: 1, exportedAt: new Date().toISOString(), records },
      null,
      2,
    );
    if (new Blob([text]).size > schema.MAX_FILE)
      throw Error("存档超过 8 MB，暂时无法打包；当前记录没有改变。");
    return { text, records, skipped: items.some((item) => item.raw !== null && !item.valid) };
  }
  function selectText() {
    const field = $("export-text-value");
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, field.value.length);
    $("text-copy-status").textContent =
      "已全选。请长按存档文字，使用手机的“复制”，再到浏览器粘贴恢复。";
  }
  async function copyText() {
    const text = $("export-text-value").value;
    if (!text || busy) return;
    try {
      if (!navigator.clipboard?.writeText) throw Error();
      await navigator.clipboard.writeText(text);
      $("text-copy-status").textContent =
        "已复制完整存档。到外部浏览器打开本网站，选择“粘贴存档文字”恢复。";
    } catch {
      selectText();
      $("text-copy-status").textContent =
        "自动复制不可用，已全选存档文字。请长按后选择“复制”；也可以先粘贴到备忘录保存。";
    }
  }
  $("copy-prepared-text").addEventListener("click", copyText);
  $("select-export-text").addEventListener("click", selectText);
  $("export-text").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    refresh();
    try {
      const backup = await withLocks(
        schema.registry.map((item) => item.key),
        pack,
      );
      $("export-text-value").value = backup.text;
      $("text-export-summary").textContent =
        "这段文字包含 " +
        backup.records.length +
        " 项记录：" +
        backup.records
          .map((record) => schema.registry.find((entry) => entry.key === record.key).name)
          .join("、") +
        "。" +
        (backup.skipped ? " 无法读取的记录未加入备份。" : "");
      $("text-export-panel").hidden = false;
      $("text-copy-status").textContent = "";
      $("text-export-panel").scrollIntoView({ block: "start", behavior: "auto" });
      status("已打包当前页面的 " + backup.records.length + " 项记录，复制后再到其他浏览器恢复。");
    } catch (error) {
      status(
        error instanceof DOMException
          ? "浏览器暂时无法读取存档，请检查保存权限后重试。"
          : error.message || "暂时无法打包存档，请重试。",
      );
      return;
    } finally {
      busy = false;
      refresh();
    }
    await copyText();
  });
  $("export-luggage").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    refresh();
    try {
      await withLocks(
        schema.registry.map((item) => item.key),
        () => {
          const { text, records, skipped } = pack();
          download(text);
          status(
            "已准备好 " +
              records.length +
              " 项记录的行李箱，请保存这个 JSON 文件。" +
              (skipped ? " 无法读取的记录未加入备份，原始数据仍保留。" : ""),
          );
        },
      );
    } catch (error) {
      status(
        error instanceof DOMException
          ? "浏览器暂时无法读取或导出存档，请检查保存权限后重试。"
          : error.message || "暂时无法导出，请重试。",
      );
    } finally {
      busy = false;
      refresh();
    }
  });
  function selected() {
    return staged
      ? staged.records.filter(
          (_, index) =>
            $("restore-items").querySelector('[data-record-index="' + index + '"]')?.checked,
        )
      : [];
  }
  function selection() {
    const count = selected().length;
    $("review-restore").disabled = busy || !count;
    $("restore-selection").textContent = "准备恢复 " + count + " 项；未勾选的项目保持原样。";
    $("restore-confirmation").hidden = true;
  }
  function preview() {
    const items = inventory(),
      current = new Map(items.map((item) => [item.key, item]));
    staged.baseline = new Map();
    $("restore-items").replaceChildren();
    staged.records.forEach((record, index) => {
      const item = current.get(record.key);
      staged.baseline.set(record.key, item.raw);
      const label = document.createElement("label"),
        input = document.createElement("input"),
        content = document.createElement("div"),
        title = document.createElement("strong"),
        incoming = document.createElement("p"),
        existing = document.createElement("small");
      label.className = "restore-item";
      input.type = "checkbox";
      input.checked = true;
      input.dataset.recordIndex = index;
      input.setAttribute("aria-label", "恢复" + record.name);
      input.addEventListener("change", selection);
      title.textContent = record.name;
      incoming.textContent = "备份：" + record.description;
      existing.textContent = "当前：" + item.description;
      content.append(title, incoming, existing);
      label.append(input, content);
      $("restore-items").append(label);
    });
    $("restore-file").textContent =
      staged.filename +
      (staged.legacy
        ? " · 旧版宠物备份"
        : " · 导出于 " + new Date(staged.exportedAt).toLocaleString("zh-CN"));
    $("restore-preview").hidden = false;
    $("restore-success").hidden = true;
    selection();
  }
  async function stageArchive(read, filename) {
    if (busy) return;
    const revision = ++fileRevision;
    staged = null;
    $("restore-preview").hidden = true;
    $("restore-success").hidden = true;
    status("正在检查存档文件或文字……");
    try {
      const text = await read();
      if (revision !== fileRevision) return;
      staged = { ...schema.archive(text), filename };
      preview();
      status(
        "检查通过：这份备份有 " + staged.records.length + " 项记录。先核对，再选择要恢复的项目。",
      );
      $("restore-title").focus({ preventScroll: true });
      $("restore-preview").scrollIntoView({ block: "start", behavior: "auto" });
    } catch (error) {
      if (revision !== fileRevision) return;
      staged = null;
      status((error.message || "无法读取存档。") + " 当前记录没有改变。");
    }
  }
  $("import-file").addEventListener("change", (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || busy) return;
    stageArchive(() => {
      if (file.size > schema.MAX_FILE) throw Error("请选择不超过 8 MB 的存档文件。");
      return file.text();
    }, file.name);
  });
  $("check-import-text").addEventListener("click", () => {
    const text = $("import-text-value").value;
    stageArchive(() => {
      if (!text.trim()) throw Error("请先粘贴完整的存档文字。");
      return text;
    }, "粘贴的存档文字");
  });
  $("review-restore").addEventListener("click", () => {
    if (!staged || busy || !selected().length) return;
    $("restore-confirm-count").textContent =
      "将用这份备份替换勾选的 " + selected().length + " 项本地记录。备份中没有的项目不会改变。";
    $("restore-confirmation").hidden = false;
    $("apply-restore").focus({ preventScroll: true });
  });
  $("cancel-confirm").addEventListener("click", () => {
    $("restore-confirmation").hidden = true;
    $("review-restore").focus({ preventScroll: true });
  });
  $("cancel-import").addEventListener("click", () => {
    staged = null;
    fileRevision++;
    $("restore-preview").hidden = true;
    status("已取消导入，当前记录没有改变。");
    $("import-file").focus({ preventScroll: true });
  });
  $("apply-restore").addEventListener("click", async () => {
    if (busy || !staged || $("restore-confirmation").hidden) return;
    const records = selected();
    if (!records.length) return;
    busy = true;
    $("review-restore").disabled = true;
    $("cancel-confirm").disabled = true;
    $("restore-items")
      .querySelectorAll("input")
      .forEach((input) => (input.disabled = true));
    $("apply-restore").disabled = true;
    $("cancel-import").disabled = true;
    $("import-file").disabled = true;
    $("check-import-text").disabled = true;
    $("import-text-value").disabled = true;
    $("copy-prepared-text").disabled = true;
    $("select-export-text").disabled = true;
    refresh();
    try {
      await withLocks(
        records.map((record) => record.key),
        () => {
          for (const record of records) {
            schema.check(record.key, record.value);
            if (localStorage.getItem(record.key) !== staged.baseline.get(record.key)) {
              const error = Error("当前进度在预览后发生变化，请重新核对再确认。");
              error.changed = true;
              throw error;
            }
          }
          const before = new Map(
            records.map((record) => [record.key, localStorage.getItem(record.key)]),
          );
          const changes = records
            .filter((record) => before.get(record.key) !== record.value)
            .sort(
              (a, b) =>
                a.value.length -
                (before.get(a.key)?.length || 0) -
                (b.value.length - (before.get(b.key)?.length || 0)),
            );
          if (!changes.length) return;
          const id = crypto.randomUUID?.() || Date.now() + "-" + Math.random();
          let started = false;
          try {
            localStorage.setItem(RESTORE_KEY, JSON.stringify({ id, phase: "restoring" }));
            started = true;
            for (const record of changes) localStorage.setItem(record.key, record.value);
            localStorage.setItem(RESTORE_KEY, JSON.stringify({ id, phase: "complete" }));
          } catch (cause) {
            let rollbackFailed = false;
            if (started) {
              for (const record of changes.slice().reverse())
                try {
                  const raw = before.get(record.key);
                  if (localStorage.getItem(record.key) === raw) continue;
                  if (raw === null) localStorage.removeItem(record.key);
                  else localStorage.setItem(record.key, raw);
                } catch {
                  rollbackFailed = true;
                }
              try {
                localStorage.setItem(RESTORE_KEY, JSON.stringify({ id, phase: "complete" }));
              } catch {
                rollbackFailed = true;
              }
            }
            const error = Error(
              rollbackFailed
                ? "恢复未完成，部分记录可能已改变。请保留备份文件并重试。"
                : "浏览器未能保存这份存档，已保留恢复前的记录。可能是存储空间不足或保存权限受限。",
            );
            error.rollbackFailed = rollbackFailed;
            throw error;
          }
        },
      );
      staged = null;
      $("restore-preview").hidden = true;
      $("restore-success").hidden = false;
      $("restore-success-copy").textContent =
        "已恢复 " + records.length + " 项记录。可以继续玩了，记得保留这份行李箱文件。";
      status("恢复成功。其他已打开的玩法页会在记录变化时重新载入。");
      $("restore-success-title").focus({ preventScroll: true });
    } catch (error) {
      if (error.changed && staged) preview();
      $("restore-confirmation").hidden = true;
      status(error.message || "恢复失败，请保留备份文件后重试。");
    } finally {
      busy = false;
      $("cancel-confirm").disabled = false;
      $("restore-items")
        .querySelectorAll("input")
        .forEach((input) => (input.disabled = false));
      $("apply-restore").disabled = false;
      $("cancel-import").disabled = false;
      $("import-file").disabled = false;
      $("check-import-text").disabled = false;
      $("import-text-value").disabled = false;
      $("copy-prepared-text").disabled = false;
      $("select-export-text").disabled = false;
      refresh();
      if (staged) $("review-restore").disabled = !selected().length;
    }
  });
  addEventListener("storage", (event) => {
    if (schema.registry.some((item) => item.key === event.key) || event.key === null) refresh();
  });
  addEventListener("pagehide", () => {
    for (const url of urls) URL.revokeObjectURL(url);
    urls = [];
  });
  refresh();
})();
