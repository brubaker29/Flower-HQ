import type { Route } from "./+types/files.$";
import { requireUser } from "~/lib/auth.server";
import { streamFile } from "~/lib/r2.server";

/**
 * Splat route so multi-segment R2 keys like "asset/5/1234-receipt.jpg"
 * map cleanly to `params["*"]`.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const key = params["*"];
  if (!key) {
    return new Response("Missing key", { status: 400 });
  }
  return streamFile(context.cloudflare.env, key);
}
