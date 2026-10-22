// Latest cost per stem (spec decision 4): the newest stock batch by purchase
// date, ties going to the one entered last, else the sample price. The rule
// itself is lib/money.ts latestCost; this reads the batches it needs.

import type { SupabaseClient } from "@supabase/supabase-js";
import { stemName, type StemWithCost } from "../contract";
import { latestCost, type DatedBatch } from "../money";
import type { Stem } from "../types";
import { STEM_COLUMNS, toStem } from "./rows";

/** A stem with its display name and latest cost. */
export function withCost(stem: Stem, batches: DatedBatch[]): StemWithCost {
  const { cost, isSample } = latestCost(stem, batches);
  // cost is null only for a bundle row without a bundle size, which the database refuses.
  return { ...stem, name: stemName(stem), latestCost: cost ?? 0, isSample };
}

/** The shop's stems with latest costs, hidden rows included, oldest first. Only `stemIds` when given. */
export async function stemsWithCost(supabase: SupabaseClient, stemIds?: string[]): Promise<StemWithCost[]> {
  let stems = supabase.from("stems").select(STEM_COLUMNS).order("created_at");
  let batches = supabase.from("receipt_lines").select("stem_id, cost_per_stem, created_at, receipts(purchase_date)");
  if (stemIds) {
    stems = stems.in("id", stemIds);
    batches = batches.in("stem_id", stemIds);
  }
  const [stemRows, batchRows] = await Promise.all([stems, batches]);
  if (stemRows.error) throw new Error(`Reading stems failed: ${stemRows.error.message}`);
  if (batchRows.error) throw new Error(`Reading stock batches failed: ${batchRows.error.message}`);

  const dated: DatedBatch[] = batchRows.data.map((row) => ({
    stemId: row.stem_id,
    costPerStem: Number(row.cost_per_stem),
    createdAt: row.created_at,
    purchaseDate: (row.receipts as unknown as { purchase_date: string }).purchase_date,
  }));
  return stemRows.data.map((row) => withCost(toStem(row), dated));
}
