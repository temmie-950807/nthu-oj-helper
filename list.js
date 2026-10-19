// 題目列表頁（/problem/，含 ?filter=mine、?page= 等 query）：
// 1. 拿掉 Pass Rate 欄——出題者看自己的題目時它只是一排沒意義的進度條。
// 2. 自己（或管理員）能編輯的題目，在題號左邊新增一欄標出公開 / 隱藏。
//
// 列表本身沒有 visible 資料，只能逐題去讀 Edit 頁的 checkbox。只有 Edit 鈕
// 存在的列才讀：那代表有編輯權，Edit 頁才讀得到；別人的題目讀了也是被擋。
(function () {
  "use strict";

  // manifest 的 match pattern 對 query 不可靠，這組又涵蓋 /problem/* 全部，
  // 在這裡只放行列表本身
  if (location.pathname !== "/problem/") return;

  const heads = [...document.querySelectorAll("table thead th")];
  const head = (name) =>
    heads.find((th) => th.textContent.trim().toLowerCase() === name);
  const rate = head("pass rate");
  const num = head("#");
  const table = (rate || num)?.closest("table");
  if (!table) return;

  // 用表頭文字找 index，不寫死 nth-child：OJ 哪天加減欄位也不會藏錯
  const rows = [...table.tBodies].flatMap((tb) => [...tb.rows]);
  if (rate) {
    const i = rate.cellIndex;
    rate.style.display = "none";
    for (const tr of rows) if (tr.cells[i]) tr.cells[i].style.display = "none";
  }
  if (!num) return;

  // 狀態獨立成一欄放在題號左邊，掃一眼就能看出哪幾題還沒公開。每列都要
  // 補一格，別人的題目留空，欄位才不會錯位。
  const i = num.cellIndex;
  const th = document.createElement("th");
  th.title = "公開 / 隱藏";
  num.before(th);
  const slots = new Map(rows.map((tr) => [tr, tr.cells[i] ? tr.insertCell(i) : null]));

  const EYE =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7c1.9 0 3.6-.6 5-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/></svg>';

  const jobs = [];
  for (const tr of rows) {
    const edit = tr.cells[0]?.querySelector('a[href$="/edit/"]');
    const pid = edit?.getAttribute("href").match(/^\/problem\/(\d+)\/edit\/$/)?.[1];
    const cell = slots.get(tr);
    if (pid && cell) jobs.push(() => mark(pid, cell));
  }

  // 一頁最多 15 題，同時開 4 條就好，別一次對 OJ 打 15 個 Edit 頁
  const worker = async () => {
    for (let job; (job = jobs.shift()); ) await job();
  };
  for (let n = 0; n < 4; n++) worker();

  async function mark(pid, cell) {
    let visible;
    try {
      const r = await fetch(`/problem/${pid}/edit/`, { credentials: "same-origin" });
      if (!r.ok) return;
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      const box = doc.querySelector('[name="visible"]');
      // 讀不到 checkbox（被導去登入頁、OJ 改版）就不標，總比標錯好
      if (!box) return;
      visible = box.checked;
    } catch (_) {
      return; // 單題失敗只少一顆 ICON，不影響其他列
    }
    const s = document.createElement("span");
    s.title = visible ? "公開" : "隱藏";
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", s.title);
    // 公開是常態用 muted 壓低存在感；隱藏才是要注意的，用 gold 讓它跳出來
    s.style.cssText = `display:inline-block;line-height:0;vertical-align:-2px;color:var(${visible ? "--muted" : "--gold"})`;
    s.innerHTML = visible ? EYE : EYE_OFF;
    cell.append(s);
  }
})();
