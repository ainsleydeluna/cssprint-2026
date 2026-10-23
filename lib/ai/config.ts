// Settings for every AI call (docs/spec.md decisions 13, 26, 27 and section 4).
// Constants only: safe to import from screens. The Claude key never lives here.

import type { AiCallName } from "../types";

/** How a new quote line's count is prefilled from its count range (decision 12). */
export type CountPrefill = "middle";

export type ModelId = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";

/**
 * Model and effort per call. The spec asks for thinking off. Sonnet 5.5 turns
 * thinking off with `thinking: { type: "between_tools" }` at effort "high" or
 * below. Opus 5.5 rejects any way of turning thinking off (HTTP 400), so its
 * calls send no `thinking` field and use effort "low", the closest setting.
 * analyzeBouquet uses Sonnet 5.5, the bake-off's most accurate bouquet run
 * (decision 27; fixtures/eval/results.json, 2026-10-23).
 */
export const CALLS: Record<AiCallName, { model: ModelId; effort: "low" | "medium" | "high" }> = {
  analyzeBouquet: { model: "claude-sonnet-5-5", effort: "low" },
  extractReceipt: { model: "claude-sonnet-5-5", effort: "low" },
  fitToBudget: { model: "claude-sonnet-5-5", effort: "low" },
  draftReply: { model: "claude-sonnet-5-5", effort: "low" },
  priceUpdate: { model: "claude-sonnet-5-5", effort: "low" },
};

export const COUNT_PREFILL: CountPrefill = "middle";

/** Longer side of a shrunken photo, in pixels. 1280, the size of the bake-off's chosen runs (1600 was the other size compared). */
export const MAX_PHOTO_PX = Number(process.env.NEXT_PUBLIC_MAX_PHOTO_PX) || 1280;

/** US dollars per million tokens, Anthropic API list prices checked 2026-10-22. */
export const TOKEN_PRICES: Record<ModelId, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  // Haiku's price for prompts up to 100K tokens; ours are far smaller.
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

/** Per request, passed to the Anthropic SDK as `timeout` (milliseconds) and `maxRetries`. */
export const TIMEOUT_MS = 30_000;
export const MAX_RETRIES = 1;
