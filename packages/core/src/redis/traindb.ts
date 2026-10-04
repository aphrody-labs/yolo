// SPDX-License-Identifier: Apache-2.0
/**
 * Native Bun Redis Training Database (Train DB)
 *
 * High-speed dataset storage, batch indexing, and sample curation for Gemma 4
 * fine-tuning (SFT, DPO, LoRA) and embedding fine-tuning.
 */
import { NativeRedisClient } from "./client";

export interface TrainInstruction {
  id: string;
  instruction: string;
  input?: string | undefined;
  output: string;
  system?: string | undefined;
  thought?: string | undefined;
  split?: "train" | "val" | "test" | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface TrainTriple {
  id: string;
  query: string;
  positive: string;
  negative: string;
  split?: "train" | "val" | "test" | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export class RedisTrainDb {
  readonly client: NativeRedisClient;
  readonly datasetName: string;
  readonly #memoryFallback = new Map<string, string>();

  constructor(client: NativeRedisClient, datasetName: string = "default") {
    this.client = client;
    this.datasetName = datasetName;
  }

  get keyPrefix(): string {
    return `yolo:train:${this.datasetName}:`;
  }

  get indexKey(): string {
    return `yolo:train_idx:${this.datasetName}`;
  }

  /** Adds or updates an instruction tuning record. */
  async addInstruction(item: TrainInstruction): Promise<void> {
    const serialized = JSON.stringify({ ...item, type: "instruction" });
    this.#memoryFallback.set(item.id, serialized);

    if (this.client.isConnected) {
      try {
        const key = this.keyPrefix + item.id;
        await this.client.set(key, serialized);
        await this.client.sadd(this.indexKey, item.id);
      } catch (err) {
        console.warn(`[RedisTrainDb] Write error: ${err}`);
      }
    }
  }

  /** Adds or updates a contrastive training triple (query, positive, negative). */
  async addTriple(item: TrainTriple): Promise<void> {
    const serialized = JSON.stringify({ ...item, type: "triple" });
    this.#memoryFallback.set(item.id, serialized);

    if (this.client.isConnected) {
      try {
        const key = this.keyPrefix + item.id;
        await this.client.set(key, serialized);
        await this.client.sadd(this.indexKey, item.id);
      } catch (err) {
        console.warn(`[RedisTrainDb] Write error: ${err}`);
      }
    }
  }

  /** Retrieves a training record by ID. */
  async getRecord(id: string): Promise<Record<string, unknown> | null> {
    if (this.client.isConnected) {
      try {
        const key = this.keyPrefix + id;
        const val = await this.client.get(key);
        if (val) return JSON.parse(val);
      } catch {
        // fallback
      }
    }
    const mem = this.#memoryFallback.get(id);
    return mem ? JSON.parse(mem) : null;
  }

  /** Lists training records with pagination. */
  async listRecords(
    limit: number = 50,
    offset: number = 0,
  ): Promise<Array<Record<string, unknown>>> {
    const ids: string[] = [];
    if (this.client.isConnected) {
      try {
        const members = await this.client.smembers(this.indexKey);
        ids.push(...members);
      } catch {
        // fallback
      }
    }
    if (ids.length === 0) {
      ids.push(...this.#memoryFallback.keys());
    }

    const slice = ids.slice(offset, offset + limit);
    const records: Array<Record<string, unknown>> = [];
    for (const id of slice) {
      const rec = await this.getRecord(id);
      if (rec) records.push(rec);
    }
    return records;
  }

  /** Return training dataset statistics. */
  async getStats(): Promise<{ totalCount: number; dataset: string }> {
    let count = 0;
    if (this.client.isConnected) {
      try {
        const scard = await this.client.scard(this.indexKey);
        count = Number(scard);
      } catch {
        count = this.#memoryFallback.size;
      }
    } else {
      count = this.#memoryFallback.size;
    }

    return {
      dataset: this.datasetName,
      totalCount: count,
    };
  }

  /** Clear all records in this dataset. */
  async clear(): Promise<void> {
    this.#memoryFallback.clear();
    if (this.client.isConnected) {
      try {
        const ids = await this.client.smembers(this.indexKey);
        const keys = ids.map((id) => this.keyPrefix + id);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
        await this.client.del(this.indexKey);
      } catch {
        // fallback
      }
    }
  }
}
