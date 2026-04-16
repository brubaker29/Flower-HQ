import { desc, eq } from "drizzle-orm";
import type { DB } from "./db.server";
import { assets, maintenanceRecords } from "~/db/schema";

/**
 * Shared "due soon" logic. Kept as pure functions where possible so
 * the thresholds are obvious and unit-testable.
 */

export const DUE_WARN_DAYS = 14;
export const DUE_WARN_MILES = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DueItem {
  kind: "asset_service";
  assetId: number;
  assetName: string;
  label: string;
  reason: string;
  overdue: boolean;
  daysUntil: number | null;
  milesUntil: number | null;
}

function daysBetween(fromIso: string, nowIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(nowIso);
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * For every asset, find its most recent maintenance record and check
 * whether its `next_due_date` or `next_due_mileage` is within the
 * warning window. Returns items sorted overdue-first, then soonest.
 */
export async function getDueSoonAssets(
  db: DB,
  now: Date = new Date(),
): Promise<DueItem[]> {
  const activeAssets = await db
    .select()
    .from(assets)
    .where(eq(assets.status, "active"));

  const items: DueItem[] = [];
  const nowIso = now.toISOString();

  for (const asset of activeAssets) {
    const latest = await db
      .select()
      .from(maintenanceRecords)
      .where(eq(maintenanceRecords.assetId, asset.id))
      .orderBy(desc(maintenanceRecords.performedAt))
      .limit(1);

    if (latest.length === 0) continue;
    const rec = latest[0];

    let daysUntil: number | null = null;
    let overdue = false;
    let dateTriggered = false;
    if (rec.nextDueDate) {
      const days = daysBetween(nowIso, rec.nextDueDate);
      daysUntil = days;
      if (days <= DUE_WARN_DAYS) dateTriggered = true;
      if (days < 0) overdue = true;
    }

    let milesUntil: number | null = null;
    let mileageTriggered = false;
    if (rec.nextDueMileage != null && asset.currentMileage != null) {
      milesUntil = rec.nextDueMileage - asset.currentMileage;
      if (milesUntil <= DUE_WARN_MILES) mileageTriggered = true;
      if (milesUntil < 0) overdue = true;
    }

    if (!dateTriggered && !mileageTriggered) continue;

    const reasons: string[] = [];
    if (dateTriggered && daysUntil != null) {
      reasons.push(
        daysUntil < 0
          ? `overdue by ${Math.abs(daysUntil)}d`
          : daysUntil === 0
            ? "due today"
            : `in ${daysUntil}d`,
      );
    }
    if (mileageTriggered && milesUntil != null) {
      reasons.push(
        milesUntil < 0
          ? `${Math.abs(milesUntil)} mi over`
          : `${milesUntil} mi left`,
      );
    }

    items.push({
      kind: "asset_service",
      assetId: asset.id,
      assetName: asset.name,
      label: rec.category ?? "Service",
      reason: reasons.join(" · "),
      overdue,
      daysUntil,
      milesUntil,
    });
  }

  return items.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const ad = a.daysUntil ?? Number.POSITIVE_INFINITY;
    const bd = b.daysUntil ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}
