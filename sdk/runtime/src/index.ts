/**
 * Light SDK of the YOLO native runtime (phase R0 slice).
 *
 * Loads the precompiled `yolo_runtime` library through `bun:ffi` and its versioned C ABI
 * (`crates/yolo-runtime/include/yolo_runtime.h`, `docs/RUNTIME-ABI.md`). Nothing here compiles or
 * links Tauri, wry, tao, Bun internals or Obscura: the consumer only needs this file and the
 * prebuilt artifact.
 */
import { dlopen, FFIType, ptr, read, suffix, toArrayBuffer, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** ABI major this SDK was written for. A library with another major is refused before any call. */
export const EXPECTED_ABI_MAJOR = 1;
export const EXPECTED_ABI_MINOR = 0;

export const Status = {
  Ok: 0,
  InvalidArgument: 1,
  AbiMismatch: 2,
  InvalidHandle: 3,
  Cancelled: 4,
  Timeout: 5,
  Busy: 6,
  Internal: 7,
  Panic: 8,
} as const;
export type StatusCode = (typeof Status)[keyof typeof Status];

const STATUS_NAMES = Object.fromEntries(Object.entries(Status).map(([k, v]) => [v, k])) as Record<
  number,
  string
>;

export class RuntimeError extends Error {
  readonly status: number;
  readonly statusName: string;
  constructor(status: number, message: string) {
    const statusName = STATUS_NAMES[status] ?? `Unknown(${status})`;
    super(`${statusName}: ${message}`);
    this.name = "RuntimeError";
    this.status = status;
    this.statusName = statusName;
  }
}

export interface BuildInfo {
  readonly name: string;
  readonly version: string;
  readonly abi: string;
  readonly target: string;
  readonly rustc: string;
  readonly git_rev: string;
  readonly panic_recovery: boolean;
}

export interface SystemStats {
  readonly os: string;
  readonly arch: string;
  readonly timestamp_ms: number;
}

export interface BenchmarkResult {
  readonly message: string;
  readonly latency_us: number;
}

export interface LoadOptions {
  /** Path of the library; defaults to `$YOLO_RUNTIME_LIB`, then `target/runtime/`. */
  readonly libraryPath?: string;
  /** Maximum concurrent operations of the runtime (library default when omitted). */
  readonly maxOperations?: number;
}

const BUFFER_BYTES = 24; // YoloBuffer { data: *mut u8, len: usize, cap: usize } on 64-bit targets

/** File name Cargo gives the cdylib: `libyolo_runtime.so|dylib`, `yolo_runtime.dll` on Windows. */
export function libraryFile(): string {
  return process.platform === "win32" ? "yolo_runtime.dll" : `libyolo_runtime.${suffix}`;
}

/**
 * Resolution order: `$YOLO_RUNTIME_LIB`, the active installed artifact
 * (`$YOLO_RUNTIME_HOME/<target>/current`, see `artifact.ts`), then the local `target/runtime/`.
 */
export function defaultLibraryPath(): string {
  const fromEnv = process.env["YOLO_RUNTIME_LIB"];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const home = process.env["YOLO_RUNTIME_HOME"];
  const base =
    home !== undefined && home !== ""
      ? resolve(home)
      : resolve(process.env["HOME"] ?? "", ".yolo/runtime");
  const installed = resolve(base, installedTarget(), "current", libraryFile());
  if (existsSync(installed)) return installed;
  return resolve(import.meta.dir, "../../..", "target/runtime", libraryFile());
}

function installedTarget(): string {
  const targets: Record<string, string> = {
    "linux-x64": "x86_64-unknown-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
    "darwin-x64": "x86_64-apple-darwin",
    "darwin-arm64": "aarch64-apple-darwin",
    "win32-x64": "x86_64-pc-windows-msvc",
  };
  return targets[`${process.platform}-${process.arch}`] ?? "unsupported";
}

const SYMBOLS = {
  yolo_abi_version: { args: [], returns: FFIType.u32 },
  yolo_runtime_create: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  yolo_runtime_destroy: { args: [FFIType.u64], returns: FFIType.i32 },
  yolo_runtime_build_info: { args: [FFIType.ptr], returns: FFIType.i32 },
  yolo_runtime_capabilities: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
  yolo_system_stats: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
  yolo_bench_start: { args: [FFIType.u64, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  yolo_operation_wait: { args: [FFIType.u64, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  yolo_operation_cancel: { args: [FFIType.u64], returns: FFIType.i32 },
  yolo_operation_release: { args: [FFIType.u64], returns: FFIType.i32 },
  yolo_buffer_free: { args: [FFIType.ptr], returns: FFIType.void },
  yolo_last_error: { args: [FFIType.ptr], returns: FFIType.i32 },
} as const;

type Library = ReturnType<typeof dlopen<typeof SYMBOLS>>;
type Symbols = Library["symbols"];

function readBuffer(symbols: Symbols, buffer: Uint8Array): string {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const dataPtr = read.ptr(ptr(buffer), 0);
  const len = Number(view.getBigUint64(8, true));
  if (!dataPtr) return "";
  // Copy before releasing: the memory belongs to the library.
  const text = new TextDecoder().decode(new Uint8Array(toArrayBuffer(dataPtr, 0, len)).slice());
  symbols.yolo_buffer_free(ptr(buffer));
  return text;
}

function lastError(symbols: Symbols): string {
  const buffer = new Uint8Array(BUFFER_BYTES);
  if (symbols.yolo_last_error(ptr(buffer)) !== Status.Ok) return "unknown error";
  try {
    return (JSON.parse(readBuffer(symbols, buffer)) as { message: string }).message;
  } catch {
    return "unknown error";
  }
}

function check(symbols: Symbols, status: number): void {
  if (status !== Status.Ok) throw new RuntimeError(status, lastError(symbols));
}

function callJson<T>(symbols: Symbols, call: (out: Pointer) => number): T {
  const buffer = new Uint8Array(BUFFER_BYTES);
  check(symbols, call(ptr(buffer)));
  return JSON.parse(readBuffer(symbols, buffer)) as T;
}

/** A started native operation. Always `release()` it (or use `using`). */
export class Operation implements Disposable {
  #symbols: Symbols;
  #handle: bigint;
  #released = false;

  constructor(symbols: Symbols, handle: bigint) {
    this.#symbols = symbols;
    this.#handle = handle;
  }

  /** Waits up to `timeoutMs`. Resolves to `undefined` on timeout (the operation keeps running). */
  wait(timeoutMs = 0): BenchmarkResult | undefined {
    const buffer = new Uint8Array(BUFFER_BYTES);
    const status = this.#symbols.yolo_operation_wait(this.#handle, timeoutMs, ptr(buffer));
    if (status === Status.Timeout) return undefined;
    check(this.#symbols, status);
    return JSON.parse(readBuffer(this.#symbols, buffer)) as BenchmarkResult;
  }

  /** Requests cancellation; `wait()` then throws a `Cancelled` RuntimeError. */
  cancel(): void {
    check(this.#symbols, this.#symbols.yolo_operation_cancel(this.#handle));
  }

  release(): void {
    if (this.#released) return;
    this.#released = true;
    check(this.#symbols, this.#symbols.yolo_operation_release(this.#handle));
  }

  [Symbol.dispose](): void {
    this.release();
  }
}

/** A loaded runtime instance. `close()` cancels and joins every operation it owns. */
export class Runtime implements Disposable {
  #library: Library;
  #handle: bigint;
  #closed = false;
  readonly abi: { major: number; minor: number };

  private constructor(library: Library, handle: bigint, abi: { major: number; minor: number }) {
    this.#library = library;
    this.#handle = handle;
    this.abi = abi;
  }

  static load(options: LoadOptions = {}): Runtime {
    const path = options.libraryPath ?? defaultLibraryPath();
    if (!existsSync(path)) {
      throw new Error(
        `YOLO runtime library not found at ${path}. Build it with \`cargo build --profile runtime -p yolo-runtime\` ` +
          `or point YOLO_RUNTIME_LIB to a prebuilt artifact.`,
      );
    }
    const library = dlopen(path, SYMBOLS);
    const symbols = library.symbols;

    // Negotiate before any other call: refuse an incompatible library.
    const version = symbols.yolo_abi_version();
    const major = version >>> 16;
    const minor = version & 0xffff;
    if (major !== EXPECTED_ABI_MAJOR || minor < EXPECTED_ABI_MINOR) {
      library.close();
      throw new RuntimeError(
        Status.AbiMismatch,
        `library implements ABI ${major}.${minor}, this SDK needs ${EXPECTED_ABI_MAJOR}.${EXPECTED_ABI_MINOR}+`,
      );
    }

    const info = new Uint32Array([
      16,
      EXPECTED_ABI_MAJOR,
      EXPECTED_ABI_MINOR,
      options.maxOperations ?? 0,
    ]);
    const out = new BigUint64Array(1);
    try {
      check(symbols, symbols.yolo_runtime_create(ptr(info), ptr(out)));
    } catch (error) {
      library.close();
      throw error;
    }
    return new Runtime(library, out[0] as bigint, { major, minor });
  }

  #live(): Symbols {
    if (this.#closed) throw new RuntimeError(Status.InvalidHandle, "runtime is closed");
    return this.#library.symbols;
  }

  buildInfo(): BuildInfo {
    const symbols = this.#live();
    return callJson<BuildInfo>(symbols, (out) => symbols.yolo_runtime_build_info(out));
  }

  capabilities(): string[] {
    const symbols = this.#live();
    return callJson<string[]>(symbols, (out) =>
      symbols.yolo_runtime_capabilities(this.#handle, out),
    );
  }

  systemStats(): SystemStats {
    const symbols = this.#live();
    return callJson<SystemStats>(symbols, (out) => symbols.yolo_system_stats(this.#handle, out));
  }

  startBenchmark(iterations: number): Operation {
    const symbols = this.#live();
    const out = new BigUint64Array(1);
    check(symbols, symbols.yolo_bench_start(this.#handle, iterations, ptr(out)));
    return new Operation(symbols, out[0] as bigint);
  }

  /**
   * Runs a benchmark without blocking the event loop: polls the native operation, cancels it when
   * `signal` aborts (rejecting with the signal's reason) and always releases it.
   */
  async benchmark(
    iterations: number,
    options: { signal?: AbortSignal; pollMs?: number } = {},
  ): Promise<BenchmarkResult> {
    const { signal, pollMs = 5 } = options;
    signal?.throwIfAborted();
    const operation = this.startBenchmark(iterations);
    try {
      for (;;) {
        if (signal?.aborted) {
          operation.cancel();
          operation.release();
          throw signal.reason;
        }
        const result = operation.wait(0);
        if (result !== undefined) return result;
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    } finally {
      operation.release();
    }
  }

  close(): void {
    if (this.#closed) return;
    const symbols = this.#library.symbols;
    this.#closed = true;
    check(symbols, symbols.yolo_runtime_destroy(this.#handle));
    this.#library.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
