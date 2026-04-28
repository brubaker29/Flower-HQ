/**
 * RTI .iif file parser. Reads tab-delimited IIF format and returns
 * structured journal entry data ready for QBO mapping.
 */

export interface IifLine {
  rtiAccount: string;
  rtiClass: string;
  amount: number; // signed: positive=debit, negative=credit
  description: string;
}

export interface IifJournalEntry {
  date: string; // YYYY-MM-DD
  docNumber: string;
  memo: string;
  lines: IifLine[];
}

function parseDate(mmddyy: string): string {
  const parts = mmddyy.trim().split("/");
  if (parts.length !== 3) return mmddyy;
  const [mm, dd, yy] = parts;
  const year = Number(yy) < 50 ? `20${yy}` : `19${yy}`;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export function parseIif(content: string): IifJournalEntry[] {
  const lines = content.split(/\r?\n/);
  const results: IifJournalEntry[] = [];
  let splCols: string[] = [];
  let current: IifJournalEntry | null = null;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const cols = raw.split("\t");
    const tag = cols[0].trim();

    if (tag === "!SPL") {
      splCols = cols.slice(1).map((c) => c.trim());
    } else if (tag === "TRNS") {
      current = { date: "", docNumber: "", memo: "", lines: [] };
    } else if (tag === "SPL" && current) {
      const fields: Record<string, string> = {};
      for (let i = 0; i < splCols.length; i++) {
        fields[splCols[i]] = (cols[i + 1] ?? "").trim();
      }
      const amount = parseFloat(fields.AMOUNT || "0");
      if (fields.DATE) current.date = parseDate(fields.DATE);
      if (fields.DOCNUM) current.docNumber = fields.DOCNUM;
      if (fields.MEMO) current.memo = fields.MEMO;
      current.lines.push({
        rtiAccount: fields.ACCNT || "",
        rtiClass: fields.CLASS || "",
        amount,
        description: fields.MEMO || "",
      });
    } else if (tag === "ENDTRNS" && current) {
      results.push(current);
      current = null;
    }
  }

  return results;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  totalDebits: number;
  totalCredits: number;
}

export function validateJe(je: IifJournalEntry): ValidationResult {
  const errors: string[] = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (const line of je.lines) {
    if (line.amount > 0) totalDebits += line.amount;
    else totalCredits += Math.abs(line.amount);
    if (!line.rtiAccount) errors.push("Line missing account number");
  }

  const net = Math.round((totalDebits - totalCredits) * 100) / 100;
  if (Math.abs(net) > 0.01) {
    errors.push(
      `Unbalanced: debits $${totalDebits.toFixed(2)} vs credits $${totalCredits.toFixed(2)} (net $${net.toFixed(2)})`,
    );
  }

  if (!je.docNumber) errors.push("Missing DocNumber");
  if (!je.date) errors.push("Missing date");

  return {
    valid: errors.length === 0,
    errors,
    totalDebits: Math.round(totalDebits * 100),
    totalCredits: Math.round(totalCredits * 100),
  };
}
