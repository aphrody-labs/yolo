import { describe, expect, it } from "bun:test";
import {
  estimateReclaim,
  parseDfSizeAvail,
  parseFindLinks,
  spaceGate,
  type LinkRecord,
} from "../apps/cli/src/host-space";

const link = (ino: number, nlink: number, blocks: number, dev = "2049"): LinkRecord => ({
  dev,
  ino: String(ino),
  nlink,
  blocks,
});

describe("estimateReclaim", () => {
  it("frees everything when no file has another link", () => {
    const e = estimateReclaim([link(1, 1, 8), link(2, 1, 16)]);
    expect(e).toEqual({
      naiveBytes: 24 * 512,
      uniqueBytes: 24 * 512,
      freedBytes: 24 * 512,
      keptBytes: 0,
      inodes: 2,
    });
  });

  it("frees nothing when the other link lives outside the set (the 2026-10-03 shenron case)", () => {
    // /home/ubuntu/shenron/.../file is hard-linked to /srv/shenron/shared/.../file; only the home copy is deleted
    const e = estimateReclaim([link(10, 2, 1_000_000)]);
    expect(e.naiveBytes).toBe(1_000_000 * 512);
    expect(e.freedBytes).toBe(0);
    expect(e.keptBytes).toBe(1_000_000 * 512);
  });

  it("frees the blocks once when both links are deleted, and a naive sum counts them twice", () => {
    const e = estimateReclaim([link(10, 2, 1_000_000), link(10, 2, 1_000_000)]);
    expect(e.naiveBytes).toBe(2 * 1_000_000 * 512);
    expect(e.uniqueBytes).toBe(1_000_000 * 512);
    expect(e.freedBytes).toBe(1_000_000 * 512);
  });

  it("keeps inodes of different devices apart", () => {
    const e = estimateReclaim([link(5, 1, 8, "1"), link(5, 1, 8, "2")]);
    expect(e.inodes).toBe(2);
    expect(e.freedBytes).toBe(16 * 512);
  });

  it("satisfies freed <= unique <= naive on random sets (seeded)", () => {
    let seed = 0x9e3779b9;
    const rnd = (n: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    for (let round = 0; round < 300; round++) {
      // build files with nlink total links, then pick a random subset of links as the deletion set
      const records: LinkRecord[] = [];
      const files = 1 + rnd(40);
      let expectedFreed = 0;
      for (let f = 0; f < files; f++) {
        const nlink = 1 + rnd(4);
        const blocks = rnd(5000);
        const inside = rnd(nlink + 1); // 0..nlink links inside the set
        for (let i = 0; i < inside; i++) records.push(link(f, nlink, blocks));
        if (inside === nlink) expectedFreed += blocks * 512;
      }
      const e = estimateReclaim(records);
      expect(e.freedBytes).toBe(expectedFreed);
      expect(e.freedBytes).toBeLessThanOrEqual(e.uniqueBytes);
      expect(e.uniqueBytes).toBeLessThanOrEqual(e.naiveBytes);
      expect(e.keptBytes).toBe(e.uniqueBytes - e.freedBytes);
    }
  });
});

describe("parseFindLinks", () => {
  it("parses find -printf '%D %i %n %b' lines and ignores noise", () => {
    expect(parseFindLinks("2049 123 2 8\nfind: warning\n2049 124 1 16\n\n")).toEqual([
      { dev: "2049", ino: "123", nlink: 2, blocks: 8 },
      { dev: "2049", ino: "124", nlink: 1, blocks: 16 },
    ]);
  });
});

describe("spaceGate", () => {
  const GIB = 1024 ** 3;
  it("accepts exactly the floor and refuses one byte below", () => {
    expect(spaceGate(100, 50, 0.5).ok).toBe(true);
    const below = spaceGate(100, 49, 0.5);
    expect(below.ok).toBe(false);
    expect(below.shortfallBytes).toBe(1);
  });

  it("reports the shortfall of the vps before the cleanup (192 GiB used of 290 GiB, floor 50 %)", () => {
    const g = spaceGate(290 * GIB, 98.6 * GIB, 0.5);
    expect(g.ok).toBe(false);
    expect(g.shortfallBytes / GIB).toBeCloseTo(46.4, 1);
  });

  it("rounds the requirement up and rejects invalid input", () => {
    expect(spaceGate(3, 1, 0.5).requiredFreeBytes).toBe(2);
    expect(() => spaceGate(0, 0, 0.5)).toThrow();
    expect(() => spaceGate(10, 5, 1.5)).toThrow();
  });
});

describe("parseDfSizeAvail", () => {
  it("reads the size and avail columns", () => {
    expect(parseDfSizeAvail("     1B-blocks         Avail\n 311385612288  107270053888\n")).toEqual(
      {
        totalBytes: 311385612288,
        freeBytes: 107270053888,
      },
    );
    expect(() => parseDfSizeAvail("nothing")).toThrow();
  });
});

describe("yolo host space", () => {
  const { runHostCommand } =
    require("../apps/cli/src/host") as typeof import("../apps/cli/src/host");
  const root = new URL("..", import.meta.url).pathname;
  const transport = (find: string, df: string) => ({
    host: "local" as const,
    remote: false,
    async exec(cmd: string) {
      if (cmd.includes("find ")) return { code: 0, stdout: find, stderr: "" };
      return { code: 0, stdout: df, stderr: "" };
    },
    async service() {
      return { code: 1, stdout: "", stderr: "unused" };
    },
    async tune() {
      return { code: 1, stdout: "", stderr: "unused" };
    },
  });
  const GIB = 1024 ** 3;
  const dfText = (total: number, avail: number) => `1B-blocks Avail\n${total} ${avail}\n`;

  it("predicts the floor from the really freed bytes and exits 3 when it is not reached", async () => {
    let printed = "";
    // 30 GiB shared with a live copy (nlink 2, one name inside) + 5 GiB of own files
    const find = `2049 1 2 ${(30 * GIB) / 512}\n2049 2 1 ${(5 * GIB) / 512}\n`;
    const code = await runHostCommand(
      ["space", "/srv/old", "--host", "local", "--min-free", "0.5", "--json"],
      root,
      { transport: transport(find, dfText(290 * GIB, 100 * GIB)), out: (s) => (printed += s) },
    );
    const r = JSON.parse(printed);
    expect(r.estimate.freedBytes).toBe(5 * GIB);
    expect(r.estimate.keptBytes).toBe(30 * GIB);
    expect(r.after.ok).toBe(false);
    expect(code).toBe(3);
  });

  it("exits 0 once the floor is reached", async () => {
    const find = `2049 2 1 ${(60 * GIB) / 512}\n`;
    const code = await runHostCommand(
      ["space", "/srv/old", "--host", "local", "--min-free", "0.5", "--json"],
      root,
      { transport: transport(find, dfText(290 * GIB, 100 * GIB)), out: () => {} },
    );
    expect(code).toBe(0);
  });
});

describe("ship disk gate", () => {
  const { diskDecision, diskProbeCommand, MIN_FREE_RATIO } =
    require("../apps/cli/src/host-space") as typeof import("../apps/cli/src/host-space");
  const GIB = 1024 ** 3;
  const df = (total: number, avail: number) => `1B-blocks Avail\n${total} ${avail}\n`;

  it("fixes the floor at one half", () => {
    expect(MIN_FREE_RATIO).toBe(0.5);
  });

  it("accepts at the floor and refuses below it, with the shortfall in GiB", () => {
    expect(diskDecision(df(290 * GIB, 145 * GIB)).ok).toBe(true);
    const d = diskDecision(df(290 * GIB, Math.round(98.6 * GIB)));
    expect(d.ok).toBe(false);
    expect(d.message).toContain("34.0 % free");
    expect(d.message).toContain("50 % floor");
    expect(d.message).toContain("47 GiB");
  });

  it("refuses when the probe is unreadable instead of assuming free space", () => {
    expect(diskDecision(null).ok).toBe(false);
    expect(diskDecision("garbage").ok).toBe(false);
  });

  it("probes the nearest existing parent of a path that does not exist (run for real)", async () => {
    const cmd = diskProbeCommand("/tmp/yolo-space-nope/a/b/c");
    const out = await Bun.$`sh -c ${cmd}`.text();
    const parsed = require("../apps/cli/src/host-space").parseDfSizeAvail(out);
    expect(parsed.totalBytes).toBeGreaterThan(0);
    expect(diskDecision(out, 0).ok).toBe(true);
  });

  it("quotes hostile paths", () => {
    expect(diskProbeCommand("/x'; rm -rf / #")).toContain(`'/x'\\''; rm -rf / #'`);
  });
});
