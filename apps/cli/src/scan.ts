/**
 * `yolo scan`: Fast, parallel, recursive repository and directory scanner.
 * Thin CLI dispatcher delegating to @aphrody/yolo-core/vfs.
 */
import { resolve } from "node:path";
import {
  scanDirectory,
  renderScanMarkdown,
  renderScanTerminal,
  formatBytes,
  type ExtensionStat,
  type FileEntry,
  type ScanReport,
  type ScanOptions,
} from "../../../packages/core/src/vfs/scan";

export {
  scanDirectory,
  renderScanMarkdown,
  renderScanTerminal,
  formatBytes,
  type ExtensionStat,
  type FileEntry,
  type ScanReport,
  type ScanOptions,
};

export async function runScanCommand(
  args: readonly string[],
  root: string,
  out: (s: string) => void = console.log,
): Promise<number> {
  const has = (flag: string): boolean => args.includes(flag);
  const getOpt = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  let target = root;
  for (const arg of args) {
    if (!arg.startsWith("-")) {
      target = resolve(process.cwd(), arg);
      break;
    }
  }

  const extsOpt = getOpt("--exts");
  const exts = extsOpt ? extsOpt.split(",").map((s) => s.trim()) : undefined;
  const excludeOpt = getOpt("--exclude");
  const exclude = excludeOpt ? excludeOpt.split(",").map((s) => s.trim()) : undefined;
  const parallelOpt = getOpt("--parallel");
  const parallel = parallelOpt ? parseInt(parallelOpt, 10) : undefined;

  try {
    const report = await scanDirectory(target, { exts, exclude, parallel });
    if (has("--json")) {
      out(JSON.stringify(report, null, 2));
    } else if (has("--md")) {
      out(renderScanMarkdown(report));
    } else {
      out(renderScanTerminal(report));
    }
    return 0;
  } catch (err) {
    console.error(`yolo scan error: ${(err as Error).message}`);
    return 1;
  }
}

if (import.meta.main) {
  void runScanCommand(process.argv.slice(2), process.cwd()).then((code) => {
    process.exitCode = code;
  });
}
