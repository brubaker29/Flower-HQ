/**
 * Shared "due soon" logic used by the top-level dashboard and both sub-app
 * indexes. Pure functions — no DB access — so they're easy to unit test.
 */

export interface DueItem {
  kind: "asset_service" | "work_order";
  id: number;
  title: string;
  subtitle: string;
  /** ISO date string or null if mileage-based only. */
  dueDate: string | null;
  /** Number of days until due. Negative if overdue. Null if unknown. */
  daysUntil: number | null;
  overdue: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

export function isMileageDue(
  current: number | null,
  nextDue: number | null,
  warnMiles = 500,
): boolean {
  if (current == null || nextDue == null) return false;
  return current >= nextDue - warnMiles;
}

export function isDateDue(
  nextDue: string | null,
  now: Date = new Date(),
  warnDays = 14,
): boolean {
  if (!nextDue) return false;
  const due = new Date(nextDue);
  if (Number.isNaN(due.getTime())) return false;
  return daysBetween(now, due) <= warnDays;
}

export function sortByUrgency(items: DueItem[]): DueItem[] {
  return [...items].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const ad = a.daysUntil ?? Number.POSITIVE_INFINITY;
    const bd = b.daysUntil ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}
