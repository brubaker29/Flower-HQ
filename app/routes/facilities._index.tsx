import type { Route } from "./+types/facilities._index";
import { getDb } from "~/lib/db.server";
import { locations } from "~/db/schema";

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env);
  const rows = await db.select().from(locations);
  return { locations: rows };
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
        <div
          key={loc.id}
          className="rounded-lg border border-neutral-200 bg-white p-5"
        >
          <h2 className="font-semibold">{loc.name}</h2>
          {loc.address && (
            <p className="mt-1 text-sm text-neutral-600">{loc.address}</p>
          )}
        </div>
      ))}
    </div>
  );
}
