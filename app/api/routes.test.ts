// The real shop and stem routes, signed in as test Shop A on cssprint-dev.
// One happy path and one error case per route. Only the cookie lookup in
// requireShop is replaced: the session check, the shop lookup and every query
// run for real, under row-level security. Skipped without the test-account keys.

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { Shop } from "@/lib/types";
import type { StemListResponse, StemWithCost } from "@/lib/contract";
import { signInTestShop, testAccountsReady } from "@/supabase/test-accounts";
import * as shopRoute from "./shop/route";
import * as stemRoute from "./stems/[id]/route";
import * as stemsRoute from "./stems/route";

const signedIn = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/server/auth", async (importOriginal) => {
  const auth = await importOriginal<typeof import("@/lib/server/auth")>();
  return { ...auth, requireShop: () => auth.shopSession(signedIn.client!) };
});

function request(method: string, body?: unknown) {
  return new Request("http://localhost/api", { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

function patchStem(id: string, body: unknown) {
  return stemRoute.PATCH(request("PATCH", body), { params: Promise.resolve({ id }) } as RouteContext<"/api/stems/[id]">);
}

async function listStems(): Promise<StemWithCost[]> {
  return ((await (await stemsRoute.GET()).json()) as StemListResponse).stems;
}

describe.skipIf(!testAccountsReady)("shop and stem routes", () => {
  let shopId: string;

  beforeAll(async () => {
    const shopA = await signInTestShop("A");
    signedIn.client = shopA.client;
    shopId = shopA.shopId;
  }, 30_000);

  test("GET /api/shop answers the signed-in florist's shop", async () => {
    const response = await shopRoute.GET();
    expect(response.status).toBe(200);
    expect(((await response.json()) as Shop).id).toBe(shopId);
  });

  test("PATCH /api/shop changes only the shop settings, ignoring id and ownerId", async () => {
    const before = (await (await shopRoute.GET()).json()) as Shop;
    const wrapFee = before.wrapFee === 50 ? 60 : 50;
    const response = await shopRoute.PATCH(request("PATCH", { wrapFee, id: crypto.randomUUID(), ownerId: crypto.randomUUID() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...before, wrapFee });
  });

  test("GET /api/stems answers the starter list at sample prices", async () => {
    // Rose - red: sample ₱250 a dozen is ₱20.83 a stem. Shop A has no receipts.
    const rose = (await listStems()).find((stem) => stem.name === "Rose - red");
    expect(rose).toMatchObject({ latestCost: 20.83, isSample: true });
  });

  test("POST /api/stems answers 422 invalid_bundle_size for a bundle row without a size", async () => {
    const response = await stemsRoute.POST(
      request("POST", { flower: "Mums", color: "yellow", isFiller: false, unit: "bundle", bundleSize: null, samplePrice: 150 }),
    );
    expect([response.status, (await response.json()).code]).toEqual([422, "invalid_bundle_size"]);
  });

  test("PATCH /api/stems/[id] hides a row, which stays in the list", async () => {
    const statice = (await listStems()).find((stem) => stem.name === "Statice - purple")!;
    try {
      const response = await patchStem(statice.id, { hidden: true });
      expect([response.status, (await response.json()).hidden]).toEqual([200, true]);
      expect((await listStems()).find((stem) => stem.id === statice.id)?.hidden).toBe(true);
    } finally {
      await patchStem(statice.id, { hidden: false });
    }
  });

  test("PATCH /api/stems/[id] answers 404 not_found for a stem that is not the shop's", async () => {
    const response = await patchStem(crypto.randomUUID(), { hidden: true });
    expect([response.status, (await response.json()).code]).toEqual([404, "not_found"]);
  });
});
