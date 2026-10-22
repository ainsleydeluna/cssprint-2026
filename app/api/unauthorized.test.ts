// Signed out, every route that needs a shop answers 401 unauthorized, the code
// screens use to send the florist to /sign-in. Runs without the test accounts:
// the request carries no session cookie, so Supabase is never reached.

import { afterAll, expect, test, vi } from "vitest";

// Placeholders only when the real values are absent; restored after this file.
vi.hoisted(() => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://signed-out.supabase.co");
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_signed_out");
});
afterAll(() => vi.unstubAllEnvs());
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

const { GET: getShop, PATCH: patchShop } = await import("./shop/route");
const { GET: listStems, POST: addStem } = await import("./stems/route");
const { PATCH: patchStem } = await import("./stems/[id]/route");
const { POST: uploadPhoto } = await import("./photos/route");
const { GET: listQuotes, POST: createQuote } = await import("./quotes/route");
const quote = await import("./quotes/[id]/route");
const { PUT: putLines } = await import("./quotes/[id]/lines/route");
const { POST: draftReply } = await import("./quotes/[id]/reply/route");
const { POST: copied } = await import("./quotes/[id]/copied/route");

const request = (body?: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const stemContext = { params: Promise.resolve({ id: crypto.randomUUID() }) } as RouteContext<"/api/stems/[id]">;
/** Fits every quote route with an [id], which all take { params: Promise<{ id }> }. */
const quoteContext = { params: Promise.resolve({ id: crypto.randomUUID() }) };

test.each([
  ["GET /api/shop", () => getShop()],
  ["PATCH /api/shop", () => patchShop(request({ wrapFee: 50 }))],
  ["GET /api/stems", () => listStems()],
  ["POST /api/stems", () => addStem(request({ flower: "Peony", color: "pink", isFiller: false, unit: "piece", bundleSize: null, samplePrice: 250 }))],
  ["PATCH /api/stems/[id]", () => patchStem(request({ hidden: true }), stemContext)],
  ["POST /api/photos", () => uploadPhoto(request())],
  ["GET /api/quotes", () => listQuotes()],
  ["POST /api/quotes", () => createQuote(request({ photoPath: "x" }))],
  ["GET /api/quotes/[id]", () => quote.GET(request(), quoteContext)],
  ["PATCH /api/quotes/[id]", () => quote.PATCH(request({ label: "x" }), quoteContext)],
  ["DELETE /api/quotes/[id]", () => quote.DELETE(request(), quoteContext)],
  ["PUT /api/quotes/[id]/lines", () => putLines(request({ lines: [] }), quoteContext)],
  ["POST /api/quotes/[id]/reply", () => draftReply(request(), quoteContext)],
  ["POST /api/quotes/[id]/copied", () => copied(request({ replyText: "Hi po!" }), quoteContext)],
])("%s answers 401 unauthorized when signed out", async (_route, call) => {
  const response = await call();
  expect([response.status, await response.json()]).toEqual([401, { code: "unauthorized", error: "Sign in first" }]);
});
