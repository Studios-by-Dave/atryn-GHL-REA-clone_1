import { NextResponse } from "next/server";
import { twilioStatusSchema } from "@/features/messaging/schemas";
import { ingestTwilioStatus } from "@/server/services/messaging";
import { verifyTwilioSignature } from "@/server/messaging/verify";

/** Twilio delivery status callback. */
export async function POST(request: Request) {
  const text = await request.text();
  const params = Object.fromEntries(new URLSearchParams(text)) as Record<string, string>;

  if (!verifyTwilioSignature(request, params)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const parsed = twilioStatusSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    await ingestTwilioStatus({
      messageSid: parsed.data.MessageSid,
      status: parsed.data.MessageStatus,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[twilio status] failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
