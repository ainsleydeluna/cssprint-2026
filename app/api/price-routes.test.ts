// The real budget-options, price-update, apply and accuracy routes, signed in as
// test Shop A on cssprint-dev, with Claude replaced by canned answers. Only the
// cookie lookup in requireShop and askClaude are replaced: the pricing and every
// query run for real, under row-level security. Every quote made here is
// deleted at the end. Skipped without the test-account keys.
//
// The tests set markup 50%, fees ₱50 + ₱100, minimum margin 20% and 2 valid-for
// days, the same as app/api/quote-routes.test.ts, and price recipes at the stems'
// latest costs as the stems route reports them: other tests may save receipts
// for Shop A. Shop A is shared with other test runs; rerun once before treating
// a failure as real.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { AccuracyResponse, BudgetOptionsResponse, CreateQuoteResponse, PriceUpdateResponse, StemWithCost } from "@/lib/contract";
import type { AiOutcome } from "@/lib/ai/client";
import type { Quote } from "@/lib/types";
import { signInTestShop, testAccountsReady } from "@/supabase/test-accounts";
import * as accuracyRoute from "./accuracy/route";
import * as photoRoute from "./photos/route";
import * as budgetRoute from "./quotes/[id]/budget-options/route";
import * as copiedRoute from "./quotes/[id]/copied/route";
import * as linesRoute from "./quotes/[id]/lines/route";
import * as applyRoute from "./quotes/[id]/price-update/apply/route";
import * as priceUpdateRoute from "./quotes/[id]/price-update/route";
import * as quoteRoute from "./quotes/[id]/route";
import * as quotesRoute from "./quotes/route";
import * as shopRoute from "./shop/route";
import * as stemsRoute from "./stems/route";

const signedIn = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
const ai = vi.hoisted(() => ({ answers: [] as AiOutcome<unknown>[] }));

vi.mock("@/lib/server/auth", async (importOriginal) => {
  const auth = await importOriginal<typeof import("@/lib/server/auth")>();
  return { ...auth, requireShop: () => auth.shopSession(signedIn.client!) };
});

vi.mock("@/lib/ai/client", async (importOriginal) => {
  const client = await importOriginal<typeof import("@/lib/ai/client")>();
  return { ...client, askClaude: async () => ai.answers.shift() };
});

const usage = { model: "claude-sonnet-5-5", seconds: 2.5, inputTokens: 1000, outputTokens: 200 } as const;

/** Claude's next answer. */
function answer(result: unknown) {
  ai.answers.push({ ok: true, result, ...usage });
}

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as Ctx;
const json = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** Spec decision 3, written out apart from lib/money.ts: recipe × 1.5 + ₱150, rounded up to ₱10. */
function expectedPrice(recipe: number): number {
  const centavos = Math.round(Math.round(recipe * 100) * 1.5 + 15_000);
  return Math.ceil(centavos / 1000) * 10;
}

/** 12 red roses, 6 pink carnations and 2 bunches of baby's breath: every line complete. */
const bouquet = {
  lines: [
    { stem: "Rose - red", color: "red", countLow: 12, countHigh: 12, confidence: "high", closestStem: null, note: "" },
    { stem: "Carnation - pink", color: "pink", countLow: 6, countHigh: 6, confidence: "high", closestStem: null, note: "" },
    { stem: "Baby's breath - white", color: "white", countLow: 2, countHigh: 2, confidence: "high", closestStem: null, note: "" },
  ],
  note: "",
};

