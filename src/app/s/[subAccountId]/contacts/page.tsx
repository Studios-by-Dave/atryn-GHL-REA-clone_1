import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { hasPermission } from "@/server/rbac/permissions";
import { requireTenantContext } from "@/server/tenant/context";
import { getContactsList, getContactFilterOptions } from "@/features/contacts/queries";
import { parseContactListQuery } from "@/features/contacts/schemas";
import { ContactsTable } from "@/features/contacts/contacts-table";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ContactsPage({ params, searchParams }: PageProps) {
  const { subAccountId } = await params;
  if (!z.string().uuid().safeParse(subAccountId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "contacts.read");

  const sp = await searchParams;
  const query = parseContactListQuery(sp);
  const [{ items, total, page, pageCount }, options] = await Promise.all([
    getContactsList(subAccountId, query),
    getContactFilterOptions(subAccountId),
  ]);
  const canWrite = hasPermission(context.role, "contacts.write");

  function pageHref(targetPage: number): string {
    const search = new URLSearchParams();
    if (query.search) search.set("search", query.search);
    if (query.status !== "ACTIVE") search.set("status", query.status);
    if (query.source) search.set("source", query.source);
    if (query.ownerUserId) search.set("ownerUserId", query.ownerUserId);
    if (query.tagId) search.set("tagId", query.tagId);
    if (query.sort !== "newest") search.set("sort", query.sort);
    if (targetPage > 1) search.set("page", String(targetPage));
    const qs = search.toString();
    return `/s/${subAccountId}/contacts${qs ? `?${qs}` : ""}`;
  }

  const archived = first(sp.archived);
  const imported = first(sp.imported);
  const merged = first(sp.merged);
  const skipped = first(sp.skipped);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Contacts</h1>
          <p className="mt-1 text-sm text-slate-500">{total} total</p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Link
              href={`/s/${subAccountId}/contacts/new`}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              New contact
            </Link>
            <Link
              href={`/s/${subAccountId}/contacts/import`}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Import CSV
            </Link>
          </div>
        ) : null}
      </header>

      {archived ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Contact archived.</p>
      ) : null}
      {imported ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Imported {imported} contact{Number(imported) === 1 ? "" : "s"}
          {Number(merged) > 0 ? `, merged ${merged}` : ""}
          {Number(skipped) > 0 ? `, skipped ${skipped} invalid row${Number(skipped) === 1 ? "" : "s"}` : ""}.
        </p>
      ) : null}

      <form method="get" className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="search"
          name="search"
          defaultValue={query.search}
          placeholder="Search name, email, phone, company…"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={query.status}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="all">All</option>
        </select>
        <select
          name="ownerUserId"
          defaultValue={query.ownerUserId}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">Any owner</option>
          {options.owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name ?? owner.email}
            </option>
          ))}
        </select>
        <select
          name="tagId"
          defaultValue={query.tagId}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">Any tag</option>
          {options.tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <select
          name="source"
          defaultValue={query.source}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">Any source</option>
          {options.sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={query.sort}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="name">Name</option>
        </select>
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Apply
        </button>
      </form>

      <ContactsTable
        subAccountId={subAccountId}
        items={items}
        tags={options.tags}
        canWrite={canWrite}
      />

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between text-sm text-slate-600">
          {page > 1 ? (
            <a href={pageHref(page - 1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50">
              ← Previous
            </a>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <a href={pageHref(page + 1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50">
              Next →
            </a>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
