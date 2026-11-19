import { NextResponse } from "next/server";
import { z } from "zod";
import { twilioInboundSchema } from "@/features/messaging/schemas";
import { ingestInboundSms } from "@/server/services/messaging";
import { verifyTwilioSignature } from "@/server/messaging/verify";

/**
 * Twilio inbound SMS webhook. The webhook URL must include the tenant it
 * belongs to: `/api/webhooks/twilio/inbound?subAccountId=<uuid>`.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const subAccountId = url.searchParams.get("subAccountId") ?? "";
  if (!z.uuid().safeParse(subAccountId).success) {
    return NextResponse.json({ ok: false, error: "missing_subaccount" }, { status: 400 });
  }

  const text = await request.text();
  const params = Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;

  if (!verifyTwilioSignature(request, params)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const parsed = twilioInboundSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    await ingestInboundSms({
      subAccountId,
      from: parsed.data.From,
      body: parsed.data.Body,
      messageSid: parsed.data.MessageSid,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[twilio inbound] failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
