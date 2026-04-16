import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/assets.$id_.readings.new";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { assets, mileageReadings } from "~/db/schema";
import { Button, Field, Input, PageHeader, Textarea } from "~/components/ui";

const ReadingSchema = z.object({
  readOn: z.string().min(1, "Required"),
  mileage: z.coerce.number().int().min(0),
  note: z.string().optional().nullable(),
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
  const user = await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  const form = await request.formData();
  const parsed = ReadingSchema.safeParse({
    readOn: form.get("readOn"),
    mileage: form.get("mileage"),
    note: form.get("note") || null,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const db = getDb(context.cloudflare.env);
  await db.insert(mileageReadings).values({
    assetId: id,
    readOn: parsed.data.readOn,
    mileage: parsed.data.mileage,
    note: parsed.data.note,
    source: "manual",
    createdBy: user.id,
  });

  // Update the cached current_mileage on the asset when this is the
  // highest reading we've seen.
  const [asset] = await db.select().from(assets).where(eq(assets.id, id));
  if (
    asset &&
    (asset.currentMileage == null || parsed.data.mileage > asset.currentMileage)
  ) {
    await db
      .update(assets)
      .set({
        currentMileage: parsed.data.mileage,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(assets.id, id));
  }

  return redirect(`/assets/${id}`);
}

export default function NewReading({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { asset } = loaderData;
  const errors = actionData?.errors;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="Log mileage reading"
        subtitle={`for ${asset.name}${
          asset.currentMileage != null
            ? ` — last ${asset.currentMileage.toLocaleString()} mi`
            : ""
        }`}
      />
      <Form method="post" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Reading date" error={errors?.readOn?.[0]}>
            <Input name="readOn" type="date" defaultValue={today} required />
          </Field>
          <Field label="Odometer (miles)" error={errors?.mileage?.[0]}>
            <Input name="mileage" type="number" min={0} required />
          </Field>
        </div>
        <Field label="Note (optional)">
          <Textarea name="note" rows={2} placeholder="Anything worth noting" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">Save reading</Button>
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
