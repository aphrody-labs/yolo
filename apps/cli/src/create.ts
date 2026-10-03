/**
 * `yolo create`: Thin CLI dispatcher delegating to @aphrody/yolo-core/scaffold.
 */
export * from "../../../packages/core/src/scaffold/create";
import { runCreateCommand } from "../../../packages/core/src/scaffold/create";

if (import.meta.main) {
  process.exitCode = await runCreateCommand(process.argv.slice(2), process.cwd());
}
