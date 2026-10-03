/**
 * `yolo verify`: Thin CLI dispatcher delegating to @aphrody/yolo-core/verify.
 */
export * from "../../../packages/core/src/verify/engine";
import { runVerifyCommand } from "../../../packages/core/src/verify/engine";

if (import.meta.main) {
  process.exitCode = await runVerifyCommand(process.argv.slice(2), process.cwd());
}
