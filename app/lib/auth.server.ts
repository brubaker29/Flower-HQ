import { eq } from "drizzle-orm";
import { redirect } from "react-router";
import { users } from "~/db/schema";
import { getDb, type DB } from "./db.server";
import { getSession } from "./session.server";

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
 * Returns the currently signed-in user, or throws a redirect to /login.
 *
 * Auth has two modes:
 *   - SESSION_SECRET unset: open mode — every request is treated as a
 *     hardcoded admin user (ross@thinkrapid.com). Useful for first
 *     deploy / setup. As soon as you set SESSION_SECRET, real auth
 *     turns on.
 *   - SESSION_SECRET set: session-cookie mode — reads userId from the
 *     signed cookie, looks up the user, redirects to /login if missing
 *     or disabled.
 */
export async function requireUser(
  request: Request,
  env: Env,
): Promise<SessionUser> {
  const db = getDb(env);

  if (!env.SESSION_SECRET) {
    return upsertUser(db, "ross@thinkrapid.com", "Ross");
  }

  const session = await getSession(request, env);
  const userId = session.get("userId");
  if (typeof userId !== "number") {
    throw redirectToLogin(request);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !user.isActive) {
    throw redirectToLogin(request);
  }

  return { id: user.id, email: user.email, name: user.name };
}

function redirectToLogin(request: Request): Response {
  const url = new URL(request.url);
  const next = url.pathname + url.search;
  const loginUrl =
    next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
  return redirect(loginUrl);
}
