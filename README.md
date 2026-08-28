# Recall

**Never miss another class, quiz, or deadline.** Built for University of Lahore students.

Recall pulls your deadlines out of Slate, reads your timetable, and tells you what's
next — which room, what's due, what to study — before you'd ever forget it.

---

## Why this exists

UOL students juggle three disconnected sources of truth:

- **Slate** (the university's Moodle) holds quiz and assignment deadlines, buried in a calendar nobody opens.
- **Timetables** arrive as images in WhatsApp groups, then get lost in the scroll.
- **Reminders** don't exist. You find out about a quiz an hour before it closes.

Recall unifies them, and reminds you.

---

## How it works

```
Google sign-in ──► no password ever stored

Browser extension ──► fetches your Slate calendar from inside a real Slate page
                  ──► POSTs only the calendar contents to Recall
                  ──► your calendar link never leaves your computer

Timetable upload ──► PDF/photo rendered to images ──► vision model reads the grid
                 ──► you review and correct ──► saved

Web Push ──► 15 min before each class, and 24h / 2h / 30min before each deadline
         ──► fired by pg_cron every 5 min, with GitHub Actions as a backup
```

### The Cloudflare problem, and why there's an extension

Slate sits behind Cloudflare, which **rejects server-to-server requests** — a plain
`GET` of the calendar feed returns `403` no matter what headers you send. It also
rejects requests from a `chrome-extension://` origin.

What Cloudflare *does* allow is a real page asking for its own data. So the extension
finds (or briefly opens) a Slate tab and runs the fetch **inside that page**, where it
is a genuine same-origin request. That's not a workaround for a security control —
it's your browser fetching your own calendar, which is exactly what's meant to be
allowed.

---

## Design decisions worth knowing

**No portal passwords, ever.** Sign-in is Google OAuth. The Slate connection uses a
read-only calendar link, and even that is stored **only in the extension's local
storage** — the server never receives it. This is the difference between a tool a
university could recommend and one it would ban.

**No service-role key in the app.** The reminder job and the extension sync both run
without a user session, which is the usual reason people reach for Supabase's
RLS-bypassing key. Instead there are `security definer` Postgres functions that each
do exactly one job and can only ever touch the user who owns the device token.
`SUPABASE_SERVICE_ROLE_KEY` is deliberately unused.

**Device tokens are stored hashed.** SHA-256, same reasoning as passwords: a leak of
the table can't be used to sync as anyone.

**The AI is never trusted with scheduling.** The study planner asks a model for a
plan, then *programmatically drops* any block that collides with a class or falls
outside sensible hours. A study block on top of a lecture would make the whole plan
useless, so the rule is enforced in code, not in the prompt.

**Timetable extraction is a first draft.** Free vision models misalign columns on
dense grids, so every extracted class is editable before it's saved. Wrong times mean
wrong reminders — the one thing this app cannot get wrong.

**The database drives the clock, not GitHub.** Reminders used to be triggered
by a GitHub Actions `schedule:` asking for a run every ten minutes. What it
actually got: ~30 runs on 26 Aug, **three** on 27 Aug, one on 28 Aug. GitHub
documents `schedule:` as best-effort and drops it under load, and a
fifteen-minute class reminder cannot survive a ten-hour gap — that alone
explains a four-class day producing one notification. `pg_cron` now fires the
same endpoint every five minutes from inside Postgres, where nothing
deprioritises it. The workflow stays as a second trigger, looping on its own
timer rather than trusting the schedule; reminders are claimed before sending,
so two triggers can never double-send.

The job needs a bearer token, and `CRON_SECRET` cannot live in a public repo —
so the database mints its own, keeps the plaintext in Supabase Vault, and
registers the hash alongside GitHub's. Nothing secret is typed or pasted, and
either trigger can be revoked without touching the other.

**A late reminder still goes out.** Even so, a trigger can arrive late. The old
rule only fired if a run landed inside the lead window, so a delayed run meant
the class was never announced at all. A reminder up to 20 minutes late is now
sent anyway, worded honestly — "Databases started 8 min ago" beats silence.

**No free model is dependable, so they are raced.** Availability moves by the
minute — one pool returned a clean study plan and a `402` three minutes later,
and the planner's original models went from working to timing out on every
request without the app changing. Every text call fires at the whole chain at
once and takes the first usable answer; `npm run check:models` re-measures which
pools are alive.

**Reminder sends roll back.** A reminder is claimed *before* sending so two overlapping
runs can't double-send. If every delivery then fails, the claim is released and the
next run retries — otherwise a failed send would vanish silently forever.

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions) |
| Database | Supabase Postgres, RLS on every table |
| Auth | Supabase Auth + Google OAuth |
| AI | OpenRouter (free-tier models, raced for latency) |
| Notifications | Web Push (VAPID) — no third-party service |
| Extension | Chrome MV3 |

