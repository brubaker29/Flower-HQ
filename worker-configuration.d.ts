// Generated-style shim for the Cloudflare bindings declared in wrangler.jsonc.
// Run `npm run cf-typegen` once wrangler is installed to regenerate from the
// actual config. This file is committed so editors/CI can type-check without
// first running wrangler.

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}
