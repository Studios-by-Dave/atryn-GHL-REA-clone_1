import Link from "next/link";
import { auth } from "../../../auth";
import { acceptInvitationAction } from "@/server/actions/tenancy";

export const instant = false;

type InvitePageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const [{ token }, session] = await Promise.all([searchParams, auth()]);
  if (!token) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <h1 className="text-2xl font-semibold">Invitation link is incomplete</h1>
        <p className="mt-3 text-zinc-600">Ask the workspace administrator to send a new invitation.</p>
      </main>
    );
  }

  if (!session?.user?.id) {
    const callbackUrl = `/invite?token=${encodeURIComponent(token)}`;
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <h1 className="text-2xl font-semibold">You’re invited to Atryn</h1>
        <p className="mt-3 text-zinc-600">
          Sign in with the email address that received this invitation to continue.
        </p>
        <Link
          className="mt-6 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white"
          href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        >
          Sign in to accept
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-2xl font-semibold">Accept your Atryn invitation</h1>
      <p className="mt-3 text-zinc-600">
        Continue to join the invited workspace. The invitation is tied to the email address that received it.
      </p>
      <form action={acceptInvitationAction} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white"
        >
          Accept invitation
        </button>
      </form>
    </main>
  );
}
