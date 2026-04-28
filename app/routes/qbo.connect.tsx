import { Form, redirect } from "react-router";
import type { Route } from "./+types/qbo.connect";
import { requireAdmin } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { qboTokens } from "~/db/schema";
import { getQboToken } from "~/lib/qbo.server";
import { Badge, Button, PageHeader } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  const db = getDb(context.cloudflare.env);
  const token = await getQboToken(db);
  const env = context.cloudflare.env;
  const configured =
    Boolean(env.QBO_CLIENT_ID) && Boolean(env.QBO_CLIENT_SECRET);
  return {
    connected: !!token,
    realmId: token?.realmId ?? null,
    expiresAt: token?.accessTokenExpiresAt ?? null,
    configured,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "connect") {
    const clientId = env.QBO_CLIENT_ID;
    if (!clientId) {
      return { error: "QBO_CLIENT_ID not set as Worker secret." };
    }
    const url = new URL(request.url);
    const redirectUri = `${url.origin}/qbo/oauth/callback`;
    const state = crypto.randomUUID();

    const authUrl =
      `https://appcenter.intuit.com/connect/oauth2` +
      `?client_id=${clientId}` +
      `&scope=com.intuit.quickbooks.accounting` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&state=${state}`;

    return redirect(authUrl);
  }

  if (intent === "disconnect") {
    const db = getDb(context.cloudflare.env);
    await db.delete(qboTokens);
    return null;
  }

  return null;
}

export default function QboConnect({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { connected, realmId, expiresAt, configured } = loaderData;
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="QBO Connection" />

      {actionData?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {actionData.error}
        </div>
      )}

      {!configured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Worker secrets not configured</p>
          <p className="mt-1">
            Set <code>QBO_CLIENT_ID</code> and{" "}
            <code>QBO_CLIENT_SECRET</code> in Cloudflare Workers settings
            before connecting. Get these from{" "}
            <a
              href="https://developer.intuit.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              developer.intuit.com
            </a>
            .
          </p>
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-3">
          {connected ? (
            <Badge tone="green">Connected</Badge>
          ) : (
            <Badge tone="neutral">Not connected</Badge>
          )}
          {realmId && (
            <span className="text-sm text-neutral-600">
              Realm: {realmId}
            </span>
          )}
        </div>

        {connected && expiresAt && (
          <p className="mt-2 text-xs text-neutral-500">
            Access token expires: {expiresAt.slice(0, 19).replace("T", " ")}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          {connected ? (
            <Form method="post">
              <input type="hidden" name="intent" value="disconnect" />
              <Button variant="danger" type="submit">
                Disconnect
              </Button>
            </Form>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="connect" />
              <Button type="submit" disabled={!configured}>
                Connect to QuickBooks
              </Button>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}
