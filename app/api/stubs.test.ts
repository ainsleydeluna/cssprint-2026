// Every stub route the screens call exists and answers JSON (issue #4). Calls the
// route handlers directly, the way Next.js does, without starting a server.
// The shop, stem, photo, quote, budget, price-update and accuracy routes are real
// now; app/api/routes.test.ts, quote-routes.test.ts and price-routes.test.ts cover them.

import { describe, expect, test } from "vitest";
import * as receipt from "./receipts/[id]/route";
import * as receiptExtract from "./receipts/extract/route";
import * as receipts from "./receipts/route";

type Handler = (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

function call(handler: Handler, id = "", body?: unknown) {
  const request = new Request("http://localhost/api", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve({ id }) });
}

const routes: Array<[string, Handler, string?, unknown?]> = [
  ["extract a receipt", receiptExtract.POST],
  ["save a receipt", receipts.POST],
  ["list receipts", receipts.GET],
  ["delete a receipt", receipt.DELETE, "any"],
];

describe("stub routes", () => {
  test.each(routes)("%s answers JSON", async (_name, handler, id, body) => {
    const response = await call(handler, id, body);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeTypeOf("object");
  });
});
