import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { isCompiled } from "../packages/core/src/vfs/home";
import { SUPPORTED_TARGETS, hostTarget } from "../packages/runtime/src/artifact";
import { hostTarget as leafHostTarget } from "../packages/runtime/src/target";
import { COMPILE_FLAGS } from "../scripts/release/compile-flags";

const cli = resolve(import.meta.dir, "../apps/cli/src/index.ts");

describe("CLI start-up", () => {
  it("version prints the same line and JSON through the lazy entry", () => {
    const text = Bun.spawnSync(["bun", cli, "version"], { stdout: "pipe" }).stdout.toString();
    expect(text).toMatch(/^yolo \S+ \(\S+, Bun \S+\)\n$/);
    const json = JSON.parse(
      Bun.spawnSync(["bun", cli, "version", "--json"], { stdout: "pipe" }).stdout.toString(),
    );
    expect(json.schema).toBe("yolo.version/1");
    expect(json.target).toBe(hostTarget());
    expect(json.bunVersion).toBe(Bun.version);
  });

  it("an unknown command still prints the help and exits 1", () => {
    const run = Bun.spawnSync(["bun", cli, "no-such-command"], { stdout: "pipe", stderr: "pipe" });
    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain("Unknown command: no-such-command");
    expect(run.stdout.toString()).toContain("YOLO Industrial Engine CLI");
  });

  it("hostTarget is shared by the leaf module and artifact", () => {
    expect(leafHostTarget).toBe(hostTarget);
    expect(Object.values(SUPPORTED_TARGETS)).toContain(hostTarget());
  });

  it("the source run is not the compiled executable", () => {
    expect(isCompiled()).toBe(false);
  });

  it("release compiles with a bytecode cache and without cwd autoloads", () => {
    expect(COMPILE_FLAGS).toEqual([
      "--bytecode",
      "--no-compile-autoload-dotenv",
      "--no-compile-autoload-bunfig",
    ]);
  });
});
