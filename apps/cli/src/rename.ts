/**
 * `yolo rename`: Thin CLI dispatcher delegating to @aphrody/yolo-core/curation.
 */
export * from "../../../packages/core/src/curation/rename";
import { runRenameCommand } from "../../../packages/core/src/curation/rename";

if (import.meta.main) {
  process.exitCode = await runRenameCommand(process.argv.slice(2), process.cwd());
}
