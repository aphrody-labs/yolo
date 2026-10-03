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

/**
 * Built-in free-space floor, used only when nothing else says otherwise. The floor is a variable: resolveMinFree
 * takes `--min-free`, then `YOLO_MIN_FREE`, then `[space] min_free` of host-policy.toml (per host), then this.
 */
export const DEFAULT_MIN_FREE = 0.2;

/** "0.3", "30" (percent when > 1) and "30%" all mean 30 %. Returns null for anything that is not a ratio in [0, 1]. */
export function parseRatio(text: string | number | undefined | null): number | null {
  if (text === undefined || text === null || text === "") return null;
  const raw = typeof text === "number" ? text : Number(String(text).trim().replace(/%$/, ""));
  if (!Number.isFinite(raw)) return null;
  const pct = typeof text === "string" && text.trim().endsWith("%");
  const ratio = pct || raw > 1 ? raw / 100 : raw;
  return ratio >= 0 && ratio <= 1 ? ratio : null;
}

/** First valid source wins; a value that is present but invalid is an error, never silently skipped. */
export function resolveMinFree(sources: {
  flag?: string | undefined;
  env?: string | undefined;
  policy?: number | undefined;
}): number {
  for (const [name, value] of [
    ["--min-free", sources.flag],
    ["YOLO_MIN_FREE", sources.env],
    ["[space] min_free", sources.policy],
  ] as const) {
    if (value === undefined || value === "") continue;
    const r = parseRatio(value);
    if (r === null)
      throw new Error(`${name}: "${value}" is not a ratio between 0 and 1 (or 0 and 100 %)`);
    return r;
  }
  return DEFAULT_MIN_FREE;
}

/** `df` of the filesystem that holds `path`, walking up to the nearest existing parent (the path may not exist yet). */
export function diskProbeCommand(path: string): string {
  const q = `'${path.replaceAll("'", `'\\''`)}'`;
  return `d=${q}; while [ ! -e "$d" ] && [ "$d" != / ]; do d=$(dirname "$d"); done; df -B1 --output=size,avail -- "$d"`;
}

export interface DiskDecision {
  readonly ok: boolean;
  readonly message: string;
}

/** Decide from the stdout of {@link diskProbeCommand}; an unreadable probe refuses, it never assumes free space. */
export function diskDecision(
  probeStdout: string | null,
  minFreeRatio: number = DEFAULT_MIN_FREE,
): DiskDecision {
  if (probeStdout === null)
    return { ok: false, message: "cannot read the free space of the build host" };
  let df: { totalBytes: number; freeBytes: number };
  try {
    df = parseDfSizeAvail(probeStdout);
  } catch {
    return { ok: false, message: "cannot read the free space of the build host" };
  }
  const g = spaceGate(df.totalBytes, df.freeBytes, minFreeRatio);
  const pct = (g.freeRatio * 100).toFixed(1);
  return g.ok
    ? { ok: true, message: `${pct} % free` }
    : {
        ok: false,
        message: `${pct} % free is below the ${(minFreeRatio * 100).toFixed(0)} % floor (short by ${Math.ceil(g.shortfallBytes / 1024 ** 3)} GiB)`,
      };
}

// ---------------------------------------------------------------------------------- parallel recursive scan

/** Counting semaphore with direct hand-off: at most `limit` tasks run at once, FIFO, no slot is ever skipped. */
export function limiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  const max = Math.max(1, Math.floor(limit));
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next !== undefined) next();
      else active--;
    }
  };
}

const quote = (v: string): string => `'${v.replaceAll("'", `'\\''`)}'`;

export interface ScanOptions {
  /** runs one shell command and returns its stdout (ssh exec on a remote host, sh -c locally) */
  readonly run: (command: string) => Promise<string>;
  /** how many directory levels are split into independent scans (0 = one `find` per path) */
  readonly depth: number;
  /** concurrent commands in flight, shared by the whole recursion */
  readonly parallel: number;
  readonly sudo?: boolean;
  /** file names per `find` when a directory's loose files are batched */
  readonly batch?: number;
}

/**
 * Link records under `paths`, scanned recursively and concurrently: directories down to `depth` levels become
 * independent scans, the loose files of each level are batched, and one limiter bounds the commands in flight.
 * The records are the same multiset a single `find` would print, so estimateReclaim gives the same answer: an
 * inode seen through several subtrees is merged by (device, inode), not by path.
 */
export async function scanLinks(paths: readonly string[], o: ScanOptions): Promise<LinkRecord[]> {
  const gate = limiter(o.parallel);
  const sh = (command: string): Promise<string> => gate(() => o.run(command));
  const pre = o.sudo === true ? "sudo -n " : "";
  const batch = Math.max(1, o.batch ?? 200);
  const links = (args: string): string =>
    `${pre}find ${args} -xdev -type f -printf '%D %i %n %b\\n' 2>/dev/null || true`;

  async function files(names: readonly string[]): Promise<LinkRecord[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < names.length; i += batch) chunks.push(names.slice(i, i + batch));
    const parts = await Promise.all(
      chunks.map(async (c) =>
        parseFindLinks(await sh(links(`${c.map(quote).join(" ")} -maxdepth 0`))),
      ),
    );
    return parts.flat();
  }

  async function walk(path: string, depth: number): Promise<LinkRecord[]> {
    if (depth <= 0) return parseFindLinks(await sh(links(quote(path))));
    const listing = await sh(
      `${pre}find ${quote(path)} -mindepth 1 -maxdepth 1 -xdev -printf '%y\\t%p\\n' 2>/dev/null || true`,
    );
    const dirs: string[] = [];
    const loose: string[] = [];
    for (const line of listing.split("\n")) {
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      (line.slice(0, tab) === "d" ? dirs : loose).push(line.slice(tab + 1));
    }
    const parts = await Promise.all([...dirs.map((d) => walk(d, depth - 1)), files(loose)]);
    return parts.flat();
  }

  const roots = await Promise.all(
    paths.map(async (path) => {
      const kind = (
        await sh(`${pre}find ${quote(path)} -maxdepth 0 -printf '%y' 2>/dev/null || true`)
      ).trim();
      if (kind === "d") return walk(path, o.depth);
      return kind === "" ? [] : files([path]);
    }),
  );
  return roots.flat();
}
