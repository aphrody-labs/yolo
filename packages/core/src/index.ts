/**
 * YOLO Core Library (@aphrody/yolo-core)
 *
 * Modeled directly after Bun's core library architecture:
 * - sys: Hardware, system statistics, benchmarking, doctors, zero-copy hashing (wyhash, crc32, sha256)
 * - vfs: High-performance recursive scanner, source parser, home & checkout resolution
 * - vendor: Monorepo package inspector, Cargo workspace manager, Bun catalog generator, crate importer
 * - runtime: Native C ABI 1.4 bridge, process supervisor, readiness probes
 * - verify: Parallel quality gate graph scheduler and timing engine
 * - server: Native Bun.serve HTTP / REST / OpenAPI 3.1 micro-server
 * - mcp: Model Context Protocol (MCP 2024-11-05) JSON-RPC 2.0 stdio server
 * - fleet: Remote host management, hardlink space deduplication, command safety engine
 * - scaffold: Stack project scaffolder, template substitution, feature injection
 * - curation: Awesome repository curation, mass identifier renaming
 * - coord: Sibling workspace coordination, advisory claim locks
 * - distribution: Artifact verification, release packaging
 *
 * 100% Native Bun. Zero external runtime npm dependencies.
 */

// Submodule namespaces
export * as sys from "./sys";
export * as vfs from "./vfs";
export * as vendor from "./vendor";
export * as runtime from "./runtime";
export * as verify from "./verify";
export * as server from "./server";
export * as mcp from "./mcp";
export * as fleet from "./fleet";
export * as scaffold from "./scaffold";
export * as curation from "./curation";
export * as coord from "./coord";
export * as distribution from "./distribution";
export * as ledger from "./ledger";

// Direct flat exports of core capabilities
export {
  wyhash,
  crc32,
  sha256,
  limiter,
  getSystemStats,
  type SystemStats,
  runBenchMetrics,
  renderBenchMarkdown,
  type BenchMetrics,
  collectDoctorReport,
  renderDoctorMarkdown,
  type DoctorReport,
  type DoctorComponent,
} from "./sys";

export {
  isCompiled,
  findRepoRoot,
  yoloHome,
  yoloVersion,
  findCheckout,
  parseTsSource,
  renderParseMarkdown,
  type TsParseResult,
  scanDirectory,
  formatBytes,
  renderScanMarkdown,
  renderScanTerminal,
  type ScanReport,
  type ScanOptions,
  type ExtensionStat,
  type FileEntry,
  auditPortability,
  renderPortabilityMarkdown,
  type PortabilityReport,
  type PortabilityIssue,
} from "./vfs";

export {
  inspectPackages,
  readVendorStatus,
  collectStatusReport,
  renderStatusMarkdown,
  resolveGitDir,
  type SubmoduleStatus,
  type VendorSourceStatus,
  type StatusReport,
  readWorkspaceCargo,
  type WorkspaceCargoSummary,
  generateBunCatalog,
  type BunApiDomain,
  type AutonomousGenerationReport,
  serializeToml,
  transformManifest,
} from "./vendor";

export {
  Runtime,
  sharedRuntime,
  closeSharedRuntime,
  system,
  processes,
  getRuntimeStatus,
  type RuntimeStatus,
} from "./runtime";

export {
  GATES,
  NOT_RUN_HEAVY,
  runGates,
  selectChanged,
  changedFiles,
  summarize,
  renderMarkdown,
  renderList,
  validateGraph,
  type Gate,
  type GateResult,
  type Report as VerifyReport,
  type Status as GateStatus,
  type NotRun,
} from "./verify";

export { createApiServer, buildOpenApiSpec, type ApiServerOptions } from "./server";

export {
  DEFAULT_MCP_PROTOCOL_VERSION,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
  SERVER_NAME,
  SERVER_VERSION,
  TOOLS,
  executeTool,
  handleMcpMessage,
  type ToolDefinition,
} from "./mcp";

export {
  parseFindLinks,
  estimateReclaim,
  spaceGate,
  parseDfSizeAvail,
  resolveMinFree,
  diskProbeCommand,
  diskDecision,
  scanLinks,
  type LinkRecord,
  type ReclaimEstimate,
  type SpaceGate,
  type DiskDecision,
} from "./fleet";
