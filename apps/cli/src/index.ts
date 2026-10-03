#!/usr/bin/env bun
/**
 * YOLO Industrial Engine CLI
 * Rule: Uses ONLY local packages (bun, obscura, oxc, typescript, vscode) and Bun built-ins.
 * ZERO external npm dependencies.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dir, "../../..");
const PACKAGES_DIR = resolve(ROOT_DIR, "packages");

export interface SubmoduleStatus {
  readonly name: string;
  readonly path: string;
  readonly exists: boolean;
  readonly headCommit?: string;
  readonly filesCount?: number;
}

export function inspectPackages(): readonly SubmoduleStatus[] {
  const pkgs = ["bun", "obscura", "oxc", "typescript", "vscode"];
  return pkgs.map((name) => {
    const pkgPath = resolve(PACKAGES_DIR, name);
    const exists = existsSync(pkgPath);
    if (!exists) {
      return { name, path: pkgPath, exists: false };
    }

    let headCommit: string | undefined;
    try {
      const gitHead = resolve(ROOT_DIR, ".git/modules/packages", name, "HEAD");
      if (existsSync(gitHead)) {
        const headContent = readFileSync(gitHead, "utf8").trim();
        if (headContent.startsWith("ref:")) {
          const refPath = resolve(
            ROOT_DIR,
            ".git/modules/packages",
            name,
            headContent.replace("ref: ", "").trim(),
          );
          if (existsSync(refPath)) {
            headCommit = readFileSync(refPath, "utf8").trim();
          }
        } else {
          headCommit = headContent;
        }
      }
    } catch {
      // fallback
    }

    return {
      name,
      path: pkgPath,
      exists: true,
      headCommit: headCommit?.slice(0, 10),
    };
  });
}

export async function parseTsSource(filePath: string): Promise<{
  readonly path: string;
  readonly lines: number;
  readonly bytes: number;
  readonly exports: readonly string[];
}> {
  const content = await Bun.file(filePath).text();
  const lines = content.split("\n").length;
  const bytes = Buffer.byteLength(content, "utf8");

  // Programmatic regex token scanner for AST-less zero-dep extraction
  const exportMatches = content.matchAll(
    /export\s+(?:async\s+)?(?:declare\s+)?(?:const|function|class|type|interface|enum)\s+([a-zA-Z0-9_$]+)/g,
  );
  const exports = Array.from(exportMatches, (m) => m[1] ?? "").filter(Boolean);

  return {
    path: filePath,
    lines,
    bytes,
    exports,
  };
}

export function printHelp(): void {
  console.log(`
\x1b[1m\x1b[36mYOLO Industrial Engine CLI\x1b[0m (zero external dependencies)

\x1b[1mUSAGE:\x1b[0m
  yolo <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  \x1b[32mstatus\x1b[0m              Inspect all 5 packages submodules (bun, obscura, oxc, typescript, vscode)
  \x1b[32mparse <file>\x1b[0m        Parse & inspect a TypeScript/JavaScript source file programmatically
  \x1b[32mvscode [action]\x1b[0m     Verify apps/vscode integration against packages/vscode
  \x1b[32mdocs [query]\x1b[0m        Search or inspect version-matched Bun documentation in packages/bun/docs
  \x1b[32mhelp\x1b[0m                Display this help message

\x1b[1mENGINE BASELINE:\x1b[0m
  Runtime: Bun ${Bun.version}
  Engine:  @aphrody/yolo-runtime (Corsa TS7 + Oxc + Obscura)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || "status";

  switch (command) {
    case "status": {
      console.log(`\x1b[1m\x1b[36m=== YOLO Packages Status ===\x1b[0m`);
      const pkgs = inspectPackages();
      for (const p of pkgs) {
        const status = p.exists ? `\x1b[32m[LOADED]\x1b[0m` : `\x1b[31m[MISSING]\x1b[0m`;
        const commit = p.headCommit ? `(${p.headCommit})` : "";
        console.log(`  ${status} packages/${p.name} ${commit}`);
      }
      break;
    }

    case "parse": {
      const target = args[1];
      if (!target) {
        console.error("\x1b[31mError:\x1b[0m Please provide a file to parse.");
        process.exit(1);
      }
      const absPath = resolve(process.cwd(), target);
      if (!existsSync(absPath)) {
        console.error(`\x1b[31mError:\x1b[0m File not found: ${absPath}`);
        process.exit(1);
      }
      const result = await parseTsSource(absPath);
      console.log(`\x1b[1m\x1b[36m=== Parsed Source: ${relative(ROOT_DIR, absPath)} ===\x1b[0m`);
      console.log(`  Lines:   ${result.lines}`);
      console.log(`  Bytes:   ${result.bytes}`);
      console.log(
        `  Exports: ${result.exports.length} symbol(s) [${result.exports.slice(0, 10).join(", ")}${result.exports.length > 10 ? "..." : ""}]`,
      );
      break;
    }

    case "vscode": {
      const vscodePkg = resolve(PACKAGES_DIR, "vscode/package.json");
      const vscodeApp = resolve(ROOT_DIR, "apps/vscode/package.json");
      console.log(`\x1b[1m\x1b[36m=== VS Code App Inspection ===\x1b[0m`);
      if (existsSync(vscodePkg)) {
        const pkg = JSON.parse(readFileSync(vscodePkg, "utf8"));
        console.log(`  Package: ${pkg.name} v${pkg.version}`);
      }
      console.log(
        `  App Symlink: ${existsSync(vscodeApp) ? "\x1b[32mOK\x1b[0m (apps/vscode -> packages/vscode)" : "\x1b[31mFAILED\x1b[0m"}`,
      );
      break;
    }

    case "docs": {
      const docsDir = resolve(PACKAGES_DIR, "bun/docs");
      const query = args[1]?.toLowerCase();
      console.log(`\x1b[1m\x1b[36m=== Bun Docs Corpus ===\x1b[0m`);
      if (!existsSync(docsDir)) {
        console.log(`  \x1b[31mDocs not found at ${docsDir}\x1b[0m`);
        break;
      }
      if (!query) {
        const pages = readdirSync(docsDir).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));
        console.log(`  Docs directory: packages/bun/docs (${pages.length} root items)`);
      } else {
        console.log(`  Searching for "${query}"...`);
        const results: string[] = [];
        function scan(dir: string) {
          for (const ent of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, ent.name);
            if (ent.isDirectory()) scan(full);
            else if (ent.isFile() && ent.name.toLowerCase().includes(query)) {
              results.push(relative(docsDir, full));
            }
          }
        }
        scan(docsDir);
        console.log(`  Found ${results.length} match(es):`);
        for (const r of results.slice(0, 10)) {
          console.log(`    - ${r}`);
        }
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
