document.addEventListener("DOMContentLoaded", () => {
  const serverUrlInput = document.getElementById("server-url");
  const saveBtn = document.getElementById("save-btn");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const recentList = document.getElementById("recent-list");
  const dashboardLink = document.getElementById("dashboard-link");
  const popupFooter = document.getElementById("popup-footer");

  chrome.storage.local.get(["serverUrl"], (result) => {
    if (result.serverUrl) {
      serverUrlInput.value = result.serverUrl;
      checkConnection(result.serverUrl);
      loadRecentActions();
    } else {
      statusDot.className = "status-dot status-disconnected";
      statusText.textContent = "Not configured";
    }
  });

  saveBtn.addEventListener("click", () => {
    const url = serverUrlInput.value.trim().replace(/\/$/, "");
    if (!url) return;
    chrome.storage.local.set({ serverUrl: url }, () => {
      checkConnection(url);
      loadRecentActions();
    });
  });

  async function checkConnection(url) {
    try {
      const resp = await fetch(`${url}/api/integrations`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        statusDot.className = "status-dot status-connected";
        statusText.textContent = "Connected";
        dashboardLink.href = url;
        popupFooter.style.display = "";
      } else {
        throw new Error("Bad response");
      }
    } catch {
      statusDot.className = "status-dot status-disconnected";
      statusText.textContent = "Cannot connect";
    }
  }

  async function loadRecentActions() {
    chrome.runtime.sendMessage({ action: "getRecentActions" }, (resp) => {
      if (!resp || !resp.logs || resp.logs.length === 0) {
        recentList.innerHTML = '<li class="popup-empty">No recent actions</li>';
        return;
      }
      recentList.innerHTML = resp.logs.map(log => {
        const iconLetter = (log.integration || "?")[0].toUpperCase();
        const title = log.title || log.actionType;
        const time = log.createdAt ? new Date(log.createdAt).toLocaleDateString() : "";
        return `<li>
          <div class="recent-icon">${iconLetter}</div>
          <div class="recent-info">
            <div class="recent-title">${escapeHtml(title)}</div>
            <div class="recent-meta">${escapeHtml(log.integration || "")} ${time ? "- " + time : ""}</div>
          </div>
        </li>`;
      }).join("");
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }
});
