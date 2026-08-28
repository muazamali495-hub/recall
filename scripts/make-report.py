"""
Builds the project report PDF.

Kept in the repo so the document can be regenerated rather than edited by hand
and drifting from the code it describes. Every figure in it comes from a real
measurement recorded during development, not an estimate.

Note on characters: ReportLab's built-in fonts use WinAnsi encoding, which has
no arrows, check marks or math symbols. Using them renders solid black boxes,
so this file deliberately sticks to "->", "x" and plain words.

Run:  python scripts/make-report.py
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "Recall-Project-Report.pdf"

INK = colors.HexColor("#12172A")
MUTED = colors.HexColor("#4A5268")
FAINT = colors.HexColor("#7C859B")
MINT = colors.HexColor("#0E9E7E")
RULE = colors.HexColor("#DCE1EA")
PANEL = colors.HexColor("#F4F6FA")
CODEBG = colors.HexColor("#EEF1F6")

styles = getSampleStyleSheet()


def style(name, **kw):
    base = kw.pop("parent", styles["BodyText"])
    return ParagraphStyle(name, parent=base, **kw)


S = {
    "title": style("t", fontName="Helvetica-Bold", fontSize=34, leading=38,
                   textColor=INK, alignment=TA_CENTER, spaceAfter=6),
    "subtitle": style("st", fontName="Helvetica", fontSize=13, leading=19,
                      textColor=MUTED, alignment=TA_CENTER),
    "author": style("a", fontName="Helvetica-Bold", fontSize=12, leading=17,
                    textColor=INK, alignment=TA_CENTER),
    "meta": style("m", fontName="Helvetica", fontSize=9.5, leading=15,
                  textColor=FAINT, alignment=TA_CENTER),
    "h1": style("h1", fontName="Helvetica-Bold", fontSize=17, leading=21,
                textColor=INK, spaceBefore=2, spaceAfter=3),
    "h2": style("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15,
                textColor=INK, spaceBefore=11, spaceAfter=3),
    "kicker": style("k", fontName="Helvetica-Bold", fontSize=8, leading=11,
                    textColor=MINT, spaceAfter=2),
    "body": style("b", fontName="Helvetica", fontSize=9.6, leading=14.4,
                  textColor=MUTED, spaceAfter=6, alignment=TA_LEFT),
    "lead": style("l", fontName="Helvetica", fontSize=11, leading=16.5,
                  textColor=MUTED, spaceAfter=8),
    "bullet": style("bu", fontName="Helvetica", fontSize=9.6, leading=14.2,
                    textColor=MUTED, leftIndent=11, bulletIndent=2, spaceAfter=3.5),
    "code": style("c", fontName="Courier", fontSize=8.4, leading=12,
                  textColor=INK, backColor=CODEBG, borderPadding=6,
                  leftIndent=2, spaceAfter=7),
    "caption": style("cap", fontName="Helvetica-Oblique", fontSize=8.4,
                     leading=12, textColor=FAINT, spaceAfter=8),
}


def para(text, s="body"):
    return Paragraph(text, S[s])


def bullets(items):
    return [Paragraph(f"•&nbsp;&nbsp;{t}", S["bullet"]) for t in items]


def code(text):
    safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe.replace("\n", "<br/>"), S["code"])


def datatable(rows, widths, header=True):
    t = Table(rows, colWidths=widths, hAlign="LEFT")
    cmds = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.8),
        ("LEADING", (0, 0), (-1, -1), 12.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), MUTED),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
    ]
    if header:
        cmds += [
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, 0), INK),
            ("BACKGROUND", (0, 0), (-1, 0), PANEL),
            ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE),
        ]
    t.setStyle(TableStyle(cmds))
    return t


def challenge(number, title, problem, solution, evidence=None):
    """One engineering problem, told as problem -> what it took to fix it."""
    parts = [
        Paragraph(f"CHALLENGE {number}", S["kicker"]),
        Paragraph(title, S["h2"]),
        Paragraph(f"<b>The problem.</b> {problem}", S["body"]),
        Paragraph(f"<b>The fix.</b> {solution}", S["body"]),
    ]
    if evidence:
        parts.append(code(evidence))
    return KeepTogether(parts)


# ----------------------------------------------------------------- page frame

def decorate(canvas, doc):
    canvas.saveState()
    w, h = A4
    if doc.page > 1:
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(FAINT)
        canvas.drawString(20 * mm, 13 * mm, "Recall  ·  Muazzam Ali  ·  University of Lahore")
        canvas.drawRightString(w - 20 * mm, 13 * mm, str(doc.page))
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(20 * mm, 16.5 * mm, w - 20 * mm, 16.5 * mm)
    canvas.restoreState()


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)

    doc = BaseDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=20 * mm,
        title="Recall - Project Report",
        author="Muazzam Ali",
        subject="An AI study assistant for University of Lahore students",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=decorate)])

    s = []

    # ------------------------------------------------------------- title page
    s.append(Spacer(1, 42 * mm))

    logo = ROOT / "public" / "logo.png"
    if logo.exists():
        img = Image(str(logo), width=26 * mm, height=26 * mm)
        img.hAlign = "CENTER"
        s.append(img)
        s.append(Spacer(1, 10 * mm))

    s.append(para("Recall", "title"))
    s.append(Spacer(1, 3 * mm))
    s.append(para("Never miss another class, quiz, or deadline.<br/>"
                  "An AI study assistant built for University of Lahore students.", "subtitle"))
    s.append(Spacer(1, 16 * mm))
    s.append(para("Muazzam Ali", "author"))
    s.append(para("BSCS, 6th Semester &nbsp;·&nbsp; University of Lahore", "meta"))
    s.append(Spacer(1, 10 * mm))
    s.append(para("Live at recall-kohl-mu.vercel.app", "meta"))
    s.append(Spacer(1, 28 * mm))

    s.append(datatable([
        ["Source files", "93"],
        ["Lines of application code", "8,377"],
        ["Database migrations", "27"],
        ["Automated checks", "176"],
        ["Running cost", "PKR 0 / month"],
    ], [70 * mm, 40 * mm], header=False))

    s.append(PageBreak())

    # --------------------------------------------------------------- problem
    s.append(para("1.  The problem", "h1"))
    s.append(para("UOL students keep their academic life in three places that do not "
                  "talk to each other, and the cost of that is measured in missed "
                  "deadlines.", "lead"))

    s.append(datatable([
        ["Where it lives", "Why it fails"],
        ["Slate (the university's Moodle)",
         "Quiz and assignment deadlines sit in a calendar nobody opens."],
        ["WhatsApp groups",
         "Timetables arrive as photos, then vanish into the scroll."],
        ["Nowhere",
         "There are no reminders at all. You find out about a quiz an hour before it closes."],
    ], [52 * mm, 118 * mm]))

    s.append(Spacer(1, 6))
    s.append(para("Recall unifies the three and, crucially, tells you before it "
                  "matters rather than after.", "body"))

    s.append(para("2.  What it does", "h1"))

    s.append(datatable([
        ["Feature", "What it solves"],
        ["Slate sync",
         "Reads quiz and assignment deadlines automatically. No copying, no manual entry."],
        ["Timetable import",
         "Upload a photo or PDF of the timetable; a vision model reads the grid and you correct it."],
        ["Reminders",
         "Web push 15 minutes before every class and 24h / 2h / 30min before every deadline."],
        ["Attendance",
         "UOL detains students below 75%. Tracks each course and answers the only question that matters: can I miss the next one?"],
        ["Study planner",
         "Turns a topic list plus real deadlines into a schedule that works around actual classes."],
        ["Ask Recall",
         "A tutor that already knows what is due and when you are free, so advice is specific rather than generic."],
    ], [34 * mm, 136 * mm]))

    s.append(PageBreak())

    # ---------------------------------------------------------- architecture
    s.append(para("3.  How it works", "h1"))
    s.append(para("Every piece runs on a free tier. The interesting constraint is "
                  "that Slate cannot be read by a server, which shapes the whole "
                  "design.", "lead"))

    s.append(code(
        "Google sign-in        no password is ever stored, and only\n"
        "                      @student.uol.edu.pk accounts are admitted\n"
        "\n"
        "Browser extension     fetches the Slate calendar from inside a real\n"
        "                      Slate page, then posts only its contents\n"
        "                      the calendar link never leaves the computer\n"
        "\n"
        "Timetable upload      PDF or photo rendered to images, read by a\n"
        "                      vision model, corrected by the student, saved\n"
        "\n"
        "Reminders             pg_cron inside Postgres fires every 5 minutes\n"
        "                      GitHub Actions is a second, independent trigger\n"
        "                      Web Push delivers to phone and laptop alike"
    ))

    s.append(para("Design decisions worth defending", "h2"))
    s.extend(bullets([
        "<b>No portal passwords, ever.</b> Sign-in is Google OAuth and the Slate "
        "connection is a read-only calendar link. This is the difference between a "
        "tool a university could recommend and one it would ban.",

        "<b>No all-powerful database key.</b> The usual way to let a scheduled job "
        "read every user's rows is a key that bypasses row-level security. Recall "
        "uses narrow database functions instead, so no single leaked credential "
        "exposes everyone.",

        "<b>The AI is never trusted with scheduling.</b> The planner asks a model "
        "for a plan, then programmatically deletes any block that collides with a "
        "real class. A study session on top of a lecture would make the whole plan "
        "useless, so the rule is enforced in code, not in the prompt.",

        "<b>Extraction is a first draft.</b> Free vision models misalign columns on "
        "dense grids, so every extracted class is editable before it is saved. Wrong "
        "times mean wrong reminders, which is the one thing this app cannot get wrong.",
    ]))

    s.append(PageBreak())

    # ------------------------------------------------------------ challenges
    s.append(para("4.  Engineering challenges", "h1"))
    s.append(para("These are the problems that took real work. Each was diagnosed "
                  "by measurement rather than guesswork, and the figures below are "
                  "the actual numbers observed.", "lead"))

    s.append(challenge(
        1, "Slate cannot be read by a server",
        "Slate sits behind Cloudflare, which rejects server-to-server requests. A "
        "plain request for the calendar returns 403 no matter what headers are sent. "
        "Requests from an extension's own origin are refused too.",
        "What Cloudflare does allow is a real page asking for its own data. A browser "
        "extension finds or briefly opens a Slate tab and runs the fetch inside that "
        "page, where it is a genuine same-origin request. This is not a way around a "
        "security control: it is the student's own browser fetching the student's own "
        "calendar, which is exactly what is meant to be allowed.",
    ))

    s.append(challenge(
        2, "The AI provider was blocked in Pakistan",
        "Google's Gemini API returned 403 from two separate cloud projects. The cause "
        "was regional: the developer API refuses requests from some countries, "
        "Pakistan included.",
        "Routed every model call through OpenRouter, which proxies models from "
        "anywhere and offers a free tier. No paid service is used anywhere in the "
        "project.",
    ))

    s.append(challenge(
        3, "Free AI models are unreliable, and fail silently",
        "The study planner stopped working with no code change. Testing all 19 free "
        "models against the real prompt showed the entire model chain had died: two "
        "of the three timed out past 75 seconds every single run. One pool answered a "
        "question correctly and returned a payment error three minutes later.",
        "Requests now race the whole chain at once and take the first usable answer, "
        "with a per-call timeout so one stalled pool cannot hold the request open. A "
        "diagnostic script re-measures which pools are alive. Free models also "
        "truncate mid-JSON constantly, so a repairing parser closes the object and "
        "keeps what survived rather than discarding the answer.",
        "Before:  every request timed out, then failed\n"
        "After:   a complete study plan in 3.5 seconds",
    ))

    s.append(PageBreak())

    s.append(challenge(
        4, "A timetable grid loses its meaning as text",
        "Extracting the text layer from a timetable PDF returned zero usable classes. "
        "Which day and period a class occupies is carried by its position in a grid, "
        "and reading the text throws that away.",
        "PDFs are rasterised to images and read by a vision model, so the layout is "
        "actually seen. Accuracy is treated as a first draft: the student reviews and "
        "corrects every row before anything is saved.",
    ))

    s.append(challenge(
        5, "The reminder scheduler was barely running",
        "A student with four classes received one notification. The scheduling logic "
        "was correct; the job simply was not running. GitHub Actions was asked to run "
        "every ten minutes and its actual history told a different story.",
        "Reminders moved into the database itself, where pg_cron fires every five "
        "minutes with nothing in between to deprioritise it. The GitHub workflow "
        "stayed as a second, independent trigger, and because every reminder is "
        "claimed in the database before it is sent, two triggers can never "
        "double-send. A reminder that arrives late is now sent anyway, worded "
        "honestly, because silence is the only outcome with no value.",
        "Requested:  every 10 minutes  (144 runs a day)\n"
        "26 August:  about 30 runs\n"
        "27 August:  3 runs        00:48, 10:36, 20:43\n"
        "28 August:  1 run         04:29\n"
        "\n"
        "After pg_cron:  09:05:00, 09:10:00, ... exactly on time",
    ))

    s.append(challenge(
        6, "Syncing only worked when Slate was already open",
        "The extension opens its own Slate tab in the background when none exists, "
        "and that path failed with 403 while a tab opened by hand worked perfectly.",
        "Chrome throttles background tabs to roughly one timer tick per second, and "
        "Cloudflare's browser check depends on timers, so a hidden tab clears far more "
        "slowly than a visible one. The fetch was going out before clearance landed. "
        "The extension now waits until the page is genuinely Moodle rather than merely "
        "not a challenge, and retries once.",
    ))

    s.append(PageBreak())

    s.append(challenge(
        7, "Half the screen turned black on mobile",
        "Intermittently, on phones only, a black rectangle covered part of the page.",
        "The dashboard kept a permanently animating 3D layer alive, wrapping an "
        "element with a backdrop blur, beside two large blur filters. WebKit re-tiles "
        "those layers as the animation runs and, under the memory pressure a phone "
        "reaches long before a laptop, hands back a tile it never painted. An "
        "unpainted tile is black. All of it is now disabled on touch screens, where "
        "none of that depth was visible at 390 pixels wide anyway.",
    ))

    s.append(challenge(
        8, "A rate limit that counted every attempt and blocked none",
        "A throttle was added to the device-pairing endpoint. Testing it with 35 wrong "
        "codes produced 35 rejections and a counter still reading zero.",
        "The function incremented a counter and then raised an exception for the "
        "invalid path, and raising aborts the transaction, which rolls back the "
        "increment. It looked exactly like rate limiting from the outside and did "
        "nothing at all. The failure paths now return a value instead of raising, so "
        "the count survives. This is recorded here because it is the most useful "
        "lesson of the project: a security control that is never tested is a control "
        "that may not exist.",
        "Before:  45 wrong codes -> 45 rejected, 0 throttled\n"
        "After:   45 wrong codes -> 40 rejected, 5 throttled",
    ))

    s.append(PageBreak())

    # -------------------------------------------------------------- security
    s.append(para("5.  Security", "h1"))
    s.append(para("The application was audited end to end and every finding was fixed "
                  "and verified against the live system rather than assumed.", "lead"))

    s.append(datatable([
        ["Finding", "Resolution"],
        ["Open redirect in sign-in",
         "A crafted link produced a URL where the real domain was parsed as a username, "
         "sending the student to another site after a genuine Google sign-in. The "
         "destination must now be a path on this site."],
        ["Inline scripts permitted",
         "The content security policy allowed any inline script, which is the exact "
         "attack it exists to stop. Replaced with a cryptographic nonce generated fresh "
         "for every request."],
        ["No response hardening",
         "The app could be framed by any site, which matters because one click inside it "
         "signs you out. Added clickjacking, MIME and referrer protections."],
        ["Weak pairing codes",
         "Eight characters, roughly 4 billion combinations. Now twelve, roughly 280 "
         "trillion."],
        ["No rate limiting anywhere",
         "One student could exhaust the shared AI quota for the whole university. Limits "
         "now live in the database, because the app runs on many instances and one "
         "endpoint bypasses the app entirely."],
        ["Permanent device credentials",
         "Sync tokens never expired and could not be revoked. They now expire when "
         "unused, every account can remove its own, and an activity log records it."],
        ["Unbounded calendar import",
         "One crafted calendar could insert roughly ten thousand rows and exhaust the "
         "free-tier database. Capped, and refused rather than silently truncated."],
        ["Unrestricted calendar link",
         "The extension fetched whatever address it was given from inside a logged-in "
         "Slate page, including addresses on the student's home network. It must now be "
         "Slate itself."],
    ], [40 * mm, 130 * mm]))

    s.append(Spacer(1, 4))
    s.append(para("Two properties are proven rather than assumed. The public database "
                  "key ships in every browser by design, so its inability to read "
                  "anything is tested against the live database. And student A being "
                  "unable to read student B's data is demonstrated by impersonating a "
                  "real signed-in session in Postgres.", "body"))

    s.append(code(
        "victim owns:      14 classes, 4 devices, 3 push subscriptions\n"
        "attacker sees:     0          0          0\n"
        "attacker's own:   12 deadlines, 11 classes   (the session works)\n"
        "\n"
        "update victim's rows -> 0    insert as victim -> refused"
    ))

    s.append(PageBreak())

    # --------------------------------------------------------------- testing
    s.append(para("6.  Testing", "h1"))
    s.append(para("176 automated checks run from one command, plus live checks against "
                  "the production database. The scheduling rules and the attendance "
                  "arithmetic are pure functions specifically so they can be tested "
                  "without a database, a browser or a phone.", "lead"))

    s.append(datatable([
        ["What is checked", "Why it earns its place"],
        ["Reminder scheduling",
         "Silent missed reminders are this project's worst failure mode."],
        ["Attendance arithmetic",
         "Off by one here is the difference between sitting an exam and being detained, "
         "so every boundary is asserted against its neighbour."],
        ["Calendar parsing",
         "Real Moodle output, including the quirks that only appear in practice."],
        ["Loose JSON repair",
         "Free models truncate constantly; a partial plan beats an error message."],
        ["Sign-in redirect",
         "Seven attack strings, asserting the host can never change."],
        ["Content security policy",
         "A policy rots quietly; the first assertion is that inline scripts are still "
         "forbidden."],
        ["Extension integrity",
         "Written after a refactor left a function being called that no longer existed - "
         "an error that would only have surfaced when a student pressed sync."],
        ["Cross-user isolation",
         "The single most important property the application has."],
    ], [44 * mm, 126 * mm]))

    s.append(para("7.  Stack and cost", "h1"))

    s.append(datatable([
        ["Layer", "Choice", "Cost"],
        ["Framework", "Next.js 16, App Router, Server Actions", "Free"],
        ["Database", "Supabase Postgres, row-level security on every table", "Free tier"],
        ["Auth", "Supabase Auth with Google OAuth, UOL accounts only", "Free"],
        ["AI", "OpenRouter free models, raced for availability", "Free"],
        ["Notifications", "Web Push with VAPID, no third-party service", "Free"],
        ["Scheduling", "pg_cron in Postgres, GitHub Actions as backup", "Free"],
        ["Hosting", "Vercel", "Free tier"],
    ], [26 * mm, 106 * mm, 38 * mm]))

    s.append(Spacer(1, 5))
    s.append(para("Total running cost is zero. This was a design constraint from the "
                  "start, not an accident, and it is what makes the app something every "
                  "student can use rather than something that needs funding to survive.",
                  "body"))

    s.append(para("8.  Status and what comes next", "h1"))

    s.append(para("<b>Working today.</b> Sign-in restricted to UOL accounts, Slate sync, "
                  "timetable import, dashboard, reminders on phone and laptop, "
                  "attendance tracking, study planner, and Ask Recall. Deployed and in "
                  "daily use.", "body"))

    s.append(para("<b>The most valuable next step is not code.</b> Every feature that "
                  "touches Slate depends on a browser extension on a laptop, purely "
                  "because Cloudflare will not accept a server. If the university "
                  "allowed Recall's server to read the calendar export endpoint, the "
                  "extension would disappear entirely and the app would work identically "
                  "on any phone, with no installation at all. That is a permission "
                  "question rather than an engineering one, and it is the single "
                  "biggest improvement available.", "body"))

    s.append(Spacer(1, 4))
    s.append(para("Built by Muazzam Ali, a University of Lahore student, for University "
                  "of Lahore students.", "caption"))

    doc.build(s)
    print(f"written: {OUT}")
    print(f"size: {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    build()
