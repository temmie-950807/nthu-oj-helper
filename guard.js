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

// 決定亮暗主題。必須在 document_start 就寫進 html 屬性，否則 CSS 生效時
// 主題還沒定，畫面會先閃一次淺色再跳深色。
// 使用者手動選過就用選的，沒選過才跟隨系統。
(function () {
  "use strict";
  let pref = null;
  try {
    pref = localStorage.getItem("oj_theme");
  } catch (_) {
    /* 某些情況下 localStorage 不可用，跟隨系統即可 */
  }
  const dark =
    pref === "dark" ||
    (pref !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.ojTheme = dark ? "dark" : "light";
})();

// 阻止 CKEditor 啟動。
//
// editor.js 反正會把三個實例全部 destroy 換成 Markdown 編輯器，但在那之前
// 必須等它們 instanceReady——實測 CKEditor 的資源要到 1100ms 才載完，
// load 事件 1167ms，使用者這段時間都盯著原本的 Bootstrap 版面。
//
// 直接讓 CKEDITOR.replace 不建立編輯器：沒有實例要等，也沒有 iframe 會在
// 搬 DOM 時炸掉，版面可以在 DOM 一就緒就重建。
// 攔截失敗也不會壞事——editor.js 本來就有「沒有 CKEditor 實例」的分支。
(function () {
  "use strict";
  if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;

  let ck;
  Object.defineProperty(window, "CKEDITOR", {
    configurable: true,
    get() {
      return ck;
    },
    set(v) {
      ck = v;
      if (!v || typeof v.replace !== "function" || v.__ojPatched) return;
      v.__ojPatched = true;
      const orig = v.replace.bind(v);
      v.__ojOriginalReplace = orig; // 留一條後路
      v.replace = function (target) {
        const el =
          typeof target === "string" ? document.getElementById(target) : target;
        // django-ckeditor 的 widget 把 textarea 藏起來等 CKEditor 接手，
        // 這裡不接手了，就把它露出來讓 editor.js 直接用。
        if (el && el.style) el.style.display = "";
        return null;
      };
    },
  });
})();
