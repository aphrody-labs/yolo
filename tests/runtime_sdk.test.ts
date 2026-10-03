import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { defaultLibraryPath, Runtime, RuntimeError, Status } from "../sdk/runtime/src/index";

// The precompiled artifact is produced by `just runtime-build`; Bun tests never start Cargo.
const available = existsSync(defaultLibraryPath());
const suite = available ? describe : describe.skip;

describe("runtime SDK without the artifact", () => {
  it("explains how to obtain the library when it is missing", () => {
    expect(() => Runtime.load({ libraryPath: "/nonexistent/libyolo_runtime.so" })).toThrow(
      /cargo build --profile runtime/,
    );
  });
});

suite("runtime SDK against the precompiled library", () => {
  it("reports the build identity and negotiated ABI", () => {
    using runtime = Runtime.load();
    expect(runtime.abi.major).toBe(1);
    const info = runtime.buildInfo();
    expect(info.name).toBe("yolo-runtime");
    expect(info.abi).toBe("1.0");
    expect(info.panic_recovery).toBe(true);
    expect(runtime.capabilities()).toEqual(["system.stats", "bench.compute"]);
  });

  it("calls system.stats", () => {
    using runtime = Runtime.load();
    const stats = runtime.systemStats();
    expect(stats.os).toBe(process.platform === "darwin" ? "macos" : process.platform);
    expect(stats.timestamp_ms).toBeGreaterThan(0);
  });

  it("runs a benchmark to completion", () => {
    using runtime = Runtime.load();
    using op = runtime.startBenchmark(1000);
    expect(op.wait(10_000)?.message).toContain("1000");
  });

  it("times out, cancels and reports Cancelled", () => {
    using runtime = Runtime.load();
    using op = runtime.startBenchmark(4_294_967_295);
    expect(op.wait(0)).toBeUndefined();
    op.cancel();
    try {
      op.wait(10_000);
      throw new Error("wait() must throw after cancel");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).status).toBe(Status.Cancelled);
    }
  });

  it("bounds concurrent operations and frees the slot on release", () => {
    using runtime = Runtime.load({ maxOperations: 1 });
    const first = runtime.startBenchmark(4_294_967_295);
    try {
      runtime.startBenchmark(10);
      throw new Error("second operation must be refused");
    } catch (error) {
      expect((error as RuntimeError).status).toBe(Status.Busy);
    }
    first.release();
    using second = runtime.startBenchmark(10);
    expect(second.wait(10_000)).toBeDefined();
  });

  it("invalidates operations and rejects use after close", () => {
    const runtime = Runtime.load();
    const op = runtime.startBenchmark(4_294_967_295);
    runtime.close();
    expect(() => runtime.systemStats()).toThrow(/closed/);
    try {
      op.wait(0);
      throw new Error("operation must be invalid after the runtime is closed");
    } catch (error) {
      expect((error as RuntimeError).status).toBe(Status.InvalidHandle);
    }
    runtime.close(); // idempotent
  });
});

suite("runtime:* modules", () => {
  it("imports runtime:system through the preload plugin", async () => {
    const { system } = await import("runtime:system");
    expect(system.capabilities()).toContain("system.stats");
    expect(system.stats().arch.length).toBeGreaterThan(0);
    expect((await system.bench(1000)).message).toContain("1000");
  });

  it("cancels a native benchmark when the AbortSignal fires", async () => {
    const { system } = await import("runtime:system");
    const controller = new AbortController();
    const running = system.bench(4_294_967_295, { signal: controller.signal });
    setTimeout(() => controller.abort(new Error("stop")), 20);
    await expect(running).rejects.toThrow("stop");
    // the slot is free again
    expect((await system.bench(10)).message).toContain("10");
  });

  it("rejects an already aborted signal without starting native work", async () => {
    const { system } = await import("runtime:system");
    const signal = AbortSignal.abort(new Error("late"));
    await expect(system.bench(10, { signal })).rejects.toThrow("late");
  });

  it("keeps runtime:desktop and runtime:browser reserved with an explicit error", async () => {
    await expect(import("runtime:desktop")).rejects.toThrow(/not available yet/);
    await expect(import("runtime:browser")).rejects.toThrow(/not available yet/);
  });
});
