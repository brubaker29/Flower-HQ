import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/facilities.work-orders.$id_.edit";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import {
  facilityAssets,
  locations,
  vendors,
  workOrderPriorities,
  workOrders,
} from "~/db/schema";
import { Button, Field, Input, PageHeader, Select, Textarea } from "~/components/ui";

const WorkOrderSchema = z.object({
  locationId: z.coerce.number().int().min(1),
  facilityAssetId: z.coerce.number().int().min(1).optional().nullable(),
  title: z.string().min(1, "Required").max(200),
  description: z.string().optional().nullable(),
  priority: z.enum(workOrderPriorities),
});

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });
  const db = getDb(context.cloudflare.env);
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id));
  if (!wo) throw new Response("Not found", { status: 404 });
  const [locs, assetRows] = await Promise.all([
    db.select().from(locations).orderBy(locations.name),
    db.select().from(facilityAssets).orderBy(facilityAssets.name),
  ]);
  return { wo, locations: locs, facilityAssets: assetRows };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  const form = await request.formData();
  const parsed = WorkOrderSchema.safeParse({
    locationId: form.get("locationId"),
    facilityAssetId: form.get("facilityAssetId") || null,
    title: form.get("title"),
    description: form.get("description") || null,
    priority: form.get("priority"),
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const db = getDb(context.cloudflare.env);
  await db
    .update(workOrders)
    .set({
      ...parsed.data,
      facilityAssetId: parsed.data.facilityAssetId ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workOrders.id, id));
  return redirect(`/facilities/work-orders/${id}`);
}

export default function EditWorkOrder({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { wo, locations, facilityAssets } = loaderData;
  const errors = actionData?.errors;
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Edit work order" />
      <Form method="post" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Location" error={errors?.locationId?.[0]}>
            <Select
              name="locationId"
              defaultValue={wo.locationId}
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
            <Select name="priority" defaultValue={wo.priority}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
        </div>
        <Field label="Title" error={errors?.title?.[0]}>
          <Input name="title" defaultValue={wo.title} required />
        </Field>
        <Field label="Description">
          <Textarea
            name="description"
            rows={4}
            defaultValue={wo.description ?? ""}
          />
        </Field>
        <Field label="Facility asset (optional)">
          <Select name="facilityAssetId" defaultValue={wo.facilityAssetId ?? ""}>
            <option value="">— None —</option>
            {facilityAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button type="submit">Save</Button>
          <a
            href={`/facilities/work-orders/${wo.id}`}
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Cancel
          </a>
        </div>
      </Form>
    </div>
  );
}
