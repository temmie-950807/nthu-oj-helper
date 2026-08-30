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
  // ===== 工具列 =====

  function insert(ta, before, after, ph) {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || ph || "";
    ta.setRangeText(before + sel + after, s, e, "end");
    ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    ta.focus();
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // 標題、清單、引用這類語法要加在行首，不能包住選取範圍
  function prefixLine(ta, prefix) {
    const s = ta.selectionStart;
    const at = ta.value.lastIndexOf("\n", s - 1) + 1;
    ta.setRangeText(prefix, at, at, "end");
    ta.focus();
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // OJ 沒有圖片上傳端點，而且未來可能斷外網——外部圖床的連結那天會全部
  // 變破圖。所以直接把圖片編碼進題目本體，順便縮圖控制大小。
  function shrink(file, maxSide) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, c.width, c.height);

        // 有透明像素就只能用 PNG，JPEG 會把透明背景填成黑色。
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        let hasAlpha = false;
        for (let i = 3; i < px.length; i += 4) {
          if (px[i] < 255) {
            hasAlpha = true;
            break;
          }
        }

        const png = c.toDataURL("image/png");
        if (hasAlpha) return resolve(png);
        // 沒有透明就兩種都算、取小的。實測一張 900x600 的漸層圖
        // PNG 要 777KB、JPEG 只要 57KB，差 13 倍。
        const jpg = c.toDataURL("image/jpeg", 0.9);
        resolve(jpg.length < png.length ? jpg : png);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("圖片讀取失敗"));
      };
      img.src = url;
    });
  }

  // 原稿要藏進註解，但圖片的 data URI 已經完整存在渲染後的 HTML 裡了。
  // 原稿再帶一份，還會被 base64 二次編碼多膨脹三分之一——同一張圖付兩次錢。
  // 所以原稿只留佔位符，讀回來時再從 HTML 的 <img> 把 src 撈回去。
  const IMG_RE = /!\[([^\]]*)\]\(data:[^)]+\)/g;
  const PLACEHOLDER_RE = /@@IMG(\d+)@@/g;

  function stripImages(md) {
    let n = 0;
    return md.replace(IMG_RE, (_, alt) => `![${alt}](@@IMG${n++}@@)`);
  }

  function restoreImages(md, stored) {
    if (!PLACEHOLDER_RE.test(md)) return md;
    const end = stored.indexOf(TAG_CLOSE);
    const html = end === -1 ? stored : stored.slice(end + TAG_CLOSE.length);
    const srcs = [...html.matchAll(/<img[^>]*src="(data:[^"]*)"/g)].map(
      (m) => m[1],
    );
    return md.replace(PLACEHOLDER_RE, (m, i) => srcs[i] ?? m);
  }

  function pickImage(ta) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.addEventListener("change", async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const uri = await shrink(f, 900);
        insert(ta, `![](${uri})`, "", "");
        const kb = Math.round(uri.length / 1024);
        if (kb > 250) {
          alert(
            `這張圖內嵌後約 ${kb} KB，會整串寫進題目敘述欄位。\n` +
              `若儲存後圖片顯示不完整，代表資料庫欄位塞不下，請先把圖裁小再插入。`,
          );
        }
      } catch (err) {
        alert("圖片插入失敗：" + err.message);
      }
    });
    inp.click();
  }

  const TABLE_TPL =
    "\n| 欄位 A | 欄位 B |\n| --- | --- |\n| 內容 1 | 內容 2 |\n";

  function buildToolbar(ta) {
    // null 代表分隔線，把功能相近的按鈕分組
    const items = [
      ["B", "粗體", () => insert(ta, "**", "**", "粗體")],
      ["I", "斜體", () => insert(ta, "*", "*", "斜體")],
      ["H", "標題", () => prefixLine(ta, "## ")],
      null,
      ["•", "項目清單", () => prefixLine(ta, "- ")],
      ["1.", "編號清單", () => prefixLine(ta, "1. ")],
      null,
      ["🔗", "連結", () => insert(ta, "[", "](https://)", "文字")],
      ["🖼", "插入圖片（縮圖後內嵌）", () => pickImage(ta)],
      ["⊞", "表格", () => insert(ta, TABLE_TPL, "", "")],
      null,
      ["<>", "行內程式碼", () => insert(ta, "`", "`", "code")],
      ["▤", "程式碼區塊", () => insert(ta, "\n```\n", "\n```\n", "code")],
      null,
      ["$x$", "行內公式", () => insert(ta, "$", "$", "x^2")],
      ["$$", "獨立公式", () => insert(ta, "\n$$\n", "\n$$\n", "\\sum_{i=1}^{n} i")],
    ];

    const bar = document.createElement("div");
    bar.className = "ojmd-toolbar";
    items.forEach((item) => {
      if (!item) {
        bar.appendChild(
          Object.assign(document.createElement("span"), {
            className: "ojmd-sep",
          }),
        );
        return;
      }
      const [label, title, fn] = item;
      const b = document.createElement("button");
      b.type = "button"; // 不加會被當成 submit，按一下就送出整張表單
      b.textContent = label;
      b.title = title;
      b.addEventListener("click", fn);
      bar.appendChild(b);
    });

    const words = document.createElement("span");
    words.className = "ojmd-words";
    words.textContent = "0 words";
    bar.appendChild(words);
    ta.addEventListener("input", () => {
      const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
      words.textContent = n + (n === 1 ? " word" : " words");
    });
    return bar;
  }

  // 前台只有 Bootstrap，沒有 Markdown 專用樣式。表格會變成沒有框線的一團、
  // 程式碼區塊沒有底色、大圖會撐爆版面。所以存檔前把樣式寫成 inline，
  // 讓產出的 HTML 不依賴前台有什麼 CSS。
  function styleForFrontend(root) {
    root.querySelectorAll("table").forEach((t) => {
      t.style.cssText = "border-collapse:collapse;margin:1em 0;";
      t.querySelectorAll("th,td").forEach((c) => {
        c.style.cssText = "border:1px solid #bbb;padding:6px 10px;";
      });
      t.querySelectorAll("th").forEach((c) => {
        c.style.background = "#f2f2f2";
      });
    });
    root.querySelectorAll("pre").forEach((p) => {
      p.style.cssText =
        "background:#f6f8fa;border:1px solid #ddd;border-radius:4px;padding:10px;overflow-x:auto;";
    });
    root.querySelectorAll("code").forEach((c) => {
      if (c.parentElement && c.parentElement.tagName !== "PRE") {
        c.style.cssText =
          "background:#f0f0f0;padding:1px 4px;border-radius:3px;font-family:ui-monospace,Menlo,Consolas,monospace;";
      }
    });
    root.querySelectorAll("img").forEach((i) => {
      i.style.maxWidth = "100%";
      i.style.height = "auto";
    });
    root.querySelectorAll("blockquote").forEach((b) => {
      b.style.cssText =
        "border-left:4px solid #ddd;margin:1em 0;padding:0 1em;color:#555;";
    });
  }

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
      styleForFrontend(holder);
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
    const recovered = extractMarkdown(stored);
    ta.value =
      recovered === null ? stored : restoreImages(recovered, stored);

    // django-ckeditor 的外框是 inline-block，會把版面寬度綁死
    const widget = ta.closest(".django-ckeditor-widget");
    if (widget) widget.style.cssText = "display:block;width:100%;";

    // 版面與外觀交給 ui.css，這裡只負責結構
    const toolbar = buildToolbar(ta);
    ta.before(toolbar);

    const prev = document.createElement("div");
    prev.className = "ojmd-preview";

    const row = document.createElement("div");
    row.className = "ojmd-row";
    ta.before(row);
    row.append(ta, prev);
    ta.className = "ojmd-input";
    ta.removeAttribute("style");
    ta.dataset.field = id;

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
    // setupField 是異步的（要等 CKEditor ready），ui.js 直接找 DOM 會撲空，
    // 所以完成時通知它來掛模式切換。
    document.dispatchEvent(
      new CustomEvent("ojmd:ready", { detail: { id, row, toolbar } }),
    );
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
    let pending = FIELDS.length;
    const settle = () => {
      if (--pending > 0) return;
      // 通知 ui.js：CKEditor 已經全部拆完，現在搬 DOM 是安全的。
      // CKEditor 的編輯區是 iframe，在 DOM 中被移動就會重新載入、內部參照
      // 失效，實例會整個炸掉。
      document.dispatchEvent(new CustomEvent("ojmd:done"));
    };
    FIELDS.forEach((id) =>
      whenReady(id, (inst) => {
        try {
          if (setupField(id, inst)) active.add(id);
        } catch (err) {
          console.error("[OJ Helper] " + id + " 接管失敗", err);
        }
        settle();
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
        const html = await typeset(mdToHtml(md));
        // 註解只存去掉圖片資料的精簡原稿，圖片本體單獨留在 html 那份
        ta.value = `${TAG_OPEN}${b64e(stripImages(md))}${TAG_CLOSE}\n${html}`;
      }
      form.submit();
    });
  });
})();
