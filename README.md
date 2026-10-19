# NTHU OJ Helper

給 [NTHU Online Judge](https://acm.cs.nthu.edu.tw/) 用的 Chrome 擴充功能，把出題與刷題最煩的三件事自動化。

不需要 Tampermonkey，裝了就能用。

---

## 功能

擴充功能會依照你在哪個頁面，自動啟動對應的功能。

### 1. 批量提交程式碼（`/users/submit/`）

右下角會出現一個粉紅色控制面板。

- **拖曳或多選上傳**：一次丟進整個資料夾的解答，腳本會逐一提交，每筆間隔 1.5 秒避免被伺服器擋。
- **語言自動判斷**：預設依副檔名決定編譯語言，`.cpp`/`.cc`/`.cxx` → C++17、`.c` → C、`.java` → Java、`.py` → Python。
- **強制指定語言**：也可以從下拉選單直接指定，讓全部檔案都用同一種語言提交（例如想確認某份 code 在 C++11 下會不會 CE）。
- **面板可自由縮放**：面板**左上角**有一個粉紅色小三角，抓住它往左上拖就變大、往右下拖就變小。調整後的尺寸會記住，下次開頁面直接沿用。
- 提交完自動導向 Status 頁。

### 2. Status 頁增強（`/status/`）

- **SID 換成檔名**：原本第一欄是一串看不懂的提交編號，會換成你當初上傳的**本地檔案名稱**，超連結照樣能點進去看原始碼。找蟲時不用再猜哪筆是哪份。
- **測資彩色方塊**：把原本擠成一團的 tooltip 清單換成一排方塊，滑鼠移上去看詳細 CPU 時間。

  | 方塊 | 意思 |
  |---|---|
  | ✔ 綠 | Accepted |
  | ✘ 紅 | Wrong Answer |
  | ❗ 橘 | Runtime Error |
  | 🕒 藍 | Time Limit Exceeded |
  | ❔ 紫 | CE / JE / RF 等其他狀態 |

### 3. Markdown + LaTeX 出題（`/problem/<pid>/edit/`）

OJ 原本用 CKEditor 編輯 HTML。這個功能把 Description / Input / Output 三個欄位換成 Markdown：**左邊寫、右邊即時預覽**，上面有工具列（粗體、標題、清單、連結、圖片、表格、程式碼、公式）。

- **寫 LaTeX**：行內用 `$x^2$`，獨立公式用 `$$...$$`。
- **插入圖片**：點 🖼 選檔案，會自動縮到最長邊 900px 再直接編碼進題目裡。
- **原稿會留著**：下次再進編輯頁，你寫的 Markdown 會原封不動回來，不是一坨 HTML。
- **舊題目不會壞**：既有的 HTML 題目照常顯示，可以繼續編輯。

#### 為什麼公式存的是圖片

前台沒有載入 MathJax。公式如果以 `$x^2$` 原樣存進資料庫，學生只會看到一堆錢號。所以按下儲存的當下就會把公式轉成 SVG 存進去，這樣不管前台有沒有數學套件都顯示得出來。

同理，表格、程式碼區塊、引用的樣式都是寫成 inline style 存進去的，不依賴前台有沒有對應的 CSS。

#### 圖片為什麼不能貼網址

OJ 未來可能會斷外網，貼外部圖床的連結那天會全部變破圖。所以圖片一律編碼進題目本體。代價是欄位會變大——單張圖超過 300KB 時會跳出提醒，建議先把圖裁小。

#### 多組 Sample

OJ 原生只有一組 Sample Input / Output，那就是第 1 組；第 2 組以後在編輯頁另外加。額外組沒有自己的欄位，是存在 **Output 欄位尾端**。題目頁會把第 1..n 組照原生樣式畫在原本 Sample 的位置，並把原生那塊藏起來。

⚠️ 如果有人**沒裝擴充功能**、直接用原生 CKEditor 編輯並存檔，額外組會壞掉。

### 4. 題目 zip 匯入匯出（`/problem/<pid>/edit/`）

編輯頁最上方有一列 **📦 題目搬移**，兩顆按鈕。整題打包成一個 zip，搬到另一台 OJ 或另一個題號。

zip 裡長這樣，都是純文字，可以直接用編輯器改：

```
problem.json      題目名稱、擁有者、judge 設定、標籤、每筆測資的時間/記憶體限制
description.md    Markdown 原稿（不是 HTML）
input.md
output.md
sample/in.txt     第 1 組 Sample（原生欄位）
sample/out.txt
sample/in-2.txt   第 2 組以後，依數字排序；缺 out 視為空的
sample/out-2.txt
testcases/001.in
testcases/001.out
testcases/002.in
...
```

**匯出**：抓齊所有欄位、下載每一筆測資，打包後直接下載。

**匯入**：選 zip → 跳出確認框告訴你會套用什麼、會刪掉幾筆測資 → 確認後自動填好文字欄位、重傳測資，最後自動按 Save。

⚠️ **匯入會先刪光現有測資**，不可逆。確認框裡會寫清楚數量，看一眼再按。

標籤不會自動套用（OJ 的標籤是另一套 API），匯入完成的訊息會列出來讓你手動加。

**直接建新題**：題目列表（`/problem/`）的 Add problem 旁邊有一顆 **匯入題目**，選 zip 後會自動建一題新題目、跳到它的編輯頁並把整包匯入，不必先手動建題。新題一律先設為隱藏（不照 zip 裡的 visible），檢查完再自己打開。

### 5. 批量上傳測資（`/problem/<pid>/edit/?tab=testcase`）

TestCase 分頁最上方會出現一個粉紅虛線拖曳區。

- **自動配對**：把所有 `.in` 和 `.out` 一起拖進去，主檔名相同的會自動配成一組（`1.in` ↔ `1.out`）。沒有成對的檔案會被忽略。
- **自動清空舊測資**：上傳前會先幫你把現有測資全部刪掉，不用一個一個點。
- **自然排序**：`2.in` 會排在 `10.in` 前面，不會變成字串排序的 `10, 2`。

---

## 安裝

因為沒有上架 Chrome Web Store，要用開發者模式手動載入。

```bash
git clone https://github.com/temmie-950807/nthu-oj-helper.git
```

然後：

1. 開 `chrome://extensions`
2. 右上角打開 **開發人員模式 / Developer mode**
3. 點 **載入未封裝項目 / Load unpacked**，選剛才 clone 下來的 `nthu-oj-helper` 資料夾

進入 NTHU OJ 任一頁面就會生效。Edge、Brave、Arc 這些 Chromium 瀏覽器步驟一樣。

### 更新

```bash
git pull
```

然後回 `chrome://extensions` 點這個擴充功能的重新整理圖示，再重整 OJ 頁面。

---

## 注意事項

- **上傳測資會先刪光舊的，且不可逆。** 拖檔前先確認你拖的是完整的一套測資。
- **上傳測資前記得先填好 Time Limit 與 Memory Limit**，腳本會沿用 TestCase 分頁下方那兩個欄位的值套用到所有新測資。沒填的話預設是 1 秒 / 32 MB。
- **上傳過程不要重新整理或關頁面**，會中斷。
- **檔名對應是存在瀏覽器本機的**（`localStorage`）。換瀏覽器、清快取、或從別台電腦提交，Status 頁就會顯示回原本的 SID。這是設計上的限制，不是壞掉。
- **只在 `140.114.86.166` 和 `acm.cs.nthu.edu.tw` 兩個網域運作**，不會碰你其他的網頁。

### 如果刪除舊測資時一直跳出確認對話框

代表 `manifest.json` 裡的 `"world": "MAIN"` 沒生效。這個設定需要 **Chrome 111 以上**，確認一下瀏覽器版本。

---

## 發佈

`.github/workflows/release.yml`：打 tag 就自動打包，附在 GitHub Release 上。

```bash
# 先確認 manifest.json 的 version 跟要打的 tag 一致，對不起來 workflow 會擋下來
git checkout firefox && git merge master && git push   # Firefox 版要先跟上
git checkout master
git tag v8.7 && git push origin v8.7
```

產出兩個檔案：

| 檔案 | 來源 | 怎麼裝 |
|---|---|---|
| `nthu-oj-helper-<版本>-chrome.zip` | tag 指到的 commit | 解壓縮後 `chrome://extensions` 載入未封裝項目 |
| `nthu-oj-helper-<版本>-firefox.xpi` | `firefox` 分支 | `about:addons` 齒輪 →「從檔案安裝附加元件」，常駐安裝 |

`.xpi` 會送 AMO 走 unlisted 管道簽章（不公開上架，只跑自動審查），拿回來的
檔案可以正常安裝、重開 Firefox 也還在。需要兩個 repo secret：

| Secret | 內容 |
|---|---|
| `AMO_JWT_ISSUER` | [AMO API 金鑰頁](https://addons.mozilla.org/developers/addon/api/key/) 的 JWT issuer |
| `AMO_JWT_SECRET` | 同一頁的 JWT secret |

```bash
gh secret set AMO_JWT_ISSUER
gh secret set AMO_JWT_SECRET
```

沒設這兩個 secret 時 workflow 會照舊發未簽章的 `.xpi`（只能當臨時附加元件），
並在 log 留警告；有設卻簽失敗則整個 Release 不發。AMO 不接受同一個 version
上傳兩次，簽章成功後若要重發，得升版號重打 tag。

workflow 會擋下兩種容易發生又難察覺的錯：tag 不在 `master` 上，或 `firefox`
分支還沒合併這個 tag（那樣發出去的 `.xpi` 會比 zip 舊一截）。

## 技術細節

單一 content script，沒有 background service worker、沒有 popup、不要求任何權限。

`manifest.json` 有兩個設定是關鍵，改動前先看懂：

- **`"world": "MAIN"`** — 讓腳本跑在網頁自己的 JavaScript 環境裡，而不是擴充功能預設的隔離環境。清空舊測資那段需要暫時覆寫 `window.confirm` 來跳過每一筆的確認框，在隔離環境下這個覆寫碰不到網頁自己的程式碼，會變成每刪一筆就跳一次對話框。
- **`"run_at": "document_end"`** — 腳本主體包在 `window.addEventListener("load", ...)` 裡。預設的 `document_idle` 有機會在 `load` 事件**之後**才注入，那樣 listener 永遠不會被呼叫，整個擴充功能會靜默失效。`document_end` 保證在 `load` 之前注入。
