// The two test accounts on cssprint-dev (spec decision 24), made once by
// scripts/seed-test-accounts.mts. Tests that use them are skipped when their
// keys are absent from .env.local. Only the publishable key and the test
// accounts are read here. SUPABASE_SECRET_KEY lives only in Ice's .env.local
// (never NEXT_PUBLIC_, never committed, not in Vercel), and only the seed
// script reads it.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import starter from "@/fixtures/seed/stems.json";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: testAccountsReady is false and the tests are skipped.
}

const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  TEST_SHOP_A_EMAIL: emailA,
  TEST_SHOP_B_EMAIL: emailB,
  TEST_ACCOUNTS_PASSWORD: password,
} = process.env;

export const testAccountsReady = Boolean(url && publishableKey && emailA && emailB && password);

/** Signs in test Shop A or B and creates its shop on first use, as the first magic-link sign-in does. */
export async function signInTestShop(which: "A" | "B"): Promise<{ client: SupabaseClient; shopId: string }> {
  const email = which === "A" ? emailA! : emailB!;
  const client = createClient(url!, publishableKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`Sign-in as Shop ${which} failed (run scripts/seed-test-accounts.mts): ${error.message}`);
  const created = await client.rpc("create_shop", { starter });
  if (created.error) throw new Error(`create_shop failed: ${created.error.message}`);
  const shops = await client.from("shops").select("id");
  if (shops.error || shops.data.length !== 1) throw new Error(`Expected one shop for Shop ${which}`);
  return { client, shopId: shops.data[0].id };
}
