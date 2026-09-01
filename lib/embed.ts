/**
 * Turns text into a vector, locally.
 *
 * all-MiniLM-L6-v2 runs on the machine rather than behind an API, which is the
 * only reason document search is affordable here: there is no per-query bill
 * and no third party seeing what students ask about their own university.
 *
 * Measured on this project: 217ms to load the model from cache, 5ms per
 * embedding afterwards. The load happens once per warm server, so the cost
 * lands on a cold start rather than on every question.
 */

// Imported lazily, and declared in serverExternalPackages, for the same reason
// pdfjs is: the library is 117MB with native ONNX binaries, and bundling it
// would drag that into every route rather than the one that needs it.
type Extractor = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array }>;

let extractor: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    extractor = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");

      // Fetch from the hub rather than looking for a local checkout that does
      // not exist in a deployed bundle.
      env.allowLocalModels = false;

      return (await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
      )) as unknown as Extractor;
    })();
  }

  return extractor;
}

/** The dimensionality the database column expects. */
export const EMBEDDING_DIMS = 384;

/**
 * Embeds one piece of text.
 *
 * Mean pooling and normalisation are not optional: the database compares with
 * cosine distance, which assumes unit vectors, and un-normalised vectors would
 * make every similarity score quietly wrong rather than obviously broken.
 */
export async function embed(text: string): Promise<number[]> {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new Error("Nothing to embed.");

  const extract = await getExtractor();
  const output = await extract(trimmed, { pooling: "mean", normalize: true });

  return Array.from(output.data);
}
