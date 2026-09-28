// 比賽搬移：把一整場比賽（含題目與測資）打包成 zip，在另一台 OJ 匯入。
//
// acm.cs.nthu.edu.tw 與 140.114.86.166 是兩台獨立的機器、兩份資料庫，題號與
// 帳號都不通用。content script 又跨不了站（cookie jar 分開、CORS 擋著），
// 所以「同步」的實作就是一邊匯出成檔案、另一邊匯入。
//
// 只跑在 editContest.html 這個模板上：/contest/new/ 與 /contest/edit/<cid>/。
(function () {
  "use strict";

  const ROUTE = location.pathname.match(/^\/contest\/(?:new\/|edit\/(\d+)\/)$/);
  if (!ROUTE) return;
  const CID = ROUTE[1] || null; // 有 cid 才能匯出

  const FORMAT = "nthuoj-contest/1";
  const MD_FIELDS = ["description", "input", "output"];
  const META_FIELDS = [
    "pname",
    "judge_source",
    "judge_type",
    "judge_language",
    "other_judge_id",
  ];

  const enc = (s) => new TextEncoder().encode(s);
  const dec = (u) => new TextDecoder().decode(u);
  const pad = (n) => String(n).padStart(3, "0");
  const $ = (n, root) => (root || document).querySelector(`[name="${n}"]`);
  const csrf = () => $("csrfmiddlewaretoken")?.value;

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new DOMParser().parseFromString(await res.text(), "text/html");
  }

  /* ===================== 匯出 ===================== */

  // 題目敘述存的是「<!--md:base64(原稿)-->\n<渲染後的 HTML>」。這裡整串原樣
  // 搬走，不拆成 markdown：拆了的話匯入端得重跑 marked + MathJax 才組得回來，
  // 等於要在比賽頁載入 2MB 的 tex-svg.js。原樣搬也不會失真。
  function readProblem(doc) {
    const p = { fields: {}, raw: {}, tags: [], testcases: [] };
    META_FIELDS.forEach((n) => {
      const e = $(n, doc);
      if (e) p.fields[n] = e.value;
    });
    p.fields.visible = !!$("visible", doc)?.checked;
    MD_FIELDS.forEach((n) => {
      p.raw[n] = doc.getElementById("id_" + n)?.value ?? "";
    });
    p.sample_in = $("sample_in", doc)?.value || "";
    p.sample_out = $("sample_out", doc)?.value || "";
    p.tags = [...doc.querySelectorAll("#tagTable tr td:first-child")]
      .map((td) => td.textContent.trim())
      .filter(Boolean);
    p.testcases = [...doc.querySelectorAll("#testcase_table tr[data-target]")].map(
      (tr) => ({
        tid: tr.getAttribute("data-target"),
        time_limit: tr.querySelector('input[name="time_limit"]')?.value || "1",
        memory_limit: tr.querySelector('input[name="memory_limit"]')?.value || "32",
      }),
    );
    return p;
  }

  function readContestForm() {
    return {
      cname: $("cname")?.value || "",
      start_time: $("start_time")?.value || "",
      end_time: $("end_time")?.value || "",
      freeze_time: $("freeze_time")?.value || "0",
      is_homework: !!$("is_homework")?.checked,
      open_register: !!$("open_register")?.checked,
    };
  }

  async function exportContest(status, statementOnly) {
    const sel = document.getElementById("id_problem");
    const pids = [...(sel?.options || [])]
      .filter((o) => o.selected)
      .map((o) => o.value);
    if (!pids.length) throw new Error("這場比賽沒有題目");

    const files = {};
    // owner / coowner 刻意不帶：帳號在兩台也不通用，匯入端一律設成匯入者自己。
    const meta = Object.assign(
      {
        format: FORMAT,
        source: location.origin,
        src_cid: Number(CID),
        // 只帶敘述的包，匯入端要靠這個旗標決定「不要碰測資」。不能改看
        // testcases 是不是空的——那跟「這題本來就沒有測資，請清空」分不出來。
        statement_only: !!statementOnly,
        problems: [],
      },
      readContestForm(),
    );

    const failed = [];
    for (const [i, pid] of pids.entries()) {
      status(`讀題目 ${i + 1}/${pids.length}（#${pid}）…`);
      let doc;
      try {
        doc = await fetchDoc(`/problem/${pid}/edit/`);
      } catch (err) {
        // 別人的題目沒有編輯權，就抓不到原稿與測資。跳過並記下來，
        // 不要讓整包匯出因為一題失敗而中斷。
        failed.push(`#${pid}（${err.message}）`);
        continue;
      }
      const p = readProblem(doc);
      const dir = `problems/${pad(meta.problems.length + 1)}`;
      // 敘述永遠要帶。圖片是以 data URI 內嵌在這三份原文裡的，所以只要原樣
      // 搬走，圖片就跟著走，不需要另外處理附件。
      MD_FIELDS.forEach((n) => {
        files[`${dir}/${n}.raw`] = enc(p.raw[n]);
      });

      if (statementOnly) {
        files[`${dir}/problem.json`] = enc(
          JSON.stringify(
            { src_pid: Number(pid), fields: { pname: p.fields.pname } },
            null,
            2,
          ),
        );
        meta.problems.push(dir.replace("problems/", ""));
        continue;
      }

      files[`${dir}/sample/in.txt`] = enc(p.sample_in);
      files[`${dir}/sample/out.txt`] = enc(p.sample_out);

      const tcs = [];
      for (const [j, tc] of p.testcases.entries()) {
        status(`題目 ${i + 1}/${pids.length} 測資 ${j + 1}/${p.testcases.length}…`);
        const [ib, ob] = await Promise.all([
          fetch(`/problem/testcase/${tc.tid}.in`, { credentials: "same-origin" })
            .then((r) => r.arrayBuffer()),
          fetch(`/problem/testcase/${tc.tid}.out`, { credentials: "same-origin" })
            .then((r) => r.arrayBuffer()),
        ]);
        const nm = pad(j + 1);
        files[`${dir}/testcases/${nm}.in`] = new Uint8Array(ib);
        files[`${dir}/testcases/${nm}.out`] = new Uint8Array(ob);
        tcs.push({
          name: nm,
          time_limit: tc.time_limit,
          memory_limit: tc.memory_limit,
        });
      }

      files[`${dir}/problem.json`] = enc(
        JSON.stringify(
          { src_pid: Number(pid), fields: p.fields, tags: p.tags, testcases: tcs },
          null,
          2,
        ),
      );
      meta.problems.push(dir.replace("problems/", ""));
    }

    if (!meta.problems.length)
      throw new Error("一題都讀不到（多半是沒有那些題目的編輯權）");

    files["contest.json"] = enc(JSON.stringify(meta, null, 2));
    status("壓縮中…");
    const blob = new Blob([fflate.zipSync(files, { level: 6 })], {
      type: "application/zip",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    // 只擋掉檔名不能用的字元。原本用 [^\w-]，而 \w 是 ASCII-only，
    // 中文比賽名會被整串濾成 ____，檔案下載下來認不出是哪一場。
    a.download =
      `contest-${CID}-${(meta.cname || "untitled").replace(/[\\/:*?"<>|\s]+/g, "_")}` +
      (statementOnly ? "-statement" : "") +
      ".zip";
    // Firefox 只對「掛在文件裡」的 <a> 處理程式化 click()，沒 append 就靜默
    // 不下載；Chromium 兩種都吃。
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 2000);

    status(
      `✅ 已匯出 ${meta.problems.length} 題` +
        (statementOnly ? "（僅敘述）" : "") +
        (failed.length ? `，跳過 ${failed.length} 題：${failed.join("、")}` : ""),
    );
  }

  /* ===================== 匯入 ===================== */

  // 目標站的完整題目清單。/contest/new/ 的 #id_problem 一次就帶著全部題目，
  // 比翻分頁的 /problem/ 列表省事。這頁自己的 select 不能用——延遲載入
  // 已經把它裁掉了。
  async function targetProblems(status) {
    status("讀取目標站題目清單…");
    const doc = await fetchDoc("/contest/new/");
    const sel = doc.getElementById("id_problem");
    if (!sel) throw new Error("讀不到目標站的題目清單");
    return [...sel.options].map((o) => ({
      pid: o.value,
      // option 文字是 Problem.__unicode__ 的「題號 - 題名」
      pname: o.text.replace(/^\s*\d+\s*-\s*/, "").trim(),
    }));
  }

  function readBundle(files) {
    if (!files["contest.json"]) throw new Error("zip 裡沒有 contest.json");
    const meta = JSON.parse(dec(files["contest.json"]));
    if (meta.format !== FORMAT)
      throw new Error(`不認得的格式：${meta.format || "(無)"}`);
    const problems = (meta.problems || []).map((dir) => {
      const base = `problems/${dir}`;
      const j = files[`${base}/problem.json`];
      if (!j) throw new Error(`${base}/problem.json 不存在`);
      const p = JSON.parse(dec(j));
      p.dir = base;
      p.raw = {};
      MD_FIELDS.forEach((n) => {
        p.raw[n] = dec(files[`${base}/${n}.raw`] || new Uint8Array());
      });
      // 只帶敘述的包裡沒有 sample。留成 undefined，讓 fillProblem 知道
      //「這一項不要動」，而不是把目標站的範例洗成空字串。
      const si = files[`${base}/sample/in.txt`];
      const so = files[`${base}/sample/out.txt`];
      if (si) p.sample_in = dec(si);
      if (so) p.sample_out = dec(so);
      return p;
    });
    return { meta, problems };
  }

  // 在目標站建一顆空題目。/problem/new/ 只吃 pname，建完直接轉到編輯頁，
  // 新題號就在轉址後的網址裡。
  async function createProblem(pname) {
    const body = new URLSearchParams({
      csrfmiddlewaretoken: csrf(),
      pname: pname,
    });
    const res = await fetch("/problem/new/", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": csrf(),
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: body,
    });
    const m = res.url.match(/\/problem\/(\d+)\/edit\//);
    if (!m) throw new Error(`建立題目失敗（停在 ${res.url}）`);
    return m[1];
  }

  // 把內容寫進題目。走它自己的編輯表單，欄位與 owner 都從那頁現讀，
  // 免得漏掉哪個必填欄位讓表單驗證整個退回。
  //
  // 先把目標站現有的值整份抄下來當底，再用 zip 裡真的有的欄位蓋掉。
  // 「只帶敘述」的包才不會把 judge 設定與範例 IO 洗成空字串——那些欄位
  // 是必填，送空的不是被驗證退回就是真的被存成空值。
  async function fillProblem(pid, p) {
    const doc = await fetchDoc(`/problem/${pid}/edit/`);
    const token = $("csrfmiddlewaretoken", doc)?.value || csrf();
    const body = new URLSearchParams();
    body.set("csrfmiddlewaretoken", token);
    // owner 用目標站現有的值（就是剛剛建立題目的人），不要沿用來源站的 pk
    body.set("owner", $("owner", doc)?.value || "");
    META_FIELDS.forEach((n) => body.set(n, $(n, doc)?.value ?? ""));
    if ($("visible", doc)?.checked) body.set("visible", "on");
    MD_FIELDS.forEach((n) =>
      body.set(n, doc.getElementById("id_" + n)?.value ?? ""),
    );
    body.set("sample_in", $("sample_in", doc)?.value ?? "");
    body.set("sample_out", $("sample_out", doc)?.value ?? "");

    Object.entries(p.fields || {}).forEach(([k, v]) => {
      if (k === "visible" || v === undefined || v === null) return;
      body.set(k, v);
    });
    if (p.fields && "visible" in p.fields) {
      body.delete("visible");
      if (p.fields.visible) body.set("visible", "on");
    }
    MD_FIELDS.forEach((n) => {
      if (p.raw[n] !== undefined) body.set(n, p.raw[n]);
    });
    if (p.sample_in !== undefined) body.set("sample_in", p.sample_in);
    if (p.sample_out !== undefined) body.set("sample_out", p.sample_out);

    const res = await fetch(`/problem/${pid}/edit/`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": token,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: body,
    });
    if (!res.ok) throw new Error(`寫入題目 #${pid} 失敗（HTTP ${res.status}）`);
  }

  async function replaceTestcases(pid, p, files, status, label) {
    const doc = await fetchDoc(`/problem/${pid}/edit/`);
    const token = $("csrfmiddlewaretoken", doc)?.value || csrf();
    // 重用既有題目時要先清空，不然測資會疊上去
    const old = [...doc.querySelectorAll("#testcase_table tr[data-target]")];
    for (const [i, tr] of old.entries()) {
      status(`${label} 清除舊測資 ${i + 1}/${old.length}…`);
      const tid = tr.getAttribute("data-target");
      const res = await fetch(`/problem/${pid}/testcase/${tid}/delete/`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-CSRFToken": token },
      });
      if (!res.ok) throw new Error(`刪除測資 ${tid} 失敗（HTTP ${res.status}）`);
    }
    for (const [i, tc] of (p.testcases || []).entries()) {
      status(`${label} 上傳測資 ${i + 1}/${p.testcases.length}…`);
      const fd = new FormData();
      fd.append("csrfmiddlewaretoken", token);
      fd.append(
        "t_in",
        new Blob([files[`${p.dir}/testcases/${tc.name}.in`] || new Uint8Array()]),
        `${tc.name}.in`,
      );
      fd.append(
        "t_out",
        new Blob([files[`${p.dir}/testcases/${tc.name}.out`] || new Uint8Array()]),
        `${tc.name}.out`,
      );
      fd.append("time_limit", tc.time_limit || "1");
      fd.append("memory_limit", tc.memory_limit || "32");
      const res = await fetch(`/problem/${pid}/testcase/`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRFToken": token },
        body: fd,
      });
      if (!res.ok)
        throw new Error(`上傳測資 ${tc.name} 失敗（HTTP ${res.status}）`);
    }
  }

  async function addTags(pid, tags) {
    for (const t of tags || []) {
      const body = new URLSearchParams({
        csrfmiddlewaretoken: csrf(),
        tag_name: t,
      });
      // 標籤失敗不該讓整場匯入停下來，記一行就好
      try {
        await fetch(`/problem/${pid}/tag/`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": csrf(),
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          },
          body: body,
        });
      } catch (err) {
        console.warn(`[OJ Helper] 題目 #${pid} 的標籤「${t}」加失敗`, err);
      }
    }
  }

  async function createContest(meta, pids) {
    const body = new URLSearchParams();
    body.set("csrfmiddlewaretoken", csrf());
    body.set("cname", meta.cname || "");
    // owner 一定要是自己：來源站的帳號 pk 在這裡沒有意義
    body.set("owner", $("owner")?.value || "");
    body.set("start_time", meta.start_time || "");
    body.set("end_time", meta.end_time || "");
    body.set("freeze_time", meta.freeze_time || "0");
    if (meta.is_homework) body.set("is_homework", "on");
    if (meta.open_register) body.set("open_register", "on");
    pids.forEach((p) => body.append("problem", p));

    const res = await fetch("/contest/new/", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": csrf(),
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: body,
    });
    const m = res.url.match(/\/contest\/(\d+)\//);
    if (!m)
      throw new Error(
        "比賽建立失敗，多半是某個欄位沒過驗證（題目已經建好了，可以手動開一場比賽把它們加進去）",
      );
    return m[1];
  }

  window.__ojContest = { readBundle, targetProblems }; // 給測試用

  /* ===================== 介面 ===================== */

  function buildPanel() {
    const form = document.querySelector("form[method='POST']");
    if (!form || document.getElementById("oj-contest-bar")) return;

    const box = document.createElement("div");
    box.id = "oj-contest-bar";
    box.className = "ojct-bar";

    const label = document.createElement("b");
    label.textContent = "🏆 比賽搬移";

    const status = document.createElement("span");
    status.className = "ojct-status";
    const setStatus = (t) => {
      status.textContent = t;
    };

    const mkBtn = (text, fn) => {
      const b = document.createElement("button");
      b.type = "button"; // 不指定會被當成 submit，按下去就把比賽送出了
      b.textContent = text;
      b.className = "ojct-btn";
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await fn(setStatus);
        } catch (err) {
          setStatus("❌ " + (err.message || err));
          console.error("[OJ Helper] 比賽搬移失敗", err);
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
      picker.value = "";
      if (!f) return;
      try {
        await showPlan(f, setStatus, box);
      } catch (err) {
        setStatus("❌ " + (err.message || err));
        console.error("[OJ Helper] 讀取 zip 失敗", err);
      }
    });

    box.append(label);
    if (CID) {
      const only = document.createElement("label");
      only.className = "ojct-only";
      only.title =
        "只匯出題名與 description / input / output，不含測資、範例 IO、" +
        "judge 設定與標籤。內嵌的圖片是 data URI，跟在敘述裡一起走。";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      only.append(cb, document.createTextNode("只帶題目敘述"));
      box.append(mkBtn("匯出 zip", (s) => exportContest(s, cb.checked)), only);
    }
    box.append(mkBtn("匯入 zip", async () => picker.click()), picker, status);
    form.prepend(box);
  }

  // 匯入前先把「每一題會怎麼處理」攤開來。同名題目讓使用者自己決定重用還是
  // 另外新建——猜錯的話會直接覆寫掉別人的題目。
  async function showPlan(file, status, box) {
    const files = fflate.unzipSync(new Uint8Array(await file.arrayBuffer()));
    const { meta, problems } = readBundle(files);
    const catalog = await targetProblems(status);
    const byName = new Map();
    catalog.forEach((c) => {
      if (!byName.has(c.pname)) byName.set(c.pname, []);
      byName.get(c.pname).push(c.pid);
    });

    document.getElementById("oj-contest-plan")?.remove();
    const plan = document.createElement("div");
    plan.id = "oj-contest-plan";
    plan.className = "ojct-plan";

    const head = document.createElement("div");
    head.className = "ojct-plan-head";
    head.textContent =
      `${meta.cname}（來自 ${meta.source}，${problems.length} 題` +
      (meta.statement_only ? "，只帶敘述" : "") +
      "）";
    plan.appendChild(head);

    const table = document.createElement("table");
    table.className = "ojct-table";
    table.innerHTML =
      "<tr><th>來源題目</th><th>帶了什麼</th><th>目標站要怎麼做</th></tr>";
    const overwrite = meta.statement_only ? "只覆蓋敘述" : "會覆蓋內容";
    const rows = problems.map((p) => {
      const tr = document.createElement("tr");
      const same = byName.get(p.fields.pname) || [];
      const sel = document.createElement("select");
      sel.innerHTML =
        `<option value="new">新建一題</option>` +
        same
          .map((pid) => `<option value="${pid}">重用 #${pid}（${overwrite}）</option>`)
          .join("");
      const nameTd = document.createElement("td");
      nameTd.textContent = p.fields.pname;
      const tcTd = document.createElement("td");
      tcTd.textContent = meta.statement_only
        ? "題名 + 敘述"
        : `敘述 + 範例 + ${(p.testcases || []).length} 筆測資`;
      const actTd = document.createElement("td");
      actTd.appendChild(sel);
      if (same.length) {
        const hint = document.createElement("span");
        hint.className = "ojct-hint";
        hint.textContent = `目標站有 ${same.length} 題同名`;
        actTd.appendChild(hint);
      }
      tr.append(nameTd, tcTd, actTd);
      table.appendChild(tr);
      return { p, sel };
    });
    plan.appendChild(table);

    const go = document.createElement("button");
    go.type = "button";
    go.className = "ojct-btn ojct-btn-go";
    go.textContent = "開始匯入";
    go.addEventListener("click", async () => {
      go.disabled = true;
      try {
        await runImport(meta, rows, files, status);
      } catch (err) {
        status("❌ " + (err.message || err));
        console.error("[OJ Helper] 匯入失敗", err);
      }
      go.disabled = false;
    });
    plan.appendChild(go);
    box.after(plan);
    status(`已讀取，確認下方對應表後按「開始匯入」`);
  }

  async function runImport(meta, rows, files, status) {
    const pids = [];
    for (const [i, { p, sel }] of rows.entries()) {
      const label = `題目 ${i + 1}/${rows.length}`;
      let pid = sel.value;
      if (pid === "new") {
        status(`${label} 建立中…`);
        pid = await createProblem(p.fields.pname);
      }
      status(`${label} 寫入內容…`);
      await fillProblem(pid, p);
      // 只帶敘述的包完全不碰測資與標籤。特別是測資：replaceTestcases 會
      // 先清空再上傳，這裡若照跑，重用既有題目等於把它的測資全刪光。
      if (!meta.statement_only) {
        await replaceTestcases(pid, p, files, status, label);
        await addTags(pid, p.tags);
      }
      pids.push(pid);
    }
    status("建立比賽…");
    const cid = await createContest(meta, pids);
    status(`✅ 匯入完成，比賽 #${cid}（${pids.length} 題）`);
    document.getElementById("oj-contest-plan")?.remove();
    const link = document.createElement("a");
    link.href = `/contest/${cid}/`;
    link.textContent = `前往比賽 #${cid} ↗`;
    link.className = "ojct-link";
    document.getElementById("oj-contest-bar").appendChild(link);
  }

  window.addEventListener("load", () => {
    if (typeof fflate === "undefined") {
      console.error("[OJ Helper] fflate 未載入，比賽搬移停用");
      return;
    }
    buildPanel();
  });
})();
