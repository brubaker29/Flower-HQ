import { eq } from "drizzle-orm";
import { redirect } from "react-router";
import { users } from "~/db/schema";
import { getDb, type DB } from "./db.server";
import { getSession } from "./session.server";
import { canAccess, type Section } from "./permissions";

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  sections: string | null;
}

function toSessionUser(u: {
  id: number;
  email: string;
  name: string | null;
  role: string;
  sections: string | null;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    sections: u.sections,
  };
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
    return toSessionUser(existing[0]);
  }
  const inserted = await db
    .insert(users)
    .values({ email, name, role: "admin" })
    .returning();
  return toSessionUser(inserted[0]);
}

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

  return toSessionUser(user);
}

export async function requireSection(
  request: Request,
  env: Env,
  section: Section,
): Promise<SessionUser> {
  const user = await requireUser(request, env);
  if (!canAccess(user, section)) {
    throw new Response("You don't have access to this section.", {
      status: 403,
    });
  }
  return user;
}

function redirectToLogin(request: Request): Response {
  const url = new URL(request.url);
  const next = url.pathname + url.search;
  const loginUrl =
    next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
  return redirect(loginUrl);
}
