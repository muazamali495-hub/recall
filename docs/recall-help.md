# Recall — Help

## What Recall does

Recall keeps track of your classes, quizzes and assignments so you do not have
to. It reads your deadlines from Slate, reads your timetable from a photo or
PDF, and sends you a notification before each class and before each deadline.
It also tracks your attendance, builds study plans, and answers questions about
your own week.

Everything runs on free services. Recall does not cost anything to use.

## Connecting Slate

Slate sits behind Cloudflare, which refuses requests that do not come from a
real browser. This is why Recall uses a small Chrome extension rather than
reading your calendar from a server: the extension runs the request inside a
Slate page you are already logged in to, which is your own browser fetching
your own calendar.

To connect Slate, install the extension from the Slate page in Recall, then
paste your Slate calendar export link when it asks. The link is stored only in
the extension on your own computer. Recall's server never receives it — only
the deadlines it returns.

## Why my deadlines are not up to date

Recall checks Slate every six hours, but only while Chrome is running on the
computer that has the extension. Chrome does not fire timers when it is closed,
so if that laptop has been shut, no check has happened.

Opening Recall on that computer triggers a check immediately. So does returning
to the laptop after it has been asleep. You can also press "Check now" on the
Slate page.

To keep checking with no Chrome window open, turn on "Continue running
background apps when Google Chrome is closed" in chrome://settings/system. The
computer still has to be awake.

## Why reminders are not arriving

Reminders are sent from Recall's server, not from your laptop, so they arrive
whether or not your computer is on. If they are not arriving, the usual causes
are:

Notifications are switched off for your browser at the operating system level.
On Windows this is in Settings, under Notifications. This is the most common
cause and it is invisible from inside the browser.

Reminders were never turned on for that particular device. Each browser and
each phone registers separately. Open the dashboard on the device you want
notifications on and press "Turn on reminders" there.

You are using Recall in Safari on iPhone without adding it to the Home Screen.
iOS only delivers web notifications to a web app that has been installed to the
Home Screen and runs full screen.

## Installing Recall on iPhone

Open recall-kohl-mu.vercel.app in Safari. Chrome on iOS cannot install web
apps. Press the Share button, then "Add to Home Screen", then Add.

It will open full screen with no browser bar, and it can then receive
notifications. After installing, open the dashboard once and turn reminders on,
because a newly installed web app gets a fresh notification subscription.

## Timetable upload

Upload a photo, screenshot or PDF of your timetable. Recall renders it to an
image and reads the grid with a vision model, then shows you what it found so
you can correct it before saving.

The extracted times are a first draft. Free vision models misalign columns on
dense grids, so check every row before saving. Wrong times mean wrong reminders.

If your timetable covers several sections, type your section name — for example
BSCS-3A — and Recall will read only that row.

## Attendance

University of Lahore requires 75% attendance to sit final examinations. Recall
tracks each course and tells you how many more classes you can miss before
dropping below that line.

Mark each class as you leave it. Recall asks about classes that have already
finished, going back a week so a day off does not lose the count.

Mark a class Cancelled rather than Missed if it did not happen. A cancelled
class counts in neither total, so marking it as missed would count the
department's decision against you.

If you started using Recall part-way through a semester, use "Enter where you
already stand" on each course and put in how many classes you had attended and
how many had been held. Without that the tracker starts from zero and will tell
you that you are fine when you may not be.

You can set a different required percentage per course, for courses that
require 80%.

## Reminder timing

Class reminders arrive 15 minutes before the class starts.

Deadline reminders arrive 24 hours, 2 hours and 30 minutes before a deadline.

A reminder that arrives a little late is still sent, and will say so — for
example "Databases started 8 min ago". Silence is the only outcome with no
value.

## Ask Recall

Ask Recall knows what is due and when you are free, so it can answer questions
about your own week rather than giving generic advice. Ask it what to work on
tonight, or to explain a topic you have a quiz on.

It will not write graded work for you to submit. It will explain the concepts,
work through a similar example, review a draft you wrote, or plan the work with
you.

## The study planner

Give the planner a topic list and it will build a schedule that works around
your actual classes and your other deadlines. Any block that would collide with
a class is removed automatically.

Plans are limited to a few per hour because the AI models are shared between
everyone using Recall.

## Updating the extension

The extension is loaded from a folder on your computer. Reloading it at
chrome://extensions re-reads that folder — it does not download anything. To
update, download the new version, replace the contents of that folder, then
reload.

Keep the same folder location. Chrome identifies an unpacked extension by its
folder path, so moving it makes Chrome treat it as a new extension with empty
storage, and you would have to link it and paste your calendar link again.

Recall tells you on the Slate page when your extension is out of date.

## Privacy

Recall never stores your university password. Sign-in is Google, and the Slate
connection uses a read-only calendar link that stays on your own computer.

Only University of Lahore student accounts can sign in.

Your data is visible only to you. Another student signing in cannot see your
deadlines, timetable or attendance.

Devices that have not synced in 60 days stop working automatically, and you can
remove any device yourself from the Slate page.
