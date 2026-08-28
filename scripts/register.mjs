// Installs the resolver hook. Use with:
//   node --import ./scripts/register.mjs --env-file=.env.local scripts/<test>.ts
import { register, registerHooks } from "node:module";
import { resolve } from "./ts-resolve.mjs";

// registerHooks runs the hook in-thread and is the supported API; register()
// is deprecated but is the only one older Node has.
if (typeof registerHooks === "function") {
  registerHooks({ resolve });
} else {
  register("./ts-resolve.mjs", import.meta.url);
}
