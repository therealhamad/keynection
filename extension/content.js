(function() {
  "use strict";

  if (window.__keynectionInjected) return;
  window.__keynectionInjected = true;

  let overlayRoot = null;
  let shadowRoot = null;
  let isVisible = false;
  let currentView = "palette";
  let selectedIndex = 0;
  let searchQuery = "";
  let currentAction = null;
  let formData = {};

  const ACTIONS = [
    { id: "email-page", name: "Email This Page", description: "Share this article via email", integration: "Gmail", icon: "mail", category: "smart", color: "#EA4335", badge: "Smart" },
    { id: "save-notion", name: "Save to Notion", description: "Structure and save as Notion page", integration: "Notion", icon: "file-text", category: "smart", color: "#787774", badge: "Smart" },
    { id: "extract-tasks", name: "Extract Tasks", description: "Find action items and create tasks", integration: "Linear", icon: "list-checks", category: "smart", color: "#5E6AD2", badge: "Smart" },
    { id: "generate-standup", name: "Generate Standup Update", description: "Auto-create from your recent activity", integration: "Multi", icon: "bar-chart", category: "smart", color: "#10B981", badge: "Smart" },
    { id: "smart-reply", name: "Smart Email Reply", description: "Generate reply options", integration: "Gmail", icon: "reply", category: "action", color: "#EA4335", badge: "Action" },
    { id: "report-bug", name: "Report Bug to Linear", description: "Create structured bug report", integration: "Linear", icon: "bug", category: "action", color: "#5E6AD2", badge: "Action" },
    { id: "save-docs", name: "Save to Google Docs", description: "Format and save as Google Doc", integration: "Google Docs", icon: "file-output", category: "action", color: "#4285F4", badge: "Action" },
    { id: "schedule-meeting", name: "Schedule Meeting", description: "Extract details and create invite", integration: "Google Calendar", icon: "calendar-plus", category: "action", color: "#0F9D58", badge: "Action" },
    { id: "share-discord", name: "Share to Discord", description: "Adapt and share to channel", integration: "Discord", icon: "message-circle", category: "action", color: "#5865F2", badge: "Action" },
    { id: "log-sheets", name: "Log to Google Sheets", description: "Extract data to spreadsheet", integration: "Google Sheets", icon: "table", category: "action", color: "#0F9D58", badge: "Action" },
    { id: "github-comment", name: "Smart GitHub Comment", description: "Generate helpful comments", integration: "GitHub", icon: "git-branch", category: "action", color: "#6e40c9", badge: "Action" },
    { id: "save-drive", name: "Save to Google Drive", description: "Upload and organize files", integration: "Google Drive", icon: "hard-drive", category: "action", color: "#FBBC05", badge: "Action" },
  ];

  const SVG_ICONS = {
    "mail": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    "file-text": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
    "list-checks": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`,
    "bar-chart": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>`,
    "reply": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
    "bug": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`,
    "file-output": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
    "calendar-plus": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/></svg>`,
    "message-circle": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
    "table": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`,
    "git-branch": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
    "hard-drive": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/></svg>`,
    "settings": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    "arrow-left": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
    "check": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    "sparkles": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
    "loader": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>`,
    "x": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    "file": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  };

  function icon(name, size = 18) {
    return `<span class="kn-icon" style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;">${SVG_ICONS[name] || ""}</span>`;
  }

  function detectContext() {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : "";
    const pageTitle = document.title;
    const pageUrl = location.href;
    const articleEl = document.querySelector("article");
    const mainEl = document.querySelector("main");
    let pageContent = "";
    if (selectedText) {
      pageContent = selectedText;
    } else if (articleEl) {
      pageContent = articleEl.innerText.substring(0, 3000);
    } else if (mainEl) {
      pageContent = mainEl.innerText.substring(0, 3000);
    } else {
      pageContent = document.body.innerText.substring(0, 2000);
    }
    const wordCount = pageContent.split(/\s+/).filter(w => w.length > 0).length;
    const isArticle = wordCount > 100 && (!!articleEl || !!document.querySelector('meta[property="og:type"][content="article"]'));
    return { selectedText, pageTitle, pageUrl, pageContent, wordCount, isArticle, hasSelection: !!selectedText };
  }

  function getFilteredActions() {
    const q = searchQuery.toLowerCase();
    return ACTIONS.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.integration.toLowerCase().includes(q)
    );
  }

  function createOverlay() {
    overlayRoot = document.createElement("div");
    overlayRoot.id = "keynection-root";
    shadowRoot = overlayRoot.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = getStyles();
    shadowRoot.appendChild(style);

    const container = document.createElement("div");
    container.id = "kn-overlay";
    container.className = "kn-hidden";
    container.innerHTML = `
      <div class="kn-backdrop" id="kn-backdrop"></div>
      <div class="kn-modal" id="kn-modal">
        <div class="kn-content" id="kn-content"></div>
        <div class="kn-footer" id="kn-footer">
          <div class="kn-footer-left">
            <span class="kn-shortcut-group">Open <kbd class="kn-kbd">\u23CE</kbd></span>
            <span class="kn-shortcut-group"><kbd class="kn-kbd">\u2191</kbd> <kbd class="kn-kbd">\u2193</kbd></span>
          </div>
          <div class="kn-footer-right">
            <span class="kn-shortcut-group">Close <kbd class="kn-kbd">esc</kbd></span>
          </div>
        </div>
      </div>
    `;
    shadowRoot.appendChild(container);
    document.body.appendChild(overlayRoot);

    shadowRoot.getElementById("kn-backdrop").addEventListener("click", hideOverlay);

    container.addEventListener("keydown", handleKeyDown);
  }

  function showPalette() {
    currentView = "palette";
    selectedIndex = 0;
    searchQuery = "";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    const ctx = detectContext();
    const contextBanner = ctx.isArticle
      ? `<div class="kn-context-banner">${icon("file", 14)} Article detected (${ctx.wordCount} words)</div>`
      : ctx.hasSelection
      ? `<div class="kn-context-banner">${icon("file", 14)} Text selected (${ctx.selectedText.length} chars)</div>`
      : "";

    content.innerHTML = `
      <div class="kn-header">
        <input type="text" class="kn-search" id="kn-search" placeholder="Search actions..." autocomplete="off" spellcheck="false" />
      </div>
      ${contextBanner}
      <div class="kn-list" id="kn-list"></div>
    `;

    const searchInput = shadowRoot.getElementById("kn-search");
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderActionList();
    });

    renderActionList();
    setTimeout(() => searchInput.focus(), 50);
  }

  function renderActionList() {
    const list = shadowRoot.getElementById("kn-list");
    const filtered = getFilteredActions();
    const smart = filtered.filter(a => a.category === "smart");
    const actions = filtered.filter(a => a.category === "action");

    let html = "";
    if (smart.length > 0) {
      html += `<div class="kn-group-label">SMART ACTIONS</div>`;
      smart.forEach((action, i) => {
        html += renderActionItem(action, i);
      });
    }
    if (actions.length > 0) {
      html += `<div class="kn-group-label">ACTIONS</div>`;
      actions.forEach((action, i) => {
        html += renderActionItem(action, smart.length + i);
      });
    }
    html += `<div class="kn-group-label">SYSTEM</div>`;
    html += `<div class="kn-action-item ${selectedIndex === filtered.length ? "kn-selected" : ""}" data-idx="${filtered.length}" data-action="settings">
      <div class="kn-action-icon kn-action-icon-system">${icon("settings", 18)}</div>
      <div class="kn-action-info">
        <div class="kn-action-name">Settings</div>
        <div class="kn-action-desc">Keynection</div>
      </div>
      <div class="kn-action-badge">Command</div>
    </div>`;

    list.innerHTML = html;

    list.querySelectorAll(".kn-action-item").forEach(el => {
      el.addEventListener("click", () => {
        const actionId = el.dataset.action;
        if (actionId === "settings") {
          showSettings();
        } else {
          const action = ACTIONS.find(a => a.id === actionId);
          if (action) showActionForm(action);
        }
      });
      el.addEventListener("mouseenter", () => {
        const idx = parseInt(el.dataset.idx);
        if (!isNaN(idx)) {
          selectedIndex = idx;
          updateSelection();
        }
      });
    });
  }

  function renderActionItem(action, idx) {
    const sparkle = action.category === "smart" ? ` ${icon("sparkles", 12)}` : "";
    return `<div class="kn-action-item ${selectedIndex === idx ? "kn-selected" : ""}" data-idx="${idx}" data-action="${action.id}">
      <div class="kn-action-icon" style="background:${action.color};">${icon(action.icon, 18)}</div>
      <div class="kn-action-info">
        <div class="kn-action-name">${action.name}${sparkle}</div>
        <div class="kn-action-desc">${action.description}</div>
      </div>
      <div class="kn-action-badge">${action.badge}</div>
    </div>`;
  }

  function updateSelection() {
    const items = shadowRoot.querySelectorAll(".kn-action-item");
    items.forEach((el, i) => {
      el.classList.toggle("kn-selected", parseInt(el.dataset.idx) === selectedIndex);
    });
  }

  function showActionForm(action) {
    currentView = "form";
    currentAction = action;
    formData = {};
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    const ctx = detectContext();
    let fieldsHtml = "";

    if (["email-page", "smart-reply"].includes(action.id)) {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Recipient</label>
          <input type="email" class="kn-input" id="kn-field-recipient" placeholder="name@example.com" data-field="recipient" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Subject</label>
          <input type="text" class="kn-input" id="kn-field-title" placeholder="What's this about?" value="${escapeHtml(ctx.pageTitle)}" data-field="title" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Message</label>
          <textarea class="kn-textarea" id="kn-field-content" placeholder="Write your message here..." rows="5" data-field="content">${escapeHtml(ctx.hasSelection ? ctx.selectedText : "")}</textarea>
        </div>
      `;
    } else if (["share-discord", "github-comment"].includes(action.id)) {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Title</label>
          <input type="text" class="kn-input" id="kn-field-title" placeholder="Title or context" value="${escapeHtml(ctx.pageTitle)}" data-field="title" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Content</label>
          <textarea class="kn-textarea" id="kn-field-content" placeholder="Provide content or context..." rows="5" data-field="content">${escapeHtml(ctx.hasSelection ? ctx.selectedText : ctx.pageContent.substring(0, 500))}</textarea>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">URL</label>
          <input type="text" class="kn-input" id="kn-field-url" placeholder="https://..." value="${escapeHtml(ctx.pageUrl)}" data-field="url" />
        </div>
      `;
    } else {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Title</label>
          <input type="text" class="kn-input" id="kn-field-title" placeholder="Title or subject" value="${escapeHtml(ctx.pageTitle)}" data-field="title" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Content</label>
          <textarea class="kn-textarea" id="kn-field-content" placeholder="Paste or type content..." rows="5" data-field="content">${escapeHtml(ctx.hasSelection ? ctx.selectedText : ctx.pageContent.substring(0, 500))}</textarea>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
      </div>
      <div class="kn-form-body">
        ${fieldsHtml}
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
        <button class="kn-btn kn-btn-primary" id="kn-submit">
          ${action.name.startsWith("Email") || action.name.startsWith("Smart Email") ? "Send Email" : action.name.startsWith("Save") ? "Save" : action.name.startsWith("Share") ? "Share" : action.name.startsWith("Report") ? "Report" : action.name.startsWith("Schedule") ? "Schedule" : action.name.startsWith("Log") ? "Log Data" : action.name.startsWith("Generate") ? "Generate" : "Execute"}
          <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd>
        </button>
      </div>
    `;

    shadowRoot.getElementById("kn-back").addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-cancel").addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-submit").addEventListener("click", handleSubmit);

    const firstInput = content.querySelector(".kn-input, .kn-textarea");
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function handleSubmit() {
    const inputs = shadowRoot.querySelectorAll("[data-field]");
    const data = {};
    inputs.forEach(el => {
      data[el.dataset.field] = el.value;
    });

    if (!data.title && !data.content) {
      return;
    }

    showLoading(currentAction);

    chrome.runtime.sendMessage({
      action: "executeAction",
      data: {
        actionId: currentAction.id,
        input: {
          title: data.title || "",
          content: data.content || "",
          url: data.url || location.href,
          recipient: data.recipient || "",
        }
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        showError(chrome.runtime.lastError.message);
        return;
      }
      if (response && response.error) {
        showError(response.error);
        return;
      }
      showSuccess(currentAction, response?.result);
    });
  }

  function showLoading(action) {
    currentView = "loading";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    const steps = getLoadingSteps(action.id);

    content.innerHTML = `
      <div class="kn-loading-view">
        <div class="kn-loading-title">${icon("sparkles", 16)} ${action.name}</div>
        <div class="kn-loading-steps" id="kn-loading-steps">
          ${steps.map((s, i) => `<div class="kn-step" data-step="${i}">
            <span class="kn-step-icon kn-step-pending">${icon("loader", 14)}</span>
            <span class="kn-step-text">${s}</span>
          </div>`).join("")}
        </div>
        <div class="kn-loading-spinner">
          <div class="kn-spinner"></div>
        </div>
      </div>
    `;

    animateSteps(steps.length);
  }

  function getLoadingSteps(actionId) {
    const map = {
      "email-page": ["Reading content", "Writing subject line", "Composing message"],
      "save-notion": ["Analyzing content", "Structuring page", "Preparing save"],
      "extract-tasks": ["Scanning content", "Identifying tasks", "Prioritizing items"],
      "generate-standup": ["Gathering activity", "Analyzing progress", "Composing update"],
      "smart-reply": ["Reading email", "Analyzing tone", "Generating replies"],
      "report-bug": ["Reading error context", "Structuring report", "Assigning severity"],
      "save-docs": ["Parsing content", "Formatting document", "Preparing save"],
      "schedule-meeting": ["Extracting details", "Finding time", "Creating invite"],
      "share-discord": ["Reading content", "Adapting tone", "Formatting message"],
      "log-sheets": ["Extracting data", "Structuring fields", "Preparing log"],
      "github-comment": ["Reading context", "Analyzing code", "Writing comment"],
      "save-drive": ["Analyzing content", "Organizing files", "Preparing upload"],
    };
    return map[actionId] || ["Processing", "Analyzing", "Generating"];
  }

  function animateSteps(total) {
    let step = 0;
    const interval = setInterval(() => {
      if (step >= total || currentView !== "loading") {
        clearInterval(interval);
        return;
      }
      const stepEl = shadowRoot.querySelector(`[data-step="${step}"]`);
      if (stepEl) {
        const iconEl = stepEl.querySelector(".kn-step-icon");
        iconEl.classList.remove("kn-step-pending");
        iconEl.classList.add("kn-step-done");
        iconEl.innerHTML = icon("check", 14);
        stepEl.querySelector(".kn-step-text").classList.add("kn-step-text-done");
      }
      step++;
    }, 800);
  }

  function showSuccess(action, result) {
    currentView = "success";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    let resultPreview = "";
    if (result) {
      if (result.subject) {
        resultPreview = `
          <div class="kn-result-section">
            <div class="kn-result-label">${icon("sparkles", 12)} AI Generated</div>
            <div class="kn-result-field"><strong>Subject:</strong> ${escapeHtml(result.subject)}</div>
            <div class="kn-result-body">${escapeHtml(result.body || result.message || "").substring(0, 300)}</div>
          </div>
        `;
      } else if (result.standup) {
        resultPreview = `<div class="kn-result-section"><div class="kn-result-body">${escapeHtml(result.standup).substring(0, 400)}</div></div>`;
      } else if (result.comment) {
        resultPreview = `<div class="kn-result-section"><div class="kn-result-body">${escapeHtml(result.comment).substring(0, 400)}</div></div>`;
      } else if (Array.isArray(result)) {
        resultPreview = `<div class="kn-result-section"><div class="kn-result-body">${result.length} items extracted</div></div>`;
      }
    }

    content.innerHTML = `
      <div class="kn-success-view">
        <div class="kn-success-icon">${icon("check", 32)}</div>
        <div class="kn-success-text">${action.name.includes("Email") ? "Email sent successfully!" : action.name.includes("Save") ? "Saved successfully!" : action.name.includes("Share") ? "Shared successfully!" : "Action completed successfully!"}</div>
        ${resultPreview}
      </div>
    `;

    setTimeout(() => {
      if (currentView === "success") hideOverlay();
    }, 3000);
  }

  function showError(message) {
    currentView = "error";
    const content = shadowRoot.getElementById("kn-content");

    content.innerHTML = `
      <div class="kn-success-view">
        <div class="kn-error-icon">${icon("x", 32)}</div>
        <div class="kn-error-text">${escapeHtml(message)}</div>
        <button class="kn-btn kn-btn-ghost" id="kn-retry-back" style="margin-top:12px;">Back to actions</button>
      </div>
    `;

    shadowRoot.getElementById("kn-retry-back").addEventListener("click", showPalette);
  }

  function showSettings() {
    currentView = "settings";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm kn-action-icon-system">${icon("settings", 16)}</div>
        <span class="kn-form-title">Settings</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Server URL</label>
          <input type="text" class="kn-input" id="kn-server-url" placeholder="https://your-app.replit.app" />
          <div class="kn-hint">Enter your Keynection server URL to connect to the AI backend.</div>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Status</label>
          <div class="kn-status" id="kn-status">Checking...</div>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
        <button class="kn-btn kn-btn-primary" id="kn-save-settings">Save Settings</button>
      </div>
    `;

    shadowRoot.getElementById("kn-back").addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-cancel").addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-save-settings").addEventListener("click", () => {
      const url = shadowRoot.getElementById("kn-server-url").value.trim().replace(/\/$/, "");
      chrome.runtime.sendMessage({ action: "setServerUrl", url }, () => {
        showPalette();
      });
    });

    chrome.runtime.sendMessage({ action: "getServerUrl" }, (resp) => {
      const input = shadowRoot.getElementById("kn-server-url");
      const status = shadowRoot.getElementById("kn-status");
      if (input && resp?.serverUrl) {
        input.value = resp.serverUrl;
        status.innerHTML = `<span style="color:#10B981;">Connected to server</span>`;
      } else if (status) {
        status.innerHTML = `<span style="color:#F59E0B;">Not configured</span>`;
      }
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (currentView === "palette") {
        hideOverlay();
      } else {
        showPalette();
      }
      return;
    }

    if (currentView === "palette") {
      const filtered = getFilteredActions();
      const totalItems = filtered.length + 1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % totalItems;
        updateSelection();
        scrollToSelected();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + totalItems) % totalItems;
        updateSelection();
        scrollToSelected();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex === filtered.length) {
          showSettings();
        } else {
          const action = filtered[selectedIndex];
          if (action) showActionForm(action);
        }
      }
    }

    if (currentView === "form" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function scrollToSelected() {
    const selected = shadowRoot.querySelector(".kn-selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  function showOverlay() {
    if (!overlayRoot) createOverlay();
    const overlay = shadowRoot.getElementById("kn-overlay");
    overlay.classList.remove("kn-hidden");
    isVisible = true;
    showPalette();
  }

  function hideOverlay() {
    if (!shadowRoot) return;
    const overlay = shadowRoot.getElementById("kn-overlay");
    overlay.classList.add("kn-hidden");
    isVisible = false;
    currentView = "palette";
  }

  function toggleOverlay() {
    if (isVisible) hideOverlay();
    else showOverlay();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggleOverlay") toggleOverlay();
  });

  document.addEventListener("keydown", (e) => {
    if ((e.altKey && e.code === "Space") || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
      e.preventDefault();
      e.stopPropagation();
      toggleOverlay();
    }
    if (e.key === "Escape" && isVisible) {
      e.preventDefault();
      e.stopPropagation();
      if (currentView === "palette") {
        hideOverlay();
      } else {
        showPalette();
      }
    }
  });

  function getStyles() {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }

      @keyframes kn-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes kn-slide-up {
        from { opacity: 0; transform: translateY(20px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes kn-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes kn-success-pop {
        0% { transform: scale(0.5); opacity: 0; }
        60% { transform: scale(1.1); }
        100% { transform: scale(1); opacity: 1; }
      }

      @keyframes kn-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      .kn-hidden { display: none !important; }

      #kn-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 12vh;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #e4e4e7;
        -webkit-font-smoothing: antialiased;
      }

      .kn-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        animation: kn-fade-in 0.15s ease-out;
      }

      .kn-modal {
        position: relative;
        width: 580px;
        max-width: 92vw;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        overflow: hidden;
        animation: kn-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);

        /* Liquid Glass Effect */
        background: linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.08) 0%,
          rgba(255, 255, 255, 0.04) 40%,
          rgba(255, 255, 255, 0.02) 60%,
          rgba(255, 255, 255, 0.06) 100%
        );
        backdrop-filter: blur(40px) saturate(1.6) brightness(1.05);
        -webkit-backdrop-filter: blur(40px) saturate(1.6) brightness(1.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow:
          0 0 0 0.5px rgba(255, 255, 255, 0.1),
          0 8px 40px rgba(0, 0, 0, 0.4),
          0 2px 12px rgba(0, 0, 0, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          inset 0 -1px 0 rgba(0, 0, 0, 0.1);
      }

      .kn-content {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: none;
      }
      .kn-content::-webkit-scrollbar { display: none; }

      /* Header & Search */
      .kn-header {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }

      .kn-search {
        width: 100%;
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        color: #f4f4f5;
        font-size: 15px;
        font-family: inherit;
        outline: none;
        transition: all 0.2s ease;
      }
      .kn-search::placeholder { color: rgba(255, 255, 255, 0.35); }
      .kn-search:focus {
        border-color: rgba(139, 92, 246, 0.5);
        background: rgba(255, 255, 255, 0.07);
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
      }

      /* Context Banner */
      .kn-context-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        margin: 0;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        background: rgba(139, 92, 246, 0.08);
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      }

      /* Action List */
      .kn-list {
        padding: 6px 0;
      }

      .kn-group-label {
        padding: 10px 18px 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.5px;
        color: rgba(255, 255, 255, 0.35);
        text-transform: uppercase;
      }

      .kn-action-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        cursor: pointer;
        transition: all 0.12s ease;
        border-radius: 0;
        margin: 0 4px;
        border-radius: 10px;
      }

      .kn-action-item.kn-selected {
        background: rgba(139, 92, 246, 0.25);
        box-shadow: inset 0 0 0 1px rgba(139, 92, 246, 0.2);
      }

      .kn-action-item:hover:not(.kn-selected) {
        background: rgba(255, 255, 255, 0.05);
      }

      .kn-action-icon {
        width: 34px;
        height: 34px;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: #fff;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      }

      .kn-action-icon-system {
        background: rgba(255, 255, 255, 0.1) !important;
        color: rgba(255, 255, 255, 0.6);
        box-shadow: none;
      }

      .kn-action-icon svg {
        width: 18px;
        height: 18px;
      }

      .kn-action-info {
        flex: 1;
        min-width: 0;
      }

      .kn-action-name {
        font-size: 14px;
        font-weight: 500;
        color: #f4f4f5;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .kn-action-name .kn-icon {
        color: rgba(139, 92, 246, 0.8);
      }

      .kn-action-desc {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.4);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .kn-action-badge {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.3);
        font-weight: 500;
        flex-shrink: 0;
      }

      /* Footer */
      .kn-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 12px;
        color: rgba(255, 255, 255, 0.35);
        gap: 8px;
        flex-wrap: wrap;
      }

      .kn-footer-left, .kn-footer-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .kn-shortcut-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .kn-kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        border-radius: 5px;
        font-size: 11px;
        font-family: inherit;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.5);
      }

      .kn-kbd-sm {
        min-width: 18px;
        height: 18px;
        font-size: 10px;
        margin-left: 6px;
      }

      /* Form Views */
      .kn-form-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }

      .kn-back-btn {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        flex-shrink: 0;
      }
      .kn-back-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
      .kn-back-btn svg { width: 16px; height: 16px; }

      .kn-action-icon-sm {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        flex-shrink: 0;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      }
      .kn-action-icon-sm svg { width: 16px; height: 16px; }

      .kn-form-title {
        font-size: 15px;
        font-weight: 600;
        color: #f4f4f5;
      }

      .kn-form-body {
        padding: 16px;
      }

      .kn-form-group {
        margin-bottom: 14px;
      }

      .kn-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .kn-input, .kn-textarea {
        width: 100%;
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        color: #f4f4f5;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        transition: all 0.2s ease;
      }
      .kn-input::placeholder, .kn-textarea::placeholder { color: rgba(255, 255, 255, 0.3); }
      .kn-input:focus, .kn-textarea:focus {
        border-color: rgba(139, 92, 246, 0.5);
        background: rgba(255, 255, 255, 0.07);
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
      }

      .kn-textarea {
        resize: vertical;
        min-height: 80px;
        line-height: 1.6;
      }

      .kn-hint {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.3);
        margin-top: 6px;
      }

      .kn-form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 12px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }

      .kn-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 18px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        border: none;
      }

      .kn-btn-ghost {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .kn-btn-ghost:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      .kn-btn-primary {
        background: linear-gradient(135deg, #7c3aed, #6d28d9);
        color: #fff;
        box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
      }
      .kn-btn-primary:hover {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
      }

      /* Loading View */
      .kn-loading-view {
        padding: 32px 24px;
        text-align: center;
      }

      .kn-loading-title {
        font-size: 16px;
        font-weight: 600;
        color: #f4f4f5;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .kn-loading-title .kn-icon { color: rgba(139, 92, 246, 0.8); }

      .kn-loading-steps {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 20px;
      }

      .kn-step {
        display: flex;
        align-items: center;
        gap: 10px;
        justify-content: center;
        transition: all 0.3s ease;
      }

      .kn-step-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
      }
      .kn-step-icon svg { width: 14px; height: 14px; }

      .kn-step-pending {
        color: rgba(255, 255, 255, 0.3);
        animation: kn-spin 1s linear infinite;
      }

      .kn-step-done {
        color: #10B981;
        animation: none;
      }

      .kn-step-text {
        font-size: 14px;
        color: rgba(139, 92, 246, 0.7);
        transition: color 0.3s ease;
      }

      .kn-step-text-done {
        color: #10B981;
      }

      .kn-loading-spinner {
        display: flex;
        justify-content: center;
        margin-top: 8px;
      }

      .kn-spinner {
        width: 28px;
        height: 28px;
        border: 2.5px solid rgba(255, 255, 255, 0.1);
        border-top-color: rgba(139, 92, 246, 0.6);
        border-radius: 50%;
        animation: kn-spin 0.8s linear infinite;
      }

      /* Success View */
      .kn-success-view {
        padding: 40px 24px;
        text-align: center;
      }

      .kn-success-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(16, 185, 129, 0.15);
        color: #10B981;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 16px;
        animation: kn-success-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .kn-success-icon svg { width: 32px; height: 32px; }

      .kn-success-text {
        font-size: 16px;
        font-weight: 600;
        color: #f4f4f5;
      }

      .kn-error-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(239, 68, 68, 0.15);
        color: #EF4444;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 16px;
      }
      .kn-error-icon svg { width: 32px; height: 32px; }

      .kn-error-text {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
        max-width: 380px;
        margin: 0 auto;
      }

      /* Result Preview */
      .kn-result-section {
        margin-top: 16px;
        padding: 14px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        text-align: left;
      }

      .kn-result-label {
        font-size: 11px;
        font-weight: 600;
        color: rgba(139, 92, 246, 0.7);
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .kn-result-field {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.8);
        margin-bottom: 8px;
      }

      .kn-result-body {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.6;
        white-space: pre-wrap;
      }

      /* Settings Status */
      .kn-status {
        padding: 10px 14px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 13px;
      }

      /* Responsive */
      @media (max-width: 640px) {
        #kn-overlay { padding-top: 5vh; }
        .kn-modal { max-width: 96vw; max-height: 80vh; border-radius: 14px; }
      }
    `;
  }

})();
