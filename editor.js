(function () {
  "use strict";

  const FIELDS = ["id_description", "id_input", "id_output"];
  // 原稿用 base64 藏在 HTML 註解裡。直接塞原文的話，內容只要出現 "-->"
  // 就會把註解提早關掉，後面的原稿變成可見文字。
  const TAG_OPEN = "<!--md:";
  const TAG_CLOSE = "-->";
  // 私有使用區字元，內容幾乎不可能出現，拿來當數學區塊的佔位符。
  const MARK = "";

  const b64e = (s) =>
    btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
  const b64d = (s) =>
    new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

  // 從存過的內容裡取回原稿；沒有就回傳 null（代表這是還沒用過本工具的舊題目）。
  // 會一路往內剝：先前的版本在轉換失敗時會把「已轉換的整份內容」再當成原稿
  // 包一層，剝到底才能救回真正的原始 Markdown。
  function extractMarkdown(stored) {
    let cur = stored;
    let found = null;
    for (let depth = 0; depth < 10 && cur.startsWith(TAG_OPEN); depth++) {
      const end = cur.indexOf(TAG_CLOSE);
      if (end === -1) break;
      let inner;
      try {
        inner = b64d(cur.slice(TAG_OPEN.length, end));
      } catch {
        break;
      }
      if (inner === cur) break;
      found = cur = inner;
    }
    return found;
  }

  // 先把數學抽掉再跑 Markdown。不這樣做的話 $x_1 + x_2$ 裡的底線
  // 會被當成 Markdown 的斜體語法吃掉，公式就毀了。
  function mdToHtml(md) {
    const math = [];
    const guarded = md.replace(
      /\$\$[\s\S]+?\$\$|\$[^\n$]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/g,
      (m) => `${MARK}${math.push(m) - 1}${MARK}`,
    );
    return marked
      .parse(guarded, { breaks: true })
      .replace(new RegExp(MARK + "(\\d+)" + MARK, "g"), (_, i) => math[i]);
  }

  // MathJax 的產物包在 <mjx-container> 這種自訂標籤裡，靠 MathJax 的外部
  // CSS 才會正確排版。前台沒有那份 CSS，所以存檔前要把它們攤平成純 SVG，
  // 並自己把獨立公式置中。順便清掉 MathML 副本——它同樣只靠外部 CSS 隱藏，
  // 留著會讓每條公式被畫兩次。
  function flatten(root) {
    root.querySelectorAll("mjx-assistive-mml").forEach((e) => e.remove());
    root.querySelectorAll("mjx-container").forEach((c) => {
      const svg = c.querySelector("svg");
      if (!svg) return c.remove();
      if (c.getAttribute("display") === "true") {
        const d = document.createElement("div");
        d.style.cssText = "text-align:center;margin:1em 0;";
        d.appendChild(svg);
        c.replaceWith(d);
      } else {
        c.replaceWith(svg);
      }
    });
  }

  // 把 $...$ 轉成自包含的 SVG。前台沒有 MathJax，所以公式必須在存檔前就
  // 變成圖形，否則學生只會看到一堆錢號。預覽也走這條路徑，這樣預覽看到的
  // 就是前台會顯示的東西。
  async function typeset(html) {
    const holder = document.createElement("div");
    holder.style.cssText = "position:absolute;left:-99999px;top:0;width:800px;";
    holder.innerHTML = html;
    document.body.appendChild(holder);
    try {
      await MathJax.typesetPromise([holder]);
      flatten(holder);
      return holder.innerHTML;
    } finally {
      MathJax.startup.document.clear();
      holder.remove();
    }
  }

  function setupField(id, inst) {
    const ta = document.getElementById(id);
    if (!ta) return false;

    // 讀 textarea 而非 inst.getData()：textarea 是伺服器吐出的原文，
    // 沒被 CKEditor 正規化過。
    const stored = ta.value;
    // destroy 失敗就整個放棄這個欄位。CKEditor 若還活著，它會在送出時把
    // 自己的內容寫回 textarea，蓋掉我們轉好的結果——半殘狀態會毀資料。
    if (inst) {
      try {
        inst.destroy(true);
      } catch (err) {
        console.error("[OJ Helper] CKEditor destroy 失敗，" + id + " 維持原狀", err);
        return false;
      }
    }

    // 舊題目沒有藏原稿，就把既有 HTML 當原稿用。Markdown 允許 inline HTML，
    // 所以原本的內容會原樣輸出，不會因為換模式就爛掉。
    ta.value = extractMarkdown(stored) ?? stored;
    ta.style.cssText =
      "display:block;width:100%;min-height:220px;font-family:ui-monospace,Menlo,Consolas,monospace;" +
      "font-size:13px;line-height:1.5;padding:8px;border:1px solid #ccc;border-radius:4px;";

    const bar = document.createElement("div");
    bar.style.cssText =
      "font-size:12px;color:#ea4c89;font-weight:bold;margin:6px 0 4px;";
    bar.innerHTML =
      "📝 Markdown 模式 — 行內公式 <code>$x^2$</code>，獨立公式 <code>$$...$$</code>";
    ta.before(bar);

    const prev = document.createElement("div");
    prev.style.cssText =
      "border:1px solid #ddd;border-top:3px solid #ea4c89;border-radius:0 0 4px 4px;" +
      "padding:10px 12px;margin-bottom:12px;background:#fafafa;min-height:50px;overflow-x:auto;";
    ta.after(prev);

    let timer;
    const render = async () => {
      try {
        prev.innerHTML = await typeset(mdToHtml(ta.value));
      } catch (err) {
        prev.innerHTML =
          '<span style="color:#c62828">預覽失敗：</span>' + String(err.message || err);
      }
    };
    ta.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(render, 250);
    });
    render();
    return true;
  }

  // CKEditor 4 的實例是異步建好的。load 事件時 CKEDITOR.instances[id] 已經
  // 存在，但內部還沒 ready，這時候呼叫 destroy() 會拋 TypeError。
  function whenReady(id, cb) {
    const inst = window.CKEDITOR && CKEDITOR.instances[id];
    if (!inst) return cb(null); // 沒有 CKEditor 接管，直接處理 textarea
    if (inst.status === "ready") return cb(inst);
    inst.on("instanceReady", () => cb(inst));
  }

  window.addEventListener("load", () => {
    if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;
    if (typeof marked === "undefined" || typeof MathJax === "undefined") {
      console.error("[OJ Helper] marked 或 MathJax 未載入，Markdown 模式停用");
      return;
    }

    // 只有成功接管的欄位才會在送出時被轉換。某個欄位若接管失敗，
    // 它就維持原本的 CKEditor 行為，不會被我們寫壞。
    const active = new Set();
    FIELDS.forEach((id) =>
      whenReady(id, (inst) => {
        try {
          if (setupField(id, inst)) active.add(id);
        } catch (err) {
          console.error("[OJ Helper] " + id + " 接管失敗", err);
        }
      }),
    );

    const form = document.getElementById(FIELDS[0])?.closest("form");
    if (!form) return;

    // submit 事件不能等 async，所以攔下來、轉換完再用 form.submit() 送出
    // （form.submit() 不會重新觸發 submit 事件，不會無限迴圈）。
    form.addEventListener("submit", async (e) => {
      if (!active.size) return; // 一個欄位都沒接管成功就完全不介入
      e.preventDefault();
      for (const id of active) {
        const ta = document.getElementById(id);
        if (!ta) continue;
        // 再剝一次殼。萬一 textarea 裡是已轉換的內容（例如接管時序出過問題），
        // 直接拿去轉換會把整份輸出當成原稿再包一層，愈包愈深。
        const md = extractMarkdown(ta.value) ?? ta.value;
        ta.value = `${TAG_OPEN}${b64e(md)}${TAG_CLOSE}\n${await typeset(mdToHtml(md))}`;
      }
      form.submit();
    });
  });
})();
