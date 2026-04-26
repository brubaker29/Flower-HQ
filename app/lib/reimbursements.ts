/**
 * Reimbursement helpers: IRS mileage rate + bi-weekly pay period math.
 */

/** 2026 IRS standard business mileage rate: $0.725/mile (72.5¢). */
export const MILEAGE_RATE = 0.725;

export function mileageAmount(miles: number): number {
  return Math.round(miles * MILEAGE_RATE * 100);
}

export const REIMBURSEMENT_CATEGORIES = ["mileage", "travel"] as const;
export type ReimbursementCategory = (typeof REIMBURSEMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ReimbursementCategory, string> = {
  mileage: "Mileage",
  travel: "Travel expense",
};

/**
 * Bi-weekly pay period calculation. Given any date, returns the
 * [start, end] of the 2-week period it falls in. Periods are anchored
 * to PAY_PERIOD_ANCHOR and repeat every 14 days forward and backward.
 */
const PAY_PERIOD_ANCHOR = new Date("2026-01-05"); // a Monday
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

export function getPayPeriod(date: Date): { start: string; end: string } {
  const diff = date.getTime() - PAY_PERIOD_ANCHOR.getTime();
  const periodIndex = Math.floor(diff / PERIOD_MS);
  const startMs = PAY_PERIOD_ANCHOR.getTime() + periodIndex * PERIOD_MS;
  const endMs = startMs + PERIOD_MS - 1;
  return {
    start: new Date(startMs).toISOString().slice(0, 10),
    end: new Date(endMs).toISOString().slice(0, 10),
  };
}

export function formatPayPeriod(start: string, end: string): string {
  return `${start} — ${end}`;
}

export function getCurrentPayPeriod(): { start: string; end: string } {
  return getPayPeriod(new Date());
}
