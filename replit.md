# Keynection - AI-Powered Command Palette

## Overview
Keynection is a web dashboard showcasing an AI-powered command palette (Cmd+K) for executing smart actions across 11 integrated platforms using Claude AI. It demonstrates context-aware AI actions like email generation, task extraction, standup generation, and more.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Shadcn UI
- **Backend**: Express.js with Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Claude Sonnet 4.5 via Replit AI Integrations (Anthropic)
- **Build**: Vite
- **Routing**: Wouter

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
│   └── history.tsx      # Action execution history
├── lib/
│   ├── actions.ts       # Smart action definitions
│   └── queryClient.ts   # React Query setup
server/
├── routes.ts    # API endpoints + Claude AI integration
├── storage.ts   # Database storage layer
├── seed.ts      # Seed data for integrations + sample logs
├── db.ts        # Drizzle database connection
shared/
├── schema.ts    # Drizzle schema (users, integrations, actionLogs, conversations, messages)
```

## Key Features
1. **Cmd+K Command Palette** - Opens overlay with all smart actions
2. **12 Smart Actions** - Email, Notion save, task extraction, standup generation, etc.
3. **Claude AI Integration** - Generates structured content for each action
4. **11 Platform Integrations** - Gmail, Notion, Linear, GitHub, Discord, etc.
5. **Action History** - Logs all AI-powered action executions
6. **Dark/Light Mode** - Full theme support

## API Endpoints
- `GET /api/integrations` - List all integrations
- `PATCH /api/integrations/:id` - Toggle integration connection
- `GET /api/action-logs` - List action history
- `POST /api/actions/execute` - Execute AI action (requires actionId + input)

## Database Tables
- `users` - User accounts (varchar UUID PK)
- `integrations` - Platform integrations (serial PK)
- `action_logs` - Action execution history (serial PK)
- `conversations` / `messages` - Chat support tables (serial PK)

## Recent Changes
- 2026-02-15: Initial MVP built with all core features
