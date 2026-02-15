# Keynection - AI-Powered Command Palette

## Overview
Keynection is a web dashboard + Chrome extension showcasing an AI-powered command palette for executing smart actions across 11 integrated platforms using Claude AI. The Chrome extension injects the command palette overlay on any webpage (Option+Space or Cmd+K), while the web dashboard serves as the management interface for integrations, history, and settings.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js with Node.js (with CORS for extension support)
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Claude Sonnet 4.5 via Replit AI Integrations (Anthropic)
- **Build**: Vite
- **Routing**: Wouter
- **Extension**: Chrome Extension (Manifest V3) with shadow DOM overlay

## Project Architecture
```
client/src/
├── App.tsx              # Main app with sidebar layout + command palette
├── components/
│   ├── app-sidebar.tsx  # Navigation sidebar
│   ├── command-palette.tsx  # Cmd+K command palette overlay
│   ├── action-form.tsx  # AI action execution form
│   ├── theme-provider.tsx  # Dark/light mode provider
│   └── theme-toggle.tsx    # Theme toggle button
├── pages/
│   ├── dashboard.tsx    # Stats, quick actions, recent activity
│   ├── actions.tsx      # All smart actions grid
│   ├── integrations.tsx # Integration management
│   ├── history.tsx      # Action execution history
│   └── extension.tsx    # Chrome extension install instructions
├── lib/
│   ├── actions.ts       # Smart action definitions
│   └── queryClient.ts   # React Query setup
server/
├── index.ts     # Express server setup + CORS middleware
├── routes.ts    # API endpoints + Claude AI integration
├── storage.ts   # Database storage layer
├── seed.ts      # Seed data for integrations + sample logs
├── db.ts        # Drizzle database connection
shared/
├── schema.ts    # Drizzle schema (users, integrations, actionLogs, conversations, messages)
extension/
├── manifest.json      # Chrome Extension Manifest V3
├── background.js      # Service worker (command dispatch, API routing)
├── content.js         # Content script (overlay injection, shadow DOM, UI)
├── popup/
│   ├── popup.html     # Extension popup (status, settings, recent actions)
│   └── popup.js       # Popup logic
├── icons/             # Extension icons (16, 48, 128px)
```

## Chrome Extension Architecture
- **Background Service Worker**: Handles keyboard command dispatch, routes API calls to backend
- **Content Script**: Injected into every page via shadow DOM for style isolation
  - Apple liquid glass theme (frosted blur, translucent panels)
  - Command palette with search, grouped actions (Smart/Actions/System)
  - Action forms with AI-generated fields, loading steps, success/error states
  - Context detection (page content, selected text, article detection)
- **Messaging**: Content script -> Service worker -> Backend API (CORS bypass)
- **Storage**: chrome.storage.local for server URL configuration
- **Shortcuts**: Option+Space (primary), Cmd+K (alternative), Escape to close

## Key Features
1. **Chrome Extension** - Command palette overlay on any webpage
2. **Option+Space / Cmd+K** - Opens overlay from any page
3. **12 Smart Actions** - Email, Notion save, task extraction, standup generation, etc.
4. **Claude AI Integration** - Generates structured content for each action
5. **Context Detection** - Detects articles, selected text, page content
6. **Apple Liquid Glass UI** - Frosted blur backdrop, translucent glass panels
7. **11 Platform Integrations** - Gmail, Notion, Linear, GitHub, Discord, etc.
8. **Action History** - Logs all AI-powered action executions
9. **Dark/Light Mode** - Full theme support on web dashboard

## API Endpoints
- `GET /api/integrations` - List all integrations
- `PATCH /api/integrations/:id` - Toggle integration connection
- `GET /api/action-logs` - List action history
- `POST /api/actions/execute` - Execute AI action (requires actionId + input)

## CORS
- Enabled for chrome-extension://, moz-extension://, *.replit.app, *.replit.dev, localhost origins
- Preflight (OPTIONS) handled with 204 response

## Database Tables
- `users` - User accounts (varchar UUID PK)
- `integrations` - Platform integrations (serial PK)
- `action_logs` - Action execution history (serial PK)
- `conversations` / `messages` - Chat support tables (serial PK)

## Recent Changes
- 2026-02-15: Added Chrome Extension (Manifest V3) with liquid glass overlay
- 2026-02-15: Added CORS support for extension API calls
- 2026-02-15: Added Extension page to web dashboard
- 2026-02-15: Initial MVP built with all core features
