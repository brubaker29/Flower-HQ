/**
 * QBO API client for Cloudflare Workers. Handles OAuth token refresh
 * and journal entry operations.
 */

import { eq } from "drizzle-orm";
import { qboTokens } from "~/db/schema";
import type { DB } from "./db.server";
import type { IifJournalEntry } from "./iif-parser";

const QBO_BASE = "https://quickbooks.api.intuit.com";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const DOC_PREFIX = "RTI-";
const CLASSES_WITHOUT_REF = ["555", "777"];

interface QboToken {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}

export async function getQboToken(db: DB): Promise<QboToken | null> {
  const rows = await db.select().from(qboTokens).limit(1);
  if (rows.length === 0) return null;
  return {
    realmId: rows[0].realmId,
    accessToken: rows[0].accessToken,
    refreshToken: rows[0].refreshToken,
    accessTokenExpiresAt: rows[0].accessTokenExpiresAt,
  };
}

export async function refreshAccessToken(
  db: DB,
  env: Env,
): Promise<QboToken | null> {
  const current = await getQboToken(db);
  if (!current) return null;

  const clientId = env.QBO_CLIENT_ID;
  const clientSecret = env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("QBO_CLIENT_ID / QBO_CLIENT_SECRET not configured");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`QBO token refresh failed ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };

  const now = new Date();
  const accessExpires = new Date(
    now.getTime() + data.expires_in * 1000,
  ).toISOString();
  const refreshExpires = new Date(
    now.getTime() + data.x_refresh_token_expires_in * 1000,
  ).toISOString();

  await db
    .update(qboTokens)
    .set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: accessExpires,
      refreshTokenExpiresAt: refreshExpires,
      updatedAt: now.toISOString(),
    })
    .where(eq(qboTokens.realmId, current.realmId));

  return {
    ...current,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: accessExpires,
  };
}

async function getValidToken(
  db: DB,
  env: Env,
): Promise<{ token: string; realmId: string }> {
  let t = await getQboToken(db);
  if (!t) throw new Error("QBO not connected. Use the Connect button first.");

  const now = new Date().toISOString();
  if (t.accessTokenExpiresAt < now) {
    t = await refreshAccessToken(db, env);
    if (!t) throw new Error("Failed to refresh QBO token");
  }

  return { token: t.accessToken, realmId: t.realmId };
}

async function qboFetch(
  db: DB,
  env: Env,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { token, realmId } = await getValidToken(db, env);
  const url = `${QBO_BASE}/v3/company/${realmId}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    await refreshAccessToken(db, env);
    const refreshed = await getValidToken(db, env);
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${refreshed.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }

  return res;
}

interface QboAccount {
  Id: string;
  Name: string;
  AcctNum?: string;
}

interface QboClass {
  Id: string;
  Name: string;
}

export async function fetchAccounts(
  db: DB,
  env: Env,
): Promise<QboAccount[]> {
  const res = await qboFetch(
    db,
    env,
    "/query?query=" +
      encodeURIComponent(
        "select Id, Name, AcctNum from Account MAXRESULTS 1000",
      ),
  );
  if (!res.ok) throw new Error(`QBO accounts query failed: ${res.status}`);
  const data = (await res.json()) as {
    QueryResponse: { Account?: QboAccount[] };
  };
  return data.QueryResponse.Account ?? [];
}

export async function fetchClasses(
  db: DB,
  env: Env,
): Promise<QboClass[]> {
  const res = await qboFetch(
    db,
    env,
    "/query?query=" +
      encodeURIComponent("select Id, Name from Class MAXRESULTS 200"),
  );
  if (!res.ok) throw new Error(`QBO classes query failed: ${res.status}`);
  const data = (await res.json()) as {
    QueryResponse: { Class?: QboClass[] };
  };
  return data.QueryResponse.Class ?? [];
}

export async function checkExistingJe(
  db: DB,
  env: Env,
  docNumber: string,
): Promise<string | null> {
  const prefixed = `${DOC_PREFIX}${docNumber}`;
  const res = await qboFetch(
    db,
    env,
    "/query?query=" +
      encodeURIComponent(
        `select Id from JournalEntry where DocNumber = '${prefixed}'`,
      ),
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    QueryResponse: { JournalEntry?: { Id: string }[] };
  };
  return data.QueryResponse.JournalEntry?.[0]?.Id ?? null;
}

export interface PostJeResult {
  success: boolean;
  qboId?: string;
  error?: string;
}

export async function postJournalEntry(
  db: DB,
  env: Env,
  je: IifJournalEntry,
  accountMap: Map<string, string>,
  classMap: Map<string, string>,
): Promise<PostJeResult> {
  const prefixedDoc = `${DOC_PREFIX}${je.docNumber}`;

  const existingId = await checkExistingJe(db, env, je.docNumber);
  if (existingId) {
    return { success: true, qboId: existingId, error: "already_exists" };
  }

  const jeLines: unknown[] = [];
  const unmappedAccounts: string[] = [];
  const unmappedClasses: string[] = [];

  for (const line of je.lines) {
    const qboAccountId = accountMap.get(line.rtiAccount);
    if (!qboAccountId) {
      unmappedAccounts.push(line.rtiAccount);
      continue;
    }

    const amt = Math.abs(line.amount);
    const posting = line.amount > 0 ? "Debit" : "Credit";

    const detail: Record<string, unknown> = {
      PostingType: posting,
      AccountRef: { value: qboAccountId },
    };

    if (
      line.rtiClass &&
      !CLASSES_WITHOUT_REF.includes(line.rtiClass)
    ) {
      const qboClassId = classMap.get(line.rtiClass);
      if (qboClassId) {
        detail.ClassRef = { value: qboClassId };
      } else {
        unmappedClasses.push(line.rtiClass);
      }
    }

    jeLines.push({
      Description: line.description,
      Amount: Math.round(amt * 100) / 100,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: detail,
    });
  }

  if (unmappedAccounts.length > 0) {
    return {
      success: false,
      error: `Unmapped accounts: ${[...new Set(unmappedAccounts)].join(", ")}`,
    };
  }
  if (unmappedClasses.length > 0) {
    return {
      success: false,
      error: `Unmapped classes: ${[...new Set(unmappedClasses)].join(", ")}`,
    };
  }

  const body = {
    TxnDate: je.date,
    DocNumber: prefixedDoc,
    PrivateNote: `RTI auto-import ${je.docNumber} (${je.memo})`,
    Line: jeLines,
  };

  const res = await qboFetch(db, env, "/journalentry?minorversion=75", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { success: false, error: `QBO ${res.status}: ${errBody}` };
  }

  const data = (await res.json()) as {
    JournalEntry: { Id: string };
  };
  return { success: true, qboId: data.JournalEntry.Id };
}

export async function buildMaps(
  db: DB,
  env: Env,
): Promise<{
  accountMap: Map<string, string>;
  classMap: Map<string, string>;
}> {
  const [accounts, classes] = await Promise.all([
    fetchAccounts(db, env),
    fetchClasses(db, env),
  ]);

  const accountMap = new Map<string, string>();
  for (const a of accounts) {
    if (a.AcctNum) accountMap.set(a.AcctNum, a.Id);
  }

  const classMap = new Map<string, string>();
  for (const c of classes) {
    classMap.set(c.Name, c.Id);
  }
  // Also map by number if class names are numeric (103, 116, 215)
  for (const c of classes) {
    if (/^\d+$/.test(c.Name)) classMap.set(c.Name, c.Id);
  }

  return { accountMap, classMap };
}
