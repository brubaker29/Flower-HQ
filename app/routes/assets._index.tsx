import { Link } from "react-router";
import { desc } from "drizzle-orm";
import type { Route } from "./+types/assets._index";
import { getDb } from "~/lib/db.server";
import { assets } from "~/db/schema";
import { Badge, LinkButton } from "~/components/ui";
import { getDueSoonAssets } from "~/lib/due";
import { formatMoney } from "~/lib/money";

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env);
  const rows = await db.select().from(assets).orderBy(desc(assets.createdAt));
  const dueSoon = await getDueSoonAssets(db);
  return { assets: rows, dueSoon };
}

function statusTone(status: string) {
  if (status === "active") return "green" as const;
  if (status === "sold") return "blue" as const;
  return "neutral" as const;
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
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Identifier</th>
                <th className="px-4 py-2">Mileage</th>
                <th className="px-4 py-2">Purchase price</th>
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
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {a.identifier ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {a.currentMileage != null
                      ? a.currentMileage.toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {formatMoney(a.purchasePriceCents)}
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
