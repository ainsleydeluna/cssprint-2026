// The real photo and receipt routes, signed in as test Shop A on cssprint-dev.
// Only the cookie lookup in requireShop and the Anthropic call are replaced:
// storage, save_receipt, the margin alarm and every query run for real, under
// row-level security. Skipped without the test-account keys.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { AiOutcome } from "@/lib/ai/client";
import type { ExtractReceiptResponse, ExtractReceiptResult, ReceiptListResponse, SaveReceiptResponse } from "@/lib/contract";
import { stemsWithCost } from "@/lib/server/costs";
import { todayInManila } from "@/lib/server/receipts";
import { signInTestShop, testAccountsReady } from "@/supabase/test-accounts";
import * as photosRoute from "./photos/route";
import * as receiptRoute from "./receipts/[id]/route";
import * as extractRoute from "./receipts/extract/route";
import * as receiptsRoute from "./receipts/route";

const signedIn = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
const ai = vi.hoisted(() => ({ outcome: null as AiOutcome<unknown> | null }));

vi.mock("@/lib/server/auth", async (importOriginal) => {
  const auth = await importOriginal<typeof import("@/lib/server/auth")>();
  return { ...auth, requireShop: () => auth.shopSession(signedIn.client!) };
});

// The network boundary: no real Anthropic call, no key needed.
vi.mock("@/lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/client")>()),
  askClaude: async () => ai.outcome,
}));

const json = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const idContext = (id: string) => ({ params: Promise.resolve({ id }) }) as RouteContext<"/api/receipts/[id]">;

async function upload(): Promise<string> {
  const form = new FormData();
  form.set("kind", "receipts");
  form.set("photo", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }));
  const response = await photosRoute.POST(new Request("http://localhost/api/photos", { method: "POST", body: form }));
  expect(response.status).toBe(200);
  return (await response.json()).photoPath;
}

/** Another chat may log calls on the same test shop, so each test finds its own row by a seconds value no one else uses. */
const uniqueSeconds = () => 10 + Math.round(Math.random() * 1_000_000) / 100;

async function loggedCall(client: SupabaseClient, seconds: number) {
  const { data } = await client.from("ai_calls").select("call, model, ok, error").eq("seconds", seconds);
  return data;
}

const answer = (stem: string | null): ExtractReceiptResult => ({
  purchaseDate: "2026-10-21",
  lines: [
    { rawText: "2 dz red rose @270", stem, quantity: 2, unit: "dozen", bundleSize: null, unitPrice: 270, totalPaid: null, confidence: "high", note: "" },
  ],
  note: "",
});
const usage = () => ({ model: "claude-sonnet-5-5" as const, seconds: uniqueSeconds(), inputTokens: 2700, outputTokens: 500 });

