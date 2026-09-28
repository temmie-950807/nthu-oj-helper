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

    // 這裡讀到的是 Markdown 原稿（editor.js 已把 textarea 換成原稿），
    // 所以 zip 裡的 .md 是可以直接用文字編輯器改的。
    MD_FIELDS.forEach((n) => {
      const e = document.getElementById("id_" + n);
      files[n + ".md"] = enc(e ? e.value : "");
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
    a.download = `problem-${pid()}-${(meta.fields.pname || "untitled").replace(/[^\w\-]/g, "_")}.zip`;
    // Firefox 只對「掛在文件裡」的 <a> 處理程式化 click()，沒 append 就靜默
    // 不下載；Chromium 兩種都吃。
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 2000);
    status(`✅ 已匯出，含 ${rows.length} 筆測資`);
  }

  async function replaceTestcases(files, inNames, meta, status) {
    const csrf = document.querySelector(
      'input[name="csrfmiddlewaretoken"]',
    )?.value;
    if (!csrf) throw new Error("找不到 CSRF Token");

    const del = document.querySelectorAll(".del_testcase_btn");
    if (del.length) {
      status(`刪除現有 ${del.length} 筆測資…`);
      // 頁面自己的刪除確認框。腳本跑在 MAIN world，覆寫才吃得到。
      const orig = window.confirm;
      window.confirm = () => true;
      del.forEach((b) => b.click());
      window.confirm = orig;
      await new Promise((r) => setTimeout(r, 2500));
    }

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
      await fetch(`/problem/${pid()}/testcase/`, {
        method: "POST",
        body: fd,
        headers: { "X-CSRFToken": csrf },
      });
    }
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
        `・測資 ${inNames.length} 筆，會先刪光現有的 ${existing} 筆\n\n` +
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

    if (inNames.length) await replaceTestcases(files, inNames, meta, status);

    const tagNote = meta.tags?.length
      ? `　標籤請手動加：${meta.tags.join(", ")}`
      : "";
    status(`✅ 匯入完成，請按 Save 儲存文字欄位。${tagNote}`);
  }

  function buildUI() {
    const form = document.getElementById("problem_info");
    if (!form || document.getElementById("oj-transfer-bar")) return;

    const box = document.createElement("div");
    box.id = "oj-transfer-bar";
    box.style.cssText =
      "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 16px;" +
      "padding:10px 12px;border:1px solid #ea4c89;border-radius:6px;background:#fff5f8;";

    const label = document.createElement("b");
    label.textContent = "📦 題目搬移";
    label.style.cssText = "font-size:13px;color:#ea4c89;";

    const status = document.createElement("span");
    status.style.cssText = "font-size:12px;color:#666;margin-left:auto;";

    const setStatus = (t) => {
      status.textContent = t;
    };

    const mkBtn = (text, fn) => {
      const b = document.createElement("button");
      b.type = "button"; // 不指定會被當成 submit，按下去就送出整張表單
      b.textContent = text;
      b.style.cssText =
        "padding:5px 12px;font-size:13px;font-weight:bold;background:#ea4c89;" +
        "color:#fff;border:none;border-radius:4px;cursor:pointer;";
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
