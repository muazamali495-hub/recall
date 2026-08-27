import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { EnableReminders } from "./enable-reminders";
import { TodayDeck, type DeckClass, type DeckDeadline } from "./today-deck";

const KIND_STYLES: Record<string, { chip: string; ring: string; stroke: string; label: string }> = {
  exam: { chip: "border-rose/40 bg-rose/15 text-rose", ring: "border-rose/25 bg-rose/10", stroke: "#ff8080", label: "Exam" },
  quiz: { chip: "border-amber/30 bg-amber/10 text-amber", ring: "border-amber/25 bg-amber/10", stroke: "#ffb65c", label: "Quiz" },
  assignment: { chip: "border-violet/30 bg-violet/10 text-violet", ring: "border-violet/25 bg-violet/10", stroke: "#9aa0ff", label: "Assignment" },
  other: { chip: "border-line-2 bg-white/5 text-muted", ring: "border-line-2 bg-white/5", stroke: "#98a2be", label: "Event" },
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Every user is at UOL, so "today" means today in Pakistan (UTC+5). */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

function formatDue(due: string | null) {
  if (!due) return { text: "No date", urgent: false };

  const date = new Date(due);
  const when = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  // Compare whole calendar days, not elapsed milliseconds. Dividing by
  // 86,400,000 makes an event that passed a few hours ago land on -0, which
  // is not < 0 — so yesterday's quiz would claim to be "today".
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);

  if (days < 0) return { text: `${when} · passed`, urgent: false };
  if (days === 0) return { text: `${when} · today`, urgent: true };
  if (days === 1) return { text: `${when} · tomorrow`, urgent: true };
  return { text: `${when} · in ${days} days`, urgent: days <= 3 };
}

