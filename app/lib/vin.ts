/**
 * VIN format helper. Vehicles from 1981+ have a 17-character VIN that
 * never uses the letters I, O, or Q (to avoid confusion with 1, 0, and
 * 0). Anything else is either a typo or not a modern VIN.
 *
 * Common OCR mistakes are the letter O where a zero belongs.
 */

const VIN_ALLOWED = /^[A-HJ-NPR-Z0-9]{17}$/;

export interface VinCheck {
  ok: boolean;
  normalized: string;
  error?: string;
}

export function validateVin(raw: string | null | undefined): VinCheck {
  if (raw == null) return { ok: true, normalized: "" };
  const normalized = raw.replace(/\s+/g, "").toUpperCase();
  if (normalized === "") return { ok: true, normalized: "" };

  if (normalized.length !== 17) {
    return {
      ok: false,
      normalized,
      error: `VIN must be exactly 17 characters (got ${normalized.length}).`,
    };
  }

  const badChars = new Set<string>();
  for (const c of normalized) {
    if (c === "I" || c === "O" || c === "Q") badChars.add(c);
    else if (!/[A-Z0-9]/.test(c)) badChars.add(c);
  }
  if (badChars.size > 0) {
    const chars = [...badChars].map((c) => `"${c}"`).join(", ");
    const hint =
      badChars.has("O") || badChars.has("I") || badChars.has("Q")
        ? ' Letters I, O, and Q aren\'t valid in a VIN — "O" is usually a typo for "0" (zero).'
        : "";
    return {
      ok: false,
      normalized,
      error: `VIN contains invalid character(s): ${chars}.${hint}`,
    };
  }

  if (!VIN_ALLOWED.test(normalized)) {
    return { ok: false, normalized, error: "VIN format is invalid." };
  }

  return { ok: true, normalized };
}
