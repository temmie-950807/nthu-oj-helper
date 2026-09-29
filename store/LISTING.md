# 商店上架資料（Chrome Web Store / Firefox AMO）

兩邊商店表單要填的東西集中放這裡，送審時直接複製貼上。
圖示用 `store/icon-128.png`（Chrome 列表頁）與 `store/icon-512.png`（AMO）。

---

## 名稱

NTHU OJ Helper

## 摘要（Chrome 132 字元上限 / AMO 250 字元上限）

NTHU OJ 出題與刷題輔助：全站介面改造、Markdown + LaTeX 出題、題目 zip 匯入匯出、批量提交、Status 頁增強。

## 分類

- Chrome Web Store：辦公室應用程式（Workflow & Planning）
- AMO：Other

## 語言

正體中文（zh-TW）

---

## 詳細說明

NTHU OJ Helper 是給清大 ACM Online Judge 使用者的瀏覽器擴充功能，改善出題與
解題兩邊的流程。只在 OJ 網域上運作，不會碰其他網站。

**出題**

- 題目敘述改用 Markdown 撰寫，支援 LaTeX 數學式（MathJax 排版）
- 編輯區換成 CodeMirror，取代原本的 CKEditor
- 題目可以打包成 zip 匯出，也能從 zip 匯入，含測資與敘述
- 測資批量上傳，自動套用頁面上設定的 Time Limit 與 Memory Limit
- 整場比賽（含所有題目與測資）可以匯出再到另一台 OJ 匯入

**解題**

- 全站介面重新設計，含深色模式
- Sample 輸入輸出並排顯示
- Status 頁顯示原始檔名而非流水號 SID
- 批量提交多個檔案

**隱私**

不蒐集任何資料，不對外連線。所有設定與檔名對應都存在瀏覽器本機
（localStorage），不會離開你的電腦。

---

## 單一用途說明（Chrome Web Store 必填）

本擴充功能的單一用途是改善清大 ACM Online Judge（acm.cs.nthu.edu.tw）的
出題與解題介面。所有功能都圍繞這個目的，且只在該 OJ 的網域上執行。

## 權限理由（Chrome Web Store 必填）

本擴充功能**沒有宣告任何 `permissions`**，僅透過 `content_scripts` 的
`matches` 取得兩個 OJ 網域的存取權：

- `acm.cs.nthu.edu.tw` — 清大 ACM Online Judge 正式站
- `140.114.86.166` — 同單位的另一台 OJ 機器，供課程使用

需要存取這兩個網域，是因為本擴充功能的全部功能都是對 OJ 頁面本身做改造
（重繪介面、替換編輯器、讀寫題目與測資）。沒有這個存取權就沒有任何功能。

不需要 `host_permissions`、`storage`、`tabs`、`downloads` 等權限：資料存取
一律走頁面自身的 `localStorage` 與同源 `fetch`。

## 資料使用聲明（Chrome Web Store 必填）

全部勾「否」：

- 不蒐集個人識別資訊
- 不蒐集健康資訊、財務資訊、身分驗證資訊
- 不蒐集個人通訊內容、位置、網頁瀏覽活動、使用者活動
- 不販售或轉移資料給第三方
- 不將資料用於與單一用途無關的目的
- 不將資料用於判斷信用狀況或放貸

需勾選的三項聲明（皆符合）：

- 不販售或轉移使用者資料給第三方（法定例外除外）
- 不將使用者資料用於與項目單一用途無關的用途
- 不將使用者資料用於判斷信用狀況或放貸

---

## AMO 審核備註（送審時填在 "Notes to Reviewer"）

本擴充功能不蒐集資料、不連外、不載入遠端程式碼，只在兩個 OJ 網域上運作。

`vendor/` 內為第三方函式庫，皆為上游發佈的檔案，未經修改：

| 檔案 | 專案 | 版本 | 授權 |
|------|------|------|------|
| `vendor/marked.min.js` | marked | 12.0.2 | MIT |
| `vendor/fflate.min.js` | fflate | 見檔頭 | MIT |
| `vendor/tex-svg.js` | MathJax 3 | 見檔頭 | Apache-2.0 |
| `vendor/codemirror.js` | CodeMirror 6 | 自行打包 | MIT |

`vendor/codemirror.js` 是從 CodeMirror 6 的官方 npm 套件打包出來的 bundle
（全域變數 `CM6`），不是上游直接發佈的檔案。

> ⚠️ **送 AMO 前必須補上這段。** AMO 對「非上游原版的壓縮/打包程式碼」強制
> 要求附上原始碼與可重現的建置指令，否則會被退件。這個 repo 裡沒有任何
> 建置設定（沒有 package.json、沒有 bundler 設定），所以必須補齊：
>
> 1. 建立 `build/` 目錄，放進當初打包用的 `package.json`（含
>    `@codemirror/*` 各套件的**確切版本**）與 bundler 設定
> 2. 在下方寫出從乾淨環境重現的完整指令，例如：
>    `npm ci && npx esbuild src/editor-bundle.js --bundle --format=iife
>    --global-name=CM6 --minify --outfile=vendor/codemirror.js`
> 3. 註明 Node 版本與作業系統
> 4. 送審時把含 `build/` 的原始碼壓縮檔上傳到 AMO 的 source code 欄位
>
> 其餘三個檔案（marked、fflate、MathJax）是上游原版 dist，通常不需要
> 額外附原始碼，但審核員仍可能詢問，上表的版本與授權就是給這個用的。

`background.js` 只做一件事：接收 `oj-helper-reload` 訊息後呼叫
`chrome.runtime.reload()`，這是開發期間手動重載擴充功能用的通道，
沒有其他權限，也不對外通訊。
