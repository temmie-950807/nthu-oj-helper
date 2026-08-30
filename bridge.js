// 跑在 isolated world（預設），所以摸得到 chrome API——其餘 content script
// 都在 MAIN world，那裡沒有 chrome.*。這支唯一的工作是把頁面的重載請求
// 轉給 background service worker。
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (!e.data || e.data.__ojHelperReload !== true) return;
  chrome.runtime.sendMessage({ type: "oj-helper-reload" });
});
