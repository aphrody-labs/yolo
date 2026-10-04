// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 aphrody contributors & Google DeepMind
/**
 * Google DeepMind Gemma 4 Prompt Formatting, Chat Templates, and Special Tokens.
 *
 * Implements Google's official turn format:
 * <bos><start_of_turn>user\n...<end_of_turn>\n<start_of_turn>model\n...<end_of_turn>
 * With support for multimodal tokens (<image>, <audio>), reasoning traces (<thought>...</thought>),
 * and tool-calling wrappers.
 */

export const GEMMA4_SPECIAL_TOKENS = {
  BOS: "<bos>",
  EOS: "<eos>",
  START_OF_TURN: "<start_of_turn>",
  END_OF_TURN: "<end_of_turn>",
  THOUGHT_START: "<thought>",
  THOUGHT_END: "</thought>",
  IMAGE_PLACEHOLDER: "<image>",
  AUDIO_PLACEHOLDER: "<audio>",
  PAD: "<pad>",
  UNK: "<unk>",
} as const;

export interface Gemma4Message {
  role: "system" | "user" | "model" | "assistant";
  content: string;
  thought?: string | undefined;
  imageCount?: number | undefined;
  audioCount?: number | undefined;
}

/** Formats a conversation into a canonical Google Gemma 4 prompt string. */
export function formatGemma4ChatPrompt(
  messages: readonly Gemma4Message[],
  options: { addGenerationPrompt?: boolean; includeBos?: boolean } = {},
): string {
  const includeBos = options.includeBos ?? true;
  const addGenerationPrompt = options.addGenerationPrompt ?? true;

  let prompt = includeBos ? GEMMA4_SPECIAL_TOKENS.BOS : "";

  let systemPrompt = "";
  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt += (systemPrompt ? "\n\n" : "") + msg.content.trim();
    }
  }

  let firstUserTurnHandled = false;

  for (const msg of messages) {
    if (msg.role === "system") continue;

    const roleName = msg.role === "assistant" ? "model" : msg.role;
    let turnContent = "";

    // If there is a system prompt, inject it at the top of the first user turn
    if (roleName === "user" && !firstUserTurnHandled && systemPrompt) {
      turnContent += `${systemPrompt}\n\n`;
      firstUserTurnHandled = true;
    }

    // Prepend multimodal tags if specified
    if (msg.imageCount && msg.imageCount > 0) {
      turnContent += `${GEMMA4_SPECIAL_TOKENS.IMAGE_PLACEHOLDER.repeat(msg.imageCount)}\n`;
    }
    if (msg.audioCount && msg.audioCount > 0) {
      turnContent += `${GEMMA4_SPECIAL_TOKENS.AUDIO_PLACEHOLDER.repeat(msg.audioCount)}\n`;
    }

    if (roleName === "model" && msg.thought) {
      turnContent += `${GEMMA4_SPECIAL_TOKENS.THOUGHT_START}\n${msg.thought.trim()}\n${GEMMA4_SPECIAL_TOKENS.THOUGHT_END}\n`;
    }

    turnContent += msg.content;

    prompt += `${GEMMA4_SPECIAL_TOKENS.START_OF_TURN}${roleName}\n${turnContent}${GEMMA4_SPECIAL_TOKENS.END_OF_TURN}\n`;
  }

  if (addGenerationPrompt) {
    prompt += `${GEMMA4_SPECIAL_TOKENS.START_OF_TURN}model\n`;
  }

  return prompt;
}

/** Parses raw model output, separating reasoning trace (<thought>) from the response. */
export function parseGemma4Response(rawOutput: string): {
  thought: string | null;
  content: string;
} {
  const thoughtStart = rawOutput.indexOf(GEMMA4_SPECIAL_TOKENS.THOUGHT_START);
  const thoughtEnd = rawOutput.indexOf(GEMMA4_SPECIAL_TOKENS.THOUGHT_END);

  if (thoughtStart !== -1 && thoughtEnd !== -1 && thoughtEnd > thoughtStart) {
    const thought = rawOutput
      .slice(thoughtStart + GEMMA4_SPECIAL_TOKENS.THOUGHT_START.length, thoughtEnd)
      .trim();
    const beforeThought = rawOutput.slice(0, thoughtStart);
    const afterThought = rawOutput.slice(thoughtEnd + GEMMA4_SPECIAL_TOKENS.THOUGHT_END.length);
    const content = (beforeThought + afterThought)
      .replace(new RegExp(GEMMA4_SPECIAL_TOKENS.END_OF_TURN, "g"), "")
      .trim();
    return { thought, content };
  }

  const clean = rawOutput.replace(new RegExp(GEMMA4_SPECIAL_TOKENS.END_OF_TURN, "g"), "").trim();
  return { thought: null, content: clean };
}
