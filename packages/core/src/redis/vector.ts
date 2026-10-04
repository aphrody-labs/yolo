// SPDX-License-Identifier: Apache-2.0
/**
 * Native Bun Redis Vector Store
 *
 * Vector indexing and K-Nearest-Neighbor (KNN) similarity search using
 * Redis and NativeRedisClient. Encodes Float32 vectors with zero overhead.
 */
import { cosineSimilarity } from "../gemma4/engine";
import { NativeRedisClient } from "./client";

export interface VectorDocument {
  id: string;
  vector: Float32Array;
  metadata: Record<string, string>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: Record<string, string>;
}

export class RedisVectorStore {
  readonly client: NativeRedisClient;
  readonly namespace: string;
  readonly #memoryFallback = new Map<string, VectorDocument>();

  constructor(client: NativeRedisClient, namespace: string = "default") {
    this.client = client;
    this.namespace = namespace;
  }

  get keyPrefix(): string {
    return `yolo:vec:${this.namespace}:`;
  }

  get indexKey(): string {
    return `yolo:vec_idx:${this.namespace}`;
  }

  /** Serializes a Float32Array into a compact Base64 binary string. */
  static serializeVector(vec: Float32Array): string {
    const uint8 = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
    return Buffer.from(uint8).toString("base64");
  }

  /** Deserializes a Base64 string back into a Float32Array. */
  static deserializeVector(base64: string): Float32Array {
    const buf = Buffer.from(base64, "base64");
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    view.set(buf);
    return new Float32Array(ab);
  }

  /** Upserts a vector document into Redis and memory fallback. */
  async upsert(
    id: string,
    vector: Float32Array,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    const doc: VectorDocument = { id, vector, metadata };
    this.#memoryFallback.set(id, doc);

    if (this.client.isConnected) {
      try {
        const key = this.keyPrefix + id;
        const serialized = RedisVectorStore.serializeVector(vector);
        await this.client.hset(key, {
          id,
          vec: serialized,
          meta: JSON.stringify(metadata),
        });
        await this.client.sadd(this.indexKey, id);
      } catch (err) {
        // Keep in memory fallback if socket fails
        console.warn(`[RedisVectorStore] Failed to write to Redis: ${err}`);
      }
    }
  }

  /** Query top-K most similar vectors via Cosine Similarity. */
  async query(
    queryVector: Float32Array,
    topK: number = 5,
    filter?: Record<string, string> | undefined,
  ): Promise<VectorSearchResult[]> {
    const candidates: VectorDocument[] = [];

    if (this.client.isConnected) {
      try {
        const ids = await this.client.smembers(this.indexKey);
        for (const id of ids) {
          const key = this.keyPrefix + id;
          const data = await this.client.hgetall(key);
          if (data && data.vec) {
            const vec = RedisVectorStore.deserializeVector(data.vec);
            const metadata = data.meta ? JSON.parse(data.meta) : {};
            candidates.push({ id, vector: vec, metadata });
          }
        }
      } catch {
        // Fall back to in-memory store
      }
    }

    // Merge or fallback to memory
    if (candidates.length === 0) {
      candidates.push(...this.#memoryFallback.values());
    }

    // Filter and score
    const scored: VectorSearchResult[] = [];
    for (const item of candidates) {
      if (filter) {
        let match = true;
        for (const [k, v] of Object.entries(filter)) {
          if (item.metadata[k] !== v) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }

      const score = cosineSimilarity(queryVector, item.vector);
      scored.push({
        id: item.id,
        score,
        metadata: item.metadata,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Delete a vector document by ID. */
  async delete(id: string): Promise<boolean> {
    this.#memoryFallback.delete(id);
    if (this.client.isConnected) {
      try {
        await this.client.del(this.keyPrefix + id);
        await this.client.srem(this.indexKey, id);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  /** Count stored vector documents. */
  async count(): Promise<number> {
    if (this.client.isConnected) {
      try {
        const count = await this.client.scard(this.indexKey);
        return Number(count);
      } catch {
        // fallback
      }
    }
    return this.#memoryFallback.size;
  }

  /** Clear all documents in this vector namespace. */
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
