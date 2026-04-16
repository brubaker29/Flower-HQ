import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/assets.$id.sell";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { assets } from "~/db/schema";
import { inputToCents } from "~/lib/money";
import { Button, Field, Input, PageHeader, Textarea } from "~/components/ui";

const SellSchema = z.object({
  saleDate: z.string().min(1, "Required"),
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
  const parsed = SellSchema.safeParse({
    saleDate: form.get("saleDate"),
    notes: form.get("notes") || null,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const db = getDb(context.cloudflare.env);
  const existing = await db.select().from(assets).where(eq(assets.id, id));
  const appendedNotes = parsed.data.notes
    ? `${existing[0]?.notes ?? ""}${existing[0]?.notes ? "\n\n" : ""}Sold ${parsed.data.saleDate}: ${parsed.data.notes}`
    : existing[0]?.notes;
  await db
    .update(assets)
    .set({
      status: "sold",
      saleDate: parsed.data.saleDate,
      salePriceCents: inputToCents(form.get("salePrice")),
      notes: appendedNotes ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(assets.id, id));
  return redirect(`/assets/${id}`);
}

export default function SellAsset({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { asset } = loaderData;
  const errors = actionData?.errors;
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title={`Mark "${asset.name}" sold`} />
      <Form method="post" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Sale date" error={errors?.saleDate?.[0]}>
            <Input name="saleDate" type="date" required />
          </Field>
          <Field label="Sale price (USD)">
            <Input name="salePrice" type="number" step="0.01" min={0} />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <Textarea name="notes" rows={3} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="danger">
            Mark sold
          </Button>
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
