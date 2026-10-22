// Shop A / Shop B (spec decisions 10 and 24): signed in as Shop A, the app reads
// zero rows and zero files of Shop B, and cannot write into Shop B.
// Runs against cssprint-dev with the two test accounts (./test-accounts.ts);
// skipped when their keys are absent from .env.local. Deletes the rows and
// photos it creates in Shop B, except its one append-only ai_calls row.

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { signInTestShop, testAccountsReady } from "./test-accounts";

const BUCKETS = ["bouquets", "receipts"] as const;
const SHOP_TABLES = ["stems", "receipts", "receipt_lines", "quotes", "quote_lines", "ai_calls"] as const;

function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null) throw new Error(result.error?.message ?? "No data");
  return result.data as NonNullable<T>;
}

/** What fillShop created, so the test can delete it afterwards. */
type Created = { receiptId?: string; quoteId?: string; photos: Partial<Record<(typeof BUCKETS)[number], string>> };

/**
 * Gives Shop B a row in every table and a photo in each bucket, recording each
 * in `created` as it goes so a half-finished run is still cleaned up.
 * ai_calls is append-only (no delete grant), so its one row is added only when
 * Shop B has none and is kept.
 */
async function fillShop(client: SupabaseClient, shopId: string, created: Created): Promise<void> {
  const shop_id = shopId;
  const photo_path = `${shopId}/${crypto.randomUUID()}.jpg`;
  const stem_id = must(await client.from("stems").select("id").limit(1).single()).id;
  created.receiptId = must(
    await client.from("receipts").insert({ shop_id, purchase_date: "2026-10-22", photo_path }).select("id").single(),
  ).id;
  must(
    await client
      .from("receipt_lines")
      .insert({ receipt_id: created.receiptId, shop_id, stem_id, quantity: 2, unit: "dozen", total_paid: 540, cost_per_stem: 22.5 })
      .select("id"),
  );
  created.quoteId = must(await client.from("quotes").insert({ shop_id, label: "Inquiry 1", photo_path }).select("id").single()).id;
  must(
    await client
      .from("quote_lines")
      .insert({ quote_id: created.quoteId, shop_id, stem_id, count: 12, count_low: 11, count_high: 13, confidence: "high", cost_per_stem: 22.5 })
      .select("id"),
  );
  if (must(await client.from("ai_calls").select("id").limit(1)).length === 0) {
    must(await client.from("ai_calls").insert({ shop_id, call: "draftReply", model: "test", seconds: 1, ok: true }).select("id"));
  }

  for (const bucket of BUCKETS) {
    const path = `${shopId}/${crypto.randomUUID()}.jpg`;
    must(await client.storage.from(bucket).upload(path, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg" }));
    created.photos[bucket] = path;
  }
}

/** Deletes what fillShop created. Deleting a receipt or quote deletes its lines too. */
async function emptyShop(client: SupabaseClient, created: Created): Promise<void> {
  if (created.receiptId) must(await client.from("receipts").delete().eq("id", created.receiptId).select("id"));
  if (created.quoteId) must(await client.from("quotes").delete().eq("id", created.quoteId).select("id"));
  for (const [bucket, path] of Object.entries(created.photos)) must(await client.storage.from(bucket).remove([path]));
}

describe.skipIf(!testAccountsReady)("Shop A cannot see Shop B", () => {
  let a: SupabaseClient;
  let shopA: string;
  let b: SupabaseClient;
  let shopB: string;
  const createdB: Created = { photos: {} };

  beforeAll(async () => {
    const [signedInA, signedInB] = await Promise.all([signInTestShop("A"), signInTestShop("B")]);
    ({ client: a, shopId: shopA } = signedInA);
    ({ client: b, shopId: shopB } = signedInB);
    await fillShop(b, shopB, createdB);

    // Shop B really has rows, so zero rows for Shop A below means something.
    for (const table of SHOP_TABLES) {
      expect(must(await b.from(table).select("id")).length, `Shop B rows in ${table}`).toBeGreaterThan(0);
    }
  }, 60_000);

  afterAll(async () => {
    if (b) await emptyShop(b, createdB);
  }, 30_000);

  test("Shop A sees only its own shop", async () => {
    expect(must(await a.from("shops").select("id"))).toEqual([{ id: shopA }]);
    expect(must(await a.from("shops").select("id").eq("id", shopB))).toEqual([]);
  });

  test.each(SHOP_TABLES)("Shop A reads zero rows of Shop B in %s", async (table) => {
    expect(must(await a.from(table).select("id").eq("shop_id", shopB))).toEqual([]);
    const all = must(await a.from(table).select("shop_id"));
    expect(all.every((row) => row.shop_id === shopA)).toBe(true);
  });

  test.each(BUCKETS)("Shop A reads zero files of Shop B in %s", async (bucket) => {
    expect(must(await a.storage.from(bucket).list(shopB))).toEqual([]);
    const download = await a.storage.from(bucket).download(createdB.photos[bucket]!);
    expect(download.data).toBeNull();
    expect(download.error).not.toBeNull();
  });

  test("Shop A cannot write into Shop B", async () => {
    const insert = await a
      .from("stems")
      .insert({ shop_id: shopB, flower: "Peony", color: "pink", unit: "piece", sample_price: 250 });
    expect(insert.error).not.toBeNull();

    const update = await a.from("stems").update({ hidden: true }).eq("shop_id", shopB).select("id");
    expect(must(update)).toEqual([]);

    const upload = await a.storage
      .from("bouquets")
      .upload(`${shopB}/${crypto.randomUUID()}.jpg`, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg" });
    expect(upload.error).not.toBeNull();
  });
});
