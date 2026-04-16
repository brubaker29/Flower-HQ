import { Form, Link, redirect } from "react-router";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/facilities.work-orders.$id";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import {
  attachments,
  facilityAssets,
  locations,
  users,
  vendors,
  workOrderEvents,
  workOrders,
  workOrderStatuses,
} from "~/db/schema";
import { saveAttachment } from "~/lib/attachments.server";
import { inputToCents, formatMoney } from "~/lib/money";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  priorityTone,
  statusTone,
  type WorkOrderStatus,
} from "~/lib/work-orders";
import { Badge, Button, Field, Input, LinkButton, PageHeader, Select, Textarea } from "~/components/ui";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });

  const db = getDb(context.cloudflare.env);
  const [wo] = await db
    .select({
      id: workOrders.id,
      title: workOrders.title,
      description: workOrders.description,
      status: workOrders.status,
      priority: workOrders.priority,
      scheduledFor: workOrders.scheduledFor,
      completedAt: workOrders.completedAt,
      costCents: workOrders.costCents,
      createdAt: workOrders.createdAt,
      locationId: workOrders.locationId,
      locationName: locations.name,
      facilityAssetId: workOrders.facilityAssetId,
      facilityAssetName: facilityAssets.name,
      vendorId: workOrders.vendorId,
      vendorName: vendors.name,
    })
    .from(workOrders)
    .leftJoin(locations, eq(locations.id, workOrders.locationId))
    .leftJoin(facilityAssets, eq(facilityAssets.id, workOrders.facilityAssetId))
    .leftJoin(vendors, eq(vendors.id, workOrders.vendorId))
    .where(eq(workOrders.id, id));

  if (!wo) throw new Response("Not found", { status: 404 });

  const events = await db
    .select({
      id: workOrderEvents.id,
      eventType: workOrderEvents.eventType,
      note: workOrderEvents.note,
      createdAt: workOrderEvents.createdAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(workOrderEvents)
    .leftJoin(users, eq(users.id, workOrderEvents.createdBy))
    .where(eq(workOrderEvents.workOrderId, id))
    .orderBy(asc(workOrderEvents.createdAt));

  const files = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.subjectType, "work_order"),
        eq(attachments.subjectId, id),
      ),
    )
    .orderBy(desc(attachments.createdAt));

  const vendorRows = await db.select().from(vendors).orderBy(vendors.name);

  return { wo, events, files, vendors: vendorRows };
}

const IntentSchema = z.enum([
  "schedule",
  "start",
  "complete",
  "cancel",
  "reopen",
  "comment",
  "upload",
]);

async function findOrCreateVendor(
  db: ReturnType<typeof getDb>,
  name: string | null | undefined,
): Promise<number | null> {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = await db
    .select()
    .from(vendors)
    .where(eq(vendors.name, trimmed))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db
    .insert(vendors)
    .values({ name: trimmed })
    .returning({ id: vendors.id });
  return row.id;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const intent = IntentSchema.parse(form.get("intent"));
  const db = getDb(context.cloudflare.env);

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  if (intent === "comment") {
    const note = String(form.get("note") || "").trim();
    if (!note) return { error: "Comment can't be empty" };
    await db.insert(workOrderEvents).values({
      workOrderId: id,
      eventType: "comment",
      note,
      createdBy: user.id,
    });
    return null;
  }

  if (intent === "upload") {
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      await saveAttachment(context.cloudflare.env, db, {
        file: photo,
        subjectType: "work_order",
        subjectId: id,
        uploadedBy: user.id,
      });
      await db.insert(workOrderEvents).values({
        workOrderId: id,
        eventType: "attachment",
        note: `Uploaded ${photo.name}`,
        createdBy: user.id,
      });
    }
    return null;
  }

  if (intent === "schedule") {
    const scheduledFor = String(form.get("scheduledFor") || "");
    const vendorName = String(form.get("vendorName") || "");
    const vendorId = await findOrCreateVendor(db, vendorName);
    await db
      .update(workOrders)
      .set({
        status: "scheduled",
        scheduledFor: scheduledFor || null,
        vendorId: vendorId ?? undefined,
        updatedAt: nowIso,
      })
      .where(eq(workOrders.id, id));
    await db.insert(workOrderEvents).values({
      workOrderId: id,
      eventType: "status_change",
      note: `Scheduled${scheduledFor ? ` for ${scheduledFor}` : ""}${vendorName ? ` with ${vendorName}` : ""}`,
      createdBy: user.id,
    });
    return null;
  }

  if (intent === "start") {
    await db
      .update(workOrders)
      .set({ status: "in_progress", updatedAt: nowIso })
      .where(eq(workOrders.id, id));
    await db.insert(workOrderEvents).values({
      workOrderId: id,
      eventType: "status_change",
      note: "Started work",
      createdBy: user.id,
    });
    return null;
  }

  if (intent === "complete") {
    const costCents = inputToCents(form.get("cost"));
    const completedAt = String(form.get("completedAt") || today);
    const vendorName = String(form.get("vendorName") || "");
    const vendorId = await findOrCreateVendor(db, vendorName);
    const closeNote = String(form.get("note") || "").trim() || null;
    await db
      .update(workOrders)
      .set({
        status: "completed",
        completedAt,
        costCents,
        vendorId: vendorId ?? undefined,
        updatedAt: nowIso,
      })
      .where(eq(workOrders.id, id));
    await db.insert(workOrderEvents).values({
      workOrderId: id,
      eventType: "status_change",
      note: `Completed${costCents != null ? ` (${formatMoney(costCents)})` : ""}${
        closeNote ? ` — ${closeNote}` : ""
      }`,
      createdBy: user.id,
    });
    return null;
  }

  if (intent === "cancel") {
    const note = String(form.get("note") || "").trim() || null;
    await db
      .update(workOrders)
      .set({ status: "cancelled", updatedAt: nowIso })
      .where(eq(workOrders.id, id));
    await db.insert(workOrderEvents).values({
      workOrderId: id,
      eventType: "status_change",
      note: `Cancelled${note ? ` — ${note}` : ""}`,
      createdBy: user.id,
    });
    return null;
  }

  if (intent === "reopen") {
    await db
      .update(workOrders)
      .set({
        status: "open",
        completedAt: null,
        updatedAt: nowIso,
      })
      .where(eq(workOrders.id, id));
    await db.insert(workOrderEvents).values({
      workOrderId: id,
      eventType: "status_change",
      note: "Reopened",
      createdBy: user.id,
    });
    return null;
  }

  return redirect(`/facilities/work-orders/${id}`);
}

