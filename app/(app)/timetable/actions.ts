"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractTimetable, LlmNotConfigured, type ExtractedClass } from "@/lib/vision";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export type ExtractState = {
  classes?: ExtractedClass[];
  section?: string;
  error?: string;
} | null;

/**
 * Reads the uploaded timetable but does NOT save it.
 *
 * Free vision models misalign columns on dense grids often enough that the
 * result has to be treated as a first draft. The student edits and confirms
 * before any of it becomes their schedule.
 */
export async function extractTimetableAction(
  _prev: ExtractState,
  formData: FormData,
): Promise<ExtractState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Please sign in again." };

  const section = String(formData.get("section") ?? "").trim();
  const file = formData.get("timetable");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a timetable file to upload.", section };
  }
  if (file.size > MAX_BYTES) {
    return { error: "That file is over 8 MB. Try a smaller photo or screenshot.", section };
  }
  if (!ALLOWED.includes(file.type)) {
    return { error: "Upload a PNG, JPG, WEBP or PDF.", section };
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    // A PDF grid has to be seen, not read — its text layer has no times in it.
    //
    // Loaded only when a PDF actually arrives: pdfjs needs a canvas backend and
    // throws on import if it cannot find one, which previously broke image
    // uploads as collateral damage.
    let images: string[];

    if (file.type === "application/pdf") {
      const { renderPdfPages } = await import("@/lib/pdf");
      images = await renderPdfPages(bytes);
    } else {
      images = [bytes.toString("base64")];
    }

    if (images.length === 0) {
      return { error: "That PDF appears to be empty.", section };
    }

    const classes = await extractTimetable(images, section);

    if (classes.length === 0) {
      return {
        error: section
          ? `No classes found for "${section}". Check the section name matches the timetable exactly.`
          : "No classes found. Make sure the whole timetable is visible.",
        section,
      };
    }

    return { classes, section };
  } catch (err) {
    if (err instanceof LlmNotConfigured) {
      return { error: "Timetable reading isn't set up yet. Add OPENROUTER_API_KEY to .env.local.", section };
    }
    return { error: err instanceof Error ? err.message : "Could not read that timetable.", section };
  }
}

export type SaveState = { saved?: number; error?: string } | null;

/** Replaces the student's timetable with the confirmed rows. */
export async function saveTimetableAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Please sign in again." };

  let classes: ExtractedClass[];
  try {
    classes = JSON.parse(String(formData.get("classes") ?? "[]"));
  } catch {
    return { error: "Something went wrong. Please upload the timetable again." };
  }

  if (!Array.isArray(classes) || classes.length === 0) {
    return { error: "Nothing to save." };
  }

  // A timetable is replaced wholesale, not merged — otherwise re-uploading a
  // corrected version would leave the old wrong rows behind.
  const { error: clearError } = await supabase
    .from("class_sessions")
    .delete()
    .eq("user_id", user.id);

  if (clearError) return { error: "Could not update your timetable. Please try again." };

  const { error: insertError } = await supabase.from("class_sessions").insert(
    classes.map((c) => ({
      user_id: user.id,
      course: c.course,
      day_of_week: c.day_of_week,
      start_time: c.start_time,
      end_time: c.end_time || null,
      room: c.room || null,
    })),
  );

  if (insertError) return { error: "Could not save your timetable. Please try again." };

  revalidatePath("/dashboard");
  return { saved: classes.length };
}
