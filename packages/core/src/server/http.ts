/**
 * `yolo api`: Native high-performance HTTP / REST / OpenAPI micro-server.
 * Powered 100% by native Bun (`Bun.serve`) with zero external runtime dependencies.
 *
 * Exposes YOLO CLI tools, diagnostics, metrics and OpenAPI schemas for direct
 * agent integration with strict loopback isolation, Host header validation,
 * path traversal containment, and optional token-based authorization.
 */

import { resolve } from "node:path";
import { yoloHome, yoloVersion } from "../vfs/home";
import { hostTarget } from "../../../runtime/src/artifact";
import { TOOLS, executeTool } from "../mcp/server";
import { collectDoctorReport } from "../sys/doctor";
import { inspectPackages, readVendorStatus } from "../vendor/status";
import { readWorkspaceCargo } from "../vendor/cargo";
import { scanDirectory } from "../vfs/scan";

export interface ApiServerOptions {
  readonly port?: number;
  readonly hostname?: string;
  readonly rootDir?: string;
  readonly token?: string | undefined;
}

export function buildOpenApiSpec(version: string, bunVersion: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "YOLO Industrial Engine API",
      version,
      description: `Native Bun-powered REST API for YOLO monorepo and runtime (Bun ${bunVersion})`,
    },
    paths: {
      "/health": {
        get: {
          summary: "Service health and version check",
          responses: { "200": { description: "Health status" } },
        },
      },
      "/api/status": {
        get: {
          summary: "Monorepo submodule and cargo status",
          responses: { "200": { description: "Status report" } },
        },
      },
      "/api/doctor": {
        get: {
          summary: "Environment, stack toolchain and runtime diagnostics",
          responses: { "200": { description: "Doctor diagnostics" } },
        },
      },
      "/api/bench": {
        get: {
          summary: "Run native Bun micro-benchmark",
          parameters: [
            { name: "iterations", in: "query", schema: { type: "integer", default: 200000 } },
          ],
          responses: { "200": { description: "Benchmark results" } },
        },
      },
      "/api/scan": {
        post: {
          summary: "Fast parallel directory scan (contained within workspace)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    exts: { type: "string" },
                    parallel: { type: "number" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Scan metrics" } },
        },
      },
      "/api/verify": {
        post: {
          summary: "Run quality verification gates in parallel",
          responses: { "200": { description: "Verification report" } },
        },
      },
      "/api/tools": {
        get: {
          summary: "Expose MCP tool catalog and schemas",
          responses: { "200": { description: "Tool definitions" } },
        },
      },
    },
  };
}

export function safeResolvePath(rootDir: string, subPath?: string): string {
  if (!subPath) return rootDir;
  const resolvedRoot = resolve(rootDir);
  const candidate = resolve(rootDir, subPath);
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + "/")) {
    throw new Error(`Path traversal denied: path '${subPath}' is outside the repository root.`);
  }
  return candidate;
}

