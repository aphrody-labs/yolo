// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 aphrody contributors & Google DeepMind
/**
 * Google DeepMind Gemma 4 Architecture Specifications.
 *
 * Full parameter matrices and structural parameters for the Gemma 4 family:
 * - Gemma 4 E2B: 2B parameter dense multimodal model (Text + Vision + Audio) - Smallest model
 * - Gemma 4 E4B: 4B parameter dense multimodal model (Text + Vision + Audio)
 * - Gemma 4 26B/A4B: 26B total / 4B active Mixture-of-Experts (MoE) multimodal model
 * - Gemma 4 31B: 31B parameter dense multimodal flagship model
 */

export type AttentionType = "global" | "local_sliding";

export interface VisionEncoderConfig {
  readonly dModel: number;
  readonly numLayers: number;
  readonly numHeads: number;
  readonly ffwHidden: number;
  readonly outputLength: number;
  readonly patchSize: number;
  readonly imageSize: number;
}

export interface ConformerAudioConfig {
  readonly subsamplingFactor: number;
  readonly dModel: number;
  readonly numHeads: number;
  readonly numLayers: number;
  readonly kernelSize: number;
  readonly sampleRate: number;
  readonly melChannels: number;
}

export interface Gemma4Config {
  readonly name: string;
  readonly vocabSize: number;
  readonly embedDim: number;
  readonly hiddenDim: number;
  readonly numLayers: number;
  readonly numHeads: number;
  readonly headDim: number;
  readonly numKvHeads: number;
  readonly slidingWindowSize: number;
  readonly finalLogitSoftcap: number;
  readonly qkNormWithScale: boolean;
  readonly rmsNormEps: number;
  readonly localRopeFrequency: number;
  readonly globalRopeFrequency: number;
  readonly localRopeProportion: number;
  readonly globalRopeProportion: number;
  readonly attentionPattern: readonly AttentionType[];
  readonly enableMoe: boolean;
  readonly numExperts: number;
  readonly topKExperts: number;
  readonly visionEncoder?: VisionEncoderConfig | undefined;
  readonly audioEncoder?: ConformerAudioConfig | undefined;
}

// ---------------------------------------------------------------------------
// Gemma 4 E2B: Google's smallest multimodal edge model (2B parameters)
// ---------------------------------------------------------------------------
export const GEMMA4_E2B_CONFIG: Gemma4Config = {
  name: "gemma4-e2b",
  vocabSize: 262144,
  embedDim: 1536,
  hiddenDim: 6144,
  numLayers: 35,
  numHeads: 8,
  headDim: 256,
  numKvHeads: 1,
  slidingWindowSize: 512,
  finalLogitSoftcap: 30.0,
  qkNormWithScale: true,
  rmsNormEps: 1e-6,
  localRopeFrequency: 10000,
  globalRopeFrequency: 1000000,
  localRopeProportion: 1.0,
  globalRopeProportion: 0.25,
  attentionPattern: ["local_sliding", "local_sliding", "local_sliding", "local_sliding", "global"],
  enableMoe: false,
  numExperts: 0,
  topKExperts: 0,
  visionEncoder: {
    dModel: 1152,
    numLayers: 27,
    numHeads: 16,
    ffwHidden: 4304,
    outputLength: 280,
    patchSize: 16,
    imageSize: 448,
  },
  audioEncoder: {
    subsamplingFactor: 4,
    dModel: 512,
    numHeads: 8,
    numLayers: 12,
    kernelSize: 31,
    sampleRate: 16000,
    melChannels: 128,
  },
};

export const GEMMA4_E4B_CONFIG: Gemma4Config = {
  name: "gemma4-e4b",
  vocabSize: 262144,
  embedDim: 2560,
  hiddenDim: 10240,
  numLayers: 38,
  numHeads: 10,
  headDim: 256,
  numKvHeads: 2,
  slidingWindowSize: 512,
  finalLogitSoftcap: 30.0,
  qkNormWithScale: true,
  rmsNormEps: 1e-6,
  localRopeFrequency: 10000,
  globalRopeFrequency: 1000000,
  localRopeProportion: 1.0,
  globalRopeProportion: 0.25,
  attentionPattern: ["local_sliding", "local_sliding", "local_sliding", "local_sliding", "global"],
  enableMoe: false,
  numExperts: 0,
  topKExperts: 0,
  visionEncoder: GEMMA4_E2B_CONFIG.visionEncoder,
  audioEncoder: GEMMA4_E2B_CONFIG.audioEncoder,
};

