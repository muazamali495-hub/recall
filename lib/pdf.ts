import { pdf } from "pdf-to-img";

/**
 * Turns a PDF into page images.
 *
 * Timetables are grids: which day and period a class sits in is carried by the
 * 2D layout, not the text. Extracting the text layer flattens that away and
 * loses every time — so PDFs have to be *seen*, not read.
 */
export async function renderPdfPages(bytes: Buffer, maxPages = 3): Promise<string[]> {
  // scale 2 keeps small grid text legible without ballooning the payload.
  const document = await pdf(bytes, { scale: 2 });

  const pages: string[] = [];
  for await (const page of document) {
    pages.push(page.toString("base64"));
    if (pages.length >= maxPages) break;
  }

  return pages;
}
