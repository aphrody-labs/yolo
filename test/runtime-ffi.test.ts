import { expect, test } from "bun:test";
import {
  nativeLibrary,
  readOwnedBytes,
  readOwnedJson,
  toCString,
} from "../packages/runtime/src/ffi.ts";

test("toCString is NUL terminated UTF-8", () => {
  expect([...toCString("é")]).toEqual([0xc3, 0xa9, 0]);
});

test("an empty or unset owned slot reads as null and frees any allocation", () => {
  const freed: bigint[] = [];
  const slot = new Uint8Array(24);
  expect(readOwnedBytes(slot, (d) => freed.push(d))).toBeNull();
  new DataView(slot.buffer).setBigUint64(0, 7n, true);
  expect(readOwnedBytes(slot, (d) => freed.push(d))).toBeNull();
  expect(readOwnedJson(slot, () => {})).toBeNull();
  expect(freed).toEqual([7n]);
});

test("a missing library reports a diagnostic instead of throwing", () => {
  const lib = nativeLibrary({
    name: "yolo-no-such-lib",
    symbols: {},
    buildHint: "cargo build -p x",
  });
  expect(lib.isAvailable()).toBe(false);
  expect(lib.loadError()).toContain("not found");
  expect(lib.loadError()).toContain("cargo build -p x");
  expect(lib.libraryPath()).toBeNull();
});
