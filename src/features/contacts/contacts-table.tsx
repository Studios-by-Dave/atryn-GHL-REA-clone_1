"use client";

import { useState } from "react";
import { bulkTagAction } from "@/features/contacts/actions";

type Tag = { id: string; name: string; color: string | null };

type Item = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  tags: { tag: Tag }[];
};

type Props = {
  subAccountId: string;
  items: Item[];
  tags: Tag[];
  canWrite: boolean;
};

export function ContactsTable({ subAccountId, items, tags, canWrite }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)));
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
        No contacts match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canWrite ? (
        <form action={bulkTagAction} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <input type="hidden" name="subAccountId" value={subAccountId} />
          <span className="text-sm text-slate-500" suppressHydrationWarning>
            {selected.size} selected
          </span>
          <select
            name="tagId"
            required
            defaultValue=""
            disabled={selected.size === 0}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="" disabled>
              Choose a tag…
            </option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="contactIds" value={id} />
          ))}
          <button
            type="submit"
            disabled={selected.size === 0}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Tag selected
          </button>
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Clear selection
            </button>
          ) : null}
        </form>
      ) : null}

      <table className="w-full rounded-2xl border border-slate-200 bg-white text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            {canWrite ? (
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all contacts"
                  className="size-4"
                />
              </th>
            ) : null}
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Tags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50">
              {canWrite ? (
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    aria-label={`Select ${item.firstName} ${item.lastName}`}
                    className="size-4"
                  />
                </td>
              ) : null}
              <td className="px-4 py-3">
                <a
                  href={`/s/${subAccountId}/contacts/${item.id}`}
                  className="font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {item.firstName} {item.lastName}
                </a>
                {item.status === "ARCHIVED" ? (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    Archived
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-slate-600">{item.email ?? "—"}</td>
              <td className="px-4 py-3 text-slate-600">{item.phone ?? "—"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {item.tags.length === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    item.tags.map(({ tag }) => (
                      <span
                        key={tag.id}
                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: tag.color ?? "#6366f1" }}
                      >
                        {tag.name}
                      </span>
                    ))
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
