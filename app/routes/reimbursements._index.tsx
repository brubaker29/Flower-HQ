import { Link } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/reimbursements._index";
import { getDb } from "~/lib/db.server";
import { employees, reimbursements, users } from "~/db/schema";
import { formatMoney } from "~/lib/money";
import {
  CATEGORY_LABELS,
  formatPayPeriod,
  getPayPeriod,
  type ReimbursementCategory,
} from "~/lib/reimbursements";
import { Badge, LinkButton } from "~/components/ui";

interface Row {
  id: number;
  employeeName: string;
  category: string;
  description: string | null;
  expenseDate: string;
  miles: number | null;
  amountCents: number;
  submittedByName: string | null;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
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
      submittedByName: users.name,
    })
    .from(reimbursements)
    .leftJoin(employees, eq(employees.id, reimbursements.employeeId))
    .leftJoin(users, eq(users.id, reimbursements.submittedBy))
    .orderBy(desc(reimbursements.expenseDate));

  const rows: Row[] = rawRows.map((r) => {
    const period = getPayPeriod(new Date(r.expenseDate));
    return {
      id: r.id,
      employeeName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      category: r.category,
      description: r.description,
      expenseDate: r.expenseDate,
      miles: r.miles,
      amountCents: r.amountCents,
      submittedByName: r.submittedByName,
      periodKey: period.start,
      periodStart: period.start,
      periodEnd: period.end,
    };
  });

  // Group by pay period
  const periods = new Map<
    string,
    { start: string; end: string; rows: Row[]; totalCents: number }
  >();
  for (const row of rows) {
    let p = periods.get(row.periodKey);
    if (!p) {
      p = {
        start: row.periodStart,
        end: row.periodEnd,
        rows: [],
        totalCents: 0,
      };
      periods.set(row.periodKey, p);
    }
    p.rows.push(row);
    p.totalCents += row.amountCents;
  }

  return {
    periods: [...periods.values()].sort((a, b) =>
      b.start.localeCompare(a.start),
    ),
    total: rows.length,
  };
}

export default function ReimbursementsIndex({
  loaderData,
}: Route.ComponentProps) {
  const { periods, total } = loaderData;

  return (
    <div className="space-y-6">
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
        periods.map((period) => (
          <section key={period.start} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Pay period: {formatPayPeriod(period.start, period.end)}
              </h2>
              <span className="text-sm font-semibold text-neutral-900">
                {formatMoney(period.totalCents)}
              </span>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {period.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50">
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
                          {CATEGORY_LABELS[r.category as ReimbursementCategory] ??
                            r.category}
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
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-neutral-50">
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-2 text-xs font-semibold uppercase text-neutral-500"
                    >
                      Period total ({period.rows.length} items)
                    </td>
                    <td className="px-4 py-2 font-semibold text-neutral-900">
                      {formatMoney(period.totalCents)}
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
