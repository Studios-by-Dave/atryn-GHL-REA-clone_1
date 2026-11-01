import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import { getContactDetail } from "@/features/contacts/queries";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string; contactId: string }>;
};

export default async function ContactDetailPage({ params }: PageProps) {
  const { subAccountId, contactId } = await params;
  if (!z.string().uuid().safeParse(subAccountId).success) notFound();
  if (!z.string().uuid().safeParse(contactId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "contacts.read");

  const contact = await getContactDetail(subAccountId, contactId);
  if (!contact) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          {contact.firstName} {contact.lastName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{contact.email ?? contact.phone ?? "No contact info"}</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-950">Details</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Company</dt>
            <dd className="text-sm text-slate-800">{contact.company ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Source</dt>
            <dd className="text-sm text-slate-800">{contact.source ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Owner</dt>
            <dd className="text-sm text-slate-800">{contact.owner?.name ?? "Unassigned"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status</dt>
            <dd className="text-sm text-slate-800">{contact.status}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-950">Tags</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {contact.tags.length === 0 ? (
            <span className="text-sm text-slate-500">No tags</span>
          ) : (
            contact.tags.map(({ tag }) => (
              <span
                key={tag.id}
                className="rounded-full px-3 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: tag.color ?? "#6366f1" }}
              >
                {tag.name}
              </span>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-950">Notes</h2>
        <ul className="mt-3 space-y-3">
          {contact.notes.length === 0 ? (
            <li className="text-sm text-slate-500">No notes yet.</li>
          ) : (
            contact.notes.map((note) => (
              <li key={note.id} className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm text-slate-800">{note.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {note.author?.name ?? "Unknown"} · {new Date(note.createdAt).toLocaleString()}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-950">Activity</h2>
        <p className="mt-2 text-sm text-slate-500">
          Opportunities: {contact._count.opportunities} · Messages: {contact._count.messages} · Appointments:{" "}
          {contact._count.appointments} · Tasks: {contact._count.tasks} · Forms: {contact._count.forms}
        </p>
      </section>
    </div>
  );
}