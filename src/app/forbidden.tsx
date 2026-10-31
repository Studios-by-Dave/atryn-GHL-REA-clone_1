import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-6">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold tracking-[0.18em] text-indigo-600">ATRYN</p>
        <h1 className="mt-5 text-2xl font-semibold text-slate-950">Workspace access denied</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          You don’t have permission to open this workspace. Choose one you belong to or ask an
          administrator for access.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Return to your workspace
        </Link>
      </section>
    </main>
  );
}
