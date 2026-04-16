import { Form } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/facilities.vendors";
import { requireUser } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { vendors } from "~/db/schema";
import { Button, Field, Input, PageHeader } from "~/components/ui";
import { asc, eq } from "drizzle-orm";

const VendorSchema = z.object({
  name: z.string().min(1, "Required").max(120),
  category: z.string().max(60).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().max(120).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  const db = getDb(context.cloudflare.env);
  const rows = await db.select().from(vendors).orderBy(asc(vendors.name));
  return { vendors: rows };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(request, context.cloudflare.env);
  const form = await request.formData();
  const intent = String(form.get("intent") || "add");
  const db = getDb(context.cloudflare.env);

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (Number.isFinite(id)) {
      await db.delete(vendors).where(eq(vendors.id, id));
    }
    return null;
  }

  const parsed = VendorSchema.safeParse({
    name: form.get("name"),
    category: form.get("category") || null,
    phone: form.get("phone") || null,
    email: form.get("email") || null,
    notes: form.get("notes") || null,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  await db.insert(vendors).values(parsed.data);
  return null;
}

export default function Vendors({ loaderData, actionData }: Route.ComponentProps) {
  const { vendors: rows } = loaderData;
  const errors = actionData?.errors;
  return (
    <div className="space-y-8">
      <PageHeader title="Vendors" subtitle="Shared across asset and facility work" />

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Add a vendor
        </h2>
        <Form method="post" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors?.name?.[0]}>
              <Input name="name" required />
            </Field>
            <Field
              label="Category"
              hint="e.g. HVAC, plumber, mechanic"
              error={errors?.category?.[0]}
            >
              <Input name="category" />
            </Field>
            <Field label="Phone" error={errors?.phone?.[0]}>
              <Input name="phone" />
            </Field>
            <Field label="Email" error={errors?.email?.[0]}>
              <Input name="email" type="email" />
            </Field>
          </div>
          <Field label="Notes">
            <Input name="notes" />
          </Field>
          <Button type="submit">Add</Button>
        </Form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Directory ({rows.length})</h2>
        {rows.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
            No vendors yet. They also get auto-created when you type a new
            vendor name into a maintenance or work-order form.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Notes</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2 font-medium">{v.name}</td>
                    <td className="px-4 py-2 text-neutral-700">{v.category ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-700">{v.phone ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-700">{v.email ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-700">{v.notes ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={v.id} />
                        <button
                          type="submit"
                          className="text-xs text-red-600 hover:underline"
                        >
                          delete
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
