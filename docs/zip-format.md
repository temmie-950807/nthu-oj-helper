# NTHU OJ Helper 題目 zip 格式

這份文件說明 NTHU OJ Helper 擴充功能能匯入的單題 zip 格式。匯入有兩個入口：

- 題目編輯頁（`/problem/<pid>/edit/`）的「匯入 zip」：覆蓋這一題。
- 題目列表（`/problem/`）Add problem 旁的「匯入題目」：建一題新題目。

所有文字檔一律用 UTF-8。

## 目錄結構

```
problem.json        必要
description.md      選填，Description 欄位
input.md            選填，Input 欄位
output.md           選填，Output 欄位
sample/in.txt       選填，第 1 組 Sample Input
sample/out.txt      選填，第 1 組 Sample Output
sample/in-2.txt     選填，第 k 組 Sample（k = 2, 3, …）
sample/out-2.txt
testcases/001.in    選填，測資 .in / .out 成對
testcases/001.out
```

**`problem.json` 必須在 zip 的最上層。** 不要把整個資料夾壓進去，否則 zip 裡會多一層 `my-problem/`，匯入時會出現「zip 裡沒有 problem.json」的錯誤。zip 裡其他不認得的檔案都會被忽略。

## problem.json

```json
{
  "fields": {
    "pname": "A + B Problem",
    "judge_source": "LOCAL",
    "judge_type": "LOCAL_NORMAL",
    "judge_language": "CPP17",
    "other_judge_id": ""
  },
  "visible": false,
  "tags": ["math"],
  "testcases": [
    { "name": "001", "time_limit": "1", "memory_limit": "256" },
    { "name": "002", "time_limit": "2", "memory_limit": "256" }
  ]
}
```

| 欄位 | 型別 | 規則 |
|---|---|---|
| `fields.pname` | string | 題目名稱。從列表頁建新題時若沒填，會用 zip 檔名（去掉 `.zip`）。 |
| `fields.judge_source` | string | 只能是 `LOCAL` 或 `OTHER`。 |
| `fields.judge_type` | string | 只能是 `LOCAL_NORMAL`、`LOCAL_SPECIAL`、`LOCAL_PARTIAL`、`OTHER_UVA`、`OTHER_UVALive`、`OTHER_POJ` 其中之一。 |
| `fields.judge_language` | string | 只能是 `C`、`CPP`、`CPP11`、`CPP14`、`CPP17`、`JAVA`、`Python` 其中之一。大小寫要完全一致。 |
| `fields.other_judge_id` | string | 只有 `judge_source` 是 `OTHER` 時才有作用，其他情況給 `""` 或省略。 |
| `visible` | boolean | 是否公開。從列表頁建新題時會被忽略，新題一律是隱藏的。 |
| `tags` | string[] | 不會自動加上，匯入完成時會列出來，請使用者手動加。 |
| `testcases[].name` | string | 測資的主檔名。`"001"` 對應 `testcases/001.in` 和 `testcases/001.out`。 |
| `testcases[].time_limit` | string 或 number | 時間限制，單位是秒。 |
| `testcases[].memory_limit` | string 或 number | 記憶體限制，單位是 MB。 |

- `fields` 裡省略的欄位不會被修改。最小的合法內容是 `{"fields": {"pname": "..."}}`。
- 擴充功能匯出的檔案還會帶 `problem_id` 和 `fields.owner`，匯入時兩個都會被忽略。題號由 OJ 決定，owner 一律是匯入的人。

## 敘述（`description.md`、`input.md`、`output.md`）

這三個檔案是 Markdown 原稿，存檔時才會轉成 HTML。

- 單一換行就會換行（marked 的 `breaks: true`）。要分段就空一行。
- 支援 GFM 的表格、程式碼區塊和引用。也可以直接寫 HTML，內容會原樣保留。
- LaTeX 的寫法：行內公式用 `$...$` 或 `\(...\)`，獨立公式用 `$$...$$` 或 `\[...\]`。存檔時會轉成 SVG。
- 圖片必須用 data URI 內嵌，例如 `![](data:image/png;base64,...)`，不能用外部網址。單張圖不要超過 300KB。
- 編輯頁匯入時，缺少的檔案不會動到對應的欄位。從列表頁建新題時，缺少的欄位就是空的。

