# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This is **MyMonastery** — an AI-powered community coordination platform for recurring social rituals.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: Anthropic Claude (claude-sonnet-4-6) via Replit AI Integrations
- **Frontend**: React + Vite, Tailwind CSS, Framer Motion, date-fns

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── mymonastery/        # React + Vite frontend (previewPath: /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-anthropic-ai/  # Anthropic AI integration
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## MyMonastery Features

- **Onboarding**: Name entry → stored in localStorage, user created via PUT /api/users/me
- **Dashboard**: "Your Village" — grid of ritual cards with streaks and status
- **Create Ritual**: 4-step wizard: name, participants, frequency+day, intention
- **Ritual Detail**: Tabs for AI Coordinator chat, meetup history, and settings
- **AI Coordinator**: Claude-powered chat, context-aware per ritual (streak, participants, frequency)
- **Streak tracking**: Consecutive meetups; 1 skip allowed without breaking streak; milestones at 4, 8, 12, 24, 52

## Database Schema

- `users` — id, name, email, created_at
- `rituals` — id, name, description, frequency, day_preference, participants (jsonb), intention, owner_id, created_at
- `meetups` — id, ritual_id, scheduled_date, status (planned/completed/skipped), notes, created_at
- `ritual_messages` — id, ritual_id, role (user/assistant), content, created_at

## API Routes

```
GET  /api/users/me?email=... — get user by email
PUT  /api/users/me          — upsert user

GET    /api/rituals          — list all rituals (enriched with streak/status)
POST   /api/rituals          — create ritual (sends AI welcome message)
GET    /api/rituals/:id      — ritual detail (includes meetups + messages)
PUT    /api/rituals/:id      — update ritual
DELETE /api/rituals/:id      — delete ritual

GET  /api/rituals/:id/meetups  — meetup history
POST /api/rituals/:id/meetups  — log meetup (completed/skipped)

GET  /api/rituals/:id/messages — chat messages
POST /api/rituals/:id/chat     — send message to AI coordinator
```

## Seed Data

Two example rituals exist in the database:
1. "Weekly Coffee ☕" (biweekly, 4-meetup streak, 2 participants: Sarah + Alex)
2. "Monthly Dinner 🍝" (monthly, 2-meetup streak, 5 participants)

## Development

- Run codegen after spec changes: `pnpm --filter @workspace/api-spec run codegen`
- Push DB schema: `pnpm --filter @workspace/db run push`
- API server: auto-started via workflow
- Frontend: auto-started via workflow at port 23896 / previewPath "/"

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Always typecheck from the root with `pnpm run typecheck`.
