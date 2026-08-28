import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ConnectSwitch } from "./connect-switch";
// The version that ships in the download. Read from the extension's own
// manifest so it can never drift from what is actually packaged — the page
// compares it against what the installed extension reports.
import extensionManifest from "../../../extension/manifest.json";
import { DeviceList, type Device } from "./device-list";
import { Activity } from "./activity";

export default async function ConnectPage() {
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) redirect("/");

  const [{ data: devices }, { count: deadlineCount }] = await Promise.all([
    supabase
      .from("sync_devices")
      .select("id, label, last_seen_at, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("deadlines")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const linked = (devices?.length ?? 0) > 0;

  // Syncing is account-level: one device holds the calendar URL and pushes
  // deadlines in, and every other device reads them. A phone showing "not
  // connected" because it personally lacks the URL is just wrong.
  const syncedDevice = (devices ?? []).find((d) => d.last_seen_at) ?? null;
  const accountConnected = Boolean(syncedDevice) || (deadlineCount ?? 0) > 0;

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
        accountConnected={accountConnected}
        syncedFrom={syncedDevice?.label ?? null}
        lastSyncedAt={syncedDevice?.last_seen_at ?? null}
        deadlineCount={deadlineCount ?? 0}
        latestExtensionVersion={extensionManifest.version}
      />

      {linked && devices && <DeviceList devices={devices as Device[]} />}

      <Activity />

    </main>
  );
}
