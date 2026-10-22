// Every stub route the screens call exists and answers JSON (issue #4). Calls the
// route handlers directly, the way Next.js does, without starting a server.
// The shop, stem, photo, receipt and quote routes are real now;
// app/api/routes.test.ts, app/api/receipts.test.ts and
// app/api/quote-routes.test.ts cover them. The swap to real stem ids needs a
// session, so here it passes the fake answer through;
// lib/fake/real-stems.test.ts covers the swap.

import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/fake/real-stems", () => ({ withRealStemIds: async (body: unknown) => Response.json(body) }));
import { createQuote } from "@/lib/fake/responses";
import * as accuracy from "./accuracy/route";
import * as quoteBudgetOptions from "./quotes/[id]/budget-options/route";
import * as quoteApplyPriceUpdate from "./quotes/[id]/price-update/apply/route";
import * as quotePriceUpdate from "./quotes/[id]/price-update/route";

type Handler = (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

const quoteId = createQuote.quote.id;

function call(handler: Handler, id = "", body?: unknown) {
  const request = new Request("http://localhost/api", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve({ id }) });
}

const routes: Array<[string, Handler, string?, unknown?]> = [
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
});
