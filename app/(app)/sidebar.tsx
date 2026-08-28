"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = {
  href: string;
  label: string;
  icon: React.ReactNode;
  soon?: boolean;
};

const stroke = { strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const ITEMS: Item[] = [
  {
    href: "/dashboard",
    label: "Today",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="14" height="13" rx="3" stroke="currentColor" {...stroke} />
        <path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="currentColor" {...stroke} />
      </svg>
    ),
  },
  {
    href: "/planner",
    label: "Study planner",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2.2l1.9 4 4.4.5-3.2 3 .9 4.3L10 11.9 6 14l.9-4.3-3.2-3 4.4-.5z" stroke="currentColor" {...stroke} />
      </svg>
    ),
  },
  {
    href: "/timetable",
    label: "Timetable",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2.8" y="3.5" width="14.4" height="13" rx="2.4" stroke="currentColor" {...stroke} />
        <path d="M2.8 8h14.4M8 8v8.5M13 8v8.5" stroke="currentColor" {...stroke} />
      </svg>
    ),
  },
  {
    href: "/connect",
    label: "Slate",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M8.4 11.6a3.4 3.4 0 005 .3l2-2a3.4 3.4 0 00-4.8-4.8l-1.1 1.1" stroke="currentColor" {...stroke} />
        <path d="M11.6 8.4a3.4 3.4 0 00-5-.3l-2 2a3.4 3.4 0 004.8 4.8l1.1-1.1" stroke="currentColor" {...stroke} />
      </svg>
    ),
  },
  {
    href: "/ask",
    label: "Ask Recall",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M17 12.5a2.5 2.5 0 01-2.5 2.5H7l-4 3V5.5A2.5 2.5 0 015.5 3h9A2.5 2.5 0 0117 5.5z" stroke="currentColor" {...stroke} />
      </svg>
    ),
  },
];

const Brand = () => (
  <Link href="/dashboard" className="flex items-center gap-2.5 px-2 font-bold tracking-tight">
    {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand mark */}
    <img src="/logo.png" alt="" width={26} height={26} className="rounded-[22%]" aria-hidden="true" />
    Recall
  </Link>
);

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        if (item.soon) {
          return (
            <span
              key={item.href}
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-faint/60"
              title="Coming soon"
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              <span className="rounded-full border border-line-2 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-faint">
                Soon
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-mint/[0.09] text-mint ring-1 ring-inset ring-mint/20"
                : "text-muted hover:bg-white/5 hover:text-ink"
            }`}
          >
            {/* active rail */}
            {active && (
              <span aria-hidden="true" className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-mint" />
            )}
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ name, email }: { name: string | null; email: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ---------- Mobile top bar ----------
          Solid, not translucent-with-blur. These two bars are lg:hidden, so
          every backdrop-filter here landed only on phones — stacked on top of
          the dashboard's 3D deck, which is where the half-black screen came
          from. Against a 90%-opaque background the blur was doing almost
          nothing visible anyway. */}
      <div className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-line bg-ground px-4 lg:hidden">
        <Brand />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="rounded-lg border border-line-2 p-2 text-muted transition hover:bg-white/5 hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" {...stroke} />
            ) : (
              <path d="M3.5 6h13M3.5 10h13M3.5 14h13" stroke="currentColor" {...stroke} />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="sticky top-14 z-40 border-b border-line bg-ground px-4 py-3 lg:hidden">
          <NavList onNavigate={() => setOpen(false)} />

          {/* Sign out lives in the desktop sidebar too, but that is hidden on
              mobile — without this there is no way to log out on a phone. */}
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-2 px-1">
              <p className="truncate text-sm font-medium tracking-tight">{name ?? "Student"}</p>
              <p className="truncate text-[0.7rem] text-faint">{email}</p>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="w-full rounded-xl border border-line-2 px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-white/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------- Desktop sidebar ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-gradient-to-b from-[rgba(20,26,43,.6)] to-[rgba(10,13,21,.4)] px-3 py-5 backdrop-blur-xl lg:flex">
        <div className="mb-7">
          <Brand />
        </div>

        <NavList />

        <div className="mt-auto">
          <div className="mb-2 rounded-xl border border-line bg-white/[0.02] p-3">
            <p className="truncate text-sm font-medium tracking-tight">{name ?? "Student"}</p>
            <p className="truncate text-[0.7rem] text-faint">{email}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full rounded-xl border border-line-2 px-3 py-2 text-sm font-medium text-muted transition hover:bg-white/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              Sign out
            </button>
          </form>

          <p className="mt-3 px-1 text-center text-[0.65rem] text-faint/70">
            Made by{" "}
            <a
              href="https://github.com/muazamali495-hub"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium transition hover:text-mint"
            >
              Muazzam Ali
            </a>
          </p>
        </div>
      </aside>
    </>
  );
}
