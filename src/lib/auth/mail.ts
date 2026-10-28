export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_MAIL_FROM);
}
export async function sendAuthMail(
  to: string,
  subject: string,
  text: string,
  idempotencyKey: string,
) {
  if (!mailConfigured()) throw new Error("Email delivery is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from: process.env.AUTH_MAIL_FROM, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error("Email delivery failed");
}
