// 開發用：讓頁面能請求重載整個擴充功能。
//
// chrome://extensions 是瀏覽器內部頁面，任何擴充功能（含自動化工具）都無法
// 操作它，所以改完程式碼一定要人工去點重新整理。這裡開一條路：頁面發訊息 →
// bridge.js（isolated world，摸得到 chrome API）轉發 → 這裡呼叫 reload。
//
// 只重載自己，沒有其他權限，且 bridge.js 僅注入 OJ 網域。
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "oj-helper-reload") {
    chrome.runtime.reload();
  }
});
