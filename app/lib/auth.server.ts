import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { users } from "~/db/schema";
import { getDb, type DB } from "./db.server";

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<{ email: string; name?: string }> {
  const { payload } = await jwtVerify(token, getJwks(teamDomain), {
    issuer: `https://${teamDomain}`,
    audience: aud,
  });
  const email = typeof payload.email === "string" ? payload.email : null;
  if (!email) throw new Error("Access JWT missing email claim");
  const name = typeof payload.name === "string" ? payload.name : undefined;
  return { email, name };
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
 * Verify a request has a valid Cloudflare Access session and return the
 * corresponding `users` row (creating one on first sight).
 *
 * In development we bypass Access entirely and use a synthetic user so the
 * app is usable via `npm run dev` without a tunnel.
 */
export async function requireUser(
  request: Request,
  env: Env,
): Promise<SessionUser> {
  const db = getDb(env);

  if (env.ENV !== "production") {
    return upsertUser(db, "dev@local", "Local Dev");
  }

  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ??
    getCookie(request, "CF_Authorization");

  if (!token) {
    throw new Response("Not authenticated (no Access JWT)", { status: 401 });
  }
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    throw new Response(
      "Server misconfigured: CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are not set",
      { status: 500 },
    );
  }

  try {
    const { email, name } = await verifyAccessJwt(
      token,
      env.CF_ACCESS_TEAM_DOMAIN,
      env.CF_ACCESS_AUD,
    );
    return upsertUser(db, email, name ?? null);
  } catch (err) {
    throw new Response(`Invalid Access JWT: ${(err as Error).message}`, {
      status: 401,
    });
  }
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
