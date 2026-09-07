// run_at: document_start — 必須趕在 base.js 註冊 timer 之前執行。
//
// base.js 有這段：
//     setTimeout(function() { location.reload(); }, 60*60*1000);
// 編輯題目編到一半會被無預警重新載入，未存的內容全部消失。
//
// location.reload 本身不可覆寫（Location 是受保護物件），所以改成攔在
// setTimeout：只擋「延遲超過 50 分鐘、而且函式體真的呼叫 reload」的那一個，
// 其餘 timer（時鐘、popup 等）照常。
(function () {
  "use strict";
  const origSetTimeout = window.setTimeout;
  window.setTimeout = function (fn, delay) {
    if (
      typeof delay === "number" &&
      delay >= 3000000 &&
      /location\s*\.\s*reload/.test(String(fn))
    ) {
      console.info("[OJ Helper] 已攔截每小時自動重整，避免吃掉未存的編輯");
      return 0;
    }
    return origSetTimeout.apply(this, arguments);
  };
})();

// 決定亮暗主題。必須在 document_start 就寫進 html 屬性，否則 CSS 生效時
// 主題還沒定，畫面會先閃一次淺色再跳深色。
// 使用者手動選過就用選的，沒選過才跟隨系統。
(function () {
  "use strict";
  let pref = null;
  try {
    pref = localStorage.getItem("oj_theme");
  } catch (_) {
    /* 某些情況下 localStorage 不可用，跟隨系統即可 */
  }
  const dark =
    pref === "dark" ||
    (pref !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.ojTheme = dark ? "dark" : "light";
})();

// 蓋掉重建前的舊版面。
//
// 版面重建要等 load 事件（實測 ~1.6s，主要是 OJ 自己的資源）。在那之前
// 使用者會先看到原本的 Bootstrap 頁面，然後畫面整個跳掉——閃爍比等待更
// 讓人不安。這裡先把內容區藏起來，換上一行提示，ui.js 建好版面就掀開。
//
// 一定要有 fallback：ui.js 若因結構不符而 bail，內容不能永遠不出現。
(function () {
  "use strict";
  if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;

  const style = document.createElement("style");
  style.id = "oj-boot-veil";
  style.textContent =
    "body > .container { visibility: hidden; }" +
    "body::before { content: '載入編輯器…'; position: fixed; top: 45%; left: 0; right: 0;" +
    "text-align: center; font: 14px/1.5 system-ui, sans-serif; color: #6b6664; z-index: 1; }";
  (document.head || document.documentElement).appendChild(style);

  const lift = () => style.remove();
  window.__ojLiftVeil = lift; // ui.js 建好版面後呼叫
  setTimeout(lift, 4000); // 保險：ui.js 沒跑成功也要讓頁面能用
})();

// 阻止 CKEditor 啟動。
//
// editor.js 反正會把三個實例全部 destroy 換成 Markdown 編輯器，但在那之前
// 必須等它們 instanceReady——實測 CKEditor 的資源要到 1100ms 才載完，
// load 事件 1167ms，使用者這段時間都盯著原本的 Bootstrap 版面。
//
// 直接讓 CKEDITOR.replace 不建立編輯器：沒有實例要等，也沒有 iframe 會在
// 搬 DOM 時炸掉，版面可以在 DOM 一就緒就重建。
// 攔截失敗也不會壞事——editor.js 本來就有「沒有 CKEditor 實例」的分支。
(function () {
  "use strict";
  if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;

  let ck;
  Object.defineProperty(window, "CKEDITOR", {
    configurable: true,
    get() {
      return ck;
    },
    set(v) {
      ck = v;
      if (!v || typeof v !== "object" || v.__ojPatched) return;
      v.__ojPatched = true;

      // 不能在這裡檢查 v.replace：CKEditor 是先把物件賦給 window.CKEDITOR、
      // 之後才掛上 replace 方法，此刻它還是 undefined。改成攔 replace 這個
      // 屬性本身，不管何時被定義，讀到的都是我們的版本。
      let real;
      Object.defineProperty(v, "replace", {
        configurable: true,
        get() {
          return function (target) {
            const el =
              typeof target === "string"
                ? document.getElementById(target)
                : target;
            // django-ckeditor 把 textarea 藏起來等 CKEditor 接手。
            // 這裡不接手，就把它露出來讓 editor.js 直接用。
            if (el && el.style) el.style.display = "";
            return null;
          };
        },
        set(fn) {
          real = fn; // 吃掉 CKEditor 自己的賦值，留一條後路
          v.__ojOriginalReplace = fn;
        },
      });
    },
  });
})();

// 把 multi-select 的 O(n²) 建構補成 O(n)。
//
// /contest/new/ 的 <select id="id_problem"> 有 5654 個 option（ContestForm
// 對 admin 不限制 queryset，等於全站題目）。jquery.multi-select 每生一個 li
// 就把整個 ul 的 children 掃成 jQuery 集合三次：一次問 .length、兩次
// .eq(index-1) 找插入點，合計約 4800 萬次節點走訪。實測光是建構就 5185ms，
// 整頁要 8 秒才能動。兩個 ul 在建構期間是 detached 的，所以這筆錢純粹是
// JS，不是 layout。
//
// 時機：DOMContentLoaded 的 listener 按註冊順序跑，而 jQuery 2.2.4 的 ready
// 回呼是同步跑在「它自己註冊的」DCL listener 裡。guard.js 在 document_start
// 註冊，比 <head> 裡的 jquery.min.js 早，所以這裡必然排在 editContest.js 的
// $(function(){…}) 前面，而那時三支 script 都已經同步執行完，要補的東西都在。
// 這裡不需要像上面攔 CKEditor 那樣玩屬性 getter——那個坑是因為 CKEditor 在
// DCL 之前就被用掉了，multiSelect 不是。
// document_end 的 content script 反而太晚：Chrome 是等 DOMContentLoaded
// 全部派送完才注入的（site.js 開頭那個 readyState 分支就是為了這件事）。
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const $ = window.jQuery;
    // 用 insertAt 存不存在當守衛，比比對網址可靠：它是 multi-select 獨家
    // 定義、獨家使用的函式，OJ 改網址不會讓補丁失效，沒載入函式庫的頁面
    // 也絕不會被碰到。
    if (!$ || !$.fn || typeof $.fn.insertAt !== "function") return;
    const MS = $.fn.multiSelect && $.fn.multiSelect.Constructor;
    if (!MS || !MS.prototype) return;

    // ── 補丁一：insertAt 改用原生 DOM ──────────────────────────────
    // parent.children 是 live HTMLCollection，取索引與長度都是 O(1)，不必
    // 為了找第 i 個小孩把整串 sibling 收集成 jQuery 集合。
    //
    // 語意刻意跟原版逐字對齊，不「順手修好」任何東西：
    //   - index 0 用 insertBefore(firstChild)，那就是 jQuery .prepend() 的
    //     實作，text node 的位置差異因此不存在。
    //   - index 超出範圍時原版是 .eq(i-1) 落空 → .after() 什麼都不做，元素
    //     默默消失；這裡照樣什麼都不做。改成 append 看起來比較「對」，但那
    //     是行為變更，而唯一會走到那裡的 addOption 這個頁面根本沒用到。
    //   - $parent 不是單一元素時退回原函式：0 個時原版是 no-op，多個時原版
    //     會複製節點，這兩種語意不值得重寫。這個檢查同時消掉快速路徑裡唯一
    //     會拋例外的可能——真的拋在 jQuery ready 裡，editContest.js 後面的
    //     widen_multiselect() 就不會跑了。
    const origInsertAt = $.fn.insertAt;
    $.fn.insertAt = function (index, $parent) {
      const parent =
        $parent && $parent.length === 1 && $parent[0].nodeType === 1
          ? $parent[0]
          : null;
      if (!parent) return origInsertAt.apply(this, arguments);

      return this.each(function () {
        // 每輪重算：一次插入多個元素時原版也是每輪重新定位，結果是反序堆在
        // 同一個位置，這裡照抄。
        if (index === 0) return parent.insertBefore(this, parent.firstChild);
        const ref = parent.children[index - 1];
        if (ref) parent.insertBefore(this, ref.nextSibling);
      });
    };

    // ── 補丁二：初始化時主動把 index 餵進去 ────────────────────────
    // 原函式沒收到 index 時會自己算 that.$selectableUl.children().length。
    // 我們給的是同一個數字——jQuery .children() 與原生 .children 都只數元素
    // 節點——差別只在 O(1) 對 O(n)。所以非 optgroup 分支的行為位元級相同。
    //
    // 有 optgroup 的分支索引是相對於群組內那個 ul、而且要 +1，語意不同，
    // 留給原函式自己算（Django 的 ModelMultipleChoiceField 直出 option，
    // 這個頁面沒有 optgroup）。
    const origGen = MS.prototype.generateLisFromOption;

    // 這個包裝唯一的假設就是「原函式在 index 未給時會去數 $selectableUl 的
    // children」。直接驗這句話還在不在：OJ 哪天換版本或換掉整個函式庫，
    // 檢查落空，補丁靜靜不生效，頁面回到原本（慢但正確）的行為。
    // 驗假設本身比驗版本號或 arity 精準——arity 一樣但語意變了才危險。
    if (!/\$selectableUl\.children\(\)\.length/.test(String(origGen))) {
      console.info("[OJ Helper] multi-select 版本不符，略過 O(n) 補丁");
      return;
    }

    MS.prototype.generateLisFromOption = function (option, index, $container) {
      if (
        index === undefined &&
        option.parentNode &&
        option.parentNode.nodeName !== "OPTGROUP" &&
        this.$selectableUl &&
        this.$selectableUl[0]
      ) {
        index = this.$selectableUl[0].children.length;
      }
      return origGen.call(this, option, index, $container);
    };

    console.info("[OJ Helper] 已把 multi-select 的 O(n²) 建構補成 O(n)");
  });
})();

