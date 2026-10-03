declare module "runtime:system" {
  export const system: {
    stats(): { os: string; arch: string; timestamp_ms: number };
    bench(
      iterations: number,
      options?: { signal?: AbortSignal },
    ): Promise<{ message: string; latency_us: number }>;
    info(): {
      name: string;
      version: string;
      abi: string;
      target: string;
      rustc: string;
      git_rev: string;
      panic_recovery: boolean;
    };
    capabilities(): string[];
  };
}

declare module "runtime:process" {
  import type { ManagedProcess, SpawnOptions } from "@aphrody/runtime-sdk";
  export const processes: {
    spawn(options: SpawnOptions): ManagedProcess;
    probeHttp(
      host: string,
      port: number,
      path?: string,
      timeoutMs?: number,
    ): Promise<number | undefined>;
  };
}

// Reserved for the desktop (R3) and browser (R4) phases: importing them throws until then.
declare module "runtime:desktop" {
  export {};
}
declare module "runtime:browser" {
  export {};
}
