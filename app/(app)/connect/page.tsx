import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { PairingCode } from "./pairing-code";

const STEPS = [
  {
    title: "Install the Recall extension",
    detail: "It runs in your browser and checks Slate for you.",
  },
  {
    title: "Generate a pairing code below",
    detail: "Type it into the extension once to link it to your account.",
  },
  {
    title: "Paste your Slate calendar link into the extension",
    detail: "Slate → Calendar → Export calendar → Get calendar URL.",
  },
];

export default async function ConnectPage() {
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) redirect("/");

  const { data: devices } = await supabase
    .from("sync_devices")
    .select("id, label, last_seen_at")
    .order("created_at", { ascending: false });

  const linked = (devices?.length ?? 0) > 0;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-14">

      <h1 className="mb-3 text-2xl font-bold tracking-tight">Connect Slate</h1>
      <p className="mb-8 text-sm text-muted">
        Slate only accepts requests from a real browser, so Recall checks it
        through a small extension running in yours. Your calendar link stays on
        your computer — we only ever receive the deadlines themselves.
      </p>

      <ol className="mb-8 flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-line bg-white/[0.02] p-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-mint/25 bg-mint/10 text-xs font-bold text-mint">
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-medium">{step.title}</span>
              <span className="block text-xs text-faint">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <PairingCode alreadyLinked={linked} />

      {linked && devices && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-muted">Linked browsers</h2>
          <ul className="flex flex-col gap-2">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-sm"
              >
                <span>{d.label ?? "Browser"}</span>
                <span className="text-xs text-faint">
                  {d.last_seen_at
                    ? `synced ${new Date(d.last_seen_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}`
                    : "never synced"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
