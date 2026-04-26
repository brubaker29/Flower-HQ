import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/login.verify";
import { getDb } from "~/lib/db.server";
import { users } from "~/db/schema";
import { verifyPin } from "~/lib/pin.server";
import {
  commitSession,
  getSession,
} from "~/lib/session.server";
import { Button, Field, Input, PageHeader } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await getSession(request, context.cloudflare.env);
  if (session.get("userId")) return redirect("/");
  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? "";
  const next = url.searchParams.get("next") ?? "/";
  return { email, next };
}

const Schema = z.object({
  email: z.string().email(),
  pin: z.string().regex(/^\d{6}$/, "Enter the 6-digit PIN"),
  next: z.string().optional().nullable(),
});

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const form = await request.formData();
  const parsed = Schema.safeParse({
    email: String(form.get("email") || "").trim().toLowerCase(),
    pin: String(form.get("pin") || "").replace(/\s/g, ""),
    next: form.get("next") || "/",
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.pin?.[0] ?? "Invalid input" };
  }

  const db = getDb(env);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (!user || !user.isActive) {
    return { error: "Invalid PIN or expired. Try requesting a new one." };
  }

  const result = await verifyPin(db, user.id, parsed.data.pin);
  if (result === "rate_limited") {
    return { error: "Too many attempts. Wait 15 minutes, then request a new PIN." };
  }
  if (result === "invalid") {
    return { error: "Invalid PIN or expired. Try requesting a new one." };
  }

  const session = await getSession(request, env);
  session.set("userId", user.id);
  const cookie = await commitSession(env, session);

  const next = parsed.data.next ?? "/";
  return redirect(next.startsWith("/") ? next : "/", {
    headers: { "Set-Cookie": cookie },
  });
}

export default function VerifyPin({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { email, next } = loaderData;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <PageHeader
        title="Enter your PIN"
        subtitle={email ? `Sent to ${email}` : undefined}
      />
      <Form method="post" className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <Field label="6-digit PIN" error={actionData?.error}>
          <Input
            name="pin"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            required
            style={{
              fontSize: "1.5rem",
              letterSpacing: "0.4em",
              textAlign: "center",
            }}
          />
        </Field>
        <Button type="submit" className="w-full">
          Sign in
        </Button>
        <a
          href="/login"
          className="block text-center text-sm text-neutral-600 hover:underline"
        >
          Use a different email
        </a>
      </Form>
    </div>
  );
}
