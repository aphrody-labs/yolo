/**
 * `yolo api`: Native high-performance HTTP / REST / OpenAPI micro-server.
 * Powered 100% by native Bun (`Bun.serve`) with zero external runtime dependencies.
 *
 * Exposes YOLO CLI tools, diagnostics, metrics and OpenAPI schemas for direct
 * agent and browser integration.
 */

import { resolve } from "node:path";
import { yoloHome, yoloVersion } from "./home";
import { hostTarget } from "../../../packages/runtime/src/artifact";
import { TOOLS, executeTool } from "./mcp";
import { collectDoctorReport } from "./distribution";
import { inspectPackages, readVendorStatus, readWorkspaceCargo } from "./index";
import { scanDirectory } from "./scan";

export interface ApiServerOptions {
  readonly port?: number;
  readonly hostname?: string;
  readonly rootDir?: string;
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
          summary: "Fast parallel directory scan",
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
      "/api/tools": {
        get: {
          summary: "Expose MCP tool catalog and schemas",
          responses: { "200": { description: "Tool definitions" } },
        },
      },
    },
  };
}

export function createApiServer(options: ApiServerOptions = {}) {
  const port = options.port ?? 8999;
  const hostname = options.hostname ?? "127.0.0.1";
  const rootDir = options.rootDir ?? yoloHome();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  const jsonResponse = (data: unknown, status: number = 200) => {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders,
      },
    });
  };

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      const url = new URL(req.url);
      const path = url.pathname;

      try {
        if (path === "/" || path === "/health" || path === "/api/health") {
          return jsonResponse({
            status: "ok",
            uptimeSec: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
            yoloVersion: yoloVersion(),
            bunVersion: Bun.version,
            hostTarget: hostTarget(),
          });
        }

        if (path === "/api/openapi.json") {
          return jsonResponse(buildOpenApiSpec(yoloVersion(), Bun.version));
        }

        if (path === "/api/tools") {
          return jsonResponse({
            schema: "yolo.tools/1",
            tools: TOOLS,
          });
        }

        if (path === "/api/status" && req.method === "GET") {
          const [packages, vendor, cargo] = await Promise.all([
            inspectPackages(),
            readVendorStatus(),
            readWorkspaceCargo(),
          ]);
          return jsonResponse({
            schema: "yolo.status/1",
            root: rootDir,
            packages,
            vendor,
            cargo,
          });
        }

        if (path === "/api/doctor" && req.method === "GET") {
          return jsonResponse(collectDoctorReport());
        }

        if (path === "/api/bench" && req.method === "GET") {
          const iters = parseInt(url.searchParams.get("iterations") ?? "200000", 10);
          const result = await executeTool("yolo_bench", { iterations: iters }, rootDir);
          return jsonResponse(result);
        }

        if (path === "/api/scan" && req.method === "POST") {
          let body: { path?: string; exts?: string; parallel?: number } = {};
          try {
            body = (await req.json()) as typeof body;
          } catch {
            // empty body is fine, defaults apply
          }
          const target = body.path ? resolve(rootDir, body.path) : rootDir;
          const exts = body.exts ? body.exts.split(",").map((s) => s.trim()) : undefined;
          const report = await scanDirectory(target, { exts, parallel: body.parallel });
          return jsonResponse(report);
        }

        if (path === "/api/verify" && req.method === "POST") {
          let body: { only?: string; changed?: boolean; parallel?: number } = {};
          try {
            body = (await req.json()) as typeof body;
          } catch {
            // defaults apply
          }
          const result = await executeTool("yolo_verify", body, rootDir);
          return jsonResponse(result);
        }

        if (path === "/api/parse" && req.method === "POST") {
          const body = (await req.json()) as { path?: string };
          if (!body.path) {
            return jsonResponse({ error: "Missing required parameter 'path'" }, 400);
          }
          const result = await executeTool("yolo_parse", { path: body.path }, rootDir);
          return jsonResponse(result);
        }

        return jsonResponse({ error: `Not found: ${path}` }, 404);
      } catch (err) {
        return jsonResponse({ error: (err as Error).message }, 500);
      }
    },
  });

  return server;
}

export async function runApiCommand(
  args: readonly string[],
  rootDir: string = yoloHome(),
): Promise<number> {
  const getOpt = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const portOpt = getOpt("--port") ?? getOpt("-p");
  const hostOpt = getOpt("--host") ?? getOpt("-h");
  const port = portOpt ? parseInt(portOpt, 10) : 8999;
  const hostname = hostOpt ?? "127.0.0.1";

  const server = createApiServer({ port, hostname, rootDir });
  console.log(`\x1b[1m\x1b[36m=== YOLO API Server ===\x1b[0m`);
  console.log(`  Listening on: http://${server.hostname}:${server.port}`);
  console.log(`  Health:       http://${server.hostname}:${server.port}/health`);
  console.log(`  OpenAPI:      http://${server.hostname}:${server.port}/api/openapi.json`);
  console.log(`  Tools:        http://${server.hostname}:${server.port}/api/tools`);
  console.log(`  Press Ctrl+C to stop.`);

  return new Promise(() => {}); // keep running
}
