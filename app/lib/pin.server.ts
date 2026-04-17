import { and, desc, eq, isNull } from "drizzle-orm";
import { loginPins } from "~/db/schema";
import type { DB } from "./db.server";

const PIN_TTL_MINUTES = 10;

/** 6-digit PIN as a zero-padded string. */
export function generatePin(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const n =
    ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
  return (n % 1_000_000).toString().padStart(6, "0");
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a fresh PIN for the user, store its hash, and return the raw
 * PIN so the caller can email it. Any prior unused PINs for this user
 * are invalidated by setting their used_at to now (so a request for a
 * new PIN supersedes an older still-valid one).
 */
export async function createPin(
  db: DB,
  userId: number,
): Promise<string> {
  const nowIso = new Date().toISOString();
  await db
    .update(loginPins)
    .set({ usedAt: nowIso })
    .where(and(eq(loginPins.userId, userId), isNull(loginPins.usedAt)));

  const pin = generatePin();
  const hash = await hashPin(pin);
  const expiresAt = new Date(
    Date.now() + PIN_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  await db.insert(loginPins).values({
    userId,
    pinHash: hash,
    expiresAt,
  });

  return pin;
}

/**
 * Verify a PIN against the user's most recent unused, unexpired PIN.
 * On success marks the PIN used and returns true. Constant-time-ish
 * (we always hash the candidate even when no PIN exists).
 */
export async function verifyPin(
  db: DB,
  userId: number,
  pin: string,
): Promise<boolean> {
  const candidate = await hashPin(pin);
  const nowIso = new Date().toISOString();

  const rows = await db
    .select()
    .from(loginPins)
    .where(and(eq(loginPins.userId, userId), isNull(loginPins.usedAt)))
    .orderBy(desc(loginPins.createdAt))
    .limit(1);

  if (rows.length === 0) return false;
  const row = rows[0];
  if (row.expiresAt < nowIso) return false;
  if (row.pinHash !== candidate) return false;

  await db
    .update(loginPins)
    .set({ usedAt: nowIso })
    .where(eq(loginPins.id, row.id));

  return true;
}
