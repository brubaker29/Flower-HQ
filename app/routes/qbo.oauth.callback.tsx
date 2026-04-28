import { redirect } from "react-router";
import type { Route } from "./+types/qbo.oauth.callback";
import { requireAdmin } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { qboTokens } from "~/db/schema";
import { eq } from "drizzle-orm";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  if (error) {
    throw new Response(`QBO OAuth error: ${error}`, { status: 400 });
  }
  if (!code || !realmId) {
    throw new Response("Missing code or realmId from QBO callback", {
      status: 400,
    });
  }

  const clientId = env.QBO_CLIENT_ID;
  const clientSecret = env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Response("QBO secrets not configured", { status: 500 });
  }

  const redirectUri = `${url.origin}/qbo/oauth/callback`;

  const tokenRes = await fetch(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    },
  );

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    throw new Response(`Token exchange failed: ${detail}`, { status: 500 });
  }

  const data = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };

  const now = new Date();
  const accessExpires = new Date(
    now.getTime() + data.expires_in * 1000,
  ).toISOString();
  const refreshExpires = new Date(
    now.getTime() + data.x_refresh_token_expires_in * 1000,
  ).toISOString();

  const db = getDb(env);

  const existing = await db
    .select()
    .from(qboTokens)
    .where(eq(qboTokens.realmId, realmId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(qboTokens)
      .set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        accessTokenExpiresAt: accessExpires,
        refreshTokenExpiresAt: refreshExpires,
        updatedAt: now.toISOString(),
      })
      .where(eq(qboTokens.realmId, realmId));
  } else {
    await db.insert(qboTokens).values({
      realmId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: accessExpires,
      refreshTokenExpiresAt: refreshExpires,
    });
  }

  return redirect("/qbo/connect");
}
