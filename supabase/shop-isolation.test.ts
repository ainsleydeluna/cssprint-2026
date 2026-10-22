// Shop A / Shop B (spec decisions 10 and 24): signed in as Shop A, the app reads
// zero rows and zero files of Shop B, and cannot write into Shop B.
// Runs against cssprint-dev with the two test accounts (./test-accounts.ts);
// skipped when their keys are absent from .env.local.

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import { signInTestShop, testAccountsReady } from "./test-accounts";

const BUCKETS = ["bouquets", "receipts"] as const;
const SHOP_TABLES = ["stems", "receipts", "receipt_lines", "quotes", "quote_lines", "ai_calls"] as const;

function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null) throw new Error(result.error?.message ?? "No data");
  return result.data as NonNullable<T>;
}

/** The id of the shop's first row in `table`, inserting `row` only when the table has none. */
async function ensureRow(client: SupabaseClient, table: string, row: Record<string, unknown>): Promise<string> {
  const existing = must(await client.from(table).select("id").limit(1));
  if (existing.length > 0) return existing[0].id;
  return must(await client.from(table).insert(row).select("id").single()).id;
}

/** Gives Shop B a row in every table and a photo in each bucket. Adds nothing on later runs, even after a failed one. */
async function fillShop(client: SupabaseClient, shopId: string): Promise<Record<string, string>> {
  const shop_id = shopId;
  const photo_path = `${shopId}/${crypto.randomUUID()}.jpg`;
  const stem_id = must(await client.from("stems").select("id").limit(1).single()).id;
  const receipt_id = await ensureRow(client, "receipts", { shop_id, purchase_date: "2026-10-22", photo_path });
  await ensureRow(client, "receipt_lines", { receipt_id, shop_id, stem_id, quantity: 2, unit: "dozen", total_paid: 540, cost_per_stem: 22.5 });
  const quote_id = await ensureRow(client, "quotes", { shop_id, label: "Inquiry 1", photo_path });
  await ensureRow(client, "quote_lines", { quote_id, shop_id, stem_id, count: 12, count_low: 11, count_high: 13, confidence: "high", cost_per_stem: 22.5 });
  await ensureRow(client, "ai_calls", { shop_id, call: "draftReply", model: "test", seconds: 1, ok: true, quote_id });

  const photos: Record<string, string> = {};
  for (const bucket of BUCKETS) {
    const files = must(await client.storage.from(bucket).list(shopId));
    if (files.length > 0) {
      photos[bucket] = `${shopId}/${files[0].name}`;
      continue;
    }
    const path = `${shopId}/${crypto.randomUUID()}.jpg`;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    must(await client.storage.from(bucket).upload(path, jpeg, { contentType: "image/jpeg" }));
    photos[bucket] = path;
  }
  return photos;
}

describe.skipIf(!testAccountsReady)("Shop A cannot see Shop B", () => {
  let a: SupabaseClient;
  let shopA: string;
  let shopB: string;
  let photosB: Record<string, string>;

  beforeAll(async () => {
    const [signedInA, signedInB] = await Promise.all([signInTestShop("A"), signInTestShop("B")]);
    ({ client: a, shopId: shopA } = signedInA);
    shopB = signedInB.shopId;
    photosB = await fillShop(signedInB.client, shopB);

    // Shop B really has rows, so zero rows for Shop A below means something.
    for (const table of SHOP_TABLES) {
      expect(must(await signedInB.client.from(table).select("id")).length, `Shop B rows in ${table}`).toBeGreaterThan(0);
    }
  }, 60_000);

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
    const download = await a.storage.from(bucket).download(photosB[bucket]);
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
