import { Link } from "react-router";
import { and, desc, eq } from "drizzle-orm";
import type { Route } from "./+types/assets.$id";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { assets, attachments, maintenanceRecords, vendors } from "~/db/schema";
import { formatMoney } from "~/lib/money";
import { Badge, LinkButton, PageHeader } from "~/components/ui";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });

  const db = getDb(context.cloudflare.env);

  const [asset] = await db.select().from(assets).where(eq(assets.id, id));
  if (!asset) throw new Response("Not found", { status: 404 });

  const records = await db
    .select({
      id: maintenanceRecords.id,
      performedAt: maintenanceRecords.performedAt,
      mileageAtService: maintenanceRecords.mileageAtService,
      category: maintenanceRecords.category,
      description: maintenanceRecords.description,
      costCents: maintenanceRecords.costCents,
      nextDueDate: maintenanceRecords.nextDueDate,
      nextDueMileage: maintenanceRecords.nextDueMileage,
      vendorName: vendors.name,
    })
    .from(maintenanceRecords)
    .leftJoin(vendors, eq(vendors.id, maintenanceRecords.vendorId))
    .where(eq(maintenanceRecords.assetId, id))
    .orderBy(desc(maintenanceRecords.performedAt));

  const files = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.subjectType, "asset"),
        eq(attachments.subjectId, id),
      ),
    )
    .orderBy(desc(attachments.createdAt));

  return { asset, records, files };
}

function statusTone(status: string) {
  if (status === "active") return "green" as const;
  if (status === "sold") return "blue" as const;
  return "neutral" as const;
}

export default function AssetDetail({ loaderData }: Route.ComponentProps) {
  const { asset, records, files } = loaderData;
  return (
    <div className="space-y-8">
      <PageHeader
        title={asset.name}
        subtitle={[
          asset.kind,
          asset.identifier,
          [asset.year, asset.make, asset.model].filter(Boolean).join(" ") ||
            null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          asset.status === "active" ? (
            <>
              <LinkButton
                variant="secondary"
                href={`/assets/${asset.id}/edit`}
              >
                Edit
              </LinkButton>
              <LinkButton
                variant="secondary"
                href={`/assets/${asset.id}/sell`}
              >
                Mark sold
              </LinkButton>
              <LinkButton href={`/assets/${asset.id}/maintenance/new`}>
                Log maintenance
              </LinkButton>
            </>
          ) : null
        }
      />

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={statusTone(asset.status)}>{asset.status}</Badge>
          {asset.currentMileage != null && (
            <span className="text-sm text-neutral-600">
              {asset.currentMileage.toLocaleString()} mi
            </span>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <InfoRow label="Purchased" value={asset.purchaseDate} />
          <InfoRow
            label="Purchase price"
            value={formatMoney(asset.purchasePriceCents)}
          />
          {asset.saleDate && (
            <>
              <InfoRow label="Sold" value={asset.saleDate} />
              <InfoRow
                label="Sale price"
                value={formatMoney(asset.salePriceCents)}
              />
            </>
          )}
        </dl>
        {asset.notes && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">
            {asset.notes}
          </p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Service history</h2>
          {asset.status === "active" && (
            <LinkButton
              variant="secondary"
              href={`/assets/${asset.id}/maintenance/new`}
            >
              + Log maintenance
            </LinkButton>
          )}
        </div>
        {records.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
            No service records yet.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {records.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{r.category ?? "Service"}</span>
                  <span className="text-sm text-neutral-500">
                    {r.performedAt}
                  </span>
                  {r.mileageAtService != null && (
                    <span className="text-sm text-neutral-500">
                      {r.mileageAtService.toLocaleString()} mi
                    </span>
                  )}
                  {r.vendorName && (
                    <span className="text-sm text-neutral-500">
                      {r.vendorName}
                    </span>
                  )}
                  <span className="ml-auto text-sm font-medium text-neutral-800">
                    {formatMoney(r.costCents)}
                  </span>
                </div>
                {r.description && (
                  <p className="mt-1 text-sm text-neutral-700">
                    {r.description}
                  </p>
                )}
                {(r.nextDueDate || r.nextDueMileage != null) && (
                  <p className="mt-2 text-xs text-neutral-500">
                    Next due:{" "}
                    {[
                      r.nextDueDate,
                      r.nextDueMileage != null
                        ? `${r.nextDueMileage.toLocaleString()} mi`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {files.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Files</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"
              >
                <Link
                  to={`/files/${f.r2Key}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm text-blue-700 hover:underline"
                >
                  {f.filename}
                </Link>
                <span className="ml-2 shrink-0 text-xs text-neutral-500">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-neutral-900">{value ?? "—"}</dd>
    </div>
  );
}
