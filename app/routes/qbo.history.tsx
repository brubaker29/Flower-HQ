import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/qbo.history";
import { requireAdmin } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { qboImportLog, users } from "~/db/schema";
import { formatMoney } from "~/lib/money";
import { Badge, PageHeader } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  const db = getDb(context.cloudflare.env);
  const rows = await db
    .select({
      id: qboImportLog.id,
      filename: qboImportLog.filename,
      docNumber: qboImportLog.docNumber,
      txnDate: qboImportLog.txnDate,
      lineCount: qboImportLog.lineCount,
      totalDebits: qboImportLog.totalDebits,
      status: qboImportLog.status,
      qboJeId: qboImportLog.qboJeId,
      errorDetail: qboImportLog.errorDetail,
      importedByName: users.name,
      createdAt: qboImportLog.createdAt,
    })
    .from(qboImportLog)
    .leftJoin(users, eq(users.id, qboImportLog.importedBy))
    .orderBy(desc(qboImportLog.createdAt))
    .limit(100);

  return { rows };
}

export default function QboHistory({ loaderData }: Route.ComponentProps) {
  const { rows } = loaderData;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Import history"
        subtitle={`${rows.length} most recent`}
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
          No imports yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">DocNumber</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">File</th>
                <th className="px-4 py-2">Lines</th>
                <th className="px-4 py-2">Debits</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">QBO ID</th>
                <th className="px-4 py-2">By</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium">
                    RTI-{r.docNumber}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">{r.txnDate}</td>
                  <td className="px-4 py-2 text-neutral-700">
                    {r.filename}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {r.lineCount}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {formatMoney(r.totalDebits)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      tone={
                        r.status === "posted"
                          ? "green"
                          : r.status === "skipped"
                            ? "blue"
                            : "red"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {r.qboJeId ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {r.importedByName ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {r.createdAt.slice(0, 16).replace("T", " ")}
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
