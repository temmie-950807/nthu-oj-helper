// Scoreboard 分數分布：在 Testcase / Penalty 分頁上方畫柱狀圖，
// 最上面一張是全部題目加總（Total），底下每題各一張。
//
// 資料直接從 Testcase 表格讀：中間每格是「通過/總數」，最後一格是 Total。
// 橫軸 0..滿分每個分數都畫一根，沒人拿到的分數畫成空柱，分布才不會被
// 壓縮變形。格子不是 a/b（例如沒交）一律當 0 分，跟 Total 的算法一致。
//
// 題目卡可以拖曳排序、按 ✕ 隱藏（Total 會扣掉隱藏題）；「學生人數」只取
// 排名前 N 隊，用來排除多開的備用 team。設定依比賽 ID 存在 localStorage。
(function () {
  "use strict";

  const table = document.querySelector("#scoreboardTab ~ .tab-content #testcase table");
  if (!table) return;

  const MAX_BARS = 40; // 滿分太大時合併成區間，避免柱子細到看不見

  const heads = [...table.tHead.rows[0].cells].slice(2, -1);
  const rows = [...table.tBodies[0].rows]
    .map((tr) => [...tr.cells].map((td) => td.textContent.trim()))
    // 表格最底下有一列 Rank 欄寫「Total」的全班加總，不是隊伍
    .filter((c) => c.length === heads.length + 3 && /^\d+$/.test(c[0]))
    // 取前 N 隊要靠名次，不要假設表格本來就排好
    .sort((a, b) => a[0] - b[0]);
  if (!rows.length) return;

  const problems = heads.map((th, i) => {
    const cells = rows.map((c) => c[i + 2].split("/").map(Number));
    return {
      name: th.textContent.trim(),
      title: th.querySelector("[title]")?.title || "",
      values: cells.map(([a]) => a || 0),
      full: Math.max(0, ...cells.map(([, b]) => b || 0)),
    };
  });

  const KEY = "ojsb:" + (location.pathname.match(/\d+/)?.[0] || "");
  let st = {};
  try {
    st = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    /* 壞掉的設定就當沒有 */
  }
  st.hidden ||= [];
  st.order ||= [];
  const save = () => localStorage.setItem(KEY, JSON.stringify(st));

  const box = document.createElement("div");
  box.className = "ojsb-wrap";

  const tools = document.createElement("div");
  tools.className = "ojsb-tools";
  const size = document.createElement("input");
  size.type = "number";
  size.min = "1";
  size.placeholder = `全部 ${rows.length}`;
  size.value = st.n || "";
  size.addEventListener("change", () => {
    st.n = parseInt(size.value, 10) > 0 ? parseInt(size.value, 10) : null;
    save();
    render();
  });
  const sizeLabel = document.createElement("label");
  sizeLabel.append("學生人數 ", size);
  const chips = document.createElement("span");
  chips.className = "ojsb-chips";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "重設";
  reset.addEventListener("click", () => {
    st = { hidden: [], order: [] };
    size.value = "";
    save();
    render();
  });
  tools.append(sizeLabel, chips, reset);

  const charts = document.createElement("div");
  box.append(tools, charts);
  document.getElementById("scoreboardTab").closest("[role=tabpanel]").before(box);

  let dragging = null;
  render();

  function render() {
    const n = st.n || rows.length;
    const pos = (p) => {
      const i = st.order.indexOf(p.name);
      return i < 0 ? 1e9 + problems.indexOf(p) : i;
    };
    const shown = problems
      .filter((p) => !st.hidden.includes(p.name))
      .sort((a, b) => pos(a) - pos(b));
    const hidden = problems.filter((p) => st.hidden.includes(p.name));

    // 用原本的 Total 扣掉隱藏題，沒隱藏時就跟表格完全一致
    const totals = rows
      .slice(0, n)
      .map((c, i) => (Number(c.at(-1)) || 0) - hidden.reduce((s, p) => s + p.values[i], 0));
    const full = shown.reduce((s, p) => s + p.full, 0);

    chips.replaceChildren();
    if (hidden.length) chips.append("已隱藏：");
    for (const p of hidden) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${p.name} ↺`;
      b.title = "顯示這題";
      b.addEventListener("click", () => {
        st.hidden = st.hidden.filter((h) => h !== p.name);
        save();
        render();
      });
      chips.append(b);
    }

    charts.replaceChildren(chart("全部題目 Total", totals, full, "ojsb-main"));
    if (!shown.length) return;
    const grid = document.createElement("div");
    grid.className = "ojsb-grid";
    for (const p of shown) {
      const el = chart(p.title ? `${p.name} · ${p.title}` : p.name, p.values.slice(0, n), p.full);
      const hide = document.createElement("button");
      hide.type = "button";
      hide.className = "ojsb-hide";
      hide.textContent = "✕";
      hide.title = "隱藏這題（Total 會扣掉）";
      hide.addEventListener("click", () => {
        st.hidden.push(p.name);
        save();
        render();
      });
      el.append(hide);

      el.draggable = true;
      el.addEventListener("dragstart", (e) => {
        dragging = p.name;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", p.name); // Firefox 沒 setData 拖不起來
        el.classList.add("ojsb-dragging");
      });
      el.addEventListener("dragend", () => {
        dragging = null;
        el.classList.remove("ojsb-dragging");
      });
      el.addEventListener("dragover", (e) => {
        if (dragging && dragging !== p.name) e.preventDefault();
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        const names = shown.map((q) => q.name);
        const to = names.indexOf(p.name);
        names.splice(names.indexOf(dragging), 1);
        names.splice(to, 0, dragging); // 拖到誰身上就佔誰的位置
        st.order = names.concat(hidden.map((q) => q.name));
        save();
        render();
      });
      grid.append(el);
    }
    charts.append(grid);
  }

  function chart(name, values, max, extra) {
    max = Math.max(max, ...values);
    const width = Math.ceil((max + 1) / MAX_BARS);
    const bins = Array.from({ length: Math.floor(max / width) + 1 }, (_, i) => ({
      lo: i * width,
      hi: Math.min(max, i * width + width - 1),
      n: 0,
    }));
    for (const v of values) bins[Math.min(bins.length - 1, Math.floor(v / width))].n++;
    const peak = Math.max(1, ...bins.map((b) => b.n));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    const el = document.createElement("div");
    el.className = "ojsb-chart" + (extra ? " " + extra : "");
    const head = document.createElement("div");
    head.className = "ojsb-head";
    const t = document.createElement("b");
    t.textContent = name;
    const stat = document.createElement("div");
    stat.textContent = `平均 ${avg.toFixed(1)} / ${max}`;
    head.append(t, stat);
    const plot = document.createElement("div");
    plot.className = "ojsb-plot";
    for (const b of bins) {
      const label = b.lo === b.hi ? `${b.lo}` : `${b.lo}–${b.hi}`;
      const col = document.createElement("div");
      col.className = "ojsb-col";
      col.title = `${label} 分：${b.n} 隊`;
      col.innerHTML = `<span class="ojsb-n"></span><div class="ojsb-bar"></div><span class="ojsb-x"></span>`;
      col.querySelector(".ojsb-n").textContent = b.n || "";
      col.querySelector(".ojsb-bar").style.height = `${(b.n / peak) * 100}%`;
      col.querySelector(".ojsb-x").textContent = label;
      plot.append(col);
    }
    el.append(head, plot);
    return el;
  }
})();
