// The shared Claude client behind every AI call (docs/spec.md section 6,
// decisions 13 and 27). Server only: it reads ANTHROPIC_API_KEY, which Next.js
// loads from .env.local. Never import this from a screen.

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaThinkingConfigParam,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages";
import type { AiCallName } from "../types";
import { CALLS, MAX_RETRIES, TIMEOUT_MS, type ModelId } from "./config";

/**
 * What every call returns. Failures still carry the model and seconds so the
 * caller can write its ai_calls row; `error` is short English for logs.
 */
export type AiOutcome<T> = { model: string; seconds: number; inputTokens: number; outputTokens: number } & (
  | { ok: true; result: T }
  | { ok: false; error: string }
);

/** The one SDK method we use. Tests pass a fake. */
export type MessagesApi = { create(body: MessageCreateParamsNonStreaming): Promise<BetaMessage> };

export type AiRequest = {
  system: string;
  content: string | BetaContentBlockParam[];
  /** JSON schema of the answer; the API enforces it. */
  schema: Record<string, unknown>;
};

/** Thinking off, per config.ts: Sonnet needs "between_tools", Opus takes no field. */
function thinkingOff(model: ModelId): BetaThinkingConfigParam | undefined {
  switch (model) {
    case "claude-sonnet-5-5":
      return { type: "between_tools" };
    case "claude-haiku-5-5":
      return { type: "disabled" };
    case "claude-opus-5-5":
      return undefined;
  }
}

function realApi(): MessagesApi | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES }).beta.messages;
}

function errorText(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return `Timed out after ${TIMEOUT_MS / 1000} seconds`;
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach Claude";
  if (error instanceof Anthropic.APIError) return `Claude API error ${error.status ?? ""}`.trim();
  return "AI call failed";
}

/** Reads a finished message: the JSON answer, or why there is none. */
function readAnswer<T>(message: BetaMessage): { ok: true; result: T } | { ok: false; error: string } {
  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category;
    return { ok: false, error: category ? `Claude declined (${category})` : "Claude declined" };
  }
  if (message.stop_reason === "max_tokens") return { ok: false, error: "Answer was cut off" };
  const text = message.content.find((block) => block.type === "text");
  if (!text) return { ok: false, error: "Answer had no text" };
  try {
    return { ok: true, result: JSON.parse(text.text) as T };
  } catch {
    return { ok: false, error: "Answer was not valid JSON" };
  }
}

/**
 * Sends one request with the call's model and effort from config.ts and the
 * answer format enforced by structured outputs. The SDK times out at 30 seconds
 * and retries once; a server-side fallback model answers if the first declines,
 * and `model` is the one that answered.
 */
export async function askClaude<T>(call: AiCallName, request: AiRequest, api?: MessagesApi): Promise<AiOutcome<T>> {
  const { model, effort } = CALLS[call];
  const started = performance.now();
  const seconds = () => Math.round(performance.now() - started) / 1000;

  const messages = api ?? realApi();
  if (!messages) return { ok: false, error: "ANTHROPIC_API_KEY is not set", model, seconds: 0, inputTokens: 0, outputTokens: 0 };

  const thinking = thinkingOff(model);
  let message: BetaMessage;
  try {
    message = await messages.create({
      model,
      max_tokens: 16000,
      ...(thinking && { thinking }),
      output_config: { effort, format: { type: "json_schema", schema: request.schema } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: request.system,
      messages: [{ role: "user", content: request.content }],
    });
  } catch (error) {
    return { ok: false, error: errorText(error), model, seconds: seconds(), inputTokens: 0, outputTokens: 0 };
  }

  return {
    ...readAnswer<T>(message),
    model: message.model,
    seconds: seconds(),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
