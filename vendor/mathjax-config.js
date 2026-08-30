// MathJax 設定。必須在 tex-svg.js 之前載入，manifest 的 js 陣列保證這個順序。
window.MathJax = {
  tex: {
    inlineMath: [
      ["$", "$"],
      ["\\(", "\\)"],
    ],
    displayMath: [
      ["$$", "$$"],
      ["\\[", "\\]"],
    ],
  },
  // fontCache: 'none' 讓每個公式的 SVG 完整自包含。預設的 'local' 會把字型
  // 路徑抽到共用的 <defs> 再用 <use> 引用——那些 defs 不會跟著存進資料庫，
  // 公式到了前台就會變空白。
  svg: { fontCache: "none" },
  // 不要自動掃描整頁。OJ 頁面到處是錢號與程式碼，自動掃描會誤轉換。
  startup: { typeset: false },
  // 關掉給螢幕閱讀器用的 MathML 副本。它只靠 MathJax 的外部 CSS 隱藏，
  // 而前台沒有那份 CSS，Chrome 又原生支援 MathML，結果就是同一條公式
  // 被畫兩次（SVG 一次、MathML 一次）。
  options: { enableAssistiveMml: false },
};
