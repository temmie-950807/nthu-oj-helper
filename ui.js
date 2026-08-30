(function () {
  "use strict";

  const el = (t, c) => {
    const e = document.createElement(t);
    if (c) e.className = c;
    return e;
  };
  const svg = (paths, extra = "") =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ${extra}>${paths}</svg>`;

  const ICON = {
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
    description: svg(
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>',
    ),
    sample_io: svg('<path d="m8 6-6 6 6 6M16 6l6 6-6 6"/>'),
    tag: svg(
      '<path d="M20.6 13.4 12 22l-9-9V3h10z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    ),
    testcase: svg(
      '<path d="M9 2v6l-5 9a3 3 0 0 0 3 4h10a3 3 0 0 0 3-4l-5-9V2M8 2h8M6.5 15h11"/>',
    ),
    warn: svg('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', 'stroke-width="2"'),
  };

  const PANES = [
    { id: "info", label: "Info" },
    { id: "description", label: "Description" },
    { id: "sample_io", label: "Sample IO" },
    { id: "tag", label: "Tag" },
    { id: "testcase", label: "TestCase" },
  ];

  const CARD = {
    info: ["基本設定", "題號與評測方式。改動評測方式會影響已存在的送出紀錄。"],
    description: [
      "Description",
      'Markdown，行內公式 <code>$x^2$</code>，獨立公式 <code>$$…$$</code>',
    ],
    sample_io: [
      "Sample IO",
      "顯示在題目頁的範例。與 TestCase 分開，不參與評分。",
    ],
    tag: ["Tag", "用於題庫篩選。學生在題目 AC 前看不到 tag。"],
    testcase: ["TestCase", "評測實際使用的測資。"],
  };

  const FIELD_META = {
    pname: ["Problem name", "顯示在題目列表與比賽榜單上。"],
    owner: ["Owner", "只有本人與管理員能編輯這題。"],
    visible: ["Visibility", "Visible 後所有使用者都能看到並送出。"],
    judge_source: ["Judge source", "本地評測，或轉送到外部 OJ。"],
    judge_type: ["Judge type", "決定如何比對輸出。"],
    judge_language: ["Judge language", "評測程式使用的語言。"],
    other_judge_id: ["Remote problem ID", "送出將轉發至該站的這個題號。"],
    special_judge_code: ["Special judge code", "checker 程式，多解或浮點題使用。"],
    partial_judge_code: ["Partial judge code", "依測資組給部分分數的評分程式。"],
    partial_judge_header: ["Partial judge header", "Partial judge 要引入的標頭檔。"],
  };

  const JUDGE_TYPE_DESC = {
    LOCAL_NORMAL: "逐字元比對輸出，忽略行尾空白。",
    LOCAL_SPECIAL: "需上傳 checker 程式，多解或浮點題使用。",
    LOCAL_PARTIAL: "依測資組給部分分數。",
  };

  // judge_type → 需要一併顯示的欄位。取代 edit.js 那套靠 .parent().parent()
  // 往上爬兩層的寫法：那是綁死 DOM 深度的，一改版面就靜默壞掉。
  const EXTRA_FIELDS = {
    LOCAL_NORMAL: [],
    LOCAL_SPECIAL: ["special_judge_code", "judge_language"],
    LOCAL_PARTIAL: ["partial_judge_code", "partial_judge_header", "judge_language"],
  };

  const $n = (n) => document.querySelector(`[name="${n}"]`);
  const row = (n) => document.querySelector(`[data-field="${n}"]`);

  let dirtyEl = null;
  let isDirty = false;
  const markDirty = () => {
    if (isDirty) return;
    isDirty = true;
    dirtyEl?.classList.add("is-on");
  };

  /* ---------- 頁首 ---------- */
  function buildHeader(h2) {
    const head = el("header", "ojui-header");
    const rowEl = el("div", "ojui-header-row");

    const left = el("div");
    const crumbs = el("div", "ojui-crumbs");
    const panel = el("a");
    panel.href = "/problem/";
    panel.textContent = "Problem panel";
    crumbs.append(panel, document.createTextNode("/"), (() => {
      const s = el("span");
      s.textContent = "Edit";
      return s;
    })());

    const raw = (h2.childNodes[0]?.textContent || "").trim();
    const m = raw.match(/^(\d+)\s*[-·]\s*(.*)$/);
    const line = el("div", "ojui-titleline");
    const h1 = el("h1", "ojui-h1");
    h1.innerHTML = m
      ? `<span class="pid">${m[1]}</span><span class="dot">·</span>${m[2]}`
      : raw;
    line.appendChild(h1);

    const visBadge = el("span", "ojui-badge");
    visBadge.id = "ojui-vis-badge";
    line.appendChild(visBadge);

    const jBadge = el("span", "ojui-badge ojui-badge-mono");
    jBadge.id = "ojui-judge-badge";
    line.appendChild(jBadge);

    left.append(crumbs, line);

    const actions = el("div", "ojui-header-actions");
    dirtyEl = el("span", "ojui-dirty");
    dirtyEl.textContent = "未儲存";
    actions.appendChild(dirtyEl);

    actions.appendChild(buildMoveMenu(h2));

    // Preview / Save 代理到這裡。用 nativeInput.click() 而不是 form.submit()：
    // edit.js 在 click 時才會切換 form 的 action/target，而且 submit handler
    // 帶著「換 judge type 會刪掉已上傳的 code」那個確認框。
    const form = document.getElementById("problem_info");
    [...(form?.querySelectorAll('input[type="submit"]') || [])].forEach((n) => {
      const isSave = /save/i.test(n.value);
      const b = el("button", "ojui-btn " + (isSave ? "ojui-btn-primary" : "ojui-btn-ghost"));
      b.type = "button";
      b.innerHTML = `${n.value}<span class="ojui-kbd">${isSave ? "⌘S" : "⌘P"}</span>`;
      b.addEventListener("click", () => {
        if (isSave) isDirty = false;
        n.click();
      });
      if (isSave) b.id = "ojui-save";
      else b.id = "ojui-preview";
      actions.appendChild(b);
      const holder = n.closest(".form-group") || n.parentElement;
      if (holder) holder.style.display = "none";
    });

    // 原本 h2 裡的兩個連結降為 Cancel / 選單項目
    const links = [...h2.querySelectorAll("a")];
    const back = links.find((a) => /back|panel/i.test(a.textContent)) || links[1];
    if (back) {
      back.className = "ojui-btn ojui-btn-quiet";
      back.textContent = "Cancel";
      actions.appendChild(back);
    }

    rowEl.append(left, actions);
    head.appendChild(rowEl);
    return head;
  }

  function buildMoveMenu(h2) {
    const wrap = el("div", "ojui-menu-wrap");
    const btn = el("button", "ojui-btn ojui-btn-quiet");
    btn.type = "button";
    btn.innerHTML =
      svg('<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>', 'width="14" height="14"') +
      '題目搬移' +
      svg('<path d="m6 9 6 6 6-6"/>', 'width="12" height="12" opacity="0.5"');

    const menu = el("div", "ojui-menu");
    menu.hidden = true;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener("click", () => {
      menu.hidden = true;
    });
    menu.addEventListener("click", (e) => e.stopPropagation());

    // transfer.js 已經把匯出/匯入按鈕做好了，搬進選單重用，不重寫一份
    const bar = document.getElementById("oj-transfer-bar");
    if (bar) {
      [...bar.querySelectorAll("button")].forEach((b) => {
        b.className = "";
        menu.appendChild(b);
      });
      bar.querySelectorAll('input[type="file"]').forEach((i) => menu.appendChild(i));
      bar.remove();
    }

    const see = [...h2.querySelectorAll("a")].find((a) =>
      /see this problem/i.test(a.textContent),
    );
    if (see) {
      menu.appendChild(el("hr"));
      see.className = "";
      see.textContent = "See this problem ↗";
      menu.appendChild(see);
    }

    wrap.append(btn, menu);
    return wrap;
  }

  /* ---------- 左側 rail ---------- */
  function buildRail(select) {
    const aside = el("aside", "ojui-rail");
    const label = el("p", "ojui-rail-label");
    label.textContent = "Sections";
    const list = el("div", "ojui-rail-list");
    list.setAttribute("role", "tablist");

    const items = PANES.map((p, i) => {
      const b = el("button", "ojui-railitem");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset.pane = p.id;
      b.innerHTML = `${ICON[p.id]}<span>${p.label}</span>`;
      const tail = el("span", "tail");
      tail.dataset.tail = p.id;
      b.appendChild(tail);
      b.addEventListener("click", () => select(i));
      list.appendChild(b);
      return b;
    });

    list.addEventListener("keydown", (e) => {
      const cur = items.findIndex((t) => t.getAttribute("aria-selected") === "true");
      let next = null;
      if (e.key === "ArrowDown") next = (cur + 1) % items.length;
      else if (e.key === "ArrowUp") next = (cur - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      if (next === null) return;
      e.preventDefault();
      select(next);
      items[next].focus();
    });

    aside.append(label, list, buildReadiness());
    return { aside, items };
  }

  function buildReadiness() {
    const wrap = el("div", "ojui-readiness");
    const t = el("p", "ojui-rail-label");
    t.textContent = "Readiness";
    const card = el("div", "ojui-readiness-card");
    card.id = "ojui-readiness";
    wrap.append(t, card);
    return wrap;
  }

  function countTestcases() {
    return document.querySelectorAll("#testcase .del_testcase_btn").length;
  }
  function countTags() {
    return document.querySelectorAll("#tagTable tr").length;
  }
  function val(n) {
    const e = $n(n);
    return e ? e.value.trim() : "";
  }

  function checks() {
    return [
      { name: "Problem name", ok: !!val("pname") },
      { name: "Description", ok: !!val("description") },
      { name: "Sample IO", ok: !!(val("sample_in") && val("sample_out")) },
      { name: "TestCase", ok: countTestcases() > 0 },
      { name: "Visible", ok: !!$n("visible")?.checked },
    ];
  }

  function refreshStatus(railItems) {
    const c = checks();
    const score = c.filter((x) => x.ok).length;
    const missing = c.filter((x) => !x.ok).map((x) => x.name);
    const pubReady = score === c.length;
    const color = pubReady ? "var(--ok)" : "var(--gold)";

    const box = document.getElementById("ojui-readiness");
    if (box) {
      box.innerHTML =
        `<div class="ojui-ready-top">` +
        `<span class="ojui-ready-score">${score}<span>/${c.length}</span></span>` +
        `<span class="ojui-ready-verdict" style="color:${color}">${pubReady ? "可發佈" : "不可發佈"}</span>` +
        `</div>` +
        `<div class="ojui-progress"><i style="width:${(score / c.length) * 100}%;background:${color}"></i></div>` +
        `<p class="ojui-ready-note">${
          missing.length
            ? "缺少 " + missing.map((m) => `<b>${m}</b>`).join(" 與 ") + "。"
            : "所有項目皆已完成。"
        }</p>`;
    }

    // rail 尾標：數量或未填紅點
    const tails = {
      info: val("pname") ? "" : "dot",
      description: val("description") ? "" : "dot",
      sample_io: val("sample_in") && val("sample_out") ? "" : "dot",
      tag: String(countTags()),
      testcase: String(countTestcases()),
    };
    Object.entries(tails).forEach(([id, v]) => {
      const t = document.querySelector(`[data-tail="${id}"]`);
      if (!t) return;
      if (v === "dot") {
        t.className = "tail-dot";
        t.textContent = "";
        t.title = "尚未填寫";
      } else {
        t.className = "tail";
        t.textContent = v;
      }
    });

    // 頂部 badge
    const vis = !!$n("visible")?.checked;
    const vb = document.getElementById("ojui-vis-badge");
    if (vb) {
      vb.className = "ojui-badge " + (vis ? "ojui-badge-ok" : "ojui-badge-gold");
      vb.textContent = vis ? "Visible" : "Hidden";
    }
    const jb = document.getElementById("ojui-judge-badge");
    if (jb) {
      const src = $n("judge_source")?.value || "";
      const type = ($n("judge_type")?.value || "").split("_")[1] || "";
      jb.textContent = `${src} · ${type}`;
    }
  }

  /* ---------- Info 表單 ---------- */
  function buildFieldRow(name, controlNode) {
    const [title, hint] = FIELD_META[name] || [name, ""];
    const r = el("div", "ojui-fieldrow");
    r.dataset.field = name; // 條件顯示改抓這個，不再靠 DOM 深度
    const left = el("div");
    const lab = el("label", "ojui-fieldlabel");
    lab.textContent = title;
    left.appendChild(lab);
    if (hint) {
      const p = el("p", "ojui-fieldhint");
      p.textContent = hint;
      left.appendChild(p);
    }
    const right = el("div");
    right.appendChild(controlNode);
    r.append(left, right);
    return r;
  }

  // checkbox 換成有明文狀態的 toggle。原本是裸 checkbox，誤觸就全站公開。
  function buildToggle(cb, onChange) {
    const btn = el("button", "ojui-toggle");
    btn.type = "button";
    const track = el("span", "ojui-toggle-track");
    track.appendChild(el("i"));
    const text = el("span");
    const state = el("span", "ojui-toggle-state");
    const hint = el("span", "ojui-toggle-hint");
    text.append(state, hint);
    btn.append(track, text);

    const sync = () => {
      const on = cb.checked;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      state.textContent = on ? "Visible" : "Hidden";
      hint.textContent = on
        ? "所有使用者皆可見並可送出"
        : "僅出題者與管理員可見";
      onChange?.();
    };
    btn.addEventListener("click", () => {
      cb.checked = !cb.checked;
      markDirty();
      sync();
    });
    cb.style.display = "none";
    btn.appendChild(cb);
    sync();
    return btn;
  }

  function buildSegmented(sel, onChange) {
    const seg = el("div", "ojui-seg");
    const LABEL = { LOCAL: "Local Judge", OTHER: "Use Other Judge" };
    const btns = [...sel.options].map((o) => {
      const b = el("button");
      b.type = "button";
      b.textContent = LABEL[o.value] || o.value;
      b.dataset.v = o.value;
      b.addEventListener("click", () => {
        sel.value = o.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        markDirty();
        paint();
        onChange?.();
      });
      seg.appendChild(b);
      return b;
    });
    const paint = () =>
      btns.forEach((b) =>
        b.setAttribute("aria-selected", b.dataset.v === sel.value ? "true" : "false"),
      );
    paint();
    sel.style.display = "none";
    seg.appendChild(sel);
    return seg;
  }

  // 原生 select 看不到選項說明，換成 radio card。
  // 只列出與目前 judge_source 前綴相符的選項——後端 clean_judge_type 會擋
  // LOCAL 配 OTHER_* 這種組合，前端先擋掉才不會存到一半被拒。
  function buildRadioCards(sel, onChange) {
    const box = el("div", "ojui-radios");
    box.id = "ojui-judge-type-cards";

    const render = () => {
      const src = $n("judge_source")?.value || "LOCAL";
      box.innerHTML = "";
      [...sel.options]
        .filter((o) => o.value.startsWith(src))
        .forEach((o) => {
          const lab = el("label", "ojui-radio");
          const input = el("input");
          input.type = "radio";
          input.name = "ojui-jt";
          input.value = o.value;
          input.checked = sel.value === o.value;
          if (input.checked) lab.classList.add("is-on");
          const txt = el("span");
          txt.innerHTML =
            `<span class="ojui-radio-title">${o.textContent}</span>` +
            (JUDGE_TYPE_DESC[o.value]
              ? `<span class="ojui-radio-desc">${JUDGE_TYPE_DESC[o.value]}</span>`
              : "");
          input.addEventListener("change", () => {
            sel.value = o.value;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            markDirty();
            render();
            onChange?.();
          });
          lab.append(input, txt);
          box.appendChild(lab);
        });
      // 目前值與 source 不符（例如剛切換 source）就自動選第一個合法選項
      const legal = [...sel.options].filter((o) => o.value.startsWith(src));
      if (legal.length && !sel.value.startsWith(src)) {
        sel.value = legal[0].value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        render();
      }
    };

    render();
    sel.style.display = "none";
    box.appendChild(sel);
    box.__render = render;
    return box;
  }

  function applyConditional() {
    const src = $n("judge_source")?.value || "LOCAL";
    const type = $n("judge_type")?.value || "";
    const show = new Set(EXTRA_FIELDS[type] || []);
    if (src === "OTHER") show.add("other_judge_id");

    [
      "judge_language",
      "special_judge_code",
      "partial_judge_code",
      "partial_judge_header",
      "other_judge_id",
    ].forEach((n) => {
      const r = row(n);
      if (r) r.hidden = !show.has(n);
    });
  }

  function restructureInfo(afterChange) {
    const info = document.getElementById("info");
    if (!info) return;

    const groups = new Map();
    [...info.querySelectorAll(".form-group")].forEach((g) => {
      const c = g.querySelector("input,select,textarea");
      if (c && c.name && c.type !== "submit") groups.set(c.name, { g, c });
    });

    const body = el("div", "ojui-card-body");
    const order = [
      "pname",
      "owner",
      "visible",
      "judge_source",
      "judge_type",
      "judge_language",
      "other_judge_id",
      "special_judge_code",
      "partial_judge_code",
      "partial_judge_header",
    ];

    order.forEach((name) => {
      const hit = groups.get(name);
      if (!hit) return;
      const { g, c } = hit;
      let control;
      if (name === "visible") control = buildToggle(c, afterChange);
      else if (name === "judge_source")
        control = buildSegmented(c, () => {
          document.getElementById("ojui-judge-type-cards")?.__render?.();
          applyConditional();
          afterChange?.();
        });
      else if (name === "judge_type")
        control = buildRadioCards(c, () => {
          applyConditional();
          afterChange?.();
        });
      else control = c;

      body.appendChild(buildFieldRow(name, control));
      g.remove();
    });

    // owner 原本被 inline JS 藏起來，維持隱藏但保留欄位值
    const ownerRow = body.querySelector('[data-field="owner"]');
    if (ownerRow) ownerRow.hidden = true;

    const card = el("div", "ojui-card");
    card.append(cardHead("info"), body);
    info.appendChild(card);
    applyConditional();
  }

  function cardHead(paneId, toolsNode) {
    const [title, desc] = CARD[paneId] || [paneId, ""];
    const head = el("div", "ojui-card-head");
    const box = el("div");
    const h = el("h2", "ojui-card-title");
    h.textContent = title;
    box.appendChild(h);
    if (desc) {
      const p = el("p", "ojui-card-desc");
      p.innerHTML = desc;
      box.appendChild(p);
    }
    head.appendChild(box);
    if (toolsNode) {
      const t = el("div", "ojui-card-tools");
      t.appendChild(toolsNode);
      head.appendChild(t);
    }
    return head;
  }

  /* ---------- 其他分頁包成卡片 ---------- */
  function wrapPane(paneId, flush) {
    const pane = document.getElementById(paneId);
    if (!pane || pane.querySelector(".ojui-card")) return null;
    const card = el("div", "ojui-card");
    const body = el("div", "ojui-card-body" + (flush ? " ojui-card-body-flush" : ""));
    while (pane.firstChild) body.appendChild(pane.firstChild);
    card.append(cardHead(paneId), body);
    pane.appendChild(card);
    return card;
  }

  function decorateTestcase() {
    const pane = document.getElementById("testcase");
    if (!pane) return;

    // 破壞性警告放在動作旁邊，不藏在 dropzone 內文裡
    const alert = el("div", "ojui-alert");
    alert.innerHTML =
      ICON.warn +
      "<div><b>拖拉上傳會刪除下方全部既有測資。</b> 上傳前請先用右上角「題目搬移 → 匯出 zip」備份。</div>";
    pane.prepend(alert);

    pane.querySelectorAll('input[type="number"]').forEach((inp) => {
      const unit = inp.name === "memory_limit" ? "MB" : "sec";
      if (inp.parentElement?.classList.contains("ojui-unit")) return;
      inp.classList.add("ojui-cellinp");
      const w = el("span", "ojui-unit");
      inp.before(w);
      w.appendChild(inp);
      const s = el("span", "ojui-unit-suffix");
      s.textContent = unit;
      w.appendChild(s);
    });

    const table = pane.querySelector("table");
    if (table && !table.closest(".ojui-table-wrap")) {
      const w = el("div", "ojui-table-wrap");
      table.before(w);
      w.appendChild(table);
      const headRow = table.querySelector("tr:has(th)");
      if (headRow && headRow.parentElement.tagName !== "THEAD") {
        const thead = el("thead");
        thead.appendChild(headRow);
        table.prepend(thead);
      }
    }

    pane.querySelectorAll("button").forEach((b) => {
      const t = (b.textContent || "").trim();
      if (!t || b.closest(".ojui-menu")) return;
      b.className =
        "ojui-btn ojui-btn-sm " +
        (/delete/i.test(t) ? "ojui-btn-danger" : "ojui-btn-ghost");
    });
  }

  /* ---------- 主流程 ---------- */
  window.addEventListener("load", () => {
    if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;
    if (document.querySelector(".ojui")) return;

    const h2 = document.querySelector("h2");
    const oldNav = document.querySelector(".nav-tabs");
    const content = document.querySelector(".tab-content");
    if (!h2 || !oldNav || !content) {
      console.warn("[OJ Helper] Edit 頁結構與預期不符，維持原樣");
      return;
    }

    // edit.js 的 hide_field()/choose_judge_* 靠 .parent().parent() 往上爬兩層
    // 找容器，版面一改就會 hide 到錯的東西。先解掉它的綁定，改由本檔接管。
    if (window.jQuery) {
      jQuery("#id_judge_type").off("change");
      jQuery("#id_judge_source").off("change");
      jQuery("a[role='tab']").off("click");
    }
    ["id_judge_type", "id_judge_source"].forEach((id) =>
      document.getElementById(id)?.removeAttribute("onchange"),
    );

    document.body.classList.add("ojui-page");
    const root = el("div", "ojui");
    h2.before(root);

    root.appendChild(buildHeader(h2));
    h2.remove();

    const shell = el("div", "ojui-shell");
    const main = el("section");

    let railItems = [];
    const select = (idx) => {
      railItems.forEach((b, i) => {
        const on = i === idx;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
        const pane = document.getElementById(PANES[i].id);
        if (pane) pane.hidden = !on;
      });
      history.replaceState(null, "", "?tab=" + PANES[idx].id);
    };

    const rail = buildRail(select);
    railItems = rail.items;

    content.querySelectorAll(".tab-pane").forEach((p) => {
      p.classList.remove("tab-pane", "active", "fade", "in");
      p.classList.add("ojui-panel");
      p.removeAttribute("style");
    });

    shell.append(rail.aside, main);
    main.appendChild(content);
    root.appendChild(shell);
    oldNav.remove();

    const sync = () => refreshStatus(railItems);
    restructureInfo(sync);
    ["sample_io", "tag"].forEach((id) => wrapPane(id));
    wrapPane("description", true);
    decorateTestcase();
    wrapPane("testcase", false);

    // ?tab= 深連結
    const want = new URLSearchParams(location.search).get("tab");
    const idx = Math.max(0, PANES.findIndex((p) => p.id === want));
    select(idx);
    sync();

    document.addEventListener("input", () => {
      markDirty();
      sync();
    });
    document.addEventListener("change", sync);

    document.addEventListener("keydown", (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        document.getElementById("ojui-save")?.click();
      } else if (k === "p") {
        e.preventDefault();
        document.getElementById("ojui-preview")?.click();
      } else if ("12345".includes(e.key)) {
        e.preventDefault();
        select(+e.key - 1);
      }
    });

    window.addEventListener("beforeunload", (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    });
  });
})();
