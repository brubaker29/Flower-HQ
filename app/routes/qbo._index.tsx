import { Form, useActionData } from "react-router";
import type { Route } from "./+types/qbo._index";
import { requireAdmin } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { qboImportLog } from "~/db/schema";
import { getQboToken, buildMaps, postJournalEntry } from "~/lib/qbo.server";
import { parseIif, validateJe } from "~/lib/iif-parser";
import { Badge, Button, Field, Input, PageHeader } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  const db = getDb(context.cloudflare.env);
  const token = await getQboToken(db);
  return { connected: !!token };
}

interface PreviewEntry {
  docNumber: string;
  date: string;
  lineCount: number;
  totalDebits: string;
  totalCredits: string;
  valid: boolean;
  errors: string[];
  lines: { account: string; class: string; amount: number; type: string }[];
}

interface ImportResult {
  docNumber: string;
  status: string;
  qboId?: string;
  error?: string;
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const db = getDb(env);
  const form = await request.formData();
  const intent = String(form.get("intent") || "parse");

  const file = form.get("file");
  const rawContent = form.get("rawContent");
  const content =
    rawContent && typeof rawContent === "string"
      ? rawContent
      : file instanceof File && file.size > 0
        ? await file.text()
        : null;
  const filename =
    file instanceof File ? file.name : String(form.get("filename") || "file.iif");

  if (!content) return { error: "Select a .iif file" };

  const entries = parseIif(content);
  if (entries.length === 0) return { error: "No journal entries found in this file" };

  const preview: PreviewEntry[] = entries.map((je) => {
    const v = validateJe(je);
    return {
      docNumber: je.docNumber,
      date: je.date,
      lineCount: je.lines.length,
      totalDebits: (v.totalDebits / 100).toFixed(2),
      totalCredits: (v.totalCredits / 100).toFixed(2),
      valid: v.valid,
      errors: v.errors,
      lines: je.lines.map((l) => ({
        account: l.rtiAccount,
        class: l.rtiClass,
        amount: l.amount,
        type: l.amount > 0 ? "Debit" : "Credit",
      })),
    };
  });

  if (intent === "parse") {
    return { parsed: { filename, entries: preview, rawContent: content } };
  }

  if (intent === "import") {
    const { accountMap, classMap } = await buildMaps(db, env);
    const results: ImportResult[] = [];

    for (const je of entries) {
      const v = validateJe(je);
      if (!v.valid) {
        results.push({ docNumber: je.docNumber, status: "failed", error: v.errors.join("; ") });
        await db.insert(qboImportLog).values({
          filename, docNumber: je.docNumber, txnDate: je.date,
          lineCount: je.lines.length, totalDebits: v.totalDebits,
          status: "failed", errorDetail: v.errors.join("; "), importedBy: user.id,
        });
        continue;
      }

      const result = await postJournalEntry(db, env, je, accountMap, classMap);
      const status = result.success
        ? result.error === "already_exists" ? "skipped" : "posted"
        : "failed";

      results.push({
        docNumber: je.docNumber, status, qboId: result.qboId,
        error: result.error === "already_exists" ? undefined : result.error,
      });

      await db.insert(qboImportLog).values({
        filename, docNumber: je.docNumber, txnDate: je.date,
        lineCount: je.lines.length, totalDebits: v.totalDebits,
        status, qboJeId: result.qboId ?? null,
        errorDetail: result.error === "already_exists" ? null : (result.error ?? null),
        importedBy: user.id,
      });
    }

    return { imported: results };
  }

  return null;
}

export default function QboImport({ loaderData }: Route.ComponentProps) {
  const { connected } = loaderData;
  const actionData = useActionData<typeof action>();

  return (
    <div className="space-y-6">
      {!connected && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Not connected to QBO.{" "}
          <a href="/qbo/connect" className="underline">Connect first</a>.
        </div>
      )}

      {actionData?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {actionData.error}
        </div>
      )}

      {/* Step 1: Upload + parse */}
      {!actionData?.parsed && !actionData?.imported && (
        <UploadForm connected={connected} intent="parse" label="Parse & preview" />
      )}

      {/* Step 2: Preview with import button */}
      {actionData?.parsed && (
        <section className="space-y-4">
          <PageHeader
            title={`Preview: ${actionData.parsed.filename}`}
            subtitle={`${actionData.parsed.entries.length} journal entry`}
          />

          {actionData.parsed.entries.map((e) => (
            <div key={e.docNumber} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">RTI-{e.docNumber}</span>
                <span className="text-sm text-neutral-600">{e.date}</span>
                <span className="text-sm text-neutral-600">{e.lineCount} lines</span>
                <span className="text-sm font-medium">
                  ${e.totalDebits} debits / ${e.totalCredits} credits
                </span>
                <Badge tone={e.valid ? "green" : "red"}>
                  {e.valid ? "Valid" : "Errors"}
                </Badge>
              </div>
              {e.errors.length > 0 && (
                <ul className="mt-2 text-sm text-red-700">
                  {e.errors.map((err, i) => <li key={i}>• {err}</li>)}
                </ul>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-neutral-500">
                  Show {e.lineCount} lines
                </summary>
                <table className="mt-2 min-w-full text-xs">
                  <thead className="text-left text-neutral-500">
                    <tr>
                      <th className="pr-3">Account</th>
                      <th className="pr-3">Class</th>
                      <th className="pr-3">Type</th>
                      <th className="pr-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="pr-3">{l.account}</td>
                        <td className="pr-3">{l.class || "—"}</td>
                        <td className="pr-3">{l.type}</td>
                        <td className="pr-3 text-right">${Math.abs(l.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          ))}

          <div className="flex gap-3">
            <Form method="post">
              <input type="hidden" name="intent" value="import" />
              <input type="hidden" name="rawContent" value={actionData.parsed.rawContent} />
              <input type="hidden" name="filename" value={actionData.parsed.filename} />
              <Button type="submit" disabled={!connected}>
                Import to QuickBooks
              </Button>
            </Form>
            <a href="/qbo" className="self-center text-sm text-neutral-600 hover:underline">
              Cancel
            </a>
          </div>
        </section>
      )}

      {/* Step 3: Results */}
      {actionData?.imported && (
        <section className="space-y-4">
          <PageHeader title="Import results" />
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2">DocNumber</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">QBO ID</th>
                  <th className="px-4 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {actionData.imported.map((r) => (
                  <tr key={r.docNumber}>
                    <td className="px-4 py-2 font-medium">RTI-{r.docNumber}</td>
                    <td className="px-4 py-2">
                      <Badge tone={r.status === "posted" ? "green" : r.status === "skipped" ? "blue" : "red"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-neutral-700">{r.qboId ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-700 max-w-xs truncate">{r.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a href="/qbo" className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50">
            Import another
          </a>
        </section>
      )}
    </div>
  );
}

function UploadForm({ connected, intent, label }: { connected: boolean; intent: string; label: string }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Upload .iif file
      </h2>
      <Form method="post" encType="multipart/form-data" className="mt-4 space-y-4">
        <input type="hidden" name="intent" value={intent} />
        <Field label="RTI .iif file">
          <Input name="file" type="file" accept=".iif" required />
        </Field>
        <Button type="submit" disabled={!connected}>{label}</Button>
      </Form>
    </section>
  );
}
