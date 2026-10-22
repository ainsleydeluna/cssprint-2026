// The real photo, quote and reply routes, signed in as test Shop A on
// cssprint-dev, with Claude replaced by canned answers. Only the cookie lookup
// in requireShop and askClaude are replaced: analyzeBouquet's clamps, the
// pricing and every query run for real, under row-level security. Every quote
// made here is deleted at the end. Skipped without the test-account keys.
//
// Prices are worked by hand from the seed's sample prices (Shop A has no
// receipts): Rose - red ₱250 a dozen is ₱20.83 a stem, Carnation - pink ₱150
// per 10 is ₱15, Baby's breath ₱100 a bunch, Sunflower ₱80, Tulip ₱120. The
// tests set markup 50% and fees ₱50 + ₱100.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { CreateQuoteResponse, QuoteDetail, QuoteListResponse, StemWithCost, UpdateQuoteLinesRequest } from "@/lib/contract";
import type { AiOutcome } from "@/lib/ai/client";
import type { Quote, Shop } from "@/lib/types";
import { signInTestShop, testAccountsReady } from "@/supabase/test-accounts";
import * as photoRoute from "./photos/route";
import * as copiedRoute from "./quotes/[id]/copied/route";
import * as linesRoute from "./quotes/[id]/lines/route";
import * as replyRoute from "./quotes/[id]/reply/route";
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

/** Claude's next answer. */
function answer(result: unknown) {
  ai.answers.push({ ok: true, result, model: "claude-opus-5-5", seconds: 4.2, inputTokens: 1500, outputTokens: 400 });
}

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as Ctx;
const json = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** A tiny file that starts like a JPEG; storage does not decode it. */
async function uploadBouquet(): Promise<string> {
  const form = new FormData();
  form.set("kind", "bouquets");
  form.set("photo", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], { type: "image/jpeg" }));
  const response = await photoRoute.POST(new Request("http://localhost/api/photos", { method: "POST", body: form }));
  expect(response.status).toBe(200);
  return (await response.json()).photoPath;
}

const bouquet = {
  lines: [
    { stem: "Rose - red", color: "red", countLow: 10, countHigh: 13, confidence: "high", closestStem: null, note: "" },
    { stem: "Other", color: "blush", countLow: 5, countHigh: 6, confidence: "high", closestStem: "Carnation - pink", note: "Peony, blush" },
    { stem: "Other", color: "green", countLow: 3, countHigh: 3, confidence: "low", closestStem: null, note: "Unknown pods" },
    { stem: "Baby's breath - white", color: "white", countLow: 1, countHigh: 2, confidence: "medium", closestStem: null, note: "" },
  ],
  note: "",
};

/** The calendar date in Manila `days` from today, worked out separately from lib/server/quote-rules. */
function manilaDate(days: number): string {
  const manila = new Date(Date.now() + 8 * 3600_000);
  return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate() + days)).toISOString().slice(0, 10);
}

