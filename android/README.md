# Recall for Android

The web app does everything except one thing: fetch deadlines from Slate.

Slate sits behind Cloudflare, which serves a JavaScript challenge to anything
that isn't a real browser. Our server gets `403`. iOS Shortcuts gets the
"Just a moment…" page. Only something with a browser engine can solve the
challenge — which is why the desktop version needs a Chrome extension, and why
this app exists for phones.

**This app is that browser engine.** It loads a Slate page in a hidden WebView,
lets Cloudflare's challenge run exactly as it would in Chrome, then fetches the
calendar with an ordinary same-origin request. Everything else — dashboard,
planner, reminders — is the website, shown in a WebView.

## What it does not do

**It never asks the student to sign into Slate.** The calendar URL carries its
own token and authenticates itself; the browser is only there to satisfy
Cloudflare. No password is entered, stored, or transmitted.

**The calendar URL never leaves the phone.** Only the calendar's *contents* are
sent to Recall — the same promise the browser extension makes.

## Building

Requires JDK 17+ and an Android SDK with platform 35.

```bash
# local.properties must point at your SDK, with FORWARD slashes —
# backslashes are escape characters in .properties files and will
# fail with "The filename, directory name, or volume label syntax is incorrect".
echo "sdk.dir=C:/Users/YOU/AppData/Local/Android/Sdk" > local.properties

java -cp gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain assembleRelease
```

The APK lands in `app/build/outputs/apk/release/`.

It's signed with the debug key so it can be shared directly. **Generate a real
keystore before any Play Store submission.**

## Installing

Send the APK to the phone, open it, and allow installation from unknown
sources when prompted.

## Setup, once installed

1. Open Recall on any device → **Slate** → generate a pairing code
2. Enter that code in the app
3. Paste the Slate calendar URL (Slate → Calendar → Export → Get calendar URL)

After that it syncs every 6 hours via `WorkManager` and shows the website.

## Layout

```
SlateFetcher.kt   the WebView fetch — the only reason this app exists
SyncWorker.kt     periodic sync, uploads to /api/sync
MainActivity.kt   setup screen, then the website
Store.kt          local settings (device token, calendar URL)
Config.kt         server URL and sync interval
```

## Known gaps

- **No launcher icon** — uses Android's default.
- **Debug signing key** — fine for sharing, not for Play.
- **The WebView fetch is unverified on a real device.** The reasoning is sound
  (it's the same mechanism as the working extension) but it has not yet been
  run against Slate from a phone. That is the first thing to test.
