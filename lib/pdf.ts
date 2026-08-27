/**
 * Turns a PDF into page images.
 *
 * Timetables are grids: which day and period a class sits in is carried by the
 * 2D layout, not the text. Extracting the text layer flattens that away and
 * loses every time — so PDFs have to be *seen*, not read.
 */
export async function renderPdfPages(bytes: Buffer, maxPages = 3): Promise<string[]> {
  // Imported here rather than at module scope on purpose. pdfjs reaches for a
  // canvas backend the moment it loads, and if that fails it throws
  // "DOMMatrix is not defined" — which took down image uploads too, because
  // merely importing this file was enough to crash the whole action.
  const { pdf } = await import("pdf-to-img");

  // scale 2 keeps small grid text legible without ballooning the payload.
  const document = await pdf(bytes, { scale: 2 });

  const pages: string[] = [];
  for await (const page of document) {
    pages.push(page.toString("base64"));
    if (pages.length >= maxPages) break;
  }

  return pages;
}
