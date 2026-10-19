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

  // 自動匯入要等 editor.js 拆完 CKEditor。不能等到 load 才註冊：頁面沒有
  // CKEditor 時 editor.js 會在它自己的 load handler 裡同步派發 ojmd:done，
  // 而那個 handler 比這支的先跑，到時候才聽就永遠等不到。
  const editorReady = new Promise((r) =>
    document.addEventListener("ojmd:done", () => r(true), { once: true }),
  );

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
    // 第 1 組是原生欄位，檔名維持 in.txt 好讓舊 zip 照樣讀得進來；第 2 組
    // 以後才編號。sample.js 沒起來時退回 editor.js 從 Output 讀出的那份。
    // Explanation 是選填的，沒寫就不產生檔案。
    const sm = window.__ojSamples?.get() ?? window.__ojStoredSamples ?? {};
    if (sm.explain) files["sample/explain.md"] = enc(sm.explain);
    (sm.extra || []).forEach((s, i) => {
      files[`sample/in-${i + 2}.txt`] = enc(s.in ?? "");
      files[`sample/out-${i + 2}.txt`] = enc(s.out ?? "");
      if (s.explain) files[`sample/explain-${i + 2}.md`] = enc(s.explain);
    });

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

  // 第 2 組以後的 sample/in-k.txt。照數字排而不是字串排，不然 in-10 會
  // 跑到 in-2 前面；缺 out 當空字串，不要整組丟掉。
  function extraSamples(files) {
    return Object.keys(files)
      .map((f) => f.match(/^sample\/in-(\d+)\.txt$/)?.[1])
      .filter(Boolean)
      .sort((a, b) => a - b)
      .map((k) => {
        const o = files[`sample/out-${k}.txt`];
        const x = files[`sample/explain-${k}.md`];
        return { in: dec(files[`sample/in-${k}.txt`]), out: o ? dec(o) : "", explain: x ? dec(x) : "" };
      });
  }

  // fresh：列表頁「匯入題目」剛建好的空題目。沒有東西會被刪，不必問；
  // visible 一律不勾，見下方。
  async function importZip(file, status, { fresh = false } = {}) {
    const files = fflate.unzipSync(new Uint8Array(await file.arrayBuffer()));
    if (!files["problem.json"])
      throw new Error("zip 裡沒有 problem.json，這不是本工具匯出的檔案");
    const meta = JSON.parse(dec(files["problem.json"]));

    const inNames = Object.keys(files)
      .filter((f) => /^testcases\/.+\.in$/i.test(f))
      .sort();
    const existing = readTestcaseRows().length;
    const extra = extraSamples(files);
    const explain1 = files["sample/explain.md"] ? dec(files["sample/explain.md"]) : "";

    // 測資刪除不可逆，動手前把要做的事講清楚
    const ok = fresh || window.confirm(
      `即將套用到題目 ${pid()}：\n\n` +
        `・題目名稱：${meta.fields?.pname ?? "(無)"}\n` +
        `・敘述 / 輸入 / 輸出、樣例 IO ${extra.length + 1} 組\n` +
        (inNames.length
          ? `・測資 ${inNames.length} 筆，會先刪光現有的 ${existing} 筆\n`
          : `・zip 裡沒有測資，現有的 ${existing} 筆保持不動\n`) +
        `・做完自動存檔（等同按下 Save）\n\n` +
        `測資刪除無法復原。確定要繼續嗎？`,
    );
    if (!ok) return status("已取消");

    // owner 不套用：zip 常是別人匯出的，照抄的話存檔後題目就轉給對方，
    // 自己反而失去編輯權。同 contest.js，owner 一律維持匯入者自己。
    META_FIELDS.forEach((n) => {
      const e = $(n);
      if (n === "owner" || !e || meta.fields?.[n] === undefined) return;
      e.value = meta.fields[n];
      e.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const vis = $("visible");
    if (vis) {
      // 新建的題目一律先隱藏：zip 常是從已公開的題目匯出的，照抄的話
      // 還沒檢查過的題目一存檔就對全站可見。檢查完再自己打開。
      vis.checked = !fresh && !!meta.visible;
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
    // 匯入是整題覆蓋，zip 裡沒有額外組也要 set([])，把舊的清掉
    window.__ojSamples?.set({ explain: explain1, extra });

    // zip 裡沒測資就不動現有的。曾經有過匯出靜默漏抓測資的 bug，若在
    // 這裡照著空 zip 把題目清空，使用者會連備份都沒有。
    if (inNames.length) {
      await deleteTestcases(status);
      await uploadTestcases(files, inNames, meta, status);
    }

    // 標籤是獨立的 AJAX，不隨表單送出，只能提醒。先講再存檔——存完頁面
    // 就跳走了，那時候才顯示等於沒顯示。
    // sample.js 沒起來就沒人接額外組，zip 裡的那幾組不會被存進去。
    const notes = [];
    if (meta.tags?.length)
      notes.push(`標籤沒辦法自動加，請手動補上：\n\n${meta.tags.join(", ")}`);
    const st = window.__ojStoredSamples;
    if (!window.__ojSamples && (extra.length || explain1 || st?.extra?.length || st?.explain))
      notes.push(`額外 Sample 與 Explanation（zip 裡 ${extra.length} 組額外 Sample）沒有套用，多組 Sample 介面沒有載入。`);
    if (notes.length) alert(`匯入完成。${notes.join("\n\n")}`);

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
    return setStatus;
  }

  /* ---------- 列表頁「匯入題目」：建新題 → 導到編輯頁 → 自動匯入 ---------- */

  // zip 本體交給編輯頁用 IndexedDB，不用 sessionStorage：測資 zip 很容易
  // 超過它約 5MB 的上限。Blob 可以直接 structured clone 進去。
  const PENDING = "oj-helper:pending-import";
  function idb(mode, fn) {
    return new Promise((ok, fail) => {
      const req = indexedDB.open("oj-helper", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("pending-import");
      req.onerror = () => fail(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("pending-import", mode);
        const r = fn(tx.objectStore("pending-import"));
        tx.oncomplete = () => (db.close(), ok(r.result));
        tx.onerror = tx.onabort = () => (db.close(), fail(tx.error));
      };
    });
  }

  // 同 contest.js 的 createProblem：/problem/new/ 成功後 redirect 到新題目
  // 的編輯頁，fetch 會跟著轉址，從最終網址拿題號。
  async function createProblem(pname) {
    const csrf = document.querySelector(
      '#add_problem_form input[name="csrfmiddlewaretoken"]',
    )?.value;
    if (!csrf) throw new Error("找不到 CSRF Token");
    const res = await fetch("/problem/new/", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": csrf,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({ csrfmiddlewaretoken: csrf, pname }),
    });
    const m = res.url.match(/\/problem\/(\d+)\/edit\//);
    if (!m) throw new Error(`建立題目失敗（停在 ${res.url}）`);
    return m[1];
  }

  async function importAsNew(file) {
    // 只解 problem.json：先確認是本工具的 zip 再建題，免得建出一題空殼。
    // 測資在編輯頁才會整包解開。
    const files = fflate.unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => f.name === "problem.json",
    });
    if (!files["problem.json"])
      throw new Error("zip 裡沒有 problem.json，這不是本工具匯出的檔案");
    const meta = JSON.parse(dec(files["problem.json"]));
    const pname = meta.fields?.pname || file.name.replace(/\.zip$/i, "");

    const id = await createProblem(pname);
    try {
      await idb("readwrite", (s) => s.put(file, id));
    } catch (err) {
      throw new Error(`題目 #${id} 已建立但內容沒匯入（${err.message || err}），可在編輯頁手動按「匯入 zip」`);
    }
    sessionStorage.setItem(PENDING, id);
    location.href = `/problem/${id}/edit/`;
  }

  function buildListButton() {
    const add = document.getElementById("add_problem_btn");
    if (!add) return; // 沒有出題權限
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = add.className; // 跟 Add problem 同一套 Bootstrap 樣式
    btn.style.marginLeft = "6px";
    btn.textContent = "匯入題目";
    btn.title = "選一個本工具匯出的 zip，直接建成新題目（先設為隱藏）";
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".zip";
    picker.style.display = "none";
    btn.addEventListener("click", () => picker.click());
    picker.addEventListener("change", async () => {
      const f = picker.files[0];
      if (!f) return;
      btn.disabled = true;
      btn.textContent = "建立中…";
      try {
        await importAsNew(f);
      } catch (err) {
        alert("❌ 匯入題目失敗：" + (err.message || err));
        console.error("[OJ Helper] 匯入題目失敗", err);
        btn.disabled = false;
        btn.textContent = "匯入題目";
      }
      picker.value = "";
    });
    add.after(btn, picker);
  }

  async function resumeImport(setStatus) {
    const id = sessionStorage.getItem(PENDING);
    if (!id || id !== pid()) return;
    try {
      // 先清掉再匯入：importZip 最後會存檔重整，失敗時使用者也可能重整，
      // 不清的話會重複匯入、重傳一次測資。
      sessionStorage.removeItem(PENDING);
      const file = await idb("readwrite", (s) => {
        const r = s.get(id);
        s.delete(id);
        return r;
      });
      if (!file) throw new Error("找不到暫存的 zip");
      const ready = await Promise.race([
        editorReady,
        new Promise((r) => setTimeout(r, 10000, false)),
      ]);
      // ui.js 也聽 ojmd:done（或在 load 裡直接）搬 DOM，讓它先跑完再動表單
      await new Promise((r) => setTimeout(r));
      if (!ready) setStatus("⚠️ 編輯器 10 秒內沒就緒，照樣匯入…");
      await importZip(file, setStatus, { fresh: true });
    } catch (err) {
      const msg = `題目 #${id} 已建立但內容沒匯入（${err.message || err}），可在編輯頁手動按「匯入 zip」`;
      setStatus("❌ " + msg);
      alert(msg); // status 收在 ui.js 的選單裡，不一定看得到
      console.error("[OJ Helper] 自動匯入失敗", err);
    }
  }

  window.addEventListener("load", () => {
    const list = location.pathname === "/problem/";
    if (!list && !/\/problem\/\d+\/edit/.test(location.pathname)) return;
    if (typeof fflate === "undefined") {
      console.error("[OJ Helper] fflate 未載入，題目搬移停用");
      return;
    }
    if (list) return buildListButton();
    resumeImport(buildUI() || (() => {}));
  });
})();
