# Runbook

How to go from an empty Cloudflare account to a deployed, Access-protected
Flower HQ. Follow the steps in order the first time; later sections are
reference.

Deploys are driven by GitHub Actions — see
`.github/workflows/deploy.yml`. Every push to `main` runs pending D1
migrations and deploys the Worker. Pull requests run a validation build
but don't touch Cloudflare.

## 1. One-time Cloudflare setup

You only need to run these CLI commands once. After that, `git push` is
the only thing that deploys.

### Create the D1 database
```bash
npx wrangler d1 create flower_hq_db
```
Copy the `database_id` from the output into `wrangler.jsonc` (replace
`REPLACE_WITH_D1_ID`) and commit the change.

### Create the R2 bucket
```bash
npx wrangler r2 bucket create flower-hq-files
```

### Apply the initial migration locally (for dev)
```bash
npm run db:migrate:local
```
The remote migration will run automatically on the first push to `main`
via the GitHub Actions workflow — you don't have to run
`db:migrate:remote` by hand.

## 2. Wire up GitHub → Cloudflare

### Create a Cloudflare API token
1. In the Cloudflare dashboard go to **My Profile → API Tokens → Create
   Token**.
2. Use the "Edit Cloudflare Workers" template, or create a custom token
   with these permissions:
   - Account → Workers Scripts → Edit
   - Account → D1 → Edit
   - Account → Workers R2 Storage → Edit
3. Save the token value (you'll only see it once).

### Find your Cloudflare account ID
Dashboard home page → right sidebar → "Account ID".

### Add repo secrets on GitHub
In `github.com/brubaker29/flower-hq` → **Settings → Secrets and
variables → Actions → New repository secret**:
- `CLOUDFLARE_API_TOKEN` = the token from above
- `CLOUDFLARE_ACCOUNT_ID` = your account id

### First deploy
Push a commit to `main` (or merge a PR into `main`). The workflow will:
1. Install dependencies, typecheck, and build.
2. Apply any pending D1 migrations against the remote database.
3. Deploy the Worker.

Check the run under the **Actions** tab. On success the workflow logs
will include the `*.workers.dev` URL the Worker was deployed to.

## 3. Turn on email-PIN auth (Resend)

Auth is **off** until you set `SESSION_SECRET` on the Worker. Until
then every request is treated as `ross@thinkrapid.com` so the app is
usable during initial setup. Once you set the three secrets below,
the app starts requiring sign-in.

### Sign up for Resend
1. Go to https://resend.com → Sign up (free tier covers 3000 emails/mo).
2. Create an API key under **API Keys → Create API Key**. Copy it.
3. While testing, you can send from `onboarding@resend.dev` (Resend's
   shared sender) with no domain setup. Real-world sending requires
   verifying a domain under **Domains → Add Domain**, but you can do
   that later.

### Set the three Worker secrets
From the Cloudflare dashboard → **Workers & Pages → flower-hq →
Settings → Variables and Secrets → Add**:

| Name | Value |
|------|-------|
| `SESSION_SECRET` | Any long random string, e.g. `openssl rand -hex 32` |
| `RESEND_API_KEY` | The key from Resend |
| `FROM_EMAIL` | `onboarding@resend.dev` for testing, or `Flower HQ <login@yourdomain.com>` once your domain is verified |

Click **Deploy** at the top of the Variables section to push them
live. No code change needed.

### First sign in
1. Visit `/admin/users` while still in open mode (or any page) — your
   email `ross@thinkrapid.com` is already in the users table.
2. Add any other users you want to allow.
3. Visit `/login`, enter your email. Resend delivers the PIN.
4. Enter the PIN. You're in. The session cookie is good for 30 days.

If `RESEND_API_KEY` is unset, login still works in a debug mode — the
PIN is logged to the Worker console (visible in **Workers & Pages →
flower-hq → Logs**) instead of being emailed. Useful if you want to
test the flow before signing up for Resend.

## 4. (Optional) Protect the Worker with Cloudflare Access

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

The Worker picks up the secrets immediately — no redeploy needed.

## 4. Adding a user
- **Zero Trust → Access → Applications → Flower HQ → Policies**, edit the
  Include rule and add the email.
- The next time that user visits, they'll be challenged by Google SSO. On
  success, `auth.server.ts` upserts a row into the `users` table.

## 5. Local development
```bash
npm install
npm run dev
```
- In dev (`ENV !== "production"`), Access is bypassed and all requests
  run as a synthetic `dev@local` user. No tunnel needed.
- Local D1 lives under `.wrangler/state/v3/d1`. `npm run db:migrate:local`
  applies migrations against it.

## 6. Schema changes
```bash
# 1. Edit app/db/schema.ts
npm run db:generate       # creates app/db/migrations/NNNN_<name>.sql
# 2. Review the generated SQL
npm run db:migrate:local  # test locally
# 3. Commit the migration file and push
```
The GitHub Actions workflow will apply the migration against the remote
D1 and deploy the Worker. No manual remote migrate step.

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
