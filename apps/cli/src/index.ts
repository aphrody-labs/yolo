#!/usr/bin/env bun
/**
 * YOLO Industrial Engine CLI & Autonomous Monorepo Generator
 * Fully leveraging native Bun 1.4+ features:
 * - Bun.file & Bun.write for zero-copy I/O
 * - Bun.Glob for native multithreaded directory traversal across submodules
 * - Bun.hash (wyhash, crc32, cityHash, rapidhash) for instant checksumming
 * - Bun.TOML, Bun.JSONL, Bun.JSON5, Bun.XML for configuration & structured parsing
 * - Bun.markdown for native GFM rendering
 * - Bun.nanoseconds for sub-microsecond precision benchmarking
 * - Bun.stringWidth & Bun.sliceAnsi for terminal presentation
 * - ZERO external runtime npm dependencies
 */

import { existsSync, renameSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { runAwesomeCommand } from "./awesome";
import { runCreateCommand } from "./create";
import { runDoctor, runRuntimeCommand, runUninstall, runUpgrade, runVersion } from "./distribution";
import { runAphrodyCommand } from "./aphrody";
import { runHostCommand } from "./host";
import { runVerifyCommand } from "./verify";
import { findCheckout, isCompiled, yoloHome } from "./home";
import { runImportCommand } from "./import";
import { runPluginCommand } from "./plugin";
import { runRenameCommand } from "./rename";

const ROOT_DIR = yoloHome();
const VENDOR_DIR = resolve(ROOT_DIR, "vendor");

export interface SubmoduleStatus {
  readonly name: string;
  readonly path: string;
  readonly exists: boolean;
  readonly headCommit?: string | undefined;
  readonly filesCount?: number | undefined;
  readonly hash?: string | undefined;
}

export interface TsParseResult {
  readonly path: string;
  readonly lines: number;
  readonly bytes: number;
  readonly checksum: string;
  readonly exports: readonly string[];
  readonly imports: readonly string[];
  readonly parseTimeMs: number;
}

export interface WorkspaceCargoSummary {
  readonly resolver: string;
  readonly members: readonly string[];
  readonly releaseProfile: Record<string, unknown>;
}

export interface BunApiDomain {
  readonly id: "web_api" | "server" | "react" | "css" | "img" | "json" | "markdown";
  readonly title: string;
  readonly description: string;
  readonly docMatches: readonly string[];
  readonly typeMatches: readonly string[];
  readonly keyApis: readonly string[];
}

export interface AutonomousGenerationReport {
  readonly generatedAt: string;
  readonly bunVersion: string;
  readonly bunRevision: string;
  readonly targetCatalogPath: string;
  readonly domains: readonly BunApiDomain[];
  readonly totalDocFilesIndexed: number;
  readonly totalTypeFilesIndexed: number;
  readonly elapsedMs: number;
}

/** The git directory of a checkout: `.git` is a directory, or a `gitdir:` file for a submodule. */
async function resolveGitDir(worktree: string): Promise<string> {
  const dotGit = resolve(worktree, ".git");
  if (!statSync(dotGit).isFile()) return dotGit;
  const pointer = (await Bun.file(dotGit).text()).trim().replace(/^gitdir:\s*/, "");
  return resolve(worktree, pointer);
}

/**
 * Inspect monorepo submodules and forks using Bun file I/O & wyhash checksums.
 */
export async function inspectPackages(): Promise<readonly SubmoduleStatus[]> {
  const pkgs = [
    "bun",
    "obscura",
    "tauri",
    "plugins-workspace",
    "create-tauri-app",
    "wry",
    "tao",
    "next",
  ];
  const results: SubmoduleStatus[] = [];

  for (const name of pkgs) {
    const pkgPath = resolve(VENDOR_DIR, name);
    const exists = existsSync(pkgPath);
    if (!exists) {
      results.push({ name, path: pkgPath, exists: false });
      continue;
    }

    let headCommit: string | undefined;
    try {
      const gitDir = await resolveGitDir(pkgPath);
      const headContent = (await Bun.file(resolve(gitDir, "HEAD")).text()).trim();
      if (headContent.startsWith("ref:")) {
        const refFile = Bun.file(resolve(gitDir, headContent.replace("ref:", "").trim()));
        if (await refFile.exists()) headCommit = (await refFile.text()).trim();
      } else {
        headCommit = headContent;
      }
    } catch {
      // Fallback if git metadata is structured differently
    }

    // Fast file count via Bun.Glob
    let filesCount = 0;
    try {
      const glob = new Bun.Glob("**/*");
      for (const _ of glob.scanSync({ cwd: pkgPath, onlyFiles: true, dot: false })) {
        filesCount++;
        if (filesCount >= 500) break; // Sample capped for instant CLI speed
      }
    } catch {
      // Ignore if unreadable
    }

    results.push({
      name,
      path: pkgPath,
      exists: true,
      headCommit: headCommit?.slice(0, 10),
      filesCount,
    });
  }

  return results;
}

/**
 * Parses and analyzes a TypeScript/JavaScript source file using Bun native text buffer,
 * regex token extraction, and wyhash fingerprinting.
 */
export async function parseTsSource(filePath: string): Promise<TsParseResult> {
  const t0 = Bun.nanoseconds();
  const file = Bun.file(filePath);
  const content = await file.text();
  const bytes = file.size;
  const lines = content.split("\n").length;

  // Bun native wyhash checksum
  const checksum = Bun.hash.wyhash(content).toString(16);

  // Extract exported symbols
  const exportMatches = content.matchAll(
    /export\s+(?:async\s+)?(?:declare\s+)?(?:const|function|class|type|interface|enum)\s+([a-zA-Z0-9_$]+)/g,
  );
  const exports = Array.from(exportMatches, (m) => m[1] ?? "").filter(Boolean);

  // Extract imported specifiers
  const importMatches = content.matchAll(/from\s+["']([^"']+)["']/g);
  const imports = Array.from(importMatches, (m) => m[1] ?? "").filter(Boolean);

  const parseTimeMs = Number(((Bun.nanoseconds() - t0) / 1_000_000).toFixed(3));

  return {
    path: filePath,
    lines,
    bytes,
    checksum,
    exports,
    imports,
    parseTimeMs,
  };
}

/**
 * Parses root Cargo.toml using native Bun.TOML parser.
 */
export interface VendorSourceStatus {
  readonly name: string;
  readonly lockedSha: string;
  readonly headSha: string | undefined;
  readonly inSync: boolean;
}

/** Compares `vendor.lock` with the current HEAD of each vendored submodule. */
export async function readVendorStatus(): Promise<{
  crates: number;
  sources: readonly VendorSourceStatus[];
} | null> {
  const lockFile = Bun.file(resolve(ROOT_DIR, "vendor.lock"));
  if (!(await lockFile.exists())) return null;
  const lock = (await lockFile.json()) as {
    sources: { name: string; sha: string }[];
    crates: unknown[];
  };
  const pkgs = await inspectPackages();
  return {
    crates: lock.crates.length,
    sources: lock.sources.map((source) => {
      const headSha = pkgs.find((p) => p.name === source.name)?.headCommit;
      return {
        name: source.name,
        lockedSha: source.sha,
        headSha,
        // `headCommit` is abbreviated for display; the lock holds the full SHA
        inSync: headSha !== undefined && source.sha.startsWith(headSha),
      };
    }),
  };
}

export async function readWorkspaceCargo(): Promise<WorkspaceCargoSummary | null> {
  try {
    const cargoFile = Bun.file(resolve(ROOT_DIR, "Cargo.toml"));
    if (!(await cargoFile.exists())) return null;
    const tomlContent = await cargoFile.text();
    const parsed = Bun.TOML.parse(tomlContent) as {
      workspace?: {
        resolver?: string;
        members?: string[];
      };
      profile?: {
        release?: Record<string, unknown>;
      };
    };

    return {
      resolver: parsed.workspace?.resolver ?? "3",
      members: parsed.workspace?.members ?? [],
      releaseProfile: parsed.profile?.release ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * Autonomous Code Generation Engine:
 * Scans vendor/bun upstream (bun-types, docs, runtime features)
 * for Web APIs, Server, React, CSS, Image, JSON/Data, and Markdown,
 * and compiles an exhaustive TypeScript self-generating capability catalog in apps/web/src/.
 */
/**
 * The catalog is tracked and checked by `fmt-check`: it is formatted with the oxfmt pinned in package.json, and the
 * file is only replaced when more than its timestamps changed, so regenerating it (the tests do) never dirties the
 * tree.
 */
async function writeTrackedCatalog(targetPath: string, content: string): Promise<void> {
  const draft = targetPath.replace(/\.ts$/, ".draft.ts");
  await Bun.write(draft, content);
  const bun = Bun.which("bun") ?? process.execPath;
  Bun.spawnSync([bun, "x", "--bun", "oxfmt", draft], {
    cwd: ROOT_DIR,
    stdout: "ignore",
    stderr: "ignore",
  });
  const withoutTimestamps = (text: string): string =>
    text.replace(/^ \* Timestamp: .*$/m, "").replace(/generatedAt: "[^"]*"/, "");
  const next = await Bun.file(draft).text();
  const previous = existsSync(targetPath) ? await Bun.file(targetPath).text() : "";
  if (withoutTimestamps(previous) === withoutTimestamps(next)) rmSync(draft);
  else renameSync(draft, targetPath);
}

export async function generateBunCatalog(): Promise<AutonomousGenerationReport> {
  const t0 = Bun.nanoseconds();
  const bunRepoDir = resolve(ROOT_DIR, "vendor/bun");
  const bunDocsDir = resolve(bunRepoDir, "docs");
  const bunTypesDir = resolve(bunRepoDir, "packages/bun-types");

  const globDocs = new Bun.Glob("**/*.md*");
  const globTypes = new Bun.Glob("*.d.ts");

  const allDocs = existsSync(bunDocsDir)
    ? Array.from(globDocs.scanSync({ cwd: bunDocsDir, onlyFiles: true })).sort()
    : [];
  const allTypes = existsSync(bunTypesDir)
    ? Array.from(globTypes.scanSync({ cwd: bunTypesDir, onlyFiles: true })).sort()
    : [];

  const domains: BunApiDomain[] = [
    {
      id: "web_api",
      title: "Web Standards & Browser Parity",
      description:
        "Standards-compliant Fetch, Request/Response, Streams, Web Crypto, WebSockets, Worker, and EventTarget",
      docMatches: allDocs.filter((d) =>
        /web-apis|fetch|stream|websocket|worker|crypto|event/i.test(d),
      ),
      typeMatches: allTypes.filter((t) => /fetch|globals|bun\.d\.ts/i.test(t)),
      keyApis: [
        "fetch",
        "Response",
        "Request",
        "ReadableStream",
        "WebSocket",
        "crypto.subtle",
        "Worker",
        "EventTarget",
      ],
    },
    {
      id: "server",
      title: "Native HTTP Server & WebSockets",
      description:
        "High-performance Bun.serve with zero-copy routing, SSE streams, backpressure WebSocket, and TLS",
      docMatches: allDocs.filter((d) => /server|http|websocket|route|listen/i.test(d)),
      typeMatches: allTypes.filter((t) => /serve|devserver/i.test(t)),
      keyApis: ["Bun.serve", "Bun.listen", "ServerWebSocket", "Response.json", "Response.redirect"],
    },
    {
      id: "react",
      title: "React & JSX Engine",
      description:
        "Direct JSX/TSX transpilation, React 19 / Server Components compatibility, and Bun.markdown.react()",
      docMatches: allDocs.filter((d) => /react|jsx|fullstack/i.test(d)),
      typeMatches: allTypes.filter((t) => /jsx/i.test(t)),
      keyApis: [
        "Bun.Transpiler",
        "Bun.markdown.react",
        "jsx: 'react-jsx'",
        "React Server Components",
      ],
    },
    {
      id: "css",
      title: "LightningCSS & Modern Styling Engine",
      description:
        "Built-in LightningCSS transpilation: CSS nesting, color-mix(), relative colors, OKLCH, and CSS Modules",
      docMatches: allDocs.filter((d) => /css|tailwind|style/i.test(d)),
      typeMatches: allTypes.filter((t) => /bundle/i.test(t)),
      keyApis: [
        "Bun.build({ loaders: { '.css': 'css' } })",
        "Bun.color",
        "CSS Nesting",
        "color-mix()",
        "oklch()",
      ],
    },
    {
      id: "img",
      title: "Native Image Pipeline (Bun.Image)",
      description:
        "SIMD-accelerated image decoding, resize (mitchell/lanczos3), rotate, modulate, WebP/AVIF, and ThumbHash placeholders",
      docMatches: allDocs.filter((d) => /image|png|jpeg|svg/i.test(d)),
      typeMatches: allTypes.filter((t) => /bun\.d\.ts/i.test(t)),
      keyApis: [
        "new Bun.Image()",
        "Blob.image()",
        "img.resize()",
        "img.webp()",
        "img.placeholder()",
        "img.bytes()",
      ],
    },
    {
      id: "json",
      title: "High-Performance Structured Data",
      description:
        "Fast SIMD JSON, zero-copy streaming Bun.JSONL, JSON5, native Bun.TOML, and Bun.XML",
      docMatches: allDocs.filter((d) => /json|toml|xml|read-file/i.test(d)),
      typeMatches: allTypes.filter((t) => /bun\.d\.ts/i.test(t)),
      keyApis: [
        "Bun.JSONL.parse",
        "Bun.JSONL.parseChunk",
        "Bun.TOML.parse",
        "Bun.TOML.stringify",
        "Bun.XML.parse",
      ],
    },
    {
      id: "markdown",
      title: "Rust-Powered Markdown Engine (Bun.markdown)",
      description:
        "Ultra-fast GFM parser written in Rust with native HTML, ANSI terminal, custom AST render, and React JSX output",
      docMatches: allDocs.filter((d) => /markdown/i.test(d)),
      typeMatches: allTypes.filter((t) => /bun\.d\.ts/i.test(t)),
      keyApis: [
        "Bun.markdown.html",
        "Bun.markdown.ansi",
        "Bun.markdown.render",
        "Bun.markdown.react",
      ],
    },
  ];

  // Self-generate TypeScript capability registry in apps/web/src/generated/bun-catalog.ts
  const generatedFileHeader = `/**
 * AUTONOMOUSLY GENERATED FILE - DO NOT EDIT MANUALLY
 * Generated by YOLO Autonomous Engine (yolo generate)
 * Upstream Source: vendor/bun (commit: ${Bun.revision.slice(0, 10)})
 * Timestamp: ${new Date().toISOString()}
 * Baseline: Bun ${Bun.version}
 */

export interface BunCapabilityItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly keyApis: readonly string[];
  readonly docCount: number;
  readonly sampleDocs: readonly string[];
}

export interface MonorepoBunCatalog {
  readonly generatedAt: string;
  readonly bunVersion: string;
  readonly bunRevision: string;
  readonly capabilities: readonly BunCapabilityItem[];
}

export const MONOREPO_BUN_CATALOG: MonorepoBunCatalog = {
  generatedAt: ${JSON.stringify(new Date().toISOString())},
  bunVersion: ${JSON.stringify(Bun.version)},
  bunRevision: ${JSON.stringify(Bun.revision)},
  capabilities: [
${domains
  .map(
    (d) => `    {
      id: ${JSON.stringify(d.id)},
      title: ${JSON.stringify(d.title)},
      description: ${JSON.stringify(d.description)},
      keyApis: ${JSON.stringify(d.keyApis)},
      docCount: ${d.docMatches.length},
      sampleDocs: ${JSON.stringify(d.docMatches.slice(0, 5))},
    },`,
  )
  .join("\n")}
  ],
} as const;

export function getCapabilityById(id: string): BunCapabilityItem | undefined {
  return MONOREPO_BUN_CATALOG.capabilities.find((c) => c.id === id);
}
`;

  const targetPath = resolve(ROOT_DIR, "apps/web/src/generated/bun-catalog.ts");
  await writeTrackedCatalog(targetPath, generatedFileHeader);

  const elapsedMs = Number(((Bun.nanoseconds() - t0) / 1_000_000).toFixed(2));

  return {
    generatedAt: new Date().toISOString(),
    bunVersion: Bun.version,
    bunRevision: Bun.revision,
    targetCatalogPath: targetPath,
    domains,
    totalDocFilesIndexed: allDocs.length,
    totalTypeFilesIndexed: allTypes.length,
    elapsedMs,
  };
}

export function printHelp(): void {
  const header = "\x1b[1m\x1b[36mYOLO Industrial Engine CLI\x1b[0m (100% Native Bun Powered)";
  console.log(`
${header}

\x1b[1mUSAGE:\x1b[0m
  yolo <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  \x1b[32mstatus\x1b[0m              Inspect active package forks & Cargo workspace status
  \x1b[32mweb [build|dev]\x1b[0m     Manage and build the zero-overhead Web & Desktop frontend
  \x1b[32mgenerate\x1b[0m            Autonomously scan upstream Bun and generate code & capability catalogs
  \x1b[32mparse <file>\x1b[0m        Fast AST & token analysis via Bun file streaming + wyhash
  \x1b[32mdocs [query]\x1b[0m        Search or inspect version-matched Bun documentation in vendor/bun/docs
  \x1b[32mversion | doctor\x1b[0m       Installed version, target; check the installation (runtime verified and loadable)
  \x1b[32mruntime install|list|verify|rollback|info\x1b[0m  Manage installed runtime artifacts
  \x1b[32mupgrade [--check]\x1b[0m     Install the latest release; \x1b[32muninstall [--yes]\x1b[0m removes ~/.yolo
  \x1b[32mcreate <dir> [--with web,desktop]\x1b[0m Scaffold an Aphrody stack project (Bun + runtime SDK + Tauri) from templates/
  \x1b[32mawesome [stats|list|search|github|check]\x1b[0m Browse aphrody-labs/awesome-bun (README cached, no clone)
  \x1b[32mimport [--apply|--check]\x1b[0m Vendor the fork crates into crates/aphrody-* (see vendor.toml)
  \x1b[32mrename [opts] [dir..]\x1b[0m Mass boundary-aware rename (--preset aphrody | --from X --to Y, --apply, --paths)
  \x1b[32minfra|ops|workspace|workflow|git|ssh ...\x1b[0m Aphrody control plane (aphrody-infra / aphrody-ops), same workflow
  \x1b[32mverify [--only a,b] [--changed] [--parallel N] [--json|--md] [--list|--last]\x1b[0m Run the repository gates as a parallel graph; JSON or Markdown evidence in var/verify
  \x1b[32mhost audit|reclaim|archive|services|tune|net|mount|journal --host vps|dbfr|local [--apply]\x1b[0m Manage a Linux server (plan by default, journaled, safety-checked)
  \x1b[32mship [--apply] [status|log|attach|stop]\x1b[0m Build all of yolo on the build factory host; \x1b[32mhooks install\x1b[0m does it on every push to main/dev
  \x1b[32mplugin <create|status>\x1b[0m Generate or inspect unified YOLO & Bun-TS7 plugin
  \x1b[32mbench\x1b[0m               Run native Bun nanoseconds and hashing micro-benchmark
  \x1b[32mhelp\x1b[0m                Display this help message

\x1b[1mENGINE BASELINE:\x1b[0m
  Runtime: Bun ${Bun.version} (${Bun.revision.slice(0, 10)})
  OS:      ${process.platform} (${process.arch})
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || (isCompiled() ? "help" : "status");

  // Source-tree commands need a checkout; the installed executable carries the distribution ones.
  const CHECKOUT_ONLY = new Set([
    "status",
    "generate",
    "web",
    "desktop",
    "tauri",
    "docs",
    "import",
    "rename",
    "plugin",
    "ship",
    "hooks",
  ]);
  if (isCompiled() && CHECKOUT_ONLY.has(command)) {
    // Inside a checkout the installed executable hands the command to the checkout's own sources (its root, not
    // YOLO_HOME, is then the home), so `yolo ship` works wherever `bun run cli ship` would.
    const checkout = findCheckout();
    const bun = Bun.which("bun");
    if (checkout !== null && bun !== null) {
      const env = { ...process.env };
      delete env["YOLO_HOME"];
      const child = Bun.spawnSync([bun, "run", join(checkout, "apps/cli/src/index.ts"), ...args], {
        cwd: checkout,
        env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      process.exit(child.exitCode ?? 1);
    }
    console.error(
      `\`yolo ${command}\` works on a yolo checkout: run it there (or \`bun run cli ${command}\`).`,
    );
    process.exit(1);
  }

  switch (command) {
    case "status": {
      console.log(`\x1b[1m\x1b[36m=== YOLO Monorepo Status (Native Bun Engine) ===\x1b[0m`);
      const pkgs = await inspectPackages();
      for (const p of pkgs) {
        const status = p.exists ? `\x1b[32m[LOADED]\x1b[0m` : `\x1b[31m[MISSING]\x1b[0m`;
        const commit = p.headCommit ? `(${p.headCommit})` : "";
        const sampleCount = p.filesCount !== undefined ? `[~${p.filesCount}+ files]` : "";
        console.log(`  ${status} vendor/${p.name.padEnd(10)} ${commit.padEnd(14)} ${sampleCount}`);
      }

      const vendor = await readVendorStatus();
      if (vendor) {
        console.log(`\n\x1b[1m\x1b[36m=== Vendored crates (vendor.lock) ===\x1b[0m`);
        console.log(`  ${vendor.crates} crates imported into crates/aphrody-*`);
        for (const source of vendor.sources) {
          const state = source.inSync
            ? "\x1b[32min sync\x1b[0m"
            : `\x1b[33mdrift (submodule at ${source.headSha?.slice(0, 10) ?? "?"}), run \`just vendor-update\`\x1b[0m`;
          console.log(`  ${source.name.padEnd(18)} ${source.lockedSha.slice(0, 10)} ${state}`);
        }
      }

      const cargo = await readWorkspaceCargo();
      if (cargo) {
        console.log(`\n\x1b[1m\x1b[36m=== Cargo Workspace Config (via Bun.TOML) ===\x1b[0m`);
        console.log(`  Resolver: v${cargo.resolver}`);
        console.log(`  Members:  ${cargo.members.join(", ")}`);
        console.log(
          `  Release:  opt-level=${String(cargo.releaseProfile["opt-level"] ?? "z")}, strip=${String(cargo.releaseProfile["strip"] ?? true)}`,
        );
      }
      break;
    }

    case "generate": {
      console.log(`\x1b[1m\x1b[36m=== Autonomous Bun Upstream Generator ===\x1b[0m`);
      console.log(
        `  Scanning upstream vendor/bun for Web APIs, Server, React, CSS, Image, JSON, Markdown...`,
      );
      const report = await generateBunCatalog();
      console.log(`  \x1b[32m[SUCCESS]\x1b[0m Generated code catalog in ${report.elapsedMs} ms`);
      console.log(`  Target:   ${relative(ROOT_DIR, report.targetCatalogPath)}`);
      console.log(
        `  Indexed:  ${report.totalDocFilesIndexed} docs, ${report.totalTypeFilesIndexed} type declarations`,
      );
      console.log(`\n  \x1b[1mDomains Cataloged:\x1b[0m`);
      for (const d of report.domains) {
        console.log(
          `    - \x1b[33m${d.title.padEnd(35)}\x1b[0m: ${d.docMatches.length} docs, ${d.keyApis.length} APIs`,
        );
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
      console.log(`  Lines:    ${result.lines}`);
      console.log(`  Bytes:    ${result.bytes} B`);
      console.log(`  Checksum: wyhash:0x${result.checksum}`);
      console.log(`  Speed:    ${result.parseTimeMs} ms`);
      console.log(
        `  Exports:  ${result.exports.length} symbol(s) [${result.exports.slice(0, 10).join(", ")}${result.exports.length > 10 ? "..." : ""}]`,
      );
      console.log(
        `  Imports:  ${result.imports.length} module(s) [${result.imports.slice(0, 8).join(", ")}${result.imports.length > 8 ? "..." : ""}]`,
      );
      break;
    }

    case "bench": {
      console.log(`\x1b[1m\x1b[36m=== YOLO Bun Micro-Benchmark Suite ===\x1b[0m`);
      const iterations = 500_000;
      const testBuffer = Buffer.from("Aphrody YOLO Bun Industrial Engine Benchmark Data String");

      // 1. Wyhash speed
      const t0 = Bun.nanoseconds();
      let lastHash = 0n;
      for (let i = 0; i < iterations; i++) {
        lastHash = Bun.hash.wyhash(testBuffer, BigInt(i));
      }
      const elapsedWyhash = (Bun.nanoseconds() - t0) / 1_000_000;
      console.log(
        `  Bun.hash.wyhash:  ${iterations.toLocaleString()} iterations in ${elapsedWyhash.toFixed(2)} ms (${lastHash.toString(16).slice(0, 8)})`,
      );

      // 2. CRC32 speed
      const t1 = Bun.nanoseconds();
      let lastCrc = 0;
      for (let i = 0; i < iterations; i++) {
        lastCrc = Bun.hash.crc32(testBuffer, i);
      }
      const elapsedCrc = (Bun.nanoseconds() - t1) / 1_000_000;
      console.log(
        `  Bun.hash.crc32:   ${iterations.toLocaleString()} iterations in ${elapsedCrc.toFixed(2)} ms (${lastCrc.toString(16)})`,
      );

      // 3. String width measurement
      const sampleAnsi = "\x1b[32mYOLO\x1b[0m 🚀 \x1b[34mAntigravity Core\x1b[0m";
      console.log(`  Bun.stringWidth:  "${sampleAnsi}" -> width = ${Bun.stringWidth(sampleAnsi)}`);
      console.log(`  Bun.stripANSI:    "${Bun.stripANSI(sampleAnsi)}"`);
      break;
    }

    case "web":
    case "desktop":
    case "tauri": {
      const sub = args[1] || "build";
      const webDir = resolve(ROOT_DIR, "apps/web");
      if (!existsSync(webDir)) {
        console.error(`\x1b[31mError:\x1b[0m web app not found at ${webDir}`);
        process.exit(1);
      }
      if (sub === "dev") {
        console.log(`\x1b[1m\x1b[36m=== Launching Web Dev Server ===\x1b[0m`);
        const proc = Bun.spawn(["bun", "run", "dev"], {
          cwd: webDir,
          stdout: "inherit",
          stderr: "inherit",
        });
        await proc.exited;
      } else {
        console.log(`\x1b[1m\x1b[36m=== Building Web Frontend ===\x1b[0m`);
        const proc = Bun.spawn(["bun", "run", "build"], {
          cwd: webDir,
          stdout: "inherit",
          stderr: "inherit",
        });
        await proc.exited;
      }
      break;
    }

    case "docs": {
      const docsDir = resolve(VENDOR_DIR, "bun/docs");
      const query = args[1]?.toLowerCase();
      console.log(`\x1b[1m\x1b[36m=== Bun Docs Corpus (via Bun.Glob) ===\x1b[0m`);
      if (!existsSync(docsDir)) {
        console.log(`  \x1b[31mDocs not found at ${docsDir}\x1b[0m`);
        break;
      }
      if (!query) {
        const glob = new Bun.Glob("*.{md,mdx}");
        const pages = Array.from(glob.scanSync({ cwd: docsDir, onlyFiles: true }));
        console.log(`  Docs directory: vendor/bun/docs (${pages.length} root items)`);
      } else {
        const searchQuery = query;
        console.log(`  Searching for "${searchQuery}" with Bun.Glob...`);
        const glob = new Bun.Glob("**/*.{md,mdx}");
        const results: string[] = [];
        for (const filePath of glob.scanSync({ cwd: docsDir, onlyFiles: true })) {
          if (filePath.toLowerCase().includes(searchQuery)) {
            results.push(filePath);
          }
        }
        console.log(`  Found ${results.length} match(es):`);
        for (const r of results.slice(0, 10)) {
          console.log(`    - ${r}`);
        }
      }
      break;
    }

    case "version":
    case "--version":
    case "-v":
      process.exitCode = runVersion();
      break;

    case "doctor":
      process.exitCode = runDoctor();
      break;

    case "runtime":
      process.exitCode = await runRuntimeCommand(args.slice(1));
      break;

    case "upgrade":
      process.exitCode = await runUpgrade(args.slice(1));
      break;

    case "uninstall":
      process.exitCode = runUninstall(args.slice(1));
      break;

    case "create": {
      process.exitCode = await runCreateCommand(args.slice(1), ROOT_DIR);
      break;
    }

    case "awesome": {
      process.exitCode = await runAwesomeCommand(args.slice(1), ROOT_DIR);
      break;
    }

    case "import": {
      process.exitCode = await runImportCommand(args.slice(1), ROOT_DIR);
      break;
    }

    case "rename": {
      process.exitCode = await runRenameCommand(args.slice(1), ROOT_DIR);
      break;
    }

    case "plugin": {
      process.exitCode = await runPluginCommand(args.slice(1), ROOT_DIR);
      break;
    }

    case "infra":
    case "ops":
    case "workspace":
    case "workflow":
    case "git":
    case "ssh":
    case "ship":
    case "hooks": {
      process.exitCode = await runAphrodyCommand(command, args.slice(1), ROOT_DIR);
      break;
    }

    case "host": {
      process.exitCode = await runHostCommand(args.slice(1), ROOT_DIR);
      break;
    }

    case "verify": {
      process.exitCode = await runVerifyCommand(args.slice(1), ROOT_DIR);
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
