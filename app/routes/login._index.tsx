import { Form, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/login._index";
import { getDb } from "~/lib/db.server";
import { users } from "~/db/schema";
import { createPin } from "~/lib/pin.server";
import { sendEmail } from "~/lib/email.server";
import { Button, Field, Input, PageHeader } from "~/components/ui";
import { getSession } from "~/lib/session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await getSession(request, context.cloudflare.env);
  if (session.get("userId")) return redirect("/");
  return null;
}

const Schema = z.object({
  email: z.string().email("Enter a valid email"),
});

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const form = await request.formData();
  const parsed = Schema.safeParse({
    email: String(form.get("email") || "").trim().toLowerCase(),
  });
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors.email?.[0] };

  const db = getDb(env);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  // Whether or not the email is registered, we redirect to the verify
  // step. This avoids leaking which emails are valid users.
  if (user && user.isActive) {
    const pin = await createPin(db, user.id);
    try {
      await sendEmail(env, {
        to: parsed.data.email,
        subject: "Your Flower HQ login PIN",
        text: `Your PIN is ${pin}\n\nIt expires in 10 minutes. If you didn't ask for this, ignore this email.`,
        html: `<p>Your PIN is <strong style="font-size:1.5rem;letter-spacing:.2em">${pin}</strong></p><p>It expires in 10 minutes. If you didn't ask for this, ignore this email.</p>`,
      });
    } catch (err) {
      console.error("[login] sendEmail failed", err);
    }
  }

  const url = new URL(request.url);
  return redirect(`/login/verify?email=${encodeURIComponent(parsed.data.email)}${url.searchParams.get("next") ? `&next=${encodeURIComponent(url.searchParams.get("next")!)}` : ""}`);
}

export default function Login({ actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <PageHeader title="Sign in" subtitle="We'll email you a 6-digit PIN." />
      <Form method="post" className="space-y-4">
        <Field label="Email" error={actionData?.error}>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
          />
        </Field>
        <Button type="submit" className="w-full">
          Send PIN
        </Button>
      </Form>
    </div>
  );
}
