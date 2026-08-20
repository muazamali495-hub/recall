import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { Landing } from "./landing";

export default async function Home() {
  const user = await getCurrentUser();

  // Signed-in students go straight to their week — the marketing page is for
  // people who haven't joined yet.
  if (user) redirect("/dashboard");

  return <Landing />;
}
