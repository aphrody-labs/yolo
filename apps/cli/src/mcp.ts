/**
 * `yolo mcp`: Native Model Context Protocol (MCP 2024-11-05) Server.
 * Exposes YOLO CLI tools directly to AI Agents (Antigravity, Claude Code, Gemini CLI, etc.)
 * over stdio JSON-RPC 2.0 with zero external npm dependencies.
 *
 * Implements:
 * - initialize, notifications/initialized, ping
 * - tools/list with strict JSON Schema definitions
 * - tools/call with structured JSON results
 */

import { resolve } from "node:path";
import { parseTsSource, inspectPackages, readVendorStatus, readWorkspaceCargo } from "./index";
import {
  runGates,
  GATES,
  selectChanged,
  changedFiles,
  summarize,
  type Report,
  NOT_RUN_HEAVY,
  spawnRunner,
} from "./verify";
import { scanDirectory } from "./scan";
import { scanLinks, estimateReclaim } from "./host-space";
import { collectDoctorReport } from "./distribution";
import { yoloHome } from "./home";

export const DEFAULT_MCP_PROTOCOL_VERSION = "2024-11-05";
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ["2024-11-05", "2025-06-18"] as const;
export const MCP_PROTOCOL_VERSION = DEFAULT_MCP_PROTOCOL_VERSION;
export const SERVER_NAME = "yolo-mcp";
export const SERVER_VERSION = "1.0.0";

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "yolo_verify",
    description:
      "Run repository quality gates in parallel (typecheck, lint, fmt, tests, rust-fmt, docs, import-check). Returns structured measured report.",
    inputSchema: {
      type: "object",
      properties: {
        only: {
          type: "string",
          description:
            "Comma-separated gate IDs to run (whitespace, typecheck, lint, fmt-check, test, rust-fmt, docs, import-check)",
        },
        changed: {
          type: "boolean",
          description: "If true, only runs gates whose file surfaces changed relative to HEAD",
        },
        parallel: {
          type: "number",
          description: "Parallel worker concurrency limit (default: CPU count)",
        },
      },
    },
  },
  {
    name: "yolo_status",
    description:
      "Inspect active package forks, vendored crate sync status, and Cargo workspace configuration.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "yolo_scan",
    description:
      "Fast parallel directory scanner using Bun.Glob + wyhash. Returns file counts, byte sizes, line counts, extension stats, and composite tree fingerprint.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute target path to scan (defaults to repository root)",
        },
        exts: {
          type: "string",
          description: "Comma-separated list of extensions to include (e.g. 'ts,rs,toml')",
        },
        parallel: {
          type: "number",
          description: "Max parallel I/O workers (default: 16)",
        },
      },
    },
  },
  {
    name: "yolo_parse",
    description:
      "Perform fast AST and token analysis on a TypeScript or JavaScript file using native Bun wyhash and token streaming.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to TypeScript/JavaScript file to parse",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "yolo_doctor",
    description:
      "Inspect environment diagnostics, toolchain availability (Bun, Rust, C compiler, uv/Python), runtime artifacts, and capabilities.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "yolo_bench",
    description:
      "Execute native Bun nanosecond-precision micro-benchmarks for hashing (wyhash, crc32) and string widths.",
    inputSchema: {
      type: "object",
      properties: {
        iterations: {
          type: "number",
          description: "Number of benchmark iterations (default: 200,000)",
        },
      },
    },
  },
  {
    name: "yolo_host_space",
    description:
      "Measure disk space breakdown for a directory with deduplication of hard links and safety checks.",
    inputSchema: {
      type: "object",
      properties: {
        dir: {
          type: "string",
          description: "Directory path to measure",
        },
        depth: {
          type: "number",
          description: "Scan depth (default: 2)",
        },
      },
      required: ["dir"],
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown> = {},
  rootDir: string = yoloHome(),
): Promise<unknown> {
  switch (name) {
    case "yolo_verify": {
      let selected = [...GATES];
      let selection: Report["selection"] = "all";
      if (typeof args.only === "string" && args.only.length > 0) {
        const want = args.only
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        selected = GATES.filter((g) => want.includes(g.id));
        selection = "only";
      } else if (args.changed === true) {
        selected = selectChanged(GATES, changedFiles(rootDir));
        selection = "changed";
      }
      const parallel = Math.max(1, Number(args.parallel ?? navigator.hardwareConcurrency ?? 4));
      const runner = spawnRunner(rootDir, 60_000);
      const outcome = await runGates(selected, runner, { parallel, root: rootDir });
      const sum = summarize(outcome.results, outcome.wallMs);
      return {
        schema: "yolo.verify/1",
        startedAt: new Date().toISOString(),
        root: rootDir,
        selection,
        parallel,
        wallMs: outcome.wallMs,
        ...sum,
        gates: outcome.results,
        notRun: NOT_RUN_HEAVY,
      };
    }

    case "yolo_status": {
      const [packages, vendor, cargo] = await Promise.all([
        inspectPackages(),
        readVendorStatus(),
        readWorkspaceCargo(),
      ]);
      return {
        schema: "yolo.status/1",
        root: rootDir,
        packages,
        vendor,
        cargo,
      };
    }

    case "yolo_scan": {
      const target = typeof args.path === "string" ? resolve(rootDir, args.path) : rootDir;
      const exts =
        typeof args.exts === "string" ? args.exts.split(",").map((e) => e.trim()) : undefined;
      const parallel = typeof args.parallel === "number" ? args.parallel : 16;
      return await scanDirectory(target, { exts, parallel });
    }

    case "yolo_parse": {
      if (typeof args.path !== "string") {
        throw new Error("Missing required argument: 'path'");
      }
      const filePath = resolve(rootDir, args.path);
      return await parseTsSource(filePath);
    }

    case "yolo_doctor": {
      return collectDoctorReport();
    }

    case "yolo_bench": {
      const iters =
        typeof args.iterations === "number"
          ? Math.max(10_000, Math.min(1_000_000, args.iterations))
          : 200_000;
      const testBuffer = Buffer.from("Aphrody YOLO Bun Industrial Engine Benchmark Data String");

      const t0 = Bun.nanoseconds();
      let lastHash = 0n;
      for (let i = 0; i < iters; i++) {
        lastHash = Bun.hash.wyhash(testBuffer, BigInt(i));
      }
      const elapsedWyhashMs = Number(((Bun.nanoseconds() - t0) / 1_000_000).toFixed(2));

      const t1 = Bun.nanoseconds();
      let lastCrc = 0;
      for (let i = 0; i < iters; i++) {
        lastCrc = Bun.hash.crc32(testBuffer, i);
      }
      const elapsedCrcMs = Number(((Bun.nanoseconds() - t1) / 1_000_000).toFixed(2));

      return {
        schema: "yolo.bench/1",
        iterations: iters,
        wyhash: {
          elapsedMs: elapsedWyhashMs,
          opsPerSec: Math.round((iters / (elapsedWyhashMs || 1)) * 1000),
          sample: lastHash.toString(16).slice(0, 8),
        },
        crc32: {
          elapsedMs: elapsedCrcMs,
          opsPerSec: Math.round((iters / (elapsedCrcMs || 1)) * 1000),
          sample: lastCrc.toString(16),
        },
      };
    }

    case "yolo_host_space": {
      if (typeof args.dir !== "string") {
        throw new Error("Missing required argument: 'dir'");
      }
      const depth = typeof args.depth === "number" ? args.depth : 2;
      const parallel = typeof args.parallel === "number" ? args.parallel : 8;
      const records = await scanLinks([args.dir], {
        run: async (cmd: string) => {
          const proc = Bun.spawn(["sh", "-c", cmd], { stdout: "pipe" });
          return await new Response(proc.stdout).text();
        },
        depth,
        parallel,
      });
      const reclaim = estimateReclaim(records);
      return {
        dir: args.dir,
        recordsCount: records.length,
        reclaim,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function handleMcpMessage(
  rawMessage: string,
  rootDir: string = yoloHome(),
): Promise<string | null> {
  let msg: {
    jsonrpc?: string;
    id?: number | string | null;
    method?: string;
    params?: Record<string, unknown>;
  };
  try {
    msg = JSON.parse(rawMessage);
  } catch {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
  }

  if (msg.jsonrpc !== "2.0") {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id ?? null,
      error: { code: -32600, message: "Invalid Request: jsonrpc must be '2.0'" },
    });
  }

  // Notifications (no id)
  if (msg.id === undefined || msg.id === null) {
    if (msg.method === "notifications/initialized") {
      // Client ready confirmation
      return null;
    }
    return null;
  }

  const id = msg.id;

  switch (msg.method) {
    case "initialize": {
      const clientVersion = (msg.params as { protocolVersion?: string } | undefined)
        ?.protocolVersion;
      const negotiatedVersion =
        clientVersion &&
        (SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(clientVersion)
          ? clientVersion
          : DEFAULT_MCP_PROTOCOL_VERSION;

      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiatedVersion,
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          capabilities: {
            tools: {},
          },
        },
      });
    }

    case "ping": {
      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {},
      });
    }

    case "tools/list": {
      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS,
        },
      });
    }

    case "tools/call": {
      const params = msg.params ?? {};
      const toolName = String(params.name ?? "");
      const args = (params.arguments as Record<string, unknown>) ?? {};

      try {
        const result = await executeTool(toolName, args, rootDir);
        return JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        });
      } catch (err) {
        return JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: (err as Error).message,
              },
            ],
          },
        });
      }
    }

    default: {
      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found: ${msg.method}`,
        },
      });
    }
  }
}

/**
 * Runs the stdio MCP JSON-RPC event loop.
 */
export async function runMcpServer(rootDir: string = yoloHome()): Promise<void> {
  const stdin = process.stdin;
  let buffer = "";

  stdin.setEncoding("utf8");

  for await (const chunk of stdin) {
    buffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length === 0) continue;

      const response = await handleMcpMessage(line, rootDir);
      if (response !== null) {
        process.stdout.write(response + "\n");
      }
    }
  }
}
