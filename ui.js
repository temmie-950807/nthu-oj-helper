(function () {
  "use strict";

  const el = (tag, cls) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  };

  const SECTIONS = [
    {
      title: "基本資訊",
      desc: "題目的識別與可見性。",
      fields: ["pname", "owner", "visible"],
    },
    {
      title: "評測設定",
      desc: "決定這題怎麼被評測。",
      fields: ["judge_source", "judge_type", "judge_language", "other_judge_id"],
    },
    {
      title: "評測程式",
      desc: "只有 Special Judge 與 Partial Judge 題型需要上傳。",
      fields: ["special_judge_code", "partial_judge_code", "partial_judge_header"],
    },
  ];

  const HELP = {
    pname: "顯示在題目列表與題目頁最上方的標題。",
    owner: "擁有者帳號。只有本人與管理員能編輯這題。",
    visible: "取消勾選後，學生在題目列表看不到這題。",
    judge_source: "LOCAL 由本站評測；OTHER 代表題目掛在其他 OJ 上。",
    judge_type: "Batch 是一般題型。其他題型需要搭配下方的評測程式。",
    judge_language: "評測程式使用的語言。",
    other_judge_id: "Judge source 選 OTHER 時才需要填。",
    special_judge_code: "自訂比對程式，用來判斷答案是否正確。",
    partial_judge_code: "部分分數題型的評分程式。",
    partial_judge_header: "Partial judge 要引入的標頭檔。",
  };

  const UNIT = { time_limit: "秒", memory_limit: "MB" };

  function buildHeader(h2) {
    const header = el("header", "ojui-header");
    const raw = (h2.childNodes[0]?.textContent || "").trim();
    const m = raw.match(/^(\d+)\s*-\s*(.*)$/);

    const textWrap = el("div");
    const h1 = el("h1", "ojui-title");
    h1.textContent = m ? `Edit Problem ${m[1]}` : raw || "Edit Problem";
    textWrap.appendChild(h1);
    if (m && m[2]) {
      const sub = el("p", "ojui-subtitle");
      sub.textContent = m[2];
      textWrap.appendChild(sub);
    }

    const actions = el("div", "ojui-actions");
    // 原有的兩個連結降為次要動作
    [...h2.querySelectorAll("a")].forEach((a) => {
      a.className = "ojui-btn ojui-btn-outline";
      actions.appendChild(a);
    });

    // 表單底部的 Preview / Save 代理到這裡。用 .click() 觸發原本的 input，
    // 而不是 form.submit()——後者會跳過 submit handler，Markdown 就不會轉換。
    const form = document.getElementById("problem_info");
    const natives = [...(form?.querySelectorAll('input[type="submit"]') || [])];
    natives.forEach((n) => {
      const isSave = /save/i.test(n.value);
      const b = el(
        "button",
        "ojui-btn " + (isSave ? "ojui-btn-primary" : "ojui-btn-outline"),
      );
      b.type = "button";
      b.textContent = n.value;
      b.addEventListener("click", () => n.click());
      actions.appendChild(b);
      const holder = n.closest(".form-group") || n.parentElement;
      if (holder) holder.style.display = "none";
    });

    header.append(textWrap, actions);
    return header;
  }

  function buildTabs(oldNav) {
    const nav = el("nav", "ojui-tabs");
    nav.setAttribute("role", "tablist");
    const tabs = [];

    [...oldNav.querySelectorAll("a")].forEach((a) => {
      const target = (a.getAttribute("href") || "").replace(/^#/, "");
      if (!target) return;
      const btn = el("button", "ojui-tab");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-controls", target);
      btn.dataset.target = target;
      btn.textContent = a.innerText.trim();
      nav.appendChild(btn);
      tabs.push(btn);
    });

    const select = (idx) => {
      tabs.forEach((t, i) => {
        const on = i === idx;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        const pane = document.getElementById(t.dataset.target);
        if (pane) pane.classList.toggle("is-active", on);
      });
    };

    tabs.forEach((t, i) => t.addEventListener("click", () => select(i)));

    // ARIA tabs 的鍵盤慣例：左右鍵移動、Home/End 跳頭尾
    nav.addEventListener("keydown", (e) => {
      const cur = tabs.findIndex(
        (t) => t.getAttribute("aria-selected") === "true",
      );
      let next = null;
      if (e.key === "ArrowRight") next = (cur + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (cur - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      select(next);
      tabs[next].focus();
    });

    select(0);
    return { nav, tabs };
  }

  function toField(group, name) {
    const field = el("div", "ojui-field");
    const srcLabel = group.querySelector("label");
    const ctl = group.querySelector("input,select,textarea");

    const lab = el("label", "ojui-label");
    lab.textContent = (srcLabel?.innerText || name)
      .trim()
      .replace(/[:：]\s*$/, "");
    if (ctl) {
      if (!ctl.id) ctl.id = "ojui-" + name;
      lab.htmlFor = ctl.id;
    }

    const right = el("div");
    if (ctl && ctl.type === "checkbox") {
      const wrap = el("label", "ojui-check");
      wrap.appendChild(ctl); // appendChild 會把節點從舊位置搬過來
      wrap.appendChild(document.createTextNode("在題目列表中顯示"));
      right.appendChild(wrap);
    } else if (ctl) {
      right.appendChild(ctl);
    }
    if (HELP[name]) {
      const h = el("p", "ojui-help");
      h.textContent = HELP[name];
      right.appendChild(h);
    }

    field.append(lab, right);
    group.remove();
    return field;
  }

  function restructureInfo() {
    const info = document.getElementById("info");
    if (!info) return;

    const byName = new Map();
    [...info.querySelectorAll(".form-group")].forEach((g) => {
      const ctl = g.querySelector("input,select,textarea");
      if (ctl && ctl.name && ctl.type !== "submit") byName.set(ctl.name, g);
    });

    SECTIONS.forEach((sec) => {
      const box = el("section", "ojui-section");
      const h = el("h2", "ojui-section-title");
      h.textContent = sec.title;
      const d = el("p", "ojui-section-desc");
      d.textContent = sec.desc;
      box.append(h, d);

      sec.fields.forEach((name) => {
        const g = byName.get(name);
        if (!g) return;
        box.appendChild(toField(g, name));
        byName.delete(name);
      });

      if (box.querySelector(".ojui-field")) info.appendChild(box);
    });
  }

  function restyleTestcase() {
    const pane = document.getElementById("testcase");
    if (!pane) return;

    pane.querySelectorAll('input[type="number"]').forEach((inp) => {
      const unit = UNIT[inp.name];
      if (!unit || inp.parentElement?.classList.contains("ojui-unit")) return;
      const wrap = el("span", "ojui-unit");
      inp.before(wrap);
      wrap.appendChild(inp);
      const suf = el("span", "ojui-unit-suffix");
      suf.textContent = unit;
      wrap.appendChild(suf);
    });

    const table = pane.querySelector("table");
    if (table && !table.closest(".ojui-table-wrap")) {
      const wrap = el("div", "ojui-table-wrap");
      table.before(wrap);
      wrap.appendChild(table);
      // 表頭那列在 tbody 裡（OJ 原本就這樣寫），拉去 thead 才有正確樣式
      const headRow = table.querySelector("tr:has(th)");
      if (headRow && headRow.parentElement.tagName !== "THEAD") {
        const thead = el("thead");
        thead.appendChild(headRow);
        table.prepend(thead);
      }
    }

    pane
      .querySelectorAll('button, input[type="button"], input[type="submit"]')
      .forEach((b) => {
        const t = (b.textContent || b.value || "").trim();
        if (!t) return;
        b.className =
          "ojui-btn ojui-btn-sm " +
          (/delete/i.test(t) ? "ojui-btn-destructive" : "ojui-btn-outline");
      });
  }

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

    const root = el("div", "ojui");
    h2.before(root);

    root.appendChild(buildHeader(h2));
    h2.remove();

    const { nav } = buildTabs(oldNav);
    root.appendChild(nav);
    oldNav.remove();

    // Bootstrap 的 .tab-pane 靠 .active 控制顯示，改由 .ojui-panel 接手，
    // 免得兩套規則打架
    content.querySelectorAll(".tab-pane").forEach((p) => {
      p.classList.remove("tab-pane", "active", "fade", "in");
      p.classList.add("ojui-panel");
    });
    root.appendChild(content);

    restructureInfo();
    restyleTestcase();
  });
})();
