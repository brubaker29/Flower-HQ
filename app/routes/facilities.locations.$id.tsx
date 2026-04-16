import { Link } from "react-router";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Route } from "./+types/facilities.locations.$id";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import {
  facilityAssets,
  locations,
  vendors,
  workOrders,
} from "~/db/schema";
import {
  OPEN_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  priorityTone,
  statusTone,
  type WorkOrderStatus,
} from "~/lib/work-orders";
import { Badge, LinkButton, PageHeader } from "~/components/ui";
import { formatMoney } from "~/lib/money";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });

  const db = getDb(context.cloudflare.env);
  const [loc] = await db.select().from(locations).where(eq(locations.id, id));
  if (!loc) throw new Response("Not found", { status: 404 });

  const assets = await db
    .select()
    .from(facilityAssets)
    .where(eq(facilityAssets.locationId, id))
    .orderBy(facilityAssets.kind, facilityAssets.name);

  const openWOs = await db
    .select({
      id: workOrders.id,
      title: workOrders.title,
      status: workOrders.status,
      priority: workOrders.priority,
      scheduledFor: workOrders.scheduledFor,
      vendorName: vendors.name,
    })
    .from(workOrders)
    .leftJoin(vendors, eq(vendors.id, workOrders.vendorId))
    .where(
      and(
        eq(workOrders.locationId, id),
        inArray(workOrders.status, OPEN_STATUSES),
      ),
    )
    .orderBy(desc(workOrders.createdAt));

  return { location: loc, assets, openWOs };
}

export default function LocationDetail({ loaderData }: Route.ComponentProps) {
  const { location, assets, openWOs } = loaderData;
  return (
    <div className="space-y-8">
      <PageHeader
        title={location.name}
        subtitle={location.address ?? undefined}
        actions={
          <>
            <LinkButton
              variant="secondary"
              href={`${location.id}/assets/new`}
            >
              + Add equipment
            </LinkButton>
            <LinkButton
              href={`/facilities/work-orders/new?location=${location.id}`}
            >
              + New work order
            </LinkButton>
          </>
        }
      />

      <section>
        <h2 className="text-lg font-semibold">Open work orders ({openWOs.length})</h2>
        {openWOs.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-600">
            Nothing open.
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {openWOs.map((wo) => (
              <li
                key={wo.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <Link
                  to={`/facilities/work-orders/${wo.id}`}
                  className="font-medium text-neutral-900 hover:underline"
                >
                  {wo.title}
                </Link>
                <div className="flex items-center gap-2">
                  {wo.vendorName && (
                    <span className="text-xs text-neutral-500">
                      {wo.vendorName}
                    </span>
                  )}
                  {wo.scheduledFor && (
                    <span className="text-xs text-neutral-500">
                      {wo.scheduledFor}
                    </span>
                  )}
                  <Badge tone={priorityTone(wo.priority)}>
                    {PRIORITY_LABELS[wo.priority]}
                  </Badge>
                  <Badge tone={statusTone(wo.status as WorkOrderStatus)}>
                    {STATUS_LABELS[wo.status as WorkOrderStatus]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Equipment ({assets.length})</h2>
        {assets.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-600">
            No HVAC / plumbing / etc. tracked here yet. Add some so work
            orders can reference specific units.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Kind</th>
                  <th className="px-4 py-2">Identifier</th>
                  <th className="px-4 py-2">Installed</th>
                  <th className="px-4 py-2">Warranty expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-medium">{a.name}</td>
                    <td className="px-4 py-2 capitalize text-neutral-700">
                      {a.kind}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {a.identifier ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {a.installDate ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {a.warrantyExpiresAt ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
