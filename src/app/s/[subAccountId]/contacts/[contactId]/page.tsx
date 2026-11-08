import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { hasPermission } from "@/server/rbac/permissions";
import { requireTenantContext } from "@/server/tenant/context";
import { getContactDetail, getContactFilterOptions } from "@/features/contacts/queries";
import { ContactForm } from "@/features/contacts/contact-form";
import {
  addNoteAction,
  applyTagAction,
  archiveContactAction,
  restoreContactAction,
} from "@/features/contacts/actions";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string; contactId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const inputClass = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

export default async function ContactDetailPage({ params, searchParams }: PageProps) {
  const { subAccountId, contactId } = await params;
  if (!z.string().uuid().safeParse(subAccountId).success) notFound();
  if (!z.string().uuid().safeParse(contactId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "contacts.read");

  const contact = await getContactDetail(subAccountId, contactId);
  if (!contact) notFound();
  const [{ owners }, sp] = await Promise.all([getContactFilterOptions(subAccountId), searchParams]);
  const canWrite = hasPermission(context.role, "contacts.write");
  const saved = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;
  const custom = contact.customValues;

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/s/${subAccountId}/contacts`} className="text-sm text-slate-500 hover:text-slate-800">
          ← All contacts
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {contact.firstName} {contact.lastName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {contact.email ?? contact.phone ?? "No contact info"}
              {contact.status === "ARCHIVED" ? " · Archived" : ""}
            </p>
          </div>
          {canWrite ? (
            contact.status === "ARCHIVED" ? (
              <form action={restoreContactAction}>
                <input type="hidden" name="subAccountId" value={subAccountId} />
                <input type="hidden" name="contactId" value={contact.id} />
                <button
                  type="submit"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Restore contact
                </button>
              </form>
            ) : (
              <form action={archiveContactAction}>
                <input type="hidden" name="subAccountId" value={subAccountId} />
                <input type="hidden" name="contactId" value={contact.id} />
                <button
                  type="submit"
                  className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Archive contact
                </button>
              </form>
            )
          ) : null}
        </div>
        {saved ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Contact saved.</p>
        ) : null}
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
            <dd className="text-sm text-slate-800">{contact.owner?.name ?? contact.owner?.email ?? "Unassigned"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status</dt>
            <dd className="text-sm text-slate-800">{contact.status}</dd>
          </div>
          {custom.map((entry) => (
            <div key={entry.id}>
              <dt className="text-xs text-slate-500">{entry.customField.name}</dt>
              <dd className="text-sm text-slate-800">
                {String(
                  Array.isArray(entry.value) ? entry.value.join(", ") : entry.value ?? "—",
                )}
              </dd>
            </div>
          ))}
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
        {canWrite ? (
          <form action={applyTagAction} className="mt-4 flex flex-wrap gap-2">
            <input type="hidden" name="subAccountId" value={subAccountId} />
            <input type="hidden" name="contactId" value={contact.id} />
            <input name="name" required placeholder="Add a tag…" className={inputClass} />
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Apply tag
            </button>
          </form>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-950">Notes</h2>
        <form action={addNoteAction} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="subAccountId" value={subAccountId} />
          <input type="hidden" name="contactId" value={contact.id} />
          <input name="body" required placeholder="Write a note…" className={`flex-1 ${inputClass}`} />
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Add note
          </button>
        </form>
        <ul className="mt-4 space-y-3">
          {contact.notes.length === 0 ? (
            <li className="text-sm text-slate-500">No notes yet.</li>
          ) : (
            contact.notes.map((note) => (
              <li key={note.id} className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm text-slate-800">{note.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {note.author?.name ?? note.author?.email ?? "Unknown"} ·{" "}
                  {new Date(note.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>

      {canWrite ? (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-950">Edit contact</h2>
          <ContactForm
            subAccountId={subAccountId}
            contactId={contact.id}
            owners={owners}
            defaults={{
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email ?? "",
              phone: contact.phone ?? "",
              company: contact.company ?? "",
              source: contact.source ?? "",
              ownerUserId: contact.ownerUserId ?? "",
            }}
          />
        </section>
      ) : null}

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
