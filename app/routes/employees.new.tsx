import { Form, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/employees.new";
import { requireSection } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { employees, locations } from "~/db/schema";
import { Button, Field, Input, PageHeader, Select, Textarea } from "~/components/ui";

const EmployeeSchema = z.object({
  firstName: z.string().min(1, "Required").max(80),
  lastName: z.string().min(1, "Required").max(80),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  position: z.string().max(80).optional().nullable(),
  locationId: z.coerce.number().int().min(1).optional().nullable(),
  hireDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireSection(request, context.cloudflare.env, "employees");
  const db = getDb(context.cloudflare.env);
  const locs = await db.select().from(locations).orderBy(locations.name);
  return { locations: locs };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireSection(request, context.cloudflare.env, "employees");
  const form = await request.formData();
  const parsed = EmployeeSchema.safeParse({
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    email: form.get("email") || null,
    phone: form.get("phone") || null,
    position: form.get("position") || null,
    locationId: form.get("locationId") || null,
    hireDate: form.get("hireDate") || null,
    notes: form.get("notes") || null,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const db = getDb(context.cloudflare.env);
  const [row] = await db
    .insert(employees)
    .values(parsed.data)
    .returning({ id: employees.id });
  return redirect(`/employees/${row.id}`);
}

export default function NewEmployee({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { locations: locs } = loaderData;
  const errors = actionData?.errors;
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Add employee" />
      <Form method="post" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors?.firstName?.[0]}>
            <Input name="firstName" required />
          </Field>
          <Field label="Last name" error={errors?.lastName?.[0]}>
            <Input name="lastName" required />
          </Field>
          <Field label="Email" error={errors?.email?.[0]}>
            <Input name="email" type="email" />
          </Field>
          <Field label="Phone" error={errors?.phone?.[0]}>
            <Input name="phone" />
          </Field>
          <Field label="Position" hint="e.g. Driver, Designer, Manager">
            <Input name="position" />
          </Field>
          <Field label="Home store">
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
          <Field label="Hire date">
            <Input name="hireDate" type="date" />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" rows={3} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">Add employee</Button>
          <a
            href="/employees"
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Cancel
          </a>
        </div>
      </Form>
    </div>
  );
}
