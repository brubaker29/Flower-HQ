import { Form } from "react-router";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/admin.users";
import { requireAdmin } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { users } from "~/db/schema";
import { Badge, Button, Field, Input, PageHeader } from "~/components/ui";

const Schema = z.object({
  email: z.string().email("Enter a valid email"),
  name: z.string().max(120).optional().nullable(),
});

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  const db = getDb(context.cloudflare.env);
  const rows = await db.select().from(users).orderBy(asc(users.email));
  return { users: rows };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireAdmin(request, context.cloudflare.env);
  const db = getDb(context.cloudflare.env);
  const form = await request.formData();
  const intent = String(form.get("intent") || "add");

  if (intent === "toggle") {
    const id = Number(form.get("id"));
    const next = String(form.get("next") || "false") === "true";
    if (Number.isFinite(id)) {
      await db
        .update(users)
        .set({ isActive: next })
        .where(eq(users.id, id));
    }
    return null;
  }

  const parsed = Schema.safeParse({
    email: String(form.get("email") || "").trim().toLowerCase(),
    name: form.get("name") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.email?.[0] };
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (existing.length > 0) {
    return { error: "That email already has an account." };
  }

  await db.insert(users).values({
    email: parsed.data.email,
    name: parsed.data.name,
    isActive: true,
  });
  return null;
}

export default function AdminUsers({ loaderData, actionData }: Route.ComponentProps) {
  const { users: rows } = loaderData;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Users"
        subtitle="Add anyone who should be able to sign in. They'll log in with their email + a 6-digit PIN."
      />

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Add a user
        </h2>
        <Form method="post" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email" error={actionData?.error}>
              <Input name="email" type="email" required />
            </Field>
            <Field label="Name (optional)">
              <Input name="name" />
            </Field>
          </div>
          <Button type="submit">Add user</Button>
        </Form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Current users ({rows.length})</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Added</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium">{u.email}</td>
                  <td className="px-4 py-2 text-neutral-700">
                    {u.name ?? "\u2014"}
                  </td>
                  <td className="px-4 py-2">
                    {u.isActive ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Disabled</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {u.createdAt.slice(0, 10)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Form method="post">
                      <input type="hidden" name="intent" value="toggle" />
                      <input type="hidden" name="id" value={u.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={u.isActive ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="text-xs text-neutral-600 hover:underline"
                      >
                        {u.isActive ? "disable" : "enable"}
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
