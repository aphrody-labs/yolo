/**
 * OpenAPI 3.1 schema specification for the YOLO micro-server.
 */

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
          summary: "Recursively scan target directory in parallel",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    target: { type: "string" },
                    exts: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Scan results" } },
        },
      },
      "/api/tools": {
        get: {
          summary: "List all MCP tools available through API",
          responses: { "200": { description: "Tool definitions list" } },
        },
      },
    },
  };
}
