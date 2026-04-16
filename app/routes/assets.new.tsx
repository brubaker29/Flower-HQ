import { Form, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/assets.new";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { assets, assetKinds, locations, mileageReadings } from "~/db/schema";
import { inputToCents } from "~/lib/money";
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
  locationId: z.coerce.number().int().min(1).optional().nullable(),
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

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const db = getDb(context.cloudflare.env);
  const locs = await db.select().from(locations).orderBy(locations.name);
  return { locations: locs };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context.cloudflare.env);
  const form = await request.formData();
  const parsed = AssetSchema.safeParse({
    kind: form.get("kind"),
    name: form.get("name"),
    locationId: form.get("locationId") || null,
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
  const [inserted] = await db
    .insert(assets)
    .values({
      ...parsed.data,
      purchasePriceCents: inputToCents(form.get("purchasePrice")),
    })
    .returning({ id: assets.id });

  if (parsed.data.currentMileage != null) {
    await db.insert(mileageReadings).values({
      assetId: inserted.id,
      readOn: new Date().toISOString().slice(0, 10),
      mileage: parsed.data.currentMileage,
      source: "manual",
      createdBy: user.id,
    });
  }

  return redirect(`/assets/${inserted.id}`);
}

export default function NewAsset({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { locations: locs } = loaderData;
  const errors = actionData?.errors;
  return (
    <Form method="post" className="max-w-2xl space-y-6">
      <FormSection title="Basics">
        <Field label="Kind" error={errors?.kind?.[0]}>
          <Select name="kind" defaultValue="van" required>
            {assetKinds.map((k) => (
              <option key={k} value={k}>
                {k[0].toUpperCase() + k.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" hint="e.g. V-15" error={errors?.name?.[0]}>
          <Input name="name" required />
        </Field>
        <Field label="Location" error={errors?.locationId?.[0]}>
          <Select name="locationId" defaultValue="">
            <option value="">— None —</option>
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.storeNumber ? ` (#${l.storeNumber})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plate" error={errors?.plate?.[0]}>
          <Input name="plate" placeholder="ABC 1234" />
        </Field>
        <Field
          label="VIN"
          hint="17 chars, no I/O/Q"
          error={errors?.vin?.[0]}
        >
          <Input
            name="vin"
            placeholder="17-character VIN"
            maxLength={17}
            style={{ textTransform: "uppercase" }}
          />
        </Field>
        <Field label="Make" error={errors?.make?.[0]}>
          <Input name="make" defaultValue="Ford" />
        </Field>
        <Field label="Model" error={errors?.model?.[0]}>
          <Input name="model" />
        </Field>
        <Field label="Year" error={errors?.year?.[0]}>
          <Input name="year" type="number" min={1900} max={2100} />
        </Field>
        <Field label="Current mileage" error={errors?.currentMileage?.[0]}>
          <Input name="currentMileage" type="number" min={0} />
        </Field>
      </FormSection>

      <FormSection title="Purchase">
        <Field label="Purchase date" error={errors?.purchaseDate?.[0]}>
          <Input name="purchaseDate" type="date" />
        </Field>
        <Field label="Purchase price (USD)">
          <Input name="purchasePrice" type="number" step="0.01" min={0} />
        </Field>
      </FormSection>

      <FormSection title="Ohio registration">
        <Field label="Registered on" error={errors?.registeredOn?.[0]}>
          <Input name="registeredOn" type="date" />
        </Field>
        <Field
          label="Expires on"
          error={errors?.registrationExpiresOn?.[0]}
        >
          <Input name="registrationExpiresOn" type="date" />
        </Field>
      </FormSection>

      <Field label="Notes">
        <Textarea name="notes" rows={3} />
      </Field>

      <div className="flex gap-2">
        <Button type="submit">Create asset</Button>
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
