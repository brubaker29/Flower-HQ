import { Link } from "react-router";
import { count, desc, eq, inArray } from "drizzle-orm";
import type { Route } from "./+types/_index";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { assets, locations, vendors, workOrders } from "~/db/schema";
import { getDueSoonAssets } from "~/lib/due";
import {
  OPEN_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  priorityTone,
  statusTone,
  type WorkOrderStatus,
} from "~/lib/work-orders";
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
    .where(inArray(workOrders.status, OPEN_STATUSES));

  const dueSoon = await getDueSoonAssets(db);

  const openWOs = await db
    .select({
      id: workOrders.id,
      title: workOrders.title,
      status: workOrders.status,
      priority: workOrders.priority,
      scheduledFor: workOrders.scheduledFor,
      locationName: locations.name,
      vendorName: vendors.name,
    })
    .from(workOrders)
    .leftJoin(locations, eq(locations.id, workOrders.locationId))
    .leftJoin(vendors, eq(vendors.id, workOrders.vendorId))
    .where(inArray(workOrders.status, OPEN_STATUSES))
    .orderBy(desc(workOrders.createdAt))
    .limit(10);

  return {
    user,
    assetCount: assetCount.n,
    openWoCount: openWoCount.n,
    dueSoon,
    openWOs,
  };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, assetCount, openWoCount, dueSoon, openWOs } = loaderData;
  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${user.name ?? user.email}`}
        subtitle="Internal tools for the Flower HQ business."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active assets" value={assetCount} href="/assets" />
        <Stat
          label="Open work orders"
          value={openWoCount}
          href="/facilities/work-orders"
        />
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

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Open work orders</h2>
          <LinkButton variant="secondary" href="/facilities/work-orders">
            View all
          </LinkButton>
        </div>
        {openWOs.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
            Nothing open across the stores.
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {openWOs.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <Link
                  to={`/facilities/work-orders/${w.id}`}
                  className="font-medium text-neutral-900 hover:underline"
                >
                  {w.title}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">
                    {w.locationName}
                  </span>
                  {w.scheduledFor && (
                    <span className="text-xs text-neutral-500">
                      {w.scheduledFor}
                    </span>
                  )}
                  <Badge tone={priorityTone(w.priority)}>
                    {PRIORITY_LABELS[w.priority]}
                  </Badge>
                  <Badge tone={statusTone(w.status as WorkOrderStatus)}>
                    {STATUS_LABELS[w.status as WorkOrderStatus]}
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
