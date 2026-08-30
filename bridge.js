// 跑在 isolated world（預設），所以摸得到 chrome API——其餘 content script
// 都在 MAIN world，那裡沒有 chrome.*。

// ── 1. 讓頁面能請求重載整個擴充功能 ──────────────────────────────
// chrome://extensions 是瀏覽器內部頁面，任何擴充功能都無法操作它，改完
// 程式碼一定要人工去點重新整理。這裡開一條路：頁面 postMessage → 這裡
// 轉發 → background 呼叫 chrome.runtime.reload()。
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (!e.data || e.data.__ojHelperReload !== true) return;
  chrome.runtime.sendMessage({ type: "oj-helper-reload" });
});

// ── 2. 注入離線字體 ──────────────────────────────────────────────
// DESIGN.md 指定 IBM Plex Sans + JetBrains Mono 且禁用系統預設 sans，但
// OJ 可能斷外網，Google Fonts 用不得，所以字體打包在 vendor/fonts/。
//
// 為什麼不寫在 content_scripts 的 css 檔裡：那些 CSS 被注入成 user-origin
// stylesheet，裡面的相對 url() 解析不到 extension 的路徑，實測兩個
// @font-face 都是 status:"error" + NetworkError。這裡用
// chrome.runtime.getURL() 產生絕對路徑，才抓得到檔案。
//
// 兩支都是 variable font，單檔涵蓋規範要的所有字重，latin 子集共 72KB。
// 中文沒有打包：Noto Sans TC 子集化後仍在 MB 等級，為字型細節塞這麼大
// 一包不划算，交給系統的 PingFang TC / Microsoft JhengHei。
(function injectFonts() {
  const face = (family, file, weight) =>
    `@font-face{font-family:"${family}";` +
    `src:url("${chrome.runtime.getURL("vendor/fonts/" + file)}") format("woff2");` +
    `font-weight:${weight};font-style:normal;font-display:swap;}`;

  const style = document.createElement("style");
  style.id = "oj-helper-fonts";
  style.textContent =
    face("IBM Plex Sans", "ibm-plex-sans-latin.woff2", "100 700") +
    face("JetBrains Mono", "jetbrains-mono-latin.woff2", "400 800");

  // document_start 時 <head> 可能還不存在，掛在 documentElement 一樣有效
  (document.head || document.documentElement).appendChild(style);
})();
