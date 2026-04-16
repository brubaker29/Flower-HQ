import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { DB } from "./db.server";
import { mileageReadings } from "~/db/schema";

export interface Reading {
  id: number;
  readOn: string;
  mileage: number;
  source: string;
  note: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30.4375;

function daysSince(fromIso: string, to: Date = new Date()): number {
  return (to.getTime() - new Date(fromIso).getTime()) / DAY_MS;
}

export async function listReadings(
  db: DB,
  assetId: number,
): Promise<Reading[]> {
  return db
    .select({
      id: mileageReadings.id,
      readOn: mileageReadings.readOn,
      mileage: mileageReadings.mileage,
      source: mileageReadings.source,
      note: mileageReadings.note,
    })
    .from(mileageReadings)
    .where(eq(mileageReadings.assetId, assetId))
    .orderBy(desc(mileageReadings.readOn), desc(mileageReadings.id));
}

/**
 * Average miles per month over the last `windowDays` days. Computed as
 * (latest_mileage − earliest_mileage_in_window) / months_elapsed.
 * Returns null when there aren't at least two readings in the window or
 * the elapsed time is too short for a meaningful rate.
 */
export async function avgMilesPerMonth(
  db: DB,
  assetId: number,
  windowDays: number,
  now: Date = new Date(),
): Promise<number | null> {
  const cutoff = new Date(now.getTime() - windowDays * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select()
    .from(mileageReadings)
    .where(
      and(
        eq(mileageReadings.assetId, assetId),
        gte(mileageReadings.readOn, cutoff),
      ),
    )
    .orderBy(asc(mileageReadings.readOn), asc(mileageReadings.id));

  if (rows.length < 2) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const days = daysSince(first.readOn, new Date(last.readOn));
  if (days < 1) return null;
  const months = days / DAYS_PER_MONTH;
  const delta = last.mileage - first.mileage;
  if (delta < 0) return null;
  return Math.round(delta / months);
}
