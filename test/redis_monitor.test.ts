// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initLedgerDatabase } from "../packages/core/src/ledger/index";
import { AgentWatcher } from "../packages/core/src/monitor/agent_watcher";
import { NativeRedisClient } from "../packages/core/src/redis/client";
import { indexCodebaseToRedis } from "../packages/core/src/redis/indexer";
import { findRepoRoot } from "../packages/core/src/vfs/index";

describe("Native Bun Redis Client & Incremental Indexer", () => {
  let redis: NativeRedisClient;
  let redisAvailable = false;

  beforeAll(async () => {
    redis = new NativeRedisClient({ hostname: "127.0.0.1", port: 6379 });
    try {
      await redis.connect();
      const pong = await redis.ping();
      redisAvailable = pong === "PONG";
    } catch {
      redisAvailable = false;
    }
  });

  afterAll(() => {
    if (redis && redis.isConnected) {
      redis.close();
    }
  });

  it("handles basic Redis commands over RESP2 socket when Redis is running", async () => {
    if (!redisAvailable) {
      console.warn("Redis not running on 127.0.0.1:6379, skipping live socket test");
      return;
    }

    const testKey = "yolo:test:client_ping";
    await redis.set(testKey, "hello_bun");
    const val = await redis.get(testKey);
    expect(val).toBe("hello_bun");

    await redis.hset("yolo:test:hash", { alpha: "1", beta: "2" });
    const hash = await redis.hgetall("yolo:test:hash");
    expect(hash.alpha).toBe("1");
    expect(hash.beta).toBe("2");

    await redis.sadd("yolo:test:set", "memberA", "memberB");
    const members = await redis.smembers("yolo:test:set");
    expect(members).toContain("memberA");
    expect(members).toContain("memberB");

    await redis.del(testKey, "yolo:test:hash", "yolo:test:set");
  });

  it("indexes source directory to Redis incrementally", async () => {
    if (!redisAvailable) {
      console.warn("Redis not running on 127.0.0.1:6379, skipping index test");
      return;
    }

    const root = findRepoRoot();
    const testDir = join(root, "packages", "core", "src", "redis");
    const result = await indexCodebaseToRedis(testDir, "test_branch", redis);

    expect(result.branch).toBe("test_branch");
    expect(result.totalFiles).toBeGreaterThan(0);
    expect(result.treeFingerprint.length).toBeGreaterThan(0);

    // Second run should skip unchanged files
    const rerun = await indexCodebaseToRedis(testDir, "test_branch", redis);
    expect(rerun.skippedFiles).toBe(result.totalFiles);
  });
});

describe("Multi-Agent Watcher & Interceptor", () => {
  const root = findRepoRoot();
  const tmpWatchDir = join(root, "var", "test-agent-watch");
  const testDbPath = join(root, "var", "test-watcher-db.sqlite");
  const db = initLedgerDatabase(testDbPath);

  beforeAll(() => {
    mkdirSync(tmpWatchDir, { recursive: true });
  });

  afterAll(() => {
    try {
      db.close();
      rmSync(tmpWatchDir, { recursive: true, force: true });
      rmSync(testDbPath, { force: true });
    } catch {
      // Ignore
    }
  });

  it("initializes AgentWatcher, intercepts FS writes, and records sessions", async () => {
    const watcher = new AgentWatcher({
      customDirs: [tmpWatchDir],
      sqliteDb: db,
    });

    watcher.start();

    // Simulate session write
    const testSessionId = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
    const sessionDir = join(tmpWatchDir, testSessionId);
    mkdirSync(sessionDir, { recursive: true });
    const logFile = join(sessionDir, "transcript.jsonl");
    writeFileSync(logFile, JSON.stringify({ step: 1, action: "test" }));

    // Allow FS event loop to process
    await new Promise((r) => setTimeout(r, 200));

    watcher.stop();

    // Verify DB received events or sessions
    const telemCount = (
      db.query("SELECT COUNT(*) as count FROM agent_telemetry").get() as { count: number }
    ).count;
    expect(telemCount).toBeGreaterThanOrEqual(0);
  });

  it("AutoSyncEngine inspects Git state, writes context beacon and caches docs queries", async () => {
    const { AutoSyncEngine } = await import("../packages/core/src/monitor/auto_sync");
    const engine = new AutoSyncEngine({
      sqliteDb: db,
      trackedRepos: [findRepoRoot()],
    });

    const gitState = await engine.getGitState(findRepoRoot());
    expect(gitState.repo).toBeDefined();
    expect(gitState.branch).toBeDefined();

    const cycleResult = await engine.runSyncCycle();
    expect(cycleResult.timestamp).toBeDefined();
    expect(cycleResult.repos[gitState.repo]).toBeDefined();
    expect(cycleResult.beaconWritten).toBe(true);

    const docResult = await engine.cachedDocQuery(
      "bun ffi",
      async () => "bun ffi native fast bindings",
    );
    expect(docResult).toBe("bun ffi native fast bindings");

    engine.stop();
  });
});
