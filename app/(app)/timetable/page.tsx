import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { TimetableUpload } from "./timetable-upload";

export default async function TimetablePage() {
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) redirect("/");

  const { count } = await supabase
    .from("class_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-14">

      <h1 className="mb-3 text-2xl font-bold tracking-tight">Add your timetable</h1>
      <p className="mb-8 text-sm text-muted">
        Send the timetable from your WhatsApp group straight here. Recall reads
        it and works out your classes, times and rooms.
        {count ? ` You have ${count} classes saved — uploading again replaces them.` : ""}
      </p>

      <TimetableUpload />
    </main>
  );
}
