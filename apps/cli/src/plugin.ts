import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { generateUnifiedYoloPlugin } from "../../../packages/plugins/src/index";

export interface PluginCommandOptions {
  readonly target?: string;
  readonly name?: string;
  readonly version?: string;
}

export async function runPluginCommand(args: readonly string[], rootDir: string): Promise<number> {
  const sub = args[0] || "help";

  switch (sub) {
    case "create":
    case "generate": {
      const targetArg = args[1];
      // Default to <rootDir>/plugins/yolo if no target specified
      const targetDir = targetArg
        ? resolve(process.cwd(), targetArg)
        : resolve(rootDir, "plugins", "yolo");

      console.log(`\x1b[1m\x1b[36m=== YOLO Plugin Generator (Native Bun + TS7 + NHITL) ===\x1b[0m`);
      console.log(`  Source Monorepo: ${rootDir}`);
      console.log(`  Target Output:   ${targetDir}`);

      const t0 = Bun.nanoseconds();
      const result = await generateUnifiedYoloPlugin({
        targetDir,
        yoloRoot: rootDir,
        name: "yolo",
        version: "1.0.0",
      });
      const elapsedMs = ((Bun.nanoseconds() - t0) / 1_000_000).toFixed(2);

      console.log(
        `  \x1b[32m✔ Successfully generated ${result.filesGenerated.length} plugin files in ${elapsedMs} ms\x1b[0m`,
      );
      for (const file of result.filesGenerated) {
        console.log(`    - ${file}`);
      }
      return 0;
    }

    case "status":
    case "list": {
      const pluginsDir = resolve(rootDir, "plugins");
      console.log(`\x1b[1m\x1b[36m=== YOLO Local Plugins ===\x1b[0m`);
      if (!existsSync(pluginsDir)) {
        console.log(`  No local plugins directory found at ${pluginsDir}`);
        return 0;
      }
      const glob = new Bun.Glob("*/plugin.json");
      const found: string[] = [];
      for (const manifest of glob.scanSync({ cwd: pluginsDir, onlyFiles: true })) {
        found.push(manifest);
      }
      console.log(`  Found ${found.length} local plugin(s) in ${pluginsDir}`);
      for (const item of found) {
        console.log(`    - ${item}`);
      }
      return 0;
    }

    case "help":
    default: {
      console.log(`\x1b[1m\x1b[36mYOLO Plugin Command\x1b[0m

USAGE:
  yolo plugin <create|generate|status> [target_dir]

COMMANDS:
  create [dir]    Autonomously generate unified YOLO & Bun-TS7 plugin into plugins/ or target directory
  status          List local plugins and manifests in yolo/plugins
  help            Display this help message
`);
      return 0;
    }
  }
}
