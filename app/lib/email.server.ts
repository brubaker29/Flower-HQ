/**
 * Minimal Resend wrapper. Free tier handles 3000 emails/month which is
 * way more than this internal tool will ever use. The user has to set
 * three Worker secrets to enable real email:
 *   RESEND_API_KEY  - from resend.com dashboard
 *   FROM_EMAIL      - "Flower HQ <login@yourdomain.com>" or
 *                     "onboarding@resend.dev" while testing
 *
 * If RESEND_API_KEY is missing we log the email to the Worker console
 * instead of sending — useful for first-deploy debugging.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(env: Env, msg: EmailMessage): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.FROM_EMAIL ?? "onboarding@resend.dev";

  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY not set — would have sent to ${msg.to}: ${msg.subject}\n${msg.text}`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend API error ${res.status}: ${detail}`);
  }
}
