/**
 * `yolo api`: Thin CLI dispatcher delegating to @aphrody/yolo-core/server.
 */
export * from "../../../packages/core/src/server/http";
import { runApiCommand } from "../../../packages/core/src/server/http";

if (import.meta.main) {
  process.exitCode = await runApiCommand(process.argv.slice(2), process.cwd());
}
