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
const { POST: createQuote } = await import("./quotes/route");

const request = (body?: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const stemContext = { params: Promise.resolve({ id: crypto.randomUUID() }) } as RouteContext<"/api/stems/[id]">;

test.each([
  ["GET /api/shop", () => getShop()],
  ["PATCH /api/shop", () => patchShop(request({ wrapFee: 50 }))],
  ["GET /api/stems", () => listStems()],
  ["POST /api/stems", () => addStem(request({ flower: "Peony", color: "pink", isFiller: false, unit: "piece", bundleSize: null, samplePrice: 250 }))],
  ["PATCH /api/stems/[id]", () => patchStem(request({ hidden: true }), stemContext)],
  ["POST /api/quotes (stub)", () => createQuote()],
])("%s answers 401 unauthorized when signed out", async (_route, call) => {
  const response = await call();
  expect([response.status, await response.json()]).toEqual([401, { code: "unauthorized", error: "Sign in first" }]);
});
