import { createClient, getCurrentUser } from "@/lib/supabase/server";

type Event = {
  id: number;
  kind: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Karachi",
});

/**
 * Says what each event was, in the words a student would use.
 *
 * A log written in event names is a log nobody reads. The point of showing
 * this at all is that someone notices a device they don't recognise, which
 * only happens if the line reads like a sentence.
 */
function describe(event: Event): { text: string; tone: string } | null {
  const label = typeof event.detail?.label === "string" ? event.detail.label : "A browser";

  switch (event.kind) {
    case "device.paired":
      return { text: `${label} was linked to your account`, tone: "text-mint" };
    case "device.removed":
      return { text: `${label} was removed`, tone: "text-muted" };
    case "device.expired":
      return {
        text: `${label} expired (${event.detail?.reason ?? "unused"})`,
        tone: "text-faint",
      };
    default:
      // Unknown kinds are skipped rather than printed raw: a line the student
      // cannot act on is noise, and noise is what stops logs being read.
      return null;
  }
}

/**
 * The last few things that happened to this account.
 *
 * Only the student's own events — a stranger guessing pairing codes is
 * recorded too, but attributing that to someone we cannot identify would be
 * inventing a fact. Those stay in the table for investigation.
 */
export async function Activity() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data } = await supabase
    .from("security_events")
    .select("id, kind, detail, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const events = ((data ?? []) as Event[])
    .map((e) => ({ event: e, described: describe(e) }))
    .filter((e) => e.described !== null);

  if (events.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-muted">Recent activity</h2>
      <p className="mb-3 text-xs text-faint">
        Anything you don&apos;t recognise is worth removing above.
      </p>

      <ul className="flex flex-col gap-1.5 rounded-xl border border-line bg-white/[0.02] p-3">
        {events.map(({ event, described }) => (
          <li key={event.id} className="flex flex-wrap items-baseline gap-x-2.5 text-xs">
            <span className="tabular-nums text-faint">{WHEN.format(new Date(event.created_at))}</span>
            <span className={described!.tone}>{described!.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
