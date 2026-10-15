export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-zinc-950">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          Foundation build
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Atryn
        </h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Capture more leads, follow up automatically, book more appointments,
          and prove revenue results.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Phase 0 complete: Next.js 16, Prisma 7, Postgres schema, Docker
          Compose, and seed data. Auth lands in Phase 1.
        </p>
      </main>
    </div>
  );
}
