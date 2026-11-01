import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import { ImportContactsForm } from "@/features/contacts/import-form";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string }>;
};

export default async function ContactImportPage({ params }: PageProps) {
  const { subAccountId } = await params;
  if (!z.string().uuid().safeParse(subAccountId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "contacts.write");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Import contacts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Paste CSV (headers: first name, last name, email, phone, company, source). Max 500 rows.
        </p>
      </header>
      <ImportContactsForm subAccountId={subAccountId} />
    </div>
  );
}