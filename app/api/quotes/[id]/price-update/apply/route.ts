import type { ApplyPriceUpdateResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost } from "@/lib/server/costs";
import { parseApplyPriceUpdate } from "@/lib/server/fields";
import { errorResponse, readJson } from "@/lib/server/http";
import { priceUpdateChanges } from "@/lib/server/price-rules";
import { readQuote } from "@/lib/server/quotes";
import { QUOTE_COLUMNS, toColumns, toQuote } from "@/lib/server/rows";

// On copying the price-update message: sets the price at latest costs, resets
// valid-until to the shop's default, clears underwater_at and saves the message
// as the reply text. sent_at stays, so time-to-quote does not change. The price
// is worked out again here, never taken from the request. Answers
// invalid_request unless the quote is open and underwater.
export async function POST(request: Request, ctx: RouteContext<"/api/quotes/[id]/price-update/apply">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const detail = await readQuote(supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  const parsed = parseApplyPriceUpdate(await readJson(request));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);
  // Copying the same message again changes nothing, rather than failing because the flag is cleared.
  const { quote } = detail;
  if (quote.status === "sent" && quote.underwaterAt === null && quote.replyText === parsed.value.message) {
    return Response.json(quote satisfies ApplyPriceUpdateResponse);
  }

  const stemIds = detail.lines.flatMap((line) => (line.stemId === null ? [] : [line.stemId]));
  const costs = new Map((await stemsWithCost(supabase, stemIds)).map((stem) => [stem.id, stem.latestCost]));
  const applied = priceUpdateChanges(detail.quote, detail.lines, costs, shop, parsed.value.message, new Date());
  if (!applied.ok) return errorResponse("invalid_request", "Only an open, underwater quote gets a price update");

  const { data, error } = await supabase
    .from("quotes")
    .update(toColumns(applied.changes))
    .eq("id", detail.quote.id)
    .select(QUOTE_COLUMNS)
    .single();
  if (error) throw new Error(`Applying the price update failed: ${error.message}`);
  return Response.json(toQuote(data) satisfies ApplyPriceUpdateResponse);
}
