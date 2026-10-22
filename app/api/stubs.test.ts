// Every stub route the screens call exists and answers JSON (issue #4). Calls the
// route handlers directly, the way Next.js does, without starting a server.
// The shop, stem, photo and receipt routes are real now; app/api/routes.test.ts
// and app/api/receipts.test.ts cover them.

import { describe, expect, test } from "vitest";
import type { QuoteDetail, UpdateQuoteLinesRequest } from "@/lib/contract";
import { createQuote, quoteList } from "@/lib/fake/responses";
import * as accuracy from "./accuracy/route";
import * as quoteBudgetOptions from "./quotes/[id]/budget-options/route";
import * as quoteCopied from "./quotes/[id]/copied/route";
import * as quoteLines from "./quotes/[id]/lines/route";
import * as quoteApplyPriceUpdate from "./quotes/[id]/price-update/apply/route";
import * as quotePriceUpdate from "./quotes/[id]/price-update/route";
import * as quoteReply from "./quotes/[id]/reply/route";
import * as quote from "./quotes/[id]/route";
import * as quotes from "./quotes/route";

type Handler = (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

/** Inquiry 3: a draft with a blank count and a "pick a flower" line. */
const quoteId = createQuote.quote.id;
/** Inquiry 1: every line has a stem and a count. */
const completeQuoteId = quoteList.quotes.find((item) => item.label === "Debut, Oct 25")!.id;

function call(handler: Handler, id = "", body?: unknown) {
  const request = new Request("http://localhost/api", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve({ id }) });
}

const routes: Array<[string, Handler, string?, unknown?]> = [
  ["create a quote", quotes.POST],
  ["list quotes", quotes.GET],
  ["read a quote", quote.GET, quoteId],
  ["update a quote's lines", quoteLines.PUT, quoteId, { lines: [] }],
  ["rename a quote", quote.PATCH, quoteId, { label: "Debut, Oct 25" }],
  ["delete a quote", quote.DELETE, quoteId],
  ["draft a reply", quoteReply.POST, quoteId],
  ["mark a reply copied", quoteCopied.POST, completeQuoteId, { replyText: "Hi po!" }],
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
    expect([response.status, await response.json()]).toEqual([404, { code: "not_found", error: "Quote not found" }]);
  });

  test("copying the reply of an unfinished draft answers 422 incomplete_quote", async () => {
    const response = await call(quoteCopied.POST, quoteId, { replyText: "Hi po!" });
    expect([response.status, (await response.json()).code]).toEqual([422, "incomplete_quote"]);
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