Everything runs on free tiers.

---

## Running it locally

**Prerequisites:** Node 20+, a Supabase project, an OpenRouter key.

```bash
git clone https://github.com/<you>/recall.git
cd recall
npm install
cp .env.example .env.local     # then fill in the values
```

Generate the Web Push keys:

```bash
node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY='+k.publicKey);console.log('VAPID_PRIVATE_KEY='+k.privateKey)"
```

Apply the database schema:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Run it:

```bash
npm run dev
```

### Loading the extension

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/`
2. In Recall, go to **Slate** and generate a pairing code
3. Click the extension, enter the code, then paste your Slate calendar export URL

Set `RECALL_ORIGIN` in `extension/config.js` to your deployed URL before shipping.

---

## Project layout

```
app/
  (app)/            everything behind sign-in — auth guard lives in its layout
    dashboard/      today's classes + deadlines, 3D deck with live countdown
    planner/        deadline-aware AI study planner
    timetable/      upload → AI extraction → editable review
    connect/        extension pairing
  api/              sync, pairing, push, reminders
  landing.tsx       marketing page
lib/
  ics.ts            Moodle .ics parsing (merges open/close pairs, dedupes)
  vision.ts         timetable extraction
  planner.ts        study plan generation + clash filtering
  reminders.ts      scheduling rules (pure — see scripts/test-reminders.ts)
  llm.ts            OpenRouter caller, races free models
extension/          Chrome MV3 sync extension
supabase/migrations/
scripts/            diagnostics and tests
```

## Tests and diagnostics

```bash
npm test                 # scheduling rules, .ics parsing, loose JSON — no DB or browser
npm run test:planner     # end-to-end: does a free model actually return a usable plan?
npm run check:models     # which free text models are answering right now
npm run check:vision     # same, for the timetable reader
```

`check:models` is the one to reach for when an AI feature starts failing. Free
pools come and go without notice — the study planner's original chain of two
gemma pools plus `openrouter/free` went from working to timing out on all three
without anything in the app changing. It tests each free model against the real
planner prompt and prints a chain to paste into `OPENROUTER_TEXT_MODELS`.

`GET /api/reminders/status` (signed in) reports every link in the reminder chain and
names the broken one. `?retry=1` releases stuck claims.

### Security checks

```bash
npm run test:rls        # can the public anon key read anything? (it ships in the browser)
npm run test:csp        # has script-src quietly regained 'unsafe-inline'?
```

`scripts/isolation-check.sql` answers the one that matters most — can one
student read another's data — by impersonating a signed-in session in Postgres.
Paste it into the Supabase SQL editor. It needs no second account and leaves
nothing behind, because the report is delivered by raising, which rolls the
attempted writes back.

---

## Status

Working: auth, Slate sync, timetable import, dashboard, reminders, study planner.

Not done yet: general AI help, exam-prep flows, multi-university support.

---

**Made by [Muazzam Ali](https://github.com/muazamali495-hub)** — a University of Lahore student,
for University of Lahore students.
