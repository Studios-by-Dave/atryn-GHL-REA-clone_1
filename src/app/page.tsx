import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { createOrganizationFromForm } from "@/server/actions/tenancy";
import { selectActiveSubAccount } from "@/server/tenant/active-sub-account";
import { listAccessibleSubAccounts } from "@/server/tenant/sub-accounts";

export const instant = false;

const activeSubAccountCookie = "atryn-active-sub-account";

export default async function HomePage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-6">
        <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <p className="text-sm font-bold tracking-[0.18em] text-indigo-600">ATRYN</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Grow your business, all in one place.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            Capture leads, follow up with customers, and keep your team on the same page.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Sign in to Atryn
          </Link>
        </section>
      </main>
    );
  }

  const subAccounts = await listAccessibleSubAccounts(session.user.id);
  if (subAccounts.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-6 py-12">
        <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-sm font-bold tracking-[0.18em] text-indigo-600">ATRYN</p>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
            Set up your workspace
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Create an organization and its first client workspace to get started.
          </p>
          <form action={createOrganizationFromForm} className="mt-8 grid gap-5">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Organization name
              <input
                name="organizationName"
                required
                minLength={2}
                maxLength={120}
                className="min-h-11 rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              First client workspace
              <input
                name="subAccountName"
                required
                minLength={2}
                maxLength={120}
                className="min-h-11 rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Create workspace
            </button>
          </form>
        </section>
      </main>
    );
  }

  const cookieStore = await cookies();
  const activeSubAccount = selectActiveSubAccount(
    subAccounts,
    cookieStore.get(activeSubAccountCookie)?.value,
  );
  if (!activeSubAccount) {
    throw new Error("An accessible workspace could not be selected.");
  }
  redirect(`/s/${activeSubAccount.id}/dashboard`);
}
