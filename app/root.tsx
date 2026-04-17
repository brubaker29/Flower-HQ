import { eq } from "drizzle-orm";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import type { LinksFunction } from "react-router";
import type { Route } from "./+types/root";
import stylesUrl from "./app.css?url";
import { Shell } from "./components/shell";
import { getDb } from "./lib/db.server";
import { users } from "./db/schema";
import { getSession } from "./lib/session.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesUrl },
  {
    rel: "stylesheet",
    href: "https://rsms.me/inter/inter.css",
  },
  // Tiny inline favicon so the browser stops asking for /favicon.ico and
  // triggering a "No route matches" log on every request.
  {
    rel: "icon",
    href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='6' fill='%23db2777'/%3E%3C/svg%3E",
  },
];

/**
 * Best-effort current user lookup. Doesn't throw — if there's no
 * session (or auth is in open mode), we just don't render the user
 * chip in the shell. Route loaders enforce auth where they need to.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  if (!env.SESSION_SECRET) {
    return {
      user: { email: "ross@thinkrapid.com", name: "Ross" },
    };
  }
  const session = await getSession(request, env);
  const userId = session.get("userId");
  if (typeof userId !== "number") return { user: null };
  const db = getDb(env);
  const [u] = await db
    .select({ email: users.email, name: users.name, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u || !u.isActive) return { user: null };
  return { user: { email: u.email, name: u.name } };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const data = useLoaderData() as { user: { email: string; name: string | null } | null };
  const location = useLocation();
  const isAuthRoute =
    location.pathname === "/login" ||
    location.pathname.startsWith("/login/");
  if (isAuthRoute) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <Outlet />
      </main>
    );
  }
  return (
    <Shell user={data?.user}>
      <Outlet />
    </Shell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something broke";
  const detail =
    isRouteErrorResponse(error) && typeof error.data === "string"
      ? error.data
      : error instanceof Error
        ? error.message
        : "Unknown error";

  return (
    <Shell>
      <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 p-6">
        <h1 className="text-lg font-semibold text-red-900">{title}</h1>
        <p className="mt-2 text-sm text-red-800">{detail}</p>
      </div>
    </Shell>
  );
}
