import { notFound } from "next/navigation";
import { getPublishedForm } from "@/server/services/forms";
export const instant = false;

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const form = await getPublishedForm(publicId);
  if (!form || form.status !== "ACTIVE") notFound();

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-2xl font-semibold">{form.name}</h1>
      <form method="POST" action={`/api/public/forms/${publicId}`} className="space-y-4">
        {form.fields.map((f) => (
          <div key={f.id}>
            <label className="block text-sm font-medium">{f.label}</label>
            <input name={f.name} type={f.type === "EMAIL" ? "email" : "text"} required={f.required} />
          </div>
        ))}
        <input type="text" name="honeypot" className="hidden" tabIndex={-1} autoComplete="off" />
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          {form.submitLabel ?? "Submit"}
        </button>
      </form>
    </main>
  );
}
