import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestResendEvent } from "@/server/services/messaging";

const resendEventSchema = z.object({
  type: z.string().min(1),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().optional(),
  }),
});

/**
 * Resend delivery/status webhook. Idempotency uses the Svix message id header
 * when present, falling back to type + email id + created_at.
 *
 * NOTE: Svix signature verification is not yet enforced — see Phase 6
 * follow-ups. Keep the endpoint behind network allow-listing until then.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = resendEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const emailId = parsed.data.data.email_id;
  if (!emailId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const eventId =
    request.headers.get("svix-id") ??
    `${parsed.data.type}:${emailId}:${parsed.data.created_at ?? ""}`;

  try {
    await ingestResendEvent({ id: eventId, type: parsed.data.type, emailId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[resend webhook] failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
