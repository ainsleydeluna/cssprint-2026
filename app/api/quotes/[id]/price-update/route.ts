import type { PriceUpdateResponse } from "@/lib/contract";
import { priceUpdate } from "@/lib/ai/priceUpdate";
import { logAiCall } from "@/lib/server/ai-calls";
import { requireShop } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { latestCosts } from "@/lib/server/margin-alarm";
import { priceUpdateTerms } from "@/lib/server/price-rules";
import { readQuote } from "@/lib/server/quotes";

// Drafts the price-update message for an underwater quote: the old price, the
// same formula at latest costs, and valid-until reset to the shop's default.
// Saves nothing; copying the message calls the apply route. Answers
// invalid_request unless the quote is open and underwater.
export async function POST(_request: Request, ctx: RouteContext<"/api/quotes/[id]/price-update">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const detail = await readQuote(supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");

  const stemIds = detail.lines.flatMap((line) => (line.stemId === null ? [] : [line.stemId]));
  // Read even with MARGIN_ALARM off: a flagged quote's price is checked regardless.
  const costs = await latestCosts(supabase, stemIds, { enabled: true });
  const terms = priceUpdateTerms(detail.quote, detail.lines, costs, shop, new Date());
  if (!terms.ok) return errorResponse("invalid_request", "Only an open, underwater quote gets a price update");

  const outcome = await priceUpdate(terms);
  await logAiCall(supabase, shop.id, {
    call: "priceUpdate",
    model: outcome.model,
    seconds: outcome.seconds,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    quoteId: detail.quote.id,
    receiptId: null,
    ok: outcome.ok,
    error: outcome.ok ? "" : outcome.error,
  });
  if (!outcome.ok) return errorResponse("ai_failed", `Drafting the price update failed: ${outcome.error}`);

  const { oldPrice, newPrice, validUntil } = terms;
  return Response.json({ message: outcome.result.message, oldPrice, newPrice, validUntil, demo: false } satisfies PriceUpdateResponse);
}
