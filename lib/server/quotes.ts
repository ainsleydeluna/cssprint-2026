// Reading quotes for the quote routes. Every read saves "expired" on sent
// quotes whose valid-until date has passed in Manila (spec decision 5), so the
// list, the quote screen and the margin alarm agree on which quotes are open.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteDetail } from "../contract";
import { price, recipeCost } from "../money";
import type { Quote, QuoteLine, Shop } from "../types";
import { UUID } from "./http";
import { manilaToday, statusOn } from "./quote-rules";
import { LINE_COLUMNS, QUOTE_COLUMNS, toQuote, toQuoteLine } from "./rows";

/** Saves "expired" on the sent quotes whose valid-until date has passed, and returns every quote as saved. */
export async function expirePassed(supabase: SupabaseClient, quotes: Quote[], now = new Date()): Promise<Quote[]> {
  const today = manilaToday(now);
  const expired = quotes.filter((quote) => quote.status === "sent" && statusOn(quote, today) === "expired").map((quote) => quote.id);
  if (expired.length > 0) {
    const { error } = await supabase.from("quotes").update({ status: "expired" }).in("id", expired).eq("status", "sent");
    if (error) throw new Error(`Expiring quotes failed: ${error.message}`);
  }
  return quotes.map((quote) => (expired.includes(quote.id) ? { ...quote, status: "expired" } : quote));
}

/** The shop's quote with its lines in the order they were added, or null when it is not the shop's. */
export async function readQuote(supabase: SupabaseClient, id: string): Promise<QuoteDetail | null> {
  if (!UUID.test(id)) return null;
  // Row-level security hides other shops' quotes, so their ids are not found either.
  const [quoteRow, lineRows] = await Promise.all([
    supabase.from("quotes").select(QUOTE_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("quote_lines").select(LINE_COLUMNS).eq("quote_id", id).order("created_at"),
  ]);
  if (quoteRow.error) throw new Error(`Reading the quote failed: ${quoteRow.error.message}`);
  if (lineRows.error) throw new Error(`Reading the quote lines failed: ${lineRows.error.message}`);
  if (!quoteRow.data) return null;
  const [quote] = await expirePassed(supabase, [toQuote(quoteRow.data)]);
  return { quote, lines: lineRows.data.map(toQuoteLine) };
}

/** The price of a recipe at its lines' costs. Blank counts and "pick a flower" lines add nothing. */
export function quotePrice(lines: Pick<QuoteLine, "stemId" | "count" | "costPerStem">[], shop: Shop) {
  return price(recipeCost(lines).cost, shop);
}