## Sample

- 內容會一字不差地顯示給學生，包括空行、行首和行尾的空白、tab，以及最後的換行。
- `sample/in.txt` 和 `sample/out.txt` 是第 1 組，也就是 OJ 原生的 Sample 欄位。缺少的話，不會動到原本的欄位。
- 第 2 組以後用 `sample/in-<k>.txt` 和 `sample/out-<k>.txt`，`k` 從 2 開始，用十進位整數，不補零。
  - 組別依數字大小排序，所以 `in-10` 會排在 `in-9` 後面。
  - 有 `in-k` 但沒有 `out-k` 時，那一組的 Output 是空的。只有 `out-k`、沒有 `in-k` 的檔案會被忽略。
  - zip 裡沒有任何 `in-k` 時，題目上原本的第 2 組以後會被清掉。

## 測資

- 每筆測資由兩個檔案組成：`testcases/<name>.in` 和 `testcases/<name>.out`。
- `.out` 必須是小寫副檔名。找不到對應 `.out` 的 `.in` 會被跳過。
- 上傳順序是依完整路徑做**字串排序**。名稱請補零到同樣長度（`001`、`002`…），否則 `10` 會排在 `2` 前面。
- 每筆測資的限制，依 `name` 到 `problem.json` 的 `testcases` 裡查。查不到時，預設是 1 秒、32 MB。
- 只要 zip 裡有任何一個 `.in`，就會**先刪光題目現有的所有測資**再上傳，無法復原。zip 裡完全沒有測資時，現有的測資不會被動到。

## 不支援的內容

- Special Judge 和 Partial Judge 的程式碼與標頭檔：這些是表單裡的上傳欄位，不在 zip 格式裡，要另外到編輯頁上傳。
- 標籤：只會在匯入完成時提醒，不會自動加上。
- 比賽搬移的 zip（`problems/001/...`，內含 `format: "nthuoj-contest/1"`）是另一種格式，不能當成單題 zip 匯入。

## 打包

在題目資料夾**裡面**執行：

```bash
cd my-problem
zip -r ../my-problem.zip problem.json *.md sample testcases
unzip -l ../my-problem.zip   # 第一層應該直接看到 problem.json
```

## 檢查腳本

交出 zip 之前可以先跑這個檢查。沒有任何輸出就代表通過。

```python
import json, re, sys, zipfile

z = zipfile.ZipFile(sys.argv[1])
names = set(z.namelist())
err = []
if "problem.json" not in names:
    err.append("problem.json 不在 zip 最上層")
else:
    meta = json.loads(z.read("problem.json").decode("utf-8"))
    f = meta.get("fields", {})
    allowed = {
        "judge_source": {"LOCAL", "OTHER"},
        "judge_type": {"LOCAL_NORMAL", "LOCAL_SPECIAL", "LOCAL_PARTIAL",
                       "OTHER_UVA", "OTHER_UVALive", "OTHER_POJ"},
        "judge_language": {"C", "CPP", "CPP11", "CPP14", "CPP17", "JAVA", "Python"},
    }
    for k, ok in allowed.items():
        if k in f and f[k] not in ok:
            err.append(f"fields.{k} = {f[k]!r} 不是合法值")
    ins = sorted(n[len("testcases/"):-3] for n in names
                 if re.fullmatch(r"testcases/.+\.in", n, re.I))
    for b in ins:
        if f"testcases/{b}.out" not in names:
            err.append(f"testcases/{b}.in 沒有對應的 .out，會被跳過")
    if len({len(b) for b in ins}) > 1:
        err.append("測資名稱長度不一，字串排序後順序會亂，請補零")
    limits = {t.get("name") for t in meta.get("testcases", [])}
    for b in ins:
        if b not in limits:
            err.append(f"測資 {b} 在 problem.json 沒有限制，會用預設 1 秒 / 32 MB")
for n in names:
    if n.endswith((".md", ".txt", ".json")):
        try:
            z.read(n).decode("utf-8")
        except UnicodeDecodeError:
            err.append(f"{n} 不是 UTF-8")
if err:
    print("\n".join(err))
sys.exit(1 if err else 0)
```

用法：`python3 check_zip.py my-problem.zip`
