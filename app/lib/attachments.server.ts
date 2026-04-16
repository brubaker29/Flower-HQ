import { and, desc, eq } from "drizzle-orm";
import { attachments } from "~/db/schema";
import { getDb, type DB } from "./db.server";
import { putFile, buildR2Key } from "./r2.server";

export type SubjectType =
  | "asset"
  | "maintenance_record"
  | "work_order"
  | "facility_asset";

/**
 * Upload a file to R2 and record it in the attachments table. Returns
 * the attachment row. Caller should ignore zero-size files (empty
 * "no file selected" uploads) before calling this.
 */
export async function saveAttachment(
  env: Env,
  db: DB,
  args: {
    file: File;
    subjectType: SubjectType;
    subjectId: number;
    uploadedBy: number | null;
  },
) {
  const key = buildR2Key({
    file: args.file,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
  });
  await putFile(env, key, args.file);
  const [row] = await db
    .insert(attachments)
    .values({
      r2Key: key,
      filename: args.file.name,
      mime: args.file.type || "application/octet-stream",
      size: args.file.size,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      uploadedBy: args.uploadedBy,
    })
    .returning();
  return row;
}

export async function listAttachments(
  env: Env,
  subjectType: SubjectType,
  subjectId: number,
) {
  const db = getDb(env);
  return db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.subjectType, subjectType),
        eq(attachments.subjectId, subjectId),
      ),
    )
    .orderBy(desc(attachments.createdAt));
}
