// SPDX-License-Identifier: Apache-2.0
/**
 * Real-Time Multi-Agent Session Interceptor & File System Monitor
 *
 * Intercepts session IDs, writes, and activities from Codex, AGY, and Claude.
 * Monitors agent directories (.gemini/, .codex/, .claude/) via native inotify/fs.watch.
 * Probes HTTP endpoints and streams telemetry events to Redis and SQLite.
 */
import type { Database } from "bun:sqlite";
import { existsSync, type FSWatcher, watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { recordAgentTelemetry } from "../ledger/index";
import type { NativeRedisClient } from "../redis/client";

export interface AgentWatcherOptions {
  redisClient?: NativeRedisClient | undefined;
  sqliteDb?: Database | undefined;
  customDirs?: string[] | undefined;
  pollEndpointsIntervalMs?: number | undefined;
}

export interface InterceptedEvent {
  agent: "agy" | "codex" | "claude" | "unknown";
  sessionId: string;
  eventType: string;
  targetPath: string;
  timestamp: string;
}

export interface EndpointStatus {
  name: string;
  url: string;
  online: boolean;
  latencyMs: number;
  lastChecked: string;
}

export class AgentWatcher {
  #redis: NativeRedisClient | null = null;
  #db: Database | null = null;
  #watchers: FSWatcher[] = [];
  #pollTimer: Timer | null = null;
  #activeSessions = new Map<
    string,
    { agent: string; sessionId: string; lastSeen: string; path: string }
  >();

  readonly monitoredDirs: string[];
  readonly endpoints = [
    { name: "aphrody_a2a", url: "http://127.0.0.1:8788/ping" },
    { name: "aphrody_gateway", url: "http://127.0.0.1:8795/health" },
    { name: "llama_server", url: "http://127.0.0.1:8080/health" },
    { name: "app_server", url: "http://127.0.0.1:3000" },
  ];

  constructor(options: AgentWatcherOptions = {}) {
    this.#redis = options.redisClient ?? null;
    this.#db = options.sqliteDb ?? null;

    const home = homedir();
    this.monitoredDirs = options.customDirs ?? [
      join(home, ".gemini", "antigravity-cli", "brain"),
      join(home, ".codex"),
      join(home, ".claude"),
    ];
  }

  start() {
    this.#startWatchers();
    this.#startEndpointPolling();
  }

  #startWatchers() {
    for (const dir of this.monitoredDirs) {
      if (!existsSync(dir)) continue;

      try {
        const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          this.#handleFsEvent(dir, filename.toString(), eventType);
        });
        this.#watchers.push(watcher);
      } catch {
        // Fall back if recursive watch is restricted
      }
    }
  }

  #handleFsEvent(baseDir: string, filename: string, eventType: string) {
    const fullPath = join(baseDir, filename);
    const now = new Date().toISOString();

    // Determine agent
    let agent: InterceptedEvent["agent"] = "unknown";
    if (baseDir.includes(".gemini")) agent = "agy";
    else if (baseDir.includes(".codex")) agent = "codex";
    else if (baseDir.includes(".claude")) agent = "claude";

    // Extract session ID
    let sessionId = "unknown";
    const uuidMatch = fullPath.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    if (uuidMatch) {
      sessionId = uuidMatch[0];
    } else {
      const parts = filename.split("/");
      sessionId = parts[0] || "global";
    }

    const event: InterceptedEvent = {
      agent,
      sessionId,
      eventType,
      targetPath: fullPath,
      timestamp: now,
    };

    // Update internal cache
    const sessionKey = `${agent}:${sessionId}`;
    this.#activeSessions.set(sessionKey, {
      agent,
      sessionId,
      lastSeen: now,
      path: fullPath,
    });

    // Stream to Redis
    if (this.#redis?.isConnected) {
      this.#redis.publish("yolo:agents:events", JSON.stringify(event)).catch(() => {});
      this.#redis
        .hset(
          "yolo:agents:active_sessions",
          sessionKey,
          JSON.stringify({
            agent,
            sessionId,
            lastSeen: now,
            path: fullPath,
          }),
        )
        .catch(() => {});
    }

    // Persist to SQLite
    if (this.#db) {
      try {
        recordAgentTelemetry(this.#db, {
          agent: event.agent,
          sessionId: event.sessionId,
          eventType: event.eventType,
          targetPath: event.targetPath,
          timestamp: event.timestamp,
        });
      } catch {
        // Ignore DB transient errors
      }
    }
  }

  #startEndpointPolling() {
    const poll = async () => {
      for (const ep of this.endpoints) {
        const start = performance.now();
        let online = false;
        try {
          const resp = await fetch(ep.url, {
            signal: AbortSignal.timeout(1500),
          });
          online = resp.status < 500;
        } catch {
          online = false;
        }
        const latencyMs = Math.round(performance.now() - start);
        const status: EndpointStatus = {
          name: ep.name,
          url: ep.url,
          online,
          latencyMs,
          lastChecked: new Date().toISOString(),
        };

        if (this.#redis?.isConnected) {
          this.#redis
            .hset("yolo:agents:endpoints", ep.name, JSON.stringify(status))
            .catch(() => {});
        }
      }
    };

    // Initial probe
    poll();
    this.#pollTimer = setInterval(poll, 10_000);
  }

  getActiveSessions(): Array<{ agent: string; sessionId: string; lastSeen: string; path: string }> {
    return Array.from(this.#activeSessions.values());
  }

  stop() {
    for (const w of this.#watchers) {
      try {
        w.close();
      } catch {
        // Ignore
      }
    }
    this.#watchers = [];

    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
  }
}
