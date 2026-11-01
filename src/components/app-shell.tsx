"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ContactRound,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  MessageSquare,
  Settings2,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { switchActiveSubAccount } from "@/server/actions/tenancy";

type AccessibleSubAccount = {
  id: string;
  name: string;
  slug: string;
  orgId: string;
  org: { name: string };
};

type AppShellProps = {
  activeSubAccount: AccessibleSubAccount;
  subAccounts: AccessibleSubAccount[];
  userName: string;
  children: ReactNode;
};

type NavigationItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
};

const navigation: NavigationItem[] = [
  { label: "Overview", icon: LayoutDashboard, href: "dashboard" },
  { label: "Contacts", icon: ContactRound, href: "contacts" },
  { label: "Conversations", icon: MessageSquare },
  { label: "Opportunities", icon: Workflow },
  { label: "Appointments", icon: CalendarDays },
  { label: "Automation", icon: Workflow },
  { label: "Reporting", icon: BarChart3 },
];

export function AppShell({
  activeSubAccount,
  subAccounts,
  userName,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const accountPath = `/s/${activeSubAccount.id}`;
  const displayName = userName.includes("@") ? userName : "Your account";

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-6">
          <span className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
            A
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-950">Atryn</span>
          <button
            type="button"
            className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-slate-100 p-4">
          <form action={switchActiveSubAccount} className="rounded-xl border border-slate-200 p-3">
            <label
              htmlFor="active-sub-account"
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400"
            >
              Workspace
            </label>
            <div className="flex items-center gap-2">
              <select
                id="active-sub-account"
                name="subAccountId"
                defaultValue={activeSubAccount.id}
                className="min-w-0 flex-1 appearance-none bg-transparent text-sm font-semibold text-slate-800 outline-none"
              >
                {subAccounts.map((subAccount) => (
                  <option key={subAccount.id} value={subAccount.id}>
                    {subAccount.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" size={16} className="shrink-0 text-slate-400" />
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{activeSubAccount.org.name}</p>
            {subAccounts.length > 1 ? (
              <button
                type="submit"
                className="mt-3 min-h-9 w-full rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                Switch workspace
              </button>
            ) : null}
          </form>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {navigation.map(({ label, icon: Icon, href }) => {
            const target = href ? `${accountPath}/${href}` : undefined;
            const isActive = target !== undefined && pathname === target;
            return target ? (
              <Link
                key={label}
                href={target}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                disabled
                title={`${label} will be available in a future release`}
                className="flex min-h-11 w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-400"
              >
                <Icon size={18} aria-hidden="true" />
                <span className="flex-1">{label}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Soon</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-slate-100 p-3">
          <button
            type="button"
            disabled
            className="flex min-h-11 w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-400"
          >
            <Settings2 size={18} aria-hidden="true" />
            Settings
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide">Soon</span>
          </button>
          <button
            type="button"
            disabled
            className="flex min-h-11 w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-400"
          >
            <LifeBuoy size={18} aria-hidden="true" />
            Help center
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="hidden min-w-0 flex-1 sm:block">
            <p className="truncate text-sm font-semibold text-slate-800">{activeSubAccount.name}</p>
            <p className="truncate text-xs text-slate-500">{activeSubAccount.org.name}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 md:block">
              Search workspace
              <span className="ml-8 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]">
                /
              </span>
            </div>
            <div
              title={displayName}
              className="grid size-9 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700"
            >
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={() => void signOut({ redirectTo: "/login" })}
              className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] p-4 sm:p-7 lg:p-9">{children}</main>
      </div>
    </div>
  );
}