describe.skipIf(!testAccountsReady)("quote routes", { timeout: 20_000 }, () => {
  let client: SupabaseClient;
  let before: Shop;
  let stems: Map<string, StemWithCost>;
  const made: string[] = [];

  async function create(): Promise<CreateQuoteResponse> {
    const photoPath = await uploadBouquet();
    answer(bouquet);
    const response = await quotesRoute.POST(json("POST", { photoPath }));
    expect(response.status).toBe(200);
    const created: CreateQuoteResponse = await response.json();
    made.push(created.quote.id);
    return created;
  }

  /**
   * Whether the photo is still stored. Asks the folder listing, not a download:
   * Supabase keeps serving a photo downloaded before its delete from its cache.
   */
  async function photoStored(photoPath: string): Promise<boolean> {
    const [folder, file] = photoPath.split("/");
    const { data, error } = await client.storage.from("bouquets").list(folder, { search: file });
    if (error) throw new Error(error.message);
    return data.some((object) => object.name === file);
  }

  async function putLines(id: string, lines: UpdateQuoteLinesRequest["lines"]) {
    return linesRoute.PUT(json("PUT", { lines }), ctx(id));
  }

  /** The created quote's lines, as the screen sends them back. */
  function editable(detail: QuoteDetail): UpdateQuoteLinesRequest["lines"] {
    return detail.lines.map(({ id, stemId, count, countLow, countHigh, confidence, note }) => ({ id, stemId, count, countLow, countHigh, confidence, note }));
  }

  /** Fills the "pick a flower" line, so the quote can be copied. */
  async function completed(): Promise<QuoteDetail> {
    const created = await create();
    const lines = editable(created).map((line) => (line.stemId === null ? { ...line, stemId: stems.get("Sunflower - yellow")!.id } : line));
    return (await putLines(created.quote.id, lines)).json();
  }

  beforeAll(async () => {
    const shopA = await signInTestShop("A");
    signedIn.client = client = shopA.client;
    before = await (await shopRoute.GET()).json();
    await shopRoute.PATCH(json("PATCH", { markupPercent: 50, wrapFee: 50, laborFee: 100, validForDays: 2 }));
    const list: StemWithCost[] = (await (await stemsRoute.GET()).json()).stems;
    stems = new Map(list.map((stem) => [stem.name, stem]));
  }, 30_000);

  afterAll(async () => {
    signedIn.client = client;
    for (const id of made) await quoteRoute.DELETE(json("DELETE"), ctx(id));
    const { markupPercent, wrapFee, laborFee, validForDays } = before;
    await shopRoute.PATCH(json("PATCH", { markupPercent, wrapFee, laborFee, validForDays }));
  }, 30_000);

  test("every quote route answers 401 unauthorized when signed out", async () => {
    const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } = process.env;
    signedIn.client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      const id = crypto.randomUUID();
      const responses = await Promise.all([
        photoRoute.POST(json("POST")),
        quotesRoute.GET(),
        quotesRoute.POST(json("POST", {})),
        quoteRoute.GET(json("GET"), ctx(id)),
        quoteRoute.PATCH(json("PATCH", {}), ctx(id)),
        quoteRoute.DELETE(json("DELETE"), ctx(id)),
        linesRoute.PUT(json("PUT", { lines: [] }), ctx(id)),
        replyRoute.POST(json("POST"), ctx(id)),
        copiedRoute.POST(json("POST", { replyText: "Hi po!" }), ctx(id)),
      ]);
      for (const response of responses) expect([response.status, (await response.json()).code]).toEqual([401, "unauthorized"]);
    } finally {
      signedIn.client = client;
    }
  });

  test("creating a quote prefills, prices and labels it, and logs the AI call", async () => {
    const { quote, lines, demo } = await create();
    expect(demo).toBe(false);
    expect([quote.status, quote.label]).toEqual(["draft", expect.stringMatching(/^Inquiry \d+$/)]);
    expect(lines).toMatchObject([
      // Middle of 10–13, rounded up.
      { stemId: stems.get("Rose - red")!.id, count: 12, costPerStem: 20.83, confidence: "high" },
      // Other is priced at its closest stem, highlighted, with the real name in the note.
      { stemId: stems.get("Carnation - pink")!.id, count: 6, costPerStem: 15, confidence: "medium", note: "Peony, blush" },
      // Other with no closest stem: a "pick a flower" line, unpriced.
      { stemId: null, count: 3, costPerStem: 0 },
      { stemId: stems.get("Baby's breath - white")!.id, count: 2, costPerStem: 100 },
    ]);
    // 12 × 20.83 + 6 × 15 + 2 × 100 = 539.96; × 1.5 + 150 = 959.94, rounded up to ₱960.
    expect(quote.price).toBe(960);

    const logged = await client.from("ai_calls").select("call, ok, model, input_tokens").eq("quote_id", quote.id);
    expect(logged.data).toEqual([{ call: "analyzeBouquet", ok: true, model: "claude-opus-5-5", input_tokens: 1500 }]);
  });

  test("a failed analysis saves no quote, deletes the photo and still logs the call", async () => {
    const photoPath = await uploadBouquet();
    const error = `Canned failure ${crypto.randomUUID()}`;
    ai.answers.push({ ok: false, error, model: "claude-opus-5-5", seconds: 30, inputTokens: 0, outputTokens: 0 });
    await expect(quotesRoute.POST(json("POST", { photoPath }))).rejects.toThrow(error);

    expect((await client.from("quotes").select("id").eq("photo_path", photoPath)).data).toEqual([]);
    expect(await photoStored(photoPath)).toBe(false);
    const logged = await client.from("ai_calls").select("call, ok, quote_id").eq("error", error);
    expect(logged.data).toEqual([{ call: "analyzeBouquet", ok: false, quote_id: null }]);
  });

  test("creating a quote refuses a photo outside the shop's folder", async () => {
    const response = await quotesRoute.POST(json("POST", { photoPath: `${crypto.randomUUID()}/${crypto.randomUUID()}.jpg` }));
    expect([response.status, (await response.json()).code]).toEqual([400, "invalid_request"]);
  });

  test("saving lines keeps the florist's counts and reprices at latest costs", async () => {
    const created = await create();
    const [rose, other, , filler] = editable(created);
    const response = await putLines(created.quote.id, [
      { ...rose, count: 24 },
      { ...other, stemId: stems.get("Sunflower - yellow")!.id },
      filler,
      { stemId: stems.get("Tulip - pink")!.id, count: 1, countLow: 1, countHigh: 1, confidence: "high", note: "" },
    ]);
    const { quote, lines }: QuoteDetail = await response.json();
    expect(lines.map((line) => [line.stemId, line.count])).toEqual([
      [rose.stemId, 24],
      [stems.get("Sunflower - yellow")!.id, 6],
      [filler.stemId, 2],
      [stems.get("Tulip - pink")!.id, 1],
    ]);
    // 24 × 20.83 + 6 × 80 + 2 × 100 + 120 = 1,299.92; × 1.5 + 150 = 2,099.88, rounded up to ₱2,100.
    expect(quote.price).toBe(2100);
  });

  test("saving lines never applies the 200-stem limit, and refuses a line out of range", async () => {
    const created = await create();
    const [rose] = editable(created);
    const many = [{ ...rose, count: 100 }, { ...rose, id: undefined, count: 100 }, { ...rose, id: undefined, count: 100 }];
    const saved: QuoteDetail = await (await putLines(created.quote.id, many)).json();
    expect(saved.lines.map((line) => line.count)).toEqual([100, 100, 100]);

    for (const count of [0, 101]) {
      const response = await putLines(created.quote.id, [{ ...rose, count }]);
      expect([response.status, (await response.json()).code]).toEqual([400, "invalid_request"]);
    }
  });

  test("copying is refused while a line has no flower, then stamps the quote once", async () => {
    const created = await create();
    const refused = await copiedRoute.POST(json("POST", { replyText: "Hi po!" }), ctx(created.quote.id));
    expect([refused.status, (await refused.json()).code]).toEqual([422, "incomplete_quote"]);

    const { quote } = await completed();
    const first: Quote = await (await copiedRoute.POST(json("POST", { replyText: "Hi po!" }), ctx(quote.id))).json();
    expect(first).toMatchObject({ status: "sent", replyText: "Hi po!", validUntil: manilaDate(2) });
    expect(first.sentAt).not.toBeNull();

    const again: Quote = await (await copiedRoute.POST(json("POST", { replyText: "Hi po! Edited" }), ctx(quote.id))).json();
    expect(again).toMatchObject({ status: "sent", sentAt: first.sentAt, validUntil: first.validUntil, replyText: "Hi po! Edited" });

    const list: QuoteListResponse = await (await quotesRoute.GET()).json();
    expect(list.quotes.find((item) => item.id === quote.id)?.timeToQuoteSeconds).toBeGreaterThanOrEqual(0);
    expect(list.averageTimeToQuoteSeconds).not.toBeNull();
  });

  test("a sent quote's lines cannot be edited", async () => {
    const detail = await completed();
    await copiedRoute.POST(json("POST", { replyText: "Hi po!" }), ctx(detail.quote.id));
    const response = await putLines(detail.quote.id, editable(detail));
    expect([response.status, (await response.json()).code]).toEqual([400, "invalid_request"]);
  });

  test("reading a sent quote past its valid-until date answers and saves it as expired", async () => {
    const detail = await completed();
    await copiedRoute.POST(json("POST", { replyText: "Hi po!" }), ctx(detail.quote.id));
    await client.from("quotes").update({ valid_until: manilaDate(-1) }).eq("id", detail.quote.id);

    const read: QuoteDetail = await (await quoteRoute.GET(json("GET"), ctx(detail.quote.id))).json();
    expect(read.quote.status).toBe("expired");
    expect((await client.from("quotes").select("status").eq("id", detail.quote.id).single()).data).toEqual({ status: "expired" });
  });

  test("drafting the reply fills in the price and date, saves the text and logs the call", async () => {
    const { quote } = await completed();
    answer({ message: "Hi po! Roses and sunflowers, {price}, valid hanggang {validUntil}.", note: "" });
    const response = await replyRoute.POST(json("POST"), ctx(quote.id));
    const { message, demo } = await response.json();
    // Sunflower 3 × 80 fills the "pick a flower" line: 779.96 × 1.5 + 150 = 1,319.94, rounded up to ₱1,320.
    expect(message).toMatch(/^Hi po! Roses and sunflowers, ₱1,320, valid hanggang \w{3} \d{1,2}\.$/);
    expect(demo).toBe(false);
    expect((await client.from("quotes").select("reply_text").eq("id", quote.id).single()).data?.reply_text).toBe(message);
    const logged = await client.from("ai_calls").select("call, ok").eq("quote_id", quote.id).eq("call", "draftReply");
    expect(logged.data).toEqual([{ call: "draftReply", ok: true }]);
  });

  test("renaming changes only the allowed fields", async () => {
    const { quote } = await create();
    const response = await quoteRoute.PATCH(json("PATCH", { label: " Debut, Oct 25 ", status: "sent", price: 1 }), ctx(quote.id));
    expect(await response.json()).toMatchObject({ label: "Debut, Oct 25", status: "draft", price: 960 });
  });

  test("deleting a quote deletes its photo", async () => {
    const { quote } = await create();
    expect(await photoStored(quote.photoPath)).toBe(true);
    const response = await quoteRoute.DELETE(json("DELETE"), ctx(quote.id));
    expect(await response.json()).toEqual({ deleted: true });
    expect(await photoStored(quote.photoPath)).toBe(false);
    expect((await quoteRoute.GET(json("GET"), ctx(quote.id))).status).toBe(404);
  });
});
