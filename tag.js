/* ============================================================
   tag.js — NTHU OJ Edit 頁 Tag 分頁改造
   把原本的 table + Delete 按鈕換成 chip 群，並修掉原站 edit.js
   del_tag_btn 重複綁定造成「刪一個 tag 送出 N 個請求」的 bug。

   資料模型：原本的 <tbody id="tagTable"> 是唯一真實來源（source of
   truth），chip 群只是它的視圖。理由：
   - ui.js 的 readiness 用 document.querySelectorAll("#tagTable tr").length 算數量
   - 原站 #preview_button 用 $('#tagTable td:first-child') 撈 tag 名字送預覽
   兩者都直接讀 table，所以 table 必須留著且內容正確。做成「單向來源 +
   重繪視圖」而不是「雙向同步」，是因為雙向同步一定會出現兩邊不一致的
   狀態，而重繪不會。table 本身用 hidden 藏起來。

   .del_tag_btn 同時掛在 chip 的 × 上（不只留在隱藏的 table 裡）：
   一個只存在於隱藏節點、按了不會有事的 class 等於死掉的標記，之後的
   稽核會誤判。實際可按的控制項帶著這個 class 才是語意不變。
   ============================================================ */
(function () {
  "use strict";

  var busy = false;
  var pid, pane, host, tbody, form, chips, submitBtn;

  function csrf() {
    var i = document.querySelector('input[name="csrfmiddlewaretoken"]');
    return i ? i.value : "";
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- 錯誤顯示（不能只 console.error） ---------- */
  function clearError() {
    var e = host.querySelector(".ojtag-err");
    if (e) e.remove();
  }

  function showError(msg) {
    clearError();
    var box = el("div", "ojui-alert ojtag-err");
    box.setAttribute("role", "alert");
    var b = el("b", null, "Tag 操作失敗：");
    box.append(b, document.createTextNode(" " + msg));
    host.prepend(box);
  }

  /* ---------- 伺服器 API（端點與參數不可變動） ---------- */
  // GET 刪除是伺服器既有設計，改不了；X-CSRFToken 還是照送，之後伺服器
  // 若補上 CSRF 檢查，這裡不用再動。X-Requested-With 是給 Django 舊版
  // request.is_ajax() 用的，jQuery 會自動帶，換成 fetch 就得自己補。
  function headers(extra) {
    var h = {
      "X-CSRFToken": csrf(),
      "X-Requested-With": "XMLHttpRequest",
    };
    if (extra) Object.assign(h, extra);
    return h;
  }

  function apiAdd() {
    var body = new URLSearchParams(new FormData(form));
    if (!body.get("csrfmiddlewaretoken")) body.set("csrfmiddlewaretoken", csrf());
    return fetch("/problem/" + pid + "/tag/", {
      method: "POST",
      credentials: "same-origin",
      headers: headers({
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      }),
      body: body,
    }).then(function (res) {
      if (!res.ok) throw new Error("伺服器回應 HTTP " + res.status);
      return res.json().catch(function () {
        throw new Error("伺服器回傳的不是 JSON（可能是登入逾時，請重新整理）");
      });
    });
  }

  function apiDelete(id) {
    return fetch("/problem/" + pid + "/tag/" + id + "/delete/", {
      method: "GET",
      credentials: "same-origin",
      headers: headers(),
    }).then(function (res) {
      if (!res.ok) throw new Error("伺服器回應 HTTP " + res.status);
    });
  }

  /* ---------- 視圖 ---------- */
  function rows() {
    return Array.prototype.slice.call(tbody.querySelectorAll("tr[data-target]"));
  }

  function nameOf(tr) {
    return (tr.cells[0] ? tr.cells[0].textContent : "").trim();
  }

  // 與原站 edit.js add_new_tag() 產生的 markup 一致，避免其他依賴這個
  // 結構的程式碼（preview 送出、未來的稽核）看到不一樣的東西。
  function addRow(id, name) {
    var tr = el("tr");
    tr.setAttribute("data-target", String(id));
    var td2 = el("td");
    var b = el("button", "btn btn-primary del_tag_btn", "Delete");
    b.type = "button";
    td2.appendChild(b);
    tr.append(el("td", null, name), td2);
    tbody.appendChild(tr);
  }

  function chip(id, name) {
    var c = el("span", "ojtag-chip");
    c.setAttribute("data-target", String(id));
    var x = el("button", "ojtag-x del_tag_btn", "×");
    x.type = "button";
    x.title = "刪除 " + name;
    x.setAttribute("aria-label", "刪除 tag " + name);
    c.append(el("span", "ojtag-name", name), x);
    return c;
  }

  function render() {
    chips.textContent = "";
    var rs = rows();
    if (!rs.length) {
      chips.appendChild(el("p", "ojtag-empty", "尚未加入任何 tag。"));
    } else {
      rs.forEach(function (tr) {
        chips.appendChild(chip(tr.getAttribute("data-target"), nameOf(tr)));
      });
    }
    // ui.js 的 readiness 卡片是靠 document 上的 change 事件重算的，
    // 而增刪 tag 不會自然產生 change，不補這一發數字會停在舊值。
    document.dispatchEvent(new Event("change"));
  }

  function setBusy(on) {
    busy = on;
    host.classList.toggle("ojtag-busy", on);
    chips.querySelectorAll("button").forEach(function (b) {
      b.disabled = on;
    });
    if (submitBtn) {
      submitBtn.disabled = on;
      setLabel(submitBtn, on ? "處理中…" : submitBtn.dataset.ojtagLabel);
    }
  }

  function setLabel(btn, text) {
    if (btn.tagName === "INPUT") btn.value = text;
    else btn.textContent = text;
  }

  /* ---------- 刪除 ---------- */
  // 用 document 的 capture 階段接手：原站 refreshEventListener() 每次新增
  // tag 都會再跑一次 $('body').on('click', '.del_tag_btn', …)，綁 N 次就
  // 送 N 個請求。下面 init() 會先 off 掉既有的，但 refreshEventListener
  // 是我看不到的程式碼、之後仍可能被別的路徑呼叫，所以這裡在 capture
  // 階段就 stopImmediatePropagation：事件根本到不了 body，晚一步綁上去
  // 的 handler 一樣不會被觸發。單一 handler、單一請求。
  function onDelClick(e) {
    var btn = e.target && e.target.closest && e.target.closest(".del_tag_btn");
    if (!btn || !pane.contains(btn)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (busy) return;

    var row = btn.closest("[data-target]");
    var id = row && row.getAttribute("data-target");
    if (!id) return;
    var tr = tbody.querySelector('tr[data-target="' + id + '"]');
    var name = tr ? nameOf(tr) : id;

    if (!window.confirm("確定要刪除 tag「" + name + "」嗎？此動作無法復原。"))
      return;

    clearError();
    setBusy(true);
    apiDelete(id)
      .then(function () {
        if (tr) tr.remove();
        render();
      })
      .catch(function (err) {
        showError("刪除「" + name + "」失敗，" + err.message + "。tag 未被刪除。");
      })
      .then(function () {
        setBusy(false);
      });
  }

  /* ---------- 新增 ---------- */
  function onSubmit(e) {
    if (e) e.preventDefault();
    if (busy) return false;

    var input =
      form.querySelector("#id_tag_name") ||
      form.querySelector('input[type="text"]');
    var name = input ? input.value.trim() : "";
    if (!name) {
      showError("請先輸入 tag 名稱。");
      if (input) input.focus();
      return false;
    }
    if (
      rows().some(function (tr) {
        return nameOf(tr).toLowerCase() === name.toLowerCase();
      })
    ) {
      showError("「" + name + "」已經在清單裡了。");
      return false;
    }

    clearError();
    setBusy(true);
    apiAdd()
      .then(function (data) {
        if (!data || data.tag_id == null)
          throw new Error("回應裡沒有 tag_id");
        addRow(data.tag_id, name);
        render();
        if (input) input.value = "";
      })
      .catch(function (err) {
        showError("新增「" + name + "」失敗，" + err.message + "。");
      })
      .then(function () {
        setBusy(false);
      });
    return false;
  }

  /* ---------- 進入點 ---------- */
  window.addEventListener("load", function () {
    if (!/\/problem\/\d+\/edit/.test(location.pathname)) return;
    var m = location.pathname.match(/\/problem\/(\d+)/);
    if (!m) return;
    pid = m[1];

    pane = document.getElementById("tag");
    if (!pane || pane.dataset.ojtag) return;
    tbody = pane.querySelector("#tagTable");
    form = pane.querySelector("#addTag");
    if (!tbody || !form) return;
    pane.dataset.ojtag = "1";

    // ui.js 會把 #tag 的內容搬進 .ojui-card-body。它和本檔都掛在 load 上，
    // 誰先跑取決於 manifest 的順序，所以兩種情況都要能落在正確的容器裡：
    // 它先跑 → 直接放進 card body；本檔先跑 → 之後連同 chip 一起被搬進去。
    host = pane.querySelector(".ojui-card-body") || pane;

    // 清掉原站已經重複綁上去的委派 handler（capture 攔截是第二道保險）。
    if (window.jQuery) {
      jQuery("body").off("click", ".del_tag_btn");
      jQuery("#addTag").off("submit");
    }
    form.removeAttribute("onsubmit");
    // 樣板裡的 inline onsubmit="return add_new_tag(pid)" 若在別處還有殘留
    // 呼叫，一併導到這裡；重入由 busy 擋掉，不會變成送兩次。
    window.add_new_tag = function () {
      return onSubmit(null);
    };

    var table = tbody.closest("table") || tbody;
    table.classList.add("ojtag-mirror");
    table.hidden = true;

    chips = el("div", "ojtag-chips");
    table.before(chips);

    form.classList.add("ojtag-add");
    submitBtn = form.querySelector('[type="submit"], button');
    if (!submitBtn) {
      submitBtn = el("button", null, "新增 tag");
      submitBtn.type = "submit";
      form.appendChild(submitBtn);
    }
    // 用 add 而非覆寫：不確定 django-autocomplete-light 的 widget 有沒有在
    // 這顆按鈕上掛自己的 hook class
    submitBtn.classList.remove("btn", "btn-primary", "btn-default");
    submitBtn.classList.add("ojui-btn", "ojui-btn-primary");
    submitBtn.dataset.ojtagLabel =
      submitBtn.tagName === "INPUT" ? submitBtn.value : submitBtn.textContent;

    form.addEventListener("submit", onSubmit);
    document.addEventListener("click", onDelClick, true);
    render();
  });
})();
