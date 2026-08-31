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

// 蓋掉重建前的舊版面。
//
// 版面重建要等 load 事件（實測 ~1.6s，主要是 OJ 自己的資源）。在那之前
// 使用者會先看到原本的 Bootstrap 頁面，然後畫面整個跳掉——閃爍比等待更
// 讓人不安。這裡先把內容區藏起來，換上一行提示，ui.js 建好版面就掀開。
//
// 一定要有 fallback：ui.js 若因結構不符而 bail，內容不能永遠不出現。
(function () {
  "use strict";
  if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;

  const style = document.createElement("style");
  style.id = "oj-boot-veil";
  style.textContent =
    "body > .container { visibility: hidden; }" +
    "body::before { content: '載入編輯器…'; position: fixed; top: 45%; left: 0; right: 0;" +
    "text-align: center; font: 14px/1.5 system-ui, sans-serif; color: #6b6664; z-index: 1; }";
  (document.head || document.documentElement).appendChild(style);

  const lift = () => style.remove();
  window.__ojLiftVeil = lift; // ui.js 建好版面後呼叫
  setTimeout(lift, 4000); // 保險：ui.js 沒跑成功也要讓頁面能用
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
      if (!v || typeof v !== "object" || v.__ojPatched) return;
      v.__ojPatched = true;

      // 不能在這裡檢查 v.replace：CKEditor 是先把物件賦給 window.CKEDITOR、
      // 之後才掛上 replace 方法，此刻它還是 undefined。改成攔 replace 這個
      // 屬性本身，不管何時被定義，讀到的都是我們的版本。
      let real;
      Object.defineProperty(v, "replace", {
        configurable: true,
        get() {
          return function (target) {
            const el =
              typeof target === "string"
                ? document.getElementById(target)
                : target;
            // django-ckeditor 把 textarea 藏起來等 CKEditor 接手。
            // 這裡不接手，就把它露出來讓 editor.js 直接用。
            if (el && el.style) el.style.display = "";
            return null;
          };
        },
        set(fn) {
          real = fn; // 吃掉 CKEditor 自己的賦值，留一條後路
          v.__ojOriginalReplace = fn;
        },
      });
    },
  });
})();
