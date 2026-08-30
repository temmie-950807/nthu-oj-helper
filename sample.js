/* ============================================================
   NTHU OJ Helper — Sample IO 分頁：input / output 並排
   在 ui.js 之後執行。只搬那兩個 textarea，不改 name、不動 form。
   OJ 的資料模型只有單一組 sample_in / sample_out，所以這裡不做
   「新增一組」，也不加「Sample 1」編號——外層卡片頭已經寫了
   「Sample IO」，再標編號只會讓人以為可以有第二組。
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
  });
})();
