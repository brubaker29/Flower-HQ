import { Link } from "react-router";
import { and, count, eq, inArray } from "drizzle-orm";
import type { Route } from "./+types/facilities._index";
import { getDb } from "~/lib/db.server";
import { facilityAssets, locations, workOrders } from "~/db/schema";
import { OPEN_STATUSES } from "~/lib/work-orders";
import { Badge } from "~/components/ui";

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env);
  const locs = await db.select().from(locations).orderBy(locations.name);

  const withCounts = await Promise.all(
    locs.map(async (l) => {
      const [assetCount] = await db
        .select({ n: count() })
        .from(facilityAssets)
        .where(eq(facilityAssets.locationId, l.id));
      const [openCount] = await db
        .select({ n: count() })
        .from(workOrders)
        .where(
          and(
            eq(workOrders.locationId, l.id),
            inArray(workOrders.status, OPEN_STATUSES),
          ),
        );
      return {
        ...l,
        assetCount: assetCount.n,
        openCount: openCount.n,
      };
    }),
  );

  return { locations: withCounts };
}

export default function FacilitiesIndex({ loaderData }: Route.ComponentProps) {
  if (loaderData.locations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-sm text-neutral-600">
          No locations yet. Seed the 3 stores via the database migration.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {loaderData.locations.map((loc) => (
        <Link
          key={loc.id}
          to={`locations/${loc.id}`}
          className="block rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-300 hover:shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{loc.name}</h2>
            {loc.openCount > 0 ? (
              <Badge tone="amber">{loc.openCount} open</Badge>
            ) : (
              <Badge tone="green">all clear</Badge>
            )}
          </div>
          {loc.address && (
            <p className="mt-1 text-sm text-neutral-600">{loc.address}</p>
          )}
          <div className="mt-3 text-xs uppercase tracking-wide text-neutral-500">
            {loc.assetCount} equipment
            {loc.assetCount !== 1 ? "" : ""}
            {" · "}
            {loc.openCount} open WO{loc.openCount !== 1 ? "s" : ""}
          </div>
        </Link>
      ))}
    </div>
  );
}
