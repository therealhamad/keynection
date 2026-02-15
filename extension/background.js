chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-overlay") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: "toggleOverlay" });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "executeAction") {
    handleExecuteAction(message.data).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }
  if (message.action === "getServerUrl") {
    chrome.storage.local.get(["serverUrl"], (result) => {
      sendResponse({ serverUrl: result.serverUrl || "" });
    });
    return true;
  }
  if (message.action === "setServerUrl") {
    chrome.storage.local.set({ serverUrl: message.url }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.action === "getRecentActions") {
    handleGetRecentActions().then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }
  if (message.action === "getIntegrations") {
    handleGetIntegrations().then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }
});

async function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["serverUrl"], (result) => {
      resolve(result.serverUrl || "");
    });
  });
}

async function handleExecuteAction(data) {
  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    throw new Error("Server URL not configured. Open Keynection settings to set it up.");
  }
  const response = await fetch(`${serverUrl}/api/actions/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Server error: ${response.status}`);
  }
  return response.json();
}

async function handleGetRecentActions() {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return { logs: [] };
  const response = await fetch(`${serverUrl}/api/action-logs`);
  if (!response.ok) throw new Error("Failed to fetch action logs");
  const logs = await response.json();
  return { logs: logs.slice(0, 5) };
}

async function handleGetIntegrations() {
  const serverUrl = await getServerUrl();
  if (!serverUrl) return { integrations: [] };
  const response = await fetch(`${serverUrl}/api/integrations`);
  if (!response.ok) throw new Error("Failed to fetch integrations");
  const integrations = await response.json();
  return { integrations };
}
