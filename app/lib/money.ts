/**
 * Money helpers. Everything in the DB is integer cents — this module is
 * the only place that talks about dollars.
 */

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export function inputToCents(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === "") return null;
  const n = Number(s.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
