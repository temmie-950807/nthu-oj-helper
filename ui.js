(function () {
  "use strict";

  const VERSION = "7.8"; // 寫進 .ojui[data-oj-version]，方便從頁面確認載入的是哪一版

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

    actions.appendChild(buildThemeToggle());
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
      // 不在這裡清 isDirty：judge type 的確認框若被取消、或後端驗證退回，
      // 頁面根本沒送出，dirty 旗標一旦清掉就再也擋不住誤關分頁。
      b.addEventListener("click", () => n.click());
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

  // 亮暗切換。實際的主題狀態寫在 html[data-oj-theme]，由 guard.js 在
  // document_start 先決定（使用者選過就用選的，沒選過跟隨系統），
  // 這裡只負責翻轉並記住。
  function buildThemeToggle() {
    const b = el("button", "ojui-btn ojui-btn-quiet");
    b.type = "button";
    const paint = () => {
      const dark = document.documentElement.dataset.ojTheme === "dark";
      b.title = dark ? "切換為亮色" : "切換為暗色";
      b.setAttribute("aria-label", b.title);
      b.innerHTML = dark
        ? svg(
            '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
            'width="15" height="15"',
          )
        : svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', 'width="15" height="15"');
    };
    b.addEventListener("click", () => {
      const next =
        document.documentElement.dataset.ojTheme === "dark" ? "light" : "dark";
      document.documentElement.dataset.ojTheme = next;
      try {
        localStorage.setItem("oj_theme", next);
      } catch (_) {
        /* 存不了就只在這次瀏覽有效 */
      }
      paint();
    });
    paint();
    return b;
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

    // transfer.js 已經把匯出/匯入按鈕做好了，搬進選單重用，不重寫一份。
    // 連同它的狀態列一起搬——那個 span 是匯出進度（「下載測資 3/10…」）與
    // 錯誤訊息的唯一出口，留在原地隨 bar 被移除的話，整個匯出過程會毫無回饋。
    const bar = document.getElementById("oj-transfer-bar");
    if (bar) {
      [...bar.querySelectorAll("button")].forEach((b) => {
        b.className = "";
        menu.appendChild(b);
      });
      bar.querySelectorAll('input[type="file"]').forEach((i) => menu.appendChild(i));
      const status = [...bar.querySelectorAll("span")].pop();
      if (status) {
        status.style.cssText =
          "display:block;padding:6px 10px 4px;font-size:12px;color:var(--muted);";
        menu.appendChild(status);
      }
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
    seg.__paint = paint; // 值被外部改動時（例如匯入 zip）要能重畫
    return seg;
  }

  // 原生 select 看不到選項說明，換成 radio card。
  // 只列出與目前 judge_source 前綴相符的選項——後端 clean_judge_type 會擋
  // LOCAL 配 OTHER_* 這種組合，前端先擋掉才不會存到一半被拒。
  function buildRadioCards(sel, onChange) {
    const box = el("div");
    box.id = "ojui-judge-type-cards";
    // select 放在 box、卡片放在 list。重繪只清 list——早期版本清的是 box，
    // 連 select 一起清掉，judge_type 就不會被送出，後端 clean_partial_judge_code
    // 讀 cleaned_data['judge_type'] 直接 KeyError 500。
    const list = el("div", "ojui-radios");
    box.appendChild(list);

    const render = () => {
      const src = $n("judge_source")?.value || "LOCAL";
      list.innerHTML = "";
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
          list.appendChild(lab);
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

    // 原站只在「非管理員」時用 inline JS 藏 owner，管理員是可以改的。
    // 先記下原本可不可見，重建後照原樣，不要一律隱藏。
    const ownerGroup = groups.get("owner")?.g;
    const ownerWasHidden = ownerGroup
      ? ownerGroup.style.display === "none" ||
        getComputedStyle(ownerGroup).display === "none"
      : true;

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

    const ownerRow = body.querySelector('[data-field="owner"]');
    if (ownerRow && ownerWasHidden) ownerRow.hidden = true;

    const card = el("div", "ojui-card");
    card.append(cardHead("info"), body);
    info.appendChild(card);
    applyConditional();
  }

  // Split / Write / Preview。掛在 Description 卡片頭右側，一次控制該卡片
  // 底下三個編輯器（description / input / output）。
  function buildModeSeg(card) {
    const MODES = [
      ["Split", ""],
      ["Write", "is-write"],
      ["Preview", "is-preview"],
    ];
    const seg = el("div", "ojui-seg");
    const btns = MODES.map(([label, cls]) => {
      const b = el("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        card
          .querySelectorAll(".ojmd-row")
          .forEach((r) => (r.className = "ojmd-row" + (cls ? " " + cls : "")));
        btns.forEach((x, i) =>
          x.setAttribute("aria-selected", MODES[i][1] === cls ? "true" : "false"),
        );
      });
      seg.appendChild(b);
      return b;
    });
    btns[0].setAttribute("aria-selected", "true");
    return seg;
  }

  // editor.js 的接管是異步的（要等 CKEditor ready），可能早於也可能晚於
  // 這裡建卡片。所以主流程結束時掃一次，並持續監聽晚到的通知。
  function attachModeSeg() {
    document.querySelectorAll(".ojui-card").forEach((card) => {
      if (!card.querySelector(".ojmd-row")) return;
      const head = card.querySelector(".ojui-card-head");
      if (!head || head.querySelector(".ojui-seg")) return;
      const tools = el("div", "ojui-card-tools");
      tools.appendChild(buildModeSeg(card));
      head.appendChild(tools);
    });
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

    // 單位後綴插在 input 之後當兄弟節點。關鍵是只插入、不搬動 input：
    // #add_testcase 那個 <form> 寫在 <tr> 裡是非法 HTML，parser 會把它插成
    // 空元素、靠 form element pointer 幫後續 input 標上 form owner。一旦把
    // input 搬進新的 <span>，「reset the form owner」會清掉 parser inserted
    // flag，而 form 又不是它的祖先 → form owner 永久變成 null，Add Testcase
    // 送出時就少了 time_limit / memory_limit。實測確認過。
    pane.querySelectorAll('input[type="number"]').forEach((inp) => {
      const td = inp.closest("td");
      if (!td || td.classList.contains("ojui-unit-td")) return;
      inp.classList.add("ojui-cellinp");
      td.classList.add("ojui-unit-td");
      const suffix = el("span", "ojui-unit-suffix");
      suffix.textContent = inp.name === "memory_limit" ? "MB" : "sec";
      inp.after(suffix);
    });

    // content.js 的拖曳區是舊配色的 inline style，跟新設計語彙對不上
    const dz = [...pane.querySelectorAll("div")].find((d) =>
      /將所有的|拖拉到這裡/.test(d.textContent || ""),
    );
    if (dz && !dz.dataset.ojuiStyled) {
      dz.dataset.ojuiStyled = "1";
      dz.style.cssText =
        "border:2px dashed var(--hair);border-radius:10px;background:var(--surface);" +
        "padding:28px 20px;text-align:center;margin:0 0 14px;font-size:14px;" +
        "color:var(--muted);cursor:pointer;";
    }

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
      // 原始表頭只有 5 個 th，但資料列有 in/out/time/memory 加三顆按鈕共 7 個
      // td（再加上列號欄就是 8）。欄數對不上時表頭底色只會鋪到一半。
      const bodyRow = [...table.querySelectorAll("tbody tr")].find((r) =>
        r.querySelector("td"),
      );
      const hr = table.querySelector("thead tr");
      if (hr && bodyRow) {
        for (let i = hr.children.length; i < bodyRow.children.length; i++) {
          hr.appendChild(el("th"));
        }
      }
    }

    // 只移除 Bootstrap 的外觀 class，保留 .update_btn / .reupload_btn /
    // .del_testcase_btn ——那三個是 edit.js 委派 handler 的掛勾，整串覆寫
    // className 會讓測資的 Update / Delete / ReUpload 全部靜默失效，連帶
    // 讓 transfer.js 與 content.js 的「先清空舊測資」跳過刪除變成疊加。
    pane.querySelectorAll("button").forEach((b) => {
      const t = (b.textContent || "").trim();
      if (!t || b.closest(".ojui-menu") || b.classList.contains("ojui-btn")) return;
      b.classList.remove(
        "btn",
        "btn-primary",
        "btn-danger",
        "btn-info",
        "btn-warning",
        "btn-default",
        "btn-success",
      );
      b.classList.add(
        "ojui-btn",
        "ojui-btn-sm",
        /delete/i.test(t) ? "ojui-btn-danger" : "ojui-btn-ghost",
      );
    });
  }

  /* ---------- 主流程 ---------- */
  function boot() {
    if (document.querySelector(".ojui")) return;

    const h2 = document.querySelector("h2");
    const oldNav = document.querySelector(".nav-tabs");
    const content = document.querySelector(".tab-content");
    if (!h2 || !oldNav || !content) {
      console.warn("[OJ Helper] Edit 頁結構與預期不符，維持原樣");
      window.__ojLiftVeil?.(); // 沒接管成功也要讓原本的頁面看得到
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
    root.dataset.ojVersion = VERSION;
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
    attachModeSeg();
    document.addEventListener("ojmd:ready", attachModeSeg);

    // readiness 會重畫 innerHTML，不能每個按鍵都跑一次
    let syncTimer;
    const syncSoon = () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(sync, 200);
    };
    // 只有 #problem_info 內的變更算「未儲存」——Tag 與 TestCase 是各自
    // 獨立送出的 AJAX，跟這張表單的存檔無關，不該讓離開警告誤跳。
    // 但 readiness 兩邊都要跟著更新。
    document.addEventListener("input", (e) => {
      if (e.target?.closest?.("#problem_info")) markDirty();
      syncSoon();
    });
    document.addEventListener("change", (e) => {
      if (e.target?.closest?.("#problem_info")) markDirty();
      syncSoon();
    });

    // 匯入 zip 之類的外部寫入只會改 select.value + 發 change，
    // 不重畫的話 segmented 與 radio card 會顯示舊值，跟實際送出的不一致。
    ["judge_source", "judge_type"].forEach((n) => {
      $n(n)?.addEventListener("change", () => {
        document.querySelector(".ojui-seg")?.__paint?.();
        document.getElementById("ojui-judge-type-cards")?.__render?.();
        applyConditional();
        syncSoon();
      });
    });

    const pForm = document.getElementById("problem_info");
    // ui.js 是最後載入的，跑到這裡還沒被 preventDefault 就代表真的會送出
    pForm?.addEventListener("submit", (e) => {
      if (!e.defaultPrevented) pForm.dataset.ojSubmitting = "1";
    });

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
      if (!isDirty || pForm?.dataset.ojSubmitting) return;
      e.preventDefault();
      e.returnValue = "";
    });

    window.__ojLiftVeil?.(); // 版面就緒，掀開 guard.js 蓋上的遮罩
  }

  window.addEventListener("load", () => {
    if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;

    // CKEditor 的編輯區是 iframe。iframe 在 DOM 中被移動會重新載入、內部
    // 參照失效，實例會整個炸掉（getDirection → getComputedStyle of undefined），
    // 連帶 instanceReady 永遠不觸發、editor.js 的接管一直等不到。
    // 所以等 editor.js 把 CKEditor 拆完再重建版面。
    const live = window.CKEDITOR ? Object.keys(CKEDITOR.instances).length : 0;
    if (!live) return boot();

    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      boot();
    };
    document.addEventListener("ojmd:done", go, { once: true });
    // 保險：CKEditor 若初始化失敗，instanceReady 不會來，版面仍要出得來
    setTimeout(go, 4000);
  });
})();
