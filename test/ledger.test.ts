// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, it } from "bun:test";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  indexCodebaseFingerprints,
  initLedgerDatabase,
  recordAuditReport,
  recordBenchmark,
  recordQualityGate,
  recordRemediation,
  recordSession,
  summarizeLedger,
} from "../packages/core/src/ledger/index";
import { findRepoRoot } from "../packages/core/src/vfs/index";

describe("Native Bun SQLite Audit & Training Ledger", () => {
  const root = findRepoRoot();
  const testDbPath = join(root, "var", "test-ledger.sqlite");
  const db = initLedgerDatabase(testDbPath);

  afterAll(() => {
    try {
      db.close();
      unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup error
    }
  });

  it("initializes tables and records session correctly", () => {
    recordSession(db, {
      sessionId: "test-session",
      recordedAt: new Date().toISOString(),
      host: "test-host",
      os: "Linux",
      kernel: "6.18",
      platform: "linux",
      metadata: { test: true },
    });

    const row = db.query("SELECT * FROM sessions WHERE session_id = 'test-session'").get() as {
      host: string;
    };
    expect(row.host).toBe("test-host");
  });

  it("records audit reports, benchmarks, and quality gates", () => {
    recordAuditReport(db, {
      sessionId: "test-session",
      domain: "test_domain",
      auditor: "test_agent",
      verdict: "HEALTHY",
      summary: "All systems healthy",
      details: { score: 100 },
      recordedAt: new Date().toISOString(),
    });

    recordBenchmark(db, {
      sessionId: "test-session",
      benchmarkName: "test_bench",
      target: "test_target",
      iterations: 1000,
      latencyUs: 500,
      throughputOpsSec: 2000000,
      measuredAt: new Date().toISOString(),
    });

    recordQualityGate(db, {
      sessionId: "test-session",
      gateName: "test_gate",
      command: "echo test",
      exitCode: 0,
      passed: true,
      proofDetails: "stdout: test",
      recordedAt: new Date().toISOString(),
    });

    recordRemediation(db, {
      issueCode: "FIX-01",
      component: "test",
      description: "Resolved test issue",
      status: "RESOLVED",
      patchCommit: "abcdef",
      resolvedAt: new Date().toISOString(),
    });

    const summary = summarizeLedger(db);
    expect(summary.sessionCount).toBeGreaterThanOrEqual(1);
    expect(summary.auditCount).toBeGreaterThanOrEqual(1);
    expect(summary.benchmarkCount).toBeGreaterThanOrEqual(1);
    expect(summary.gateCount).toBeGreaterThanOrEqual(1);
    expect(summary.remediations.length).toBeGreaterThanOrEqual(1);
  });

  it("indexes codebase fingerprints cleanly", () => {
    const count = indexCodebaseFingerprints(db, join(root, "packages", "runtime"));
    expect(count).toBeGreaterThan(0);
    const summary = summarizeLedger(db);
    expect(summary.fingerprintCount).toBeGreaterThan(0);
  });
});
