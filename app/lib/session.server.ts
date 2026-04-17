import { createCookieSessionStorage } from "react-router";

export interface SessionData {
  userId: number;
}

export interface SessionFlash {
  notice?: string;
  error?: string;
}

/**
 * Cookie-backed session, signed with SESSION_SECRET. We re-instantiate
 * the storage per request so we can read the secret from env (not from
 * a module-level closure that doesn't exist at import time on workerd).
 */
function makeStorage(env: Env) {
  const secret = env.SESSION_SECRET ?? "dev-secret-not-for-production";
  return createCookieSessionStorage<SessionData, SessionFlash>({
    cookie: {
      name: "__session",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secrets: [secret],
      secure: env.SESSION_SECRET != null,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  });
}

export async function getSession(request: Request, env: Env) {
  const storage = makeStorage(env);
  return storage.getSession(request.headers.get("Cookie"));
}

export async function commitSession(
  env: Env,
  session: Awaited<ReturnType<typeof getSession>>,
): Promise<string> {
  const storage = makeStorage(env);
  return storage.commitSession(session);
}

export async function destroySession(
  env: Env,
  session: Awaited<ReturnType<typeof getSession>>,
): Promise<string> {
  const storage = makeStorage(env);
  return storage.destroySession(session);
}
