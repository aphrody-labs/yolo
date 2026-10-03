/**
 * `yolo awesome`: browse the Aphrody fork of awesome-bun (aphrody-labs/awesome-bun) from the CLI.
 *
 * The README is read from GitHub raw (no clone, no token) and cached under `.cache/awesome/`;
 * `--offline` uses the cache only and `--file` reads a local README (tests, drafts).
 * Zero dependencies, native Bun only.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const DEFAULT_REPO = "aphrody-labs/awesome-bun";
export const DEFAULT_REF = "yolo";

export interface AwesomeEntry {
  readonly name: string;
  readonly url: string;
  readonly description: string;
  readonly section: string;
  /** `owner/repo` when the link points to a GitHub repository. */
  readonly github?: string | undefined;
}

export interface AwesomeSection {
  readonly title: string;
  readonly slug: string;
  readonly entries: readonly AwesomeEntry[];
}

const SKIPPED_SECTIONS = new Set(["contents", "contributing", "license"]);
const ENTRY = /^\s*[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*(?:[-–—:]\s*(.*))?$/;

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function githubRepo(url: string): string | undefined {
  const match = /^https?:\/\/(?:www\.)?github\.com\/([^/#?\s]+)\/([^/#?\s]+)/.exec(url);
  if (match === null) return undefined;
  return `${match[1]}/${(match[2] as string).replace(/\.git$/, "")}`;
}

/** Parses an awesome-list README: `##` headings are sections, `- [name](url) - text` are entries. */
export function parseAwesome(markdown: string): AwesomeSection[] {
  const sections: { title: string; entries: AwesomeEntry[] }[] = [];
  let current: { title: string; entries: AwesomeEntry[] } | undefined;
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const heading = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      const title = (heading[1] as string).trim();
      current = SKIPPED_SECTIONS.has(title.toLowerCase()) ? undefined : { title, entries: [] };
      if (current !== undefined) sections.push(current);
      continue;
    }
    if (/^#\s/.test(line)) {
      current = undefined;
      continue;
    }
    if (current === undefined) continue;
    const entry = ENTRY.exec(line);
    if (entry === null) continue;
    const url = entry[2] as string;
    if (url.startsWith("#")) continue;
    current.entries.push({
      name: (entry[1] as string).trim(),
      url,
      description: (entry[3] ?? "").trim(),
      section: current.title,
      github: githubRepo(url),
    });
  }
  return sections.map((s) => ({ title: s.title, slug: slugify(s.title), entries: s.entries }));
}

export function findSection(
  sections: readonly AwesomeSection[],
  query: string,
): AwesomeSection | undefined {
  const wanted = slugify(query);
  return (
    sections.find((s) => s.slug === wanted) ??
    sections.find((s) => s.slug.startsWith(wanted)) ??
    sections.find((s) => s.title.toLowerCase().includes(query.toLowerCase()))
  );
}

export function searchEntries(sections: readonly AwesomeSection[], query: string): AwesomeEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return sections
    .flatMap((s) => s.entries)
    .filter((entry) => {
      const haystack =
        `${entry.name} ${entry.url} ${entry.description} ${entry.section}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
}

// ---------------------------------------------------------------------------------------------
// Source (GitHub raw + cache)
// ---------------------------------------------------------------------------------------------

export interface SourceOptions {
  readonly repo: string;
  readonly ref: string;
  readonly refresh: boolean;
  readonly offline: boolean;
  readonly file?: string | undefined;
  readonly cacheDir: string;
}

export async function loadReadme(
  options: SourceOptions,
): Promise<{ text: string; origin: string }> {
  if (options.file !== undefined) {
    return { text: await Bun.file(options.file).text(), origin: options.file };
  }
  const cachePath = resolve(options.cacheDir, options.repo, options.ref, "README.md");
  const cached = Bun.file(cachePath);
  if (!options.refresh && (await cached.exists())) {
    return { text: await cached.text(), origin: `cache ${cachePath}` };
  }
  if (options.offline) {
    throw new Error(
      `No cached README for ${options.repo}@${options.ref}; run without --offline first`,
    );
  }
  const url = `https://raw.githubusercontent.com/${options.repo}/${options.ref}/README.md`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  const text = await response.text();
  mkdirSync(dirname(cachePath), { recursive: true });
  await Bun.write(cachePath, text);
  return { text, origin: url };
}

// ---------------------------------------------------------------------------------------------
// Link check
// ---------------------------------------------------------------------------------------------

export interface LinkResult {
  readonly entry: AwesomeEntry;
  readonly status: number | "error";
  readonly detail?: string | undefined;
}

export async function checkLinks(
  entries: readonly AwesomeEntry[],
  options: { concurrency: number; timeoutMs: number },
): Promise<LinkResult[]> {
  const results: LinkResult[] = Array.from({ length: entries.length });
  let next = 0;
  const probe = async (entry: AwesomeEntry): Promise<LinkResult> => {
    for (const method of ["HEAD", "GET"] as const) {
      try {
        const response = await fetch(entry.url, {
          method,
          redirect: "follow",
          signal: AbortSignal.timeout(options.timeoutMs),
          headers: { "user-agent": "yolo-awesome/1" },
        });
        // Some servers reject HEAD: retry once with GET before calling the link dead.
        if (method === "HEAD" && response.status >= 400) continue;
        return { entry, status: response.status };
      } catch (error) {
        if (method === "GET") {
          return {
            entry,
            status: "error",
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }
    }
    return { entry, status: "error" };
  };
  const workers = Array.from({ length: Math.max(1, options.concurrency) }, async () => {
    while (next < entries.length) {
      const index = next++;
      results[index] = await probe(entries[index] as AwesomeEntry);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------------------------

const HELP = `\x1b[1myolo awesome\x1b[0m — browse ${DEFAULT_REPO}

  awesome [stats]            Sections and entry counts
  awesome sections           Section titles
  awesome list [section]     Entries (all sections, or one)
  awesome search <words..>   Entries matching every word (name, url, description, section)
  awesome github             GitHub repositories referenced by the list
  awesome check [section]    HTTP check of the links (network; --concurrency N, --timeout MS)

Options: --repo owner/name  --ref branch (default ${DEFAULT_REF})  --refresh  --offline
         --file README.md   --json`;

export async function runAwesomeCommand(args: readonly string[], rootDir: string): Promise<number> {
  const positional: string[] = [];
  let repo = DEFAULT_REPO;
  let ref = DEFAULT_REF;
  let refresh = false;
  let offline = false;
  let json = false;
  let file: string | undefined;
  let concurrency = 8;
  let timeoutMs = 8000;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const value = (): string => {
      const v = args[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };
    if (arg === "--repo") repo = value();
    else if (arg === "--ref") ref = value();
    else if (arg === "--refresh") refresh = true;
    else if (arg === "--offline") offline = true;
    else if (arg === "--json") json = true;
    else if (arg === "--file") file = resolve(rootDir, value());
    else if (arg === "--concurrency") concurrency = Number(value());
    else if (arg === "--timeout") timeoutMs = Number(value());
    else if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      return 0;
    } else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else positional.push(arg);
  }

  const { text, origin } = await loadReadme({
    repo,
    ref,
    refresh,
    offline,
    file,
    cacheDir: resolve(rootDir, ".cache/awesome"),
  });
  const sections = parseAwesome(text);
  const [command = "stats", ...rest] = positional;
  const print = (value: unknown, human: () => void): void => {
    if (json) console.log(JSON.stringify(value, null, 2));
    else human();
  };
  const line = (e: AwesomeEntry): string =>
    `  ${e.name}  \x1b[2m${e.url}\x1b[0m${e.description ? `\n    ${e.description}` : ""}`;

  switch (command) {
    case "stats": {
      const total = sections.reduce((n, s) => n + s.entries.length, 0);
      const github = sections
        .flatMap((s) => s.entries)
        .filter((e) => e.github !== undefined).length;
      print(
        {
          source: origin,
          sections: sections.map((s) => ({ title: s.title, entries: s.entries.length })),
          total,
          github,
        },
        () => {
          console.log(`\x1b[1m${repo}@${ref}\x1b[0m  (${origin})`);
          for (const s of sections) console.log(`  ${s.title.padEnd(24)} ${s.entries.length}`);
          console.log(`  ${"total".padEnd(24)} ${total} (${github} on GitHub)`);
        },
      );
      return 0;
    }
    case "sections":
      print(
        sections.map((s) => s.title),
        () => sections.forEach((s) => console.log(s.title)),
      );
      return 0;
    case "list": {
      const query = rest.join(" ");
      const chosen =
        query === "" ? sections : [findSection(sections, query)].filter((s) => s !== undefined);
      if (chosen.length === 0) {
        console.error(
          `No section matches "${query}". Sections: ${sections.map((s) => s.title).join(", ")}`,
        );
        return 1;
      }
      print(chosen, () => {
        for (const s of chosen) {
          console.log(`\x1b[1m${s.title}\x1b[0m (${s.entries.length})`);
          s.entries.forEach((e) => console.log(line(e)));
        }
      });
      return 0;
    }
    case "search": {
      if (rest.length === 0) throw new Error("search needs at least one word");
      const found = searchEntries(sections, rest.join(" "));
      print(found, () => {
        found.forEach((e) => console.log(`\x1b[2m${e.section}\x1b[0m\n${line(e)}`));
        console.log(`${found.length} match(es)`);
      });
      return found.length > 0 ? 0 : 1;
    }
    case "github": {
      const repos = sections
        .flatMap((s) => s.entries)
        .flatMap((e) =>
          e.github === undefined ? [] : [{ repo: e.github, section: e.section, name: e.name }],
        );
      print(repos, () => repos.forEach((r) => console.log(`${r.repo.padEnd(48)} ${r.section}`)));
      return 0;
    }
    case "check": {
      const query = rest.join(" ");
      const scope =
        query === "" ? sections : [findSection(sections, query)].filter((s) => s !== undefined);
      const entries = scope.flatMap((s) => s.entries);
      const results = await checkLinks(entries, { concurrency, timeoutMs });
      const broken = results.filter((r) => r.status === "error" || r.status >= 400);
      print({ checked: results.length, broken }, () => {
        for (const r of broken) {
          console.log(
            `  ${String(r.status).padEnd(5)} ${r.entry.name}  ${r.entry.url}${r.detail ? `  (${r.detail})` : ""}`,
          );
        }
        console.log(`${results.length} checked, ${broken.length} broken`);
      });
      return broken.length === 0 ? 0 : 1;
    }
    default:
      console.error(`Unknown awesome command: ${command}`);
      console.log(HELP);
      return 1;
  }
}