export const GEMMA4_26B_A4B_MOE_CONFIG: Gemma4Config = {
  name: "gemma4-26b-a4b-moe",
  vocabSize: 262144,
  embedDim: 2560,
  hiddenDim: 10240,
  numLayers: 38,
  numHeads: 10,
  headDim: 256,
  numKvHeads: 2,
  slidingWindowSize: 1024,
  finalLogitSoftcap: 30.0,
  qkNormWithScale: true,
  rmsNormEps: 1e-6,
  localRopeFrequency: 10000,
  globalRopeFrequency: 1000000,
  localRopeProportion: 1.0,
  globalRopeProportion: 0.25,
  attentionPattern: ["local_sliding", "local_sliding", "local_sliding", "local_sliding", "global"],
  enableMoe: true,
  numExperts: 128,
  topKExperts: 8,
  visionEncoder: GEMMA4_E2B_CONFIG.visionEncoder,
  audioEncoder: GEMMA4_E2B_CONFIG.audioEncoder,
};

export const GEMMA4_31B_CONFIG: Gemma4Config = {
  name: "gemma4-31b",
  vocabSize: 262144,
  embedDim: 4096,
  hiddenDim: 16384,
  numLayers: 48,
  numHeads: 16,
  headDim: 256,
  numKvHeads: 4,
  slidingWindowSize: 1024,
  finalLogitSoftcap: 30.0,
  qkNormWithScale: true,
  rmsNormEps: 1e-6,
  localRopeFrequency: 10000,
  globalRopeFrequency: 1000000,
  localRopeProportion: 1.0,
  globalRopeProportion: 0.25,
  attentionPattern: ["local_sliding", "local_sliding", "local_sliding", "local_sliding", "global"],
  enableMoe: false,
  numExperts: 0,
  topKExperts: 0,
  visionEncoder: GEMMA4_E2B_CONFIG.visionEncoder,
  audioEncoder: GEMMA4_E2B_CONFIG.audioEncoder,
};

export const GEMMA4_MODELS: Record<string, Gemma4Config> = {
  "gemma4-e2b": GEMMA4_E2B_CONFIG,
  "gemma4-e4b": GEMMA4_E4B_CONFIG,
  "gemma4-26b-a4b-moe": GEMMA4_26B_A4B_MOE_CONFIG,
  "gemma4-31b": GEMMA4_31B_CONFIG,
};

/** Get the configuration for a Gemma 4 model by name (defaults to smallest e2b). */
export function getGemma4Config(modelName: string = "gemma4-e2b"): Gemma4Config {
  const norm = modelName.toLowerCase().replace(/_/g, "-");
  return GEMMA4_MODELS[norm] ?? GEMMA4_E2B_CONFIG;
}

/** Compute estimated parameter count and memory requirement in bytes for given precision. */
export function estimateGemma4Memory(
  config: Gemma4Config,
  bytesPerParam: 1 | 2 | 4 = 2, // 1 = 8-bit, 2 = 16-bit (bf16/fp16), 4 = fp32
): { paramCount: number; memoryBytes: number; memoryMb: number } {
  let paramCount = 0;
  if (config.name.includes("e2b")) {
    paramCount = 2_000_000_000;
  } else if (config.name.includes("e4b")) {
    paramCount = 4_000_000_000;
  } else if (config.name.includes("26b")) {
    paramCount = 26_000_000_000;
  } else if (config.name.includes("31b")) {
    paramCount = 31_000_000_000;
  } else {
    paramCount = config.embedDim * config.hiddenDim * config.numLayers;
  }
  const memoryBytes = paramCount * bytesPerParam;
  return {
    paramCount,
    memoryBytes,
    memoryMb: Math.round(memoryBytes / (1024 * 1024)),
  };
}
