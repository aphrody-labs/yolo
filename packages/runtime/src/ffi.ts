/**
 * Generic Bun FFI plumbing for native libraries that follow the YOLO owned-buffer convention
 * (`{ data: *mut u8, len: usize, cap: usize }` out-slots released by a `*_free_fields` symbol).
 * Consumers (iecode NIE, Aphrody engines) declare their symbols and library names; discovery,
 * lazy loading with a diagnostic, C strings and owned-byte reads live here once.
 */
import { dlopen, suffix, toArrayBuffer, type FFIFunction, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** NUL-terminated UTF-8 copy of `text`. */
export function toCString(text: string): Uint8Array {
  const encoded = encoder.encode(text);
  const out = new Uint8Array(encoded.length + 1);
  out.set(encoded);
  return out;
}

/** Size in bytes of an owned-buffer slot on 64-bit targets. */
export const OWNED_SLOT_BYTES = 24;

/**
 * Copy the bytes of a filled owned-buffer slot and release the native allocation through
 * `free(data, len, cap)`. Returns null for an empty or unset slot (the allocation, if any, is still freed).
 */
export function readOwnedBytes(
  slot: Uint8Array,
  free: (data: bigint, len: bigint, cap: bigint) => void,
): Uint8Array | null {
  const view = new DataView(slot.buffer, slot.byteOffset, slot.byteLength);
  const data = view.getBigUint64(0, true);
  const len = view.getBigUint64(8, true);
  const cap = view.getBigUint64(16, true);
  if (data === 0n || len === 0n) {
    if (data !== 0n) free(data, len, cap);
    return null;
  }
  try {
    return new Uint8Array(
      toArrayBuffer(Number(data) as unknown as Pointer, 0, Number(len)),
    ).slice();
  } finally {
    free(data, len, cap);
  }
}

export function readOwnedString(
  slot: Uint8Array,
  free: (data: bigint, len: bigint, cap: bigint) => void,
): string | null {
  const bytes = readOwnedBytes(slot, free);
  return bytes ? decoder.decode(bytes) : null;
}

export function readOwnedJson<T = unknown>(
  slot: Uint8Array,
  free: (data: bigint, len: bigint, cap: bigint) => void,
): T | null {
  const text = readOwnedString(slot, free);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export interface NativeLibraryOptions<S extends Record<string, FFIFunction>> {
  /** Library base name without prefix or suffix, e.g. `iecode` for `libiecode.so`. */
  name: string;
  symbols: S;
  /** Environment variables naming an explicit library file, checked first, in order. */
  envPaths?: readonly string[];
  /** Extra directories searched after the executable dir and `~/.local/bin`. */
  searchDirs?: readonly string[];
  /** Cargo hint appended to the "not found" diagnostic. */
  buildHint?: string;
}

export interface NativeLibrary<S extends Record<string, FFIFunction>> {
  resolvePath(): string | null;
  /** Loaded symbol table, or null (see `loadError`). Loading is attempted once. */
  load(): ReturnType<typeof dlopen<S>>["symbols"] | null;
  isAvailable(): boolean;
  loadError(): string | null;
  libraryPath(): string | null;
}

/** Lazy, diagnosable native library loader. */
export function nativeLibrary<S extends Record<string, FFIFunction>>(
  options: NativeLibraryOptions<S>,
): NativeLibrary<S> {
  const file =
    process.platform === "win32" ? `${options.name}.dll` : `lib${options.name}.${suffix}`;
  let attempted = false;
  let symbols: ReturnType<typeof dlopen<S>>["symbols"] | null = null;
  let error: string | null = null;
  let path: string | null = null;

  const resolvePath = (): string | null => {
    for (const env of options.envPaths ?? []) {
      const value = process.env[env];
      if (value && existsSync(value)) return value;
    }
    const candidates = [
      resolve(dirname(process.execPath), file),
      resolve(homedir(), ".local/bin", file),
      ...(options.searchDirs ?? []).map((dir) => resolve(dir, file)),
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  };
  const load = () => {
    if (attempted) return symbols;
    attempted = true;
    const found = resolvePath();
    if (!found) {
      error = `Native binary ${file} not found.${options.buildHint ? ` ${options.buildHint}` : ""}`;
      return null;
    }
    try {
      symbols = dlopen(found, options.symbols).symbols;
      path = found;
      error = null;
    } catch (cause) {
      error = `Failed to dlopen ${found}: ${cause instanceof Error ? cause.message : String(cause)}`;
      symbols = null;
    }
    return symbols;
  };
  return {
    resolvePath,
    load,
    isAvailable: () => load() !== null,
    loadError: () => (load(), error),
    libraryPath: () => (load(), path),
  };
}
