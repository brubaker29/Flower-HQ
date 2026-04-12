import type { Route } from "./+types/_index";
import { requireUser } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context.cloudflare.env);
  return { user };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">
          Welcome, {loaderData.user.name ?? loaderData.user.email}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Internal tools for the Flower HQ business.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card
          title="Due soon"
          body="Upcoming scheduled maintenance across all vehicles and equipment will appear here."
        />
        <Card
          title="Open work orders"
          body="Open facilities work orders across the 3 stores will appear here."
        />
      </section>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <p className="mt-2 text-sm text-neutral-700">{body}</p>
    </div>
  );
}