describe.skipIf(!testAccountsReady)("budget, price-update and accuracy routes", { timeout: 20_000 }, () => {
  let client: SupabaseClient;
  let stems: Map<string, StemWithCost>;
  const cost = (name: string) => stems.get(name)!.latestCost;
  const made: string[] = [];

  /** Latest costs now; other test runs may save receipts for Shop A meanwhile. */
  async function readCosts() {
    const list: StemWithCost[] = (await (await stemsRoute.GET()).json()).stems;
    stems = new Map(list.map((stem) => [stem.name, stem]));
  }

  async function create(): Promise<CreateQuoteResponse> {
    await readCosts();
    const form = new FormData();
    form.set("kind", "bouquets");
    form.set("photo", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], { type: "image/jpeg" }));
    const { photoPath } = await (await photoRoute.POST(new Request("http://localhost/api/photos", { method: "POST", body: form }))).json();
    ai.answers.push({ ok: true, result: bouquet, ...usage, model: "claude-opus-5-5" });
    const response = await quotesRoute.POST(json("POST", { photoPath }));
    expect(response.status).toBe(200);
    const created: CreateQuoteResponse = await response.json();
    made.push(created.quote.id);
    return created;
  }

  beforeAll(async () => {
    const shopA = await signInTestShop("A");
    signedIn.client = client = shopA.client;
    await shopRoute.PATCH(json("PATCH", { markupPercent: 50, wrapFee: 50, laborFee: 100, minimumMarginPercent: 20, validForDays: 2 }));
  }, 30_000);

  // The shop settings are left as set: restoring them while quote-routes.test.ts
  // still runs would change its prices.
  afterAll(async () => {
    signedIn.client = client;
    for (const id of made) await quoteRoute.DELETE(json("DELETE"), ctx(id));
  }, 30_000);

  test("every route answers 401 unauthorized when signed out", async () => {
    const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } = process.env;
    signedIn.client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      const id = crypto.randomUUID();
      const responses = await Promise.all([
        budgetRoute.POST(json("POST", { budget: 1000 }), ctx(id)),
        priceUpdateRoute.POST(json("POST"), ctx(id)),
        applyRoute.POST(json("POST", { message: "Hi po" }), ctx(id)),
        accuracyRoute.GET(),
      ]);
      for (const response of responses) expect([response.status, (await response.json()).code]).toEqual([401, "unauthorized"]);
    } finally {
      signedIn.client = client;
    }
  });

  test("budget options save the budget, keep options that fit, and log the AI call", async () => {
    const { quote } = await create();
    const fewerRoses = [
      { stem: "Rose - red", count: 6, note: "" },
      { stem: "Carnation - pink", count: 6, note: "" },
      { stem: "Baby's breath - white", count: 1, note: "" },
    ];
    // The budget is exactly "Fewer roses"; the unchanged recipe costs more, so it is dropped.
    const budget = expectedPrice(6 * cost("Rose - red") + 6 * cost("Carnation - pink") + cost("Baby's breath - white"));
    answer({
      options: [
        { label: "Fewer roses", lines: fewerRoses },
        { label: "Same recipe", lines: bouquet.lines.map((line) => ({ stem: line.stem, count: line.countLow, note: "" })) },
      ],
      note: "",
    });

    const response = await budgetRoute.POST(json("POST", { budget, price: 1 }), ctx(quote.id));
    expect(response.status).toBe(200);
    const { options, demo }: BudgetOptionsResponse = await response.json();
    expect(demo).toBe(false);
    expect(options).toMatchObject([
      {
        label: "Fewer roses",
        lines: [
          { stemId: stems.get("Rose - red")!.id, count: 6, costPerStem: cost("Rose - red") },
          { stemId: stems.get("Carnation - pink")!.id, count: 6, costPerStem: cost("Carnation - pink") },
          { stemId: stems.get("Baby's breath - white")!.id, count: 1, costPerStem: cost("Baby's breath - white") },
        ],
        price: budget,
        overBudgetBy: 0,
      },
    ]);
    expect((await (await quoteRoute.GET(json("GET"), ctx(quote.id))).json()).quote.budget).toBe(budget);
    const logged = await client.from("ai_calls").select("call, ok").eq("quote_id", quote.id).eq("call", "fitToBudget");
    expect(logged.data).toEqual([{ call: "fitToBudget", ok: true }]);
  });

  test("budget options refuse a missing budget and an unknown quote", async () => {
    const { quote } = await create();
    const missing = await budgetRoute.POST(json("POST", { budget: "cheap" }), ctx(quote.id));
    expect([missing.status, (await missing.json()).code]).toEqual([400, "invalid_request"]);
    const unknown = await budgetRoute.POST(json("POST", { budget: 1000 }), ctx(crypto.randomUUID()));
    expect([unknown.status, (await unknown.json()).code]).toEqual([404, "not_found"]);
  });

  test("a failed budget call is still logged", async () => {
    const { quote } = await create();
    const error = `Canned failure ${crypto.randomUUID()}`;
    ai.answers.push({ ok: false, error, ...usage });
    // TODO(#30): expect 502 ai_failed once PR #30 adds the code.
    await expect(budgetRoute.POST(json("POST", { budget: 500 }), ctx(quote.id))).rejects.toThrow();
    const logged = await client.from("ai_calls").select("call, ok, quote_id").eq("error", error);
    expect(logged.data).toEqual([{ call: "fitToBudget", ok: false, quote_id: quote.id }]);
  });

  /**
   * A sent quote the margin alarm flagged. Its price is lowered to ₱500 by hand,
   * as if costs rose after sending; the new price is the formula at latest costs.
   */
  async function underwater(): Promise<{ sent: Quote; newPrice: number }> {
    const { quote } = await create();
    const sent: Quote = await (await copiedRoute.POST(json("POST", { replyText: "Hi po!" }), ctx(quote.id))).json();
    const flagged = await client.from("quotes").update({ price: 500, underwater_at: new Date().toISOString() }).eq("id", quote.id);
    expect(flagged.error).toBeNull();
    await readCosts();
    const newPrice = expectedPrice(12 * cost("Rose - red") + 6 * cost("Carnation - pink") + 2 * cost("Baby's breath - white"));
    return { sent: { ...sent, price: 500 }, newPrice };
  }

  test("a price update drafts the message with the old price, the new price and a new valid-until date", async () => {
    const { sent, newPrice } = await underwater();
    answer({ message: "Pasensya na po, {price} na po ito, valid until {validUntil}. Salamat po!", note: "" });

    const response = await priceUpdateRoute.POST(json("POST"), ctx(sent.id));
    expect(response.status).toBe(200);
    const body: PriceUpdateResponse = await response.json();
    expect(body).toEqual({ message: expect.stringContaining("na po ito, valid until"), oldPrice: 500, newPrice, validUntil: sent.validUntil, demo: false });
    const logged = await client.from("ai_calls").select("call, ok").eq("quote_id", sent.id).eq("call", "priceUpdate");
    expect(logged.data).toEqual([{ call: "priceUpdate", ok: true }]);
  });

  test("a price update refuses a quote that is not underwater", async () => {
    const { quote } = await create();
    const response = await priceUpdateRoute.POST(json("POST"), ctx(quote.id));
    expect([response.status, (await response.json()).code]).toEqual([400, "invalid_request"]);
  });

  test("applying sets the new price, resets valid-until, clears the flag, saves the message and keeps the sent time", async () => {
    const { sent, newPrice } = await underwater();
    const response = await applyRoute.POST(json("POST", { message: "Pasensya na po", price: 1, sentAt: null }), ctx(sent.id));
    expect(response.status).toBe(200);
    // Sent today with 2 valid-for days, so the reset date is the one the first copy stamped.
    const applied = { ...sent, price: newPrice, underwaterAt: null, replyText: "Pasensya na po" };
    expect(await response.json()).toEqual(applied);

    // A second copy of the same message changes nothing; a different one is refused.
    const again = await applyRoute.POST(json("POST", { message: "Pasensya na po" }), ctx(sent.id));
    expect([again.status, await again.json()]).toEqual([200, applied]);
    const other = await applyRoute.POST(json("POST", { message: "Iba po" }), ctx(sent.id));
    expect([other.status, (await other.json()).code]).toEqual([400, "invalid_request"]);
  });

  test("budget options for a recipe with no complete line answer no options and make no AI call", async () => {
    const { quote, lines } = await create();
    const blank = lines.map(({ id, stemId, countLow, countHigh, confidence, note }) => ({ id, stemId, count: null, countLow, countHigh, confidence, note }));
    expect((await linesRoute.PUT(json("PUT", { lines: blank }), ctx(quote.id))).status).toBe(200);
    const response = await budgetRoute.POST(json("POST", { budget: 500 }), ctx(quote.id));
    expect(await response.json()).toEqual({ options: [], demo: false });
    const logged = await client.from("ai_calls").select("call").eq("quote_id", quote.id).eq("call", "fitToBudget");
    expect(logged.data).toEqual([]);
  });

  test("applying refuses an empty message", async () => {
    const { sent } = await underwater();
    const response = await applyRoute.POST(json("POST", { message: "" }), ctx(sent.id));
    expect([response.status, (await response.json()).code]).toEqual([400, "invalid_request"]);
  });

  test("accuracy answers the bake-off results and live numbers from the shop's AI calls", async () => {
    const analyses = (body: AccuracyResponse) => body.live.find((row) => row.call === "analyzeBouquet")?.calls ?? 0;
    const before: AccuracyResponse = await (await accuracyRoute.GET()).json();
    await create();
    const response = await accuracyRoute.GET();
    expect(response.status).toBe(200);
    const body: AccuracyResponse = await response.json();
    // Empty until scripts/eval.ts writes fixtures/eval/results.json.
    expect(Array.isArray(body.eval)).toBe(true);
    // create() logged one more analyzeBouquet call, on Opus 5.5, which TOKEN_PRICES prices.
    // Other test runs share Shop A, so the count may grow by more.
    expect(analyses(body)).toBeGreaterThan(analyses(before));
    expect(body.live).toContainEqual({ call: "analyzeBouquet", calls: analyses(body), medianSeconds: expect.any(Number), averageCostUsd: expect.any(Number) });
    expect(body.averageCostPerQuoteUsd).toEqual(expect.any(Number));
  });
});
