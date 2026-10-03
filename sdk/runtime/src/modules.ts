/**
 * Public module surface of the runtime: `runtime:system` (capabilities `system.stats` and
 * `bench.compute`). `runtime:desktop` and `runtime:browser` are reserved names whose providers
 * arrive with phases R3 and R4; importing them fails with an explicit error until then.
 *
 * One shared runtime instance per process, created lazily and closed at exit.
 */
import { Runtime, type BenchmarkResult, type BuildInfo, type SystemStats } from "./index";

let shared: Runtime | undefined;

export function sharedRuntime(): Runtime {
  if (shared === undefined) {
    shared = Runtime.load();
    process.once("exit", () => closeSharedRuntime());
  }
  return shared;
}

export function closeSharedRuntime(): void {
  shared?.close();
  shared = undefined;
}

export const system = {
  /** Operating system, architecture and timestamp. */
  stats(): SystemStats {
    return sharedRuntime().systemStats();
  },
  /** Cancellable benchmark; pass an `AbortSignal` to cancel it natively. */
  bench(iterations: number, options?: { signal?: AbortSignal }): Promise<BenchmarkResult> {
    return sharedRuntime().benchmark(iterations, options);
  },
  /** Build identity and ABI of the loaded runtime artifact. */
  info(): BuildInfo {
    return sharedRuntime().buildInfo();
  },
  capabilities(): string[] {
    return sharedRuntime().capabilities();
  },
};

export const RESERVED_MODULES = ["runtime:desktop", "runtime:browser"] as const;