const KindIcon = ({ kind }: { kind: string }) => {
  const stroke = (KIND_STYLES[kind] ?? KIND_STYLES.other).stroke;

  if (kind === "quiz" || kind === "exam") {
    return (
      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="11" r="6.3" stroke={stroke} strokeWidth="1.5" />
        <path d="M10 8v3.2l2 1.3M8 2.5h4" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 3h7l3 3v11H5z" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 3v3h3M7.5 11h5M7.5 13.5h5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

export default async function Dashboard() {
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) redirect("/");

  const pakistanNow = new Date(Date.now() + PKT_OFFSET_MS);
  const todayIndex = pakistanNow.getUTCDay();

  const [{ data: profile }, { data: device }, { data: deadlines }, { data: todayClasses }, { count: pushCount }] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase.from("sync_devices").select("id").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("deadlines")
        .select("id, title, course, kind, due_at, source_url")
        .gte("due_at", new Date(Date.now() - 86_400_000).toISOString())
        .order("due_at", { ascending: true })
        .limit(20),
      supabase
        .from("class_sessions")
        .select("id, course, start_time, end_time, room")
        .eq("day_of_week", todayIndex)
        .order("start_time", { ascending: true }),
      supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

  const firstName = profile?.full_name?.split(" ")[0];
  const due = deadlines ?? [];

  /**
   * Turn today's "HH:MM" into an absolute instant.
   *
   * The deck counts down on the client, so it needs a real timestamp — a
   * wall-clock string would drift against the viewer's own clock.
   */
  const y = pakistanNow.getUTCFullYear();
  const mo = pakistanNow.getUTCMonth();
  const d = pakistanNow.getUTCDate();
  const instantOf = (time: string | null, fallbackMinutes = 0) => {
    const [h, m] = hhmm(time).split(":").map(Number);
    const mins = Number.isFinite(h) ? h * 60 + (m || 0) : fallbackMinutes;
    return Date.UTC(y, mo, d, 0, mins) - PKT_OFFSET_MS;
  };

  const deckClasses: DeckClass[] = (todayClasses ?? []).map((c) => {
    const startsAtMs = instantOf(c.start_time);
    return {
      id: c.id,
      course: c.course,
      room: c.room,
      start: hhmm(c.start_time),
      end: c.end_time ? hhmm(c.end_time) : null,
      startsAtMs,
      endsAtMs: c.end_time ? instantOf(c.end_time) : startsAtMs + 60 * 60_000,
    };
  });

  const deckDeadlines: DeckDeadline[] = due
    .filter((x) => x.due_at && new Date(x.due_at).getTime() > Date.now())
    .map((x) => ({
      id: x.id,
      title: x.title,
      course: x.course,
      kind: x.kind,
      dueAtMs: new Date(x.due_at!).getTime(),
      sourceUrl: x.source_url,
    }));

  const hasClasses = deckClasses.length > 0;
  const hasDeadlines = due.length > 0;

  // The deck already shows the closest four; this list is the rest.
  const laterDeadlines = due.filter((x) => !deckDeadlines.slice(0, 4).some((s) => s.id === x.id));

  const dateLabel = pakistanNow.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-6 pb-24 pt-10">
        {/* ---------------- Greeting ---------------- */}
        <section className="mb-1">
          <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mint">
            {DAY_NAMES[todayIndex]} · {dateLabel}
          </p>
          <h1 className="text-[2.1rem] font-bold leading-none tracking-tight sm:text-[2.7rem]">
            {firstName ? `Salaam, ${firstName}` : "Salaam"}
          </h1>
        </section>

        {/* ---------------- The deck ---------------- */}
        <TodayDeck
          dayName={DAY_NAMES[todayIndex]}
          dateLabel={dateLabel}
          synced={Boolean(device)}
          classes={deckClasses}
          dueToday={deckDeadlines}
        />

        {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
          <EnableReminders
            vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
            subscribedOnServer={(pushCount ?? 0) > 0}
          />
        )}

        {/* ---------------- Everything else ---------------- */}
        {laterDeadlines.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Later</h2>
              <Link href="/connect" className="text-xs font-medium text-faint transition hover:text-mint">
                Slate connection
              </Link>
            </div>

            <ul className="flex flex-col gap-2.5">
              {laterDeadlines.map((x) => {
                const style = KIND_STYLES[x.kind] ?? KIND_STYLES.other;
                const when = formatDue(x.due_at);

                const inner = (
                  <>
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${style.ring}`}>
                      <KindIcon kind={x.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium tracking-tight">{x.title}</span>
                      <span className="block truncate text-xs text-faint">{x.course ?? "—"}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${style.chip}`}>
                        {style.label}
                      </span>
                      <span className={`text-xs font-medium ${when.urgent ? "text-amber" : "text-muted"}`}>
                        {when.text}
                      </span>
                    </span>
                  </>
                );

                return (
                  <li key={x.id}>
                    {x.source_url ? (
                      <a
                        href={x.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-4 rounded-2xl border border-line p-4 transition hover:-translate-y-0.5 hover:border-line-2 hover:shadow-[0_24px_50px_-30px_rgba(0,0,0,.9)]"
                        style={{ background: "linear-gradient(165deg, rgba(26,33,56,.7), rgba(16,20,34,.82))" }}
                      >
                        {inner}
                      </a>
                    ) : (
                      <div
                        className="flex items-center gap-4 rounded-2xl border border-line p-4"
                        style={{ background: "linear-gradient(165deg, rgba(26,33,56,.7), rgba(16,20,34,.82))" }}
                      >
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ---------------- Setup ---------------- */}
        {(!hasClasses || !hasDeadlines) && (
          <section
            className="rounded-2xl border border-line p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,.9)]"
            style={{ background: "linear-gradient(150deg, rgba(20,26,43,.9), rgba(12,16,32,.9))" }}
          >
            <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mint">
              Finish setting up
            </p>
            <h2 className="mb-2 text-xl font-bold tracking-tight">
              {!hasClasses && !hasDeadlines ? "Bring in your semester." : "One more piece to go."}
            </h2>
            <p className="mb-6 text-sm text-muted">Recall needs two things to run your week for you.</p>

            <div className="flex flex-col gap-3">
              <SetupCard
                href="/connect"
                n={1}
                tone="mint"
                done={Boolean(device)}
                title={device ? "Slate connected" : "Connect Slate"}
                detail="Quizzes and assignment deadlines, synced automatically."
              />
              <SetupCard
                href="/timetable"
                n={2}
                tone="violet"
                done={hasClasses}
                title={hasClasses ? "Timetable added" : "Add your timetable"}
                detail="Upload a PDF, screenshot or photo — Recall reads it."
              />
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function SetupCard({
  href,
  n,
  tone,
  done,
  title,
  detail,
}: {
  href: string;
  n: number;
  tone: "mint" | "violet";
  done: boolean;
  title: string;
  detail: string;
}) {
  const ring = done
    ? "border-mint/30 bg-mint/10 text-mint"
    : tone === "mint"
      ? "border-mint/25 bg-mint/10 text-mint"
      : "border-violet/25 bg-violet/10 text-violet";

  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 rounded-xl border border-line bg-white/[0.02] p-4 transition hover:-translate-y-0.5 hover:border-mint/40 hover:bg-mint/[0.04]"
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs font-bold ${ring}`}>
        {done ? "✓" : n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold tracking-tight">{title}</span>
        <span className="block text-xs text-faint">{detail}</span>
      </span>
      <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-mint"
      >
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
