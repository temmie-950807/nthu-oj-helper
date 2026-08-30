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

  // 從存過的內容裡取回原稿；沒有就回傳 null（代表這是還沒用過本工具的舊題目）
  function extractMarkdown(stored) {
    if (!stored.startsWith(TAG_OPEN)) return null;
    const end = stored.indexOf(TAG_CLOSE);
    if (end === -1) return null;
    try {
      return b64d(stored.slice(TAG_OPEN.length, end));
    } catch {
      return null;
    }
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

  // 把 $...$ 轉成自包含的 SVG。前台沒有 MathJax，所以公式必須在存檔前就
  // 變成圖形，否則學生只會看到一堆錢號。
  async function typeset(html) {
    const holder = document.createElement("div");
    holder.style.cssText = "position:absolute;left:-99999px;top:0;width:800px;";
    holder.innerHTML = html;
    document.body.appendChild(holder);
    try {
      await MathJax.typesetPromise([holder]);
      return holder.innerHTML;
    } finally {
      MathJax.startup.document.clear();
      holder.remove();
    }
  }

  function setupField(id) {
    const ta = document.getElementById(id);
    if (!ta) return;

    const inst = window.CKEDITOR && CKEDITOR.instances[id];
    const stored = inst ? inst.getData() : ta.value;
    if (inst) inst.destroy(true);

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
  }

  window.addEventListener("load", () => {
    if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;
    if (typeof marked === "undefined" || typeof MathJax === "undefined") {
      console.error("[OJ Helper] marked 或 MathJax 未載入，Markdown 模式停用");
      return;
    }

    FIELDS.forEach(setupField);

    const form = document.getElementById(FIELDS[0])?.closest("form");
    if (!form) return;

    // submit 事件不能等 async，所以攔下來、轉換完再用 form.submit() 送出
    // （form.submit() 不會重新觸發 submit 事件，不會無限迴圈）。
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      for (const id of FIELDS) {
        const ta = document.getElementById(id);
        if (!ta) continue;
        const md = ta.value;
        ta.value = `${TAG_OPEN}${b64e(md)}${TAG_CLOSE}\n${await typeset(mdToHtml(md))}`;
      }
      form.submit();
    });
  });
})();
