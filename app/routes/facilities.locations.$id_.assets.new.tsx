import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/facilities.locations.$id_.assets.new";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import {
  facilityAssetKinds,
  facilityAssets,
  locations,
} from "~/db/schema";
import { Button, Field, Input, PageHeader, Select, Textarea } from "~/components/ui";

const FacilityAssetSchema = z.object({
  kind: z.enum(facilityAssetKinds),
  name: z.string().min(1, "Required").max(120),
  identifier: z.string().max(120).optional().nullable(),
  installDate: z.string().optional().nullable(),
  warrantyExpiresAt: z.string().optional().nullable(),
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
  const parsed = FacilityAssetSchema.safeParse({
    kind: form.get("kind"),
    name: form.get("name"),
    identifier: form.get("identifier") || null,
    installDate: form.get("installDate") || null,
    warrantyExpiresAt: form.get("warrantyExpiresAt") || null,
    notes: form.get("notes") || null,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const db = getDb(context.cloudflare.env);
  await db.insert(facilityAssets).values({
    ...parsed.data,
    locationId: id,
  });
  return redirect(`/facilities/locations/${id}`);
}

export default function NewFacilityAsset({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { location } = loaderData;
  const errors = actionData?.errors;
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="Add equipment"
        subtitle={`for ${location.name}`}
      />
      <Form method="post" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Kind" error={errors?.kind?.[0]}>
            <Select name="kind" defaultValue="hvac" required>
              <option value="hvac">HVAC</option>
              <option value="plumbing">Plumbing</option>
              <option value="electrical">Electrical</option>
              <option value="refrigeration">Refrigeration</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Name" hint="e.g. Roof HVAC #1" error={errors?.name?.[0]}>
            <Input name="name" required />
          </Field>
          <Field label="Identifier" hint="Model or serial" error={errors?.identifier?.[0]}>
            <Input name="identifier" />
          </Field>
          <Field label="Installed" error={errors?.installDate?.[0]}>
            <Input name="installDate" type="date" />
          </Field>
          <Field
            label="Warranty expires"
            error={errors?.warrantyExpiresAt?.[0]}
          >
            <Input name="warrantyExpiresAt" type="date" />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" rows={3} />
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
