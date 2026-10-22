// The margin alarm (spec C12, section 4 "Margin alarm"): after a receipt is
// saved or deleted, recompute the margin of every open quote containing a stem
// whose latest cost changed. Below the shop's minimum margin sets underwater_at;
// at or above it clears it. With MARGIN_ALARM off nothing is computed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MARGIN_ALARM } from "@/features";
import { isUnderwater, recipeCost } from "../money";
import type { ManilaDate, Money, Quote, QuoteLine, Shop } from "../types";
import { stemsWithCost } from "./costs";
import { todayInManila } from "./receipts";

type QuoteState = Pick<Quote, "id" | "status" | "price" | "validUntil" | "underwaterAt">;

/**
 * Which rechecked quotes to flag and to clear, and which are underwater now.
 * Open = sent and valid until today or later. Only quotes with a line on a
 * changed stem are rechecked; their recipe cost uses every line's latest cost.
 */
export function underwaterChanges(input: {
  quotes: QuoteState[];
  lines: Array<Pick<QuoteLine, "quoteId" | "stemId" | "count">>;
  costs: Map<string, Money>;
  changedStemIds: Set<string>;
  shop: Pick<Shop, "minimumMarginPercent">;
  today: ManilaDate;
}): { flag: string[]; clear: string[]; underwater: string[] } {
  const result = { flag: [] as string[], clear: [] as string[], underwater: [] as string[] };
  for (const quote of input.quotes) {
    const open = quote.status === "sent" && quote.price !== null && quote.validUntil !== null && quote.validUntil >= input.today;
    const lines = input.lines.filter((line) => line.quoteId === quote.id);
    if (!open || !lines.some((line) => line.stemId !== null && input.changedStemIds.has(line.stemId))) continue;

    const { cost } = recipeCost(
      lines.map((line) => ({ ...line, costPerStem: line.stemId === null ? 0 : (input.costs.get(line.stemId) ?? 0) })),
    );
    const underwater = isUnderwater(quote.price!, cost, input.shop);
    if (underwater) result.underwater.push(quote.id);
    if (underwater && quote.underwaterAt === null) result.flag.push(quote.id);
    if (!underwater && quote.underwaterAt !== null) result.clear.push(quote.id);
  }
  return result;
}

/** Latest cost per stem id. Empty, with no read, when the margin alarm is off. */
export async function latestCosts(
  supabase: SupabaseClient,
  stemIds: string[],
  { enabled = MARGIN_ALARM } = {},
): Promise<Map<string, Money>> {
  if (!enabled || stemIds.length === 0) return new Map();
  return new Map((await stemsWithCost(supabase, stemIds)).map((stem) => [stem.id, stem.latestCost]));
}

/**
 * Call after a receipt save or delete with `before`, the latestCosts of the
 * receipt's stems read before the change. Flags and clears quotes, and answers
 * the ids of rechecked open quotes that are underwater now.
 */
export async function recheckUnderwater(
  supabase: SupabaseClient,
  shop: Pick<Shop, "minimumMarginPercent">,
  before: Map<string, Money>,
  { enabled = MARGIN_ALARM } = {},
): Promise<string[]> {
  if (!enabled || before.size === 0) return [];
  const after = await latestCosts(supabase, [...before.keys()], { enabled });
  const changedStemIds = new Set([...before.keys()].filter((id) => after.get(id) !== before.get(id)));
  if (changedStemIds.size === 0) return [];

  const today = todayInManila();
  const touched = await supabase.from("quote_lines").select("quote_id").in("stem_id", [...changedStemIds]);
  if (touched.error) throw new Error(`Reading quote lines failed: ${touched.error.message}`);
  const quoteIds = [...new Set(touched.data.map((row) => String(row.quote_id)))];
  if (quoteIds.length === 0) return [];

  const [quoteRows, lineRows] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status, price, valid_until, underwater_at")
      .in("id", quoteIds)
      .eq("status", "sent")
      .gte("valid_until", today),
    supabase.from("quote_lines").select("quote_id, stem_id, count").in("quote_id", quoteIds),
  ]);
  if (quoteRows.error) throw new Error(`Reading open quotes failed: ${quoteRows.error.message}`);
  if (lineRows.error) throw new Error(`Reading quote lines failed: ${lineRows.error.message}`);

  const lines = lineRows.data.map((row) => ({
    quoteId: String(row.quote_id),
    stemId: row.stem_id === null ? null : String(row.stem_id),
    count: row.count === null ? null : Number(row.count),
  }));
  const stemIds = [...new Set(lines.flatMap((line) => (line.stemId === null ? [] : [line.stemId])))];
  const { flag, clear, underwater } = underwaterChanges({
    quotes: quoteRows.data.map((row) => ({
      id: String(row.id),
      status: row.status as Quote["status"],
      price: row.price === null ? null : Number(row.price),
      validUntil: row.valid_until as string | null,
      underwaterAt: row.underwater_at as string | null,
    })),
    lines,
    costs: await latestCosts(supabase, stemIds, { enabled }),
    changedStemIds,
    shop,
    today,
  });

  const updates = [
    flag.length > 0 && supabase.from("quotes").update({ underwater_at: new Date().toISOString() }).in("id", flag),
    clear.length > 0 && supabase.from("quotes").update({ underwater_at: null }).in("id", clear),
  ].filter((update) => update !== false);
  for (const { error } of await Promise.all(updates)) {
    if (error) throw new Error(`Updating underwater quotes failed: ${error.message}`);
  }
  return underwater;
}
