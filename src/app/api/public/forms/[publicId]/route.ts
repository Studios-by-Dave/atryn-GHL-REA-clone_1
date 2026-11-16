import { NextResponse } from "next/server";
import { getPublishedForm } from "@/server/services/forms";
import { prisma } from "@/server/db/client";
import { createOrMergeContact } from "@/server/services/contacts";
import { insertFormSubmission } from "@/server/repositories/forms";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  const form = await getPublishedForm(publicId);
  if (!form || form.status !== "ACTIVE") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  if (body?.honeypot) {
    return NextResponse.json({ ok: true });
  }

  const subAccount = await prisma.subAccount.findUnique({ where: { id: form.subAccountId } });
  if (!subAccount) return NextResponse.json({ ok: false }, { status: 404 });

  const ctx = {
    orgId: subAccount.orgId,
    subAccountId: form.subAccountId,
    userId: form.notifyUserIds[0] ?? subAccount.id,
    role: "ADMIN" as const,
  };

  const data = body ?? {};
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipHash = ip
    ? (await import("node:crypto")).createHash("sha256").update(ip + (process.env.IP_HASH_SALT ?? "atryn")).digest("hex")
    : null;

  const contactInput = {
    firstName: String(data.firstName ?? data.first_name ?? "Lead"),
    lastName: String(data.lastName ?? data.last_name ?? ""),
    email: data.email ? String(data.email) : null,
    phone: data.phone ? String(data.phone) : null,
    company: data.company ? String(data.company) : null,
    source: `form:${form.publicId}`,
  };

  let contactId: string | null = null;
  try {
    const { contact } = await createOrMergeContact(ctx, contactInput as any);
    contactId = contact.id;
    // apply autoTags
    if (form.autoTags?.length && contactId) {
      const { createTag, tagContacts } = await import("@/server/services/contacts");
      for (const tagName of form.autoTags) {
        try {
          const tag = await createTag(ctx, tagName);
          await tagContacts(ctx, tag.id, [contactId]);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    contactId = null;
  }

  await insertFormSubmission(ctx, {
    formId: form.id,
    contactId,
    data: data as any,
    honeypotTriggered: false,
    ipHash,
    userAgent: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
    utmSource: data.utmSource ?? null,
    utmMedium: data.utmMedium ?? null,
    utmCampaign: data.utmCampaign ?? null,
    utmContent: data.utmContent ?? null,
    utmTerm: data.utmTerm ?? null,
  });

  return NextResponse.json({ ok: true });
}
