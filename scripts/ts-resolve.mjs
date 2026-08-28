/**
 * Lets the test scripts import the app's own modules unchanged.
 *
 * The app imports the way Next expects — `from "./json"`, no extension —
 * because the bundler resolves it. Node, running a script directly, does not:
 * it wants the real filename. Rather than sprinkle `.ts` through production
 * imports to suit the tests, this fills the gap on the test side only.
 */
import { dirname, resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export function resolve(specifier, context, next) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");

  if (relative && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
    const from = dirname(fileURLToPath(context.parentURL));

    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const candidate = resolvePath(from, specifier + ext);
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }

  return next(specifier, context);
}