// 只先載入最新 25 題，其餘靠搜尋補進來。
//
// 上面那個補丁把插入邏輯壓成 O(n) 之後，/contest/new/ 還是要 7.4 秒——
// 因為剩下的成本是「建 11530 個 li」本身，每個 li 都要走約 20 次 jQuery
// 操作，那是函式庫的地板，補不動。實測同一條路徑：25 題 23ms、100 題 8ms、
// 500 題 38ms、5654 題 2197ms（掛在文件裡量的）。唯一的出路是別建那麼多。
//
// 注意 342KB 的 HTML 還是會下載、還是會解析（那要改後端才省得掉），所以
// 這裡的天花板是 TTFB 0.86s + 解析 1.4s ≈ 2.3 秒。
(function () {
  "use strict";

  const KEEP = 25; // 一開始載入幾題（照題號由大到小）
  const MAX_MATCH = 100; // 每次搜尋最多補進來幾筆
  const THRESHOLD = 200; // 少於這個數量不值得動手
  const FULL_FLAG = "oj_ms_full"; // 使用者要求載入全部，或接管失敗時的退路

  document.addEventListener("DOMContentLoaded", function () {
    const $ = window.jQuery;
    if (!$ || !$.fn || typeof $.fn.multiSelect !== "function") return;
    const sel = document.getElementById("id_problem");
    if (!sel || sel.options.length <= THRESHOLD) return;

    let full = false;
    try {
      full = sessionStorage.getItem(FULL_FLAG) === "1";
      sessionStorage.removeItem(FULL_FLAG); // 只生效這一次
    } catch (_) {
      /* 用不了 sessionStorage 就當作沒要求過 */
    }
    if (full) return;

    // 全部題目先抄一份，接著只留「最新 KEEP 題」與「已經選起來的」。
    // 已選的一定要留：/contest/edit/ 是靠 <option selected> 表示這場比賽
    // 現有的題目，拔掉的話一存檔就把整場比賽清空了。
    const all = [...sel.options].map((o) => ({
      value: o.value,
      text: o.text,
      selected: o.selected,
    }));
    const keep = new Set(all.filter((o) => o.selected).map((o) => o.value));
    all
      .slice()
      // 不能直接取 DOM 的後 25 個：Django 的 queryset 沒指定 ordering，
      // 實際順序不是嚴格遞增（尾端是 14989, 14980, 14990）。
      .sort((a, b) => Number(b.value) - Number(a.value))
      .slice(0, KEEP)
      .forEach((o) => keep.add(o.value));

    const loaded = new Set();
    [...sel.options].forEach((o) => {
      if (keep.has(o.value)) loaded.add(o.value);
      else o.remove();
    });

    // multiSelect 要等 editContest.js 的 ready 才跑，而這裡比它早。
    // setTimeout 0 會排在整輪 DOMContentLoaded 派送之後，那時 widget 與
    // quicksearch 都建好了。
    setTimeout(function () {
      const inst = $(sel).data("multiselect");
      const box = document.getElementById("ms-id_problem");
      const input = box && box.querySelector(".ms-selectable .search-input");
      const footer = box && box.querySelector(".ms-selectable .all-header");

      // 接不上就把題目還回去。已經拔掉 5629 個 option 又沒有搜尋可以補，
      // 使用者會找不到題目——寧可慢七秒也不能讓比賽建不出來。
      if (!inst || !input) {
        console.error("[OJ Helper] 接不上題目搜尋框，改為載入全部題目");
        try {
          sessionStorage.setItem(FULL_FLAG, "1");
        } catch (_) {
          /* 存不了就只能讓使用者自己重整 */
        }
        return location.reload();
      }

      const esc = (s) =>
        String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

      // 狀態文字放在自己的 span 裡。直接寫 footer.textContent 會把旁邊那顆
      // 「載入全部」一起清掉——每搜尋一次就清一次。
      let statusEl = null;
      if (footer) {
        footer.textContent = "";
        statusEl = document.createElement("span");
        footer.appendChild(statusEl);
      }
      const paint = (extra) => {
        if (!statusEl) return;
        statusEl.textContent =
          `已載入 ${loaded.size} / ${all.length} 題` +
          (extra ? " · " + extra : " · 打字搜尋其餘題目");
      };

      const fill = (q) => {
        const needle = q.trim().toLowerCase();
        if (!needle) return { added: 0, more: 0 };
        let added = 0;
        let more = 0;
        for (const o of all) {
          if (loaded.has(o.value)) continue;
          if (o.text.toLowerCase().indexOf(needle) === -1) continue;
          if (added >= MAX_MATCH) {
            more++;
            continue;
          }
          // addOption 是函式庫自己的 API，會同時補 <option> 與兩個 li，
          // 不必自己重現它的 id / data 規則。text 要先跳脫——addOption 是
          // 直接把它串進 HTML 字串的。
          inst.addOption({ value: o.value, text: esc(o.text) });
          loaded.add(o.value);
          added++;
        }
        return { added, more };
      };

      let timer;
      input.addEventListener("input", function () {
        clearTimeout(timer);
        const q = input.value;
        timer = setTimeout(function () {
          const r = fill(q);
          // cache() 會重建索引並重跑目前的關鍵字，新加的 li 才會參與過濾
          if (r.added && inst.qs1) inst.qs1.cache();
          paint(r.more ? `還有 ${r.more} 筆符合，請再打精確一點` : "");
        }, 120);
      });

      // 逃生口：想整份瀏覽就重整一次，那一輪跳過裁切（會花七秒，但是自願的）
      if (footer) {
        const link = document.createElement("button");
        link.type = "button";
        link.textContent = "載入全部";
        link.style.cssText =
          "margin-left:6px;padding:0;border:none;background:none;" +
          "color:var(--accent);font:inherit;text-decoration:underline;cursor:pointer;";
        link.addEventListener("click", function () {
          try {
            sessionStorage.setItem(FULL_FLAG, "1");
          } catch (_) {
            /* 存不了就只好維持現狀 */
          }
          location.reload();
        });
        footer.appendChild(link); // 放進那條狀態列裡，不要浮在框外
      }

      paint();
      console.info(
        `[OJ Helper] 題目清單改為延遲載入，先給最新 ${loaded.size} 題`,
      );
    }, 0);
  });
})();
