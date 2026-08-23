import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ConnectSwitch } from "./connect-switch";

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
    <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-24 pt-10">
      <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mint">
        Slate
      </p>
      <h1 className="mb-3 text-[2rem] font-bold leading-none tracking-tight sm:text-[2.4rem]">
        Connect once, then forget it.
      </h1>
      <p className="mb-8 text-sm text-muted">
        Slate only accepts requests from a real browser, so Recall checks it
        through a small extension running in yours. Your calendar link stays on
        your computer — we only ever receive the deadlines themselves.
      </p>

      <ConnectSwitch
        alreadyLinked={linked}
        installUrl={process.env.NEXT_PUBLIC_EXTENSION_URL ?? null}
      />

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
