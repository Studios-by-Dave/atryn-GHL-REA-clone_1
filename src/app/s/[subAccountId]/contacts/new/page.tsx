import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import { getContactFilterOptions } from "@/features/contacts/queries";
import { ContactForm } from "@/features/contacts/contact-form";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string }>;
};

export default async function NewContactPage({ params }: PageProps) {
  const { subAccountId } = await params;
  if (!z.string().uuid().safeParse(subAccountId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "contacts.write");

  const { owners } = await getContactFilterOptions(subAccountId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">New contact</h1>
        <p className="mt-1 text-sm text-slate-500">
          If the email or phone matches an existing contact, the two are merged.
        </p>
      </header>
      <ContactForm subAccountId={subAccountId} owners={owners} />
    </div>
  );
}
