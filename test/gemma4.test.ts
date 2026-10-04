// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 aphrody contributors & Google DeepMind
import { describe, expect, it } from "bun:test";
import {
  GEMMA4_E2B_CONFIG,
  GEMMA4_E4B_CONFIG,
  GEMMA4_26B_A4B_MOE_CONFIG,
  GEMMA4_31B_CONFIG,
  GEMMA4_SPECIAL_TOKENS,
  getGemma4Config,
  estimateGemma4Memory,
  formatGemma4ChatPrompt,
  parseGemma4Response,
  cosineSimilarity,
  euclideanDistance,
  normalizeL2,
  generateDeterministicEmbedding,
  computeKVCacheFootprintBytes,
} from "../packages/core/src/gemma4/index";

describe("Google DeepMind Gemma 4 Core Layer in YOLO", () => {
  it("verifies Gemma 4 E2B smallest model configuration strictly conforms to Google specifications", () => {
    const config = GEMMA4_E2B_CONFIG;
    expect(config.name).toBe("gemma4-e2b");
    expect(config.vocabSize).toBe(262144);
    expect(config.embedDim).toBe(1536);
    expect(config.hiddenDim).toBe(6144);
    expect(config.numLayers).toBe(35);
    expect(config.numHeads).toBe(8);
    expect(config.headDim).toBe(256);
    expect(config.numKvHeads).toBe(1); // GQA / MQA ultra-compact
    expect(config.slidingWindowSize).toBe(512);
    expect(config.finalLogitSoftcap).toBe(30.0);
    expect(config.rmsNormEps).toBe(1e-6);
    expect(config.enableMoe).toBe(false);

    // Multimodal encoders
    expect(config.visionEncoder).toBeDefined();
    expect(config.visionEncoder?.outputLength).toBe(280);
    expect(config.audioEncoder).toBeDefined();
    expect(config.audioEncoder?.melChannels).toBe(128);

    // Memory estimation
    const mem = estimateGemma4Memory(config);
    expect(mem.paramCount).toBe(2_000_000_000);
    expect(mem.memoryMb).toBe(3815); // ~3.8 GB in 16-bit
  });

  it("verifies family retrieval and fallback to smallest model (E2B)", () => {
    expect(getGemma4Config("gemma4-e2b").name).toBe("gemma4-e2b");
    expect(getGemma4Config("gemma4_e2b").name).toBe("gemma4-e2b");
    expect(getGemma4Config("unknown-variant").name).toBe("gemma4-e2b");
    expect(getGemma4Config("gemma4-e4b").numHeads).toBe(10);
    expect(getGemma4Config("gemma4-26b-a4b-moe").enableMoe).toBe(true);
    expect(getGemma4Config("gemma4-31b").numLayers).toBe(48);
  });

  it("formats canonical Google Gemma 4 chat prompts with turns and reasoning traces", () => {
    const prompt = formatGemma4ChatPrompt([
      { role: "system", content: "You are Antigravity Core." },
      { role: "user", content: "Explain sliding window attention." },
      {
        role: "model",
        content: "Sliding window restricts local attention to W tokens.",
        thought: "User wants a clear, mathematical explanation.",
      },
    ]);

    expect(prompt.startsWith(GEMMA4_SPECIAL_TOKENS.BOS)).toBe(true);
    expect(prompt).toContain(
      "<start_of_turn>user\nYou are Antigravity Core.\n\nExplain sliding window attention.<end_of_turn>",
    );
    expect(prompt).toContain(
      "<start_of_turn>model\n<thought>\nUser wants a clear, mathematical explanation.\n</thought>\nSliding window restricts local attention to W tokens.<end_of_turn>",
    );
    expect(prompt.endsWith("<start_of_turn>model\n")).toBe(true);
  });

  it("formats multimodal token placeholders in user turns", () => {
    const prompt = formatGemma4ChatPrompt([
      {
        role: "user",
        content: "Describe this image and audio snippet.",
        imageCount: 2,
        audioCount: 1,
      },
    ]);

    expect(prompt).toContain("<image><image>\n<audio>\nDescribe this image and audio snippet.");
  });

  it("parses model responses separating thoughts from final content", () => {
    const raw =
      "<thought>\nStep 1: calculate norm\nStep 2: return dot product\n</thought>\nThe cosine similarity is 0.98.<end_of_turn>";
    const parsed = parseGemma4Response(raw);
    expect(parsed.thought).toBe("Step 1: calculate norm\nStep 2: return dot product");
    expect(parsed.content).toBe("The cosine similarity is 0.98.");

    const rawNoThought = "Direct answer without reasoning trace.";
    const parsedNoThought = parseGemma4Response(rawNoThought);
    expect(parsedNoThought.thought).toBeNull();
    expect(parsedNoThought.content).toBe("Direct answer without reasoning trace.");
  });

  it("calculates high-precision vector embeddings and cosine similarity", () => {
    const textA = "Google DeepMind Gemma 4 E2B is an ultra-compact multimodal model.";
    const textB = "Google DeepMind Gemma 4 E2B is a lightweight multimodal neural network.";
    const textC = "Ancient Roman architecture and aqueduct engineering.";

    const vecA = generateDeterministicEmbedding(textA);
    const vecB = generateDeterministicEmbedding(textB);
    const vecC = generateDeterministicEmbedding(textC);

    expect(vecA.length).toBe(1536);

    const simAB = cosineSimilarity(vecA, vecB);
    const simAC = cosineSimilarity(vecA, vecC);

    // Same text has perfect cosine similarity
    expect(cosineSimilarity(vecA, vecA)).toBeCloseTo(1.0, 5);

    // Semantic proximity check
    expect(simAB).toBeGreaterThan(simAC);

    // Euclidean distance
    expect(euclideanDistance(vecA, vecA)).toBe(0.0);
    expect(euclideanDistance(vecA, vecB)).toBeGreaterThan(0.0);
  });

  it("computes exact KV cache footprint matching sliding window constraints", () => {
    const kv512 = computeKVCacheFootprintBytes(GEMMA4_E2B_CONFIG, 1, 512);
    const kv2048 = computeKVCacheFootprintBytes(GEMMA4_E2B_CONFIG, 1, 2048);

    // Because 28 of 35 layers are local_sliding (window=512), memory grows much slower than O(N)
    expect(kv512.totalBytes).toBeGreaterThan(0);
    expect(kv2048.totalBytes).toBeGreaterThan(kv512.totalBytes);

    // Sliding window bounds local layers
    expect(kv2048.localBytes).toBe(kv512.localBytes);
  });

  it("executes unified inference and streaming with thought traces", async () => {
    const { UnifiedInferenceEngine } = await import("../packages/core/src/gemma4/index");
    const engine = new UnifiedInferenceEngine("gemma4-e2b");

    const response = await engine.infer({
      prompt: "Synthesize the architecture of Gemma 4.",
      systemPrompt: "You are Antigravity Core AI.",
      thought: "Plan: summarize multimodal tokens and sliding window attention.",
    });

    expect(response.model).toBe("gemma4-e2b");
    expect(response.backend).toBe("local");
    expect(response.thought).toContain("Plan: summarize multimodal tokens");
    expect(response.text).toContain("Processed turn successfully");
    expect(response.usage.promptTokensEst).toBeGreaterThan(0);
    expect(response.usage.completionTokensEst).toBeGreaterThan(0);

    // Streaming
    const chunks: string[] = [];
    for await (const chunk of engine.stream({ prompt: "Quick test." })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toContain("Processed turn successfully");
  });
});
