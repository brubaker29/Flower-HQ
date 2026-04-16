import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/assets.$id.maintenance.new";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import {
  assets,
  maintenanceRecords,
  mileageReadings,
  vendors,
} from "~/db/schema";
import { inputToCents } from "~/lib/money";
import { MAINTENANCE_CATEGORIES } from "~/lib/maintenance-categories";
import { saveAttachment } from "~/lib/attachments.server";
import {
  Button,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "~/components/ui";

const RecordSchema = z.object({
  performedAt: z.string().min(1, "Required"),
  mileageAtService: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .nullable(),
  category: z.string().min(1, "Required"),
  vendorName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  nextDueDate: z.string().optional().nullable(),
  nextDueMileage: z.coerce.number().int().min(0).optional().nullable(),
});

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
    .values({ name: trimmed, category: "mechanic" })
    .returning({ id: vendors.id });
  return row.id;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });
  const db = getDb(context.cloudflare.env);
  const [asset] = await db.select().from(assets).where(eq(assets.id, id));
  if (!asset) throw new Response("Not found", { status: 404 });
  return { asset };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  const form = await request.formData();
  const parsed = RecordSchema.safeParse({
    performedAt: form.get("performedAt"),
    mileageAtService: form.get("mileageAtService") || null,
    category: form.get("category"),
    vendorName: form.get("vendorName") || null,
    description: form.get("description") || null,
    nextDueDate: form.get("nextDueDate") || null,
    nextDueMileage: form.get("nextDueMileage") || null,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const db = getDb(context.cloudflare.env);
  const vendorId = await findOrCreateVendor(db, parsed.data.vendorName);

  const [record] = await db
    .insert(maintenanceRecords)
    .values({
      assetId: id,
      performedAt: parsed.data.performedAt,
      mileageAtService: parsed.data.mileageAtService ?? null,
      category: parsed.data.category,
      vendorId,
      description: parsed.data.description ?? null,
      costCents: inputToCents(form.get("cost")),
      nextDueDate: parsed.data.nextDueDate ?? null,
      nextDueMileage: parsed.data.nextDueMileage ?? null,
      createdBy: user.id,
    })
    .returning({ id: maintenanceRecords.id });

  // Record a mileage reading tied to this service so the monthly
  // average picks it up. Also bump the asset's cached current mileage
  // if this reading is higher than what we had.
  if (parsed.data.mileageAtService != null) {
    await db.insert(mileageReadings).values({
      assetId: id,
      readOn: parsed.data.performedAt,
      mileage: parsed.data.mileageAtService,
      source: "service",
      createdBy: user.id,
    });

    const [asset] = await db.select().from(assets).where(eq(assets.id, id));
    if (
      asset &&
      (asset.currentMileage == null ||
        parsed.data.mileageAtService > asset.currentMileage)
    ) {
      await db
        .update(assets)
        .set({
          currentMileage: parsed.data.mileageAtService,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(assets.id, id));
    }
  }

  // Optional file upload (receipt, photo of the work, etc.).
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    await saveAttachment(context.cloudflare.env, db, {
      file: photo,
      subjectType: "maintenance_record",
      subjectId: record.id,
      uploadedBy: user.id,
    });
  }

  return redirect(`/assets/${id}`);
}

export default function NewMaintenance({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { asset } = loaderData;
  const errors = actionData?.errors;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Log maintenance"
        subtitle={`for ${asset.name}${
          asset.currentMileage != null
            ? ` — currently ${asset.currentMileage.toLocaleString()} mi`
            : ""
        }`}
      />
      <Form
        method="post"
        encType="multipart/form-data"
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Performed on" error={errors?.performedAt?.[0]}>
            <Input
              name="performedAt"
              type="date"
              defaultValue={today}
              required
            />
          </Field>
          <Field label="Mileage at service" error={errors?.mileageAtService?.[0]}>
            <Input name="mileageAtService" type="number" min={0} />
          </Field>
          <Field label="Category" error={errors?.category?.[0]}>
            <Select name="category" defaultValue="Oil change" required>
              {MAINTENANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vendor / shop" hint="Free text — saved for reuse">
            <Input name="vendorName" placeholder="e.g. Jim's Auto" />
          </Field>
          <Field label="Cost (USD)">
            <Input name="cost" type="number" step="0.01" min={0} />
          </Field>
          <Field label="Receipt / photo" hint="Image or PDF">
            <Input name="photo" type="file" accept="image/*,application/pdf" />
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            name="description"
            rows={3}
            placeholder="What was done?"
          />
        </Field>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm font-medium text-neutral-700">Next due (optional)</p>
          <p className="text-xs text-neutral-500">
            Used for the dashboard warning within 14 days or 500 miles.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Next due date">
              <Input name="nextDueDate" type="date" />
            </Field>
            <Field label="Next due mileage">
              <Input name="nextDueMileage" type="number" min={0} />
            </Field>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Save record</Button>
          <a
            href={`/assets/${asset.id}`}
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Cancel
          </a>
        </div>
      </Form>
    </div>
  );
}
