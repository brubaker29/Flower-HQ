import { Link, useFetcher } from "react-router";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/assets._index";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { assets, assetStatuses, locations } from "~/db/schema";
import { LinkButton, Badge } from "~/components/ui";
import { getDueSoonAssets } from "~/lib/due";
import { STATUS_LABELS, statusTone } from "~/lib/asset-status";

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env);
  const rows = await db
    .select({
      id: assets.id,
      kind: assets.kind,
      name: assets.name,
      status: assets.status,
      plate: assets.plate,
      identifier: assets.identifier,
      currentMileage: assets.currentMileage,
      registrationExpiresOn: assets.registrationExpiresOn,
      locationName: locations.name,
    })
    .from(assets)
    .leftJoin(locations, eq(locations.id, assets.locationId))
    .orderBy(asc(locations.name), asc(assets.name));
  const dueSoon = await getDueSoonAssets(db);
  return { assets: rows, dueSoon };
}

const StatusSchema = z.object({
  id: z.coerce.number().int().min(1),
  status: z.enum(assetStatuses),
});

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context.cloudflare.env);
  const form = await request.formData();
  const parsed = StatusSchema.safeParse({
    id: form.get("id"),
    status: form.get("status"),
  });
  if (!parsed.success) return { error: "Invalid" };
  const db = getDb(context.cloudflare.env);
  await db
    .update(assets)
    .set({ status: parsed.data.status, updatedAt: new Date().toISOString() })
    .where(eq(assets.id, parsed.data.id));
  return { ok: true };
}

const LOCATION_COLORS: Record<string, string> = {
  Whitehall: "bg-blue-100 text-blue-800",
  Columbus: "bg-purple-100 text-purple-800",
  Reynoldsburg: "bg-teal-100 text-teal-800",
  Botanica: "bg-pink-100 text-pink-800",
};
const DEFAULT_LOCATION_COLOR = "bg-neutral-100 text-neutral-700";

function LocationBadge({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-50 px-2 py-0.5 text-xs text-neutral-400">
        unassigned
      </span>
    );
  }
  const color = LOCATION_COLORS[name] ?? DEFAULT_LOCATION_COLOR;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {name}
    </span>
  );
}

const STATUS_SELECT_CLASSES: Record<string, string> = {
  green:
    "bg-green-50 text-green-800 border-green-200 hover:bg-green-100 focus:ring-green-300",
  amber:
    "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 focus:ring-amber-300",
  red: "bg-red-50 text-red-800 border-red-200 hover:bg-red-100 focus:ring-red-300",
  blue: "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 focus:ring-blue-300",
  neutral:
    "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100 focus:ring-neutral-300",
};

function StatusSelect({
  id,
  current,
}: {
  id: number;
  current: string;
}) {
  const fetcher = useFetcher();
  // Optimistic — while the fetcher is submitting, render the pending
  // status so the pill changes color immediately.
  const pending = fetcher.formData?.get("status");
  const value = typeof pending === "string" ? pending : current;
  const tone = statusTone(value);
  const cls = STATUS_SELECT_CLASSES[tone];

  return (
    <fetcher.Form method="post" action=".">
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={value}
        onChange={(e) =>
          fetcher.submit(e.currentTarget.form, { method: "post" })
        }
        disabled={fetcher.state !== "idle"}
        className={`cursor-pointer rounded-md border px-2 py-1 text-xs font-medium transition focus:outline-none focus:ring-2 disabled:opacity-60 ${cls}`}
      >
        {assetStatuses.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </fetcher.Form>
  );
}

export default function AssetsIndex({ loaderData }: Route.ComponentProps) {
  const { assets: rows, dueSoon } = loaderData;
  return (
    <div className="space-y-6">
      {dueSoon.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
            Due soon
          </h2>
          <ul className="mt-2 divide-y divide-amber-200">
            {dueSoon.map((d) => (
              <li
                key={`${d.assetId}-${d.label}`}
                className="flex items-center justify-between py-2 text-sm"
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
        </section>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-sm text-neutral-600">
            No assets yet. Add your first van, trailer, or piece of equipment.
          </p>
          <div className="mt-4">
            <LinkButton href="/assets/new">+ Add asset</LinkButton>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Kind</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Plate</th>
                <th className="px-4 py-2">Mileage</th>
                <th className="px-4 py-2">Reg. expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-medium">
                    <Link
                      to={`/assets/${a.id}`}
                      className="text-neutral-900 hover:underline"
                    >
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 capitalize text-neutral-700">
                    {a.kind}
                  </td>
                  <td className="px-4 py-2">
                    <LocationBadge name={a.locationName} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusSelect id={a.id} current={a.status} />
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {a.plate ?? a.identifier ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {a.currentMileage != null
                      ? a.currentMileage.toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {a.registrationExpiresOn ?? "—"}
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
