// Shop A / Shop B (spec decisions 10 and 24): signed in as Shop A, the app reads
// zero rows and zero files of Shop B, and cannot write into Shop B.
// Runs against cssprint-dev with the two accounts made once by
// scripts/seed-test-accounts.mts; skipped when their keys are absent from .env.local.
// Uses only the publishable key and the test accounts. SUPABASE_SECRET_KEY is not
// used here: it lives only in Ice's .env.local (never NEXT_PUBLIC_, never
// committed, not in Vercel), and only the seed script reads it.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import starter from "@/fixtures/seed/stems.json";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the test is skipped below.
}

const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  TEST_SHOP_A_EMAIL: emailA,
  TEST_SHOP_B_EMAIL: emailB,
  TEST_ACCOUNTS_PASSWORD: password,
} = process.env;
const ready = Boolean(url && publishableKey && emailA && emailB && password);

const BUCKETS = ["bouquets", "receipts"] as const;
const SHOP_TABLES = ["stems", "receipts", "receipt_lines", "quotes", "quote_lines", "ai_calls"] as const;

/** Signs in a test account and creates its shop on first use, as the first magic-link sign-in does. */
async function signIn(email: string): Promise<{ client: SupabaseClient; shopId: string }> {
  const client = createClient(url!, publishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`Sign-in as ${email} failed (run scripts/seed-test-accounts.mts): ${error.message}`);
  const created = await client.rpc("create_shop", { starter });
  if (created.error) throw new Error(`create_shop failed: ${created.error.message}`);
  const shops = await client.from("shops").select("id");
  if (shops.error || shops.data.length !== 1) throw new Error(`Expected one shop for ${email}`);
  return { client, shopId: shops.data[0].id };
}

function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null) throw new Error(result.error?.message ?? "No data");
  return result.data as NonNullable<T>;
}

/** Gives Shop B a row in every table and a photo in each bucket. Adds nothing on later runs. */
async function fillShop(client: SupabaseClient, shopId: string): Promise<Record<string, string>> {
  const quotes = must(await client.from("quotes").select("id"));
  if (quotes.length === 0) {
    const photoPath = `${shopId}/${crypto.randomUUID()}.jpg`;
    const stem = must(await client.from("stems").select("id").limit(1).single());
    const receipt = must(
      await client.from("receipts").insert({ shop_id: shopId, purchase_date: "2026-10-22", photo_path: photoPath }).select("id").single(),
    );
    must(
      await client
        .from("receipt_lines")
        .insert({ receipt_id: receipt.id, shop_id: shopId, stem_id: stem.id, quantity: 2, unit: "dozen", total_paid: 540, cost_per_stem: 22.5 })
        .select("id"),
    );
    const quote = must(
      await client.from("quotes").insert({ shop_id: shopId, label: "Inquiry 1", photo_path: photoPath }).select("id").single(),
    );
    must(
      await client
        .from("quote_lines")
        .insert({ quote_id: quote.id, shop_id: shopId, stem_id: stem.id, count: 12, count_low: 11, count_high: 13, confidence: "high", cost_per_stem: 22.5 })
        .select("id"),
    );
    must(
      await client
        .from("ai_calls")
        .insert({ shop_id: shopId, call: "draftReply", model: "test", seconds: 1, ok: true, quote_id: quote.id })
        .select("id"),
    );
  }

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

describe.skipIf(!ready)("Shop A cannot see Shop B", () => {
  let a: SupabaseClient;
  let shopA: string;
  let shopB: string;
  let photosB: Record<string, string>;

  beforeAll(async () => {
    const [signedInA, signedInB] = await Promise.all([signIn(emailA!), signIn(emailB!)]);
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
