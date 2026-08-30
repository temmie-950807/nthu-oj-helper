// run_at: document_start — 必須趕在 base.js 註冊 timer 之前執行。
//
// base.js 有這段：
//     setTimeout(function() { location.reload(); }, 60*60*1000);
// 編輯題目編到一半會被無預警重新載入，未存的內容全部消失。
//
// location.reload 本身不可覆寫（Location 是受保護物件），所以改成攔在
// setTimeout：只擋「延遲超過 50 分鐘、而且函式體真的呼叫 reload」的那一個，
// 其餘 timer（時鐘、popup 等）照常。
(function () {
  "use strict";
  const origSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, delay) {
    if (
      typeof delay === "number" &&
      delay >= 3000000 &&
      /location\s*\.\s*reload/.test(String(fn))
    ) {
      console.info("[OJ Helper] 已攔截每小時自動重整，避免吃掉未存的編輯");
      return 0;
    }
    return origSetTimeout.apply(this, arguments);
  };
})();