export default function WorkOrderDetail({ loaderData }: Route.ComponentProps) {
  const { wo, events, files, vendors } = loaderData;
  const status = wo.status as WorkOrderStatus;
  const isOpen = status === "open";
  const isScheduled = status === "scheduled";
  const isInProgress = status === "in_progress";
  const isClosed = status === "completed" || status === "cancelled";

  return (
    <div className="space-y-8">
      <PageHeader
        title={wo.title}
        subtitle={[
          wo.locationName,
          wo.facilityAssetName,
          `opened ${wo.createdAt.slice(0, 10)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <LinkButton variant="secondary" href={`${wo.id}/edit`}>
            Edit
          </LinkButton>
        }
      />

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={statusTone(status)}>{STATUS_LABELS[status]}</Badge>
          <Badge tone={priorityTone(wo.priority)}>
            {PRIORITY_LABELS[wo.priority]}
          </Badge>
          {wo.vendorName && (
            <span className="text-sm text-neutral-600">{wo.vendorName}</span>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <InfoRow label="Scheduled" value={wo.scheduledFor} />
          <InfoRow label="Completed" value={wo.completedAt} />
          <InfoRow label="Cost" value={formatMoney(wo.costCents)} />
          <InfoRow label="Vendor" value={wo.vendorName} />
        </dl>
        {wo.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">
            {wo.description}
          </p>
        )}
      </section>

      {/* Status actions */}
      {!isClosed && (
        <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Actions
          </h2>

          {isOpen && (
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="schedule" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Schedule for">
                  <Input name="scheduledFor" type="date" />
                </Field>
                <Field label="Vendor" className="sm:col-span-2">
                  <Input
                    name="vendorName"
                    list="wo-vendor-list"
                    placeholder="Pick or type new"
                  />
                </Field>
              </div>
              <Button type="submit" variant="secondary">
                Schedule
              </Button>
            </Form>
          )}

          {(isOpen || isScheduled) && (
            <Form method="post">
              <input type="hidden" name="intent" value="start" />
              <Button type="submit" variant="secondary">
                Start work
              </Button>
            </Form>
          )}

          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="complete" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Completed on">
                <Input
                  name="completedAt"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </Field>
              <Field label="Final cost (USD)">
                <Input name="cost" type="number" step="0.01" min={0} />
              </Field>
              <Field label="Vendor">
                <Input
                  name="vendorName"
                  list="wo-vendor-list"
                  defaultValue={wo.vendorName ?? ""}
                />
              </Field>
            </div>
            <Field label="Closing note">
              <Textarea name="note" rows={2} placeholder="What was done?" />
            </Field>
            <Button type="submit">Mark complete</Button>
          </Form>

          <Form method="post" className="space-y-2">
            <input type="hidden" name="intent" value="cancel" />
            <Field label="Reason (optional)">
              <Input name="note" placeholder="Why cancel?" />
            </Field>
            <Button type="submit" variant="danger">
              Cancel work order
            </Button>
          </Form>

          <datalist id="wo-vendor-list">
            {vendors.map((v) => (
              <option key={v.id} value={v.name} />
            ))}
          </datalist>
        </section>
      )}

      {isClosed && (
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <Form method="post">
            <input type="hidden" name="intent" value="reopen" />
            <Button type="submit" variant="secondary">
              Reopen
            </Button>
          </Form>
        </section>
      )}

      {/* Attachments */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Files</h2>
        </div>
        <Form
          method="post"
          encType="multipart/form-data"
          className="mt-3 flex items-end gap-3"
        >
          <input type="hidden" name="intent" value="upload" />
          <Field label="Add a file" className="flex-1">
            <Input
              name="photo"
              type="file"
              accept="image/*,application/pdf"
            />
          </Field>
          <Button type="submit" variant="secondary">
            Upload
          </Button>
        </Form>
        {files.length > 0 && (
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
        )}
      </section>

      {/* Activity feed */}
      <section>
        <h2 className="text-lg font-semibold">Activity</h2>
        <Form method="post" className="mt-3 space-y-2">
          <input type="hidden" name="intent" value="comment" />
          <Textarea name="note" rows={2} placeholder="Add a comment" />
          <Button type="submit" variant="secondary">
            Add comment
          </Button>
        </Form>
        <ul className="mt-4 space-y-3">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-neutral-200 bg-white p-3 text-sm"
            >
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="font-medium text-neutral-700">
                  {e.userName ?? e.userEmail ?? "system"}
                </span>
                <span>·</span>
                <span>{e.createdAt.slice(0, 16).replace("T", " ")}</span>
                <span>·</span>
                <span className="capitalize">
                  {e.eventType.replace("_", " ")}
                </span>
              </div>
              {e.note && (
                <p className="mt-1 text-neutral-800">{e.note}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-neutral-900">{value ?? "—"}</dd>
    </div>
  );
}
