import { Form, redirect, useSearchParams } from "react-router";
import { useState } from "react";
import { asc } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/reimbursements.new";
import { requireSection } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { employees, reimbursementCategories } from "~/db/schema";
import { inputToCents } from "~/lib/money";
import {
  CATEGORY_LABELS,
  MILEAGE_RATE,
  mileageAmount,
} from "~/lib/reimbursements";
import { Button, Field, Input, PageHeader, Select, Textarea } from "~/components/ui";

const Schema = z.object({
  employeeId: z.coerce.number().int().min(1, "Required"),
  category: z.enum(reimbursementCategories),
  description: z.string().min(1, "Required").max(500),
  expenseDate: z.string().min(1, "Required"),
  miles: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireSection(request, context.cloudflare.env, "reimbursements");
  const db = getDb(context.cloudflare.env);
  const emps = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(z.literal(true).parse(true) ? undefined : undefined)
    .orderBy(asc(employees.lastName), asc(employees.firstName));
  const activeEmps = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .orderBy(asc(employees.lastName), asc(employees.firstName));
  return { employees: activeEmps };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireSection(
    request,
    context.cloudflare.env,
    "reimbursements",
  );
  const form = await request.formData();
  const parsed = Schema.safeParse({
    employeeId: form.get("employeeId"),
    category: form.get("category"),
    description: form.get("description"),
    expenseDate: form.get("expenseDate"),
    miles: form.get("miles") || null,
    notes: form.get("notes") || null,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const db = getDb(context.cloudflare.env);
  const { reimbursements } = await import("~/db/schema");

  let amountCents: number;
  let ratePerMile: number | null = null;

  if (parsed.data.category === "mileage") {
    const miles = parsed.data.miles ?? 0;
    ratePerMile = MILEAGE_RATE;
    amountCents = mileageAmount(miles);
  } else {
    amountCents = inputToCents(form.get("amount")) ?? 0;
  }

  const [row] = await db
    .insert(reimbursements)
    .values({
      employeeId: parsed.data.employeeId,
      submittedBy: user.id,
      category: parsed.data.category,
      description: parsed.data.description,
      expenseDate: parsed.data.expenseDate,
      miles: parsed.data.category === "mileage" ? parsed.data.miles : null,
      ratePerMile,
      amountCents,
      notes: parsed.data.notes,
    })
    .returning({ id: reimbursements.id });

  return redirect(`/reimbursements`);
}

export default function NewReimbursement({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { employees: emps } = loaderData;
  const errors = actionData?.errors;
  const today = new Date().toISOString().slice(0, 10);
  const [category, setCategory] = useState<string>("mileage");
  const [miles, setMiles] = useState<string>("");

  const estimatedAmount =
    category === "mileage" && miles
      ? (Number(miles) * MILEAGE_RATE).toFixed(2)
      : null;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Submit reimbursement"
        subtitle={`Mileage rate: $${MILEAGE_RATE}/mile (2026 IRS)`}
      />
      <Form method="post" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Employee" error={errors?.employeeId?.[0]}>
            <Select name="employeeId" required>
              <option value="">— Select —</option>
              {emps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName}, {e.firstName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" error={errors?.category?.[0]}>
            <Select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              {reimbursementCategories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" error={errors?.expenseDate?.[0]}>
            <Input name="expenseDate" type="date" defaultValue={today} required />
          </Field>

          {category === "mileage" ? (
            <Field
              label="Miles driven"
              hint={
                estimatedAmount
                  ? `= $${estimatedAmount} at $${MILEAGE_RATE}/mi`
                  : undefined
              }
              error={errors?.miles?.[0]}
            >
              <Input
                name="miles"
                type="number"
                step="0.1"
                min={0}
                value={miles}
                onChange={(e) => setMiles(e.target.value)}
                required
              />
            </Field>
          ) : (
            <Field label="Amount (USD)">
              <Input
                name="amount"
                type="number"
                step="0.01"
                min={0}
                required
              />
            </Field>
          )}
        </div>
        <Field label="Description" error={errors?.description?.[0]}>
          <Textarea
            name="description"
            rows={3}
            placeholder={
              category === "mileage"
                ? "e.g. Drove to Whitehall for delivery"
                : "e.g. Parking for downtown pickup"
            }
            required
          />
        </Field>
        <Field label="Notes (optional)">
          <Textarea name="notes" rows={2} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">Submit</Button>
          <a
            href="/reimbursements"
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Cancel
          </a>
        </div>
      </Form>
    </div>
  );
}
