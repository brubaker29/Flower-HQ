import { Form, Link } from "react-router";
import { and, desc, eq } from "drizzle-orm";
import type { Route } from "./+types/assets.$id";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import {
  assets,
  attachments,
  locations,
  maintenanceRecords,
  mileageReadings,
  vendors,
} from "~/db/schema";
import { formatMoney } from "~/lib/money";
import { avgMilesPerMonth, listReadings } from "~/lib/mileage";
import { STATUS_LABELS, statusTone } from "~/lib/asset-status";
import { Badge, LinkButton, PageHeader } from "~/components/ui";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });

  const db = getDb(context.cloudflare.env);

  const [assetRow] = await db
    .select({
      asset: assets,
      locationName: locations.name,
    })
    .from(assets)
    .leftJoin(locations, eq(locations.id, assets.locationId))
    .where(eq(assets.id, id));
  if (!assetRow) throw new Response("Not found", { status: 404 });
  const asset = { ...assetRow.asset, locationName: assetRow.locationName };

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

  const readings = await listReadings(db, id);
  const [avg3, avg12] = await Promise.all([
    avgMilesPerMonth(db, id, 90),
    avgMilesPerMonth(db, id, 365),
  ]);

  return { asset, records, files, readings, avg3, avg12 };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const db = getDb(context.cloudflare.env);

  if (intent === "delete_reading") {
    const readingId = Number(form.get("reading_id"));
    if (!Number.isFinite(readingId)) return { error: "Missing reading id" };

    // Delete the reading, scoped to this asset so the form can't touch
    // readings on another van.
    await db
      .delete(mileageReadings)
      .where(
        and(
          eq(mileageReadings.id, readingId),
          eq(mileageReadings.assetId, id),
        ),
      );

    // Rebuild the cached current_mileage to the highest remaining
    // reading (or null if the last one was just deleted).
    const remaining = await db
      .select({ mileage: mileageReadings.mileage })
      .from(mileageReadings)
      .where(eq(mileageReadings.assetId, id))
      .orderBy(desc(mileageReadings.mileage))
      .limit(1);

    await db
      .update(assets)
      .set({
        currentMileage: remaining[0]?.mileage ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(assets.id, id));

    return null;
  }

  return null;
}

function registrationBadge(expiresOn: string | null) {
  if (!expiresOn) return null;
  const expires = new Date(expiresOn);
  const now = new Date();
  const daysLeft = Math.round(
    (expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (daysLeft < 0) {
    return <Badge tone="red">registration expired</Badge>;
  }
  if (daysLeft <= 30) {
    return <Badge tone="amber">reg expires in {daysLeft}d</Badge>;
  }
  return null;
}

export default function AssetDetail({ loaderData }: Route.ComponentProps) {
  const { asset, records, files, readings, avg3, avg12 } = loaderData;
  return (
    <div className="space-y-8">
      <PageHeader
        title={asset.name}
        subtitle={[
          asset.kind,
          asset.plate ?? asset.identifier,
          [asset.year, asset.make, asset.model].filter(Boolean).join(" ") ||
            null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          asset.status !== "sold" && asset.status !== "retired" ? (
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
              <LinkButton
                variant="secondary"
                href={`/assets/${asset.id}/readings/new`}
              >
                Log reading
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
          <Badge tone={statusTone(asset.status)}>
            {STATUS_LABELS[asset.status] ?? asset.status}
          </Badge>
          {asset.currentMileage != null && (
            <span className="text-sm text-neutral-600">
              {asset.currentMileage.toLocaleString()} mi
            </span>
          )}
          {registrationBadge(asset.registrationExpiresOn)}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <InfoRow label="Location" value={asset.locationName} />
          <InfoRow label="Plate" value={asset.plate ?? asset.identifier} />
          <InfoRow label="VIN" value={asset.vin} />
          <InfoRow label="Registered" value={asset.registeredOn} />
          <InfoRow
            label="Reg. expires"
            value={asset.registrationExpiresOn}
          />
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
          <h2 className="text-lg font-semibold">Mileage</h2>
          {asset.status !== "sold" && asset.status !== "retired" && (
            <LinkButton
              variant="secondary"
              href={`/assets/${asset.id}/readings/new`}
            >
              + Log reading
            </LinkButton>
          )}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UsageStat
            label="Avg / month (3 mo)"
            value={avg3 != null ? `${avg3.toLocaleString()} mi` : "—"}
          />
          <UsageStat
            label="Avg / month (12 mo)"
            value={avg12 != null ? `${avg12.toLocaleString()} mi` : "—"}
          />
          <UsageStat
            label="Total readings"
            value={readings.length.toString()}
          />
        </div>
        {readings.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-600">
            No mileage readings yet. Log one to start tracking usage.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Mileage</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Note</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {readings.slice(0, 20).map((r) => (
                  <tr key={r.id} className="group">
                    <td className="px-4 py-2">{r.readOn}</td>
                    <td className="px-4 py-2 font-medium">
                      {r.mileage.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-neutral-600 capitalize">
                      {r.source}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">
                      {r.note ?? "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Form
                        method="post"
                        onSubmit={(e) => {
                          if (
                            !confirm(
                              `Delete reading of ${r.mileage.toLocaleString()} mi on ${r.readOn}?`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="delete_reading"
                        />
                        <input type="hidden" name="reading_id" value={r.id} />
                        <button
                          type="submit"
                          className="text-xs text-neutral-400 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                        >
                          delete
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {readings.length > 20 && (
              <div className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
                Showing 20 most recent of {readings.length} readings.
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Service history</h2>
          {asset.status !== "sold" && asset.status !== "retired" && (
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

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}
