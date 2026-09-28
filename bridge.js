// 跑在 isolated world（預設），所以摸得到擴充功能 API——其餘 content script
// 都在 MAIN world，那裡沒有 chrome.* / browser.*。
//
// Firefox 用 browser.*（Promise 版），Chromium 用 chrome.*；Firefox 也提供
// chrome.* 別名，但這裡明確挑一個，讓跨瀏覽器的意圖寫在程式碼裡。
const api = globalThis.browser ?? globalThis.chrome;

// ── 1. 讓頁面能請求重載整個擴充功能 ──────────────────────────────
// 擴充功能管理頁是瀏覽器內部頁面，任何擴充功能都無法操作它，改完程式碼
// 一定要人工去點重新整理。這裡開一條路：頁面 postMessage → 這裡轉發 →
// background 呼叫 runtime.reload()。
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (!e.data || e.data.__ojHelperReload !== true) return;
  api.runtime.sendMessage({ type: "oj-helper-reload" });
});

// ── 2. 注入離線字體 ──────────────────────────────────────────────
// DESIGN.md 指定 IBM Plex Sans + JetBrains Mono 且禁用系統預設 sans，但
// OJ 可能斷外網，Google Fonts 用不得，所以字體打包在 vendor/fonts/。
//
// 為什麼不寫在 content_scripts 的 css 檔裡：那些 CSS 被注入成 user-origin
// stylesheet，裡面的相對 url() 解析不到 extension 的路徑，實測兩個
// @font-face 都是 status:"error" + NetworkError。這裡用 runtime.getURL()
// 產生絕對路徑，才抓得到檔案。
//
// 兩支都是 variable font，單檔涵蓋規範要的所有字重，latin 子集共 72KB。
// 中文沒有打包：Noto Sans TC 子集化後仍在 MB 等級，為字型細節塞這麼大
// 一包不划算，交給系統的 PingFang TC / Microsoft JhengHei。
const FONTS = [
  {
    family: "IBM Plex Sans",
    file: "ibm-plex-sans-latin.woff2",
    weight: "100 700",
  },
  {
    family: "JetBrains Mono",
    file: "jetbrains-mono-latin.woff2",
    weight: "400 800",
  },
];

(function injectFonts() {
  const face = (f, src) =>
    `@font-face{font-family:"${f.family}";` +
    `src:url("${src}") format("woff2");` +
    `font-weight:${f.weight};font-style:normal;font-display:swap;}`;

  const style = document.createElement("style");
  style.id = "oj-helper-fonts";
  style.textContent = FONTS.map((f) =>
    face(f, api.runtime.getURL("vendor/fonts/" + f.file)),
  ).join("");

  // document_start 時 <head> 可能還不存在，掛在 documentElement 一樣有效
  (document.head || document.documentElement).appendChild(style);

  // Firefox 的 moz-extension: 資源要過頁面 CSP 的 font-src 才載得進來，而 OJ
  // 之後隨時可能加上 CSP。載不到就把字體 inline 成 data: URL 重試——那是同一
  // 份 CSS 內的資料，不再經過 font-src。
  //
  // 先等 fonts.ready：document_start 時樣式表還沒處理完，這時問 document.fonts
  // 會說沒有這個 family，看起來就像載失敗。
  //
  // 再用 load() 而不是 check()：check() 對「宣告了但還沒被用到所以沒開始載」
  // 的字體也回 false，一樣會誤判。load() 會主動觸發載入，看 FontFace.status
  // 才分得出「還沒載」與「載失敗」。
  (async () => {
    try {
      await document.fonts.ready;

      const broken = (
        await Promise.all(
          FONTS.map(async (f) => {
            try {
              const faces = Array.from(
                await document.fonts.load(`16px "${f.family}"`),
              );
              const ok =
                faces.length > 0 && faces.every((x) => x.status === "loaded");
              return ok ? null : f;
            } catch (_) {
              return f; // NetworkError：被 CSP 擋下或檔案讀不到
            }
          }),
        )
      ).filter(Boolean);
      if (!broken.length) return;

      const inlined = await Promise.all(
        broken.map(async (f) => {
          const buf = await (
            await fetch(api.runtime.getURL("vendor/fonts/" + f.file))
          ).arrayBuffer();
          let bin = "";
          for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
          return face(f, `data:font/woff2;base64,${btoa(bin)}`);
        }),
      );

      const fallback = document.createElement("style");
      fallback.id = "oj-helper-fonts-inline";
      fallback.textContent = inlined.join("");
      (document.head || document.documentElement).appendChild(fallback);
      console.info(
        "[OJ Helper] 字體檔載不到（多半是頁面 CSP），已改用 inline：" +
          broken.map((f) => f.family).join("、"),
      );
    } catch (e) {
      // 字體只影響外觀，不值得讓 bridge.js 其他功能跟著掉
      console.warn("[OJ Helper] 字體 fallback 失敗，改用系統字體", e);
    }
  })();
})();
