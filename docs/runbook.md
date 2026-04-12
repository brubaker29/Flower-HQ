# Runbook

How to go from an empty Cloudflare account to a deployed, Access-protected
Flower HQ. Follow the steps in order the first time; later sections are
reference.

## 1. One-time Cloudflare setup

### Create the D1 database
```bash
npx wrangler d1 create flower_hq_db
```
Copy the `database_id` from the output into `wrangler.jsonc` (replace
`REPLACE_WITH_D1_ID`).

### Create the R2 bucket
```bash
npx wrangler r2 bucket create flower-hq-files
```

### Apply the initial migration locally and remotely
```bash
npm run db:migrate:local
npm run db:migrate:remote
```

### First deploy
```bash
npm run deploy
```
Note the `*.workers.dev` URL that gets printed.

## 2. Protect the Worker with Cloudflare Access

1. In the Cloudflare dashboard, go to **Zero Trust → Access → Applications
   → Add an application → Self-hosted**.
2. Set the application domain to the Worker's hostname (either the
   `*.workers.dev` URL during bootstrap, or your custom domain).
3. Add a policy: Include → Emails ending in `@yourdomain.com`, or specific
   emails.
4. Identity provider: Google (configure under Zero Trust → Settings →
   Authentication if you haven't already).
5. Copy the Application Audience (AUD) tag from the app's **Overview**
   tab — you'll need it in the next step.
6. Find your team domain under **Zero Trust → Settings → Custom Pages**,
   it looks like `yourteam.cloudflareaccess.com`.

### Tell the Worker about Access
```bash
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
# paste: yourteam.cloudflareaccess.com

npx wrangler secret put CF_ACCESS_AUD
# paste: the AUD tag from step 5
```

Redeploy so the Worker picks up the secrets:
```bash
npm run deploy
```

## 3. Adding a user
- **Zero Trust → Access → Applications → Flower HQ → Policies**, edit the
  Include rule and add the email.
- The next time that user visits, they'll be challenged by Google SSO. On
  success, `auth.server.ts` upserts a row into the `users` table.

## 4. Local development
```bash
npm install
npm run dev
```
- In dev (`ENV !== "production"`), Access is bypassed and all requests
  run as a synthetic `dev@local` user. No tunnel needed.
- Local D1 lives under `.wrangler/state/v3/d1`. `npm run db:migrate:local`
  applies migrations against it.

## 5. Schema changes
```bash
# 1. Edit app/db/schema.ts
npm run db:generate       # creates app/db/migrations/NNNN_<name>.sql
# 2. Review the generated SQL
npm run db:migrate:local  # test locally
npm run db:migrate:remote # apply to prod D1
npm run deploy            # ship the code that depends on it
```

## Troubleshooting

**`401 Not authenticated (no Access JWT)` in production**
The Worker isn't sitting behind Cloudflare Access. Check that the Access
application's domain matches the Worker's hostname exactly.

**`Invalid Access JWT: ...`**
Usually `CF_ACCESS_AUD` doesn't match the AUD tag of the application.
Re-copy it from the dashboard and `wrangler secret put` again.

**"Database not found" from Drizzle**
The `database_id` in `wrangler.jsonc` is still the placeholder. Update
it and redeploy.

**R2 downloads return 404**
Uploads succeeded but the `r2_key` doesn't match what's being requested.
Check the row in `attachments` and compare to `env.FILES.get(key)`.
