import { Link } from "react-router";
import { count, eq } from "drizzle-orm";
import type { Route } from "./+types/_index";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { assets, workOrders } from "~/db/schema";
import { getDueSoonAssets } from "~/lib/due";
import { Badge, LinkButton, PageHeader } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context.cloudflare.env);
  const db = getDb(context.cloudflare.env);

  const [assetCount] = await db
    .select({ n: count() })
    .from(assets)
    .where(eq(assets.status, "active"));

  const [openWoCount] = await db
    .select({ n: count() })
    .from(workOrders)
    .where(eq(workOrders.status, "open"));

  const dueSoon = await getDueSoonAssets(db);

  return { user, assetCount: assetCount.n, openWoCount: openWoCount.n, dueSoon };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, assetCount, openWoCount, dueSoon } = loaderData;
  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${user.name ?? user.email}`}
        subtitle="Internal tools for the Flower HQ business."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active assets" value={assetCount} href="/assets" />
        <Stat label="Open work orders" value={openWoCount} href="/facilities/work-orders" />
        <Stat label="Items due soon" value={dueSoon.length} href="/assets" />
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Due soon</h2>
          <LinkButton variant="secondary" href="/assets">
            View assets
          </LinkButton>
        </div>
        {dueSoon.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
            Nothing due within the warning window.
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {dueSoon.map((d) => (
              <li
                key={`${d.assetId}-${d.label}`}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <Link
                  to={`/assets/${d.assetId}`}
                  className="font-medium text-neutral-900 hover:underline"
                >
                  {d.assetName}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-neutral-700">{d.label}</span>
                  <Badge tone={d.overdue ? "red" : "amber"}>
                    {d.overdue ? "overdue" : "soon"} · {d.reason}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="block rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm"
    >
      <div className="text-sm font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900">
        {value}
      </div>
    </Link>
  );
}
