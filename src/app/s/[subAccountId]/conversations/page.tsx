import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/rbac/guards";
import { requireTenantContext } from "@/server/tenant/context";
import { getConversations } from "@/features/messaging/queries";
import { conversationListQuerySchema } from "@/features/messaging/schemas";

export const instant = false;

type PageProps = {
  params: Promise<{ subAccountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConversationsPage({ params, searchParams }: PageProps) {
  const { subAccountId } = await params;
  if (!z.uuid().safeParse(subAccountId).success) notFound();
  const context = await requireTenantContext(subAccountId);
  requirePermission(context, "messaging.read");

  const sp = await searchParams;
  const parsedQuery = conversationListQuerySchema.safeParse({
    status: typeof sp.status === "string" ? sp.status : undefined,
    search: typeof sp.search === "string" ? sp.search : undefined,
  });
  const query = parsedQuery.success
    ? parsedQuery.data
    : conversationListQuerySchema.parse({});

  const conversations = await getConversations(subAccountId, query);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Conversations</h1>
        <p className="mt-1 text-sm text-slate-500">
          {conversations.length} conversation{conversations.length === 1 ? "" : "s"} · email and SMS in one inbox
        </p>
      </header>

      <form className="flex flex-wrap gap-2">
        <input
          name="search"
          defaultValue={query.search}
          placeholder="Search contacts…"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={query.status}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="OPEN">Open</option>
          <option value="ARCHIVED">Archived</option>
          <option value="all">All</option>
        </select>
        <button
          type="submit"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Filter
        </button>
      </form>

      {conversations.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No conversations yet. Messages sent from a contact&apos;s page or received by webhook will appear here.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {conversations.map((conversation) => {
            const last = conversation.messages[0];
            const name =
              [conversation.contact.firstName, conversation.contact.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              conversation.contact.email ||
              conversation.contact.phone ||
              "Unknown contact";
            const preview = last
              ? `${last.direction === "OUTBOUND" ? "You: " : ""}${last.body}`
              : "No messages yet";
            return (
              <li key={conversation.id}>
                <Link
                  href={`/s/${subAccountId}/conversations/${conversation.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900">{name}</span>
                      {conversation.unreadCount > 0 ? (
                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          {conversation.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-sm text-slate-500">{preview}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-400">
                    {last ? <div className="font-medium text-slate-500">{last.channel}</div> : null}
                    <div>
                      {conversation.lastMessageAt
                        ? new Date(conversation.lastMessageAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : ""}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
