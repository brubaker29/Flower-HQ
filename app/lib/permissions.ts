import type { SessionUser } from "./auth.server";

export const ALL_SECTIONS = [
  "assets",
  "facilities",
  "employees",
  "reimbursements",
] as const;

export type Section = (typeof ALL_SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  assets: "Asset Tracking",
  facilities: "Facilities",
  employees: "Employees",
  reimbursements: "Reimbursements",
};

export function userSections(user: SessionUser): Section[] {
  if (user.role === "admin") return [...ALL_SECTIONS];
  if (!user.sections) return [];
  return user.sections
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Section =>
      ALL_SECTIONS.includes(s as Section),
    );
}

export function canAccess(user: SessionUser, section: Section): boolean {
  if (user.role === "admin") return true;
  return userSections(user).includes(section);
}
