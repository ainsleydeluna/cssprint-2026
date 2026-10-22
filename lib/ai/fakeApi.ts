// A stand-in for the Anthropic API in tests: answers every request with one
// canned message and keeps the requests it was sent.

import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages";
import type { MessagesApi } from "./client";

type Request = Parameters<MessagesApi["create"]>[0];

/** A message whose only content is `answer` as JSON text, as structured outputs return it. */
export function fakeMessage(answer: unknown, overrides: Partial<BetaMessage> = {}): BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer), citations: null }],
    stop_reason: "end_turn",
    stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 300 },
    ...overrides,
  } as BetaMessage;
}

/** An API that answers with `reply`, or throws it when it is an Error. */
export function fakeApi(reply: BetaMessage | Error): { api: MessagesApi; requests: Request[] } {
  const requests: Request[] = [];
  const api: MessagesApi = {
    async create(body) {
      requests.push(body);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { api, requests };
}
