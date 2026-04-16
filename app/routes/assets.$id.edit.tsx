import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/assets.$id.edit";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { assets, assetKinds } from "~/db/schema";
import { centsToInput, inputToCents } from "~/lib/money";
import { validateVin } from "~/lib/vin";
import { Button, Field, Input, Select, Textarea } from "~/components/ui";

const vinField = z
  .string()
  .nullable()
  .optional()
  .superRefine((val, ctx) => {
    const result = validateVin(val ?? null);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error ?? "Invalid VIN",
      });
    }
  })
  .transform((v) => (v ? validateVin(v).normalized : null));

const AssetSchema = z.object({
  kind: z.enum(assetKinds),
  name: z.string().min(1, "Required").max(120),
  plate: z.string().max(40).optional().nullable(),
  vin: vinField,
  make: z.string().max(80).optional().nullable(),
  model: z.string().max(80).optional().nullable(),
  year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  currentMileage: z.coerce.number().int().min(0).optional().nullable(),
  registeredOn: z.string().optional().nullable(),
  registrationExpiresOn: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

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
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  const form = await request.formData();
  const parsed = AssetSchema.safeParse({
    kind: form.get("kind"),
    name: form.get("name"),
    plate: form.get("plate") || null,
    vin: form.get("vin") || null,
    make: form.get("make") || null,
    model: form.get("model") || null,
    year: form.get("year") || null,
    purchaseDate: form.get("purchaseDate") || null,
    currentMileage: form.get("currentMileage") || null,
    registeredOn: form.get("registeredOn") || null,
    registrationExpiresOn: form.get("registrationExpiresOn") || null,
    notes: form.get("notes") || null,
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb(context.cloudflare.env);
  await db
    .update(assets)
    .set({
      ...parsed.data,
      purchasePriceCents: inputToCents(form.get("purchasePrice")),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(assets.id, id));
  return redirect(`/assets/${id}`);
}

export default function EditAsset({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { asset } = loaderData;
  const errors = actionData?.errors;
  return (
    <Form method="post" className="max-w-2xl space-y-6">
      <FormSection title="Basics">
        <Field label="Kind" error={errors?.kind?.[0]}>
          <Select name="kind" defaultValue={asset.kind} required>
            {assetKinds.map((k) => (
              <option key={k} value={k}>
                {k[0].toUpperCase() + k.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" error={errors?.name?.[0]}>
          <Input name="name" defaultValue={asset.name} required />
        </Field>
        <Field label="Plate" error={errors?.plate?.[0]}>
          <Input
            name="plate"
            defaultValue={asset.plate ?? asset.identifier ?? ""}
          />
        </Field>
        <Field
          label="VIN"
          hint="17 chars, no I/O/Q"
          error={errors?.vin?.[0]}
        >
          <Input
            name="vin"
            defaultValue={asset.vin ?? ""}
            maxLength={17}
            style={{ textTransform: "uppercase" }}
          />
        </Field>
        <Field label="Make" error={errors?.make?.[0]}>
          <Input name="make" defaultValue={asset.make ?? ""} />
        </Field>
        <Field label="Model" error={errors?.model?.[0]}>
          <Input name="model" defaultValue={asset.model ?? ""} />
        </Field>
        <Field label="Year" error={errors?.year?.[0]}>
          <Input
            name="year"
            type="number"
            min={1900}
            max={2100}
            defaultValue={asset.year ?? ""}
          />
        </Field>
        <Field label="Current mileage" error={errors?.currentMileage?.[0]}>
          <Input
            name="currentMileage"
            type="number"
            min={0}
            defaultValue={asset.currentMileage ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection title="Purchase">
        <Field label="Purchase date" error={errors?.purchaseDate?.[0]}>
          <Input
            name="purchaseDate"
            type="date"
            defaultValue={asset.purchaseDate ?? ""}
          />
        </Field>
        <Field label="Purchase price (USD)">
          <Input
            name="purchasePrice"
            type="number"
            step="0.01"
            min={0}
            defaultValue={centsToInput(asset.purchasePriceCents)}
          />
        </Field>
      </FormSection>

      <FormSection title="Ohio registration">
        <Field label="Registered on" error={errors?.registeredOn?.[0]}>
          <Input
            name="registeredOn"
            type="date"
            defaultValue={asset.registeredOn ?? ""}
          />
        </Field>
        <Field
          label="Expires on"
          error={errors?.registrationExpiresOn?.[0]}
        >
          <Input
            name="registrationExpiresOn"
            type="date"
            defaultValue={asset.registrationExpiresOn ?? ""}
          />
        </Field>
      </FormSection>

      <Field label="Notes">
        <Textarea name="notes" rows={3} defaultValue={asset.notes ?? ""} />
      </Field>

      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button variant="secondary" type="reset">
          Reset
        </Button>
      </div>
    </Form>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}
