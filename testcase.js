/* ============================================================
   NTHU OJ Helper — TestCase 分頁增強
   在 ui.js 之後執行。只「新增」欄位與元素，不重排 / 不移除
   edit.js 依賴的任何 td、按鈕或 id。
   ============================================================ */
(() => {
  "use strict";

  const HEAD_CONCURRENCY = 4; // HEAD 請求同時最多幾個

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const fmtSize = (n) =>
    n < 1024
      ? n + " B"
      : n < 1048576
        ? (n / 1024).toFixed(1) + " KB"
        : (n / 1048576).toFixed(1) + " MB";

  // edit.js 用的全域 csrf 已經是 "csrfmiddlewaretoken=xxx" 這種完整 pair
  const csrfPair = () => {
    if (typeof window.csrf === "string" && window.csrf.indexOf("csrfmiddlewaretoken") === 0)
      return window.csrf;
    const inp = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (inp) return "csrfmiddlewaretoken=" + encodeURIComponent(inp.value);
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? "csrfmiddlewaretoken=" + m[1] : "";
  };

  /* ---------- 4. 列號欄 ---------- */
  function addRowNumbers(table, rows, addRow) {
    const head = table.querySelector("tr:has(th)");
    if (head && !head.querySelector(".ojtc-num")) head.prepend(el("th", "ojtc-num", "#"));
    rows.forEach((r, i) => {
      if (!r.querySelector(".ojtc-num")) r.prepend(el("td", "ojtc-num", String(i + 1)));
    });
    // 新增列補一格，欄位才對得齊（form 在 tr 裡是非法 HTML，td 插在它前面）
    if (addRow && !addRow.querySelector(".ojtc-num")) addRow.prepend(el("td", "ojtc-num", "+"));
  }

  /* ---------- 2. 缺 .in / .out 配對提示 ---------- */
  // 用 class 過濾掉自己加的欄，避免重跑時 index 位移
  const dataCells = (row) =>
    Array.prototype.filter.call(
      row.children,
      (n) => n.tagName === "TD" && !n.classList.contains("ojtc-num"),
    );

  function markMissingPairs(rows) {
    rows.forEach((row) => {
      const [inTd, outTd] = dataCells(row);
      if (!inTd || !outTd) return;
      const a = inTd.querySelector("a");
      const b = outTd.querySelector("a");
      if (a && !b) warnMissing(outTd, a, ".out");
      else if (b && !a) warnMissing(inTd, b, ".in");
    });
  }

  function warnMissing(td, sibling, ext) {
    if (td.querySelector(".ojtc-missing")) return;
    const base = (sibling.textContent || "").trim().replace(/\.(in|out)$/i, "");
    td.appendChild(el("span", "ojtc-missing", "缺少 " + (base ? base + ext : "對應的 " + ext)));
  }

  /* ---------- 3. 檔案大小（最多 4 並行，失敗安靜略過） ---------- */

  // 這台伺服器的回應走 chunked：HEAD 與 GET 都不帶 content-length（實測），
  // 而且不支援 Range（帶了仍回 200 與完整內容）。所以只能實際讀，但讀到
  // 上限就中止——不能為了顯示一個大小把幾十 MB 的測資整包拉下來。
  const SIZE_LIMIT = 2 * 1024 * 1024;

  async function measure(url) {
    const ctrl = new AbortController();
    let res;
    try {
      res = await fetch(url, { credentials: "same-origin", signal: ctrl.signal });
    } catch (_) {
      return null;
    }
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > SIZE_LIMIT) {
          ctrl.abort();
          return { over: true, bytes: SIZE_LIMIT };
        }
      }
    } catch (_) {
      return null;
    }
    return { over: false, bytes: total };
  }

  function loadSizes(table) {
    const links = Array.prototype.filter.call(
      table.querySelectorAll('td a[href*="/problem/testcase/"]'),
      (a) => !a.dataset.ojtcSize,
    );
    links.forEach((a) => (a.dataset.ojtcSize = "1")); // 先佔位，重跑不會再抓一次

    let cursor = 0;
    const worker = async () => {
      while (cursor < links.length) {
        const a = links[cursor++];
        const r = await measure(a.href);
        // 量不到就什麼都不顯示。原本用 Number(headers.get(...))，而
        // headers.get 找不到時回 null、Number(null) 是 0 不是 NaN，
        // 守衛整個穿透，每一列都印出誤導人的 "0 B"。
        if (!r) continue;
        a.after(
          el("span", "ojtc-size", (r.over ? "> " : "") + fmtSize(r.bytes)),
        );
      }
    };
    for (let i = 0; i < Math.min(HEAD_CONCURRENCY, links.length); i++) worker();
  }

  /* ---------- 1. 表頭批次套用 ---------- */
  function buildBulkBar(pid, table, rows) {
    if (document.getElementById("ojtc_bulk")) return;

    const bar = el("div", "ojtc-bulk");
    bar.id = "ojtc_bulk";
    bar.appendChild(el("span", "ojtc-bulk-label", "全部套用"));

    const first = rows[0];
    const seed = (suffix) =>
      (first && document.getElementById(first.dataset.target + suffix)?.value) || "";

    const mkInput = (id, unit, step, value) => {
      const wrap = el("span", "ojui-unit");
      const inp = el("input", "ojui-cellinp");
      inp.type = "number";
      inp.id = id;
      inp.min = "0";
      inp.step = step;
      inp.value = value;
      wrap.append(inp, el("span", "ojui-unit-suffix", unit));
      bar.appendChild(wrap);
      return inp;
    };

    const tInp = mkInput("ojtc_bulk_time", "sec", "any", seed("_time") || "1");
    const mInp = mkInput("ojtc_bulk_memory", "MB", "1", seed("_memory") || "32");

    const applyBtn = el("button", "ojui-btn ojui-btn-ghost", "套用到全部");
    applyBtn.type = "button";
    const saveBtn = el("button", "ojui-btn ojui-btn-quiet", "套用並全部儲存");
    saveBtn.type = "button";
    const msg = el("span", "ojtc-bulk-msg");
    bar.append(applyBtn, saveBtn, msg);

    (table.closest(".ojui-table-wrap") || table).before(bar);

    // 只改前端輸入框的值，不送出
    const apply = (silent) => {
      const t = tInp.value.trim();
      const m = mInp.value.trim();
      if ((t !== "" && Number(t) < 0) || (m !== "" && Number(m) < 0)) {
        alert("limit can't be negative");
        return -1;
      }
      let n = 0;
      rows.forEach((r) => {
        const tid = r.dataset.target;
        [
          [document.getElementById(tid + "_time"), t],
          [document.getElementById(tid + "_memory"), m],
        ].forEach(([inp, v]) => {
          if (!inp || v === "") return;
          inp.value = v;
          // 讓 ui.js 的 dirty / 狀態統計跟上；儲存流程用 silent 避免多餘的離開警告
          if (!silent) inp.dispatchEvent(new Event("input", { bubbles: true }));
        });
        n++;
      });
      return n;
    };

    applyBtn.addEventListener("click", () => {
      const n = apply(false);
      if (n < 0) return;
      msg.textContent = `已套用 ${n} 列（尚未儲存，請按各列 Update）`;
    });

    saveBtn.addEventListener("click", async () => {
      if (!rows.length) return;
      const t = tInp.value.trim();
      const m = mInp.value.trim();
      if (!confirm(
        `將 ${rows.length} 筆測資的限制設為 ` +
        `${t || "（不變）"} sec / ${m || "（不變）"} MB 並立即寫入伺服器？`,
      )) return;
      if (apply(true) < 0) return;

      saveBtn.disabled = true;
      applyBtn.disabled = true;
      const csrf = csrfPair();
      let ok = 0;
      let bad = 0;
      for (const r of rows) {
        const tid = r.dataset.target;
        const tv = document.getElementById(tid + "_time")?.value ?? "";
        const mv = document.getElementById(tid + "_memory")?.value ?? "";
        const body =
          `${tid}_time=${encodeURIComponent(tv)}&${tid}_memory=${encodeURIComponent(mv)}` +
          (csrf ? "&" + csrf : "");
        try {
          const res = await fetch(`/problem/${pid}/testcase/${tid}/`, {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
            },
            body,
          });
          res.ok ? ok++ : bad++;
        } catch (_) {
          bad++;
        }
        msg.textContent = `儲存中… ${ok + bad}/${rows.length}`;
      }
      if (bad) {
        msg.textContent = `完成 ${ok} 筆，失敗 ${bad} 筆`;
        saveBtn.disabled = false;
        applyBtn.disabled = false;
      } else {
        location.href = `/problem/${pid}/edit/?tab=testcase`;
      }
    });
  }

  /* ---------- 入口 ---------- */
  window.addEventListener("load", () => {
    if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;
    const pid = location.pathname.match(/\/problem\/(\d+)/)?.[1];
    const pane = document.getElementById("testcase");
    if (!pid || !pane) return;
    const table = document.getElementById("testcase_table") || pane.querySelector("table");
    if (!table) return;

    const rows = Array.prototype.slice.call(table.querySelectorAll("tr[data-target]"));
    const addRow =
      document.getElementById("add_testcase")?.closest("tr") ||
      document.getElementById("new_time_limit")?.closest("tr");

    markMissingPairs(rows);
    addRowNumbers(table, rows, addRow);
    if (rows.length) buildBulkBar(pid, table, rows);
    loadSizes(table);
  });
})();
