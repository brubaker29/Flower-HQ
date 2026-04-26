/**
 * Elastic Email transactional email wrapper. The user already has an
 * Elastic Email account, so we use their v4 API.
 *
 * Required Worker secrets:
 *   ELASTIC_EMAIL_API_KEY — from elasticemail.com Settings → API
 *   FROM_EMAIL — verified sender, e.g. "login@yourdomain.com"
 *
 * If ELASTIC_EMAIL_API_KEY is missing we log to the Worker console
 * instead of sending — useful for first-deploy debugging.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(env: Env, msg: EmailMessage): Promise<void> {
  const apiKey = env.ELASTIC_EMAIL_API_KEY;
  const from = env.FROM_EMAIL ?? "noreply@example.com";

  if (!apiKey) {
    console.warn(
      `[email] ELASTIC_EMAIL_API_KEY not set — would have sent to ${msg.to}: ${msg.subject}\n${msg.text}`,
    );
    return;
  }

  const body: Record<string, unknown> = {
    Recipients: {
      To: [msg.to],
    },
    Content: {
      From: from,
      Subject: msg.subject,
      Body: [
        ...(msg.html
          ? [{ ContentType: "HTML", Charset: "utf-8", Content: msg.html }]
          : []),
        { ContentType: "PlainText", Charset: "utf-8", Content: msg.text },
      ],
    },
  };

  const res = await fetch(
    "https://api.elasticemail.com/v4/emails/transactional",
    {
      method: "POST",
      headers: {
        "X-ElasticEmail-ApiKey": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Elastic Email API error ${res.status}: ${detail}`);
  }
}
