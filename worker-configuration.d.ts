// Generated-style shim for the Cloudflare bindings declared in wrangler.jsonc.
// Run `npm run cf-typegen` once wrangler is installed to regenerate from the
// actual config. This file is committed so editors/CI can type-check without
// first running wrangler.

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  // Auth — when SESSION_SECRET is unset, auth is bypassed and every
  // request runs as ross@thinkrapid.com (useful for first-deploy
  // setup). Set all three to enable email-PIN sign-in.
  SESSION_SECRET?: string;
  ELASTIC_EMAIL_API_KEY?: string;
  FROM_EMAIL?: string;
  // QBO OAuth (from developer.intuit.com app)
  QBO_CLIENT_ID?: string;
  QBO_CLIENT_SECRET?: string;
  // Legacy CF Access secrets — no longer used.
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}
