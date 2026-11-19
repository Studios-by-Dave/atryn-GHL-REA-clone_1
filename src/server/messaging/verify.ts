import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the X-Twilio-Signature header (HMAC-SHA1 of the full URL plus the
 * sorted POST params, keyed by the auth token). Only enforced when
 * TWILIO_VALIDATE_SIGNATURE === "true"; dev/mock deployments can skip it.
 */
export function verifyTwilioSignature(
  request: Request,
  params: Record<string, string>,
): boolean {
  if (process.env.TWILIO_VALIDATE_SIGNATURE !== "true") {
    return true;
  }
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("x-twilio-signature");
  if (!token || !signature) {
    return false;
  }

  const requestUrl = new URL(request.url);
  const base = process.env.APP_URL?.replace(/\/$/, "");
  const callbackUrl = base
    ? `${base}${requestUrl.pathname}${requestUrl.search}`
    : request.url;

  const signedPayload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], callbackUrl);

  const expected = createHmac("sha1", token).update(signedPayload).digest("base64");
  return safeEqual(expected, signature);
}
