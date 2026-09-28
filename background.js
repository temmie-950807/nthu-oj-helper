// 開發用：讓頁面能請求重載整個擴充功能。
//
// 瀏覽器的擴充功能管理頁（chrome://extensions、about:debugging）是內部頁面，
// 任何擴充功能（含自動化工具）都無法操作它，所以改完程式碼一定要人工去點
// 重新整理。這裡開一條路：頁面發訊息 → bridge.js（isolated world，摸得到
// 擴充功能 API）轉發 → 這裡呼叫 reload。
//
// 只重載自己，沒有其他權限，且 bridge.js 僅注入 OJ 網域。
//
// Firefox 的 MV3 背景頁是 event page（manifest 的 background.scripts），
// 不是 service worker，但 listener 一樣要在頂層註冊才會被喚醒。
const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "oj-helper-reload") {
    api.runtime.reload();
  }
});
