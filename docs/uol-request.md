# Request to UOL IT — allow Recall's server to read student calendar feeds

## Why this matters

Right now Cloudflare blocks Recall's server from fetching the Slate calendar
export, so every student needs a browser extension on a laptop to sync. That
rules out phone-only students and makes the product fragile.

If UOL allows Recall's server to reach `/calendar/export_execute.php`, the
extension disappears entirely and Recall works identically on iPhone, Android
and desktop — with no app, no extension, and no cost.

**This is worth doing before building any mobile app.** It removes the reason
the app exists.

## What to ask for

One of these, in order of preference:

1. **Allow the calendar export path for Recall's server IPs.** Narrowest
   option — one path, one origin. Nothing else on Slate is opened up.
2. **A Cloudflare WAF skip rule** for that path when the request carries an
   agreed identifying header.
3. **A Moodle web-service token** scoped to calendar read, if UOL prefers to
   grant access through Moodle rather than the network layer.

Vercel's outbound IPs are not static on the free plan, so if they want an IP
allowlist you may need to say the requests come from Vercel's ranges, or move
the sync job somewhere with a fixed IP.

## Who to contact

The team that runs Slate — usually IT Services or the LMS administrator. The
CS department may be able to introduce you, which lands better than a cold
email.

---

## Draft email

> **Subject:** Student project — request to allow calendar feed access for a study reminder tool
>
> Dear Sir/Madam,
>
> My name is Muazzam Ali, a BSCS student at the University of Lahore. I have
> built a free tool called Recall that helps students keep track of their
> quizzes, assignments and class timetable, and reminds them before each one.
> It is live at https://recall-kohl-mu.vercel.app and the full source code is
> public at https://github.com/muazamali495-hub/recall.
>
> Recall reads only the student's own Slate calendar export feed — the
> read-only `.ics` link that Slate already provides under Calendar → Export.
> It uses the per-user token from that link. **It never asks for, receives or
> stores any student's password**, and it cannot submit work, change grades or
> access course content. Students sign in with their university Google
> account, and access is restricted to `@student.uol.edu.pk` addresses.
>
> I am writing about one technical obstacle. Requests to
> `slate.uol.edu.pk/calendar/export_execute.php` from a server are rejected by
> Cloudflare with a 403, so at present each student has to install a browser
> extension on a laptop for their deadlines to sync. This makes the tool
> unusable for students who work mainly from a phone.
>
> Would it be possible to allow requests to that single calendar-export path
> from Recall's server? This would let the deadlines sync centrally, and every
> student could use it from any device with nothing to install.
>
> I would be glad to explain the design, share the code, or make any change
> you consider necessary — including handing over operational control if the
> university would prefer to run it itself. If a Moodle web-service token
> scoped to calendar reading would suit better than a network rule, that
> works equally well.
>
> Thank you for your time.
>
> Muazzam Ali
> BSCS, University of Lahore
> [student ID] · [email] · [phone]

## Points worth making if they ask

- **No credentials.** Google handles sign-in; the calendar token is read-only
  and a student can revoke it in Slate at any time.
- **Read-only.** The `.ics` feed contains titles, courses and due dates. No
  submissions, no grades, no course material.
- **Isolated per student.** Row Level Security in Postgres; one student's data
  is unreachable from another's session.
- **Open source.** They can read every line before agreeing.
- **Reversible.** Removing the rule stops the sync; nothing else breaks.
- **Alternative offered.** If they would rather not open the network path,
  a scoped Moodle web-service token achieves the same thing.

## What to have ready

- The live link, working, with your own timetable and deadlines in it
- The GitHub repo
- A one-line answer to "what happens if this leaks?" — no passwords exist to
  leak; a stolen calendar token shows one student's due dates and can be
  regenerated in Slate
