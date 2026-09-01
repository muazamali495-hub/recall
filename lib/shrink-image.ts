/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * A timetable photographed on a phone is routinely 3-5MB and 4000px wide.
 * None of that helps: the vision model reads a grid, and a 1800px image shows
 * the same grid. Sending the original costs the student upload time on a
 * mobile connection, costs the server a larger request, and made uploads fail
 * outright until the Server Action body limit was raised.
 *
 * Nothing is guessed about the outcome — if shrinking does not actually make
 * the file smaller, the original is kept.
 */

/** Long edge, in pixels. Comfortably enough to read small text in a grid. */
const MAX_EDGE = 1800;

/** Files under this are left alone; re-encoding them would only lose detail. */
const LEAVE_ALONE = 900 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  // PDFs are rendered server-side and cannot be resized here. Small images are
  // already fine.
  if (!file.type.startsWith("image/") || file.size <= LEAVE_ALONE) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // Already small enough in dimensions; re-encoding would only degrade it.
    if (scale === 1 && file.size <= LEAVE_ALONE * 3) {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    // Grid lines and small room codes are exactly what suffers from a cheap
    // downscale, and they are the parts the model has to read.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );

    // If the "smaller" version is not smaller, it is not an improvement.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // Any failure here means uploading the original, which is the behaviour
    // before this existed. Shrinking is an optimisation, never a gate.
    return file;
  }
}
