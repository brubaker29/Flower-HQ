import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import type { LinksFunction } from "react-router";
import stylesUrl from "./app.css?url";
import { Shell } from "./components/shell";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesUrl },
  {
    rel: "stylesheet",
    href: "https://rsms.me/inter/inter.css",
  },
];

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
  return (
    <Shell>
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
