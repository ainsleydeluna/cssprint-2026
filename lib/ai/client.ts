// The shared Claude client behind every AI call (docs/spec.md section 6,
// decisions 13 and 27). Server only: it reads ANTHROPIC_API_KEY, which Next.js
// loads from .env.local. Never import this from a screen.

import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
  ThinkingConfigParam,
} from "@anthropic-ai/sdk/resources/messages";
import type { AiCallName } from "../types";
import { CALLS, MAX_RETRIES, TIMEOUT_MS, type ModelId } from "./config";

/**
 * What every call returns. Failures still carry the model and seconds so the
 * caller can write its ai_calls row; `error` is short English for logs.
 */
export type AiOutcome<T> = { model: ModelId; seconds: number; inputTokens: number; outputTokens: number } & (
  | { ok: true; result: T }
  | { ok: false; error: string }
);

/** The one SDK method we use. Tests pass a fake. */
export type MessagesApi = { create(body: MessageCreateParamsNonStreaming): Promise<Message> };

export type AiRequest = {
  system: string;
  content: string | ContentBlockParam[];
  /** JSON schema of the answer; the API enforces it. */
  schema: Record<string, unknown>;
};

/** Thinking off, per config.ts: Sonnet needs "between_tools", Opus takes no field. */
function thinkingOff(model: ModelId): ThinkingConfigParam | undefined {
  switch (model) {
    case "claude-sonnet-5-5":
      return { type: "between_tools" };
    case "claude-haiku-5-5":
      return { type: "disabled" };
    case "claude-opus-5-5":
      return undefined;
  }
}

let client: { apiKey: string; api: MessagesApi } | undefined;

/** One SDK client per key, so calls reuse its connections. */
function realApi(): MessagesApi | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (client?.apiKey !== apiKey) {
    client = { apiKey, api: new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES }).messages };
  }
  return client.api;
}

function errorText(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    const seconds = (TIMEOUT_MS * (MAX_RETRIES + 1)) / 1000;
    return `Timed out; gave up after one retry (about ${seconds} seconds)`;
  }
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach Claude";
  if (error instanceof Anthropic.APIError) return `Claude API error ${error.status ?? ""}`.trim();
  return "AI call failed";
}

/** Reads a finished message: the JSON answer, or why there is none. */
function readAnswer<T>(message: Message): { ok: true; result: T } | { ok: false; error: string } {
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
 * and retries once. There is no fallback to another model, so `model` is always
 * the configured one and the bake-off measures one model per run.
 */
export async function askClaude<T>(call: AiCallName, request: AiRequest, api?: MessagesApi): Promise<AiOutcome<T>> {
  const { model, effort } = CALLS[call];
  const started = performance.now();
  const seconds = () => Math.round(performance.now() - started) / 1000;

  const messages = api ?? realApi();
  if (!messages) return { ok: false, error: "ANTHROPIC_API_KEY is not set", model, seconds: 0, inputTokens: 0, outputTokens: 0 };

  const thinking = thinkingOff(model);
  let message: Message;
  try {
    message = await messages.create({
      model,
      max_tokens: 16000,
      ...(thinking && { thinking }),
      output_config: { effort, format: { type: "json_schema", schema: request.schema } },
      system: request.system,
      messages: [{ role: "user", content: request.content }],
    });
  } catch (error) {
    return { ok: false, error: errorText(error), model, seconds: seconds(), inputTokens: 0, outputTokens: 0 };
  }

  return {
    ...readAnswer<T>(message),
    model,
    seconds: seconds(),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
