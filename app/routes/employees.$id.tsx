import { Form } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/employees.$id";
import { requireAdmin, requireSection } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { employees, locations, users } from "~/db/schema";
import { createPin } from "~/lib/pin.server";
import { sendEmail } from "~/lib/email.server";
import { ALL_SECTIONS, SECTION_LABELS, type Section } from "~/lib/permissions";
import { Badge, Button, Field, Input, LinkButton, PageHeader, Select } from "~/components/ui";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  await requireSection(request, context.cloudflare.env, "employees");
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });
  const db = getDb(context.cloudflare.env);

  const [emp] = await db
    .select({
      employee: employees,
      locationName: locations.name,
    })
    .from(employees)
    .leftJoin(locations, eq(locations.id, employees.locationId))
    .where(eq(employees.id, id));
  if (!emp) throw new Response("Not found", { status: 404 });

  const linkedUser = await db
    .select()
    .from(users)
    .where(eq(users.employeeId, id))
    .limit(1);

  return {
    employee: { ...emp.employee, locationName: emp.locationName },
    appUser: linkedUser[0] ?? null,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  // Invite, access changes, revoke, terminate all require admin.
  // Viewing employee details is section-gated ("employees").
  if (["invite", "update_access", "revoke", "terminate", "reactivate"].includes(intent)) {
    await requireAdmin(request, env);
  } else {
    await requireSection(request, env, "employees");
  }

  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Not found", { status: 404 });

  const db = getDb(env);

  if (intent === "invite") {
    const [emp] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, id));
    if (!emp?.email) return { error: "Employee needs an email address first." };

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, emp.email))
      .limit(1);

    let userId: number;
    if (existing.length > 0) {
      userId = existing[0].id;
      await db
        .update(users)
        .set({ employeeId: id, isActive: true })
        .where(eq(users.id, userId));
    } else {
      const role = String(form.get("role") || "employee");
      const sections = form.getAll("sections").join(",") || null;
      const [u] = await db
        .insert(users)
        .values({
          email: emp.email,
          name: `${emp.firstName} ${emp.lastName}`,
          role: role as "admin" | "employee",
          sections,
          employeeId: id,
          isActive: true,
        })
        .returning();
      userId = u.id;
    }

    const pin = await createPin(db, userId);
    try {
      await sendEmail(env, {
        to: emp.email,
        subject: "You've been invited to Flower HQ",
        text: `You now have access to Flower HQ. Your first login PIN is ${pin}. Go to the site and sign in with ${emp.email}.`,
        html: `<p>You now have access to <strong>Flower HQ</strong>.</p><p>Your first login PIN is <strong style="font-size:1.5rem;letter-spacing:.2em">${pin}</strong></p><p>Go to the site and sign in with ${emp.email}.</p>`,
      });
    } catch (err) {
      console.error("[invite] sendEmail failed", err);
    }

    return { invited: true };
  }

  if (intent === "update_access") {
    const userIdStr = form.get("userId");
    const uId = Number(userIdStr);
    if (!Number.isFinite(uId)) return null;
    const role = String(form.get("role") || "employee");
    const sections = form.getAll("sections").join(",") || null;
    await db
      .update(users)
      .set({ role: role as "admin" | "employee", sections })
      .where(eq(users.id, uId));
    return { updated: true };
  }

  if (intent === "revoke") {
    const uId = Number(form.get("userId"));
    if (Number.isFinite(uId)) {
      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, uId));
    }
    return { revoked: true };
  }

  if (intent === "terminate") {
    const termDate = String(
      form.get("terminationDate") || new Date().toISOString().slice(0, 10),
    );
    await db
      .update(employees)
      .set({
        isActive: false,
        terminationDate: termDate,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(employees.id, id));
    return null;
  }

  if (intent === "reactivate") {
    await db
      .update(employees)
      .set({
        isActive: true,
        terminationDate: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(employees.id, id));
    return null;
  }

  return null;
}

export default function EmployeeDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { employee: emp, appUser } = loaderData;
  return (
    <div className="space-y-8">
      <PageHeader
        title={`${emp.firstName} ${emp.lastName}`}
        subtitle={[emp.position, emp.locationName].filter(Boolean).join(" · ")}
        actions={
          <LinkButton variant="secondary" href={`${emp.id}/edit`}>
            Edit
          </LinkButton>
        }
      />

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          {emp.isActive ? (
            <Badge tone="green">Active</Badge>
          ) : (
            <Badge tone="neutral">Inactive</Badge>
          )}
          {appUser && (
            <Badge tone={appUser.isActive ? "blue" : "neutral"}>
              {appUser.isActive ? "Has app access" : "Access revoked"}
            </Badge>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <InfoRow label="Email" value={emp.email} />
          <InfoRow label="Phone" value={emp.phone} />
          <InfoRow label="Position" value={emp.position} />
          <InfoRow label="Store" value={emp.locationName} />
          <InfoRow label="Hired" value={emp.hireDate} />
          <InfoRow
            label="Terminated"
            value={emp.terminationDate}
          />
        </dl>
        {emp.notes && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">
            {emp.notes}
          </p>
        )}

        {emp.isActive && (
          <Form method="post" className="mt-4">
            <input type="hidden" name="intent" value="terminate" />
            <Button variant="danger" type="submit">
              Mark terminated
            </Button>
          </Form>
        )}
        {!emp.isActive && (
          <Form method="post" className="mt-4">
            <input type="hidden" name="intent" value="reactivate" />
            <Button variant="secondary" type="submit">
              Reactivate
            </Button>
          </Form>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          App access
        </h2>

        {actionData?.invited && (
          <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Invitation sent! They'll get an email with a login PIN.
          </div>
        )}
        {actionData?.updated && (
          <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Access updated.
          </div>
        )}
        {actionData?.error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {actionData.error}
          </div>
        )}

        {!appUser ? (
          <Form method="post" className="mt-4 space-y-4">
            <input type="hidden" name="intent" value="invite" />
            <p className="text-sm text-neutral-600">
              {emp.email
                ? `Invite ${emp.firstName} to use Flower HQ. A login PIN will be emailed to ${emp.email}.`
                : `Add an email address first (via Edit) before inviting.`}
            </p>
            {emp.email && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Role">
                    <Select name="role" defaultValue="employee">
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </Field>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-neutral-800">
                    Section access
                  </legend>
                  <div className="flex flex-wrap gap-4">
                    {ALL_SECTIONS.map((s) => (
                      <label
                        key={s}
                        className="flex items-center gap-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="sections"
                          value={s}
                          defaultChecked
                        />
                        {SECTION_LABELS[s]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit">Send invitation</Button>
              </>
            )}
          </Form>
        ) : (
          <div className="mt-4 space-y-4">
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="update_access" />
              <input type="hidden" name="userId" value={appUser.id} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Role">
                  <Select name="role" defaultValue={appUser.role}>
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                  </Select>
                </Field>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-neutral-800">
                  Section access
                </legend>
                <div className="flex flex-wrap gap-4">
                  {ALL_SECTIONS.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="sections"
                        value={s}
                        defaultChecked={
                          appUser.role === "admin" ||
                          (appUser.sections ?? "").includes(s)
                        }
                      />
                      {SECTION_LABELS[s]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex gap-2">
                <Button type="submit" variant="secondary">
                  Update access
                </Button>
                <Form method="post">
                  <input type="hidden" name="intent" value="revoke" />
                  <input type="hidden" name="userId" value={appUser.id} />
                  <Button type="submit" variant="danger">
                    Revoke access
                  </Button>
                </Form>
              </div>
            </Form>
          </div>
        )}
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-neutral-900">{value ?? "—"}</dd>
    </div>
  );
}
