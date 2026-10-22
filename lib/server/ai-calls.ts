import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiCall } from "../types";
import { toColumns } from "./rows";

/**
 * Writes one ai_calls row (spec decision 13). Call it for every AI call,
 * failures included. Never throws: a failed log must not fail the florist's request.
 */
export async function logAiCall(
  supabase: SupabaseClient,
  shopId: string,
  call: Omit<AiCall, "id" | "shopId" | "createdAt">,
): Promise<void> {
  const { error } = await supabase
    .from("ai_calls")
    .insert({ ...toColumns(call), shop_id: shopId, error: call.error.slice(0, 500) });
  if (error) console.error(`Logging the ${call.call} call failed: ${error.message}`);
}
