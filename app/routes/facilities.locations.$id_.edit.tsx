import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/facilities.locations.$id_.edit";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { locations } from "~/db/schema";
import { Button, Field, Input, PageHeader, Textarea } from "~/components/ui";

const LocationSchema = z.object({
  name: z.string().min(1, "Required").max(120),
  storeNumber: z.string().max(20).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });
  const db = getDb(context.cloudflare.env);
  const [loc] = await db.select().from(locations).where(eq(locations.id, id));
  if (!loc) throw new Response("Not found", { status: 404 });
  return { location: loc };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  await requireUser(request, context.cloudflare.env);
  const id = Number(params.id);
  const form = await request.formData();
  const parsed = LocationSchema.safeParse({
    name: form.get("name"),
    storeNumber: form.get("storeNumber") || null,
    address: form.get("address") || null,
    notes: form.get("notes") || null,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const db = getDb(context.cloudflare.env);
  await db.update(locations).set(parsed.data).where(eq(locations.id, id));
  return redirect(`/facilities/locations/${id}`);
}

export default function EditLocation({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { location } = loaderData;
  const errors = actionData?.errors;
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Edit location" />
      <Form method="post" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" hint='e.g. "Whitehall"' error={errors?.name?.[0]}>
            <Input name="name" defaultValue={location.name} required />
          </Field>
          <Field
            label="Store number"
            hint="e.g. 116"
            error={errors?.storeNumber?.[0]}
          >
            <Input
              name="storeNumber"
              defaultValue={location.storeNumber ?? ""}
            />
          </Field>
        </div>
        <Field label="Address" error={errors?.address?.[0]}>
          <Input name="address" defaultValue={location.address ?? ""} />
        </Field>
        <Field label="Notes">
          <Textarea
            name="notes"
            rows={3}
            defaultValue={location.notes ?? ""}
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">Save</Button>
          <a
            href={`/facilities/locations/${location.id}`}
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Cancel
          </a>
        </div>
      </Form>
    </div>
  );
}