export function createApiServer(options: ApiServerOptions = {}) {
  const port = options.port ?? 8999;
  const hostname = options.hostname ?? "127.0.0.1";
  const rootDir = options.rootDir ?? yoloHome();
  const requiredToken = options.token ?? Bun.env.YOLO_API_TOKEN;

  const jsonResponse = (
    data: unknown,
    status: number = 200,
    extraHeaders: Record<string, string> = {},
  ) => {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...extraHeaders,
      },
    });
  };

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      // 1. DNS Rebinding Protection: Verify Host header
      const hostHeader = ((req.headers.get("host") || "").split(":")[0] ?? "").toLowerCase();
      const allowedHosts = new Set(["127.0.0.1", "localhost", "::1", hostname.toLowerCase()]);
      if (hostHeader && !allowedHosts.has(hostHeader)) {
        return jsonResponse({ error: "Invalid Host header (DNS rebinding protection)" }, 403);
      }

      // 2. Strict CORS policy: Only allow loopback origins, reject arbitrary external web pages
      const origin = req.headers.get("origin");
      const isLoopbackOrigin = Boolean(
        origin &&
        (origin.startsWith("http://127.0.0.1:") ||
          origin.startsWith("http://localhost:") ||
          origin.startsWith("https://127.0.0.1:") ||
          origin.startsWith("https://localhost:")),
      );

      const corsHeaders: Record<string, string> =
        isLoopbackOrigin && origin
          ? {
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization, X-YOLO-Token",
              Vary: "Origin",
            }
          : {};

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      const url = new URL(req.url);
      const path = url.pathname;

      // 3. Token check for mutating / heavy POST operations
      if (req.method === "POST" && requiredToken) {
        const authHeader = req.headers.get("authorization");
        const tokenHeader = req.headers.get("x-yolo-token");
        const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        const providedToken = tokenHeader || bearer;

        if (providedToken !== requiredToken) {
          return jsonResponse(
            { error: "Unauthorized: valid Bearer or X-YOLO-Token required" },
            401,
            corsHeaders,
          );
        }
      }

      try {
        if (path === "/" || path === "/health" || path === "/api/health") {
          return jsonResponse(
            {
              status: "ok",
              uptimeSec: Math.round(process.uptime()),
              timestamp: new Date().toISOString(),
              yoloVersion: yoloVersion(),
              bunVersion: Bun.version,
              hostTarget: hostTarget(),
            },
            200,
            corsHeaders,
          );
        }

        if (path === "/api/openapi.json") {
          return jsonResponse(buildOpenApiSpec(yoloVersion(), Bun.version), 200, corsHeaders);
        }

        if (path === "/api/tools") {
          return jsonResponse(
            {
              schema: "yolo.tools/1",
              tools: TOOLS,
            },
            200,
            corsHeaders,
          );
        }

        if (path === "/api/status" && req.method === "GET") {
          const [packages, vendor, cargo] = await Promise.all([
            inspectPackages(),
            readVendorStatus(),
            readWorkspaceCargo(),
          ]);
          return jsonResponse(
            {
              schema: "yolo.status/1",
              root: rootDir,
              packages,
              vendor,
              cargo,
            },
            200,
            corsHeaders,
          );
        }

        if (path === "/api/doctor" && req.method === "GET") {
          return jsonResponse(collectDoctorReport(), 200, corsHeaders);
        }

        if (path === "/api/bench" && req.method === "GET") {
          const iters = parseInt(url.searchParams.get("iterations") ?? "200000", 10);
          const result = await executeTool("yolo_bench", { iterations: iters }, rootDir);
          return jsonResponse(result, 200, corsHeaders);
        }

        if (path === "/api/scan" && req.method === "POST") {
          let body: { path?: string; exts?: string; parallel?: number } = {};
          try {
            body = (await req.json()) as typeof body;
          } catch {
            // empty body is fine, defaults apply
          }
          // Path traversal protected: must stay within rootDir
          const target = safeResolvePath(rootDir, body.path);
          const exts = body.exts ? body.exts.split(",").map((s) => s.trim()) : undefined;
          const report = await scanDirectory(target, { exts, parallel: body.parallel });
          return jsonResponse(report, 200, corsHeaders);
        }

        if (path === "/api/verify" && req.method === "POST") {
          let body: { only?: string; changed?: boolean; parallel?: number } = {};
          try {
            body = (await req.json()) as typeof body;
          } catch {
            // defaults apply
          }
          const result = await executeTool("yolo_verify", body, rootDir);
          return jsonResponse(result, 200, corsHeaders);
        }

        if (path === "/api/parse" && req.method === "POST") {
          const body = (await req.json()) as { path?: string };
          if (!body.path) {
            return jsonResponse({ error: "Missing required parameter 'path'" }, 400, corsHeaders);
          }
          // Path traversal protected: must stay within rootDir
          const target = safeResolvePath(rootDir, body.path);
          const result = await executeTool("yolo_parse", { path: target }, rootDir);
          return jsonResponse(result, 200, corsHeaders);
        }

        return jsonResponse({ error: `Not found: ${path}` }, 404, corsHeaders);
      } catch (err) {
        return jsonResponse({ error: (err as Error).message }, 500, corsHeaders);
      }
    },
  });

  return server;
}

export async function runApiCommand(
  args: readonly string[],
  rootDir: string = yoloHome(),
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`\x1b[1m\x1b[36m=== YOLO API Server ===\x1b[0m
Native Bun HTTP REST and OpenAPI micro-server for YOLO tools.

\x1b[1mUsage:\x1b[0m
  yolo api [options]

\x1b[1mOptions:\x1b[0m
  --port, -p <number>     Port to bind (default: 8999)
  --host, --hostname <ip> Host to bind (default: 127.0.0.1)
  --token <string>        Authorization token required for POST endpoints (or YOLO_API_TOKEN env)
  --allow-remote          Allow non-loopback interface binding without token
  --help, -h              Show this help message
`);
    return 0;
  }

  const getOpt = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const portOpt = getOpt("--port") ?? getOpt("-p");
  const hostOpt = getOpt("--host") ?? getOpt("--hostname");
  const tokenOpt = getOpt("--token") ?? Bun.env.YOLO_API_TOKEN;
  const allowRemote = args.includes("--allow-remote");

  const port = portOpt ? parseInt(portOpt, 10) : 8999;
  const hostname = hostOpt ?? "127.0.0.1";

  const isLoopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  if (!isLoopback && !tokenOpt && !allowRemote) {
    console.error(
      `\x1b[31mError:\x1b[0m Refusing to bind non-loopback host '${hostname}' without authentication. Use --token <secret> or --allow-remote.`,
    );
    return 1;
  }

  const server = createApiServer({ port, hostname, rootDir, token: tokenOpt });
  console.log(`\x1b[1m\x1b[36m=== YOLO API Server ===\x1b[0m`);
  console.log(`  Listening on: http://${server.hostname}:${server.port}`);
  console.log(`  Health:       http://${server.hostname}:${server.port}/health`);
  console.log(`  OpenAPI:      http://${server.hostname}:${server.port}/api/openapi.json`);
  console.log(`  Tools:        http://${server.hostname}:${server.port}/api/tools`);
  if (tokenOpt) {
    console.log(`  Security:     Token authentication active on mutating POST endpoints`);
  }
  console.log(`  Press Ctrl+C to stop.`);

  return new Promise(() => {}); // keep running
}
