import type { Route } from "./+types/assets._index";
import { getDb } from "~/lib/db.server";
import { assets } from "~/db/schema";
import { desc } from "drizzle-orm";

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env);
  const rows = await db.select().from(assets).orderBy(desc(assets.createdAt));
  return { assets: rows };
}

export default function AssetsIndex({ loaderData }: Route.ComponentProps) {
  if (loaderData.assets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="text-sm text-neutral-600">
          No assets yet. Use &ldquo;Add asset&rdquo; to create the first one.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Identifier</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {loaderData.assets.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2 font-medium">{a.name}</td>
              <td className="px-4 py-2 capitalize">{a.kind}</td>
              <td className="px-4 py-2 capitalize">{a.status}</td>
              <td className="px-4 py-2 text-neutral-600">
                {a.identifier ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
