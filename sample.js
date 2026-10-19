/* ============================================================
   NTHU OJ Helper — Sample IO 分頁：多組 Sample，每組 input / output 並排
   在 ui.js 之後執行。OJ 的資料模型只有單一組 sample_in / sample_out，
   所以原生那兩個欄位固定當「Sample 1」，只搬位置、不改 name、不動 form。
   第 2 組以後的額外組存在 Output 欄位的尾端（由 editor.js 讀寫），這裡
   的 textarea 刻意不給 name：伺服器不認得，送出去只會多一個沒人收的欄位。
   畫面上的值只透過 window.__ojSamples 交給 editor.js / transfer.js。
   ============================================================ */
(() => {
  "use strict";

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const cell = (label, ta) => {
    const c = el("div", "ojsample-cell");
    c.append(el("div", "ojsample-label", label), ta);
    return c;
  };

  window.addEventListener("load", () => {
    if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;

    const pane = document.getElementById("sample_io");
    if (!pane || pane.querySelector(".ojsample-grid")) return; // 重複執行 guard

    const tin = pane.querySelector('textarea[name="sample_in"]');
    const tout = pane.querySelector('textarea[name="sample_out"]');
    if (!tin || !tout) return;

    // 先把 grid 插在 sample_in 原本的位置，再把兩個 textarea 收進來。
    // 這樣 grid 的祖先鏈跟 textarea 原本一模一樣，不管 ui.js 把 pane 搬到
    // 哪裡，「最近的祖先 <form>」都還是同一個。
    const grid = el("div", "ojsample-grid");
    tin.before(grid);
    grid.append(cell("Input", tin), cell("Output", tout));

    // 驗過：兩個 textarea 都沒有 form 屬性，重新插入 form 後代時會重算
    // form owner（= 最近的祖先 form），搬完 .form.id 仍是 problem_info。
    // 這跟 testcase.js 那個坑不同：那邊的 <form> 不是 input 的祖先，靠的是
    // parser inserted flag，一搬就永久斷掉。真的斷了就整組還原，寧可版面
    // 醜也不能讓 Save 漏欄位。
    if (tin.form?.id !== "problem_info" || tout.form?.id !== "problem_info") {
      grid.before(tin, tout);
      grid.remove();
      console.warn("[OJ Helper] sample.js：搬動後 form owner 不正確，已還原版面");
      return;
    }

    // 兩個 textarea 原本各自包在一個 Bootstrap .panel 裡（白底 + 「Sample
    // Input」/「Sample Output」標題列）。grid 插在 sample_in 原位，等於被關進
    // 第一個 panel，第二個 panel 則變成只剩標題的空殼。把 grid 提到卡片本體
    // 底下，再清掉兩個 panel——標題已由 grid 內的 INPUT / OUTPUT 取代。
    const panels = [...pane.querySelectorAll(".panel")];
    if (panels.length) {
      (grid.closest(".ojui-card-body") || pane).appendChild(grid);
      panels.forEach((p) => p.remove());
      // 再確認一次：這步又搬了一次 DOM
      if (tin.form?.id !== "problem_info" || tout.form?.id !== "problem_info") {
        console.error("[OJ Helper] sample.js：提出 panel 後 form owner 斷了");
      }
    }

    // ---- 額外組（Sample 2..n）----------------------------------------
    // 值的唯一來源就是畫面上的 textarea，不另存陣列，免得兩邊不同步。
    // 全部插在 grid 旁邊：跟原生欄位同在 #problem_info 底下，打字時原生的
    // input 事件自然冒泡到 ui.js 的未存檔偵測；ui.js 之後若再包卡片，也是
    // 整批依序搬走。
    const head = (title, onDel) => {
      const h = el("div", "ojsample-head");
      h.append(el("span", "ojsample-title", title));
      if (onDel) {
        const b = el("button", "ojui-btn ojui-btn-danger ojsample-del", "刪除");
        b.type = "button"; // 預設是 submit，按了會直接送出表單
        b.addEventListener("click", onDel);
        h.append(b);
      }
      return h;
    };
    const list = el("div", "ojsample-extra");
    const add = el("button", "ojui-btn ojui-btn-ghost ojsample-add", "＋ 新增一組 Sample");
    add.type = "button";
    grid.before(head("Sample 1"));
    grid.after(list, add);

    const renumber = () =>
      list.querySelectorAll(".ojsample-title").forEach((t, i) => (t.textContent = `Sample ${i + 2}`));
    // 新增、刪除不會產生 input 事件，要自己補一發，不然離開頁面不會警告
    const changed = () => list.dispatchEvent(new Event("input", { bubbles: true }));
    const group = (s) => {
      const ta = (v) => {
        const t = el("textarea"); // 不給 name，見檔頭
        t.spellcheck = false;
        t.value = v == null ? "" : String(v);
        return t;
      };
      const g = el("div", "ojsample-group");
      const gg = el("div", "ojsample-grid");
      gg.append(cell("Input", ta(s?.in)), cell("Output", ta(s?.out)));
      g.append(
        head("", () => {
          g.remove();
          renumber();
          changed();
        }),
        gg,
      );
      return g;
    };
    // 程式寫入跟直接改 textarea.value 一樣不發事件：editor.js 載入時灌值
    // 不該被當成使用者改動，要標髒的呼叫端自己 dispatch（同 transfer.js）。
    const set = (arr) => {
      list.replaceChildren(...(Array.isArray(arr) ? arr : []).map(group));
      renumber();
    };

    add.addEventListener("click", () => {
      list.append(group());
      renumber();
      list.lastChild.querySelector("textarea").focus();
      changed();
    });

    set(window.__ojStoredSamples);
    window.__ojSamples = {
      get: () =>
        [...list.querySelectorAll(".ojsample-grid")].map((g) => {
          const [i, o] = g.querySelectorAll("textarea");
          return { in: i.value, out: o.value };
        }),
      set,
    };
  });
})();
