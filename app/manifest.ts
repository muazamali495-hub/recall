import type { MetadataRoute } from "next";

/**
 * Makes Recall installable as a real app rather than a bookmark.
 *
 * There was no manifest at all before, which on iOS is the difference between
 * a home-screen icon that opens Safari with its address bar and tab strip, and
 * one that opens Recall full-screen. It also matters for push: iOS only
 * delivers web notifications to a web app that has been added to the Home
 * Screen and runs standalone.
 *
 * `name` is what the App Switcher shows; `short_name` is what fits under the
 * icon, and iOS truncates hard, so it is one word.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Recall — for UOL",
    short_name: "Recall",
    description:
      "Never miss another class, quiz, or deadline. Built for University of Lahore students.",
    start_url: "/dashboard",
    // Opening on the dashboard rather than the landing page: someone who has
    // installed it has already signed up, and the marketing page is not what
    // they tapped the icon for.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // background_color paints the launch screen, so it matches the app's own
    // background — otherwise every cold start flashes white first.
    background_color: "#0A0D15",
    theme_color: "#0A0D15",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops to the launcher's shape; this one has the safe-zone
      // padding so the logo never gets its edges cut off.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
