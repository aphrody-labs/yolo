/**
 * Fast AST & token analysis via Bun file streaming and wyhash fingerprinting.
 * Zero external npm dependencies.
 */

export interface TsParseResult {
  readonly path: string;
  readonly lines: number;
  readonly bytes: number;
  readonly checksum: string;
  readonly exports: readonly string[];
  readonly imports: readonly string[];
  readonly parseTimeMs: number;
}

export async function parseTsSource(filePath: string): Promise<TsParseResult> {
  const t0 = Bun.nanoseconds();
  const file = Bun.file(filePath);
  const content = await file.text();
  const bytes = file.size;
  const lines = content.length === 0 ? 0 : content.split("\n").length;

  // Bun native wyhash checksum
  const checksum = Bun.hash.wyhash(content).toString(16);

  // Extract exported symbols
  const exports: string[] = [];
  const exportMatches = content.matchAll(
    /export\s+(?:async\s+)?(?:declare\s+)?(?:const|function|class|type|interface|enum)\s+([a-zA-Z0-9_$]+)/g,
  );
  for (const m of exportMatches) {
    if (m[1]) exports.push(m[1]);
  }

  const exportBlockMatches = content.matchAll(/export\s*\{([^}]+)\}/g);
  for (const block of exportBlockMatches) {
    if (block[1]) {
      const items = block[1].split(",").map((s) => {
        const parts = s.trim().split(/\s+as\s+/);
        const name = parts[parts.length - 1]?.trim().replace(/^type\s+/, "");
        return name ?? "";
      });
      for (const item of items) {
        if (item && /^[a-zA-Z0-9_$]+$/.test(item) && !exports.includes(item)) {
          exports.push(item);
        }
      }
    }
  }

  // Extract imported specifiers
  const importMatches = content.matchAll(/from\s+["']([^"']+)["']/g);
  const imports = Array.from(importMatches, (m) => m[1] ?? "").filter(Boolean);

  const parseTimeMs = Number(((Bun.nanoseconds() - t0) / 1_000_000).toFixed(3));

  return {
    path: filePath,
    lines,
    bytes,
    checksum,
    exports,
    imports,
    parseTimeMs,
  };
}

export function renderParseMarkdown(result: TsParseResult): string {
  return [
    `# yolo parse: \`${result.path}\``,
    "",
    `- **Lines:** ${result.lines.toLocaleString()}`,
    `- **Bytes:** ${result.bytes.toLocaleString()} bytes`,
    `- **Wyhash Fingerprint:** \`0x${result.checksum}\``,
    `- **Parse Latency:** ${result.parseTimeMs} ms`,
    "",
    `## Exports (${result.exports.length})`,
    "",
    result.exports.length > 0
      ? result.exports.map((e) => `- \`${e}\``).join("\n")
      : "_No top-level exports detected_",
    "",
    `## Imports (${result.imports.length})`,
    "",
    result.imports.length > 0
      ? result.imports.map((i) => `- \`${i}\``).join("\n")
      : "_No imported modules detected_",
  ].join("\n");
}
