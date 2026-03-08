# BFP Dashboard

Mobile-first contractor operations app for residential rehab projects.

## What this app does

- Manage **Scopes** (property walk + estimate line items).
- Convert scopes into **Projects** and track execution as **Tasks**.
- Track **materials**, **shopping**, **availability**, and **shifts**.
- Use AI-assisted parsing for walkthrough/field notes.

Core routes include:
- `/today` (daily work queue)
- `/projects` + project/task details
- `/scopes` + walkthrough conversion flow
- `/shopping`, `/shifts`, `/availability`
- `/admin/*` for recipes, bundles, assignment rules, and inventory

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (Postgres + Auth + Edge Functions)
- TanStack Query + React Router

## Local development

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```sh
npm install
```

Create a `.env` file (or set env vars) with:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

### Run

```sh
npm run dev
```

### Checks

```sh
npm run lint
npm test
npm run build
```

## Project docs

- System architecture: `docs/system-architecture.md`
- Database schema: `docs/database-schema.md`
- Workflow details: `docs/system-flows.md`
- Plain-language review: `docs/app-review.md`
