# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This is **Eleanor** — a warm, AI-powered ritual assistant that helps people cultivate community through recurring social gatherings. Garden/cultivation metaphor throughout the UI. Previously named MyMonastery.

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
- **Create Ritual**: 4-step wizard: name, participants, frequency+day, intention → redirects to `/ritual/:id/schedule`
- **Organizer Schedule Page** (`/ritual/:id/schedule`): Choose primary time from 3 proposals; confirms via API
- **Guest Schedule Page** (`/schedule/:token`): No-auth page for participants to respond; supports time choice or unavailable
- **Ritual Detail**: Scheduling summary card (when unconfirmed), tabs for AI Coordinator chat, meetup history, settings
- **AI Coordinator**: Claude-powered chat, context-aware per ritual (streak, participants, frequency)
- **Streak tracking**: Consecutive meetups; 1 skip allowed without breaking streak; milestones at 4, 8, 12, 24, 52

## Database Schema

- `users` — id, name, email, created_at
- `rituals` — id, name, description, frequency, day_preference, participants (jsonb), intention, owner_id, proposed_times (jsonb), confirmed_time, location, schedule_token, created_at
- `meetups` — id, ritual_id, scheduled_date, status (planned/completed/skipped), notes, google_calendar_event_id, created_at
- `ritual_messages` — id, ritual_id, role (user/assistant), content, created_at
- `schedule_responses` — id, ritual_id, guest_name, guest_email, chosen_time, unavailable (int), created_at
- `invite_tokens` — id, ritual_id, email, name, token (uuid), responded_at, created_at

## API Routes

```
GET  /api/users/me?email=... — get user by email
PUT  /api/users/me          — upsert user

GET    /api/rituals          — list rituals; filter by owner with ?ownerId=N (enriched with streak/status)
POST   /api/rituals          — create ritual (sends AI welcome message)
GET    /api/rituals/:id      — ritual detail (includes meetups + messages)
PUT    /api/rituals/:id      — update ritual
DELETE /api/rituals/:id      — delete ritual

GET  /api/rituals/:id/meetups  — meetup history
POST /api/rituals/:id/meetups  — log meetup (completed/skipped)

GET  /api/rituals/:id/messages — chat messages
POST /api/rituals/:id/chat     — send message to AI coordinator

PATCH /api/rituals/:id/proposed-times — save proposed times; generates invite tokens + GCal event with per-person links
GET   /api/rituals/:id/timeline       — upcoming + history, syncs GCal deletions/reschedules

GET  /api/schedule/:token          — public guest schedule info (no auth)
POST /api/schedule/:token/respond  — guest submits time choice or unavailability

GET  /api/invite/:token          — public invite info by token (no auth)
POST /api/invite/:token/respond  — invitee submits time choice or unavailability
```

## Google Calendar Integration

- Organizer grants calendar access via OAuth (offline + consent=select_account)
- Events created via Google Calendar API; event IDs stored on meetup rows
- PATCH /proposed-times: creates/updates GCal event with rich description including per-person invite links
- Timeline endpoint: syncs GCal deletions (clears googleCalendarEventId) and reschedules (updates scheduledDate)
- Invite tokens: UUIDs generated per participant, embedded in calendar event descriptions, persisted in invite_tokens table

## Invite Token System

- When organizer saves proposed times, each participant gets a unique UUID token
- Tokens are stored in `invite_tokens` table (idempotent — doesn't duplicate for same email)
- Tokens embedded in Google Calendar event descriptions as clickable invite links
- `/invite/:token` page: no-auth, shows ritual info + proposed times, lets invitee vote
- After responding: shows confirmation screen + "Join Eleanor with Google" CTA

## Seed Data

Two example rituals exist in the database:
1. "Weekly Coffee ☕" (biweekly, 4-meetup streak, 2 participants: Sarah + Alex)
2. "Monthly Dinner 🍝" (monthly, 2-meetup streak, 5 participants)

## Development

- Run codegen after spec changes: `cd lib/api-spec && npx orval --config orval.config.ts`
- Push DB schema: `pnpm --filter @workspace/db run push`
- API server: auto-started via workflow
- Frontend: auto-started via workflow at port 23896 / previewPath "/"

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Always typecheck from the root with `pnpm run typecheck`.
