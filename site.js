// 全站樣式的掛載點。只做兩件事：標記 body 讓 site.css 生效、在 navbar
// 放一顆主題切換鈕。不重建任何 DOM——Edit 頁以外的頁面沒有經過驗證，
// 動版面風險太高。
(function () {
  "use strict";

  const start = () => {
    document.body.classList.add("ojui-site");
    dropTestcaseNoise();
    addThemeButton();
  };

  // OJ 每動一筆測資就發一則訊息（problem/views.py:245「testcase N saved」、
  // :294「testcase N deleted」），而 message.html 把每則都畫成一整條置中的
  // <h3> 橫幅。匯入 20 筆測資就是 40 條，整個題目被推到螢幕外。
  // 這些訊息沒有資訊量——測資表格本身就是結果。整批拿掉，其他訊息
  //（例如 problem N edited，那是存檔成功的確認）留著。
  function dropTestcaseNoise() {
    document.querySelectorAll(".alert-dismissible").forEach((a) => {
      const h = a.querySelector("h3");
      if (h && /^testcase\s+\d+\s+(saved|deleted)$/i.test(h.textContent.trim()))
        a.remove();
    });
  }

  function addThemeButton() {
    if (document.querySelector(".ojui-theme-nav")) return;
    // 找 navbar 右側那一排（Logout 所在的 ul）
    const logout = [...document.querySelectorAll(".navbar a")].find((a) =>
      /logout/i.test(a.textContent || ""),
    );
    const host = logout?.closest("ul") || document.querySelector(".navbar-nav");
    if (!host) return;

    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ojui-theme-nav";

    const paint = () => {
      const dark = document.documentElement.dataset.ojTheme === "dark";
      b.title = dark ? "切換為亮色" : "切換為暗色";
      b.setAttribute("aria-label", b.title);
      b.innerHTML = dark
        ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
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
      // Edit 頁 header 那顆也要跟著換圖示
      document
        .querySelectorAll('.ojui-header-actions button[aria-label*="切換"]')
        .forEach((x) => x.dispatchEvent(new Event("oj:themechange")));
    });

    paint();
    li.appendChild(b);
    host.appendChild(li);
  }

  // content script 在 document_end 注入，此時 DOM 已完整、readyState 是
  // interactive，不必等 load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
