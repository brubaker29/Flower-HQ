import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { destroySession, getSession } from "~/lib/session.server";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  return redirect("/login", {
    headers: { "Set-Cookie": await destroySession(env, session) },
  });
}

export async function loader() {
  return redirect("/");
}
