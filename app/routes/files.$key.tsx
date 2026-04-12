import type { Route } from "./+types/files.$key";
import { requireUser } from "~/lib/auth.server";
import { streamFile } from "~/lib/r2.server";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const key = decodeURIComponent(params.key);
  return streamFile(context.cloudflare.env, key);
}
