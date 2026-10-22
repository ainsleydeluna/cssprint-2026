// Who is signed in, and which shop is theirs. Every route under app/api starts here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Shop } from "../types";
import { errorResponse } from "./http";
import { SHOP_COLUMNS, toShop } from "./rows";
import { createClient } from "./supabase";

export type ShopSession = { supabase: SupabaseClient; shop: Shop };

/**
 * The signed-in florist's client and shop, or the error to answer:
 * `unauthorized` when signed out, `not_found` when they have no shop yet.
 */
export async function requireShop(): Promise<ShopSession | Response> {
  return shopSession(createClient(await cookies()));
}

/** requireShop for a client that already carries a session; the route tests use it directly. */
export async function shopSession(supabase: SupabaseClient): Promise<ShopSession | Response> {
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return errorResponse("unauthorized", "Sign in first");
  // Row-level security returns only the caller's own shop.
  const { data: row, error } = await supabase.from("shops").select(SHOP_COLUMNS).maybeSingle();
  if (error) throw new Error(`Reading the shop failed: ${error.message}`);
  if (!row) return errorResponse("not_found", "Shop not found");
  return { supabase, shop: toShop(row) };
}
