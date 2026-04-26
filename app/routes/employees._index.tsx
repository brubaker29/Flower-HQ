import { Link, useSearchParams } from "react-router";
import { asc, eq, like, or } from "drizzle-orm";
import type { Route } from "./+types/employees._index";
import { getDb } from "~/lib/db.server";
import { employees, locations } from "~/db/schema";
import { Badge, Input } from "~/components/ui";

export async function loader({ context, request }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const showInactive = url.searchParams.get("inactive") === "1";

  let query = db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      phone: employees.phone,
      position: employees.position,
      locationName: locations.name,
      hireDate: employees.hireDate,
      isActive: employees.isActive,
    })
    .from(employees)
    .leftJoin(locations, eq(locations.id, employees.locationId))
    .orderBy(asc(employees.lastName), asc(employees.firstName))
    .$dynamic();

  if (!showInactive) {
    query = query.where(eq(employees.isActive, true));
  }

  const rows = await query;

  const filtered = q
    ? rows.filter((r) => {
        const haystack =
          `${r.firstName} ${r.lastName} ${r.email ?? ""} ${r.position ?? ""} ${r.locationName ?? ""}`.toLowerCase();
        return haystack.includes(q.toLowerCase());
      })
    : rows;

  return { employees: filtered, total: rows.length, query: q, showInactive };
}

export default function EmployeesIndex({ loaderData }: Route.ComponentProps) {
  const { employees: rows, total, query, showInactive } = loaderData;
  const [, setSearchParams] = useSearchParams();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <form className="flex-1">
          <Input
            name="q"
            type="search"
            placeholder="Search by name, position, store..."
            defaultValue={query}
          />
          {showInactive && (
            <input type="hidden" name="inactive" value="1" />
          )}
        </form>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) =>
              setSearchParams((prev) => {
                if (e.target.checked) prev.set("inactive", "1");
                else prev.delete("inactive");
                return prev;
              })
            }
          />
          Show inactive
        </label>
        <span className="text-sm text-neutral-500">
          {rows.length}
          {rows.length !== total ? ` of ${total}` : ""} employees
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-600">
          {query
            ? `No employees matching "${query}".`
            : "No employees yet. Add your first one or import from Gusto."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Position</th>
                <th className="px-4 py-2">Store</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Hired</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-medium">
                    <Link
                      to={`${e.id}`}
                      className="text-neutral-900 hover:underline"
                    >
                      {e.firstName} {e.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {e.position ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {e.locationName ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {e.phone ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {e.email ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">
                    {e.hireDate ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {e.isActive ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
