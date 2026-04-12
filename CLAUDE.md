# Flower HQ — Claude primer

This is the first thing you should read in a new Claude Code session. It
captures what this repo is, the stack decisions behind it, and the
conventions to follow when adding code.

## What this is
Flower HQ is an internal web platform that hosts multiple small business
apps for the flower business. Two sub-apps are being built first:

1. **Asset Tracking** (`/assets`) — vans, trailers, equipment. Purchase
   history, sale, and preventive maintenance log.
2. **Facilities Maintenance** (`/facilities`) — 3 retail stores. HVAC,
   plumbing, electrical. Work-order workflow with vendors.

The platform should stay cheap to extend: a third or fourth sub-app gets
dropped in as another route tree under `app/routes/`.

## Stack (locked decisions)
| Area | Choice |
|---|---|
| Host | Cloudflare Workers (single Worker, single hostname) |
| Framework | React Router v7 in framework mode (SSR) |
| Database | Cloudflare D1 via Drizzle ORM |
| File storage | Cloudflare R2, served via `/files/:key` route |
| Auth | Cloudflare Access + Google SSO. No in-app password handling. |
| UI | Tailwind CSS v4 via `@tailwindcss/vite` |
| Validation | Zod |
| Money | Always integer **cents** in the DB (so QuickBooks can sync later) |

## Repo layout
```
flower-hq/
├── CLAUDE.md                 # you are here
├── docs/                     # design notes, runbooks, data model deep dive
├── wrangler.jsonc            # Worker config + D1/R2 bindings
├── drizzle.config.ts
├── workers/app.ts            # Worker entry: fetch → RRv7 request handler
├── app/
│   ├── root.tsx              # HTML shell + error boundary
│   ├── app.css               # Tailwind v4 entry
│   ├── components/shell.tsx  # top nav, brand, layout
│   ├── lib/
│   │   ├── auth.server.ts    # CF Access JWT verify + users upsert
│   │   ├── db.server.ts      # Drizzle client factory
│   │   ├── r2.server.ts      # R2 upload + stream helpers
│   │   └── due.ts            # pure "due soon" logic (unit-testable)
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema — single source of truth
│   │   └── migrations/       # SQL migrations applied via wrangler
│   └── routes/                       # RRv7 file-based routing
│       ├── _index.tsx                # cross-app landing dashboard
│       ├── assets.tsx                # Asset Tracking layout
│       ├── assets._index.tsx         # asset list
│       ├── facilities.tsx            # Facilities layout
│       ├── facilities._index.tsx     # locations overview
│       └── files.$key.tsx            # auth-guarded R2 file serving
└── worker-configuration.d.ts # committed typings for Env (DB, FILES, ...)
```

## Conventions
- **Money in cents.** Every `*_cents` column is `INTEGER`. Format only at
  render time. This keeps rounding clean and makes future QuickBooks sync
  trivial.
- **Polymorphic attachments.** The `attachments` table uses
  `(subject_type, subject_id)` instead of per-table FKs. Valid
  `subject_type` values: `asset`, `maintenance_record`, `work_order`,
  `facility_asset`. Enforce in code when inserting.
- **`due.ts` owns "due soon" logic.** The top-level dashboard and both
  sub-app indexes call the same helpers. Don't fork date math.
- **Loaders/actions receive `context.cloudflare.env`.** That's how you get
  `env.DB`, `env.FILES`, and Access env vars. See `workers/app.ts`.
- **Every loader/action that reads user-scoped data must call
  `requireUser(request, env)` first.** In production it verifies a
  Cloudflare Access JWT; in dev it returns a synthetic `dev@local` user so
  `npm run dev` works without a tunnel.
- **Schema is the source of truth.** Edit `app/db/schema.ts`, then run
  `npm run db:generate` to produce a new migration in
  `app/db/migrations/`. The initial `0000_initial.sql` is hand-written to
  bootstrap before drizzle-kit is installed.
- **Path alias.** `~/*` → `./app/*`. Use `import { ... } from "~/lib/..."`.

## Running it

```bash
npm install
npm run dev                 # vite + wrangler-backed dev server on :5173
npm run db:migrate:local    # apply migrations to local D1
npm run typecheck
```

First-time Cloudflare setup (see `docs/runbook.md` for full steps):
```bash
npx wrangler d1 create flower_hq_db          # paste id into wrangler.jsonc
npx wrangler r2 bucket create flower-hq-files
npm run db:migrate:remote
npm run deploy
```

Then in the Cloudflare dashboard: add an Access application targeting the
Worker's hostname, restrict to your Google Workspace, and set the
`CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` secrets on the Worker.

## Adding a new sub-app
1. Add a layout route at `app/routes/<name>.tsx` and call `requireUser` in
   its loader.
2. Add a list/detail children under `app/routes/<name>.*.tsx`.
3. Add a link to `app/components/shell.tsx`.
4. Add any new tables to `app/db/schema.ts`, run `npm run db:generate`.
5. Write a design note at `docs/<name>.md` describing the data model and
   any business rules.

## Open items (not yet wired)
- Production hostname + DNS + Cloudflare Access application
- `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` secrets on the Worker
- Real D1 database id in `wrangler.jsonc` (currently a placeholder)
- Phase 1+ feature work — the routes above are skeletons
