import { Form, NavLink } from "react-router";
import { canAccess, type Section } from "~/lib/permissions";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  section?: Section;
}

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/assets", label: "Assets", section: "assets" },
  { to: "/facilities", label: "Facilities", section: "facilities" },
  { to: "/employees", label: "Employees", section: "employees" },
  { to: "/reimbursements", label: "Reimburse", section: "reimbursements" },
  { to: "/qbo", label: "QBO" },
];

export interface ShellUser {
  email: string;
  name: string | null;
  role?: string;
  sections?: string | null;
}

export function Shell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: ShellUser | null;
}) {
  const visibleNavItems = navItems.filter((item) => {
    if (!item.section) return true;
    if (!user) return true;
    return canAccess(
      {
        id: 0,
        email: user.email,
        name: user.name,
        role: user.role ?? "admin",
        sections: user.sections ?? null,
      },
      item.section,
    );
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-block h-8 w-8 rounded bg-pink-600" />
            <span className="text-lg font-semibold tracking-tight">
              Flower HQ
            </span>
          </div>
          <nav className="flex flex-1 justify-center gap-1">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    "rounded-md px-3 py-1.5 text-sm font-medium transition",
                    isActive
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-neutral-600" title={user.email}>
                {user.name ?? user.email}
              </span>
              <Form method="post" action="/logout">
                <button
                  type="submit"
                  className="text-neutral-500 hover:text-neutral-900"
                >
                  Sign out
                </button>
              </Form>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
