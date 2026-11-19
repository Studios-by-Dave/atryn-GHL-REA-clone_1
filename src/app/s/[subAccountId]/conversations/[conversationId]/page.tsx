import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import { getConversationDetail } from "@/features/messaging/queries";
import { markRead } from "@/server/services/messaging";
import { MessageCompose } from "@/features/messaging/message-compose";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string; conversationId: string }>;
};

const statusLabel: Record<string, string> = {
  QUEUED: "Queued",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  READ: "Read",
};

export default async function ConversationDetailPage({ params }: PageProps) {
  const { subAccountId, conversationId } = await params;
  if (!z.uuid().safeParse(subAccountId).success) notFound();
  if (!z.uuid().safeParse(conversationId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "messaging.read");

  const conversation = await getConversationDetail(subAccountId, conversationId);
  if (!conversation) notFound();

  await markRead(context, conversationId);

  const name =
    [conversation.contact.firstName, conversation.contact.lastName].filter(Boolean).join(" ").trim() ||
    conversation.contact.email ||
    conversation.contact.phone ||
    "Unknown contact";

  const optOuts: string[] = [];
  if (conversation.contact.smsOptOutAt) optOuts.push("SMS");
  if (conversation.contact.emailOptOutAt) optOuts.push("email");

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/s/${subAccountId}/conversations`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← All conversations
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {conversation.contact.email ?? conversation.contact.phone ?? "No contact info"}
            </p>
          </div>
          <Link
            href={`/s/${subAccountId}/contacts/${conversation.contact.id}`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View contact
          </Link>
        </div>
        {optOuts.length > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            This contact has opted out of {optOuts.join(" and ")}. Sends on that channel will be blocked.
          </p>
        ) : null}
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        {conversation.messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No messages yet.</p>
        ) : (
          <ol className="space-y-3">
            {conversation.messages.map((message) => {
              const outbound = message.direction === "OUTBOUND";
              return (
                <li key={message.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm ${
                      outbound ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {message.subject ? (
                      <p className="mb-1 text-xs font-semibold opacity-80">{message.subject}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p className={`mt-1 text-[11px] ${outbound ? "text-indigo-100" : "text-slate-500"}`}>
                      {message.channel} · {statusLabel[message.status] ?? message.status}
                      {message.error ? ` (${message.error})` : ""} ·{" "}
                      {new Date(message.createdAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <MessageCompose
        subAccountId={subAccountId}
        contactId={conversation.contact.id}
        conversationId={conversation.id}
      />
    </div>
  );
}
