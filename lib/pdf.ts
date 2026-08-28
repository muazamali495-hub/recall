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
  const document = await pdf(bytes, {
    scale: 2,

    // npm audit flags this pdfjs version for GHSA-hq66-cqwq-w95j: a malicious
    // PDF executing JavaScript when `enableScripting` is on. Uploads come from
    // students and could come from anywhere, so it is worth being precise
    // about why that advisory does not reach this code.
    //
    // enableScripting is not a document-loading option at all — it belongs to
    // the annotation layer, and TypeScript rejects it here, which is better
    // evidence than reading the source. Executing a PDF's JavaScript needs the
    // viewer: an annotation layer plus a scripting manager. Rasterising calls
    // getDocument, getPage and render, and nothing else.
    //
    // isEvalSupported IS a load option, and closes the older font-program
    // eval() path. pdf-to-img already forces it false — after spreading these
    // options, so it cannot be turned back on by mistake — but stating it here
    // keeps the intent if that dependency ever stops doing it.
    docInitParams: { isEvalSupported: false },
  });

  const pages: string[] = [];
  for await (const page of document) {
    pages.push(page.toString("base64"));
    if (pages.length >= maxPages) break;
  }

  return pages;
}
