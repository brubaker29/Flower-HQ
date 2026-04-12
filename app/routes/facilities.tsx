import { NavLink, Outlet } from "react-router";
import type { Route } from "./+types/facilities";
import { requireUser } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireUser(request, context.cloudflare.env);
  return null;
}

export default function FacilitiesLayout() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Facilities Maintenance</h1>
          <p className="text-sm text-neutral-600">
            HVAC, plumbing, electrical across the stores
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <SubNav to="." end label="Locations" />
          <SubNav to="work-orders" label="Work orders" />
          <SubNav to="vendors" label="Vendors" />
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
