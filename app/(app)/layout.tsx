import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";

/**
 * Shell for everything behind sign-in.
 *
 * The auth check lives here rather than in each page, so a new feature can't
 * accidentally ship without one.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <Sidebar name={profile?.full_name ?? null} email={user.email ?? ""} />

      {/* Offset matches the fixed sidebar's width on desktop. */}
      <div className="flex-1 lg:pl-60">{children}</div>
    </div>
  );
}
