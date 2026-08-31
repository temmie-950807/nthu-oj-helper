(function () {
  "use strict";

  window.addEventListener("load", () => {
    const PANEL_ID = "nthu-oj-helper-panel";
    const STORAGE_LANG_KEY = "nthu_oj_last_lang";
    const STORAGE_HISTORY_KEY = "nthu_oj_file_history";
    const STORAGE_SIZE_KEY = "nthu_oj_panel_size";

    function injectUI() {
      if (document.getElementById(PANEL_ID)) return;

      const panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.innerHTML = `
                <div id="oj-panel-box" class="ojui-float">
                    <h4 class="ojui-float-title">批量提交</h4>

                    <div id="oj-batch-section" style="display: none;">
                        <label class="ojui-float-label">1. 選擇或拖曳批量檔案</label>
                        <div id="oj-drop-zone">
                            <p class="ojui-dz-main">將檔案拖曳至此</p>
                            <p class="ojui-dz-sub">或點擊選擇檔案</p>
                            <p id="oj-file-count">尚未選擇檔案</p>
                            <input type="file" id="oj-batch-files" multiple style="display: none;" />
                        </div>

                        <label class="ojui-float-label">2. 確認 Problem ID</label>
                        <input type="text" id="oj-batch-pid" />

                        <label class="ojui-float-label">3. 選擇上傳語言</label>
                        <select id="oj-batch-lang">
                            <option value="AUTO">🤖 自動判斷 (依副檔名)</option>
                            <option value="C">C</option>
                            <option value="CPP">C++</option>
                            <option value="CPP11">C++11</option>
                            <option value="CPP14">C++14</option>
                            <option value="CPP17">C++17</option>
                            <option value="JAVA">Java</option>
                            <option value="Python">Python</option>
                        </select>

                        <button id="oj-batch-submit-btn" type="button">執行批量上傳</button>
                        <div id="oj-status-msg">等待操作…</div>
                    </div>

                    <div id="oj-status-section" style="display: none;">
                        <p style="font-size: 13px; color: #28a745; font-weight: bold;">✅ Status 增強功能啟動</p>
                        <p style="font-size: 12px; color: #666;">（已將 SID 替換為 Filename 並新增測資方塊）</p>
                    </div>
                </div>
            `;
      document.body.appendChild(panel);

      // 還原上次拖出來的尺寸，並在每次縮放後記住
      const box = document.getElementById("oj-panel-box");
      const saved = JSON.parse(localStorage.getItem(STORAGE_SIZE_KEY) || "null");
      if (saved) {
        box.style.width = saved.w;
        if (saved.h) box.style.height = saved.h;
      }
      new ResizeObserver(() => {
        localStorage.setItem(
          STORAGE_SIZE_KEY,
          JSON.stringify({ w: box.style.width, h: box.style.height }),
        );
      }).observe(box);

      // 縮放把手放左上角。面板釘在螢幕右下角，往左上拖才是變大的方向，
      // CSS 原生 resize 的把手固定在右下角，方向剛好相反，所以自己做。
      const grip = document.createElement("div");
      grip.title = "拖曳調整面板大小";
      grip.className = "ojui-float-grip";
      box.appendChild(grip);

      const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
      grip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const x0 = e.clientX;
        const y0 = e.clientY;
        // 用 computed 值：面板是 content-box，offsetWidth 含 padding 會讓第一下跳動
        const w0 = parseFloat(getComputedStyle(box).width);
        const h0 = parseFloat(getComputedStyle(box).height);
        grip.setPointerCapture(e.pointerId);

        const onMove = (ev) => {
          box.style.width =
            clamp(w0 - (ev.clientX - x0), 240, innerWidth * 0.92) + "px";
          box.style.height =
            clamp(h0 - (ev.clientY - y0), 120, innerHeight * 0.88) + "px";
        };
        grip.addEventListener("pointermove", onMove);
        grip.addEventListener(
          "pointerup",
          () => grip.removeEventListener("pointermove", onMove),
          { once: true },
        );
      });
    }

    function getLangByExtension(filename, fallbackLang) {
      const ext = filename.split(".").pop().toLowerCase();
      if (ext === "c") return "C";
      if (["cpp", "cc", "cxx"].includes(ext)) return "CPP17";
      if (ext === "java") return "JAVA";
      if (["py", "py3"].includes(ext)) return "Python";
      return fallbackLang;
    }

    function createTestCaseBadge(statusStr, index) {
      const badge = document.createElement("span");
      badge.title = `Testcase ${index}: ${statusStr}`;
      const s = statusStr.toUpperCase();
      let kind = "unknown";
      let mark = "?";
      if (s.includes("ACCEPTED") && !s.includes("NOT")) {
        kind = "ac";
        mark = "\u2714";
      } else if (s.includes("WRONG ANSWER") || s.includes("NOT ACCEPTED")) {
        kind = "wa";
        mark = "\u2718";
      } else if (s.includes("RUNTIME ERROR")) {
        kind = "re";
        mark = "!";
      } else if (s.includes("TIME LIMIT EXCEEDED")) {
        kind = "tle";
        mark = "T";
      }
      badge.className = "ojui-tc ojui-tc-" + kind;
      badge.textContent = mark;
      return badge;
    }

    // ===== /users/submit/ 批量提交程式碼 =====
    function handleSubmitPage() {
      injectUI();
      document.getElementById("oj-batch-section").style.display = "block";

      const langSelect = document.getElementById("id_language");
      const pidInput = document.getElementById("id_pid");
      const defaultPid = pidInput ? pidInput.value : "";
      document.getElementById("oj-batch-pid").value = defaultPid;

      if (langSelect) {
        const savedLang = localStorage.getItem(STORAGE_LANG_KEY);
        if (savedLang) langSelect.value = savedLang;
        langSelect.addEventListener("change", (e) => {
          localStorage.setItem(STORAGE_LANG_KEY, e.target.value);
        });
      }

      const dropZone = document.getElementById("oj-drop-zone");
      const fileInput = document.getElementById("oj-batch-files");
      const fileCountTxt = document.getElementById("oj-file-count");

      dropZone.addEventListener("click", () => fileInput.click());

      const updateFileUI = (files) => {
        if (files.length > 0) {
          fileCountTxt.innerText = `✅ 已準備 ${files.length} 個檔案`;
          fileCountTxt.style.color = "#28a745";
        } else {
          fileCountTxt.innerText = "尚未選擇檔案";
          fileCountTxt.style.color = "#666";
        }
      };

      fileInput.addEventListener("change", (e) => updateFileUI(e.target.files));

      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = "#fce4ec";
      });

      dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = "transparent";
      });

      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = "transparent";
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const dt = new DataTransfer();
          for (let i = 0; i < e.dataTransfer.files.length; i++) {
            dt.items.add(e.dataTransfer.files[i]);
          }
          fileInput.files = dt.files;
          updateFileUI(fileInput.files);
        }
      });

      const batchBtn = document.getElementById("oj-batch-submit-btn");
      batchBtn.addEventListener("click", async () => {
        const targetPid = document.getElementById("oj-batch-pid").value;
        const fallbackLang = langSelect ? langSelect.value : "C";
        const selectedBatchLang = document.getElementById("oj-batch-lang").value;
        const files = fileInput.files;

        if (files.length === 0) return alert("請先選擇或拖曳至少一個檔案！");
        if (!targetPid) return alert("請確認 Problem ID！");

        // 依照使用者選擇動態調整確認提示訊息
        let confirmMsg = `確定要批量上傳 ${files.length} 個檔案到 Problem ${targetPid} 嗎？`;
        if (selectedBatchLang === "AUTO") {
          confirmMsg += `\n(將依照副檔名自動判斷上傳語言)`;
        } else {
          confirmMsg += `\n(將強制全部使用 ${selectedBatchLang} 進行提交)`;
        }

        if (!window.confirm(confirmMsg)) return;

        const statusMsg = document.getElementById("oj-status-msg");
        const csrfToken = document.querySelector(
          'input[name="csrfmiddlewaretoken"]',
        )?.value;

        if (!csrfToken) {
          statusMsg.style.color = "red";
          statusMsg.innerText = "錯誤：找不到 CSRF Token";
          return;
        }

        let history = JSON.parse(
          localStorage.getItem(STORAGE_HISTORY_KEY) || "[]",
        );

        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          // 如果選 AUTO 則依副檔名判斷，否則套用使用者指定的語言
          const langToSubmit =
            selectedBatchLang === "AUTO"
              ? getLangByExtension(file.name, fallbackLang)
              : selectedBatchLang;

          statusMsg.style.color = "#666";
          statusMsg.innerText = `⏳ 正在處理 ${i + 1}/${files.length}: ${file.name} (${langToSubmit})...`;

          const codeContent = await file.text();
          const formData = new URLSearchParams();
          formData.append("csrfmiddlewaretoken", csrfToken);
          formData.append("pid", targetPid);
          formData.append("language", langToSubmit);
          formData.append("code", codeContent);

          try {
            const response = await fetch("/users/submit/", {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-CSRFToken": csrfToken,
              },
              body: formData.toString(),
            });

            if (response.ok) {
              history.push({
                pid: targetPid,
                filename: file.name,
                time: Date.now(),
              });
              localStorage.setItem(
                STORAGE_HISTORY_KEY,
                JSON.stringify(history),
              );
            }
          } catch (err) {
            console.error(`[OJ Helper] 上傳錯誤:`, err);
          }

          if (i < files.length - 1)
            await new Promise((r) => setTimeout(r, 1500));
        }

        statusMsg.style.color = "#28a745";
        statusMsg.innerText = "✅ 批量上傳完成！正在導向 Status...";
        setTimeout(() => {
          window.location.href =
            "/status/?username=" +
            (document.getElementById("name-text")?.innerText || "");
        }, 1500);
      });

      // 監聽原始表單，讓單檔提交也記錄檔名
      const form = document.querySelector('form[action="/users/submit/"]');
      const originalFileInput = document.getElementById("fileinput");
      if (form && originalFileInput) {
        form.addEventListener("submit", () => {
          if (originalFileInput.files.length > 0) {
            const currentPid = document.getElementById("id_pid").value;
            let history = JSON.parse(
              localStorage.getItem(STORAGE_HISTORY_KEY) || "[]",
            );
            history.push({
              pid: currentPid,
              filename: originalFileInput.files[0].name,
              time: Date.now(),
            });
            localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
          }
        });
        originalFileInput.addEventListener("change", (e) => {
          if (e.target.files.length > 0 && langSelect) {
            langSelect.value = getLangByExtension(
              e.target.files[0].name,
              langSelect.value,
            );
          }
        });
      }
    }

    // ===== /status/ Filename 替換 SID + 測資方塊 =====
    function handleStatusPage() {
      const table = document.querySelector(".table.table-striped.table-hover");
      if (!table) return;

      // 這頁的增強是自動的（SID 換檔名、測資方塊），沒有任何要按的東西。
      // 早期版本會浮一個「✅ 已啟動」的面板，純粹擋畫面，拿掉。

      const theadTr = table.querySelector("thead tr");
      if (theadTr && !document.getElementById("oj-ext-th-tc")) {
        const thSid = theadTr.querySelector("th:nth-child(1)");
        if (thSid) thSid.innerText = "Filename / SID";

        const thTC = document.createElement("th");
        thTC.id = "oj-ext-th-tc";
        thTC.innerText = "Testcases";
        thTC.style.minWidth = "220px";
        theadTr.appendChild(thTC);
      }

      const tbodyTrs = table.querySelectorAll("tbody tr");
      const history = JSON.parse(
        localStorage.getItem(STORAGE_HISTORY_KEY) || "[]",
      );
      let historyCopy = [...history].sort((a, b) => b.time - a.time);

      tbodyTrs.forEach((tr) => {
        if (tr.classList.contains("oj-ext-processed")) return;
        tr.classList.add("oj-ext-processed");

        // --- 處理 Filename 取代 SID ---
        const sidTd = tr.querySelector("td:nth-child(1)");
        const viewCodeLink = sidTd
          ? sidTd.querySelector('a[href*="/status/view_code/"]')
          : null;
        const pidNode = tr.querySelector("td:nth-child(4) a");

        if (pidNode && viewCodeLink) {
          const pidStr = pidNode.innerText.split("-")[0].trim();
          const matchIndex = historyCopy.findIndex((h) => h.pid === pidStr);

          if (matchIndex !== -1) {
            viewCodeLink.innerText = historyCopy[matchIndex].filename;
            viewCodeLink.style.color = "#17a2b8";
            viewCodeLink.style.fontWeight = "bold";
            historyCopy.splice(matchIndex, 1);
          }
        }

        // --- 處理 Testcases ---
        const tdTC = document.createElement("td");
        tdTC.className = "ojui-tc-cell";
        tr.appendChild(tdTC);

        const titleHTML = tr.getAttribute("title");

        if (titleHTML && titleHTML.includes("<ol")) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(titleHTML, "text/html");
          const lis = doc.querySelectorAll("li");

          if (lis.length > 0) {
            lis.forEach((li, index) => {
              const tcStatusText = li.innerText.trim();
              tdTC.appendChild(createTestCaseBadge(tcStatusText, index + 1));
            });
          } else {
            tdTC.innerText = "--";
          }
        } else {
          const overallStatus = tr
            .querySelector("td:nth-child(5)")
            ?.innerText.trim();
          if (overallStatus) {
            tdTC.appendChild(createTestCaseBadge(overallStatus, 1));
          } else {
            tdTC.innerText = "--";
          }
        }

        tr.removeAttribute("title"); // 移除原生 tooltip
      });
    }

    // ===== /problem/<pid>/ TestCase 分頁：批量上傳 .in/.out =====
    function handleTestcasePage(testcaseTab) {
      const pidMatch = window.location.pathname.match(/\/problem\/(\d+)/);
      const pid = pidMatch ? pidMatch[1] : null;
      if (!pid)
        return console.log("[OJ Helper] 無法獲取 Problem ID，測資上傳功能終止。");

      const csrfToken = document.querySelector(
        'input[name="csrfmiddlewaretoken"]',
      )?.value;
      if (!csrfToken) return console.error("[OJ Helper] 找不到 CSRF Token。");

      const dropZone = document.createElement("div");
      dropZone.style.cssText = `
            border: 3px dashed #ea4c89;
            border-radius: 10px;
            background-color: #fdfdfd;
            padding: 40px 20px;
            text-align: center;
            margin-bottom: 20px;
            font-size: 18px;
            color: #333;
            transition: all 0.3s ease;
            cursor: pointer;
        `;
      dropZone.innerHTML = `
            <strong>📁 將所有的 .in 與 .out 檔案拖拉到這裡</strong><br>
            <span style="font-size: 14px; color: #888;">（上傳開始前，會自動幫你刪除下方所有的舊測資）</span>
        `;

      testcaseTab.insertBefore(dropZone, testcaseTab.firstChild);

      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = "#f0f8ff";
        dropZone.style.borderColor = "#00a6ff";
      });

      dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = "#fdfdfd";
        dropZone.style.borderColor = "#ea4c89";
      });

      dropZone.addEventListener("drop", async (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = "#fdfdfd";
        dropZone.style.borderColor = "#ea4c89";

        const defaultTime =
          document.getElementById("new_time_limit")?.value || "1";
        const defaultMemory =
          document.getElementById("new_memory_limit")?.value || "32";

        const files = Array.from(e.dataTransfer.files);
        const pairs = {};

        // 配對 .in 與 .out
        files.forEach((f) => {
          const match = f.name.match(/(.+)\.(in|out)$/i);
          if (match) {
            const baseName = match[1];
            const ext = match[2].toLowerCase();
            if (!pairs[baseName]) pairs[baseName] = {};
            pairs[baseName][ext] = f;
          }
        });

        // 過濾出完整成對的測資
        let validPairs = Object.keys(pairs)
          .filter((name) => pairs[name].in && pairs[name].out)
          .map((name) => ({
            name: name,
            in: pairs[name].in,
            out: pairs[name].out,
          }));

        if (validPairs.length === 0) {
          alert("找不到成對的 .in 與 .out 檔案！請確認你拖入的檔案。");
          return;
        }

        // 自然排序檔名 (2.in 排在 10.in 前面)
        validPairs.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );

        if (
          !window.confirm(
            `即將清空現有測資，並上傳 ${validPairs.length} 組新測資。\n\n確定要繼續嗎？`,
          )
        )
          return;

        // --- 執行刪除舊測資 ---
        dropZone.innerHTML = `<strong>🗑️ 正在清空舊測資，請稍候...</strong>`;
        const deleteBtns = document.querySelectorAll(".del_testcase_btn");
        if (deleteBtns.length > 0) {
          const originalConfirm = window.confirm;
          window.confirm = () => true; // 暫時覆寫 confirm

          deleteBtns.forEach((btn) => btn.click());

          window.confirm = originalConfirm; // 恢復

          // 等待 2.5 秒，確保伺服器處理完刪除請求
          await new Promise((r) => setTimeout(r, 2500));
        }

        // --- 執行新測資上傳 ---
        for (let i = 0; i < validPairs.length; i++) {
          const pair = validPairs[i];
          dropZone.innerHTML = `<strong>⏳ 正在上傳 ${pair.name} (${i + 1}/${validPairs.length})...</strong>`;

          const formData = new FormData();
          formData.append("csrfmiddlewaretoken", csrfToken);
          formData.append("t_in", pair.in);
          formData.append("t_out", pair.out);
          formData.append("time_limit", defaultTime);
          formData.append("memory_limit", defaultMemory);

          try {
            await fetch(`/problem/${pid}/testcase/`, {
              method: "POST",
              body: formData,
              headers: { "X-CSRFToken": csrfToken },
            });
          } catch (err) {
            console.error(`❌ ${pair.name} 發生網路錯誤:`, err);
          }
        }

        dropZone.innerHTML = `<strong>✅ 批量處理完成！網頁即將重新整理...</strong>`;
        alert("處理完成！網頁即將重新整理以顯示最新測資。");
        window.location.reload();
      });
    }

    function init() {
      const path = window.location.pathname;
      const testcaseTab = document.getElementById("testcase");

      if (path.includes("/users/submit/")) {
        handleSubmitPage();
      } else if (path.includes("/status/")) {
        handleStatusPage();
      } else if (path.includes("/problem/") && testcaseTab) {
        handleTestcasePage(testcaseTab);
      }
    }

    init();
  });
})();
