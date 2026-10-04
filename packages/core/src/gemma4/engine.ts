// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 aphrody contributors & Google DeepMind
/**
 * Gemma 4 Engine: Pure Bun High-Performance Mathematics & KV Cache Management.
 *
 * Implements:
 * - Ultra-compact L2 normalized float32 vector embeddings (1536 dims for E2B)
 * - Zero-copy Cosine, Dot-Product, and Euclidean vector distance operations
 * - Sliding window KV cache allocation pattern matching Google DeepMind specs
 */
import { GEMMA4_E2B_CONFIG, type Gemma4Config } from "./models";

/** Normalizes a vector in-place to unit L2 norm. */
export function normalizeL2(vec: Float32Array): Float32Array {
  let sum = 0.0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i]! * vec[i]!;
  }
  const norm = Math.sqrt(sum);
  if (norm > 1e-12) {
    const inv = 1.0 / norm;
    for (let i = 0; i < vec.length; i++) {
      vec[i] = vec[i]! * inv;
    }
  }
  return vec;
}

/** Computes the cosine similarity between two normalized or unnormalized float32 vectors. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 1e-12 ? dot / denom : 0.0;
}

/** Computes Euclidean distance between two float32 vectors. */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0.0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/** Fast deterministic text embedding vector generator matching Gemma 4 E2B dimension (1536). */
export function generateDeterministicEmbedding(
  text: string,
  dim: number = GEMMA4_E2B_CONFIG.embedDim,
): Float32Array {
  const vec = new Float32Array(dim);
  const utf8 = new TextEncoder().encode(text);

  // High-entropy deterministic projection using 64-bit FNV/Murmur-style mix
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < utf8.length; i++) {
    const byte = utf8[i]!;
    h1 = (Math.imul(h1 ^ byte, 0x01000193) ^ (byte << 3)) >>> 0;
    h2 = (Math.imul(h2 ^ byte, 0x27d4eb2d) ^ (byte >>> 2)) >>> 0;
  }

  // Generate float32 components
  for (let i = 0; i < dim; i++) {
    h1 = (Math.imul(h1 ^ i, 0x5bd1e995) + h2) >>> 0;
    h2 = (Math.imul(h2, 0x1b873593) ^ (h1 >>> 13)) >>> 0;
    // Normalized to [-1.0, 1.0]
    vec[i] = (h1 / 4294967296.0) * 2.0 - 1.0;
  }

  return normalizeL2(vec);
}

/** Computes KV cache memory size requirements for Gemma 4 sliding window attention. */
export function computeKVCacheFootprintBytes(
  config: Gemma4Config,
  batchSize: number = 1,
  seqLen: number = 512,
  bytesPerElem: number = 2, // 16-bit
): { localBytes: number; globalBytes: number; totalBytes: number; totalMb: number } {
  const headDim = config.headDim;
  const numKvHeads = config.numKvHeads;
  const windowSize = Math.min(seqLen, config.slidingWindowSize);

  // Key + Value = 2 tensors
  let localBytes = 0;
  let globalBytes = 0;

  for (let layer = 0; layer < config.numLayers; layer++) {
    const pattern = config.attentionPattern[layer % config.attentionPattern.length];
    if (pattern === "local_sliding") {
      // B * numKvHeads * windowSize * headDim * 2 * bytesPerElem
      localBytes += batchSize * numKvHeads * windowSize * headDim * 2 * bytesPerElem;
    } else {
      // Full sequence length for global attention layers
      globalBytes += batchSize * numKvHeads * seqLen * headDim * 2 * bytesPerElem;
    }
  }

  const totalBytes = localBytes + globalBytes;
  return {
    localBytes,
    globalBytes,
    totalBytes,
    totalMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
  };
}
