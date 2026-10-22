// Who is signed in, and which shop is theirs. Every route under app/api starts here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import starter from "@/fixtures/seed/stems.json";
import type { Shop } from "../types";
import { errorResponse } from "./http";
import { SHOP_COLUMNS, toShop } from "./rows";
import { createClient } from "./supabase";

export type ShopSession = { supabase: SupabaseClient; shop: Shop };

/**
 * The signed-in florist's client and shop, or `unauthorized` when signed out.
 * A signed-in florist without a shop gets one, with the starter list.
 */
export async function requireShop(): Promise<ShopSession | Response> {
  return shopSession(createClient(await cookies()));
}

/** requireShop for a client that already carries a session; the route tests use it directly. */
export async function shopSession(supabase: SupabaseClient): Promise<ShopSession | Response> {
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return errorResponse("unauthorized", "Sign in first");
  let row = await readShop(supabase);
  if (!row) {
    // /auth/confirm creates the shop; this covers a sign-in whose create_shop call failed.
    const created = await supabase.rpc("create_shop", { starter });
    if (created.error) throw new Error(`Creating the shop failed: ${created.error.message}`);
    row = await readShop(supabase);
  }
  if (!row) return errorResponse("not_found", "Shop not found");
  return { supabase, shop: toShop(row) };
}

/** Row-level security returns only the caller's own shop. */
async function readShop(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("shops").select(SHOP_COLUMNS).maybeSingle();
  if (error) throw new Error(`Reading the shop failed: ${error.message}`);
  return data;
}
