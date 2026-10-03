/**
 * Public module surface of the runtime: `runtime:system` (capabilities `system.stats` and
 * `bench.compute`). `runtime:desktop` and `runtime:browser` are reserved names whose providers
 * arrive with phases R3 and R4; importing them fails with an explicit error until then.
 *
 * One shared runtime instance per process, created lazily and closed at exit.
 */
import {
  Runtime,
  type BenchmarkResult,
  type BuildInfo,
  type ManagedProcess,
  type SpawnOptions,
  type SystemStats,
} from "./index";

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

/** `runtime:process`: capabilities `process.supervise` and `http.probe`. */
export const processes = {
  /** Spawns a child in its own process group; the runtime stops it at exit if still alive. */
  spawn(options: SpawnOptions): ManagedProcess {
    return sharedRuntime().spawn(options);
  },
  /** One HTTP GET on a native worker: the status code, or `undefined` when nothing answers (yet). */
  probeHttp(host: string, port: number, path = "/", timeoutMs = 500): Promise<number | undefined> {
    return sharedRuntime().probeHttp(host, port, path, timeoutMs);
  },
};

export const RESERVED_MODULES = ["runtime:desktop", "runtime:browser"] as const;
