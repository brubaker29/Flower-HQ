import { Form } from "react-router";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { Route } from "./+types/reimbursements._index";
import { requireAdmin, requireSection } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { employees, reimbursements, users } from "~/db/schema";
import { formatMoney } from "~/lib/money";
import {
  CATEGORY_LABELS,
  formatPayPeriod,
  getPayPeriod,
  type PayPeriod,
  type ReimbursementCategory,
} from "~/lib/reimbursements";
import { Badge, Button, LinkButton } from "~/components/ui";

interface Row {
  id: number;
  employeeName: string;
  category: string;
  description: string | null;
  expenseDate: string;
  miles: number | null;
  amountCents: number;
  submittedToGusto: boolean;
}

interface PeriodGroup {
  period: PayPeriod;
  rows: Row[];
  totalCents: number;
  allSubmitted: boolean;
  anySubmitted: boolean;
}

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env);
  const rawRows = await db
    .select({
      id: reimbursements.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      category: reimbursements.category,
      description: reimbursements.description,
      expenseDate: reimbursements.expenseDate,
      miles: reimbursements.miles,
      amountCents: reimbursements.amountCents,
      submittedToGusto: reimbursements.submittedToGusto,
    })
    .from(reimbursements)
    .leftJoin(employees, eq(employees.id, reimbursements.employeeId))
    .orderBy(desc(reimbursements.expenseDate));

  const periods = new Map<string, PeriodGroup>();
  for (const r of rawRows) {
    const period = getPayPeriod(new Date(r.expenseDate));
    let p = periods.get(period.start);
    if (!p) {
      p = {
        period,
        rows: [],
        totalCents: 0,
        allSubmitted: true,
        anySubmitted: false,
      };
      periods.set(period.start, p);
    }
    const row: Row = {
      id: r.id,
      employeeName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      category: r.category,
      description: r.description,
      expenseDate: r.expenseDate,
      miles: r.miles,
      amountCents: r.amountCents,
      submittedToGusto: r.submittedToGusto,
    };
    p.rows.push(row);
    p.totalCents += r.amountCents;
    if (!r.submittedToGusto) p.allSubmitted = false;
    if (r.submittedToGusto) p.anySubmitted = true;
  }

  return {
    periods: [...periods.values()].sort((a, b) =>
      b.period.start.localeCompare(a.period.start),
    ),
    total: rawRows.length,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireAdmin(request, context.cloudflare.env);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const periodStart = String(form.get("periodStart") || "");
  const periodEnd = String(form.get("periodEnd") || "");

  if (!periodStart || !periodEnd) return null;
  const db = getDb(context.cloudflare.env);

  if (intent === "mark_submitted") {
    await db
      .update(reimbursements)
      .set({ submittedToGusto: true, updatedAt: new Date().toISOString() })
      .where(
        and(
          gte(reimbursements.expenseDate, periodStart),
          lte(reimbursements.expenseDate, periodEnd),
        ),
      );
  }

  if (intent === "unmark_submitted") {
    await db
      .update(reimbursements)
      .set({ submittedToGusto: false, updatedAt: new Date().toISOString() })
      .where(
        and(
          gte(reimbursements.expenseDate, periodStart),
          lte(reimbursements.expenseDate, periodEnd),
        ),
      );
  }

  return null;
}

export default function ReimbursementsIndex({
  loaderData,
}: Route.ComponentProps) {
  const { periods, total } = loaderData;

  return (
    <div className="space-y-8">
      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-sm text-neutral-600">
            No reimbursements yet. Submit one for mileage or travel expenses.
          </p>
          <div className="mt-4">
            <LinkButton href="new">+ Submit reimbursement</LinkButton>
          </div>
        </div>
      ) : (
        periods.map((pg) => (
          <section key={pg.period.start} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {formatPayPeriod(pg.period.start, pg.period.end)}
                </h2>
                <p className="text-xs text-neutral-400">
                  Payday {pg.period.payday} · Run payroll by{" "}
                  {pg.period.runPayrollBy}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {pg.allSubmitted ? (
                  <Badge tone="green">Submitted to Gusto</Badge>
                ) : pg.anySubmitted ? (
                  <Badge tone="amber">Partially submitted</Badge>
                ) : (
                  <Badge tone="red">Pending</Badge>
                )}
                <span className="text-sm font-semibold text-neutral-900">
                  {formatMoney(pg.totalCents)}
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-2">Employee</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Miles</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Gusto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pg.rows.map((r) => (
                    <tr
                      key={r.id}
                      className={
                        r.submittedToGusto
                          ? "bg-green-50/50"
                          : "hover:bg-neutral-50"
                      }
                    >
                      <td className="px-4 py-2 font-medium">
                        {r.employeeName}
                      </td>
                      <td className="px-4 py-2 text-neutral-700">
                        {r.expenseDate}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          tone={
                            r.category === "mileage" ? "blue" : "neutral"
                          }
                        >
                          {CATEGORY_LABELS[
                            r.category as ReimbursementCategory
                          ] ?? r.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-neutral-700 max-w-xs truncate">
                        {r.description ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-neutral-700">
                        {r.miles != null ? r.miles.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-2 font-medium text-neutral-900">
                        {formatMoney(r.amountCents)}
                      </td>
                      <td className="px-4 py-2">
                        {r.submittedToGusto ? (
                          <span className="text-xs text-green-700">✓</span>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-neutral-50">
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-2 text-xs font-semibold uppercase text-neutral-500"
                    >
                      Period total ({pg.rows.length} items)
                    </td>
                    <td className="px-4 py-2 font-semibold text-neutral-900">
                      {formatMoney(pg.totalCents)}
                    </td>
                    <td className="px-4 py-2">
                      <Form method="post">
                        <input
                          type="hidden"
                          name="periodStart"
                          value={pg.period.start}
                        />
                        <input
                          type="hidden"
                          name="periodEnd"
                          value={pg.period.end}
                        />
                        {pg.allSubmitted ? (
                          <>
                            <input
                              type="hidden"
                              name="intent"
                              value="unmark_submitted"
                            />
                            <button
                              type="submit"
                              className="text-xs text-neutral-500 hover:underline"
                            >
                              undo
                            </button>
                          </>
                        ) : (
                          <>
                            <input
                              type="hidden"
                              name="intent"
                              value="mark_submitted"
                            />
                            <Button type="submit" variant="secondary">
                              Mark submitted
                            </Button>
                          </>
                        )}
                      </Form>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
