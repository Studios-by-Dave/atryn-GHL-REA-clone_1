import "server-only";
import { randomUUID } from "node:crypto";

export type SendResult = {
  provider: "resend" | "twilio" | "mock";
  providerMessageId: string | null;
};

/** Outbound is OFF unless explicitly enabled. Dev defaults to false. */
export function isOutboundEnabled(): boolean {
  return process.env.OUTBOUND_MESSAGING_ENABLED === "true";
}

/**
 * Sends an email via Resend, or logs `MOCK SEND` when the kill switch is off,
 * the provider is "mock", or credentials are missing.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
  const provider = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase();
  const canSend =
    isOutboundEnabled() &&
    provider === "resend" &&
    Boolean(process.env.RESEND_API_KEY) &&
    Boolean(process.env.EMAIL_FROM);

  if (!canSend) {
    console.debug(`[MOCK SEND] email to=${to} subject="${subject}"`, { body });
    return { provider: "mock", providerMessageId: `mock_email_${randomUUID()}` };
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
      text: body,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { id?: string };
  return { provider: "resend", providerMessageId: data.id ?? null };
}

/**
 * Sends an SMS via Twilio, or logs `MOCK SEND` when the kill switch is off,
 * the provider is "mock", or credentials are missing.
 */
export async function sendSms(to: string, body: string): Promise<SendResult> {
  const provider = (process.env.SMS_PROVIDER ?? "mock").toLowerCase();
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const canSend =
    isOutboundEnabled() && provider === "twilio" && Boolean(accountSid) && Boolean(authToken) && Boolean(from);

  if (!canSend || !accountSid || !authToken || !from) {
    console.debug(`[MOCK SEND] sms to=${to}`, { body });
    return { provider: "mock", providerMessageId: `mock_sms_${randomUUID()}` };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const form = new URLSearchParams({ To: to, From: from, Body: body });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );

  if (!response.ok) {
    throw new Error(`Twilio responded ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { sid?: string };
  return { provider: "twilio", providerMessageId: data.sid ?? null };
}
