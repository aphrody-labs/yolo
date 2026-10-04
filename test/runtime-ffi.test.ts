import { describe, expect, it } from "bun:test";
import { ptr } from "bun:ffi";
import {
  nativeLibrary,
  readNativeBytes,
  readOwnedBytes,
  toCString,
} from "../packages/runtime/src/ffi";

describe("runtime SDK ffi helpers", () => {
  it("toCString appends a NUL", () => {
    expect([...toCString("ab")]).toEqual([97, 98, 0]);
  });

  it("readNativeBytes copies and frees", () => {
    const src = new Uint8Array([1, 2, 3]);
    let freed = 0;
    const out = readNativeBytes(ptr(src), 3, (a) => (freed = a));
    expect([...out]).toEqual([1, 2, 3]);
    expect(freed).toBe(Number(ptr(src)));
  });

  it("readOwnedBytes returns null for an empty slot", () => {
    expect(readOwnedBytes(new Uint8Array(24), () => {})).toBeNull();
  });

  it("nativeLibrary resolves an explicit path", () => {
    const lib = nativeLibrary({ name: "x", path: import.meta.path, symbols: {} });
    expect(lib.resolvePath()).toBe(import.meta.path);
  });

  it("nativeLibrary reports a diagnostic and honours fileNames", () => {
    const lib = nativeLibrary({ name: "nope", fileNames: ["Nope.Ffi.so"], symbols: {} });
    expect(lib.isAvailable()).toBe(false);
    expect(lib.loadError()).toContain("Nope.Ffi.so");
  });
});
