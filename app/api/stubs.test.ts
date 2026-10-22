// Every route the screens call exists and answers JSON (issue #4). Calls the
// route handlers directly, the way Next.js does, without starting a server.

import { describe, expect, test } from "vitest";
import type { QuoteDetail, UpdateQuoteLinesRequest } from "@/lib/contract";
import { createQuote, stems } from "@/lib/fake/responses";
import * as accuracy from "./accuracy/route";
import * as photos from "./photos/route";
import * as quoteBudgetOptions from "./quotes/[id]/budget-options/route";
import * as quoteCopied from "./quotes/[id]/copied/route";
import * as quoteLines from "./quotes/[id]/lines/route";
import * as quoteApplyPriceUpdate from "./quotes/[id]/price-update/apply/route";
import * as quotePriceUpdate from "./quotes/[id]/price-update/route";
import * as quoteReply from "./quotes/[id]/reply/route";
import * as quote from "./quotes/[id]/route";
import * as quotes from "./quotes/route";
import * as receipt from "./receipts/[id]/route";
import * as receiptExtract from "./receipts/extract/route";
import * as receipts from "./receipts/route";
import * as shop from "./shop/route";
import * as stem from "./stems/[id]/route";
import * as stemsRoute from "./stems/route";

type Handler = (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

const quoteId = createQuote.quote.id;
const stemId = stems[0].id;

function call(handler: Handler, id = "", body?: unknown) {
  const request = new Request("http://localhost/api", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve({ id }) });
}

const routes: Array<[string, Handler, string?, unknown?]> = [
  ["upload a photo", photos.POST],
  ["extract a receipt", receiptExtract.POST],
  ["save a receipt", receipts.POST],
  ["list receipts", receipts.GET],
  ["delete a receipt", receipt.DELETE, "any"],
  ["read the shop", shop.GET],
  ["update the shop", shop.PATCH, "", { markupPercent: 60 }],
  ["list stems", stemsRoute.GET],
  ["add a stem", stemsRoute.POST, "", { flower: "Peony", color: "pink", isFiller: false, unit: "piece", bundleSize: null, samplePrice: 250 }],
  ["edit a stem", stem.PATCH, stemId, { samplePrice: 190 }],
  ["hide a stem", stem.PATCH, stemId, { hidden: true }],
  ["create a quote", quotes.POST],
  ["list quotes", quotes.GET],
  ["read a quote", quote.GET, quoteId],
  ["update a quote's lines", quoteLines.PUT, quoteId, { lines: [] }],
  ["rename a quote", quote.PATCH, quoteId, { label: "Debut, Oct 25" }],
  ["delete a quote", quote.DELETE, quoteId],
  ["draft a reply", quoteReply.POST, quoteId],
  ["mark a reply copied", quoteCopied.POST, quoteId, { replyText: "Hi po!" }],
  ["get budget options", quoteBudgetOptions.POST, quoteId, { budget: 1000 }],
  ["draft a price update", quotePriceUpdate.POST, quoteId],
  ["apply a price update", quoteApplyPriceUpdate.POST, quoteId, { message: "Hi po!" }],
  ["read accuracy stats", accuracy.GET],
];

describe("stub routes", () => {
  test.each(routes)("%s answers JSON", async (_name, handler, id, body) => {
    const response = await call(handler, id, body);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeTypeOf("object");
  });

  test("an unknown quote answers 404 with an error", async () => {
    const response = await call(quote.GET, "no-such-quote");
    expect([response.status, await response.json()]).toEqual([404, { error: "Quote not found" }]);
  });

  test("editing a sample price answers the new latest cost", async () => {
    // Rose - white: sample ₱240 a dozen is ₱20 a stem.
    const roseWhite = stems.find((row) => row.name === "Rose - white")!;
    const response = await call(stem.PATCH, roseWhite.id, { samplePrice: 240 });
    expect((await response.json()).latestCost).toBe(20);
  });

  test("saving edited lines answers the quote repriced at latest costs", async () => {
    // Inquiry 3 with one more stargazer: recipe ₱710 + ₱150 = ₱860; × 1.5 + ₱150 fees = ₱1,440.
    const lines: UpdateQuoteLinesRequest["lines"] = createQuote.lines.map(({ id, stemId, count, countLow, countHigh, confidence, note }) => ({
      id, stemId, countLow, countHigh, confidence, note,
      count: count === 3 ? 4 : count,
    }));
    const response = await call(quoteLines.PUT, quoteId, { lines });
    const detail: QuoteDetail = await response.json();
    expect(detail.quote.price).toBe(1440);
  });
});
