import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Recall",
  description:
    "Never miss another class, quiz, or deadline. Built for University of Lahore students.",
  applicationName: "Recall",
  appleWebApp: {
    // iOS reads this rather than the manifest when deciding whether a
    // home-screen icon opens standalone or in Safari with its chrome.
    capable: true,
    // Without this the name under the icon comes from <title>, which changes
    // per page — installing from the planner would have labelled it "Planner".
    title: "Recall",
    // "black", not "black-translucent". Translucent looks better — the dark
    // page runs edge to edge behind the clock — but it also puts the content
    // under the status bar, which would sit the clock on top of the mobile
    // header and needs safe-area insets on both sticky bars to fix. That is
    // not something I can check without an iPhone in hand, and #0A0D15 is
    // near enough to black that the seam is invisible.
    statusBarStyle: "black",
  },
  other: {
    // Next emits the standardised `mobile-web-app-capable`, and the manifest's
    // display:standalone is what iOS 16.4+ actually reads. This is the legacy
    // spelling, for an iPhone old enough to want it. Harmless if ignored.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  // Colours the browser chrome on Android and the standalone shell elsewhere,
  // so the app does not sit in a white frame.
  themeColor: "#0A0D15",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
