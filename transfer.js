(function () {
  "use strict";

  const META_FIELDS = [
    "pname",
    "owner",
    "judge_source",
    "judge_type",
    "judge_language",
    "other_judge_id",
  ];
  const MD_FIELDS = ["description", "input", "output"];

  const enc = (s) => new TextEncoder().encode(s);
  const dec = (u) => new TextDecoder().decode(u);
  const $ = (n) => document.querySelector(`[name="${n}"]`);
  const pid = () => location.pathname.match(/\/problem\/(\d+)/)?.[1];

  // 不用 td 的位置定位。testcase.js 會在每列最前面插一欄列號，靠 index
  // 抓的話整排位移一格，inUrl 變成 undefined、整列被濾掉——匯出會靜默
  // 變成「含 0 筆測資」，而使用者以為備份好了。改成直接找測資連結與
  // 具名的限制欄位。
  function readTestcaseRows() {
    return [...document.querySelectorAll("#testcase table tr")]
      .map((r) => {
        const links = [...r.querySelectorAll('a[href*="/problem/testcase/"]')];
        return {
          inUrl: links[0]?.getAttribute("href"),
          outUrl: links[1]?.getAttribute("href"),
          time_limit: r.querySelector('input[name="time_limit"]')?.value || "1",
          memory_limit:
            r.querySelector('input[name="memory_limit"]')?.value || "32",
        };
      })
      .filter((t) => t.inUrl && t.outUrl);
  }

  async function exportZip(status) {
    const rows = readTestcaseRows();
    const files = {};
    const meta = {
      problem_id: pid(),
      fields: {},
      visible: !!$("visible")?.checked,
      tags: [...document.querySelectorAll("#tag tbody td")]
        .map((t) => t.innerText.trim())
        .filter(Boolean),
      testcases: [],
    };
    META_FIELDS.forEach((n) => {
      const e = $(n);
      if (e) meta.fields[n] = e.value;
    });

    // zip 裡的 .md 要是可以直接用文字編輯器改的完整原稿。textarea 裡存的
    // 是圖片代號版（@@IMG0@@），直接匯出的話圖片會整批遺失，所以跟
    // editor.js 要組好的版本。
    MD_FIELDS.forEach((n) => {
      const id = "id_" + n;
      const e = document.getElementById(id);
      files[n + ".md"] = enc(window.__ojMarkdown?.(id) ?? (e ? e.value : ""));
    });
    files["sample/in.txt"] = enc($("sample_in")?.value || "");
    files["sample/out.txt"] = enc($("sample_out")?.value || "");

    for (const [i, tc] of rows.entries()) {
      status(`下載測資 ${i + 1}/${rows.length}…`);
      const [ib, ob] = await Promise.all([
        fetch(tc.inUrl).then((r) => r.arrayBuffer()),
        fetch(tc.outUrl).then((r) => r.arrayBuffer()),
      ]);
      const nm = String(i + 1).padStart(3, "0");
      files[`testcases/${nm}.in`] = new Uint8Array(ib);
      files[`testcases/${nm}.out`] = new Uint8Array(ob);
      meta.testcases.push({
        name: nm,
        time_limit: tc.time_limit,
        memory_limit: tc.memory_limit,
      });
    }

    files["problem.json"] = enc(JSON.stringify(meta, null, 2));
    status("壓縮中…");
    const blob = new Blob([fflate.zipSync(files, { level: 6 })], {
      type: "application/zip",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    // 只擋掉檔名不能用的字元。原本用 [^\w-]，而 \w 是 ASCII-only，中文題名
    // 會被整串濾成 ____，下載下來認不出是哪一題。
    a.download = `problem-${pid()}-${(meta.fields.pname || "untitled").replace(/[\\/:*?"<>|\s]+/g, "_")}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    status(`✅ 已匯出，含 ${rows.length} 筆測資`);
  }

  const csrfToken = () =>
    document.querySelector('input[name="csrfmiddlewaretoken"]')?.value;

  // 不能用 .del_testcase_btn.click()。edit.js 的 handler 在 AJAX 成功後會做
  // window.location.href = '…/edit/?tab=testcase'，第一筆刪完頁面就被導走，
  // 剛寫進表單的敘述 / 輸入 / 輸出全部蒸發，而匯入流程也從中間斷掉。
  // 改成自己送同一支 DELETE，少了那行導航，其餘完全一樣。
  async function deleteTestcases(status) {
    const csrf = csrfToken();
    if (!csrf) throw new Error("找不到 CSRF Token");
    const rows = [...document.querySelectorAll("#testcase table tr[data-target]")];
    for (const [i, row] of rows.entries()) {
      status(`刪除舊測資 ${i + 1}/${rows.length}…`);
      const tid = row.getAttribute("data-target");
      const res = await fetch(`/problem/${pid()}/testcase/${tid}/delete/`, {
        method: "DELETE",
        headers: { "X-CSRFToken": csrf },
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`刪除測資 ${tid} 失敗（HTTP ${res.status}）`);
      row.remove(); // 讓表格與 ui.js 的完成度即時反映，不必等重整
    }
  }

  async function uploadTestcases(files, inNames, meta, status) {
    const csrf = csrfToken();
    if (!csrf) throw new Error("找不到 CSRF Token");
    const byName = new Map((meta.testcases || []).map((t) => [t.name, t]));
    for (const [i, inName] of inNames.entries()) {
      const base = inName.replace(/^testcases\//, "").replace(/\.in$/i, "");
      const outName = `testcases/${base}.out`;
      if (!files[outName]) continue;
      status(`上傳測資 ${i + 1}/${inNames.length}…`);
      const lim = byName.get(base) || {};
      const fd = new FormData();
      fd.append("csrfmiddlewaretoken", csrf);
      fd.append("t_in", new Blob([files[inName]]), base + ".in");
      fd.append("t_out", new Blob([files[outName]]), base + ".out");
      fd.append("time_limit", lim.time_limit || "1");
      fd.append("memory_limit", lim.memory_limit || "32");
      const res = await fetch(`/problem/${pid()}/testcase/`, {
        method: "POST",
        body: fd,
        headers: { "X-CSRFToken": csrf },
        credentials: "same-origin",
      });
      if (!res.ok)
        throw new Error(`上傳測資 ${base} 失敗（HTTP ${res.status}）`);
    }
  }

  // 文字欄位只是被寫進表單，還沒進資料庫。走 #save_button 而不是
  // form.submit()：edit.js 要在 click 時把 action / target 從 Preview 的設定
  // 還原，而且這條路徑會經過 editor.js 的 submit handler 做 Markdown→HTML
  // 轉換。後端存檔後會 redirect 到題目頁，等於自動重整。
  function saveForm(status) {
    const btn = document.getElementById("save_button");
    if (btn) {
      status("儲存中…");
      btn.click();
      return true;
    }
    return false;
  }

  async function importZip(file, status) {
    const files = fflate.unzipSync(new Uint8Array(await file.arrayBuffer()));
    if (!files["problem.json"])
      throw new Error("zip 裡沒有 problem.json，這不是本工具匯出的檔案");
    const meta = JSON.parse(dec(files["problem.json"]));

    const inNames = Object.keys(files)
      .filter((f) => /^testcases\/.+\.in$/i.test(f))
      .sort();
    const existing = readTestcaseRows().length;

    // 測資刪除不可逆，動手前把要做的事講清楚
    const ok = window.confirm(
      `即將套用到題目 ${pid()}：\n\n` +
        `・題目名稱：${meta.fields?.pname ?? "(無)"}\n` +
        `・敘述 / 輸入 / 輸出、樣例 IO\n` +
        (inNames.length
          ? `・測資 ${inNames.length} 筆，會先刪光現有的 ${existing} 筆\n`
          : `・zip 裡沒有測資，現有的 ${existing} 筆保持不動\n`) +
        `・做完自動存檔（等同按下 Save）\n\n` +
        `測資刪除無法復原。確定要繼續嗎？`,
    );
    if (!ok) return status("已取消");

    META_FIELDS.forEach((n) => {
      const e = $(n);
      if (!e || meta.fields?.[n] === undefined) return;
      e.value = meta.fields[n];
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const vis = $("visible");
    if (vis) {
      vis.checked = !!meta.visible;
      vis.dispatchEvent(new Event("change", { bubbles: true }));
    }

    MD_FIELDS.forEach((n) => {
      const e = document.getElementById("id_" + n);
      const f = files[n + ".md"];
      if (!e || !f) return;
      e.value = dec(f);
      e.dispatchEvent(new Event("input", { bubbles: true })); // 觸發預覽重畫
    });
    // 直接寫 value 不會產生事件，而 ui.js 的完成度面板與 segmented /
    // radio card 都是靠 document 上的 input/change 重算的。不補這幾發，
    // 匯入後畫面會停在舊狀態，跟實際會送出的值不一致。
    [
      ["sample_in", "sample/in.txt"],
      ["sample_out", "sample/out.txt"],
    ].forEach(([name, path]) => {
      const e = $(name);
      if (!e || !files[path]) return;
      e.value = dec(files[path]);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // zip 裡沒測資就不動現有的。曾經有過匯出靜默漏抓測資的 bug，若在
    // 這裡照著空 zip 把題目清空，使用者會連備份都沒有。
    if (inNames.length) {
      await deleteTestcases(status);
      await uploadTestcases(files, inNames, meta, status);
    }

    // 標籤是獨立的 AJAX，不隨表單送出，只能提醒。先講再存檔——存完頁面
    // 就跳走了，那時候才顯示等於沒顯示。
    if (meta.tags?.length)
      alert(`匯入完成。標籤沒辦法自動加，請手動補上：\n\n${meta.tags.join(", ")}`);

    if (!saveForm(status))
      status("✅ 匯入完成，但找不到 Save 鈕，請手動儲存文字欄位。");
  }

  function buildUI() {
    const form = document.getElementById("problem_info");
    if (!form || document.getElementById("oj-transfer-bar")) return;

    const box = document.createElement("div");
    box.id = "oj-transfer-bar";
    // 正常情況下 ui.js 會把這幾顆按鈕搬進「題目搬移」選單、再把這個 box
    // 整個移除，所以這裡只需要撐住 ui.js 沒跑成功的退路。用 token 上色，
    // 深色模式才不會是一塊亮底。
    box.style.cssText =
      "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 16px;" +
      "padding:10px 12px;border:1px solid var(--hair);border-radius:6px;" +
      "background:var(--surface);color:var(--ink);";

    const label = document.createElement("b");
    label.textContent = "📦 題目搬移";
    label.style.cssText = "font-size:13px;";

    const status = document.createElement("span");
    status.style.cssText = "font-size:12px;color:var(--muted);margin-left:auto;";

    const setStatus = (t) => {
      status.textContent = t;
    };

    const mkBtn = (text, fn) => {
      const b = document.createElement("button");
      b.type = "button"; // 不指定會被當成 submit，按下去就送出整張表單
      b.textContent = text;
      // 不設 inline style。ui.js 會把它搬進 .ojui-menu，那裡的樣式已經走
      // token；inline 的話會蓋掉，變成選單裡兩塊突兀的色塊。
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await fn(setStatus);
        } catch (err) {
          setStatus("❌ " + (err.message || err));
          console.error("[OJ Helper] 題目搬移失敗", err);
        }
        b.disabled = false;
      });
      return b;
    };

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".zip";
    picker.style.display = "none";
    picker.addEventListener("change", async () => {
      const f = picker.files[0];
      if (!f) return;
      try {
        await importZip(f, setStatus);
      } catch (err) {
        setStatus("❌ " + (err.message || err));
        console.error("[OJ Helper] 匯入失敗", err);
      }
      picker.value = "";
    });

    box.append(
      label,
      mkBtn("匯出 zip", exportZip),
      mkBtn("匯入 zip", async () => picker.click()),
      picker,
      status,
    );
    form.prepend(box);
  }

  window.addEventListener("load", () => {
    if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;
    if (typeof fflate === "undefined") {
      console.error("[OJ Helper] fflate 未載入，題目搬移停用");
      return;
    }
    buildUI();
  });
})();
