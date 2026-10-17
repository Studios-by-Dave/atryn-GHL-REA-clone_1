import "server-only";

type AuthEmail = {
  to: string;
  subject: string;
  url: string;
};

export function assertAuthEmailConfigured(): void {
  if (process.env.NODE_ENV === "development" && process.env.MAGIC_LINK_DEV_BYPASS === "true") {
    return;
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required to send authentication email.");
  }
}

export async function sendAuthEmail({ to, subject, url }: AuthEmail): Promise<void> {
  assertAuthEmailConfigured();

  if (process.env.NODE_ENV === "development" && process.env.MAGIC_LINK_DEV_BYPASS === "true") {
    console.info(`[auth email dev bypass] ${subject} to ${to}: ${url}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text: `${subject}\n\n${url}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Authentication email delivery failed with status ${response.status}.`);
  }
}
