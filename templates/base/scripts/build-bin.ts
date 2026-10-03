// Compiles the server into one executable (Bun embedded) at dist/__NAME__.
import { runtimeBundlerPlugin } from "@aphrody/runtime-sdk/bundler";

const result = await Bun.build({
  entrypoints: ["src/server.ts"],
  plugins: [runtimeBundlerPlugin],
  target: "bun",
  minify: true,
  compile: { outfile: "dist/__NAME__" },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log("built dist/__NAME__");
