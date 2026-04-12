/**
 * Minimal R2 helpers. All uploads go through the Worker so we can enforce
 * auth, record metadata, and generate stable keys.
 */

export interface UploadInput {
  file: File;
  subjectType: string;
  subjectId: number;
}

export function buildR2Key(input: UploadInput): string {
  const safeName = input.file.name.replace(/[^\w.\-]+/g, "_");
  const ts = Date.now();
  return `${input.subjectType}/${input.subjectId}/${ts}-${safeName}`;
}

export async function putFile(env: Env, key: string, file: File): Promise<void> {
  await env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
}

export async function streamFile(env: Env, key: string): Promise<Response> {
  const obj = await env.FILES.get(key);
  if (!obj) {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "private, max-age=300");
  return new Response(obj.body, { headers });
}
