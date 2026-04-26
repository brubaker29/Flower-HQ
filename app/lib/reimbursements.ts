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
 * Bi-weekly pay period calculation aligned to the Gusto schedule.
 * Periods are Sun–Sat, 14 days, anchored to 04/12/2026.
 *
 * Payday = period end + 6 days (Friday after the period closes)
 * Run payroll by = period end + 4 days (Wednesday)
 */
const PAY_PERIOD_ANCHOR = new Date("2026-04-12"); // Sunday
const PERIOD_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = PERIOD_DAYS * DAY_MS;

export interface PayPeriod {
  start: string;
  end: string;
  payday: string;
  runPayrollBy: string;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getPayPeriod(date: Date): PayPeriod {
  const diff = date.getTime() - PAY_PERIOD_ANCHOR.getTime();
  const periodIndex = Math.floor(diff / PERIOD_MS);
  const startMs = PAY_PERIOD_ANCHOR.getTime() + periodIndex * PERIOD_MS;
  const start = new Date(startMs).toISOString().slice(0, 10);
  const end = addDays(start, PERIOD_DAYS - 1);
  return {
    start,
    end,
    payday: addDays(end, 6),
    runPayrollBy: addDays(end, 4),
  };
}

export function formatPayPeriod(start: string, end: string): string {
  return `${start} — ${end}`;
}

export function getCurrentPayPeriod(): PayPeriod {
  return getPayPeriod(new Date());
}
