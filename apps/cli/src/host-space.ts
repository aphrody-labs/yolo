/**
 * Space accounting for `yolo host space`: what a deletion really frees, and whether a disk keeps the
 * free-space floor. Pure functions, zero dependencies.
 *
 * Why not `du`: summing `du` over several directories counts a hard-linked file once per directory, and a
 * file whose other links stay outside the deleted set frees nothing. On 2026-10-03 a deletion predicted at
 * 43 GiB freed 12 GiB because the "stale" copy shared blocks with the live one. The exact rule: unlinking a
 * set of paths frees the blocks of an inode if and only if every one of its links is inside the set.
 */

/** One link found under the deletion set: `find -printf '%D %i %n %b\n'` (device, inode, link count, 512-byte blocks). */
export interface LinkRecord {
  readonly dev: string;
  readonly ino: string;
  readonly nlink: number;
  readonly blocks: number;
}

export function parseFindLinks(text: string): LinkRecord[] {
  const out: LinkRecord[] = [];
  for (const line of text.split("\n")) {
    const m = /^(\S+) (\d+) (\d+) (\d+)$/.exec(line.trim());
    if (m === null) continue;
    out.push({ dev: m[1]!, ino: m[2]!, nlink: Number(m[3]), blocks: Number(m[4]) });
  }
  return out;
}

export interface ReclaimEstimate {
  /** sum over every link found: what adding up per-directory `du` reports (counts a hard link once per name) */
  readonly naiveBytes: number;
  /** each distinct inode once: what a single `du` over the whole set reports */
  readonly uniqueBytes: number;
  /** blocks that really come back: inodes with every link inside the set */
  readonly freedBytes: number;
  /** unique bytes kept alive by a link outside the set */
  readonly keptBytes: number;
  readonly inodes: number;
}

const BLOCK = 512;

export function estimateReclaim(records: readonly LinkRecord[]): ReclaimEstimate {
  const seen = new Map<string, { nlink: number; blocks: number; inside: number }>();
  let naive = 0;
  for (const r of records) {
    naive += r.blocks * BLOCK;
    const key = `${r.dev}:${r.ino}`;
    const e = seen.get(key);
    if (e === undefined) seen.set(key, { nlink: r.nlink, blocks: r.blocks, inside: 1 });
    else e.inside += 1;
  }
  let unique = 0;
  let freed = 0;
  for (const e of seen.values()) {
    const bytes = e.blocks * BLOCK;
    unique += bytes;
    if (e.inside >= e.nlink) freed += bytes;
  }
  return {
    naiveBytes: naive,
    uniqueBytes: unique,
    freedBytes: freed,
    keptBytes: unique - freed,
    inodes: seen.size,
  };
}

export interface SpaceGate {
  readonly ok: boolean;
  readonly freeRatio: number;
  /** bytes that must still be freed to reach the floor (0 when ok) */
  readonly shortfallBytes: number;
  /** smallest free byte count that satisfies the floor */
  readonly requiredFreeBytes: number;
}

/** Free-space floor: ok iff freeBytes >= minFreeRatio * totalBytes, exact in integer arithmetic. */
export function spaceGate(totalBytes: number, freeBytes: number, minFreeRatio: number): SpaceGate {
  if (!(totalBytes > 0)) throw new Error("totalBytes must be positive");
  if (!(minFreeRatio >= 0 && minFreeRatio <= 1)) throw new Error("minFreeRatio must be in [0, 1]");
  const free = Math.min(Math.max(freeBytes, 0), totalBytes);
  const required = Math.ceil(totalBytes * minFreeRatio);
  return {
    ok: free >= required,
    freeRatio: free / totalBytes,
    shortfallBytes: Math.max(0, required - free),
    requiredFreeBytes: required,
  };
}

/** `df -B1 --output=size,avail <mount>`: header line, then "<size> <avail>". */
export function parseDfSizeAvail(text: string): { totalBytes: number; freeBytes: number } {
  for (const line of text.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (m !== null) return { totalBytes: Number(m[1]), freeBytes: Number(m[2]) };
  }
  throw new Error("df output has no size/avail line");
}
