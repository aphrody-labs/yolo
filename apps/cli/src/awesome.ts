/**
 * `yolo awesome`: Thin CLI dispatcher delegating to @aphrody/yolo-core/curation.
 */
export * from "../../../packages/core/src/curation/awesome";
import { runAwesomeCommand } from "../../../packages/core/src/curation/awesome";

if (import.meta.main) {
  process.exitCode = await runAwesomeCommand(process.argv.slice(2), process.cwd());
}
