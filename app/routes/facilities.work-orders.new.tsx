import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/facilities.work-orders.new";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import {
  facilityAssets,
  locations,
  vendors,
  workOrderEvents,
  workOrderPriorities,
  workOrders,
} from "~/db/schema";
import { Button, Field, Input, PageHeader, Select, Textarea } from "~/components/ui";

const WorkOrderSchema = z.object({
  locationId: z.coerce.number().int().min(1),
  facilityAssetId: z.coerce.number().int().min(1).optional().nullable(),
  title: z.string().min(1, "Required").max(200),
  description: z.string().optional().nullable(),
  priority: z.enum(workOrderPriorities).default("normal"),
  vendorName: z.string().optional().nullable(),
  scheduledFor: z.string().optional().nullable(),
});

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const db = getDb(context.cloudflare.env);
  const url = new URL(request.url);
  const preLocationId = Number(url.searchParams.get("location")) || null;

  const [locs, assetRows, vendorRows] = await Promise.all([
    db.select().from(locations).orderBy(locations.name),
    db.select().from(facilityAssets).orderBy(facilityAssets.name),
    db.select().from(vendors).orderBy(vendors.name),
  ]);

  return { locations: locs, facilityAssets: assetRows, vendors: vendorRows, preLocationId };
}

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

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context.cloudflare.env);
  const form = await request.formData();
  const parsed = WorkOrderSchema.safeParse({
    locationId: form.get("locationId"),
    facilityAssetId: form.get("facilityAssetId") || null,
    title: form.get("title"),
    description: form.get("description") || null,
    priority: form.get("priority") || "normal",
    vendorName: form.get("vendorName") || null,
    scheduledFor: form.get("scheduledFor") || null,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const db = getDb(context.cloudflare.env);
  const vendorId = await findOrCreateVendor(db, parsed.data.vendorName);

  const initialStatus = parsed.data.scheduledFor ? "scheduled" : "open";

  const [wo] = await db
    .insert(workOrders)
    .values({
      locationId: parsed.data.locationId,
      facilityAssetId: parsed.data.facilityAssetId ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority,
      status: initialStatus,
      vendorId,
      scheduledFor: parsed.data.scheduledFor ?? null,
      createdBy: user.id,
    })
    .returning({ id: workOrders.id });

  await db.insert(workOrderEvents).values({
    workOrderId: wo.id,
    eventType: "status_change",
    note: `Created with status "${initialStatus}"`,
    createdBy: user.id,
  });

  return redirect(`/facilities/work-orders/${wo.id}`);
}

export default function NewWorkOrder({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { locations, facilityAssets, vendors, preLocationId } = loaderData;
  const errors = actionData?.errors;
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="New work order" subtitle="Open a ticket for a location" />
      <Form method="post" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Location" error={errors?.locationId?.[0]}>
            <Select
              name="locationId"
              defaultValue={preLocationId ?? locations[0]?.id ?? ""}
              required
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" error={errors?.priority?.[0]}>
            <Select name="priority" defaultValue="normal">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
        </div>
        <Field label="Title" error={errors?.title?.[0]}>
          <Input name="title" placeholder="e.g. HVAC making rattling noise" required />
        </Field>
        <Field label="Description">
          <Textarea name="description" rows={4} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Facility asset (optional)"
            hint="Pick the specific unit if relevant"
          >
            <Select name="facilityAssetId" defaultValue="">
              <option value="">— None —</option>
              {facilityAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vendor" hint="Type new or pick existing">
            <Input
              name="vendorName"
              list="vendor-list"
              placeholder="e.g. Acme HVAC"
            />
            <datalist id="vendor-list">
              {vendors.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field
          label="Scheduled for (optional)"
          hint="If set, status will be 'scheduled' instead of 'open'"
        >
          <Input name="scheduledFor" type="date" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">Create</Button>
          <a
            href="/facilities/work-orders"
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Cancel
          </a>
        </div>
      </Form>
    </div>
  );
}
