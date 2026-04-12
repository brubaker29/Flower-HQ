# Flower HQ

Internal web platform hosting multiple business tools for the flower
business. Deployed as a single Cloudflare Worker.

- **Asset Tracking** — vans, trailers, equipment, maintenance history
- **Facilities Maintenance** — HVAC/plumbing/electrical work orders
  across the stores

## Stack
- React Router v7 (framework mode, SSR) on Cloudflare Workers
- Cloudflare D1 via Drizzle ORM
- Cloudflare R2 for file uploads
- Cloudflare Access + Google SSO for auth
- Tailwind CSS v4

## Quick start
```bash
npm install
npm run dev
```
Open http://localhost:5173. In dev, auth is bypassed and all requests run
as a synthetic `dev@local` user.

See [`CLAUDE.md`](./CLAUDE.md) for conventions and repo layout, and
[`docs/runbook.md`](./docs/runbook.md) for Cloudflare setup and deploy.
