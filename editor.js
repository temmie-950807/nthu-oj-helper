(function () {
  "use strict";

  const FIELDS = ["id_description", "id_input", "id_output"];
  const editors = new Map();
  // transfer.js 匯出 .md 時要的是帶圖片的完整原稿，不是 textarea 裡的代號版
  window.__ojMarkdown = (id) => editors.get(id)?.getMarkdown();
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

  function insert(ed, before, after, ph) {
    const { from, to } = ed.view.state.selection.main;
    const sel = ed.view.state.sliceDoc(from, to) || ph || "";
    ed.view.dispatch({
      changes: { from, to, insert: before + sel + after },
      selection: {
        anchor: from + before.length,
        head: from + before.length + sel.length,
      },
    });
    ed.view.focus();
  }

  // 標題、清單、引用這類語法要加在行首，不能包住選取範圍
  function prefixLine(ed, prefix) {
    const line = ed.view.state.doc.lineAt(ed.view.state.selection.main.from);
    ed.view.dispatch({ changes: { from: line.from, insert: prefix } });
    ed.view.focus();
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

  // 原稿裡不放圖片本體，只放代號 @@IMGn@@，圖片存在 images[]。兩個理由：
  //
  // 1. 存檔時原稿要 base64 進 HTML 註解，圖片資料再編一次會多膨脹三分之一
  //    ——同一張圖付兩次錢。渲染後的 HTML 那半已經有完整的 data URI 了。
  // 2. 編輯區裡一張圖就是幾十 KB 的亂碼，把題目敘述整個淹掉。換成代號，
  //    CodeMirror 才有辦法把那一小段畫成一個圖片方塊。
  const TOKEN_RE = /@@IMG(\d+)@@/g;
  // 一次掃過兩種寫法，編號才會等於文件順序——存檔後要靠這個順序從 HTML
  // 把圖片撈回來對上代號。
  const ANY_IMG_RE = /!\[([^\]]*)\]\((data:[^)\s]+)\)|<img\b[^>]*>/g;

  const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  // 完整 Markdown -> { text: 代號版, images: [dataURI] }
  function pack(md) {
    const images = [];
    const text = md.replace(ANY_IMG_RE, (tag, alt, uri) => {
      if (uri !== undefined) {
        const i = images.push(uri) - 1;
        return `<img src="@@IMG${i}@@"${alt ? ` alt="${escAttr(alt)}"` : ""}>`;
      }
      // 已經是 <img>：只有內嵌的要收起來，外部連結原樣留著
      const m = tag.match(/src="(data:[^"]+)"/);
      if (!m) return tag;
      const i = images.push(m[1]) - 1;
      return tag.replace(m[1], `@@IMG${i}@@`);
    });
    return { text, images };
  }

  const unpack = (text, images) =>
    text.replace(TOKEN_RE, (m, i) => images[i] ?? m);

  // 舊版存下來的原稿用的是 Markdown 圖片語法 ![](@@IMG0@@)。統一成 <img>：
  // 只有它帶得動 width，圖片方塊也只認這一種寫法。
  const normalizeTokens = (t) =>
    t.replace(
      /!\[([^\]]*)\]\((@@IMG\d+@@)\)/g,
      (_, alt, tok) =>
        `<img src="${tok}"${alt ? ` alt="${escAttr(alt)}"` : ""}>`,
    );

  // 存下來的格式是 <!--md:base64(代號版原稿)-->\n<渲染後的 HTML>，
  // 圖片本體只在 HTML 那半，照文件順序撈就對得上代號。
  function dataUrisIn(stored) {
    const end = stored.indexOf(TAG_CLOSE);
    const html = end === -1 ? stored : stored.slice(end + TAG_CLOSE.length);
    return [...html.matchAll(/<img[^>]*src="(data:[^"]*)"/g)].map((m) => m[1]);
  }

  function pickImage(ed) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.addEventListener("change", async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const uri = await shrink(f, 900);
        ed.addImage(uri);
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

  /* ===== CodeMirror 編輯器：把圖片代號畫成方塊 ===== */

  const WIDGET_RE = /<img\b[^>]*src="@@IMG(\d+)@@"[^>]*>/g;
  const widthOf = (tag) => {
    const m = tag.match(/\bwidth="(\d+)"/);
    return m ? +m[1] : null;
  };

  // 代號在整份文件裡唯一，直接全文找就好。題目敘述頂多幾 KB，不值得為了
  // 省這一次掃描去維護一份會過期的位置表。
  function tagOf(doc, idx) {
    const m = new RegExp(`<img\\b[^>]*src="@@IMG${idx}@@"[^>]*>`).exec(
      doc.toString(),
    );
    return m ? { from: m.index, to: m.index + m[0].length, tag: m[0] } : null;
  }

  function imageExtension(images) {
    const { Decoration, WidgetType, ViewPlugin, EditorView } = CM6;

    function setWidth(view, idx, w) {
      const r = tagOf(view.state.doc, idx);
      if (!r) return;
      const tag = /\bwidth="\d+"/.test(r.tag)
        ? r.tag.replace(/\bwidth="\d+"/, `width="${w}"`)
        : r.tag.replace(/\s*>$/, ` width="${w}">`);
      if (tag !== r.tag)
        view.dispatch({ changes: { from: r.from, to: r.to, insert: tag } });
    }

    class ImgWidget extends WidgetType {
      constructor(idx, width) {
        super();
        this.idx = idx;
        this.width = width;
      }
      // 寬度沒變就不重建 DOM，否則每打一個字整張圖都會閃一下
      eq(o) {
        return o.idx === this.idx && o.width === this.width;
      }
      // 方塊內部的滑鼠事件交給我們自己處理，不要被編輯器當成選取
      ignoreEvent() {
        return true;
      }
      toDOM(view) {
        const box = document.createElement("span");
        box.className = "ojmd-img";
        const img = document.createElement("img");
        img.src = images[this.idx] || "";
        const meta = document.createElement("span");
        meta.className = "ojmd-img-meta";
        const grip = document.createElement("span");
        grip.className = "ojmd-img-grip";
        grip.title = "拖曳調整寬度";
        box.append(img, meta, grip);

        const kb = Math.round((images[this.idx] || "").length / 1024);
        const label = (w) =>
          (w ? w + "px" : "原始大小") +
          (img.naturalWidth ? ` · ${img.naturalWidth}×${img.naturalHeight}` : "") +
          ` · ${kb} KB`;
        // 沒有 width 屬性時照原圖大小顯示，但不讓它把編輯區撐爆。
        // 標籤仍寫「原始大小」——輸出的 HTML 確實沒有 width。
        const paint = (w) => {
          box.style.width = (w || Math.min(img.naturalWidth || 240, 360)) + "px";
          meta.textContent = label(w);
        };
        img.addEventListener("load", () => paint(this.width), { once: true });
        img.addEventListener("error", () => {
          meta.textContent = "圖片讀取失敗";
        });
        paint(this.width);

        // 拖曳期間只改 DOM，放開才寫回文件——每移動一像素就 dispatch 一次
        // 會把 undo 歷史塞滿幾百筆。
        let startX = 0;
        let cur = 0;
        const onMove = (e) => {
          cur = Math.max(40, Math.round(box.__w0 + (e.clientX - startX)));
          box.style.width = cur + "px";
          meta.textContent = label(cur);
        };
        const onUp = () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          setWidth(view, this.idx, cur);
        };
        grip.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          startX = e.clientX;
          box.__w0 = box.offsetWidth;
          cur = box.__w0;
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", onUp);
        });
        return box;
      }
    }

    const build = (view) => {
      const out = [];
      const text = view.state.doc.toString();
      WIDGET_RE.lastIndex = 0;
      let m;
      while ((m = WIDGET_RE.exec(text)))
        out.push(
          Decoration.replace({
            widget: new ImgWidget(+m[1], widthOf(m[0])),
          }).range(m.index, m.index + m[0].length),
        );
      return Decoration.set(out);
    };

    return ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.decorations = build(view);
        }
        update(u) {
          if (u.docChanged) this.decorations = build(u.view);
        }
      },
      {
        decorations: (v) => v.decorations,
        // 沒有 atomicRanges，方向鍵會一格一格走進被蓋掉的那串 <img ...>
        // 文字裡，游標看起來卡在圖上不動。
        provide: (plug) =>
          EditorView.atomicRanges.of(
            (v) => v.plugin(plug)?.decorations || Decoration.none,
          ),
      },
    );
  }

  // textarea 留在表單裡當送出的來源，畫面上換成 CodeMirror。
  // 兩邊靠 input 事件同步，syncing 旗標避免互相觸發打成迴圈。
  function mountEditor(ta, packed) {
    const {
      EditorView,
      keymap,
      defaultKeymap,
      history,
      historyKeymap,
      drawSelection,
    } = CM6;
    const images = packed.images;
    const host = document.createElement("div");
    host.className = "ojmd-input";

    let syncing = false;
    const view = new EditorView({
      doc: packed.text,
      parent: host,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        imageExtension(images),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          syncing = true;
          ta.value = view.state.doc.toString();
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          syncing = false;
        }),
      ],
    });

    // 匯入 zip 是直接寫 ta.value 再發 input，那份內容帶著完整 data URI，
    // 要重新打包才不會把 base64 灌進編輯器。
    // 只有代號沒有 data URI 的（Preview 送出後的還原）不能重打包——那會
    // 把 images 清成空陣列，圖片全部變破圖。
    ta.addEventListener("input", () => {
      if (syncing || ta.value === view.state.doc.toString()) return;
      const p = /data:/.test(ta.value) ? pack(ta.value) : null;
      if (p) {
        images.length = 0;
        images.push(...p.images);
      }
      const text = p ? p.text : ta.value;
      syncing = true;
      ta.value = text;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
      syncing = false;
    });

    return {
      view,
      host,
      images,
      getMarkdown: () => unpack(view.state.doc.toString(), images),
      addImage(uri) {
        const idx = images.push(uri) - 1;
        insert(this, `<img src="@@IMG${idx}@@">`, "", "");
      },
    };
  }

  const TABLE_TPL =
    "\n| 欄位 A | 欄位 B |\n| --- | --- |\n| 內容 1 | 內容 2 |\n";

  function buildToolbar(ed, ta) {
    // null 代表分隔線，把功能相近的按鈕分組
    const items = [
      ["B", "粗體", () => insert(ed, "**", "**", "粗體")],
      ["I", "斜體", () => insert(ed, "*", "*", "斜體")],
      ["H", "標題", () => prefixLine(ed, "## ")],
      null,
      ["•", "項目清單", () => prefixLine(ed, "- ")],
      ["1.", "編號清單", () => prefixLine(ed, "1. ")],
      null,
      ["🔗", "連結", () => insert(ed, "[", "](https://)", "文字")],
      ["🖼", "插入圖片（縮圖後內嵌）", () => pickImage(ed)],
      ["⊞", "表格", () => insert(ed, TABLE_TPL, "", "")],
      null,
      ["<>", "行內程式碼", () => insert(ed, "`", "`", "code")],
      ["▤", "程式碼區塊", () => insert(ed, "\n```\n", "\n```\n", "code")],
      null,
      ["$x$", "行內公式", () => insert(ed, "$", "$", "x^2")],
      ["$$", "獨立公式", () => insert(ed, "\n$$\n", "\n$$\n", "\\sum_{i=1}^{n} i")],
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
    const packed =
      recovered === null
        ? pack(stored)
        : { text: normalizeTokens(recovered), images: dataUrisIn(stored) };
    ta.value = packed.text;

    // django-ckeditor 的外框是 inline-block，會把版面寬度綁死
    const widget = ta.closest(".django-ckeditor-widget");
    if (widget) widget.style.cssText = "display:block;width:100%;";

    // textarea 不再是編輯介面，但要留在表單裡——送出的內容是從它來的，
    // transfer.js 的匯出、ui.js 的完成度也都讀它。
    ta.style.display = "none";
    ta.dataset.field = id;

    const ed = mountEditor(ta, packed);
    editors.set(id, ed);

    // 版面與外觀交給 ui.css，這裡只負責結構
    const toolbar = buildToolbar(ed, ta);
    ta.before(toolbar);

    const prev = document.createElement("div");
    prev.className = "ojmd-preview";

    const row = document.createElement("div");
    row.className = "ojmd-row";
    ta.before(row);
    row.append(ed.host, prev);

    let timer;
    const render = async () => {
      try {
        prev.innerHTML = await typeset(mdToHtml(ed.getMarkdown()));
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
    if (
      typeof marked === "undefined" ||
      typeof MathJax === "undefined" ||
      typeof CM6 === "undefined"
    ) {
      console.error(
        "[OJ Helper] marked / MathJax / CodeMirror 未載入，Markdown 模式停用",
      );
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
      // edit.js 綁在 DOM-ready、比這裡早跑。它在 judge type 從 SPECIAL/PARTIAL
      // 換掉時會問「會刪掉原本的 code」，使用者按取消時 jQuery 只做
      // preventDefault + stopPropagation（不是 stopImmediatePropagation），
      // 同一元素上的這個 listener 照樣會跑。而 form.submit() 會無視 canceled
      // state 直接送出——不檢查的話，那個確認框等於裝飾品。
      if (e.defaultPrevented) return;
      e.preventDefault();

      // Preview 用 target="_blank"，當前分頁不會導航，textarea 會停在轉換後的
      // 狀態。不還原的話：編輯區變成一坨 HTML、之後打的字會被下次送出丟掉。
      const isPreview = form.getAttribute("target") === "_blank";
      const snapshot = new Map();

      for (const id of active) {
        const ta = document.getElementById(id);
        const ed = editors.get(id);
        if (!ta || !ed) continue;
        snapshot.set(id, ta.value);
        const md = ed.getMarkdown();
        const html = await typeset(mdToHtml(md));
        // 重新打包一次，代號才會照文件順序編號。編輯過程中插入的圖片是
        // 依插入順序拿號碼，直接存下去的話，重新載入時從 HTML 依文件順序
        // 撈回來的圖片會對到錯的代號，整批圖互換位置。
        const repacked = pack(md);
        // 註解只存去掉圖片資料的精簡原稿，圖片本體單獨留在 html 那份
        ta.value = `${TAG_OPEN}${b64e(repacked.text)}${TAG_CLOSE}\n${html}`;
      }

      form.dataset.ojSubmitting = "1"; // 讓 ui.js 的離開警告放行
      form.submit();

      if (isPreview) {
        setTimeout(() => {
          snapshot.forEach((v, id) => {
            const ta = document.getElementById(id);
            if (ta) ta.value = v;
          });
          delete form.dataset.ojSubmitting;
        }, 0);
      }
    });
  });
})();
