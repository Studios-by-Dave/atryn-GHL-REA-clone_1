import { LoginForm } from "./login-form";

export const instant = false;

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

function getSafeCallbackUrl(callbackUrl: string | undefined): string {
  if (!callbackUrl?.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/";
  }
  return callbackUrl;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-indigo-600">ATRYN</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">
          Sign in to your workspace
        </h1>
        <p className="mt-2 mb-6 text-sm leading-6 text-zinc-600">
          Enter your email and we’ll send you a secure, one-time sign-in link.
        </p>
        <LoginForm callbackUrl={getSafeCallbackUrl(callbackUrl)} />
      </section>
    </main>
  );
}
