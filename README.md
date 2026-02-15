# Keynection

**AI-powered command palette for Chrome.** Run smart actions from any tab—email a page, post to Slack, save to Notion, create Linear issues, generate standup updates, and more. Context-aware suggestions and Claude-powered drafting keep everything in one place.

---

## Features

- **Command palette** — Open with **Alt+Space** (Windows/Linux) or **Option+Space** (Mac). Search and run actions with the keyboard.
- **Smart actions** — Context-aware suggestions:
  - On **article pages**: “Email this page”, “Summarize for Slack”, “Save to Notion”, “Create Google Doc”, “Share to Discord”, “Create Linear issue”, “Log to Sheets”, “Schedule meeting”.
  - With **text selected**: “Email selection”, “Share to Slack”, “Save selection to Notion”, “Extract tasks”, “Create Doc from selection”, “Report bug (Linear)”, “Schedule meeting from text”, “Log to Sheets”.
- **Generate standup** — Pulls the last 24 hours from GitHub commits, Notion activity, and Google Calendar, then drafts a standup message with Claude. Edit and copy or send to Slack.
- **Integrations** — Gmail, Slack, Discord, Notion, Google (Docs, Sheets, Calendar, Drive), GitHub, Linear. Configure API keys and OAuth in extension Settings; no backend required for core flows.

---

## Installation

1. Clone or download this repo.
2. Open Chrome → **Extensions** → **Manage Extensions** → enable **Developer mode**.
3. Click **Load unpacked** and select the **`extension`** folder inside the project.
4. Use **Alt+Space** (or **Option+Space** on Mac) or click the Keynection icon to open the palette.

---

## Setup

Open the palette, then open **Settings** (or select it from the list). Configure only what you use.

| Integration | What you need |
|------------|----------------|
| **AI (Claude)** | [Claude API key](https://console.anthropic.com/settings/keys). Required for smart actions and standup generation. |
| **Google** (Gmail, Calendar, Docs, Sheets, Drive) | [OAuth Client ID](https://console.cloud.google.com/apis/credentials). Create a desktop OAuth client and add the redirect URI shown in Settings. |
| **Slack** | [Incoming Webhook](https://api.slack.com/messaging/webhooks) URL. |
| **Discord** | Server → Integrations → Webhooks → New Webhook URL. |
| **GitHub** | [Personal Access Token](https://github.com/settings/tokens) with repo read; optional username for standup. |
| **Notion** | [Integration token](https://www.notion.so/my-integrations); share target pages with the integration. |
| **Linear** | [API key](https://linear.app/settings/api). |

**Optional:** Server URL in Settings is for action logging/analytics if you run the included server (e.g. on Replit). The extension works fully without it.

---

## Usage

1. **Open** — **Alt+Space** / **Option+Space** (or toolbar icon).
2. **Search** — Type to filter actions.
3. **Choose** — Arrow keys + Enter, or click.
4. **Smart actions** — If the action uses the page or selection, content is sent to Claude to draft the email, Slack message, doc, etc. Edit the draft, then send or save.
5. **Standup** — Run “Generate Standup Update”, review fetched GitHub/Notion/Calendar data, add blockers if needed, then “Generate Update” to get the draft.

Keyboard: **Escape** to go back or close; **Cmd/Ctrl+Enter** to submit forms.

---

## Project structure

```
keynection/
├── extension/           # Chrome extension (load this folder)
│   ├── manifest.json
│   ├── background.js    # Service worker: API calls, OAuth, storage
│   ├── content.js       # Overlay UI, actions, Claude client
│   ├── popup/           # Extension popup
│   └── icons/
├── server/              # Optional backend (e.g. Replit)
│   ├── routes.ts
│   ├── integrations.ts
│   └── replit-connectors.ts
├── package.json
└── README.md
```

The extension is self-contained: all integrations use credentials stored in the browser (Settings). The server is optional and not required for Gmail, Slack, Notion, GitHub, Linear, Discord, or Claude.

---

## Development

- **Extension:** Edit files under `extension/`. Reload the extension on the `chrome://extensions` page to test.
- **Server (optional):** `npm install`, then `npm run dev` (see `package.json` scripts).

---

## License

MIT.