describe.skipIf(!testAccountsReady)("photo and receipt routes", () => {
  let client: SupabaseClient;
  let shopId: string;
  let roseId: string;
  let roseSampleCost: number;
  const roseCost = async () => (await stemsWithCost(client, [roseId]))[0].latestCost;

  beforeAll(async () => {
    ({ client, shopId } = await signInTestShop("A"));
    signedIn.client = client;
    const rose = (await stemsWithCost(client)).find((stem) => stem.name === "Rose - red")!;
    roseId = rose.id;
    roseSampleCost = rose.latestCost;
  }, 30_000);

  test("every route answers 401 unauthorized when signed out", async () => {
    signedIn.client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    try {
      const responses = await Promise.all([
        photosRoute.POST(json("POST", {})),
        extractRoute.POST(json("POST", {})),
        receiptsRoute.GET(),
        receiptsRoute.POST(json("POST", {})),
        receiptRoute.DELETE(json("DELETE"), idContext(crypto.randomUUID())),
      ]);
      expect(await Promise.all(responses.map(async (r) => [r.status, (await r.json()).code]))).toEqual(
        Array(5).fill([401, "unauthorized"]),
      );
    } finally {
      signedIn.client = client;
    }
  });

  test("extract reads the photo into the table and logs the call", async () => {
    const photoPath = await upload();
    const call = usage();
    ai.outcome = { ok: true, result: answer("rose - RED"), ...call };

    const response = await extractRoute.POST(json("POST", { photoPath }));
    const table = (await response.json()) as ExtractReceiptResponse;

    expect(table).toMatchObject({ purchaseDate: "2026-10-21", demo: false });
    // No total written: 2 × ₱270 = ₱540, ₱22.50 a stem.
    expect(table.lines[0]).toMatchObject({ stemId: roseId, totalPaid: 540, costPerStem: 22.5 });
    expect(await loggedCall(client, call.seconds)).toEqual([
      { call: "extractReceipt", model: "claude-sonnet-5-5", ok: true, error: "" },
    ]);
    await client.storage.from("receipts").remove([photoPath]);
  });

  test("a failed extract answers 502 ai_failed and still writes its ai_calls row", async () => {
    const photoPath = await upload();
    const call = usage();
    ai.outcome = { ok: false, error: "Answer was cut off", ...call };

    const response = await extractRoute.POST(json("POST", { photoPath }));

    expect([response.status, await response.json()]).toEqual([
      502,
      { code: "ai_failed", error: "Reading the receipt failed: Answer was cut off" },
    ]);
    expect(await loggedCall(client, call.seconds)).toEqual([
      { call: "extractReceipt", model: "claude-sonnet-5-5", ok: false, error: "Answer was cut off" },
    ]);
    await client.storage.from("receipts").remove([photoPath]);
  });

  test.each([
    ["an unmatched line", { stemId: null }],
    ["a bundle line without a bundle size", { unit: "bundle", bundleSize: null }],
  ])("save answers 400 invalid_request for %s and stores nothing", async (_case, change) => {
    const photoPath = `${shopId}/${crypto.randomUUID()}.jpg`;
    const line = { stemId: roseId, quantity: 2, unit: "dozen", bundleSize: null, totalPaid: 540, ...change };

    const response = await receiptsRoute.POST(json("POST", { photoPath, lines: [line] }));

    expect([response.status, (await response.json()).code]).toEqual([400, "invalid_request"]);
    const listed = ((await (await receiptsRoute.GET()).json()) as ReceiptListResponse).receipts;
    expect(listed.filter((item) => item.receipt.photoPath === photoPath)).toEqual([]);
  });

  test("saving the same photo twice answers 400 invalid_request and keeps one receipt", async () => {
    const photoPath = await upload();
    const body = { photoPath, lines: [{ stemId: roseId, quantity: 2, unit: "dozen", bundleSize: null, totalPaid: 540 }] };
    const savedWithPhoto = async () =>
      ((await (await receiptsRoute.GET()).json()) as ReceiptListResponse).receipts.filter(
        (item) => item.receipt.photoPath === photoPath,
      );
    try {
      expect((await receiptsRoute.POST(json("POST", body))).status).toBe(200);
      const second = await receiptsRoute.POST(json("POST", body));

      expect([second.status, await second.json()]).toEqual([400, { code: "invalid_request", error: "This photo is already saved as a receipt" }]);
      expect(await savedWithPhoto()).toHaveLength(1);
    } finally {
      // Every copy, so a failing run leaves no receipt behind on the shared test shop.
      for (const { receipt } of await savedWithPhoto()) await receiptRoute.DELETE(json("DELETE"), idContext(receipt.id));
    }
  });

  describe("save and delete, with the margin alarm", () => {
    let quoteId: string;

    beforeAll(async () => {
      // A sent quote: 30 red roses at ₱960. At ₱30 a stem the recipe costs ₱900, margin 6%.
      const validUntil = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const quote = await client
        .from("quotes")
        .insert({ shop_id: shopId, label: "Receipt test", status: "sent", photo_path: `${shopId}/${crypto.randomUUID()}.jpg`, price: 960, valid_until: validUntil, sent_at: new Date().toISOString() })
        .select("id")
        .single();
      if (quote.error) throw new Error(quote.error.message);
      quoteId = quote.data.id;
      const line = await client
        .from("quote_lines")
        .insert({ quote_id: quoteId, shop_id: shopId, stem_id: roseId, count: 30, count_low: 28, count_high: 32, confidence: "high", cost_per_stem: roseSampleCost });
      if (line.error) throw new Error(line.error.message);
    });

    afterAll(async () => {
      await client.from("quotes").delete().eq("id", quoteId);
    });

    const underwaterAt = async () => (await client.from("quotes").select("underwater_at").eq("id", quoteId).single()).data?.underwater_at;

    test("save stores the batches, raises the latest cost and flags the quote; delete undoes all three", async () => {
      const photoPath = await upload();
      // 2 dozen for ₱720 is ₱30 a stem; the costPerStem sent in is ignored.
      const line = { stemId: roseId, quantity: 2, unit: "dozen", bundleSize: null, totalPaid: 720, costPerStem: 1 };

      const saved = await receiptsRoute.POST(json("POST", { photoPath, lines: [line] }));
      const body = (await saved.json()) as SaveReceiptResponse;

      expect(saved.status).toBe(200);
      expect(body.receipt).toMatchObject({ shopId, photoPath, purchaseDate: todayInManila() });
      expect(body.batches).toMatchObject([{ stemId: roseId, quantity: 2, unit: "dozen", totalPaid: 720, costPerStem: 30 }]);
      // Other open quotes on the shared test shop may be listed too.
      expect(body.underwaterQuoteIds).toContain(quoteId);
      expect(await roseCost()).toBe(30);
      expect(await underwaterAt()).not.toBeNull();
      const listed = ((await (await receiptsRoute.GET()).json()) as ReceiptListResponse).receipts;
      expect(listed.map((item) => item.receipt.id)).toContain(body.receipt.id);

      const deleted = await receiptRoute.DELETE(json("DELETE"), idContext(body.receipt.id));

      const deletedBody = (await deleted.json()) as { deleted: boolean; underwaterQuoteIds: string[] };
      expect(deletedBody.deleted).toBe(true);
      expect(deletedBody.underwaterQuoteIds).not.toContain(quoteId);
      expect(await roseCost()).toBe(roseSampleCost);
      expect(await underwaterAt()).toBeNull();
      expect((await client.storage.from("receipts").download(photoPath)).error).not.toBeNull();
    });
  });

  test("delete answers 404 not_found for a receipt that is not the shop's", async () => {
    const response = await receiptRoute.DELETE(json("DELETE"), idContext(crypto.randomUUID()));
    expect([response.status, (await response.json()).code]).toEqual([404, "not_found"]);
  });
});
