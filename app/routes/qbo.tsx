import { NavLink, Outlet } from "react-router";
import type { Route } from "./+types/qbo";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  return null;
}

export default function QboLayout() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">QBO Import</h1>
          <p className="text-sm text-neutral-600">
            RTI daily journal entries → QuickBooks Online
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <SubNav to="." end label="Import" />
          <SubNav to="history" label="History" />
          <SubNav to="connect" label="Connection" />
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

function SubNav({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "rounded-md px-3 py-1.5 font-medium",
          isActive
            ? "bg-neutral-900 text-white"
            : "text-neutral-700 hover:bg-neutral-100",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}
