// Scoreboard 分數分布：在 Testcase / Penalty 分頁上方畫柱狀圖，
// 最上面一張是全部題目加總（Total），底下每題各一張。
//
// 資料直接從 Testcase 表格讀：中間每格是「通過/總數」，最後一格是 Total。
// 橫軸 0..滿分每個分數都畫一根，沒人拿到的分數畫成空柱，分布才不會被
// 壓縮變形。格子不是 a/b（例如沒交）一律當 0 分，跟 Total 的算法一致。
(function () {
  "use strict";

  const table = document.querySelector("#scoreboardTab ~ .tab-content #testcase table");
  if (!table) return;

  const MAX_BARS = 40; // 滿分太大時合併成區間，避免柱子細到看不見

  const heads = [...table.tHead.rows[0].cells].slice(2, -1);
  const rows = [...table.tBodies[0].rows]
    .map((tr) => [...tr.cells].map((td) => td.textContent.trim()))
    // 表格最底下有一列 Rank 欄寫「Total」的全班加總，不是隊伍
    .filter((c) => c.length === heads.length + 3 && /^\d+$/.test(c[0]));
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
  const totals = rows.map((c) => Number(c.at(-1)) || 0);
  const full = problems.reduce((s, p) => s + p.full, 0);

  const box = document.createElement("div");
  box.className = "ojsb-wrap";
  box.append(chart("全部題目 Total", totals, full, "ojsb-main"));
  if (problems.length) {
    const grid = document.createElement("div");
    grid.className = "ojsb-grid";
    for (const p of problems)
      grid.append(chart(p.title ? `${p.name} · ${p.title}` : p.name, p.values, p.full));
    box.append(grid);
  }
  document.getElementById("scoreboardTab").closest("[role=tabpanel]").before(box);

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
    const done = values.filter((v) => max && v >= max).length;

    const el = document.createElement("div");
    el.className = "ojsb-chart" + (extra ? " " + extra : "");
    const head = document.createElement("div");
    head.className = "ojsb-head";
    const t = document.createElement("b");
    t.textContent = name;
    head.append(t, ` ${values.length} 隊 · 平均 ${avg.toFixed(1)} / ${max} · 滿分 ${done} 隊`);
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
