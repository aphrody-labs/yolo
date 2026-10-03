import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { createApiServer } from "../apps/cli/src/api";

const rootDir = resolve(import.meta.dir, "..");
let server: ReturnType<typeof createApiServer>;
let baseUrl: string;

beforeAll(() => {
  // Use port 0 for random available port in tests
  server = createApiServer({ port: 0, hostname: "127.0.0.1", rootDir });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

describe("yolo api (Native Bun HTTP / OpenAPI Server)", () => {
  it("should respond to /health with status and versions", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.bunVersion).toBeDefined();
    expect(data.yoloVersion).toBeDefined();
  });

  it("should return OpenAPI specification at /api/openapi.json", async () => {
    const res = await fetch(`${baseUrl}/api/openapi.json`);
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/api/status"]).toBeDefined();
    expect(spec.paths["/api/scan"]).toBeDefined();
  });

  it("should list tools at /api/tools", async () => {
    const res = await fetch(`${baseUrl}/api/tools`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.schema).toBe("yolo.tools/1");
    expect(data.tools.length).toBeGreaterThan(0);
  });

  it("should return status report at /api/status", async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.schema).toBe("yolo.status/1");
    expect(data.packages).toBeDefined();
  });

  it("should return benchmark results at /api/bench?iterations=5000", async () => {
    const res = await fetch(`${baseUrl}/api/bench?iterations=5000`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.schema).toBe("yolo.bench/1");
    expect(data.wyhash.opsPerSec).toBeGreaterThan(0);
  });

  it("should perform scan via POST /api/scan", async () => {
    const res = await fetch(`${baseUrl}/api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "apps/cli/src", exts: "ts" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.schema).toBe("yolo.scan/1");
    expect(data.totalFiles).toBeGreaterThan(5);
  });
});
