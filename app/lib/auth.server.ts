import { eq } from "drizzle-orm";
import { users } from "~/db/schema";
import { getDb, type DB } from "./db.server";

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
}

async function upsertUser(
  db: DB,
  email: string,
  name: string | null,
): Promise<SessionUser> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return {
      id: existing[0].id,
      email: existing[0].email,
      name: existing[0].name,
    };
  }
  const inserted = await db
    .insert(users)
    .values({ email, name })
    .returning();
  return {
    id: inserted[0].id,
    email: inserted[0].email,
    name: inserted[0].name,
  };
}

/**
 * Returns the current user. For now, always returns a default user —
 * no authentication check. When you're ready to lock this down, wire
 * up Cloudflare Access (see docs/runbook.md §3) and restore the JWT
 * verification that was here before.
 */
export async function requireUser(
  request: Request,
  env: Env,
): Promise<SessionUser> {
  const db = getDb(env);
  return upsertUser(db, "ross@thinkrapid.com", "Ross");
}
