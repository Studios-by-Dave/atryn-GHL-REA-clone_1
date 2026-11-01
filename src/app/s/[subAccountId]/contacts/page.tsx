import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import { contactListQuerySchema } from "@/features/contacts/schemas";
import { getContactsList } from "@/features/contacts/queries";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContactsPage({ params, searchParams }: PageProps) {
  const { subAccountId } = await params;
  if (!z.string().uuid().safeParse(subAccountId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "contacts.read");

  const sp = await searchParams;
  const query = contactListQuerySchema.parse({
    search: typeof sp.search === "string" ? sp.search : undefined,
    status: typeof sp.status === "string" ? sp.status : undefined,
    source: typeof sp.source === "string" ? sp.source : undefined,
    ownerUserId: typeof sp.ownerUserId === "string" ? sp.ownerUserId : undefined,
    tagId: typeof sp.tagId === "string" ? sp.tagId : undefined,
    sort: typeof sp.sort === "string" ? sp.sort : undefined,
    page: typeof sp.page === "string" ? Number(sp.page) : undefined,
  });

  const { items, total, page, pageCount } = await getContactsList(subAccountId, query);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Contacts</h1>
        <p className="mt-1 text-sm text-slate-500">{total} total</p>
      </header>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {items.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <a href={`/s/${subAccountId}/contacts/${c.id}`} className="font-medium text-indigo-600">
              {c.firstName} {c.lastName}
            </a>
            <span className="ml-2 text-sm text-slate-500">{c.email}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-500">
        Page {page} of {pageCount}
      </p>
    </div>
  );
}