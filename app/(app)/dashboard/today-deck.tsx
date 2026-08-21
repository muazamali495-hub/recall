"use client";

import { useEffect, useRef, useState } from "react";
import s from "./dashboard.module.css";

export type DeckClass = {
  id: string;
  course: string;
  room: string | null;
  start: string; // "HH:MM"
  end: string | null;
  startsAtMs: number; // absolute instant, so the countdown can't drift
  endsAtMs: number;
};

export type DeckDeadline = {
  id: string;
  title: string;
  course: string | null;
  kind: string;
  dueAtMs: number;
  sourceUrl: string | null;
};

const KIND_COLOR: Record<string, string> = {
  exam: "#ff8080",
  quiz: "#ffb65c",
  assignment: "#9aa0ff",
  other: "#98a2be",
};

const KindGlyph = ({ kind }: { kind: string }) => {
  const c = KIND_COLOR[kind] ?? KIND_COLOR.other;

  if (kind === "quiz" || kind === "exam") {
    return (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="11" r="6.3" stroke={c} strokeWidth="1.6" />
        <path d="M10 8v3.2l2 1.3M8 2.5h4" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 3h7l3 3v11H5z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 3v3h3M7.5 11h5M7.5 13.5h5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
};

/** "in 3 days" / "in 4 hours" / "in 25 min" */
function untilLabel(ms: number) {
  const mins = Math.round(ms / 60_000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

export function TodayDeck({
  dayName,
  dateLabel,
  synced,
  classes,
  dueToday,
}: {
  dayName: string;
  dateLabel: string;
  synced: boolean;
  classes: DeckClass[];
  dueToday: DeckDeadline[];
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);

  // The clock only starts on the client — rendering a live countdown during SSR
  // would hydrate with a stale value and flicker.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Cursor tilt, same feel as the landing hero.
  useEffect(() => {
    const stage = stageRef.current;
    const deck = deckRef.current;
    if (!stage || !deck) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // A touch screen has no cursor to follow, and setting an inline transform
    // here would override the CSS sway that stands in for it on mobile.
    if (window.matchMedia("(hover: none)").matches) return;

    let raf: number | null = null;
    let tx = 0, ty = 0, cx = 0, cy = 0;

    const tick = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      deck.style.transform = `rotateX(${cy.toFixed(2)}deg) rotateY(${cx.toFixed(2)}deg)`;
      raf = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : null;
    };

    const onMove = (e: MouseEvent) => {
      const r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 9;
      ty = -((e.clientY - r.top) / r.height - 0.5) * 7;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const reset = () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    stage.addEventListener("mousemove", onMove);
    stage.addEventListener("mouseleave", reset);

    deck.style.transform = "rotateX(4deg) rotateY(-6deg)";
    const settle = setTimeout(reset, 500);

    return () => {
      stage.removeEventListener("mousemove", onMove);
      stage.removeEventListener("mouseleave", reset);
      clearTimeout(settle);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const clock = now ?? 0;
  const running = now === null ? undefined : classes.find((c) => clock >= c.startsAtMs && clock < c.endsAtMs);
  const next = now === null ? undefined : classes.find((c) => c.startsAtMs > clock);

  // Ring fills over the last 90 minutes before a class.
  const WINDOW = 90 * 60_000;
  const msToNext = next ? next.startsAtMs - clock : null;
  const progress = msToNext === null ? 0 : Math.max(0, Math.min(1, 1 - msToNext / WINDOW));

  const R = 24;
  const C = 2 * Math.PI * R;

  const nextDeadline = dueToday[0] ?? null;

  return (
    <div className={s.stage} ref={stageRef}>
      <div className={s.glow} aria-hidden="true" />
      <div className={s.glowAmber} aria-hidden="true" />

      <div className={s.deck} ref={deckRef}>
        <div className={s.panel}>
          {/* ---- Header ---- */}
          <div className={s.head}>
            <div className="flex items-center gap-4">
              {next && msToNext !== null ? (
                <div className={s.ring}>
                  <svg width="56" height="56" viewBox="0 0 56 56">
                    <circle className={s.ringTrack} cx="28" cy="28" r={R} fill="none" strokeWidth="4" />
                    <circle
                      className={s.ringFill}
                      cx="28"
                      cy="28"
                      r={R}
                      fill="none"
                      strokeWidth="4"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - progress)}
                    />
                  </svg>
                  <span className={s.ringLabel}>
                    {msToNext < 60 * 60_000 ? `${Math.max(1, Math.round(msToNext / 60_000))}m` : `${Math.round(msToNext / 3_600_000)}h`}
                  </span>
                </div>
              ) : (
                <div className={s.ring}>
                  <svg width="56" height="56" viewBox="0 0 56 56">
                    <circle className={s.ringTrack} cx="28" cy="28" r={R} fill="none" strokeWidth="4" />
                  </svg>
                  <span className={s.ringLabel} style={{ color: "var(--faint)" }}>
                    ·
                  </span>
                </div>
              )}

              <div className="min-w-0">
                <p className="text-[1.05rem] font-bold tracking-tight">Today · {dayName}</p>
                <p className="truncate text-xs text-faint">
                  {running
                    ? `${running.course} is on now`
                    : next
                      ? `${next.course} at ${next.start}`
                      : classes.length
                        ? "All classes done"
                        : dateLabel}
                </p>
              </div>
            </div>

            <span className={`${s.live} ${synced ? "" : s.liveOff}`}>
              <i /> {synced ? "Synced" : "Not connected"}
            </span>
          </div>

          {/* ---- Two columns ---- */}
          <div className={s.cols}>
            {/* Classes */}
            <div className={s.col}>
              <p className={s.colHead}>Classes</p>

              {classes.length === 0 ? (
                <p className="py-6 text-sm text-faint">No classes today.</p>
              ) : (
                <ul className="flex flex-col">
                  {classes.map((c, i) => {
                    const isRunning = now !== null && clock >= c.startsAtMs && clock < c.endsAtMs;
                    const isDone = now !== null && clock >= c.endsAtMs;

                    return (
                      <li
                        key={c.id}
                        className={`relative flex items-center gap-3.5 rounded-xl px-2.5 py-2.5 ${
                          isRunning ? "bg-mint/[0.08] ring-1 ring-inset ring-mint/25" : ""
                        } ${isDone ? "opacity-40" : ""}`}
                      >
                        {i < classes.length - 1 && (
                          <span
                            aria-hidden="true"
                            className="absolute left-[3.05rem] top-[2.6rem] h-[calc(100%-1.1rem)] w-px bg-line"
                          />
                        )}

                        <span
                          className={`w-10 shrink-0 text-right font-mono text-[0.8rem] tabular-nums ${
                            isRunning ? "text-mint" : "text-faint"
                          }`}
                        >
                          {c.start}
                        </span>

                        <span
                          className={`relative z-10 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                            isRunning
                              ? "border-mint bg-mint shadow-[0_0_0_4px_rgba(87,230,193,.18)]"
                              : isDone
                                ? "border-line-2 bg-transparent"
                                : "border-muted bg-transparent"
                          }`}
                        />

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium tracking-tight">
                            {c.course}
                          </span>
                          <span className="block truncate text-[0.72rem] text-faint">
                            {c.room ?? "Room not set"}
                            {c.end ? ` · until ${c.end}` : ""}
                          </span>
                        </span>

                        {isRunning && (
                          <span className="shrink-0 rounded-full border border-mint/30 bg-mint/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-mint">
                            Now
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* What's due */}
            <div className={s.col}>
              <p className={s.colHead}>Due soon</p>

              {dueToday.length === 0 ? (
                <p className="py-6 text-sm text-faint">Nothing due in the next few days.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dueToday.slice(0, 4).map((d) => {
                    const color = KIND_COLOR[d.kind] ?? KIND_COLOR.other;
                    const ms = d.dueAtMs - clock;
                    const soon = now !== null && ms < 24 * 3_600_000;

                    const inner = (
                      <>
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border"
                          style={{ borderColor: `${color}44`, background: `${color}1a` }}
                        >
                          <KindGlyph kind={d.kind} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium tracking-tight">{d.title}</span>
                          <span className="block truncate text-[0.72rem] text-faint">{d.course ?? "—"}</span>
                        </span>
                        <span
                          className="shrink-0 text-[0.72rem] font-semibold tabular-nums"
                          style={{ color: soon ? "var(--amber)" : "var(--muted)" }}
                        >
                          {now === null ? "" : untilLabel(ms)}
                        </span>
                      </>
                    );

                    return (
                      <li key={d.id}>
                        {d.sourceUrl ? (
                          <a
                            href={d.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-2.5 transition hover:border-line-2 hover:bg-white/[0.05]"
                          >
                            {inner}
                          </a>
                        ) : (
                          <div className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-2.5">
                            {inner}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ---- Floating chips ---- */}
        {next && msToNext !== null && (
          <div className={`${s.chip} ${s.chipRight}`} style={{ transform: "translateZ(70px)" }}>
            <div className={s.ci} style={{ background: "rgba(87,230,193,.14)", border: "1px solid rgba(87,230,193,.3)" }}>
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M9 2a4.5 4.5 0 0 0-4.5 4.5c0 3.5-1.3 4.6-1.3 4.6h11.6s-1.3-1.1-1.3-4.6A4.5 4.5 0 0 0 9 2zM7.4 14a1.7 1.7 0 0 0 3.2 0"
                  stroke="#57E6C1"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div className={s.lab}>Next class</div>
              <div className={s.val}>{untilLabel(msToNext)}</div>
            </div>
          </div>
        )}

        {nextDeadline && (
          <div className={`${s.chip} ${s.chipLeft}`} style={{ transform: "translateZ(50px)" }}>
            <div className={s.ci} style={{ background: "rgba(255,182,92,.14)", border: "1px solid rgba(255,182,92,.3)" }}>
              <KindGlyph kind={nextDeadline.kind} />
            </div>
            <div>
              <div className={s.lab}>{nextDeadline.kind === "assignment" ? "Assignment" : "Quiz"} due</div>
              <div className={s.val}>{now === null ? "—" : untilLabel(nextDeadline.dueAtMs - clock)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
