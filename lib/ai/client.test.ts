import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { describe, expect, test } from "vitest";
import { askClaude } from "./client";
import { fakeApi, fakeMessage } from "./fakeApi";
import { schema } from "./shared";

const request = { system: "Read the receipt.", content: "hello", schema: { type: "object" } };

describe("askClaude", () => {
  test("returns the parsed answer with the model, seconds and tokens", async () => {
    const { api } = fakeApi(fakeMessage({ note: "ok" }));

    const outcome = await askClaude<{ note: string }>("extractReceipt", request, api);

    expect(outcome).toMatchObject({
      ok: true,
      result: { note: "ok" },
      model: "claude-sonnet-5-5",
      inputTokens: 1200,
      outputTokens: 300,
    });
    expect(outcome.seconds).toBeGreaterThanOrEqual(0);
  });

  test("a request's model replaces the call's, with that model's way of turning thinking off", async () => {
    const { api, requests } = fakeApi(fakeMessage({}));

    const outcome = await askClaude("analyzeBouquet", { ...request, model: "claude-haiku-5-5" }, api);

    expect(requests[0]).toMatchObject({ model: "claude-haiku-5-5", thinking: { type: "disabled" } });
    expect(outcome.model).toBe("claude-haiku-5-5");
  });

  test("sends the call's model and effort, thinking off, and the answer format", async () => {
    const { api, requests } = fakeApi(fakeMessage({}));

    await askClaude("extractReceipt", request, api);
    await askClaude("analyzeBouquet", request, api);
    await askClaude("analyzeBouquet", { ...request, model: "claude-opus-5-5" }, api);

    expect(requests[0]).toMatchObject({
      model: "claude-sonnet-5-5",
      thinking: { type: "between_tools" },
      output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object" } } },
      system: "Read the receipt.",
      messages: [{ role: "user", content: "hello" }],
    });
    // analyzeBouquet is on Sonnet 5.5 since the bake-off.
    expect(requests[1]).toMatchObject({ model: "claude-sonnet-5-5", thinking: { type: "between_tools" }, output_config: { effort: "low" } });
    // Opus sends no thinking field: it rejects every way of turning thinking off.
    expect(requests[2]).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "low" } });
    expect(requests[2]).not.toHaveProperty("thinking");
  });

  test("asks one model only, with no fallback, and logs the configured model", async () => {
    const { api, requests } = fakeApi(fakeMessage({}, { model: "claude-opus-5-5" }));

    expect(await askClaude("extractReceipt", request, api)).toMatchObject({ ok: true, model: "claude-sonnet-5-5" });
    expect(requests[0]).not.toHaveProperty("fallbacks");
    expect(requests[0]).not.toHaveProperty("betas");
  });

  test("says it gave up after one retry when the request times out", async () => {
    const { api } = fakeApi(new Anthropic.APIConnectionTimeoutError());

    expect(await askClaude("extractReceipt", request, api)).toMatchObject({
      ok: false,
      error: "Timed out; gave up after one retry (about 60 seconds)",
    });
  });

  test("turns a refusal into a short error that keeps the tokens", async () => {
    const { api } = fakeApi(
      fakeMessage("", {
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber" } as Message["stop_details"],
      }),
    );

    expect(await askClaude("extractReceipt", request, api)).toMatchObject({
      ok: false,
      error: "Claude declined (cyber)",
      inputTokens: 1200,
      outputTokens: 300,
    });
  });

  test("turns a cut-off answer into an error", async () => {
    const { api } = fakeApi(fakeMessage('{"note": "o', { stop_reason: "max_tokens" }));

    expect(await askClaude("extractReceipt", request, api)).toMatchObject({ ok: false, error: "Answer was cut off" });
  });

  test("turns an answer that is not JSON into an error", async () => {
    const { api } = fakeApi(fakeMessage("Sorry, I can't read that."));

    expect(await askClaude("extractReceipt", request, api)).toMatchObject({
      ok: false,
      error: "Answer was not valid JSON",
    });
  });

  describe("checks the answer against its schema", () => {
    const linesRequest = {
      ...request,
      schema: schema.object({
        lines: { type: "array", items: schema.object({ stem: schema.nullable("string"), count: { type: "integer" } }) },
        note: { type: "string" },
      }),
    };
    const ask = (answer: unknown) => askClaude("analyzeBouquet", linesRequest, fakeApi(fakeMessage(answer)).api);

    test("passes an answer with every field", async () => {
      expect(await ask({ lines: [{ stem: null, count: 3 }], note: "" })).toMatchObject({ ok: true });
    });

    test("fails an answer without its lines array", async () => {
      expect(await ask({ note: "" })).toMatchObject({ ok: false, error: "Answer is missing lines" });
    });

    test("fails a line without a required field", async () => {
      expect(await ask({ lines: [{ count: 3 }], note: "" })).toMatchObject({
        ok: false,
        error: "Answer is missing lines[0].stem",
      });
    });

    test("fails a field of the wrong type", async () => {
      expect(await ask({ lines: [{ stem: "Rose - red", count: 2.5 }], note: "" })).toMatchObject({
        ok: false,
        error: "Answer has a wrong lines[0].count",
      });
    });
  });

  test("turns a thrown API error into a short error with the configured model", async () => {
    const { api } = fakeApi(new Anthropic.InternalServerError(500, undefined, "boom", new Headers()));

    expect(await askClaude("analyzeBouquet", request, api)).toMatchObject({
      ok: false,
      error: "Claude API error 500",
      model: "claude-sonnet-5-5",
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  test("says so when the API key is missing", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(await askClaude("extractReceipt", request)).toMatchObject({
        ok: false,
        error: "ANTHROPIC_API_KEY is not set",
      });
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
