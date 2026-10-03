/**
 * Registers the `runtime:*` specifiers as virtual modules. Load it with `preload` in bunfig.toml
 * (done at the repository root) or `bun --preload @aphrody/runtime-sdk/preload`.
 */
import { plugin } from "bun";
import { processes, RESERVED_MODULES, system } from "./modules";

plugin({
  name: "yolo-runtime",
  setup(build) {
    build.module("runtime:system", () => ({ exports: { system }, loader: "object" }));
    build.module("runtime:process", () => ({ exports: { processes }, loader: "object" }));
    for (const specifier of RESERVED_MODULES) {
      build.module(specifier, () => {
        throw new Error(
          `${specifier} is not available yet: it is delivered with a later runtime phase (see docs/DECISIONS.md)`,
        );
      });
    }
  },
});
