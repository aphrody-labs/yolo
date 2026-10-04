// SPDX-License-Identifier: Apache-2.0
/**
 * Autonomous Full-Stack Synchronizer & Context Optimizer
 *
 * Links Codebase indexing, Git state, Web search / Context7 doc cache,
 * and Multi-Agent active consumer coordination under Bun & systemd.
 */
import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { recordTrainingSample } from "../ledger/index";
import type { NativeRedisClient } from "../redis/client";
import { indexCodebaseToRedis } from "../redis/indexer";
import { findRepoRoot } from "../vfs/index";

export interface GitRepoState {
  repo: string;
  branch: string;
  commit: string;
  dirty: boolean;
  uncommittedCount: number;
}

export interface SyncCycleResult {
  timestamp: string;
  repos: Record<string, GitRepoState>;
  indexedFilesCount: number;
  beaconWritten: boolean;
  docCacheHits: number;
}

export interface AutoSyncOptions {
  redisClient?: NativeRedisClient | undefined;
  sqliteDb?: Database | undefined;
  syncIntervalMs?: number | undefined;
  trackedRepos?: string[] | undefined;
}

export class AutoSyncEngine {
  #redis: NativeRedisClient | null = null;
  #db: Database | null = null;
  #timer: Timer | null = null;
  #lastCommits = new Map<string, string>();
  #trackedRepos: string[];
  #docCacheHits = 0;

  constructor(options: AutoSyncOptions = {}) {
    this.#redis = options.redisClient ?? null;
    this.#db = options.sqliteDb ?? null;

    const yoloRoot = findRepoRoot();
    const aphrodyRoot = join(homedir(), "aphrody");
    this.#trackedRepos = options.trackedRepos ?? [
      yoloRoot,
      ...(existsSync(aphrodyRoot) ? [aphrodyRoot] : []),
    ];
  }

  async getGitState(repoPath: string): Promise<GitRepoState> {
    const repoName = repoPath.split("/").pop() || "unknown";
    try {
      const branchProc = Bun.spawn(["git", "-C", repoPath, "branch", "--show-current"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      const branch = (await new Response(branchProc.stdout).text()).trim() || "unknown";

      const commitProc = Bun.spawn(["git", "-C", repoPath, "rev-parse", "HEAD"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      const commit = (await new Response(commitProc.stdout).text()).trim().slice(0, 10);

      const statusProc = Bun.spawn(["git", "-C", repoPath, "status", "--porcelain"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      const statusText = (await new Response(statusProc.stdout).text()).trim();
      const lines = statusText ? statusText.split("\n") : [];

      return {
        repo: repoName,
        branch,
        commit,
        dirty: lines.length > 0,
        uncommittedCount: lines.length,
      };
    } catch {
      return {
        repo: repoName,
        branch: "unknown",
        commit: "unknown",
        dirty: false,
        uncommittedCount: 0,
      };
    }
  }

  async runSyncCycle(forceIndex = false): Promise<SyncCycleResult> {
    const now = new Date().toISOString();
    const reposState: Record<string, GitRepoState> = {};
    let totalIndexed = 0;

    // 1. Inspect Git state across tracked repositories
    for (const repoPath of this.#trackedRepos) {
      if (!existsSync(repoPath)) continue;
      const state = await this.getGitState(repoPath);
      reposState[state.repo] = state;

      const prevCommit = this.#lastCommits.get(state.repo);
      const commitChanged = prevCommit && prevCommit !== state.commit;
      this.#lastCommits.set(state.repo, state.commit);

      // Stream to Redis
      if (this.#redis?.isConnected) {
        await this.#redis
          .hset(`yolo:sync:git:${state.repo}`, {
            branch: state.branch,
            commit: state.commit,
            dirty: state.dirty ? "1" : "0",
            uncommitted: String(state.uncommittedCount),
            syncedAt: now,
          })
          .catch(() => {});
      }

      // 2. Incremental codebase indexer if commit changed or forced
      if ((commitChanged || forceIndex) && this.#redis?.isConnected) {
        try {
          const indexRes = await indexCodebaseToRedis(repoPath, state.commit, this.#redis);
          totalIndexed += indexRes.updatedFiles;
        } catch {
          // Continue on indexing warning
        }
      }
    }

    // 3. Emit factual Context Beacon for all agent consumers (AGY, Codex, Claude)
    const beaconWritten = this.writeContextBeacon(reposState, now);

    // 4. Record factual training sample for autonomous self-training loop
    if (this.#db) {
      try {
        recordTrainingSample(this.#db, {
          sampleId: `sync-${Date.now()}`,
          profile: "yolo",
          domain: "auto-sync-engine",
          instruction: "Synchronize repositories, Git status, and context beacon",
          inputContext: JSON.stringify(this.#trackedRepos),
          action: "runSyncCycle",
          outcome: JSON.stringify({
            repos: reposState,
            totalIndexed,
            timestamp: now,
          }),
          rewardScore: 1.0,
          createdAt: now,
        });
      } catch {
        // Ignore DB transient
      }
    }

    return {
      timestamp: now,
      repos: reposState,
      indexedFilesCount: totalIndexed,
      beaconWritten,
      docCacheHits: this.#docCacheHits,
    };
  }

  writeContextBeacon(repos: Record<string, GitRepoState>, timestamp: string): boolean {
    const beacon = {
      schema: "yolo.sync.beacon/1",
      generated_at: timestamp,
      active_plugins: ["yolo", "aphrody", "aphrody-google", "aphrody-web"],
      repositories: repos,
      context_optimizations: {
        max_context_tokens: 4000,
        mcp_servers: ["yolo", "aphrody"],
        caching_layer: "redis+sqlite",
        doc_routing: "bun-docs-router+context7",
      },
    };

    const targets = [
      join(homedir(), "aphrody", ".coord", "shared", "YOLO-DAEMON-SYNC.json"),
      join(homedir(), ".aphrody", "ai", "yolo-sync.json"),
      join(findRepoRoot(), "var", "yolo-sync.json"),
    ];

    let written = false;
    for (const target of targets) {
      try {
        const dir = target.substring(0, target.lastIndexOf("/"));
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true, mode: 0o700 });
        }
        writeFileSync(target, JSON.stringify(beacon, null, 2), { mode: 0o600 });
        written = true;
      } catch {
        // Best-effort write
      }
    }
    return written;
  }

  async cachedDocQuery(query: string, fetcher: () => Promise<string>): Promise<string> {
    const cacheKey = `yolo:cache:docs:${query.trim().toLowerCase()}`;
    if (this.#redis?.isConnected) {
      try {
        const cached = await this.#redis.get(cacheKey);
        if (cached) {
          this.#docCacheHits++;
          return cached;
        }
      } catch {
        // Fall back
      }
    }

    const fetched = await fetcher();

    if (this.#redis?.isConnected && fetched) {
      try {
        await this.#redis.set(cacheKey, fetched);
      } catch {
        // Ignore cache write error
      }
    }

    return fetched;
  }

  startPeriodic(intervalMs = 60_000) {
    if (this.#timer) return;
    this.runSyncCycle().catch(() => {});
    this.#timer = setInterval(() => {
      this.runSyncCycle().catch(() => {});
    }, intervalMs);
  }

  stop() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }
}
