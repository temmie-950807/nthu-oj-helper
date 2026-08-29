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

### 3. 批量上傳測資（`/problem/<pid>/edit/?tab=testcase`）

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

## 技術細節

單一 content script，沒有 background service worker、沒有 popup、不要求任何權限。

`manifest.json` 有兩個設定是關鍵，改動前先看懂：

- **`"world": "MAIN"`** — 讓腳本跑在網頁自己的 JavaScript 環境裡，而不是擴充功能預設的隔離環境。清空舊測資那段需要暫時覆寫 `window.confirm` 來跳過每一筆的確認框，在隔離環境下這個覆寫碰不到網頁自己的程式碼，會變成每刪一筆就跳一次對話框。
- **`"run_at": "document_end"`** — 腳本主體包在 `window.addEventListener("load", ...)` 裡。預設的 `document_idle` 有機會在 `load` 事件**之後**才注入，那樣 listener 永遠不會被呼叫，整個擴充功能會靜默失效。`document_end` 保證在 `load` 之前注入。
