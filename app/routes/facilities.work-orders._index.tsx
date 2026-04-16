import { Link } from "react-router";
import { desc, eq, inArray } from "drizzle-orm";
import type { Route } from "./+types/facilities.work-orders._index";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { locations, vendors, workOrders } from "~/db/schema";
import {
  OPEN_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  priorityTone,
  statusTone,
  type WorkOrderStatus,
} from "~/lib/work-orders";
import { Badge, LinkButton } from "~/components/ui";
import { formatMoney } from "~/lib/money";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const showClosed = url.searchParams.get("closed") === "1";

  const db = getDb(context.cloudflare.env);
  const whereStatus = showClosed
    ? undefined
    : inArray(workOrders.status, OPEN_STATUSES);

  const rows = await db
    .select({
      id: workOrders.id,
      title: workOrders.title,
      status: workOrders.status,
      priority: workOrders.priority,
      scheduledFor: workOrders.scheduledFor,
      completedAt: workOrders.completedAt,
      costCents: workOrders.costCents,
      createdAt: workOrders.createdAt,
      locationName: locations.name,
      vendorName: vendors.name,
    })
    .from(workOrders)
    .leftJoin(locations, eq(locations.id, workOrders.locationId))
    .leftJoin(vendors, eq(vendors.id, workOrders.vendorId))
    .where(whereStatus)
    .orderBy(desc(workOrders.createdAt));

  return { rows, showClosed };
}

export default function WorkOrdersIndex({ loaderData }: Route.ComponentProps) {
  const { rows, showClosed } = loaderData;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <LinkButton
            variant={showClosed ? "secondary" : "primary"}
            href="."
          >
            Open
          </LinkButton>
          <LinkButton
            variant={showClosed ? "primary" : "secondary"}
            href="?closed=1"
          >
            All
          </LinkButton>
        </div>
        <LinkButton href="new">+ New work order</LinkButton>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-sm text-neutral-600">
            {showClosed
              ? "No work orders yet."
              : "No open work orders. \u{1F389}"}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Vendor</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-medium">
                    <Link
                      to={`${r.id}`}
                      className="text-neutral-900 hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {r.locationName ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(r.status as WorkOrderStatus)}>
                      {STATUS_LABELS[r.status as WorkOrderStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={priorityTone(r.priority)}>
                      {PRIORITY_LABELS[r.priority]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {r.vendorName ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {r.completedAt ?? r.scheduledFor ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {formatMoney(r.costCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
